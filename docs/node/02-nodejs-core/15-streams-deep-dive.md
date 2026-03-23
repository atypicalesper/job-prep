# Node.js Streams — Deep Dive

## What Are Streams?

Streams process data piece by piece (chunks) instead of loading everything into memory. Essential for:
- Large file processing
- HTTP request/response bodies
- Video/audio streaming
- ETL pipelines
- Real-time data transformation

```
Without streams:            With streams:
┌─────────────┐             ┌──────┐    ┌──────┐    ┌──────┐
│ Read entire │             │Chunk1│───►│Trans-│───►│Chunk1│
│  file to   │             │Chunk2│    │ form │    │Chunk2│
│  memory    │             │Chunk3│    │      │    │Chunk3│
│ Transform  │             └──────┘    └──────┘    └──────┘
│  all at   │
│   once    │
└─────────────┘
Memory = file size          Memory = chunk size (constant!)
```

---

## Stream Types

| Type | Description | Example |
|------|-------------|---------|
| `Readable` | Source of data | `fs.createReadStream`, `http.IncomingMessage` |
| `Writable` | Destination | `fs.createWriteStream`, `http.ServerResponse` |
| `Transform` | Read + Write + Transform | `zlib.createGzip`, `crypto.createCipher` |
| `Duplex` | Read + Write (independent) | `net.Socket`, WebSocket |
| `PassThrough` | Transform that passes through | Logging, metrics |

---

## Readable Streams

### Two Modes

**Paused (pull):** Consumer controls when data arrives.
```js
const readable = fs.createReadStream('large.csv');

readable.on('readable', () => {
  let chunk;
  while ((chunk = readable.read(64 * 1024)) !== null) {
    // Process 64KB at a time
    process(chunk);
  }
});
```

**Flowing (push):** Data pushed to consumer as fast as it arrives.
```js
readable.on('data', (chunk) => {
  process(chunk);
});
readable.on('end', () => console.log('Done'));
readable.on('error', (err) => console.error(err));
```

### Modes transition
```
Paused (default) ──► Flowing (on('data'), pipe(), resume())
Flowing           ──► Paused (pause(), remove 'data' listener, unpipe())
```

### Reading from iterables (Node 12+)
```js
import { Readable } from 'stream';

// Create readable from async generator
async function* generateData() {
  for (let i = 0; i < 1000000; i++) {
    yield Buffer.from(`line ${i}\n`);
    if (i % 1000 === 0) await new Promise(r => setImmediate(r));
  }
}

const readable = Readable.from(generateData());
readable.pipe(fs.createWriteStream('output.txt'));
```

---

## Writable Streams

```js
import { Writable } from 'stream';

class DatabaseWritable extends Writable {
  constructor(db, options = {}) {
    super({ ...options, objectMode: true }); // accept objects, not just buffers
    this.db = db;
    this.batch = [];
    this.batchSize = options.batchSize ?? 100;
  }

  async _write(chunk, encoding, callback) {
    this.batch.push(chunk);

    if (this.batch.length >= this.batchSize) {
      try {
        await this.db.batchInsert(this.batch);
        this.batch = [];
        callback();  // signal ready for next chunk
      } catch (err) {
        callback(err);  // signal error
      }
    } else {
      callback();  // ready immediately
    }
  }

  async _final(callback) {
    // Called when all writes done, before 'finish' event
    try {
      if (this.batch.length > 0) {
        await this.db.batchInsert(this.batch);
      }
      callback();
    } catch (err) {
      callback(err);
    }
  }
}

const writer = new DatabaseWritable(db, { batchSize: 500 });
csvStream.pipe(writer);
writer.on('finish', () => console.log('All data written'));
```

### `_writev` — batch writes
```js
class BatchWritable extends Writable {
  // _writev is called with multiple buffered chunks at once
  async _writev(chunks, callback) {
    const data = chunks.map(({ chunk }) => chunk);
    try {
      await this.db.batchInsert(data);
      callback();
    } catch (err) {
      callback(err);
    }
  }
}
```

---

## Transform Streams — The Core Pattern

Transform is a Duplex where output is derived from input.

```js
import { Transform } from 'stream';

class CSVParser extends Transform {
  constructor(options = {}) {
    super({ ...options, objectMode: true }); // output objects
    this.buffer = '';
    this.headers = null;
  }

  _transform(chunk, encoding, callback) {
    this.buffer += chunk.toString();
    const lines = this.buffer.split('\n');

    // Keep incomplete last line in buffer
    this.buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;

      if (!this.headers) {
        this.headers = line.split(',').map(h => h.trim());
      } else {
        const values = line.split(',');
        const obj = Object.fromEntries(
          this.headers.map((h, i) => [h, values[i]?.trim()])
        );
        this.push(obj);  // push to readable side
      }
    }

    callback();
  }

  _flush(callback) {
    // Called when input ends — process remaining buffer
    if (this.buffer.trim() && this.headers) {
      const values = this.buffer.split(',');
      const obj = Object.fromEntries(
        this.headers.map((h, i) => [h, values[i]?.trim()])
      );
      this.push(obj);
    }
    callback();
  }
}

// Usage
fs.createReadStream('users.csv')
  .pipe(new CSVParser())
  .pipe(new Transform({
    objectMode: true,
    transform(user, enc, cb) {
      // Transform object
      cb(null, { ...user, age: parseInt(user.age) });
    }
  }))
  .pipe(new DatabaseWritable(db));
```

### Transform with async operations
```js
class AsyncTransform extends Transform {
  constructor(fn, options = {}) {
    super({ ...options, objectMode: true });
    this.fn = fn;
    this.pending = 0;
    this.flushCallback = null;
  }

  _transform(chunk, enc, callback) {
    this.pending++;
    callback(); // accept next chunk immediately (parallel processing)

    this.fn(chunk).then(result => {
      this.push(result);
      this.pending--;
      if (this.pending === 0 && this.flushCallback) {
        this.flushCallback();
      }
    }).catch(err => this.destroy(err));
  }

  _flush(callback) {
    if (this.pending === 0) callback();
    else this.flushCallback = callback; // wait for pending
  }
}

// Usage: parallel HTTP requests in stream pipeline
const enrichStream = new AsyncTransform(async (user) => {
  const extra = await fetch(`/api/enrich/${user.id}`).then(r => r.json());
  return { ...user, ...extra };
}, { highWaterMark: 16 }); // limit concurrent requests
```

---

## Backpressure — The Critical Concept

Backpressure = signal from consumer to producer to slow down.

Without backpressure:
```
Producer: ████████████████████████ (fast)
Consumer: ████░░░░░░░░░░░░░░░░░░░░ (slow)
Buffer:   ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲ (grows → OOM!)
```

With backpressure:
```
Producer: ████░░░████░░░████░░░     (throttled by consumer)
Consumer: ████    ████    ████
Buffer:   ▲▲▲     ▲▲▲     ▲▲▲      (stays bounded)
```

### How it works with `pipe()`

```js
readable.pipe(writable);
// pipe handles backpressure automatically:
// - writable.write() returns false when buffer is full (highWaterMark reached)
// - pipe pauses readable
// - writable emits 'drain' when buffer empties
// - pipe resumes readable
```

### Manual backpressure (without pipe)

```js
function copy(readable, writable) {
  readable.on('data', (chunk) => {
    const canContinue = writable.write(chunk);

    if (!canContinue) {
      // Writable buffer full — pause reading
      readable.pause();

      writable.once('drain', () => {
        // Writable drained — resume reading
        readable.resume();
      });
    }
  });

  readable.on('end', () => writable.end());
}
```

### highWaterMark

Controls buffer size (in bytes for binary, objects for objectMode).

```js
// Binary streams: highWaterMark in bytes (default: 16KB)
const readable = fs.createReadStream('file.txt', {
  highWaterMark: 64 * 1024  // 64KB chunks
});

// Object mode: highWaterMark in objects (default: 16)
const transform = new Transform({
  objectMode: true,
  highWaterMark: 100,  // buffer up to 100 objects
});
```

---

## `stream.pipeline()` — Error Handling

`pipe()` doesn't handle errors well — if a stream in the middle errors, the others aren't cleaned up.

```js
// BAD — resource leak on error
readable.pipe(transform).pipe(writable);

// GOOD — pipeline destroys all streams on error
import { pipeline } from 'stream/promises';

async function processFile(inputPath, outputPath) {
  await pipeline(
    fs.createReadStream(inputPath),
    new CSVParser(),
    new Transform({
      objectMode: true,
      transform(row, enc, cb) {
        cb(null, JSON.stringify(row) + '\n');
      }
    }),
    zlib.createGzip(),
    fs.createWriteStream(outputPath + '.gz')
  );
}

// With abort signal
const controller = new AbortController();
setTimeout(() => controller.abort(), 30000); // timeout

await pipeline(
  source,
  transform,
  destination,
  { signal: controller.signal }
);
```

---

## Streams as Async Iterables (Node 12+)

```js
// Readable streams implement async iterable
async function processLines(filepath) {
  const stream = fs.createReadStream(filepath);

  // readline interface as async iterable
  const rl = readline.createInterface({ input: stream });

  let lineCount = 0;
  for await (const line of rl) {
    processLine(line);
    lineCount++;
  }
  return lineCount;
}

// Collecting stream to buffer
async function streamToBuffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Streaming HTTP response in Node.js
app.get('/stream', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.write('[');

  let first = true;
  for await (const user of db.streamUsers()) {
    if (!first) res.write(',');
    res.write(JSON.stringify(user));
    first = false;
  }

  res.write(']');
  res.end();
});
```

---

## Real-World Pipeline: ETL with Streams

```js
import { pipeline } from 'stream/promises';
import { Transform, PassThrough } from 'stream';
import { createReadStream, createWriteStream } from 'fs';
import { createGzip } from 'zlib';
import { createInterface } from 'readline';

class LineTransform extends Transform {
  constructor() {
    super({ readableObjectMode: true });
    this.buffer = '';
  }

  _transform(chunk, enc, cb) {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop();
    lines.forEach(line => this.push(line));
    cb();
  }

  _flush(cb) {
    if (this.buffer) this.push(this.buffer);
    cb();
  }
}

class JSONParser extends Transform {
  constructor() {
    super({ writableObjectMode: true, readableObjectMode: true });
  }

  _transform(line, enc, cb) {
    try {
      cb(null, JSON.parse(line));
    } catch {
      cb(); // skip invalid lines
    }
  }
}

class Filter extends Transform {
  constructor(fn) {
    super({ objectMode: true });
    this.fn = fn;
  }

  _transform(obj, enc, cb) {
    if (this.fn(obj)) this.push(obj);
    cb();
  }
}

class Counter extends PassThrough {
  constructor() {
    super({ objectMode: true });
    this.count = 0;
  }

  _transform(obj, enc, cb) {
    this.count++;
    cb(null, obj);
  }
}

const counter = new Counter();

await pipeline(
  createReadStream('events.log'),
  new LineTransform(),
  new JSONParser(),
  new Filter(event => event.type === 'purchase' && event.amount > 100),
  counter,
  new Transform({
    objectMode: true,
    transform(obj, enc, cb) {
      cb(null, JSON.stringify(obj) + '\n');
    }
  }),
  createWriteStream('filtered.jsonl')
);

console.log(`Processed ${counter.count} matching events`);
```

---

## Memory Profile Comparison

```js
// Without streams — OOM on large files
const data = fs.readFileSync('10gb.csv');           // 10GB in memory
const parsed = parse(data.toString());              // another 10GB+
await db.insertMany(parsed);

// With streams — constant ~16KB memory
await pipeline(
  fs.createReadStream('10gb.csv', { highWaterMark: 16384 }),
  new CSVParser(),
  new DatabaseWritable(db, { batchSize: 1000 }),
);
// Processes 10GB with <50MB memory usage
```

---

## Interview Questions

**Q: What is backpressure and how does Node.js handle it?**
Backpressure is the mechanism for a fast producer to know when to slow down for a slow consumer. In Node.js streams, `writable.write()` returns `false` when the internal buffer exceeds `highWaterMark`. The producer should stop writing and wait for the `'drain'` event. `pipe()` handles this automatically; manual pipes must implement it or risk memory exhaustion.

**Q: What's the difference between `pipe()` and `pipeline()`?**
`pipe()` returns the destination stream and handles backpressure, but does NOT propagate errors — a stream error in the middle will leave other streams open (resource leak). `pipeline()` (Node 10+) destroys all streams on error and supports abort signals. Always use `pipeline()` for production code.

**Q: When would you use a Transform stream vs. processing in memory?**
Transform streams when: data is large (wouldn't fit in memory), data arrives incrementally (HTTP, files), or you want to compose processing stages. In-memory when: data is small and already buffered, or the processing logic is complex and doesn't benefit from streaming.

**Q: What is `objectMode` in streams?**
By default, streams work with Buffers/strings. `objectMode: true` allows pushing any JavaScript value (objects, arrays). Required when building data processing pipelines with parsed records. Note: `highWaterMark` in objectMode counts objects, not bytes.

**Q: How do you handle errors in a stream pipeline?**
Use `stream.pipeline()` which destroys all streams on first error and calls the callback/rejects the promise. For individual streams: listen to `'error'` event. Unhandled stream errors crash the process (like unhandled promise rejections). Always either use `pipeline()` or attach `error` handlers to every stream.
