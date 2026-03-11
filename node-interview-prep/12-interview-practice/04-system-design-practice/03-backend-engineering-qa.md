# Backend Engineering Deep-Dives — Interview Q&A

Scenario-based questions on scaling, state management, API design, and production debugging.

---

## "How Do You Scale a Node.js Application Horizontally?"

```
Single Node.js process: limited to one CPU core.
Horizontal scale = more processes, more machines.

Scale-up path:
1. pm2 cluster (same machine, all CPU cores)   → 8x with 8 cores
2. Multiple containers (same machine or k8s)   → N× with N pods
3. Auto-scaling group (more machines on demand) → elastic

Traffic must be routed by a load balancer (nginx, AWS ALB, k8s Service).
```

```javascript
// Cluster module (manual, understand how PM2 does it):
import cluster from 'cluster';
import os from 'os';

if (cluster.isPrimary) {
  const workers = os.cpus().length;
  console.log(`Master ${process.pid} — forking ${workers} workers`);

  for (let i = 0; i < workers; i++) cluster.fork();

  cluster.on('exit', (worker, code) => {
    console.warn(`Worker ${worker.pid} died (code ${code}) — restarting`);
    cluster.fork(); // auto-restart
  });
} else {
  // Each worker runs the full app independently
  const app = require('./app');
  app.listen(3000, () => console.log(`Worker ${process.pid} listening`));
}

// Gotcha: workers don't share memory.
// Shared state MUST go in Redis, not in-process variables.
// In-process cache is per-worker → can serve stale data across workers.
```

### Stateless Design — The Prerequisite for Scaling

```javascript
// ❌ Stateful — can't scale:
const sessions = new Map(); // only exists in this process

app.post('/login', (req, res) => {
  const token = crypto.randomUUID();
  sessions.set(token, { userId: req.body.userId }); // only in memory!
  res.json({ token });
});

// ✅ Stateless — scales to any number of instances:
import jwt from 'jsonwebtoken';

app.post('/login', async (req, res) => {
  const user = await db.users.verify(req.body.email, req.body.password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  // State lives IN the token, signed with a secret
  const token = jwt.sign(
    { sub: user.id, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: '24h' },
  );
  res.json({ token });
});

// Any instance can verify any token — no shared state needed
app.use((req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  try {
    req.user = jwt.verify(token!, process.env.JWT_SECRET!);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});
```

---

## "How Do You Manage State Across Multiple Servers?"

```
Rule: anything that needs to be seen by more than one instance must live outside the process.

Storage by use case:
- Sessions / short-lived data   → Redis (fast, TTL support)
- User data / business data     → PostgreSQL (durable, ACID)
- File uploads                  → S3 / GCS (not local disk)
- In-flight tasks               → Redis/BullMQ or SQS
- Distributed locks             → Redis SETNX / Redlock
- Pub/sub across workers        → Redis pub/sub or SQS/SNS
```

```javascript
// Distributed lock with Redis (prevent double-processing):
// Scenario: cron job runs on 3 instances, must only execute once.

async function withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T | null> {
  const lockId  = crypto.randomUUID();
  const lockKey = `lock:${key}`;

  // SET NX EX — atomic: set only if not exists, with expiry
  const acquired = await redis.set(lockKey, lockId, { NX: true, PX: ttlMs });

  if (!acquired) {
    console.log(`Lock ${key} already held — skipping`);
    return null;
  }

  try {
    return await fn();
  } finally {
    // Only delete our lock (Lua script for atomicity):
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await redis.eval(script, { keys: [lockKey], arguments: [lockId] });
  }
}

// Usage:
async function runDailyReport() {
  await withLock('daily-report', 60_000, async () => {
    const data = await db.generateReport();
    await s3.putObject({ Key: `reports/${Date.now()}.csv`, Body: data });
  });
}
```

---

## "How Do You Handle File Uploads at Scale?"

```
Never proxy file bytes through your API server.
Large upload → your server's memory + bandwidth wasted.
Correct pattern: presigned URLs — client uploads directly to S3.
```

```javascript
// 1. Client requests a presigned URL from your API:
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: process.env.AWS_REGION });

app.post('/api/uploads/presign', authenticate, async (req, res) => {
  const { filename, contentType } = req.body;

  // Validate before signing (never trust client claims):
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowed.includes(contentType)) {
    return res.status(400).json({ error: 'File type not allowed' });
  }

  const key     = `uploads/${req.user.id}/${Date.now()}-${filename}`;
  const command = new PutObjectCommand({
    Bucket:      process.env.S3_BUCKET!,
    Key:         key,
    ContentType: contentType,
    // Server-side encryption:
    ServerSideEncryption: 'AES256',
    // Prevent oversize uploads (e.g., 10MB limit):
    // Note: enforced via S3 bucket policy, not here
  });

  const url = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 min

  res.json({ url, key });
});

// 2. Client uploads directly to S3 (your server sees 0 bytes):
// PUT ${url} — Content-Type: ${contentType} — Body: file

// 3. Client notifies your API after upload completes:
app.post('/api/uploads/confirm', authenticate, async (req, res) => {
  const { key } = req.body;

  // Verify the object actually exists in S3:
  await s3.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }));

  // Process asynchronously (resize, virus scan, etc.):
  await queue.add('process-upload', { key, userId: req.user.id });

  // Save reference to DB:
  const file = await db.files.create({ key, userId: req.user.id, status: 'processing' });
  res.json({ fileId: file.id });
});
```

---

## "How Do You Implement Webhooks Reliably?"

```
Webhook producer: you call a third party's endpoint when events happen.
Webhook consumer: third parties call YOUR endpoint when events happen.

Both need reliability: at-least-once delivery + idempotency.
```

```javascript
// === Producing webhooks (you sending them) ===

// Store webhook jobs in DB, process with queue:
interface WebhookJob {
  id: string;
  endpoint: string;
  event: string;
  payload: object;
  attemptCount: number;
  lastError?: string;
  nextRetryAt: Date;
  status: 'pending' | 'delivered' | 'failed';
}

async function deliverWebhook(job: WebhookJob) {
  const payload = JSON.stringify(job.payload);
  const timestamp = Date.now().toString();

  // HMAC signature — receiver verifies you sent it:
  const sig = crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET!)
    .update(`${timestamp}.${payload}`)
    .digest('hex');

  try {
    const res = await fetch(job.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Timestamp': timestamp,
        'X-Webhook-Signature': `sha256=${sig}`,
      },
      body: payload,
      signal: AbortSignal.timeout(5000), // 5s timeout
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    await db.webhooks.update(job.id, { status: 'delivered' });
  } catch (err) {
    const backoff = [1, 5, 30, 120, 600]; // minutes
    const delay   = (backoff[job.attemptCount] ?? 600) * 60_000;

    await db.webhooks.update(job.id, {
      attemptCount: job.attemptCount + 1,
      lastError: String(err),
      nextRetryAt: new Date(Date.now() + delay),
      status: job.attemptCount >= 4 ? 'failed' : 'pending',
    });
  }
}

// === Consuming webhooks (third parties calling you) ===

app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig       = req.headers['stripe-signature'] as string;
  const body      = req.body; // raw Buffer

  // 1. Verify signature immediately (reject forgeries):
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // 2. Respond 200 FAST — Stripe retries if you time out:
  res.json({ received: true });

  // 3. Process asynchronously — check idempotency first:
  const alreadyProcessed = await redis.set(
    `webhook:${event.id}`,
    '1',
    { NX: true, EX: 86400 }, // expire after 24h
  );

  if (!alreadyProcessed) {
    console.log('Duplicate webhook, skipping:', event.id);
    return;
  }

  await queue.add('process-stripe-event', event);
});
```

---

## "How Do You Implement Feature Flags?"

```
Feature flags decouple deployment from release.
Deploy code anytime; enable features for specific users/percentage.

Use cases:
- Gradual rollout (10% → 50% → 100%)
- Kill switch for buggy features
- A/B testing
- Beta programs
- Dark launches (code runs, user doesn't see it)
```

```javascript
// Simple in-house implementation with Redis:
interface FlagConfig {
  enabled: boolean;
  percentage?: number;      // 0-100, deterministic per user
  allowList?: string[];     // specific user IDs
  denyList?: string[];
}

class FeatureFlags {
  private cache = new Map<string, { config: FlagConfig; expiry: number }>();
  private readonly TTL = 30_000; // 30s cache

  async isEnabled(flag: string, userId?: string): Promise<boolean> {
    const config = await this.getConfig(flag);
    if (!config || !config.enabled) return false;

    if (userId) {
      if (config.denyList?.includes(userId))  return false;
      if (config.allowList?.includes(userId)) return true;

      if (config.percentage !== undefined) {
        // Deterministic bucketing: same user always gets same result
        const hash   = murmurHash(`${flag}:${userId}`) % 100;
        return hash < config.percentage;
      }
    }

    return config.enabled;
  }

  private async getConfig(flag: string): Promise<FlagConfig | null> {
    const cached = this.cache.get(flag);
    if (cached && cached.expiry > Date.now()) return cached.config;

    const raw = await redis.get(`flag:${flag}`);
    if (!raw) return null;

    const config = JSON.parse(raw) as FlagConfig;
    this.cache.set(flag, { config, expiry: Date.now() + this.TTL });
    return config;
  }
}

const flags = new FeatureFlags();

// Usage:
app.get('/api/feed', authenticate, async (req, res) => {
  const useNewAlgorithm = await flags.isEnabled('new-feed-algorithm', req.user.id);

  const feed = useNewAlgorithm
    ? await newFeedService.get(req.user.id)
    : await legacyFeedService.get(req.user.id);

  res.json(feed);
});

// Update flag via admin API (no deploy needed):
// redis.set('flag:new-feed-algorithm', JSON.stringify({ enabled: true, percentage: 10 }))
```

---

## "How Do You Debug High CPU Usage in Node.js?"

```
Symptoms: CPU pegged at 100%, event loop lag > 100ms, responses slow.
Node.js is single-threaded — one hot function blocks everything.

Debugging steps:

1. Find the PID under load:
   top -pid $(pgrep -n node)

2. Capture CPU profile for 30 seconds:
   kill -USR1 $(pgrep -n node)
   # Node starts V8 CPU profiling, creates .cpuprofile file on SIGUSR2

   Or use clinic.js flame (best tool):
   npx clinic flame -- node dist/index.js

3. Read the flame graph:
   - Wide bars = function uses lots of CPU time
   - Tall stacks = deep call chains
   - Look for your code near the top (wide + your filename)
   - Ignore narrow V8 internals

4. Common culprits:
   - JSON.stringify / JSON.parse on large objects (use streaming JSON)
   - Synchronous crypto (use async crypto.subtle or worker_thread)
   - bcrypt with too many rounds on main thread
   - Regex backtracking on user input (ReDoS)
   - Sorting very large arrays repeatedly
   - synchronous fs operations (fs.readFileSync in hot paths)
```

```javascript
// ReDoS example — catastrophic regex on user input:
// This regex has exponential backtracking: (a+)+ pattern
const EVIL_REGEX = /^(a+)+$/;
EVIL_REGEX.test('aaaaaaaaaaaaaaaaaaaaaaab'); // freezes for seconds!

// Fix: rewrite regex without backtracking ambiguity, or use a safe library:
import RE2 from 're2'; // Google's regex engine — no backtracking
const safeRegex = new RE2('^[a-z]+$');
safeRegex.test(userInput); // O(n), never freezes

// Move CPU-heavy work off main thread:
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';

// main.ts:
function hashPasswordInWorker(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./hash-worker.js', { workerData: { password } });
    worker.on('message', resolve);
    worker.on('error',   reject);
  });
}

// hash-worker.ts:
import bcrypt from 'bcrypt';
const { password } = workerData;
const hash = await bcrypt.hash(password, 12); // blocking — OK in worker
parentPort!.postMessage(hash);
```

---

## "How Do You Handle API Versioning?"

```
Options and trade-offs:

1. URI versioning:  /v1/users,  /v2/users
   ✅ Explicit, cache-friendly, easy to route
   ❌ Pollutes URLs, clients must update paths

2. Header versioning: Accept: application/vnd.api+json;version=2
   ✅ Clean URLs
   ❌ Not cache-friendly, harder to test in browser

3. Query param:  /users?v=2
   ✅ Easy to test
   ❌ Pollutes query string, inconsistent

Recommendation: URI versioning for public APIs. Never break v1.
```

```javascript
// Express versioned routing:
import express from 'express';
import v1Router from './routes/v1';
import v2Router from './routes/v2';

const app = express();

app.use('/v1', v1Router);
app.use('/v2', v2Router);

// Latest version alias:
app.use('/api', v2Router); // /api/users → v2

// Deprecation notice on old versions:
v1Router.use((req, res, next) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', 'Sat, 01 Jan 2026 00:00:00 GMT');
  res.setHeader('Link', '</v2>; rel="successor-version"');
  next();
});

// Version compatibility layer — transform v1 request to v2 format:
v1Router.get('/users/:id', async (req, res) => {
  // v1 returned: { id, name, email }
  // v2 returns:  { id, firstName, lastName, email }
  const user = await userService.get(req.params.id);

  // Downgrade v2 response for v1 clients:
  res.json({
    id:    user.id,
    name:  `${user.firstName} ${user.lastName}`, // backward compat
    email: user.email,
  });
});
```

---

## "How Do You Manage Secrets in Production?"

```
Never:
- Hard-code secrets in source code
- Commit .env files to git
- Log secrets
- Pass secrets as CLI arguments (visible in ps aux)

Never in environment variables either (they leak in error dumps, child processes).
Preferred: secret manager service.
```

```javascript
// AWS Secrets Manager integration:
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const sm = new SecretsManagerClient({ region: process.env.AWS_REGION });

// Load at startup, cache in memory:
async function loadSecrets() {
  const res = await sm.send(new GetSecretValueCommand({
    SecretId: `myapp/${process.env.ENV}/secrets`,
  }));

  const secrets = JSON.parse(res.SecretString!);

  // Assign to process.env only (not accessible from outside this process):
  Object.assign(process.env, secrets);
}

// In k8s: use External Secrets Operator or Vault Agent Injector.
// Secret is mounted as a file in the pod, never in environment variables.
// Rotations are picked up without pod restarts.

// Detect secrets in code (git pre-commit hook):
// npx gitleaks detect --staged → blocks commits with secrets

// Secrets rotation:
// 1. Dual-active period: both old + new secret accepted
// 2. Rotate: update app to use new secret
// 3. Revoke: delete old secret
// This gives zero-downtime secret rotation.
```

---

## "How Do You Implement a Background Job / Task Queue?"

```
Use cases: email sending, PDF generation, image resizing, scheduled reports.
Never do slow work synchronously in HTTP handlers.

Architecture:
  API server → enqueue job → Redis/SQS → Worker process → process job
               (returns 202 immediately)

Guarantees:
  - At-least-once delivery (job may run more than once → make workers idempotent)
  - Retries with backoff on failure
  - Dead-letter queue for permanently failed jobs
```

```javascript
// BullMQ (Redis-backed, production-grade):
import { Queue, Worker, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';

const connection = new Redis(process.env.REDIS_URL!);

// Producer (API server):
const emailQueue = new Queue('email', { connection });

app.post('/api/orders', authenticate, async (req, res) => {
  const order = await db.orders.create({ ...req.body, userId: req.user.id });

  await emailQueue.add(
    'order-confirmation',
    { orderId: order.id, email: req.user.email },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 1000 }, // keep last 1000
      removeOnFail:     { count: 5000 }, // keep failed for debugging
    },
  );

  res.status(201).json({ orderId: order.id });
});

// Consumer (separate worker process):
const emailWorker = new Worker(
  'email',
  async (job) => {
    const { orderId, email } = job.data;
    const order = await db.orders.findById(orderId);

    await sendEmail({
      to:      email,
      subject: `Order #${orderId} confirmed`,
      html:    renderOrderConfirmation(order),
    });

    job.log(`Email sent to ${email}`);
  },
  {
    connection,
    concurrency: 5, // process 5 jobs simultaneously
    limiter: { max: 100, duration: 60_000 }, // max 100 emails/min
  },
);

emailWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Email job failed');
});

// Dead-letter: after 3 failures, job moves to 'email:failed' set.
// Inspect with: await emailQueue.getFailed();
// Retry with:  await job.retry();
```

---

## "How Do You Implement Caching Without Serving Stale Data?"

```
Cache invalidation is the hardest problem in distributed systems.

Strategies:
1. TTL-based    — cache expires after N seconds (simple, can be stale)
2. Write-through — update cache when writing to DB (consistent, complex)
3. Write-behind  — update cache, write DB async (fast writes, data loss risk)
4. Cache-aside   — read from cache; miss → fetch from DB → populate cache
5. Event-driven  — publish invalidation events when data changes
```

```javascript
// Event-driven invalidation (most consistent):
// When user is updated, publish an event. All instances clear their cache.

// Redis pub/sub for cross-instance cache invalidation:
const publisher  = new Redis(process.env.REDIS_URL!);
const subscriber = new Redis(process.env.REDIS_URL!);

// In-process cache:
const localCache = new Map<string, { data: unknown; expiry: number }>();

subscriber.subscribe('cache:invalidate', (err) => {
  if (err) logger.error('Redis subscribe error', err);
});

subscriber.on('message', (_channel, key) => {
  localCache.delete(key); // invalidate across all workers via message
});

async function getUser(id: string) {
  const cacheKey = `user:${id}`;

  // Check local cache first:
  const local = localCache.get(cacheKey);
  if (local && local.expiry > Date.now()) return local.data;

  // Check Redis:
  const cached = await redis.get(cacheKey);
  if (cached) {
    const data = JSON.parse(cached);
    localCache.set(cacheKey, { data, expiry: Date.now() + 10_000 }); // 10s L1
    return data;
  }

  // Fetch from DB:
  const user = await db.users.findById(id);
  await redis.setex(cacheKey, 300, JSON.stringify(user)); // 5min L2
  localCache.set(cacheKey, { data: user, expiry: Date.now() + 10_000 });
  return user;
}

async function updateUser(id: string, data: Partial<User>) {
  await db.users.update(id, data);

  const cacheKey = `user:${id}`;
  await redis.del(cacheKey);                       // delete from Redis
  await publisher.publish('cache:invalidate', cacheKey); // clear all local caches
}

// Stampede protection — prevent 100 requests all trying to repopulate cache simultaneously:
const inFlight = new Map<string, Promise<unknown>>();

async function cachedFetch<T>(key: string, fetcher: () => Promise<T>, ttl = 300): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as T;

  // Coalesce concurrent cache misses into one DB call:
  if (!inFlight.has(key)) {
    const promise = fetcher()
      .then(data => { redis.setex(key, ttl, JSON.stringify(data)); return data; })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
  }

  return inFlight.get(key)! as Promise<T>;
}
```

---

## "How Do You Implement Multi-Region Deployments?"

```
Why: latency (users close to servers), availability (region failure tolerance).

Architecture:
  Route53 / Cloudflare → nearest region → regional load balancer → regional instances

Data challenges:
  - Single primary DB → all writes go to one region (write latency from far regions)
  - Multi-primary → conflict resolution complexity (vector clocks, CRDTs)

Common pattern: active-passive regions
  - Region A (primary): reads + writes
  - Region B (secondary): reads from replica, writes routed to region A
  - If Region A fails: promote replica in B, update DNS (~60s failover)

Simpler pattern: read-local, write-global
  - Each region has a read replica
  - Writes go to global primary (slightly more latency for writes)
  - Works when writes < 20% of traffic
```

```javascript
// Route 53 latency-based routing + health checks:
// Each region has a record with Evaluate Target Health = true.
// If /health returns 503 in us-east-1, all traffic auto-routes to eu-west-1.

// In-app: detect region for observability:
const REGION = process.env.AWS_REGION ?? 'local';

logger.info({ region: REGION, ... }, 'Request handled');
metrics.increment('requests', { region: REGION });

// Cross-region data access pattern:
class DataService {
  private localReplica: Pool;  // low latency reads
  private globalPrimary: Pool; // all writes + critical reads

  async readUser(id: string) {
    try {
      return await this.localReplica.query('SELECT * FROM users WHERE id = $1', [id]);
    } catch {
      // Replica lag or failure → fall back to primary
      return this.globalPrimary.query('SELECT * FROM users WHERE id = $1', [id]);
    }
  }

  async writeUser(id: string, data: object) {
    // Always write to global primary, regardless of caller region
    return this.globalPrimary.query('UPDATE users SET ... WHERE id = $1', [id]);
  }
}
```

---

## Quick-Fire Round 2

| Question | Answer |
|----------|--------|
| Difference between concurrency and parallelism in Node.js? | Concurrency: interleaving async I/O on one thread. Parallelism: true simultaneous execution (worker threads, cluster). |
| When would you use a message queue vs direct HTTP call? | Queue: when recipient can be down, when you want retries, when workload spikes. HTTP: when you need synchronous response. |
| What is the difference between 429 and 503? | 429 Too Many Requests = rate limited, try later. 503 Service Unavailable = server overloaded or down. |
| How do you warm up a Node.js app after deploy? | Send synthetic requests to pre-JIT-compile hot paths. k8s: configure minReadySeconds + readiness probe. |
| What is connection pooling and why does it matter? | Reuse DB connections across requests. Creating a new TCP connection + auth = 50-200ms. Pool keeps N connections warm. |
| How many connections can PostgreSQL handle? | Default max_connections = 100. Exceeded → new connections fail. Use PgBouncer to multiplex thousands of app connections. |
| What is a write-ahead log (WAL)? | DB logs every change before applying it. Used for crash recovery, replication, CDC, point-in-time restore. |
| When is eventual consistency acceptable? | Leaderboards, social feeds, counters, search indexes. Not acceptable: payments, inventory, access control. |
| What is the two-phase commit problem? | Distributed transactions across services are slow and create partial failure scenarios. Prefer sagas with compensating transactions. |
| How do you make an operation idempotent? | Accept a client-supplied `idempotency-key`, store result keyed on it, return stored result on duplicate. |
| What's the difference between optimistic and pessimistic locking? | Optimistic: read, compute, write (fail if row changed). Pessimistic: lock row at read time. Optimistic = better throughput for low contention. |
| How do you do a safe database schema migration? | Expand (add columns), deploy new code, contract (remove old columns). Never rename/drop columns in one step with live traffic. |
