# Concurrency Control — p-limit, Semaphore, Queues

Node.js is single-threaded but I/O is concurrent. Without limits, `Promise.all()` on 10,000 items fires all requests simultaneously → OOM, rate limit errors, DB connection exhaustion.

---

## The Problem: Uncontrolled Concurrency

```typescript
const urls = Array.from({ length: 10_000 }, (_, i) => `https://api.example.com/item/${i}`);

// ❌ All 10,000 requests fire simultaneously:
const results = await Promise.all(urls.map(url => fetch(url)));
// → Rate limited, connection pool exhausted, likely crashes

// ✅ Process 10 at a time:
import pLimit from 'p-limit';

const limit = pLimit(10);
const results = await Promise.all(
  urls.map(url => limit(() => fetch(url)))
);
```

---

## Implement p-limit from Scratch

The `p-limit` implementation is a common interview question because it reveals whether you understand how to coordinate async work without threads. The core idea is a running counter and a queue of pending task thunks. When `limit(fn)` is called, if a slot is free (`running < concurrency`), the task starts immediately; otherwise the thunk is enqueued. Every time a task finishes, it decrements `running` and calls `next()`, which dequeues and starts the next pending task. The result is a sliding window of exactly `concurrency` tasks always in flight, with no gaps and no excess.

```typescript
// This is the most common concurrency interview question in Node.js

function pLimit(concurrency: number) {
  let running  = 0;
  const queue: Array<() => void> = [];

  function next() {
    if (queue.length === 0 || running >= concurrency) return;
    running++;
    const run = queue.shift()!;
    run();
  }

  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(async () => {
        try {
          resolve(await fn());
        } catch (err) {
          reject(err);
        } finally {
          running--;
          next(); // pick next queued task
        }
      });
      next(); // try to start immediately if slot available
    });
  };
}

// Usage:
const limit = pLimit(3); // max 3 concurrent

async function fetchAll(ids: string[]) {
  return Promise.all(
    ids.map(id => limit(() => fetchUser(id)))
  );
}

// Test:
const results = await fetchAll(['a','b','c','d','e','f']);
// At any moment, at most 3 fetchUser() calls are in-flight
```

---

## Semaphore (Named Concurrent Resource)

```typescript
// A semaphore controls access to a shared resource.
// Classic use: DB connection pool, file handle limit

class Semaphore {
  private permits: number;
  private waiters: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }
    // No permits — queue the caller
    return new Promise(resolve => this.waiters.push(resolve));
  }

  release(): void {
    const next = this.waiters.shift();
    if (next) {
      next(); // grant permit to next waiter (don't increment permits)
    } else {
      this.permits++;
    }
  }

  async use<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// Usage:
const dbSemaphore = new Semaphore(5); // max 5 concurrent DB operations

async function queryDB(sql: string) {
  return dbSemaphore.use(async () => {
    return pool.query(sql);
  });
}

// Even with 1000 callers, only 5 run at once
const results = await Promise.all(
  queries.map(q => queryDB(q))
);
```

---

## Async Queue (Process items one at a time, in order)

```typescript
// Useful when order matters or resource can't be concurrent at all
// (e.g., writing to a file, serial device communication)

class AsyncQueue {
  private queue: Array<() => Promise<void>> = [];
  private running = false;

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          resolve(await task());
        } catch (err) {
          reject(err);
        }
      });
      this.drain();
    });
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      await task(); // process one at a time
    }
    this.running = false;
  }
}

// Usage: serial file writes
const fileQueue = new AsyncQueue();

async function appendToLog(line: string) {
  return fileQueue.enqueue(() =>
    fs.promises.appendFile('app.log', line + '\n')
  );
}

// Multiple concurrent callers — writes are serialized:
await Promise.all([
  appendToLog('line 1'),
  appendToLog('line 2'),
  appendToLog('line 3'),
]);
// File always has lines in the order enqueued
```

---

## Batch Processing with Concurrency

Batch processing divides a large array into fixed-size chunks and processes each chunk sequentially, waiting for the entire chunk to complete before starting the next. This is simpler to implement than `p-limit` but less efficient: if one item in a batch is slow, the remaining items in the next batch wait even though worker capacity is free. Use batch processing when the downstream API accepts bulk operations (bulk inserts, batch API calls) where the unit of work is the batch itself, not the individual item.

```typescript
// Process an array in batches — useful for DB bulk inserts
async function processBatch<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<R[]>,
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processor(batch);
    results.push(...batchResults);
    console.log(`Processed ${Math.min(i + batchSize, items.length)}/${items.length}`);
  }

  return results;
}

// Usage: insert 100k rows, 1000 at a time
const allRows = generateRows(100_000);
await processBatch(allRows, 1000, async (batch) => {
  await db.query('INSERT INTO events SELECT * FROM unnest($1::events[])', [batch]);
  return batch.map(r => r.id);
});
```

---

## Rate Limiter (Token Bucket)

A rate limiter controls the **rate** at which requests are issued over time, whereas `p-limit` controls the **count** of simultaneously in-flight requests. The token bucket algorithm models a bucket that fills at a constant refill rate up to a maximum capacity. Each request consumes one token; if no token is available the request waits until the next refill. This naturally smooths out bursts: up to `maxTokens` requests can be sent immediately (consuming the full bucket), but sustained throughput is capped at `refillRate` per second. Use a rate limiter when you must respect a third-party API's documented rate limit; use `p-limit` when you need to protect your own resources from overload.

```typescript
// Respect external API rate limits (e.g., 100 req/s)

class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly queue: Array<() => void> = [];

  constructor(
    private readonly maxTokens: number,
    private readonly refillRate: number,   // tokens per second
  ) {
    this.tokens    = maxTokens;
    this.lastRefill = Date.now();
  }

  private refill() {
    const now     = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens   = Math.min(
      this.maxTokens,
      this.tokens + elapsed * this.refillRate,
    );
    this.lastRefill = now;
  }

  acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens--;
      return Promise.resolve();
    }

    // Wait until next token is available:
    const waitMs = (1 / this.refillRate) * 1000;
    return new Promise(resolve =>
      setTimeout(() => this.acquire().then(resolve), waitMs)
    );
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    return fn();
  }
}

// 100 requests per second max:
const limiter = new RateLimiter(100, 100);

async function fetchWithLimit(url: string) {
  return limiter.call(() => fetch(url));
}

// Fires at most 100 requests/second regardless of how fast callers push:
const results = await Promise.all(
  urls.map(url => fetchWithLimit(url))
);
```

---

## Promise Pool (streaming results as they complete)

`Promise.all` is all-or-nothing: it waits for every promise to settle before yielding any results. A promise pool using an async generator instead yields each result as soon as it resolves, enabling the consumer to begin processing early results while slower ones are still in flight. This is valuable for UI progress updates, streaming pipelines where downstream processing can start before all input is ready, or any scenario where you want to minimize time-to-first-result rather than time-to-all-results.

```typescript
// Unlike Promise.all, stream results as each completes —
// useful for UI updates or when you want early results

async function* promisePool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): AsyncGenerator<R> {
  const limit  = pLimit(concurrency);
  const promises = items.map(item =>
    limit(() => worker(item))
  );

  // Yield results as they resolve:
  for (const result of await Promise.allSettled(promises)) {
    if (result.status === 'fulfilled') yield result.value;
    // or handle rejections here
  }
}

// Usage:
for await (const result of promisePool(urls, 10, fetchUser)) {
  console.log('got result:', result);
  // Each result arrives as soon as it's ready
}
```

---

## Retry with Concurrency Control

Retrying individual failed tasks while keeping the overall concurrency controlled is a production necessity: transient network errors, rate-limit 429s, and database deadlocks are all temporary conditions that warrant a retry rather than a hard failure. Combining `withRetry` and `p-limit` ensures that retried tasks reuse the same concurrency slot — the retry counts against the limit just like the first attempt — preventing a wave of retries from doubling the concurrency beyond the intended ceiling. Exponential backoff with jitter spreads retries across time to avoid the thundering-herd effect when many tasks fail simultaneously.

```typescript
// Combine retry + concurrency limit — production pattern

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 500,
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      const backoff = delayMs * 2 ** attempt + Math.random() * 100;
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  throw new Error('unreachable');
}

const limit = pLimit(5);

async function resilientBatch(urls: string[]) {
  return Promise.all(
    urls.map(url =>
      limit(() => withRetry(() => fetch(url), 3, 200))
    )
  );
}
```

---

## Tricky Interview Questions

**Q: What's the difference between p-limit and a Semaphore?**
Functionally similar — both limit concurrent async operations. `p-limit` wraps a function and returns a new limited function. A semaphore is a lower-level primitive you acquire/release manually. Semaphores are more flexible (e.g., acquire in one function, release in another).

**Q: Why not just use `Promise.all` with array slicing?**
```javascript
// Naive batching — waits for entire batch before starting next:
for (const batch of chunk(items, 10)) {
  await Promise.all(batch.map(process)); // idle time between batches!
}
// If batch[0] finishes in 10ms but batch[9] takes 2s,
// the next batch doesn't start until 2s, even though 9 workers are free.
// p-limit keeps the pipeline full continuously.
```

**Q: How do you handle backpressure in a Node.js stream?**
```javascript
readable.on('data', (chunk) => {
  const ok = writable.write(chunk);
  if (!ok) {
    readable.pause();              // stop producing
    writable.once('drain', () => readable.resume()); // resume when ready
  }
});
```

**Q: What's a "thundering herd" and how do you prevent it?**
When many waiters are released simultaneously (e.g., cache expires, all 1000 requests try to refill it at once). Prevent with: cache stampede protection (single-flight / coalescing), jitter on retry delays, or a request deduplication map.

```typescript
// Single-flight: multiple callers coalesce into one in-flight request
const inflight = new Map<string, Promise<unknown>>();

async function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (inflight.has(key)) return inflight.get(key) as Promise<T>;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// 1000 cache-miss requests for 'user:42' → only 1 DB query fires
const user = await singleFlight(`user:${id}`, () => db.users.findById(id));
```
