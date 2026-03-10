# Async Concurrency Patterns

---

## The Problem: Uncontrolled Concurrency

```javascript
// ❌ Processing 10,000 URLs simultaneously — crushes DB and memory
const urls = await getUrls(); // 10,000 items
const results = await Promise.all(urls.map(url => fetch(url)));
// Creates 10,000 concurrent requests at once!
```

---

## Pattern 1: Sequential (No Concurrency)

```javascript
// One at a time — safest but slowest
async function sequential<T>(
  items: T[],
  fn: (item: T) => Promise<any>
) {
  const results = [];
  for (const item of items) {
    results.push(await fn(item));
  }
  return results;
}

// Use for: ordered operations, rate-sensitive APIs, transactions
```

---

## Pattern 2: Controlled Concurrency (p-limit style)

```javascript
// Process N items at a time — the most useful pattern
async function pLimit<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }

  // Start `concurrency` workers — they compete for items:
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker)
  );

  return results;
}

// Usage:
const results = await pLimit(imageUrls, 5, async (url) => {
  const res = await fetch(url);
  return res.arrayBuffer();
});

// Or use the npm package:
import pLimit from 'p-limit';
const limit = pLimit(5); // max 5 concurrent
const results = await Promise.all(
  urls.map(url => limit(() => fetch(url)))
);
```

---

## Pattern 3: Semaphore

```javascript
// Classic counting semaphore — more explicit control
class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    // No permits — wait in queue:
    await new Promise<void>(resolve => this.queue.push(resolve));
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next(); // give permit to next waiter
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
const sem = new Semaphore(3); // max 3 concurrent DB connections

async function queryDb(sql: string) {
  return sem.use(() => db.query(sql));
}

// All 100 queries compete but only 3 run at once:
const results = await Promise.all(
  queries.map(sql => queryDb(sql))
);
```

---

## Pattern 4: Batch Processing

```javascript
// Process items in batches of N, sequentially per batch
async function batchProcess<T, R>(
  items: T[],
  batchSize: number,
  fn: (batch: T[]) => Promise<R[]>
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await fn(batch); // process whole batch at once
    results.push(...batchResults);

    // Optional delay between batches (rate limiting):
    if (i + batchSize < items.length) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  return results;
}

// Usage — insert 10,000 users in batches of 100:
await batchProcess(users, 100, async (batch) => {
  await db.query(
    `INSERT INTO users (name, email) VALUES ${batch.map(() => '(?,?)').join(',')}`,
    batch.flatMap(u => [u.name, u.email])
  );
  return batch.map(u => ({ ...u, inserted: true }));
});
```

---

## Pattern 5: Queue with Worker Pool

```javascript
// Production-grade job queue pattern
import Bull from 'bull'; // or BullMQ

const emailQueue = new Bull('emails', { redis: redisConfig });

// Producer (add jobs):
await emailQueue.add(
  { to: 'alice@example.com', template: 'welcome' },
  { attempts: 3, backoff: { type: 'exponential', delay: 1000 } }
);

// Consumer (process jobs):
emailQueue.process(5, async (job) => { // 5 concurrent workers
  const { to, template } = job.data;
  await sendEmail(to, template);
  // If this throws, Bull retries based on attempts config
});

emailQueue.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
});

emailQueue.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});
```

---

## Pattern 6: Promise Pool with Results

```javascript
// Like Promise.all but with concurrency limit, collects results + errors
async function promisePool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<{ results: (R | null)[]; errors: (Error | null)[] }> {
  const results: (R | null)[] = new Array(items.length).fill(null);
  const errors: (Error | null)[] = new Array(items.length).fill(null);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      try {
        results[i] = await fn(items[i]);
      } catch (err) {
        errors[i] = err as Error;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker)
  );

  return { results, errors };
}
```

---

## Pattern 7: Async Generator for Streaming Processing

```javascript
// Process items as they come (memory-efficient, no need to load all at once)
async function* paginate<T>(
  fetchPage: (cursor: string | null) => Promise<{ items: T[]; nextCursor: string | null }>
): AsyncGenerator<T> {
  let cursor: string | null = null;

  while (true) {
    const { items, nextCursor } = await fetchPage(cursor);
    for (const item of items) {
      yield item; // yield one at a time
    }
    if (!nextCursor) break;
    cursor = nextCursor;
  }
}

// Consumer — processes each user as it arrives, never loads all into memory:
const users = paginate(cursor => api.getUsers({ cursor, limit: 100 }));

for await (const user of users) {
  await processUser(user);
}

// With concurrency:
const limit = pLimit(5);
const promises: Promise<void>[] = [];

for await (const user of paginate(cursor => api.getUsers({ cursor, limit: 100 }))) {
  promises.push(limit(() => processUser(user)));
}

await Promise.all(promises);
```

---

## Pattern 8: Circuit Breaker

```javascript
// Stop calling a failing service to give it time to recover
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(
    private readonly threshold: number = 5,     // failures before opening
    private readonly timeout: number = 60_000,   // ms before trying again
    private readonly halfOpenRequests: number = 1
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN'; // try one request
      } else {
        throw new Error('Circuit is OPEN — service unavailable');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      console.warn(`Circuit opened after ${this.threshold} failures`);
    }
  }

  get currentState() { return this.state; }
}

// Usage:
const breaker = new CircuitBreaker(5, 30_000);

async function callPaymentService(data: any) {
  return breaker.execute(() => paymentClient.charge(data));
}
```

---

## Interview Questions

**Q: What is the difference between concurrency and parallelism in Node.js?**
A: Concurrency = multiple tasks making progress by interleaving (one CPU, switch between tasks while one waits). Parallelism = multiple tasks literally running at the same time (multiple CPUs). Node.js is concurrent (event loop handles many I/O operations concurrently) but single-threaded for JS (not parallel). Worker Threads add parallelism. `Promise.all` is concurrent (all start, interleave during I/O wait) not parallel.

**Q: Why shouldn't you use `Promise.all` on 10,000 items?**
A: `Promise.all` starts ALL promises immediately — 10,000 simultaneous DB connections, HTTP requests, or file operations. This: (1) exhausts connection pools, (2) OOMs for large datasets, (3) gets rate-limited by APIs, (4) overwhelms the target service. Use `pLimit` or a batch pattern to control concurrency to a reasonable number (5-20 for I/O).

**Q: What is a circuit breaker pattern and when do you use it?**
A: Tracks failures when calling an external service. After N failures, "opens" the circuit — subsequent calls fail immediately without attempting to call the service. After a timeout, switches to "half-open" and allows one test request. If it succeeds, closes the circuit. If not, reopens. Prevents: cascading failures (your service going down because a dependency is slow/down), thundering herd (all retries hitting a recovering service at once).

**Q: What's the difference between `p-limit`, batch processing, and a semaphore?**
A: `p-limit` wraps individual functions — each item starts as soon as a slot is free, different items can finish in different order. Batch processing groups N items, processes the whole batch (all N at once), waits for batch to complete, then starts next batch. Semaphore is a primitive that controls access — acquire before entering, release when done, works at any granularity. `p-limit` is usually the most practical choice.
