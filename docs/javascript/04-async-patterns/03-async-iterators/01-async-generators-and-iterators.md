# Async Iterators & Generators

Async iterators are the standard protocol for consuming streams of asynchronous values — DB cursors, file lines, paginated APIs, WebSocket messages. Introduced in ES2018, they're now core Node.js API.

---

## The Protocol

```
Iterable:       has [Symbol.iterator]()        → returns Iterator
AsyncIterable:  has [Symbol.asyncIterator]()   → returns AsyncIterator

Iterator:       { next() → { value, done } }
AsyncIterator:  { next() → Promise<{ value, done }> }

for...of      → uses Symbol.iterator
for await...of → uses Symbol.asyncIterator
```

---

## Async Generator — Simplest Way to Create Async Iterables

```typescript
// Async generator function: async function*
async function* paginate<T>(
  fetcher: (cursor?: string) => Promise<{ items: T[]; nextCursor?: string }>,
): AsyncGenerator<T> {
  let cursor: string | undefined;

  while (true) {
    const { items, nextCursor } = await fetcher(cursor);

    for (const item of items) {
      yield item; // each item is a separate value in the async stream
    }

    if (!nextCursor) break;
    cursor = nextCursor;
  }
}

// Usage — transparently iterates all pages:
for await (const user of paginate(cursor => api.getUsers({ cursor, limit: 100 }))) {
  await processUser(user);
  // Only fetches next page when current page is exhausted
}
```

---

## Reading Files Line by Line

Processing a large file line by line with an async generator consumes constant memory regardless of file size, because only one line is in memory at any moment. The `readline` module's `createInterface` produces an async iterable of lines natively in Node.js 12+, making it the simplest way to stream file lines without manual buffering or chunk-splitting logic. This pattern is the correct alternative to `fs.readFileSync` or `file.split('\n')` for any file that might be larger than a few megabytes.

```typescript
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

async function* readLines(filePath: string): AsyncGenerator<string> {
  const rl = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    yield line;
  }
}

// Process a 10GB log file with constant memory:
for await (const line of readLines('/var/log/access.log')) {
  if (line.includes('ERROR')) {
    errorCount++;
  }
}
// Memory usage: ~constant regardless of file size
```

---

## Implementing AsyncIterator Manually

When the data source is callback-based or requires explicit resource management that doesn't fit the linear `async function*` flow, you implement `AsyncIterator` manually as a class. The class manages its own internal buffer, page offset, and exhaustion flag, fetching the next page on demand when the buffer runs dry. Implementing `[Symbol.asyncIterator]()` returning `this` makes the cursor directly usable in `for await...of` loops and async pipeline functions. This pattern is appropriate for database cursors, paginated REST APIs, and any source with non-trivial state machines.

```typescript
// When you can't use a generator (e.g., wrapping a callback-based API)

class DatabaseCursor<T> implements AsyncIterator<T> {
  private buffer: T[] = [];
  private exhausted  = false;
  private fetching   = false;
  private offset     = 0;
  private readonly pageSize = 100;

  constructor(private readonly query: string) {}

  async next(): Promise<IteratorResult<T>> {
    // Refill buffer if empty
    if (this.buffer.length === 0 && !this.exhausted) {
      const rows = await db.query<T>(
        `${this.query} LIMIT ${this.pageSize} OFFSET ${this.offset}`
      );
      this.offset += rows.length;
      this.buffer  = rows;

      if (rows.length < this.pageSize) {
        this.exhausted = true; // last page
      }
    }

    if (this.buffer.length === 0) {
      return { value: undefined as unknown as T, done: true };
    }

    return { value: this.buffer.shift()!, done: false };
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this;
  }
}

// Usage:
const cursor = new DatabaseCursor<User>('SELECT * FROM users ORDER BY id');
for await (const user of cursor) {
  await sendEmail(user);
}
```

---

## Transforming Async Streams (Pipeline)

Async generators can be chained into Unix-pipe style pipelines where each stage consumes an `AsyncIterable` and yields a transformed `AsyncIterable`. Critically, each stage only pulls the next item from its source when the downstream consumer requests one — so the entire pipeline processes one element at a time through all stages, with no intermediate arrays or unbounded buffering. This is memory-efficient for arbitrarily large datasets and naturally applies backpressure: if the terminal consumer is slow, the source pauses automatically.

```typescript
// Chain async generators like Unix pipes

// Source: DB rows
async function* dbRows(table: string): AsyncGenerator<Record<string, unknown>> {
  let offset = 0;
  while (true) {
    const rows = await db.query(`SELECT * FROM ${table} LIMIT 500 OFFSET ${offset}`);
    if (rows.length === 0) break;
    yield* rows; // yield all rows in batch
    offset += rows.length;
  }
}

// Transform: enrich each row
async function* enrich<T extends { userId: string }>(
  source: AsyncIterable<T>
): AsyncGenerator<T & { user: User }> {
  for await (const row of source) {
    const user = await userCache.get(row.userId);
    yield { ...row, user };
  }
}

// Filter:
async function* filter<T>(
  source: AsyncIterable<T>,
  predicate: (item: T) => boolean,
): AsyncGenerator<T> {
  for await (const item of source) {
    if (predicate(item)) yield item;
  }
}

// Collect (terminal operation):
async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const item of source) results.push(item);
  return results;
}

// Compose the pipeline:
const pipeline = filter(
  enrich(dbRows('orders')),
  row => row.user.tier === 'premium',
);

for await (const order of pipeline) {
  await sendPremiumEmail(order);
}
```

---

## Node.js stream.pipeline with Async Generators

Node.js 16+ accepts async generator functions directly in `stream.pipeline`, bridging the async generator world with the mature Node.js streams ecosystem (Transform streams, zlib compression, fs write streams). `pipeline` handles error propagation — if any stage throws, all stages are destroyed and the returned promise rejects — and manages backpressure automatically between generator stages and Node.js streams. This is the production-grade way to build ETL pipelines, export endpoints, and streaming file processors.

```typescript
import { pipeline } from 'stream/promises';
import { Transform, Readable, Writable } from 'stream';

// Node.js 16+ accepts async generators directly in pipeline:
await pipeline(
  // Source: async generator
  async function* () {
    const rows = await db.query('SELECT * FROM events');
    for (const row of rows) {
      yield JSON.stringify(row) + '\n';
    }
  },
  // Transform: compress
  zlib.createGzip(),
  // Sink: write to file
  fs.createWriteStream('export.ndjson.gz'),
);

// Handles backpressure automatically
// If file write is slow, generator pauses automatically
```

---

## Cancellation with AbortController

`AbortController` is the standard cancellation primitive for async operations in both browser and Node.js. Wrapping an async iterable with an abort-aware generator checks `signal.aborted` at each iteration step and throws an `AbortError` to cleanly terminate the loop. This is preferable to a boolean flag because it composes with other abort-aware APIs: the same signal can cancel a `fetch`, a `once()` event wait, and an iterable pipeline simultaneously, all coordinated by a single `ac.abort()` call.

```typescript
async function* withAbort<T>(
  source: AsyncIterable<T>,
  signal: AbortSignal,
): AsyncGenerator<T> {
  for await (const item of source) {
    if (signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    yield item;
  }
}

// Cancel after 10 seconds:
const ac = new AbortController();
setTimeout(() => ac.abort(), 10_000);

try {
  for await (const row of withAbort(dbRows('events'), ac.signal)) {
    await process(row);
  }
} catch (err) {
  if ((err as Error).name === 'AbortError') {
    console.log('Processing cancelled');
  }
}
```

---

## Merge Multiple Async Iterables

Merging multiple async iterables into a single interleaved stream is the async equivalent of `Promise.race` applied continuously. The implementation maintains a set of pending `next()` promises — one per source iterator — and yields results via `Promise.race` as each resolves, immediately re-queuing that iterator's next promise. Exhausted iterators are removed from the set. This ensures results from all sources are emitted in arrival order, with no source starved by a slow sibling. Use this for merging real-time feeds, combining multiple event streams, or aggregating results from parallel data sources.

```typescript
// Merge N async iterables into one, interleaved as values arrive

async function* merge<T>(...sources: AsyncIterable<T>[]): AsyncGenerator<T> {
  // Convert each source to an array of pending promises
  const iterators = sources.map(s => s[Symbol.asyncIterator]());

  type Result = { iter: AsyncIterator<T>; result: IteratorResult<T> };

  async function nextFrom(iter: AsyncIterator<T>): Promise<Result> {
    return iter.next().then(result => ({ iter, result }));
  }

  const pending = new Set(iterators.map(nextFrom));

  while (pending.size > 0) {
    const { iter, result } = await Promise.race(pending);
    pending.delete(nextFrom(iter)); // remove this iter's pending promise

    if (!result.done) {
      yield result.value;
      pending.add(nextFrom(iter)); // re-queue for next value
    }
    // If done, don't re-queue — iterator is exhausted
  }
}

// Usage: merge two real-time feeds
for await (const event of merge(kafkaStream('orders'), kafkaStream('payments'))) {
  console.log(event);
}
```

---

## Converting Callbacks to Async Iterables

Event-emitter and callback-based APIs predate the async iterator protocol. Wrapping them as `AsyncIterable` gives consumers a clean `for await...of` interface without changing the underlying API. The adapter maintains two queues that run in opposite directions: a buffer for data that arrived before `next()` was called, and a resolver queue for `next()` calls that arrived before data. When data arrives it either satisfies a waiting resolver immediately or buffers for the next `next()` call; when `end` fires all pending resolvers are resolved with `done: true`. This pattern is the foundation for any library that bridges callback streams into the async iteration ecosystem.

```typescript
// Wrap any event-based source as an async iterable

function eventToAsyncIterable<T>(
  emitter: EventEmitter,
  dataEvent: string,
  errorEvent = 'error',
  endEvent   = 'end',
): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<T> {
      const buffer: T[]               = [];
      const resolvers: Array<(v: IteratorResult<T>) => void> = [];
      let done  = false;
      let error: Error | null = null;

      emitter.on(dataEvent,  (data: T) => {
        if (resolvers.length > 0) {
          resolvers.shift()!({ value: data, done: false });
        } else {
          buffer.push(data);
        }
      });

      emitter.once(endEvent, () => {
        done = true;
        resolvers.forEach(r => r({ value: undefined as unknown as T, done: true }));
        resolvers.length = 0;
      });

      emitter.once(errorEvent, (err: Error) => {
        error = err;
        resolvers.forEach((_, i, arr) => {
          // reject-style: we throw on next next() call
        });
      });

      return {
        next(): Promise<IteratorResult<T>> {
          if (error) return Promise.reject(error);
          if (buffer.length > 0) return Promise.resolve({ value: buffer.shift()!, done: false });
          if (done) return Promise.resolve({ value: undefined as unknown as T, done: true });
          return new Promise(resolve => resolvers.push(resolve));
        },
      };
    },
  };
}

// Usage:
const readable = fs.createReadStream('data.txt', { encoding: 'utf8' });
for await (const chunk of eventToAsyncIterable<string>(readable, 'data')) {
  process(chunk);
}
```

---

## Tricky Interview Questions

**Q: What's the difference between a generator and an async generator?**

| Feature | Generator `function*` | Async Generator `async function*` |
|---------|----------------------|----------------------------------|
| `yield` value | synchronous | can `await` before yielding |
| `next()` returns | `{ value, done }` | `Promise<{ value, done }>` |
| Iteration | `for...of` | `for await...of` |
| Use case | sync lazy sequences | async data streams |

**Q: Does `for await...of` work on regular (sync) iterables?**
Yes — it automatically wraps sync values in `Promise.resolve()`. But sync iterables can't use `for...of` on async iterables.

**Q: How does backpressure work with async generators?**
Naturally — the `for await...of` loop only calls `next()` after the previous iteration's `await` completes. So if your consumer is slow, the generator pauses. No explicit `pause()`/`resume()` needed.

**Q: What happens if you don't `return` or `break` from a generator early?**
The generator's `finally` block still runs when the iterator is garbage collected or when `return()` is called on it.

```typescript
async function* resource() {
  const conn = await openConnection();
  try {
    yield* streamData(conn);
  } finally {
    await conn.close(); // ← always runs, even on break/return/throw
  }
}

// break mid-iteration — finally still fires:
for await (const item of resource()) {
  if (item.id === target) break; // connection still closed
}
```
