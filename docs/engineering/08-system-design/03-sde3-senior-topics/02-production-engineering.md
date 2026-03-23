# Production Engineering — Frequently Asked Interview Questions

Real-world engineering scenarios that SDE3+ candidates are expected to answer in depth.

---

## "How Would You Optimize a Slow API Endpoint?"

```
This is one of the most common senior interview questions. Answer methodically.

Step 1: Measure first, optimize second
- What is the current p50/p95/p99 latency?
- What does APM (Datadog/New Relic) show?
- Is it slow always, or under load?
- Is it CPU-bound, I/O-bound, or blocked on a dependency?

Step 2: Identify the bottleneck
- Add timing logs around each operation
- Use EXPLAIN ANALYZE on database queries
- Check for N+1 queries (ORM lazy loading)
- Check external API call latency
- Profile CPU with clinic.js flame graph

Step 3: Apply targeted fixes (in order of impact)
```

```javascript
// Example: GET /api/dashboard — takes 3 seconds

// BEFORE profiling reveals:
app.get('/api/dashboard', async (req, res) => {
  const user = await db.users.findById(req.userId);        // 50ms
  const orders = await db.orders.findByUser(req.userId);   // 100ms
  const notifications = await db.notifications.find(req.userId); // 80ms
  const recommendations = await ai.getRecommendations(user); // 2500ms ← bottleneck!

  res.json({ user, orders, notifications, recommendations });
});

// FIX 1: Parallelize independent calls
app.get('/api/dashboard', async (req, res) => {
  const [user, orders, notifications] = await Promise.all([
    db.users.findById(req.userId),
    db.orders.findByUser(req.userId),
    db.notifications.find(req.userId),
  ]);
  // Now ~100ms for first 3 (parallel), + 2500ms for AI still

  const recommendations = await ai.getRecommendations(user);
  res.json({ user, orders, notifications, recommendations });
});

// FIX 2: Cache the expensive call
const recommendationsCache = new NodeCache({ stdTTL: 300 }); // 5 min

app.get('/api/dashboard', async (req, res) => {
  const [user, orders, notifications] = await Promise.all([...]);

  const cacheKey = `recs:${req.userId}`;
  let recommendations = recommendationsCache.get(cacheKey);
  if (!recommendations) {
    recommendations = await ai.getRecommendations(user);
    recommendationsCache.set(cacheKey, recommendations);
  }

  res.json({ user, orders, notifications, recommendations });
  // Now: ~100ms for fresh, ~5ms for cached!
});

// FIX 3: Precompute asynchronously
// Background job re-runs recommendations every 5 minutes
// API just reads from Redis — always fast
```

### Optimization Checklist

```
Database:
□ Query uses indexes (check EXPLAIN ANALYZE)
□ No N+1 queries (use eager loading or DataLoader)
□ SELECT only needed columns (not SELECT *)
□ Pagination (not loading thousands of rows)
□ Connection pooling configured correctly

Caching:
□ Cache-aside for expensive reads (Redis/in-memory)
□ HTTP caching headers (ETag, Cache-Control)
□ CDN for static assets
□ Precomputed views for heavy aggregations

Application:
□ Parallel I/O with Promise.all (not sequential await)
□ No blocking operations in event loop (sync fs, crypto)
□ Gzip/Brotli compression for responses
□ Payload size reduced (pagination, field selection)

External dependencies:
□ Timeout set on external API calls
□ Circuit breaker for flaky dependencies
□ Fallback when dependency unavailable
```

---

## "How Would You Increase Database Uptime?"

### High Availability Architecture

```
Single primary failure → entire DB down.
Solution: Primary + Replicas + Automatic failover.

PostgreSQL HA with Patroni + etcd:
Primary → Replicas (streaming replication, synchronous or async)
         ↓
    Patroni (health monitor)
         ↓
    If primary dies → Patroni promotes best replica → updates service discovery
         ↓
    Applications reconnect to new primary (via HAProxy or PgBouncer)

Recovery time: 30 seconds - 2 minutes (automatic failover)

Managed solutions:
- AWS RDS Multi-AZ: automatic failover, ~60 seconds
- AWS Aurora: < 30 second failover, shares storage
- Google Cloud SQL: automatic failover replicas
- Supabase: managed PostgreSQL with HA
```

### Connection Pooling for Availability

```javascript
// PgBouncer between application and PostgreSQL:
// Application → PgBouncer → PostgreSQL
// Benefits:
// - Multiplexes many app connections into few DB connections
// - DB can handle more apps without overload
// - Transparent to application code

// In Node.js with pg:
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                  // max connections in pool
  min: 5,                   // maintain minimum connections
  idleTimeoutMillis: 30000, // close idle connections after 30s
  connectionTimeoutMillis: 5000, // fail fast if can't connect
  // Retry on connection failure:
  allowExitOnIdle: false,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  // Don't crash — pool will handle reconnection
});
```

### Read Replicas for Scale

```javascript
// Route reads to replicas, writes to primary:
const primaryPool = new Pool({ connectionString: process.env.PRIMARY_DB_URL });
const replicaPool = new Pool({ connectionString: process.env.REPLICA_DB_URL });

async function query(sql, params, { forWrite = false } = {}) {
  const pool = forWrite ? primaryPool : replicaPool;
  try {
    return await pool.query(sql, params);
  } catch (err) {
    if (!forWrite && err.code === 'ECONNREFUSED') {
      // Replica down — fall back to primary for reads
      return primaryPool.query(sql, params);
    }
    throw err;
  }
}

// Usage:
const user = await query('SELECT * FROM users WHERE id = $1', [id]);
await query('INSERT INTO users ...', [data], { forWrite: true });
```

### Backup and Recovery Strategy

```bash
# Continuous WAL archiving (point-in-time recovery):
# archive_command = 'aws s3 cp %p s3://backups/wal/%f'
# Recovery to any point in time from last base backup + WAL

# Regular base backups:
0 2 * * * pg_dump $DATABASE_URL | gzip | aws s3 cp - s3://backups/daily/$(date +%Y%m%d).sql.gz

# Test restoration monthly:
aws s3 cp s3://backups/daily/20240101.sql.gz - | gunzip | psql $TEST_DATABASE_URL

# Monitor:
# - Replication lag (replica behind primary)
# - Backup age (last successful backup)
# - Connection count approaching max_connections
```

---

## "How Would You Handle Database Downtime?"

```javascript
// Strategy: fail gracefully, not catastrophically

// 1. Circuit breaker for DB:
const dbBreaker = new CircuitBreaker(5, 30_000);

async function dbQuery(sql, params) {
  return dbBreaker.execute(() => pool.query(sql, params));
}

// 2. Graceful degradation — return cached data when DB is down:
async function getUser(id) {
  try {
    const user = await dbQuery('SELECT * FROM users WHERE id = $1', [id]);
    await redis.setex(`user:${id}`, 300, JSON.stringify(user)); // keep cache warm
    return user;
  } catch (err) {
    if (err.message.includes('Circuit is OPEN')) {
      // DB down — serve stale cache
      const cached = await redis.get(`user:${id}`);
      if (cached) return { ...JSON.parse(cached), stale: true };
    }
    throw err;
  }
}

// 3. Queue writes during downtime (write-behind):
async function updateUser(id, data) {
  try {
    await dbQuery('UPDATE users SET ... WHERE id = $1', [id]);
  } catch (err) {
    // DB unavailable — queue the update
    await redis.lpush('pending_writes', JSON.stringify({ type: 'UPDATE_USER', id, data }));
    console.warn('DB unavailable, write queued:', id);
  }
}

// 4. Health check endpoint:
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: 'unavailable' });
    // Load balancer health check sees 503 → removes from rotation
  }
});
```

---

## "How Would You Do a Code Review?"

### What to Check (Systematic Approach)

```
Level 1: Correctness (most important)
□ Does the logic match the requirements?
□ Are edge cases handled? (null, empty, max values)
□ Are concurrent operations safe?
□ Are errors handled and propagated correctly?
□ Are all code paths reachable and correct?

Level 2: Security
□ User input validated and sanitized?
□ SQL queries parameterized? (no string concatenation)
□ Authentication checked before accessing data?
□ No secrets in code or logs?
□ Are permissions checked (not just authentication)?
□ Timing-safe comparisons for secrets?

Level 3: Performance
□ N+1 queries? (loops with DB calls inside)
□ Missing indexes on frequently queried columns?
□ Unbounded queries? (no LIMIT on potentially large result sets)
□ Blocking operations in async context?
□ Memory leaks? (event listeners, intervals not cleared)

Level 4: Maintainability
□ Function/variable names are descriptive?
□ Complex logic has comments explaining WHY (not what)?
□ Functions are small and have single responsibility?
□ Magic numbers extracted to named constants?
□ No code duplication that should be abstracted?

Level 5: Tests
□ New code has tests?
□ Tests cover happy path AND error cases?
□ Tests are readable and test behavior, not implementation?
□ Tests are deterministic (no time-dependent, no random)?
```

### Code Review Comment Templates

```javascript
// ❌ Bad comment (vague, not actionable):
// "This could be better"
// "This is slow"

// ✅ Good comment (explains issue, suggests fix):
// "This will cause an N+1 query — for each user, a separate DB call is made.
// Use eager loading: include: { posts: true }
// This reduces N+1 queries to 2 queries total."

// Nit (optional, style preference — not a blocker):
// "nit: Could use destructuring here for clarity:
// const { id, name } = user; instead of user.id, user.name"

// Blocking (must fix before merge):
// "Security: This query is vulnerable to SQL injection.
// Replace string interpolation with parameterized query:
// db.query('SELECT * FROM users WHERE id = $1', [req.params.id])"

// Question (understanding, not criticism):
// "Could you explain the reasoning for using setTimeout here?
// I'd expect setImmediate for this use case."
```

---

## "How Would You Handle a Memory Leak in Production?"

```
Investigation Steps:

1. Confirm it's a leak (not just high memory):
   - Memory growing monotonically over time? → likely leak
   - Memory grows but GC recovers it? → not a leak, just allocation
   - Check: process.memoryUsage().heapUsed trend

2. Capture heap snapshot:
   kill -USR2 <node-pid>
   # Or in code: require('v8').writeHeapSnapshot()

3. Analyze snapshot:
   - Chrome DevTools → Memory → Load snapshot
   - Look for unexpected retained objects
   - Compare two snapshots (before/after traffic)
   - Focus on large allocations and their retainer chain

4. Common leaks:
   - Event listeners not removed (emitter.listenerCount grows)
   - Global Map/Set growing without eviction
   - Closures capturing large objects
   - Intervals/timeouts not cleared
   - Express middleware holding request references

5. Fix and verify:
   - Fix the leak
   - Load test for 30 minutes
   - Confirm heap stabilizes
```

```javascript
// Detect listener leak in CI:
const ee = new EventEmitter();
// After test: assert no listeners remain
if (ee.listenerCount('data') > 0) {
  throw new Error('Listener leak detected!');
}

// Monitor heap in production:
setInterval(() => {
  const { heapUsed, heapTotal } = process.memoryUsage();
  metrics.gauge('heap_used_bytes', heapUsed);

  if (heapUsed / heapTotal > 0.9) {
    logger.error('Heap usage critical', { heapUsed, heapTotal });
    // Alert: heap approaching limit
  }
}, 30_000).unref();
```

---

## "How Would You Design for Fault Tolerance?"

```javascript
// Defense in depth — multiple layers of protection

// 1. Timeouts on every external call:
const controller = new AbortController();
setTimeout(() => controller.abort(), 3000);

const response = await fetch(externalApi, { signal: controller.signal });

// 2. Retry with exponential backoff:
async function resilientFetch(url) {
  const delays = [100, 200, 400, 800, 1600]; // ms

  for (let i = 0; i <= delays.length; i++) {
    try {
      return await fetchWithTimeout(url, 3000);
    } catch (err) {
      if (i === delays.length) throw err;
      const jitter = Math.random() * 100;
      await new Promise(r => setTimeout(r, delays[i] + jitter));
    }
  }
}

// 3. Fallback data:
async function getExchangeRate(currency) {
  try {
    return await fetchExchangeRate(currency);
  } catch (err) {
    logger.warn('Exchange rate service down, using cached rate');
    const cached = await redis.get(`rate:${currency}`);
    return cached ? JSON.parse(cached) : FALLBACK_RATES[currency];
  }
}

// 4. Idempotency for safe retries:
app.post('/payments', async (req, res) => {
  const idempotencyKey = req.headers['x-idempotency-key'];

  // Check if already processed:
  const existing = await redis.get(`idempotency:${idempotencyKey}`);
  if (existing) {
    return res.json(JSON.parse(existing)); // return cached result
  }

  const result = await processPayment(req.body);

  // Cache result for 24 hours:
  await redis.setex(`idempotency:${idempotencyKey}`, 86400, JSON.stringify(result));
  res.json(result);
});

// 5. Graceful degradation:
app.get('/feed', async (req, res) => {
  const [posts, recommendations] = await Promise.allSettled([
    getPosts(req.userId),
    getRecommendations(req.userId) // optional feature
  ]);

  res.json({
    posts: posts.status === 'fulfilled' ? posts.value : [],
    recommendations: recommendations.status === 'fulfilled'
      ? recommendations.value
      : null, // feature degraded gracefully
  });
});
```

---

## "How Do You Think About Technical Debt?"

```
Definition: Shortcuts taken now that will cost more later.

Types:
1. Intentional/Reckless: "We'll fix it later" — rarely get fixed
2. Intentional/Prudent: Knowingly skip tests for demo — document it
3. Inadvertent/Reckless: "What's coupling?" — lack of knowledge
4. Inadvertent/Prudent: Learned better patterns after writing code

How to manage:
- Track in a dedicated backlog (not mixed with feature work)
- Quantify cost: "This adds 2 hours per feature to dev time"
- Fix incrementally: boy scout rule (leave code better than found)
- Don't ship new tech debt without explicit decision
- Use Architecture Decision Records (ADRs) to document decisions

When to pay it down:
- Before adding features in that area
- When it's actively blocking delivery
- During "investment sprints" (20% time)
- When fixing bugs in that area (camp in the area)

Never: big rewrite projects (they replace known bugs with unknown ones)
Always: strangler fig pattern (replace incrementally while keeping old running)
```

---

## "How Would You Onboard a New Engineer?"

```
Week 1: Context and environment
- Architecture walkthrough (draw the system)
- Get local dev environment running
- Pair on a small bug fix
- Introduce to codebase structure and conventions

Week 2: Contribution
- Assign small, self-contained feature
- Code review their PRs (teaching opportunity)
- Explain testing expectations

Month 1 goal: First production PR merged

Senior engineer responsibilities during onboarding:
- Write good documentation (ADRs, runbooks, READMEs)
- Code should be readable to newcomers (not clever)
- Pair programming sessions
- Be available for questions (create psychological safety)
- Set clear expectations on code quality early
```
