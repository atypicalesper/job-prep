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
