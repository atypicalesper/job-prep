# Buffers in Node.js

---

## What is a Buffer?

A Buffer is a fixed-size region of raw memory allocated outside the V8 heap, managed directly by Node.js via libuv and C++. Because JavaScript strings are UTF-16 and the heap is garbage-collected, they are a poor fit for binary I/O: file reads, network packets, and cryptographic operations all produce raw bytes. Buffers exist to hold that binary data efficiently without encoding overhead or GC pressure. The key mental model is that a Buffer is essentially a `Uint8Array` with extra Node.js-specific convenience methods — every byte is an integer from 0–255. Use `Buffer.alloc` when safety matters and `Buffer.allocUnsafe` only when you are immediately overwriting every byte yourself for maximum performance.

```javascript
// Buffer = fixed-size chunk of binary data (raw bytes)
// Lives OUTSIDE V8 heap — managed by libuv/C++
// Useful for: file I/O, network data, cryptography, binary protocols

// Creating buffers:
const b1 = Buffer.alloc(10);               // 10 bytes, zero-filled ✅ safe
const b2 = Buffer.allocUnsafe(10);         // 10 bytes, may contain old data ❌
const b3 = Buffer.from('hello', 'utf8');   // from string
const b4 = Buffer.from([0x48, 0x65, 0x6c]); // from array of bytes
const b5 = Buffer.from(b3);               // copy of another buffer

console.log(b3.toString('utf8'));  // 'hello'
console.log(b3.toString('hex'));   // '68656c6c6f'
console.log(b3.toString('base64')); // 'aGVsbG8='
```

---

## Encodings

An encoding is a mapping between raw bytes and a human-readable character representation. Node.js needs to know the encoding when converting between a Buffer and a string — using the wrong encoding corrupts data. The most important choices in practice are `utf8` (the safe default for text), `base64` / `base64url` (for sending binary through text channels such as JWT headers or data URIs), and `hex` (for debugging or cryptographic output). The `base64url` variant replaces `+`, `/`, and `=` padding with URL-safe characters, making it directly embeddable in query strings and HTTP headers.

```javascript
// Supported encodings:
// utf8 (default), utf16le, latin1, ascii, base64, base64url, hex, binary

const buf = Buffer.from('Hello, World!', 'utf8');

// Convert between encodings:
const hex    = buf.toString('hex');    // '48656c6c6f2c...'
const b64    = buf.toString('base64'); // 'SGVsbG8sIFdvcmxkIQ=='
const binary = buf.toString('binary'); // raw bytes as string

// Useful for base64url (JWT, safe for URLs):
const encoded = Buffer.from(json).toString('base64url'); // no +, /, = padding

// Read/write specific values:
const buf2 = Buffer.alloc(8);
buf2.writeUInt32LE(42, 0);       // write 4-byte uint at offset 0 (little-endian)
buf2.writeUInt32LE(1000, 4);     // write at offset 4
console.log(buf2.readUInt32LE(0)); // 42
console.log(buf2.readUInt32LE(4)); // 1000
```

---

## Buffer vs TypedArray

Node.js `Buffer` is a subclass of `Uint8Array`, which means every Buffer is also a valid TypedArray and shares the same underlying `ArrayBuffer`. This matters because the Web Platform APIs (WebCrypto, `fetch`, `ReadableStream`) speak `Uint8Array`, while Node.js I/O APIs (fs, net, http) speak `Buffer`. Understanding the shared-memory relationship prevents unnecessary copies: a slice or subarray view points into the same bytes without allocation. Prefer `Buffer` in pure Node.js code for its extra methods (`toString`, `readInt32BE`, `indexOf`), and use `Uint8Array` when writing isomorphic code that must also run in browsers or Deno.

```javascript
// Buffer extends Uint8Array — fully compatible
const buf = Buffer.from([1, 2, 3]);
const uint8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
// Same underlying memory!

// Node.js Buffer has extra convenience methods:
buf.toString('utf8');      // TypedArray doesn't have this
buf.writeInt32BE(val, offset); // BE = big-endian, LE = little-endian
buf.indexOf('ello');
buf.includes(0x65);        // includes byte value

// Interop with WebCrypto, HTTP, fs — they all use Buffer/Uint8Array
```

---

## Common Buffer Operations

These are the day-to-day operations for assembling, slicing, and comparing binary data. The most critical gotcha is that `slice` and `subarray` return a *view* — they share the underlying memory with the original buffer, so mutating one mutates the other. When you need an independent copy, wrap the slice in `Buffer.from(...)`. `Buffer.concat` is the correct way to assemble multiple chunks (e.g., from a stream) into a single buffer; avoid repeated string concatenation, which creates unnecessary intermediate allocations.

```javascript
// Concatenate:
const chunks = [Buffer.from('Hello'), Buffer.from(' '), Buffer.from('World')];
const combined = Buffer.concat(chunks); // 'Hello World'

// Slice (shares memory!):
const original = Buffer.from('Hello World');
const slice = original.slice(0, 5); // 'Hello'
slice[0] = 0x4A; // 'J' — modifies original too!
// Use copy() if you need independent copy:
const copy = Buffer.from(original.slice(0, 5)); // independent

// Compare:
const a = Buffer.from('abc');
const b = Buffer.from('abd');
console.log(Buffer.compare(a, b)); // -1 (a < b), 0 (equal), 1 (a > b)

// Fill:
const buf = Buffer.alloc(10);
buf.fill(0x41); // fill with 'A'
console.log(buf.toString()); // 'AAAAAAAAAA'
```

---

## Streams and Buffers

Node.js streams emit data as `Buffer` chunks rather than whole files, which means large files or HTTP request bodies never fully occupy memory at once. The pattern is to collect chunks in an array and call `Buffer.concat` only at the end, or better yet, use `pipe`/`pipeline` to avoid manual assembly entirely. Understanding this connection is essential for writing correct upload handlers, streaming JSON parsers, or any code that processes data incrementally.

```javascript
// Streams emit/consume Buffers:
const readable = fs.createReadStream('file.txt', {
  highWaterMark: 64 * 1024, // chunk size in bytes (64KB default)
  encoding: 'utf8'          // auto-converts Buffer chunks to strings
});

const chunks: Buffer[] = [];
readable.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
readable.on('end', () => {
  const full = Buffer.concat(chunks);
  console.log(full.toString('utf8'));
});

// HTTP response body assembly:
app.post('/upload', (req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    const data = JSON.parse(body);
    // process data
    res.json({ received: true });
  });
});

// Better: use express.json() middleware or body-parser
```

---

## Security: Buffer Timing Attack Prevention

Comparing secret values with the `===` operator is a security vulnerability. JavaScript string and buffer equality short-circuits on the first mismatched byte, so an attacker who can measure response time can infer correct characters one by one. This class of attack is called a timing side-channel. `crypto.timingSafeEqual` runs in constant time regardless of where the mismatch occurs, eliminating the signal. Always use it when comparing API keys, tokens, HMAC digests, or any value derived from a secret. The function requires both buffers to be the same length — check that first separately (with a fixed non-leaking response).

```javascript
// ❌ String comparison — timing attack vulnerable:
function verifyToken(provided: string, expected: string) {
  return provided === expected;
  // Returns false faster when first char differs!
  // Attacker can infer correct chars by measuring response time
}

// ✅ Constant-time comparison:
import crypto from 'crypto';

function verifyToken(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);

  // timingSafeEqual requires same length:
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

// Use for: API keys, session tokens, HMAC signatures
// Any secret comparison should be constant-time
```

---

## Interview Questions

**Q: Why does `Buffer.allocUnsafe` exist if it's unsafe?**
A: It's faster — it skips zeroing the memory. If you're immediately going to fill the buffer yourself (e.g., copy data into it right away), the zero-fill is wasted work. In performance-critical code where you control the buffer lifecycle, it's fine. Never expose an `allocUnsafe` buffer's contents to untrusted parties without filling it first.

**Q: What is the difference between `buffer.slice` and `buffer.subarray`?**
A: Both return a view into the same underlying memory (changes affect original). `slice` (deprecated name) and `subarray` behave identically in modern Node.js. `Buffer.from(buffer.subarray(0, 5))` creates an independent copy. Note: `Array.slice` creates a copy, `Buffer.slice` does NOT — different semantics!

**Q: When would you use `Buffer.concat` vs concatenating strings?**
A: When working with binary data or when you're assembling chunks from a stream. String concatenation with `+=` creates many intermediate strings. `Buffer.concat([...chunks])` efficiently creates one final buffer. Converting to string only at the end is more efficient than converting each chunk.
