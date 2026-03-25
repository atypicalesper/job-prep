# Node.js Streams — Tricky Questions and Edge Cases

These questions probe the non-obvious behaviors of Node.js streams: error propagation, event semantics, mode transitions, and the difference between graceful and abrupt termination. Many real-world bugs come from misunderstanding these edge cases — especially around `pipe()` not forwarding errors, the `end` vs `finish` distinction, and what happens to buffered data when `destroy()` is called.

---

## Q1: What does `pipe()` return?

```javascript
const fs = require('fs');
const zlib = require('zlib');

const result = fs.createReadStream('file.txt')
  .pipe(zlib.createGzip())
  .pipe(fs.createWriteStream('file.txt.gz'));

// What is result?
// A: The DESTINATION stream (the last .pipe() argument).
// pipe() returns the writable/transform it was called with,
// allowing chaining because Transform streams are both Readable and Writable.
// result here is the WriteStream to 'file.txt.gz'.

// ⚠️ Common mistake: thinking result is the readable (source):
result.on('finish', () => console.log('Done')); // ✅ works — WriteStream emits 'finish'
result.on('data', () => {});  // ❌ WriteStream doesn't emit 'data' events
```

---

## Q2: What happens when a piped writable emits an error?

```javascript
const readable = fs.createReadStream('file.txt');
const writable = fs.createWriteStream('/invalid/path/file.txt');

readable.pipe(writable);

// ❌ pipe() does NOT automatically destroy the readable on writable error!
// The writable emits 'error', the readable keeps reading → file descriptor leak

// ✅ Use pipeline() instead — it handles cleanup automatically:
const { pipeline } = require('stream');
pipeline(readable, writable, (err) => {
  if (err) console.error('Pipeline failed:', err);
  // Both streams are destroyed automatically on error OR success
});

// Or pipeline as Promise:
const { pipeline } = require('stream/promises');
await pipeline(readable, writable); // throws on error, cleans up automatically

// If you must use pipe(), handle errors manually:
const streams = [readable, transform, writable];
streams.forEach(s => s.on('error', (err) => {
  streams.forEach(s => s.destroy());
  console.error(err);
}));
readable.pipe(transform).pipe(writable);
```

---

## Q3: What is the difference between `'end'` and `'finish'` events?

```javascript
// 'end' is emitted by READABLE streams when there's no more data to consume
// 'finish' is emitted by WRITABLE streams when all data has been flushed

const readable = fs.createReadStream('file.txt');
readable.on('end', () => console.log('No more data')); // ✅
readable.on('finish', () => {}); // Never fires on a Readable

const writable = fs.createWriteStream('out.txt');
writable.on('finish', () => console.log('All written')); // ✅
writable.on('end', () => {}); // Never fires on a Writable

// Transform streams emit BOTH (they're both Readable and Writable):
const transform = zlib.createGzip();
transform.on('end', () => console.log('Output consumed'));   // readable side done
transform.on('finish', () => console.log('Input accepted')); // writable side done
// 'finish' fires before 'end' — input accepted, THEN output consumed
```

---

## Q4: What happens if you read a stream before attaching a 'data' listener?

```javascript
const readable = fs.createReadStream('file.txt');

// ⚠️ Streams start in PAUSED mode. Data is buffered until consumed.
// Attaching 'data' listener switches to FLOWING mode — data flows immediately.

setTimeout(() => {
  // 2 seconds later — buffered data all arrives at once in first 'data' event?
  // No! 'highWaterMark' limits buffering. Once buffer is full, reading pauses.
  readable.on('data', (chunk) => {
    console.log(chunk.length); // First chunk may be larger due to buffering
  });
}, 2000);

// ✅ Two modes:
// PAUSED (default): call readable.read() manually to get data
// FLOWING: attach 'data' listener or call resume() — data flows automatically

// Check current state:
console.log(readable.readableFlowing); // null (initial), true (flowing), false (paused)

// Switch between modes:
readable.pause(); // paused
readable.resume(); // flowing
readable.on('data', () => {}); // switches to flowing
```

---

## Q5: What is backpressure and when does it occur?

```javascript
// Backpressure: the writable can't consume data as fast as the readable produces it.
// Without backpressure handling, data buffers in memory → OOM.

const readable = fs.createReadStream('huge-file.bin', { highWaterMark: 64 * 1024 });
const writable = fs.createWriteStream('out.bin');

// ❌ Bad: ignoring backpressure
readable.on('data', (chunk) => {
  writable.write(chunk); // write() returns false when buffer is full — IGNORED!
  // Internal buffer grows indefinitely if network is slower than disk read
});

// ✅ Correct: respect write() return value
readable.on('data', (chunk) => {
  const ok = writable.write(chunk);
  if (!ok) {
    readable.pause(); // stop reading until writable drains
  }
});

writable.on('drain', () => {
  readable.resume(); // writable buffer drained — resume reading
});

// ✅✅ Best: pipe() or pipeline() handle this automatically
readable.pipe(writable);

// highWaterMark: the buffer size threshold in bytes (or objects for objectMode)
// Default: 16KB for binary, 16 objects for objectMode
// When buffer > highWaterMark: write() returns false (signal to pause)
// When buffer drains below highWaterMark: 'drain' event fires
```

---

## Q6: Output prediction — what is logged?

```javascript
const { Readable } = require('stream');

const readable = new Readable({
  read() {}
});

readable.push('a');
readable.push('b');
readable.push(null); // null signals end of stream

readable.on('data', (chunk) => console.log(chunk.toString()));
// What is logged?

// Answer: 'a', 'b' (two separate 'data' events in flowing mode)
// NOT 'ab' — each push() creates a separate chunk unless chunks are concatenated

// But with highWaterMark and timing, you might get batched chunks:
const readable2 = new Readable({ read() {}, highWaterMark: 10 });
readable2.push('hello');
readable2.push(' world');
readable2.push(null);

// If consumer is slower than producer, chunks may be batched.
// If you need full content: collect in array and join on 'end':
const chunks = [];
readable2.on('data', c => chunks.push(c));
readable2.on('end', () => console.log(Buffer.concat(chunks).toString())); // 'hello world'
```

---

## Q7: What is the difference between `destroy()` and `end()`?

```javascript
const writable = fs.createWriteStream('file.txt');

// end(): graceful — waits for buffered data to be flushed, then closes
writable.write('hello');
writable.end(); // flushes 'hello', then closes file descriptor
// 'finish' fires after all data is flushed

// destroy(): immediate — discards buffered data, closes immediately
writable.write('hello');
writable.destroy(); // 'hello' may NOT be written! file descriptor closed immediately
// 'close' fires (not 'finish' if data was discarded)

// destroy(error): same as destroy() but emits 'error' first:
readable.destroy(new Error('Upstream failed'));
// 'error' fires, then 'close'

// Use destroy() for: error cases, cancellation, when you don't care about data
// Use end() for: normal termination, ensuring all data is written
```

---

## Q8: Implement a Transform stream

```javascript
const { Transform } = require('stream');

// Transform stream that uppercases text:
class UpperCase extends Transform {
  _transform(chunk, encoding, callback) {
    // chunk is a Buffer (unless encoding is 'utf8' and decodeStrings: false)
    this.push(chunk.toString().toUpperCase());
    callback(); // signal that we're ready for more data

    // callback can also be called with an error:
    // callback(new Error('Transform failed'));

    // Or pass result directly to callback (shorthand):
    // callback(null, chunk.toString().toUpperCase());
  }

  _flush(callback) {
    // Called when all input has been consumed — last chance to push data
    this.push('\n[END]');
    callback();
  }
}

// Usage:
fs.createReadStream('input.txt')
  .pipe(new UpperCase())
  .pipe(fs.createWriteStream('output.txt'));

// objectMode Transform — input/output are objects, not Buffers:
class JSONParser extends Transform {
  constructor() {
    super({ readableObjectMode: true }); // output is objects
    this.buffer = '';
  }

  _transform(chunk, encoding, callback) {
    this.buffer += chunk.toString();
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? ''; // keep incomplete last line

    for (const line of lines) {
      if (line.trim()) {
        try {
          this.push(JSON.parse(line));
        } catch (err) {
          return callback(err);
        }
      }
    }
    callback();
  }

  _flush(callback) {
    if (this.buffer.trim()) {
      try {
        this.push(JSON.parse(this.buffer));
      } catch (err) {
        return callback(err);
      }
    }
    callback();
  }
}
```

---

## Q9: What is `objectMode` and when do you need it?

By default Node.js streams work with Buffers and strings because they were designed for binary and text I/O. `objectMode` lifts this restriction and allows any JavaScript value (plain objects, numbers, `null`-free arrays) to be pushed through the stream. This is particularly useful for building in-memory processing pipelines where you want the composable, backpressure-aware behavior of streams without dealing with serialization. The `highWaterMark` in object mode counts objects (not bytes), defaulting to 16 objects. You cannot mix object mode and binary mode directly in a pipeline — an intermediate Transform is needed to serialize or deserialize at the boundary.

```javascript
// Normal mode: streams work with Buffers and strings
// objectMode: streams work with any JavaScript value (objects, numbers, etc.)

const { Transform } = require('stream');

// objectMode Transform: receives objects, emits objects
const doubler = new Transform({
  objectMode: true,
  transform(obj, encoding, callback) {
    this.push({ ...obj, count: obj.count * 2 });
    callback();
  },
});

// Write objects:
doubler.write({ id: 1, count: 5 });
doubler.write({ id: 2, count: 3 });
doubler.end();

doubler.on('data', (obj) => console.log(obj));
// { id: 1, count: 10 }
// { id: 2, count: 6 }

// ⚠️ You can't mix objectMode and binary mode in a pipeline without a bridge:
// objectMode Readable → binary Writable → ❌ type error
// Must convert: objectMode Transform that serializes to Buffer

// highWaterMark in objectMode = number of OBJECTS (not bytes):
const t = new Transform({ objectMode: true, highWaterMark: 16 }); // 16 objects buffer
```

---

## Q10: Why does `process.stdout` never emit 'finish'?

`process.stdout` and `process.stderr` are special "non-closeable" streams. Unlike regular file or socket streams, calling `end()` on them is a no-op — they are designed to remain open for the entire lifetime of the process. This means any pipeline that terminates into `process.stdout` will not trigger normal stream lifecycle events like `'finish'`. Additionally, because `process.stdout` stays open as an active handle, the Node.js process itself will not exit naturally if you only close the source stream — you need to either call `process.exit()` explicitly or ensure all other active handles are closed.

```javascript
// process.stdout, process.stderr are special writable streams that
// are NOT closed when end() is called — they persist for the process lifetime.

process.stdout.write('hello\n');
process.stdout.end(); // does nothing — stdout is not closeable

// Similarly, process.stdin is a readable that stays open until closed by the OS.
// To detect end of stdin:
process.stdin.on('end', () => console.log('stdin closed'));
process.stdin.resume(); // put stdin in flowing mode

// ⚠️ If you pipe a readable to stdout, the stream stays open after the readable ends:
someReadable.pipe(process.stdout);
someReadable.on('end', () => console.log('Done reading')); // fires
// But process doesn't exit because stdout (and usually stdin) are still open

// To exit after piping, listen for the source's 'end':
someReadable.on('end', () => process.exit(0));
// Or use pipeline() — it won't close stdout but you can act on callback
```

---

## Quick Reference

```
Event         | Emitter   | When
'data'        | Readable  | chunk available in flowing mode
'end'         | Readable  | no more data to read
'readable'    | Readable  | buffer has data, ready for read() call (paused mode)
'finish'      | Writable  | all data flushed to destination
'drain'       | Writable  | internal buffer drained below highWaterMark
'close'       | Both      | underlying resource (fd) closed
'error'       | Both      | error occurred
'pipe'        | Writable  | a Readable was piped to this Writable
'unpipe'      | Writable  | a Readable was unpiped

pipe() vs pipeline():
  pipe():     no error propagation, no cleanup on error, returns destination
  pipeline(): cleanup on error, propagates errors, supports async generators (Node 16+)

Modes (Readable):
  null:  initial state (no consumers)
  true:  flowing — data emitted as 'data' events
  false: paused — must call read() manually

write() return value:
  true:  buffer below highWaterMark, safe to continue writing
  false: buffer full — wait for 'drain' before writing more
```
