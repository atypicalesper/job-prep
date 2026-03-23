# Rate Limiter — Implementation Deep Dive

## Why Rate Limiting?

- **Protect services** from traffic spikes / DoS
- **Enforce quotas** (free tier: 100 req/day)
- **Prevent abuse** (brute-force login, scraping)
- **Cost control** (LLM API calls, SMS)

---

## Algorithm 1: Fixed Window Counter

Divide time into fixed windows (e.g., every 60s). Count requests per window.

```
  Window 1          Window 2
[0s ─────── 60s] [60s ──────── 120s]
   99 requests       1 request
```

**Problem:** Boundary spike — 99 requests at 59s + 99 requests at 61s = 198 in 2 seconds.

```js
class FixedWindowLimiter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.counts = new Map(); // key → { count, windowStart }
  }

  isAllowed(key) {
    const now = Date.now();
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const entry = this.counts.get(key);

    if (!entry || entry.windowStart !== windowStart) {
      this.counts.set(key, { count: 1, windowStart });
      return true;
    }
    if (entry.count >= this.limit) return false;
    entry.count++;
    return true;
  }
}
```

**Redis implementation:**
```js
async function fixedWindowRedis(client, key, limit, windowSeconds) {
  const windowKey = `ratelimit:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
  const count = await client.incr(windowKey);
  if (count === 1) await client.expire(windowKey, windowSeconds);
  return count <= limit;
}
```

---

## Algorithm 2: Sliding Window Log

Store timestamps of each request. Count how many fall within the last `windowMs`.

```js
class SlidingWindowLog {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.logs = new Map(); // key → sorted array of timestamps
  }

  isAllowed(key) {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    if (!this.logs.has(key)) this.logs.set(key, []);
    const log = this.logs.get(key);

    // Remove expired entries
    while (log.length && log[0] <= cutoff) log.shift();

    if (log.length >= this.limit) return false;
    log.push(now);
    return true;
  }
}
```

**Redis with sorted set:**
```js
async function slidingWindowLog(client, key, limit, windowMs) {
  const now = Date.now();
  const cutoff = now - windowMs;
  const redisKey = `ratelimit:${key}`;

  const pipeline = client.multi();
  pipeline.zRemRangeByScore(redisKey, 0, cutoff);
  pipeline.zAdd(redisKey, [{ score: now, value: `${now}-${Math.random()}` }]);
  pipeline.zCard(redisKey);
  pipeline.expire(redisKey, Math.ceil(windowMs / 1000));
  const results = await pipeline.exec();

  const count = results[2];
  return count <= limit;
}
```

**Downside:** Memory-heavy — stores every request timestamp.

---

## Algorithm 3: Sliding Window Counter (Best Balance)

Approximate the sliding window using two fixed windows weighted by overlap.

```
Previous window (full)   Current window (partial)
[─────────────────────][──────────────|]
                         70% overlap     30% in current
current_count = prev_count * 0.7 + this_window_count
```

```js
class SlidingWindowCounter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.data = new Map(); // key → { prevCount, currCount, windowStart }
  }

  isAllowed(key) {
    const now = Date.now();
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const timeInWindow = now - windowStart;
    const prevWeight = 1 - timeInWindow / this.windowMs;

    let entry = this.data.get(key);
    if (!entry || entry.windowStart + this.windowMs * 2 < now) {
      entry = { prevCount: 0, currCount: 0, windowStart };
    } else if (entry.windowStart !== windowStart) {
      // Rolled into new window
      entry = { prevCount: entry.currCount, currCount: 0, windowStart };
    }

    const estimated = Math.floor(entry.prevCount * prevWeight) + entry.currCount;
    if (estimated >= this.limit) {
      this.data.set(key, entry);
      return false;
    }

    entry.currCount++;
    this.data.set(key, entry);
    return true;
  }
}
```

---

## Algorithm 4: Token Bucket

Tokens refill at a constant rate. Each request consumes one token. Allows bursting up to bucket capacity.

```
Bucket capacity: 10 tokens
Refill rate:     2 tokens/second

t=0s:  bucket=10, request → bucket=9   ✓
t=0s:  bucket=9,  request → bucket=8   ✓
t=1s:  bucket=10, request → bucket=9   ✓ (refilled by 2, capped at 10)
```

```js
class TokenBucket {
  constructor(capacity, refillRatePerSecond) {
    this.capacity = capacity;
    this.refillRate = refillRatePerSecond;
    this.buckets = new Map(); // key → { tokens, lastRefill }
  }

  isAllowed(key) {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefill: now };
    } else {
      // Refill tokens based on elapsed time
      const elapsed = (now - bucket.lastRefill) / 1000;
      bucket.tokens = Math.min(
        this.capacity,
        bucket.tokens + elapsed * this.refillRate
      );
      bucket.lastRefill = now;
    }

    if (bucket.tokens < 1) {
      this.buckets.set(key, bucket);
      return false;
    }

    bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return true;
  }
}

// Usage
const limiter = new TokenBucket(10, 2); // 10 tokens, refill 2/sec
```

**Redis token bucket (atomic with Lua):**
```js
const TOKEN_BUCKET_SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])

local data = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(data[1]) or capacity
local last_refill = tonumber(data[2]) or now

-- Refill
local elapsed = (now - last_refill) / 1000
tokens = math.min(capacity, tokens + elapsed * refill_rate)

if tokens < 1 then
  redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
  redis.call('EXPIRE', key, ttl)
  return 0
end

tokens = tokens - 1
redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
redis.call('EXPIRE', key, ttl)
return 1
`;

async function tokenBucketRedis(client, key, capacity, refillRate) {
  const result = await client.eval(TOKEN_BUCKET_SCRIPT, {
    keys: [`bucket:${key}`],
    arguments: [capacity, refillRate, Date.now(), Math.ceil(capacity / refillRate + 10)].map(String),
  });
  return result === 1;
}
```

---

## Algorithm 5: Leaky Bucket

Requests enter a queue (bucket). They drip out at a fixed rate. Smooths traffic.

```
 Incoming requests →  [queue]  → process at 100 req/s
                      (bucket)
 If queue full → reject
```

```js
class LeakyBucket {
  constructor(rate, capacity) {
    this.rate = rate;         // requests per ms
    this.capacity = capacity;
    this.queues = new Map();
  }

  isAllowed(key) {
    const now = Date.now();
    let state = this.queues.get(key) || { queue: 0, lastLeak: now };

    // Leak: drain requests that would have been processed since lastLeak
    const elapsed = now - state.lastLeak;
    state.queue = Math.max(0, state.queue - elapsed * this.rate);
    state.lastLeak = now;

    if (state.queue >= this.capacity) {
      this.queues.set(key, state);
      return false;
    }

    state.queue += 1;
    this.queues.set(key, state);
    return true;
  }
}
```

---

## Algorithm Comparison

| Algorithm | Burst allowed | Memory | Accuracy | Best for |
|---|---|---|---|---|
| Fixed Window | At boundaries | O(1)/key | Low | Simple APIs |
| Sliding Log | Yes | O(req/window)/key | Exact | Low-traffic, strict |
| Sliding Counter | Approximated | O(1)/key | ~High | General purpose |
| Token Bucket | Yes, up to capacity | O(1)/key | High | APIs with burst tolerance |
| Leaky Bucket | No | O(queue)/key | High | Smooth output rate |

---

## Express Middleware Integration

```js
// middleware/rateLimit.js
const { createClient } = require('redis');

const client = createClient({ url: process.env.REDIS_URL });
await client.connect();

function rateLimit({ limit = 100, windowMs = 60_000, keyFn } = {}) {
  return async (req, res, next) => {
    const key = keyFn ? keyFn(req) : req.ip;

    try {
      const allowed = await slidingWindowLog(client, key, limit, windowMs);
      res.setHeader('X-RateLimit-Limit', limit);

      if (!allowed) {
        return res.status(429).json({
          error: 'Too Many Requests',
          retryAfter: Math.ceil(windowMs / 1000),
        });
      }
      next();
    } catch (err) {
      // Fail open — don't block users if Redis is down
      console.error('Rate limiter error:', err);
      next();
    }
  };
}

// Usage
app.use('/api/login', rateLimit({ limit: 5, windowMs: 60_000 }));
app.use('/api/', rateLimit({
  limit: 1000,
  windowMs: 60_000,
  keyFn: (req) => req.user?.id || req.ip, // per-user for auth'd requests
}));
```

---

## Distributed Rate Limiting

In a multi-node deployment, each server has its own in-memory count. The aggregate rate would be `limit * numServers`.

**Solutions:**
1. **Redis** — Centralized atomic counter (shown above). Single point of failure risk → use Redis Cluster.
2. **Sticky sessions** — Route a user to the same server (breaks horizontal scaling).
3. **Token bucket synced with gossip** — Each node maintains local bucket, syncs periodically. Allows some imprecision but highly available.

---

## Interview Q&A

**Q: Which algorithm does Nginx use?**

Leaky bucket (`limit_req_zone`). It smooths traffic spikes and queues excess requests up to the burst size.

**Q: Which algorithm does Stripe/most APIs use?**

Token bucket — it allows short bursts while still enforcing an average rate. Most developer-friendly.

**Q: What happens if Redis goes down?**

Fail open (pass all requests) to keep service available, or fail closed (block all requests) if correctness is critical. Most rate limiters fail open to avoid causing an outage.

**Q: How do you rate limit a distributed system without Redis?**

Approximate counters with a gossip protocol (Riak's `riak_core`) or use a service mesh (Envoy/Istio) that handles rate limiting at the infrastructure level.

**Q: How would you design a rate limiter for a multi-tenant SaaS?**

Multiple tiers with different limits. Key by `tenantId:endpoint`. Store limits per tenant in DB, cache in Redis. Add a burst multiplier for paid tiers. Return `X-RateLimit-Remaining` and `Retry-After` headers.
