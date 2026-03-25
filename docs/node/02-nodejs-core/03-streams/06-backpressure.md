# Backpressure in Node.js Streams

## What is Backpressure?

Backpressure occurs when a **writable stream can't consume data as fast as a readable produces it**. Without backpressure handling, data piles up in memory causing OOM crashes.

```
Without backpressure:
Readable (100MB/s) ───────────────────→ Writable (10MB/s)
                          ↑
                   Buffer grows unboundedly
                   → OOM crash
```

---

## How Node.js Handles Backpressure

Node.js signals backpressure through the return value of `writable.write()`. When the Writable's internal buffer grows beyond `highWaterMark`, `write()` returns `false` — this is the signal to the producer to pause. When the buffer drains below `highWaterMark`, the Writable emits `'drain'` — this is the signal to resume. The pattern is purely advisory: the stream will not throw or block if you ignore `false`, it will simply buffer indefinitely. Respecting this contract prevents OOM crashes when a slow consumer is paired with a fast producer.

```javascript
const writable = fs.createWriteStream('output.txt');

// ✅ Respecting backpressure:
function writeWithBackpressure(readable, writable) {
  readable.on('data', (chunk) => {
    const canContinue = writable.write(chunk);

    if (!canContinue) {
      // Buffer full — pause the readable!
      readable.pause();

      // Resume when writable drains its buffer:
      writable.once('drain', () => {
        readable.resume();
      });
    }
  });

  readable.on('end', () => writable.end());
}
```

---

## pipe() Handles Backpressure Automatically

`.pipe()` does the above automatically:

```javascript
// ✅ pipe manages backpressure:
readable.pipe(writable);
// - Pauses readable when writable returns false
// - Resumes readable on drain
// - Ends writable when readable ends
```

**But pipe has a flaw — it doesn't forward errors!**

```javascript
// ❌ Error in readable kills it but writable stays open
readable.pipe(writable);
readable.on('error', (err) => {
  writable.destroy(err); // must manually handle!
});
```

---

## stream.pipeline() — The Right Way

`stream.pipeline()` is the correct, modern replacement for manual `pipe()` chains. It solves two critical shortcomings of `.pipe()`: error propagation and cleanup. With raw `.pipe()`, if any stream in the chain errors, the others are not automatically destroyed — you get resource leaks (open file descriptors, lingering network connections). `stream.pipeline()` listens for errors on every stream in the chain and calls `destroy()` on all of them when any one fails. It also calls the completion callback with the error, giving you a single place to handle failure for the entire pipeline.

```javascript
const { pipeline } = require('stream');
const { promisify } = require('util');
const pipelineAsync = promisify(pipeline);

// Handles errors AND cleans up all streams:
await pipelineAsync(
  fs.createReadStream('input.txt'),
  zlib.createGzip(),
  fs.createWriteStream('output.txt.gz')
);
// If ANY stream errors → all streams destroyed, error propagated
```

---

## Demonstrating Backpressure Problem

The backpressure problem is easy to miss in development because it only manifests under load, when the writable cannot keep up with the readable. In a local test with a fast disk, both streams run at similar speeds and no buffer ever grows large. In production — reading from a fast SSD and writing over a slow network connection, or piping to a database that becomes loaded — the readable outpaces the writable and memory usage climbs until the process is OOM-killed.

```javascript
// ❌ Ignoring backpressure — memory explosion
const readable = getHugeReadable(); // 10GB source
const writable = fs.createWriteStream('output.txt');

readable.on('data', chunk => {
  writable.write(chunk); // ignoring return value!
  // writable can't keep up → internal buffer grows → OOM!
});
```

---

## Interview Questions

**Q: What is backpressure and why does it matter?**
A: Backpressure is when a writable stream's buffer fills up because data arrives faster than it can be processed/flushed. Without handling it, the internal buffer grows unboundedly causing OOM crashes. Backpressure is signaled by `.write()` returning `false`; the producer should pause until the `drain` event fires.

**Q: Why use `stream.pipeline()` instead of `.pipe()`?**
A: `.pipe()` doesn't forward errors between streams — if the readable errors, the writable is left open. `stream.pipeline()` properly handles errors from any stream in the chain, destroys all streams, and calls a completion callback. It's the recommended approach.

**Q: How does `.pipe()` handle backpressure?**
A: `.pipe()` listens to `write()` return value. When it returns `false` (buffer full), it calls `readable.pause()`. When the writable emits `drain` (buffer emptied), it calls `readable.resume()`. This is the standard backpressure pattern, automated.
