# Buffers in Node.js

---

## What is a Buffer?

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
