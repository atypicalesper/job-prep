# Node.js v20–v22 Modern Features

## Node.js Release Schedule

Node.js follows a predictable release cadence: a new major version is published every October, alternating between Long Term Support (LTS) and Current releases. Even-numbered versions (18, 20, 22) become LTS and receive security and bug-fix maintenance for three years, making them the only versions appropriate for production systems. Odd-numbered versions (19, 21, 23) are short-lived Current releases that exist to ship new features and receive active development for only six months — they are for early adopters and experimentation, not production workloads. Always pin to an LTS version in `package.json` engines and deployment configurations.

```
v20 (LTS) — Oct 2023 → Active LTS until Apr 2026
v21       — Oct 2023 → Current (short-term, EOL Apr 2024)
v22 (LTS) — Oct 2024 → Active LTS until Apr 2027
v23       — Oct 2024 → Current
```

Always target an LTS version for production.

---

## 1. Built-in Test Runner (`node:test`) — v18+ stable, v20 improved

`node:test` is Node.js's built-in test framework, providing `describe`/`it`/`test` structure, async test support, mocking, and (from v22) code coverage — all with zero dependencies. It removes the need to add Jest or Mocha for unit tests in simple projects, library packages, or CI pipelines where a lightweight runner is preferable. The `node --test` CLI integrates with the standard test reporter format. Use a full framework like Jest when you need snapshot testing, extensive mocking ecosystem, or team familiarity outweighs the dependency cost; use `node:test` for new projects where minimising dependencies is a priority.

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

Node.js v20.6 added the `--env-file` flag, which reads a `.env` file and populates `process.env` before your application code runs — the same behaviour as the popular `dotenv` package. This eliminates `dotenv` as a runtime dependency for the common case of loading environment variables from a file. Multiple `--env-file` flags can be chained, with later files overriding earlier ones, enabling the `--env-file=.env --env-file=.env.local` pattern for local overrides. Use `dotenv` when you need programmatic loading at a specific point in execution, or when targeting older Node.js versions.

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

Node.js v18 unflagged the built-in `fetch` API, which is powered by the `undici` HTTP client under the hood. This provides a browser-compatible `fetch` globally available without any package import, enabling isomorphic code that runs both in Node.js and browsers without conditional imports. `AbortSignal.timeout(ms)` (v17.3+) is the idiomatic way to add request timeouts. The native `fetch` is suitable for most HTTP client needs; use `undici` directly or `axios` when you need advanced features like interceptors, automatic retries, or custom connection pooling beyond what `fetch` exposes.

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

`AbortController` / `AbortSignal` is the standard Web Platform API for cancelling async operations. A signal can be passed to `fetch`, stream `pipeline`, `fs.readFile`, and other Node.js APIs to cancel them in flight when the signal fires. `AbortSignal.timeout(ms)` creates a signal that auto-aborts after the specified duration without needing a `setTimeout` + `clearTimeout` pair. `AbortSignal.any([...signals])` (v20+) combines multiple signals and fires when the first one aborts — useful for composing a user-cancellation signal with a timeout signal. Prefer signals over raw timeouts for all async work that should be cancellable.

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

`node --watch` restarts the process whenever a required file changes, providing the core functionality of `nodemon` without an additional package. It watches only files that were actually `require`d or `import`ed, avoiding spurious restarts from changes in unrelated directories. Use it for development servers and scripts where you want instant feedback on changes. For more control over watch paths, debouncing, or complex restart logic, `nodemon` or a task runner like `tsx --watch` remains preferable.

```bash
# Restart server on file changes (no nodemon needed!)
node --watch src/server.js

# Only watch specific files
node --watch-path=src --watch-path=config src/server.js
```

---

## 6. Web Crypto API — v19+ (stable)

The Web Crypto API (`crypto.webcrypto`) is the browser-standard cryptography interface, providing hashing, symmetric encryption (AES-GCM), asymmetric operations (ECDSA, RSA-OAEP), and key derivation (PBKDF2, HKDF) through a Promise-based API. Using `webcrypto` instead of the legacy `crypto` module produces isomorphic code that runs in Node.js, browsers, Cloudflare Workers, and Deno without modification. The underlying implementation is the same native OpenSSL code as the `crypto` module — the API surface is just standardised. Prefer `webcrypto` for new code; use `crypto` directly for legacy APIs like `crypto.createHash` that have no WebCrypto equivalent.

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

Node.js v22.5 added a built-in synchronous SQLite driver (`node:sqlite`), eliminating the need for `better-sqlite3` or `sqlite3` native addons for lightweight embedded database use cases. It exposes a synchronous API (like `better-sqlite3`) rather than async, which is appropriate for SQLite's single-writer model and avoids event loop overhead for the typically fast in-process operations. Being built-in means no native build step and no version compatibility issues with Node.js upgrades. It is experimental as of v22 — use `better-sqlite3` for production until it stabilises.

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

Explicit Resource Management (`using` / `await using`) is a TC39 proposal that brings deterministic cleanup to JavaScript, similar to `using` in C#, `with` in Python, or RAII in C++. Any object that implements `Symbol.dispose` (sync) or `Symbol.asyncDispose` (async) is automatically cleaned up when the `using`-declared variable leaves scope — even if an exception is thrown. This solves the perennial problem of resource leaks in early-return or error paths where `finally` blocks can be forgotten. Database connections, file handles, timers, and network connections are all natural candidates.

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

`diagnostics_channel` provides a lightweight pub/sub bus for publishing structured diagnostic events within a Node.js process, without coupling the publisher to any specific monitoring library. Publishers create named channels and emit data objects; subscribers (typically monitoring/instrumentation layers) listen to those channels and extract metrics or traces. This is the mechanism OpenTelemetry's auto-instrumentation uses to hook into Node.js built-ins like `http`, `undici`, and `pg` without modifying their source. Use it to expose internal application events (slow queries, cache hits, background job completions) that observability tooling can subscribe to without application code changes.

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

ESM modules do not have `__dirname` or `__filename` because they are injected by the CommonJS module wrapper, which does not apply to ESM. The `import.meta.url` property provides the current module's URL as a `file://` string, which must be converted to a filesystem path using `fileURLToPath`. Node.js v21.2+ added `import.meta.dirname` and `import.meta.filename` as direct equivalents that eliminate the `fileURLToPath` / `dirname` boilerplate in modern codebases. Prefer `import.meta.dirname` in new code targeting Node 22+ and use the `fileURLToPath` pattern for compatibility with Node 18/20.

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
