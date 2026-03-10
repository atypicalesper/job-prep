# Node.js Anti-Patterns and Common Mistakes

Senior engineers are expected to spot these in code reviews.

---

## 1. Blocking the Event Loop

```javascript
// ❌ Synchronous operations on the main thread:
app.get('/users', (req, res) => {
  // Blocks ALL requests for the duration:
  const data = fs.readFileSync('./large-file.json');          // sync I/O
  const parsed = JSON.parse(data);                            // fine if small
  const sorted = parsed.sort((a, b) => a.name.localeCompare(b.name)); // fine
  res.json(sorted);
});

// ❌ Regex that can backtrack catastrophically (ReDoS):
// Pattern: (a+)+ — exponential backtracking on input 'aaaaX'
app.post('/validate', (req, res) => {
  if (/^(a+)+$/.test(req.body.input)) { // blocks event loop for malicious input
    res.json({ valid: true });
  }
});

// ❌ JSON.parse on huge payloads in route handlers:
app.post('/import', express.json({ limit: '100mb' }), (req, res) => {
  // 100MB JSON parse blocks event loop for seconds
  const records = req.body.records; // already parsed — but parsing happened synchronously
});

// ✅ Fix: stream processing for large data, Worker Threads for CPU work:
app.post('/import', express.raw({ type: 'application/json', limit: '100mb' }), async (req, res) => {
  // Offload JSON parse to worker:
  const records = await runInWorker(() => JSON.parse(req.body.toString()));
  res.json({ imported: records.length });
});
```

---

## 2. Unhandled Promise Rejections

```javascript
// ❌ Fire-and-forget without error handling:
app.post('/send-email', async (req, res) => {
  sendEmail(req.body.to, req.body.subject); // not awaited, not caught!
  // If sendEmail rejects → unhandledRejection → process crash (Node 15+)
  res.json({ queued: true });
});

// ❌ Missing catch in promise chains:
db.query('SELECT * FROM users')
  .then(users => processUsers(users))
  // No .catch() — rejection swallowed or crashes

// ❌ async function called without await or catch:
function scheduleWork() {
  doAsyncWork(); // no await, no .catch()
}

// ✅ Fix: always handle rejections:
app.post('/send-email', async (req, res) => {
  sendEmail(req.body.to, req.body.subject).catch((err) => {
    logger.error('Background email failed', err);
    // Optionally: add to retry queue
  });
  res.json({ queued: true });
});

// ✅ Global safety net (not a substitute for proper handling):
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason }, 'Unhandled promise rejection');
  // In production: alert, then gracefully shut down
});
```

---

## 3. Memory Leaks from Event Listeners

```javascript
// ❌ Adding listeners inside request handlers — never removed:
app.get('/stream', (req, res) => {
  eventEmitter.on('data', (data) => {  // adds new listener on EVERY request!
    res.write(data);
  });
  // After 1000 requests: 1000 listeners, MaxListenersExceededWarning
});

// ❌ Adding listeners in loops:
for (const service of services) {
  service.on('error', handleError); // if called multiple times, multiplies
}

// ✅ Fix: use once(), remove on cleanup, or check before adding:
app.get('/stream', (req, res) => {
  const handler = (data) => res.write(data);
  eventEmitter.on('data', handler);

  req.on('close', () => {
    eventEmitter.off('data', handler); // clean up when request ends
  });
});

// ✅ Listener per connection, not global:
wss.on('connection', (ws) => {
  // This handler is scoped to this connection — not global
  ws.on('message', handleMessage);
  ws.on('close', cleanup);
});
```

---

## 4. Callback Hell / Promise Anti-patterns

```javascript
// ❌ Nested callbacks:
db.getUser(id, (err, user) => {
  if (err) return handleError(err);
  db.getOrders(user.id, (err, orders) => {
    if (err) return handleError(err);
    db.getProducts(orders, (err, products) => {
      if (err) return handleError(err);
      res.json({ user, orders, products });
    });
  });
});

// ❌ Creating unnecessary Promise wrappers:
function getUser(id) {
  return new Promise((resolve, reject) => {
    // If db.getUser already returns a Promise, this is useless wrapping:
    db.getUser(id).then(resolve).catch(reject);
  });
}

// ❌ Sequential when parallel is fine:
const user = await getUser(id);
const config = await getConfig();     // doesn't depend on user!
const settings = await getSettings(); // doesn't depend on user or config!
// Total time = user + config + settings

// ✅ Fix: async/await with proper parallelism:
const [user, config, settings] = await Promise.all([
  getUser(id),
  getConfig(),
  getSettings(),
]);
// Total time = max(user, config, settings)
```

---

## 5. Incorrect Error Handling in async/await

```javascript
// ❌ Swallowing errors with empty catch:
async function getUser(id) {
  try {
    return await db.findUser(id);
  } catch (err) {
    // Returning undefined instead of propagating — caller can't tell it failed
    return null;
  }
}

// ❌ Not distinguishing error types:
async function processPayment(data) {
  try {
    return await paymentGateway.charge(data);
  } catch (err) {
    throw new Error('Payment failed'); // loses original error context!
  }
}

// ❌ async/await with forEach — errors swallowed:
await items.forEach(async (item) => {
  await processItem(item); // errors here are lost! forEach ignores Promise return
});

// ✅ Fix: re-throw with context, use for..of or Promise.all:
async function processPayment(data) {
  try {
    return await paymentGateway.charge(data);
  } catch (err) {
    // Preserve original error, add context:
    throw Object.assign(new Error('Payment failed'), { cause: err, data });
  }
}

// ✅ Correct async iteration:
for (const item of items) {
  await processItem(item); // errors properly propagate
}
// Or with concurrency:
await Promise.all(items.map(item => processItem(item)));
```

---

## 6. N+1 Queries

```javascript
// ❌ Classic N+1:
const users = await db.query('SELECT * FROM users LIMIT 10'); // 1 query
for (const user of users) {
  user.posts = await db.query(            // 10 queries!
    'SELECT * FROM posts WHERE user_id = $1', [user.id]
  );
}
// Total: 11 queries

// ✅ Fix: JOIN or WHERE IN:
const users = await db.query(`
  SELECT u.*, json_agg(p.*) as posts
  FROM users u
  LEFT JOIN posts p ON p.user_id = u.id
  GROUP BY u.id
  LIMIT 10
`);
// Total: 1 query

// ✅ Or with separate query (better for large datasets):
const users = await db.query('SELECT * FROM users LIMIT 10');
const userIds = users.map(u => u.id);
const posts = await db.query(
  'SELECT * FROM posts WHERE user_id = ANY($1)', [userIds]
);
// Group posts by userId and attach:
const postsByUser = posts.reduce((acc, post) => {
  (acc[post.user_id] ??= []).push(post);
  return acc;
}, {});
users.forEach(u => { u.posts = postsByUser[u.id] ?? []; });
// Total: 2 queries regardless of user count
```

---

## 7. Mutating Shared State Across Requests

```javascript
// ❌ Shared mutable state — race condition between requests:
let requestCount = 0;  // shared state — fine for a counter, dangerous for user data

const cache = {};
app.get('/user/:id', async (req, res) => {
  if (!cache[req.params.id]) {
    const user = await db.getUser(req.params.id);
    cache[req.params.id] = user;  // grows unbounded — memory leak!
  }
  res.json(cache[req.params.id]);
});

// ❌ Array.prototype mutation (prototype pollution risk):
// app.use((req, res, next) => {
//   Array.prototype.flat = ... // pollutes ALL arrays in ALL requests
// });

// ✅ Fix: use proper caching with TTL, avoid module-level mutable state for request data:
import { LRUCache } from 'lru-cache';
const cache = new LRUCache({ max: 1000, ttl: 1000 * 60 * 5 }); // 5 min TTL

app.get('/user/:id', async (req, res) => {
  const cached = cache.get(req.params.id);
  if (cached) return res.json(cached);

  const user = await db.getUser(req.params.id);
  cache.set(req.params.id, user);
  res.json(user);
});
```

---

## 8. require() Inside Functions (Module Loading Anti-patterns)

```javascript
// ❌ require() inside hot paths — slow synchronous I/O on first call:
app.get('/pdf', async (req, res) => {
  const puppeteer = require('puppeteer'); // slow! synchronous fs read + parse
  // ...
});

// ❌ Circular requires leading to empty object:
// a.js: const b = require('./b'); console.log(b.value); // undefined!
// b.js: const a = require('./a'); module.exports = { value: 42 };
// When a.js requires b.js, b.js requires a.js (still loading) → gets {}

// ✅ Fix: top-level imports:
import puppeteer from 'puppeteer'; // loaded once at startup

// ✅ For truly optional/lazy modules (rare legitimate case):
let _puppeteer: any;
function getPuppeteer() {
  if (!_puppeteer) _puppeteer = require('puppeteer');
  return _puppeteer;
}
```

---

## 9. Not Respecting Backpressure

```javascript
// ❌ Piping without backpressure — can crash with large files:
app.get('/download', (req, res) => {
  const readable = fs.createReadStream('./huge-file.zip');
  readable.on('data', (chunk) => {
    res.write(chunk); // doesn't wait for write to drain!
    // If network is slow, data piles up in memory
  });
  readable.on('end', () => res.end());
});

// ✅ Fix: use pipe() or pipeline() — handles backpressure automatically:
app.get('/download', (req, res) => {
  const readable = fs.createReadStream('./huge-file.zip');
  pipeline(readable, res, (err) => {
    if (err && !res.headersSent) {
      res.status(500).end();
    }
  });
});
```

---

## 10. Ignoring Process Signals / No Graceful Shutdown

```javascript
// ❌ Process exits abruptly — in-flight requests dropped, DB connections leaked:
// (no SIGTERM handler)
// When container/PM2 stops: connections cut mid-request, data corruption risk

// ✅ Fix: handle SIGTERM gracefully:
const server = app.listen(3000);

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');

  // Stop accepting new connections:
  server.close(async () => {
    // Drain in-flight requests, close DB/Redis connections:
    await db.$disconnect();
    await redis.quit();
    logger.info('Graceful shutdown complete');
    process.exit(0);
  });

  // Force shutdown after 30s (before k8s kills with SIGKILL):
  setTimeout(() => {
    logger.error('Graceful shutdown timeout, forcing exit');
    process.exit(1);
  }, 30_000).unref();
});
```

---

## Quick Reference: Patterns to Flag in Code Review

| Anti-pattern | Symptom | Fix |
|---|---|---|
| Sync I/O in request handler | `readFileSync`, `execSync` | Use async versions or workers |
| Unhandled rejection | Missing `.catch()` or try/catch | Always handle or propagate |
| Listener leak | Listener count grows with requests | Remove listeners on cleanup |
| N+1 queries | Loop with `await db.query` | JOIN or WHERE IN |
| Sequential where parallel OK | Serial `await` on independent ops | `Promise.all` |
| Empty catch | `catch(err) {}` | Re-throw or log with context |
| Unbounded cache | `cache[key] = value` in module scope | LRU with size + TTL |
| No graceful shutdown | No SIGTERM handler | Handle SIGTERM, close server first |
| Backpressure ignored | Manual `read.on('data', write)` | Use `pipeline()` |
| `require()` in hot path | Inside route handlers | Top-level imports |
