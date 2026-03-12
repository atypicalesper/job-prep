# Node.js v20–v22 Modern Features

## Node.js Release Schedule

```
v20 (LTS) — Oct 2023 → Active LTS until Apr 2026
v21       — Oct 2023 → Current (short-term, EOL Apr 2024)
v22 (LTS) — Oct 2024 → Active LTS until Apr 2027
v23       — Oct 2024 → Current
```

Always target an LTS version for production.

---

## 1. Built-in Test Runner (`node:test`) — v18+ stable, v20 improved

No more Jest/Mocha required for simple tests:

```js
// test/math.test.js
const { test, describe, it, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');

describe('add()', () => {
  it('adds two positive numbers', () => {
    assert.equal(add(2, 3), 5);
  });

  it('handles negative numbers', () => {
    assert.equal(add(-1, 1), 0);
  });
});

// Async tests
test('fetches user', async (t) => {
  const user = await fetchUser(1);
  assert.deepEqual(user, { id: 1, name: 'Alice' });
});

// Mocking
test('calls db', (t) => {
  const dbQuery = t.mock.fn(() => Promise.resolve({ rows: [] }));
  // t.mock.fn creates a mock function with call tracking
  assert.equal(dbQuery.mock.calls.length, 0);
  dbQuery();
  assert.equal(dbQuery.mock.calls.length, 1);
});

// Built-in code coverage (v22+)
// node --test --experimental-test-coverage test/**/*.test.js
```

```bash
# Run tests
node --test test/**/*.test.js

# Watch mode (v22+)
node --test --watch test/**/*.test.js

# With coverage
node --test --experimental-test-coverage test/**/*.test.js
```

---

## 2. Native `.env` File Loading — v20.6+

```bash
# .env
DATABASE_URL=postgres://localhost:5432/mydb
PORT=3000
NODE_ENV=development
```

```bash
# No dotenv package needed!
node --env-file=.env src/server.js

# Multiple env files (later files override earlier)
node --env-file=.env --env-file=.env.local src/server.js
```

```js
// Access as normal
console.log(process.env.DATABASE_URL); // postgres://localhost:5432/mydb
console.log(process.env.PORT);         // '3000'
```

---

## 3. `fetch` — Stable in v21, Unflagged v18+

```js
// No node-fetch needed in Node.js v18+
const response = await fetch('https://api.example.com/users');
const users = await response.json();

// With options
const result = await fetch('https://api.example.com/orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ amount: 99 }),
  signal: AbortSignal.timeout(5000), // timeout after 5s
});

if (!result.ok) {
  throw new Error(`HTTP ${result.status}: ${await result.text()}`);
}

// Streaming response
const stream = result.body; // ReadableStream
const reader = stream.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  process.stdout.write(value); // value is Uint8Array
}
```

---

## 4. `AbortController` / `AbortSignal` — v15+, enhanced v20+

```js
// Cancel async operations
const controller = new AbortController();
const { signal } = controller;

// Timeout signal (v17.3+)
const timeoutSignal = AbortSignal.timeout(3000); // auto-aborts after 3s

// Any signal (v20+) — abort when first signal fires
const anySignal = AbortSignal.any([signal, timeoutSignal]);

// Use with fetch
try {
  const res = await fetch(url, { signal: anySignal });
} catch (err) {
  if (err.name === 'AbortError') console.log('Request cancelled');
  else throw err;
}

// Use with streams
import { pipeline } from 'node:stream/promises';
await pipeline(sourceStream, transformStream, destStream, { signal });

// Cancel from outside
setTimeout(() => controller.abort(new Error('User cancelled')), 1000);
```

---

## 5. `--watch` Mode — v18.11+

```bash
# Restart server on file changes (no nodemon needed!)
node --watch src/server.js

# Only watch specific files
node --watch-path=src --watch-path=config src/server.js
```

---

## 6. Web Crypto API — v19+ (stable)

```js
const { subtle, getRandomValues } = require('node:crypto').webcrypto;

// Hashing
const hash = await subtle.digest('SHA-256', Buffer.from('hello world'));
const hex = Buffer.from(hash).toString('hex');
// 'b94d27b9934d3e08a52e52d7da7dabfac484efe04294e576b26b24b2...'

// AES-GCM encryption
const key = await subtle.generateKey(
  { name: 'AES-GCM', length: 256 },
  true, // extractable
  ['encrypt', 'decrypt']
);

const iv = getRandomValues(new Uint8Array(12));
const encrypted = await subtle.encrypt(
  { name: 'AES-GCM', iv },
  key,
  Buffer.from('secret message')
);

const decrypted = await subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
console.log(Buffer.from(decrypted).toString()); // 'secret message'
```

---

## 7. `node:sqlite` — v22.5+ (experimental)

Built-in SQLite without `better-sqlite3`:

```js
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(':memory:'); // or file path
db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)`);

const insert = db.prepare('INSERT INTO users (name) VALUES (?)');
insert.run('Alice');
insert.run('Bob');

const rows = db.prepare('SELECT * FROM users').all();
console.log(rows); // [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]

db.close();
```

---

## 8. Explicit Resource Management — v22+ (with `--harmony-explicit-resource-management`)

The `using` / `await using` keywords from TC39:

```js
// Automatic cleanup with Symbol.dispose / Symbol.asyncDispose
class DatabaseConnection {
  constructor() { this.conn = openConnection(); }
  [Symbol.asyncDispose]() { return this.conn.close(); }
}

async function processOrders() {
  await using db = new DatabaseConnection();
  // db.conn.close() called automatically when block exits, even on error
  const orders = await db.conn.query('SELECT * FROM orders');
  return orders;
}
```

---

## 9. `node:diagnostics_channel` — v15+, stable v19+

Publish/subscribe diagnostic events within Node.js (used by OTel instrumentation):

```js
const diagnostics = require('node:diagnostics_channel');

// Create a channel
const channel = diagnostics.channel('my-app:http-request');

// Subscriber (e.g., in monitoring layer)
diagnostics.subscribe('my-app:http-request', (data) => {
  console.log(`Request to ${data.url} took ${data.duration}ms`);
});

// Publisher (in request handler)
async function makeRequest(url) {
  const start = Date.now();
  const result = await fetch(url);
  channel.publish({ url, status: result.status, duration: Date.now() - start });
  return result;
}
```

---

## 10. `node:path` / `node:url` Improvements

```js
// URL path operations with import.meta (ESM)
import { fileURLToPath } from 'node:url';
import { dirname, join } = from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Or in Node 21+ with import.meta.dirname
const dir = import.meta.dirname; // directly available
```

---

## Quick Feature Matrix

| Feature | Version | Notes |
|---|---|---|
| `node:test` stable | v18 | Built-in test runner |
| `fetch` unflagged | v18 | Web-compatible fetch |
| `--watch` mode | v18.11 | Replaces nodemon for simple cases |
| `--env-file` | v20.6 | Replaces dotenv for simple cases |
| `AbortSignal.timeout` | v17.3 | |
| `AbortSignal.any` | v20 | |
| `node:test` coverage | v22 | `--experimental-test-coverage` |
| `node:sqlite` | v22.5 | Experimental |
| `import.meta.dirname` | v21.2 | ESM equivalent of `__dirname` |
| Explicit resource management | v22 | `using` keyword |
