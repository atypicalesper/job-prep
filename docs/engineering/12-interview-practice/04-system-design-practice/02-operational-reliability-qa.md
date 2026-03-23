# Operational Reliability — Interview Q&A

Deep-dive answers for production-readiness and reliability questions common at senior / SDE3 interviews.

---

## "How Do You Handle Server Downtime?"

This question tests whether you design for failure by default, not as an afterthought.

### Layer 1 — Process Crashes: PM2 Cluster Mode

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'api',
    script: 'dist/index.js',
    instances: 'max',        // one per CPU core
    exec_mode: 'cluster',    // share port across workers
    autorestart: true,
    max_restarts: 10,
    min_uptime: '5s',        // don't count crash if process dies in < 5s
    restart_delay: 1000,     // wait 1s between restarts
    watch: false,            // never watch in prod
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
  }],
};

// pm2 start ecosystem.config.js --env production
// pm2 monit   ← live CPU/memory/logs
// pm2 logs    ← aggregated log stream
```

When one worker crashes, PM2 restarts it. The other workers keep serving traffic. Zero downtime for single-process crashes.

### Layer 2 — Graceful Shutdown (SIGTERM)

```javascript
// When a load balancer removes a server from rotation, it sends SIGTERM.
// The process should drain in-flight requests before exiting.

const server = app.listen(PORT);

let shuttingDown = false;

process.on('SIGTERM', async () => {
  console.log('SIGTERM received — starting graceful shutdown');
  shuttingDown = true;

  // 1. Stop accepting new connections
  server.close(async () => {
    console.log('HTTP server closed');

    // 2. Drain open resources
    try {
      await Promise.all([
        dbPool.end(),          // close DB connection pool
        redisClient.quit(),    // close Redis connection
        mqChannel.close(),     // close message queue channel
      ]);
      console.log('Resources drained — exiting cleanly');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown', err);
      process.exit(1);
    }
  });

  // 3. Safety timeout — force exit if drain takes too long
  setTimeout(() => {
    console.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 15_000);
});

// Reject new requests during shutdown (return 503 to load balancer):
app.use((req, res, next) => {
  if (shuttingDown) {
    res.setHeader('Connection', 'close');
    return res.status(503).json({ error: 'Server shutting down' });
  }
  next();
});
```

### Layer 3 — Health Checks

```javascript
// Load balancers (AWS ALB, nginx, k8s) probe /health every 10-30s.
// Return 503 → server removed from rotation immediately.

app.get('/health', async (req, res) => {
  const checks: Record<string, 'ok' | 'fail'> = {};

  // Check DB connectivity
  try {
    await pool.query('SELECT 1');
    checks.db = 'ok';
  } catch {
    checks.db = 'fail';
  }

  // Check Redis connectivity
  try {
    await redis.ping();
    checks.redis = 'ok';
  } catch {
    checks.redis = 'fail';
  }

  const healthy = Object.values(checks).every(v => v === 'ok');

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'degraded',
    uptime: process.uptime(),
    checks,
  });
});

// Kubernetes liveness vs readiness:
// /health/live  → is the process up? (restart if not)
// /health/ready → can it serve traffic? (remove from Service if not)
app.get('/health/live', (_req, res) => res.json({ status: 'alive' }));
app.get('/health/ready', async (req, res) => {
  // readiness fails during startup or drain
  if (shuttingDown || !dbReady) return res.status(503).json({ status: 'not ready' });
  res.json({ status: 'ready' });
});
```

### Layer 4 — Zero-Downtime Deployments

```
Three strategies — choose based on risk tolerance:

1. Rolling Deployment (default in k8s)
   ┌────────────────────────────────────┐
   │ v1 v1 v1 v1  →  v2 v1 v1 v1      │
   │              →  v2 v2 v1 v1      │
   │              →  v2 v2 v2 v1      │
   │              →  v2 v2 v2 v2  ✓   │
   └────────────────────────────────────┘
   - No extra infrastructure needed
   - Both versions briefly serve traffic simultaneously
   - DB schema must be backward-compatible during rollout

2. Blue-Green Deployment
   ┌────────────────────────────────────┐
   │ Load Balancer                       │
   │     ↓                               │
   │  [Blue: v1] ← live traffic         │
   │  [Green: v2] ← dark (idle)        │
   │                                     │
   │  Switch LB: Blue → Green (< 1s)    │
   │  Keep Blue idle for instant rollback│
   └────────────────────────────────────┘
   - Instant cutover and instant rollback
   - Double the infrastructure cost
   - DB migrations must run before switch

3. Canary Release
   ┌────────────────────────────────────┐
   │ 95% → v1 (stable)                 │
   │  5% → v2 (canary)                 │
   │                                     │
   │ Monitor error rate, latency, etc.  │
   │ Gradually increase to 100% if OK  │
   └────────────────────────────────────┘
   - Safest: real production validation
   - Requires traffic splitting (nginx, AWS ALB weights, Istio)
   - Automatic rollback if error rate spikes
```

```javascript
// Database migration rule for zero-downtime:
// Never break the schema while old code is still running.

// Bad: rename column in one migration
// ALTER TABLE users RENAME COLUMN name TO full_name;
// Old code breaks immediately.

// Good: expand-then-contract (3 deploys):
// Migration 1: Add new column (backward compatible)
// ALTER TABLE users ADD COLUMN full_name VARCHAR(255);
// UPDATE users SET full_name = name;

// Deploy v2: writes to BOTH name and full_name, reads from full_name

// Migration 2 (after v2 is stable): drop old column
// ALTER TABLE users DROP COLUMN name;
```

---

## "How Do You Optimize an API's Response Time?"

### Step 1 — Measure Before You Touch Anything

```javascript
// Add structured timing logs to find bottlenecks:
app.use((req, res, next) => {
  const start = Date.now();
  const timings: Record<string, number> = {};

  req.time = (label: string) => {
    timings[label] = Date.now() - start;
  };

  res.on('finish', () => {
    logger.info('request completed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      totalMs: Date.now() - start,
      timings,
    });
  });

  next();
});

// Usage in route:
app.get('/api/orders', async (req, res) => {
  const user = await getUser(req.userId);
  req.time('user_fetch');                    // logged: { user_fetch: 45 }
  const orders = await getOrders(req.userId);
  req.time('orders_fetch');                  // logged: { orders_fetch: 340 } ← bottleneck
  res.json({ user, orders });
});
```

Metrics to care about: **p99 latency** (not average — average hides long tail), **error rate**, **throughput (req/s)**.

### Step 2 — Parallelize Independent I/O

```javascript
// Sequential (bad) — waits for each before starting next:
const user    = await db.users.find(id);       // 50ms
const orders  = await db.orders.find(id);      // 80ms
const notifs  = await db.notifs.find(id);      // 40ms
// Total: 170ms

// Parallel (good) — all fire at once:
const [user, orders, notifs] = await Promise.all([
  db.users.find(id),
  db.orders.find(id),
  db.notifs.find(id),
]);
// Total: 80ms (longest of the three)

// Optional parallel (don't fail if non-critical service is down):
const [critical, optional] = await Promise.allSettled([
  db.orders.find(id),           // must succeed
  recommendations.get(id),      // nice to have
]);
const orders  = critical.status === 'fulfilled' ? critical.value : [];
const recs    = optional.status === 'fulfilled' ? optional.value : null;
```

### Step 3 — Eliminate N+1 Queries

```javascript
// N+1 pattern (the most common DB killer):
const posts = await db.posts.findAll();             // 1 query
for (const post of posts) {
  post.author = await db.users.findById(post.userId); // N queries!
}
// For 100 posts: 101 queries

// Fix 1: JOIN (best for simple cases)
const posts = await db.query(`
  SELECT posts.*, users.name AS author_name, users.avatar AS author_avatar
  FROM posts
  JOIN users ON posts.user_id = users.id
  WHERE posts.status = 'published'
  ORDER BY posts.created_at DESC
  LIMIT 20
`);

// Fix 2: DataLoader batching (for GraphQL or reusable loaders)
const userLoader = new DataLoader(async (ids: string[]) => {
  const users = await db.users.findByIds(ids);      // 1 query for all IDs
  const map = new Map(users.map(u => [u.id, u]));
  return ids.map(id => map.get(id));
});

// Now each post.author call gets batched into a single query:
const posts = await db.posts.findAll();
await Promise.all(posts.map(p => userLoader.load(p.userId)));
```

### Step 4 — Cache Aggressively

```javascript
// Cache hierarchy: in-memory > Redis > DB

// Level 1: In-process memory (< 1ms)
const cache = new Map<string, { data: unknown; expiry: number }>();

function memCache<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expiry > Date.now()) return Promise.resolve(hit.data as T);
  return fn().then(data => {
    cache.set(key, { data, expiry: Date.now() + ttlMs });
    return data;
  });
}

// Level 2: Redis (1-5ms, survives restarts, shared across instances)
async function redisCache<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as T;
  const data = await fn();
  await redis.setex(key, ttlSec, JSON.stringify(data));
  return data;
}

// Usage — cache expensive DB aggregation:
app.get('/api/leaderboard', async (req, res) => {
  const data = await redisCache('leaderboard:global', 30, async () => {
    return db.query(`
      SELECT user_id, SUM(score) as total
      FROM events
      GROUP BY user_id
      ORDER BY total DESC
      LIMIT 100
    `);
  });
  res.json(data);
});
```

### Step 5 — Paginate, Stream, and Compress

```javascript
// Cursor-based pagination (more efficient than OFFSET for large tables):
app.get('/api/feed', async (req, res) => {
  const cursor = req.query.cursor as string | undefined;
  const limit  = Math.min(parseInt(req.query.limit as string) || 20, 100);

  const rows = await db.query(`
    SELECT id, title, created_at
    FROM posts
    WHERE ($1::uuid IS NULL OR created_at < (SELECT created_at FROM posts WHERE id = $1))
    ORDER BY created_at DESC
    LIMIT $2
  `, [cursor ?? null, limit + 1]);

  const hasMore = rows.length > limit;
  const items   = hasMore ? rows.slice(0, limit) : rows;

  res.json({
    items,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  });
});

// Stream large responses instead of buffering in memory:
app.get('/api/export/csv', async (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=export.csv');

  res.write('id,email,created_at\n'); // header

  const cursor = db.queryStream('SELECT id, email, created_at FROM users ORDER BY id');

  for await (const row of cursor) {
    res.write(`${row.id},${row.email},${row.created_at}\n`);
  }

  res.end();
  // Memory usage stays constant regardless of row count
});

// Enable compression (30-70% size reduction for JSON):
import compression from 'compression';
app.use(compression({ threshold: 1024 })); // compress responses > 1KB
```

---

## "How Do You Handle Traffic Spikes?"

```
Spike handling strategy (in order of speed to implement):

1. Caching (instant) — serve repeated data from cache, not DB
2. Rate limiting (minutes) — protect DB and downstream services
3. Queue-based leveling (hours) — accept work, process at your own pace
4. Horizontal scaling (hours to days) — more instances
5. Auto-scaling (configured upfront) — scale on CPU/RPS metrics
```

```javascript
// Rate limiting with Redis (token bucket per user):
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

const limiter = rateLimit({
  windowMs: 60_000,  // 1 minute window
  max: 100,          // 100 requests per window per IP
  standardHeaders: true,
  store: new RedisStore({ sendCommand: (...args) => redis.sendCommand(args) }),
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
    });
  },
});

app.use('/api/', limiter);

// Load shedding — reject when system is overloaded:
app.use((req, res, next) => {
  const { heapUsed, heapTotal } = process.memoryUsage();
  const heapRatio = heapUsed / heapTotal;
  const cpuLoad   = os.loadavg()[0] / os.cpus().length; // 1-min load per core

  if (heapRatio > 0.90 || cpuLoad > 0.95) {
    return res.status(503).json({
      error: 'Service temporarily unavailable — high load',
      retryAfter: 5,
    });
  }
  next();
});

// Queue-based leveling for expensive work:
app.post('/api/reports/generate', async (req, res) => {
  // Accept immediately, process asynchronously
  const jobId = await queue.add('generate-report', {
    userId: req.userId,
    params: req.body,
  });

  res.status(202).json({
    jobId,
    statusUrl: `/api/reports/${jobId}/status`,
    message: 'Report queued — check statusUrl for progress',
  });
});
```

---

## "How Do You Respond to a Production Incident?"

### Incident Response Runbook

```
Severity levels:
  P0: Site down / data loss / security breach → wake up entire team
  P1: Partial outage / significant degradation → wake up on-call
  P2: Degraded feature / elevated errors → fix during business hours
  P3: Minor issue → schedule in next sprint

Response steps (DAIR):

1. DETECT — monitoring alert or user report
   - Acknowledge within SLA (P0: 5 min, P1: 15 min)
   - Open incident channel: #inc-YYYY-MM-DD-brief-description
   - Post initial update in status page

2. ASSESS — understand scope before acting
   - What is broken? Which users/services affected?
   - When did it start? (correlate with recent deploys)
   - Is it getting better, worse, or stable?
   - Check dashboards: error rate, latency, DB connections, queue depth

3. INVESTIGATE — find the cause
   - git log --since="2 hours ago" (recent deploys?)
   - Check logs: grep for ERROR/FATAL around incident start time
   - Metrics: before vs after comparison
   - Isolate: is it one region, one service, or global?

4. REMEDIATE — fix or mitigate
   - If recent deploy: rollback first, investigate later
   - If DB query: kill offending query, add index
   - If memory leak: restart instances, add node --max-old-space-size limit
   - Communicate: update status page every 30 minutes
```

```javascript
// Structured logging makes incident investigation fast:
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
});

// Every log line has trace context for distributed tracing:
app.use((req, res, next) => {
  req.log = logger.child({
    requestId: req.headers['x-request-id'] ?? crypto.randomUUID(),
    userId: req.user?.id,
    path: req.path,
    method: req.method,
  });
  next();
});

// Error handling with structured context:
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  req.log.error({
    err: { message: err.message, stack: err.stack, name: err.name },
    msg: 'Unhandled request error',
  });
  res.status(500).json({ error: 'Internal server error', requestId: req.requestId });
  // requestId lets users report issues you can trace immediately
});
```

### Post-Mortem Template

```markdown
## Incident Post-Mortem: [Title]

**Date:** YYYY-MM-DD
**Duration:** HH:MM
**Severity:** P1
**Author:** [Name]

### Summary
One paragraph: what happened, who was affected, how long.

### Timeline
- 14:32 — Alert fired: error rate > 5%
- 14:35 — On-call acknowledged
- 14:40 — Identified root cause: deploy at 14:30 introduced regression
- 14:45 — Rolled back deploy
- 14:47 — Error rate returned to baseline

### Root Cause
New connection pool config set max: 2 instead of max: 20.
Under load, requests queued behind connection wait → timeout → 503s.

### Impact
~15 minutes of elevated errors (12% error rate vs 0.1% baseline).
Estimated 3,400 failed requests.

### What Went Well
- Alert fired within 2 minutes of problem starting
- Rollback executed quickly

### Action Items
| Action | Owner | Due |
|--------|-------|-----|
| Add config validation test for pool settings | @eng | 2024-02-15 |
| Add connection wait time to dashboards | @ops | 2024-02-10 |

### Lessons
No blame — focus on system improvements.
The config was not validated in CI, allowing an invalid value to reach production.
```

---

## "How Do You Monitor a Node.js Application in Production?"

```javascript
// Key metrics to track:

// 1. Process health (every 30s):
setInterval(() => {
  const { heapUsed, heapTotal, external, rss } = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  metrics.gauge('nodejs.heap.used',  heapUsed);
  metrics.gauge('nodejs.heap.total', heapTotal);
  metrics.gauge('nodejs.rss',        rss);
  metrics.gauge('nodejs.event_loop.lag_ms', getEventLoopLag()); // see below
}, 30_000).unref();

// 2. Event loop lag (sign of CPU starvation):
function getEventLoopLag(): number {
  const start = process.hrtime.bigint();
  return new Promise<number>(resolve =>
    setImmediate(() => {
      const lag = Number(process.hrtime.bigint() - start) / 1e6; // ms
      resolve(lag);
    })
  ) as unknown as number;
}
// > 100ms event loop lag = something is blocking the event loop

// 3. HTTP request metrics (middleware):
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const route = req.route?.path ?? req.path;
    metrics.histogram('http.request.duration', duration, {
      method:  req.method,
      route,
      status:  String(res.statusCode),
    });
    metrics.increment('http.requests.total', {
      method: req.method,
      route,
      status: String(res.statusCode),
    });
  });
  next();
});

// 4. Alerts to configure:
// - Error rate > 1% for 5 minutes → P1
// - p99 latency > 2s for 10 minutes → P2
// - Heap usage > 80% → P2
// - Event loop lag > 200ms for 2 minutes → P1
// - DB connection pool exhausted → P1
// - Failed health checks on > 1 instance → P1
```

---

## "What Is Your Strategy for Database Query Optimization?"

```sql
-- 1. EXPLAIN ANALYZE is your best friend:
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT u.id, u.email, COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.created_at > NOW() - INTERVAL '30 days'
GROUP BY u.id;

-- Look for:
-- Seq Scan (bad on large tables) → missing index
-- Nested Loop on large sets → missing index or bad join
-- "rows=10000 actual rows=1" → stale statistics (ANALYZE table)
-- Hash Batches > 1 → work_mem too low

-- 2. Index the right columns:
-- Index WHERE clauses, JOIN keys, ORDER BY columns
CREATE INDEX CONCURRENTLY idx_users_created_at ON users (created_at DESC);
CREATE INDEX CONCURRENTLY idx_orders_user_id   ON orders (user_id);
-- CONCURRENTLY = no table lock during creation

-- 3. Partial indexes (index only rows you query):
-- Most orders queries only touch 'pending' status
CREATE INDEX idx_orders_pending ON orders (created_at DESC)
WHERE status = 'pending';
-- Tiny index, very fast for that use case

-- 4. Covering index (index stores all needed columns — no heap fetch):
CREATE INDEX idx_users_email_covering ON users (email)
INCLUDE (id, name, status);
-- Query: SELECT id, name, status FROM users WHERE email = ?
-- Never touches the table — pure index scan
```

```javascript
// Connection pool tuning (Node.js with pg):
const pool = new Pool({
  max: Math.min(10, os.cpus().length * 2), // never more than DB allows
  min: 2,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 3_000,    // fail fast, don't queue forever
  statement_timeout: 10_000,         // kill queries > 10s (prevent runaway)
  query_timeout: 10_000,
});

// Always set statement_timeout to prevent runaway queries
// taking down your entire DB under load
```

---

## "How Do You Prevent and Handle Cascading Failures?"

```
A cascading failure: Service A slow → A's thread pool exhausted →
A returns 500s → B retries A aggressively → A gets more traffic →
A is completely overwhelmed → B also goes down → entire system fails.

Prevention toolkit:
1. Timeouts     — never wait forever on a dependency
2. Circuit breaker — stop calling a failing service
3. Bulkhead      — isolate resources per dependency
4. Backpressure  — signal upstream to slow down
5. Retry jitter  — prevent thundering herd on recovery
```

```typescript
// Production-grade circuit breaker:
type State = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

class CircuitBreaker {
  private state: State = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(
    private readonly threshold = 5,       // failures to open
    private readonly resetTimeout = 30_000, // ms before trying again
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN'; // probe one request
      } else {
        throw new Error('Circuit is OPEN — dependency unavailable');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.threshold || this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      console.warn(`Circuit OPEN after ${this.failureCount} failures`);
    }
  }
}

// Per-dependency breakers (bulkhead pattern):
const paymentBreaker = new CircuitBreaker(5, 30_000);
const emailBreaker   = new CircuitBreaker(3, 60_000);

async function checkout(order: Order) {
  // Payment is critical — let it throw if circuit is open
  const payment = await paymentBreaker.execute(() => paymentService.charge(order));

  // Email is non-critical — graceful degradation
  try {
    await emailBreaker.execute(() => emailService.sendConfirmation(order));
  } catch (err) {
    logger.warn('Email service unavailable — skipping confirmation', { orderId: order.id });
    // Queue for retry later
    await queue.add('send-email', { orderId: order.id }, { delay: 60_000 });
  }

  return payment;
}

// Retry with jitter to avoid thundering herd:
async function retryWithJitter<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      const base  = Math.min(100 * 2 ** attempt, 10_000); // exponential: 200, 400, 800...
      const jitter = Math.random() * base;                 // add 0-100% randomness
      await new Promise(r => setTimeout(r, base + jitter));
    }
  }
  throw new Error('unreachable');
}
```

---

## Quick-Fire: Operational Q&A

| Question | Answer |
|----------|--------|
| p99 vs average latency? | p99 = 99th percentile — 1% of requests are slower. Average hides the long tail. Always track p99. |
| When to use blue-green vs canary? | Blue-green for high-risk deploys needing instant rollback. Canary when you want gradual validation. |
| What is a thundering herd? | Many clients retry at the same time → overload recovering service. Prevent with jitter. |
| How many DB connections per Node process? | `min(10, cpu_count × 2)`. Never let pool exhaust. Set `connectionTimeoutMillis`. |
| What is backpressure? | Signal to slow down: readable stream pausing writeable, queue depth triggering 429s. |
| Rolling restart without downtime? | Wait for health check to pass before routing traffic to new instance. `minReadySeconds` in k8s. |
| How do you test resilience? | Chaos engineering: kill random instances, inject latency, block network. Use `tc netem` or Chaos Monkey. |
| What's the difference between RTO and RPO? | RTO = max downtime (recovery time). RPO = max data loss (recovery point). |
| How do you handle a bad database migration? | Run both old+new column, deploy dual-write code, verify, then drop old column in a later migration. |
| What makes an API idempotent? | Same request produces same result if called N times. Use idempotency keys for POST operations. |
