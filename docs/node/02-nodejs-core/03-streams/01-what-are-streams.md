# Node.js Streams

## Why Streams?

Without streams, processing a 1GB file means loading the entire thing into memory:

```javascript
// ❌ No streams — loads entire file into memory
const data = fs.readFileSync('bigfile.csv'); // 1GB in RAM!
process(data);

// ✅ Streams — process in chunks (constant memory)
fs.createReadStream('bigfile.csv')
  .pipe(processStream)
  .pipe(outputStream);
// Memory stays at ~highWaterMark (64KB by default)
```

**Two benefits:**
1. **Memory efficiency** — process data larger than RAM
2. **Time efficiency** — start processing before all data arrives (pipeline)

---

## 4 Types of Streams

These four stream types form a composable system. A Transform is the most powerful: it is both a Readable and a Writable simultaneously, allowing it to sit in the middle of a pipeline and convert data as it flows through. Duplex is similar but the read and write sides are independent (they don't process each other's data). Real pipelines are built by connecting these types: `Readable.pipe(Transform).pipe(Transform).pipe(Writable)`.

```
Readable  — source of data     (fs.createReadStream, http req, process.stdin)
Writable  — destination        (fs.createWriteStream, http res, process.stdout)
Duplex    — both readable and writable (net.Socket, TCP connections)
Transform — duplex that modifies data (zlib.createGzip, crypto streams)
```

---

## Stream Events

Stream events are the low-level API for interacting with streams. Each stream type emits a specific set of events at key lifecycle moments. Most application code uses `pipe()` or `pipeline()` which handle these events automatically — but knowing the events is essential when implementing custom streams, debugging stream pipelines, or handling errors correctly at each stage.

```javascript
// Readable events:
readable.on('data', chunk => { });      // flowing mode — chunk received
readable.on('end', () => { });          // no more data
readable.on('error', err => { });       // error occurred
readable.on('close', () => { });        // stream/fd closed
readable.on('readable', () => { });     // data available (paused mode)

// Writable events:
writable.on('drain', () => { });        // buffer empty, can write more
writable.on('finish', () => { });       // all data flushed
writable.on('error', err => { });
writable.on('close', () => { });
writable.on('pipe', src => { });        // when piped to
writable.on('unpipe', src => { });
```

---

## Flowing vs Paused Mode

A Readable stream has two operating modes that determine whether it pushes data to your code automatically or waits to be pulled. The mode exists because different consumers want different control: event-driven code typically uses flowing mode (data arrives as events), while manual iteration or backpressure-aware consumers use paused mode. Mixing both modes in the same stream is a common source of bugs — attach a `data` listener and the stream switches to flowing; call `readable.pause()` to switch back; use `async for-of` (the modern approach) which manages the mode automatically.

Readable streams start in **paused mode**. They switch to **flowing** when:
- You add a `data` event handler
- You call `.resume()`
- You `.pipe()` to a writable

```javascript
const readable = fs.createReadStream('file.txt');

// Paused mode — pull data manually:
readable.on('readable', () => {
  let chunk;
  while (null !== (chunk = readable.read())) {
    console.log(chunk); // Buffer
  }
});

// Flowing mode — data pushed automatically:
readable.on('data', chunk => {
  console.log(chunk); // fired for each chunk
});

// Async iteration (modern, preferred):
for await (const chunk of readable) {
  console.log(chunk);
}
```

---

## highWaterMark — Buffer Size

`highWaterMark` is the threshold that governs when a stream "pauses" its source and when a writable signals that it can accept more data. It is not a hard limit — data can accumulate beyond it — but crossing it triggers backpressure signals (`write()` returning `false`, the Readable pausing). Setting it too low wastes I/O efficiency with frequent start-stop cycles; too high and you risk large memory spikes when the consumer is slow. The default 64KB is a reasonable balance for file and network I/O.

```javascript
// Default: 64KB for byte streams, 16 objects for object mode
const readable = fs.createReadStream('file.txt', {
  highWaterMark: 16 * 1024 // 16KB chunks
});

const writable = fs.createWriteStream('output.txt', {
  highWaterMark: 16 * 1024
});
```

---

## Creating Custom Streams

Custom streams are created by extending the built-in `Readable`, `Writable`, or `Transform` classes and implementing the corresponding internal method (`_read`, `_write`, or `_transform`). Node.js calls these internal methods when the stream needs more data or needs to flush data — your job is to implement the logic and signal completion via `callback()` or `this.push(null)`. The `objectMode` option switches the stream from Buffer/string chunks to arbitrary JavaScript objects, which is useful for in-memory data processing pipelines.

```javascript
const { Readable, Writable, Transform } = require('stream');

// Custom Readable:
class NumberStream extends Readable {
  constructor(limit) {
    super({ objectMode: true }); // stream objects, not buffers
    this.current = 1;
    this.limit = limit;
  }

  _read() {
    if (this.current <= this.limit) {
      this.push(this.current++); // push data
    } else {
      this.push(null); // signal end
    }
  }
}

// Custom Writable:
class SumStream extends Writable {
  constructor() {
    super({ objectMode: true });
    this.sum = 0;
  }

  _write(chunk, encoding, callback) {
    this.sum += chunk;
    callback(); // MUST call callback to signal ready for more
  }

  _final(callback) {
    console.log('Sum:', this.sum);
    callback();
  }
}

const nums = new NumberStream(10);
const summer = new SumStream();

nums.pipe(summer); // Sum: 55
```

---

## Interview Questions

**Q: What are the 4 types of Node.js streams?**
A: Readable (data source), Writable (data destination), Duplex (both readable and writable simultaneously), Transform (duplex that transforms data as it passes through).

**Q: What is the difference between flowing and paused mode in Readable streams?**
A: Paused mode (default) — stream holds data internally, you pull it with `.read()` or `readable` event. Flowing mode — stream pushes data continuously via `data` events. Switch to flowing by adding a `data` handler, calling `.resume()`, or `.pipe()`.

**Q: What is highWaterMark?**
A: The buffer size threshold for streams. In a Readable, it's how much data to buffer before pausing the underlying source. In a Writable, it's how much data can be buffered before `.write()` returns `false` (backpressure signal). Default: 64KB.
