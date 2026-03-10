# System Design Practice Questions

Full worked answers for common senior/SDE3 interview questions.

---

## Q1: Design a Job Queue System

**Requirements**: Process millions of background jobs (email sending, image resizing), guarantee at-least-once delivery, support retries, priority, scheduling, and dead-letter queue. Scale to 10K jobs/second.

### Answer

```
Clarifying questions:
- Exactly-once or at-least-once? → at-least-once (idempotent consumers)
- How long can jobs wait? → seconds for high priority, minutes for low
- Job types? → heterogeneous (different handlers per type)
- Max job size? → 100KB payload
- Observability needs? → yes, see job status, retry history, DLQ

High-Level Architecture:
  Producers → API → Job Store (Redis/DB) → Workers → Result/DLQ
```

**Data Model**:
```typescript
interface Job {
  id: string;            // UUID
  type: string;          // 'send_email', 'resize_image'
  payload: object;       // max 100KB
  priority: 1 | 2 | 3;  // 1 = high
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'dead';
  attempts: number;
  maxAttempts: number;   // default 3
  runAt: Date;           // for scheduled jobs
  createdAt: Date;
  updatedAt: Date;
  workerId?: string;     // which worker is processing
  error?: string;        // last error message
}
```

**Storage Choice**:
```
Redis Sorted Sets (BullMQ pattern):
  - Score = job runAt timestamp → natural ordering
  - ZADD queue:high 1706000000 job:123
  - ZRANGEBYSCORE queue:high 0 now LIMIT 0 1 → get next job
  - Atomically move to processing set (Lua script)

PostgreSQL for durability + audit:
  - Persist job history, retry log, DLQ
  - Redis is cache/queue, Postgres is source of truth
  - Sync via background worker or event
```

**Worker Processing**:
```typescript
// Fetch and lock atomically with Lua:
const FETCH_JOB_SCRIPT = `
  local job = redis.call('ZRANGEBYSCORE', KEYS[1], 0, ARGV[1], 'LIMIT', 0, 1)
  if #job == 0 then return nil end
  redis.call('ZREM', KEYS[1], job[1])
  redis.call('ZADD', KEYS[2], ARGV[2], job[1])  -- add to processing set
  return job[1]
`;

async function processJobs(workerId: string) {
  while (true) {
    const jobId = await redis.eval(FETCH_JOB_SCRIPT, 2,
      'queue:high', 'queue:processing',
      Date.now().toString(), (Date.now() + 30_000).toString() // 30s visibility timeout
    );

    if (!jobId) {
      await sleep(100); // backoff when queue empty
      continue;
    }

    const job = await db.jobs.findById(jobId);
    try {
      await handlers[job.type](job.payload);
      await markCompleted(job.id);
    } catch (err) {
      await handleFailure(job, err);
    }
  }
}

async function handleFailure(job: Job, err: Error) {
  const attempts = job.attempts + 1;
  if (attempts >= job.maxAttempts) {
    await moveToDLQ(job, err.message);
  } else {
    // Exponential backoff: 2^attempt * 1000ms
    const delay = Math.pow(2, attempts) * 1000;
    await requeueWithDelay(job.id, delay, attempts);
  }
}
```

**Scale to 10K jobs/second**:
```
- Redis Cluster with job sharding by type
- Multiple worker pools per job type (horizontal scaling)
- Worker pool size = (target_throughput / avg_job_time_ms) * 1000
  e.g., 100 jobs/worker/sec → 100 workers for 10K/sec
- Separate queues per priority, workers poll high priority first
- Dead letter queue separate Redis list with alerting
```

---

## Q2: Design an API Rate Limiter

**Requirements**: Rate limit API requests per user. Allow 1000 req/min per user globally, 100 req/min per endpoint. Must work across multiple API server instances. Low latency overhead (<1ms per request).

### Answer

```
Algorithm choice:
  Fixed window: simple but has burst problem (2x rate at window boundary)
  Sliding window log: accurate but O(requests) memory
  Sliding window counter: approximation, O(1) memory — best for this
  Token bucket: allows controlled burst, good for per-endpoint

Use: sliding window counter for global limit, token bucket for endpoint limit
```

**Sliding Window Counter (Redis)**:
```typescript
async function checkRateLimit(
  userId: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now();
  const windowStart = now - windowMs;
  const key = `ratelimit:${userId}`;

  // Atomic Lua script:
  const script = `
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local window_start = tonumber(ARGV[2])
    local limit = tonumber(ARGV[3])
    local window_ms = tonumber(ARGV[4])

    -- Remove old entries outside window:
    redis.call('ZREMRANGEBYSCORE', key, 0, window_start)

    -- Count current requests:
    local count = redis.call('ZCARD', key)

    if count >= limit then
      return {0, 0, now + window_ms}  -- denied
    end

    -- Add this request:
    redis.call('ZADD', key, now, now .. '-' .. math.random())
    redis.call('PEXPIRE', key, window_ms)

    return {1, limit - count - 1, now + window_ms}
  `;

  const [allowed, remaining, resetAt] = await redis.eval(
    script, 1, key, now, windowStart, limit, windowMs
  ) as [number, number, number];

  return {
    allowed: allowed === 1,
    remaining,
    resetAt,
  };
}

// Middleware:
app.use(async (req, res, next) => {
  const userId = req.user?.id ?? req.ip;
  const { allowed, remaining, resetAt } = await checkRateLimit(
    userId, 1000, 60_000
  );

  res.setHeader('X-RateLimit-Limit', 1000);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(resetAt / 1000));

  if (!allowed) {
    return res.status(429).json({
      error: 'Too Many Requests',
      retryAfter: Math.ceil((resetAt - Date.now()) / 1000),
    });
  }

  next();
});
```

**Per-endpoint with Token Bucket**:
```typescript
// Token bucket allows burst up to bucket size, refills at rate/second
async function tokenBucket(
  key: string,
  capacity: number,    // max tokens (burst allowance)
  refillRate: number,  // tokens per second
): Promise<boolean> {
  const script = `
    local key = KEYS[1]
    local capacity = tonumber(ARGV[1])
    local refill_rate = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])

    local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
    local tokens = tonumber(bucket[1]) or capacity
    local last_refill = tonumber(bucket[2]) or now

    -- Calculate tokens to add since last refill:
    local elapsed = (now - last_refill) / 1000  -- seconds
    tokens = math.min(capacity, tokens + elapsed * refill_rate)

    if tokens < 1 then
      redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
      redis.call('PEXPIRE', key, 60000)
      return 0  -- denied
    end

    tokens = tokens - 1
    redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
    redis.call('PEXPIRE', key, 60000)
    return 1  -- allowed
  `;

  const result = await redis.eval(script, 1, key, capacity, refillRate, Date.now());
  return result === 1;
}
```

---

## Q3: Design a Distributed Caching System

**Requirements**: Cache service for microservices. Support TTL, cache invalidation on data change, handle cache stampede, 99.99% availability.

### Answer

```
Layers:
  1. In-process cache (Map/LRU) — microseconds, per-instance
  2. Redis cluster — milliseconds, shared across instances
  3. Database — fallback, full data

Multi-level caching:
```

```typescript
class MultiLevelCache {
  private l1 = new LRUCache<string, { value: any; expires: number }>({
    max: 1000,  // 1000 entries in process memory
  });

  constructor(
    private redis: Redis,
    private db: Database,
  ) {}

  async get<T>(key: string, fetchFn: () => Promise<T>, ttlMs: number): Promise<T> {
    // L1: in-process
    const l1Hit = this.l1.get(key);
    if (l1Hit && l1Hit.expires > Date.now()) {
      return l1Hit.value as T;
    }

    // L2: Redis — with stampede protection
    const redisValue = await this.redis.get(key);
    if (redisValue) {
      const parsed = JSON.parse(redisValue) as T;
      // Populate L1 with shorter TTL (to avoid stale within process):
      this.l1.set(key, { value: parsed, expires: Date.now() + Math.min(ttlMs, 30_000) });
      return parsed;
    }

    // Cache miss — use lock to prevent stampede:
    return this.fetchWithLock(key, fetchFn, ttlMs);
  }

  private async fetchWithLock<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlMs: number,
  ): Promise<T> {
    const lockKey = `lock:${key}`;

    // Try to acquire lock (only one process fetches from DB):
    const locked = await this.redis.set(lockKey, '1', 'NX', 'PX', 5000);

    if (!locked) {
      // Wait and retry — another process is fetching:
      await new Promise(r => setTimeout(r, 50));
      return this.get(key, fetchFn, ttlMs); // retry (may hit cache this time)
    }

    try {
      const value = await fetchFn();
      await this.redis.set(key, JSON.stringify(value), 'PX', ttlMs);
      this.l1.set(key, { value, expires: Date.now() + Math.min(ttlMs, 30_000) });
      return value;
    } finally {
      await this.redis.del(lockKey);
    }
  }

  // Invalidate across all instances:
  async invalidate(key: string) {
    await this.redis.del(key);
    this.l1.delete(key);
    // Publish invalidation to other instances' L1 caches:
    await this.redis.publish('cache:invalidate', key);
  }
}

// Subscribe to invalidation events:
subscriber.subscribe('cache:invalidate', (key) => {
  cache.l1.delete(key);
});
```

**Cache Availability (99.99%)**:
```
Redis Cluster: 6 nodes (3 primary + 3 replica), automatic failover
Circuit breaker: if Redis is down, fall through to DB (slower but works)
Stale-while-revalidate: return stale data while async refresh
Jitter on TTL: randomize TTL by ±10% to prevent thundering herd at expiry
```

---

## Q4: Design a Leaderboard System

**Requirements**: Real-time leaderboard for a game, 10M players, score updates 100/second, rank query <10ms, top-100 list <10ms, update a player's rank in real-time via WebSocket.

### Answer

```typescript
// Redis Sorted Set is perfect for leaderboards:
// ZADD, ZRANK, ZRANGE, ZINCRBY are all O(log N)

const LEADERBOARD_KEY = 'leaderboard:global';

async function updateScore(userId: string, score: number) {
  // Set score (not increment — scores come from game servers):
  await redis.zadd(LEADERBOARD_KEY, score, userId);

  // Notify via WebSocket (publish to Redis pub/sub):
  const rank = await redis.zrevrank(LEADERBOARD_KEY, userId);
  await redis.publish('leaderboard:updates', JSON.stringify({
    userId,
    score,
    rank: rank + 1, // 0-indexed → 1-indexed
  }));
}

async function getTop(n: number) {
  // ZREVRANGE with scores — O(log N + N)
  const entries = await redis.zrevrangebyscore(
    LEADERBOARD_KEY, '+inf', '-inf',
    'WITHSCORES', 'LIMIT', 0, n
  );

  // Parse result: [userId, score, userId, score, ...]
  const result = [];
  for (let i = 0; i < entries.length; i += 2) {
    result.push({
      rank: i / 2 + 1,
      userId: entries[i],
      score: parseFloat(entries[i + 1]),
    });
  }
  return result;
}

async function getPlayerRank(userId: string) {
  const [rank, score] = await Promise.all([
    redis.zrevrank(LEADERBOARD_KEY, userId),  // O(log N)
    redis.zscore(LEADERBOARD_KEY, userId),
  ]);

  if (rank === null) return null;
  return { rank: rank + 1, score: parseFloat(score!) };
}

// Get surrounding players (±5 places):
async function getNearbyPlayers(userId: string) {
  const rank = await redis.zrevrank(LEADERBOARD_KEY, userId);
  if (rank === null) return null;

  const start = Math.max(0, rank - 5);
  const stop = rank + 5;
  const entries = await redis.zrevrange(LEADERBOARD_KEY, start, stop, 'WITHSCORES');
  // Parse same as getTop()...
}
```

**Scale concerns**:
```
10M players:
  Redis Sorted Set: O(log N) = ~23 operations for 10M — negligible
  Memory: ~64 bytes per entry × 10M = ~640MB — fits in one Redis node

100 updates/second:
  Redis single-threaded: handles ~100K commands/sec — no issue

Real-time rank changes:
  Don't publish every score update (100/sec × subscribers = stampede)
  Options:
    1. Debounce: publish rank only when rank changes by > 10 places
    2. Client polls /rank every 5 seconds
    3. WebSocket: publish batched updates every 1 second
```

---

## Q5: Design a Logging and Alerting System

**Requirements**: Collect logs from 100 microservices (10K logs/second), search logs, alert when error rate exceeds threshold, 30-day retention.

### Answer

```
Architecture: ELK-style or Grafana Loki

Collection:
  Services → Filebeat/Fluentd → Kafka (buffer for spikes) → Indexer → Storage

Components:
  Kafka: durable buffer, handles 10K/sec easily
  Logstash/Fluentbit: parse, enrich, route logs
  Elasticsearch or Loki: storage and search
  Kibana or Grafana: visualization and alerting

Structured logging in services:
```

```typescript
// All services emit structured JSON:
import pino from 'pino';

const log = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: 'user-service',
    version: process.env.APP_VERSION,
    environment: process.env.NODE_ENV,
  },
  // Redact sensitive fields:
  redact: ['body.password', 'body.token', 'headers.authorization'],
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Request middleware adds trace context:
app.use((req, res, next) => {
  req.log = log.child({
    traceId: req.headers['x-trace-id'] || crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    userId: req.user?.id,
  });
  next();
});

// Log format:
// {"level":"info","time":"2024-01-15T10:30:00Z","service":"user-service",
//  "traceId":"abc-123","userId":"u-456","event":"user.created","latencyMs":45}

// Alerting rule (Prometheus/Grafana):
// Alert when: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05
// = error rate > 5% for 5 minutes
```

**Alerting pipeline**:
```
Prometheus → Alert Manager → PagerDuty/Slack
  - Error rate rule: > 5% for 5 minutes
  - Latency rule: p99 > 2 seconds for 3 minutes
  - Queue depth rule: job queue > 10K items

Deduplication: AlertManager groups identical alerts within 5 minutes
Routing: critical → PagerDuty (page on-call), warning → Slack #alerts
Runbooks: every alert links to a runbook (what to check, how to fix)
```

---

## Interview Tips

**Structure every design answer**:
1. Clarify requirements (functional + non-functional: scale, latency, availability)
2. Estimate scale (requests/sec, data size, storage)
3. High-level architecture (draw components and data flow)
4. Deep dive 2-3 critical components (the interviewer will ask)
5. Identify bottlenecks and tradeoffs
6. Address monitoring and failure modes

**Tradeoff vocabulary**:
- "We could use X or Y. X gives us [benefit] but costs [tradeoff]. Y is simpler but [limitation]. Given [requirement], I'd choose X."
- "This is a consistency vs availability tradeoff. In this case, [business reason] means availability wins."
- "The bottleneck is [component]. We can scale it by [approach] at the cost of [complexity/cost]."
