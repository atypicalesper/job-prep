# Redis Fundamentals

Redis (Remote Dictionary Server) is an in-memory data structure store used as cache, message broker, session store, and more.

---

## Data Types

```
String  → simple key-value, counters, session tokens
Hash    → objects (user profile, config)
List    → queue, stack, recent items (ordered by insertion)
Set     → unique values, tags, friend lists (unordered, no duplicates)
Sorted Set → leaderboards, rate limiting, priority queues (score + member)
Bitmap  → feature flags, user activity (per-bit operations)
HyperLogLog → approximate unique count (very memory efficient)
Stream  → append-only log, event sourcing (like Kafka lite)
```

---

## String Commands

```bash
# Basic set/get
SET user:1:name "Alice"
GET user:1:name                # "Alice"

# Expiry
SET session:abc "token123" EX 3600    # expire in 3600 seconds
SET session:abc "token123" PX 3600000 # expire in milliseconds
TTL session:abc               # time remaining
PERSIST session:abc           # remove expiry

# Atomic increment (no race conditions!)
SET views:post:42 0
INCR views:post:42            # 1
INCRBY views:post:42 5        # 6
INCR likes:post:42            # atomic — safe for counters

# Conditional set
SETNX lock:job:123 "worker1"  # set only if NOT exists (lock pattern!)
SET lock:job:123 "worker1" NX EX 30  # atomic: set if not exists + expire
```

---

## Hash Commands

```bash
# Store object as hash (better than serializing to string):
HSET user:1 name "Alice" email "alice@example.com" age 30
HGET user:1 name              # "Alice"
HGETALL user:1               # { name, email, age }
HMGET user:1 name email      # ["Alice", "alice@example.com"]
HSET user:1 age 31           # update single field
HDEL user:1 age              # delete field
HEXISTS user:1 email         # 1 (exists)
HLEN user:1                  # 2 (fields remaining)
HINCRBY user:1 login_count 1 # atomic increment on hash field
```

---

## List Commands (Queue / Stack)

```bash
# FIFO queue:
RPUSH queue:emails "job1" "job2" "job3"  # push to right (tail)
LPOP queue:emails                         # pop from left (head) → "job1"
BLPOP queue:emails 30                     # blocking pop, wait up to 30s

# LIFO stack:
LPUSH stack "item1" "item2"  # push to left
LPOP stack                    # pop from left → "item2"

# Capped list (recent items):
LPUSH recent:searches "python" "javascript" "redis"
LTRIM recent:searches 0 9    # keep only 10 most recent

# Range:
LRANGE recent:searches 0 -1  # all items
LLEN recent:searches          # length
```

---

## Set Commands

```bash
# Unique members:
SADD tags:post:1 "nodejs" "javascript" "backend"
SMEMBERS tags:post:1          # {"nodejs", "javascript", "backend"}
SISMEMBER tags:post:1 "nodejs"  # 1 (true)
SCARD tags:post:1               # 3 (cardinality)
SREM tags:post:1 "backend"

# Set operations:
SUNION tags:post:1 tags:post:2        # union
SINTER tags:post:1 tags:post:2        # intersection (common tags)
SDIFF tags:post:1 tags:post:2         # difference
SUNIONSTORE dest tags:post:1 tags:post:2  # store result
```

---

## Sorted Set Commands (Leaderboard)

```bash
# Score + member:
ZADD leaderboard 1500 "alice"
ZADD leaderboard 2000 "bob"
ZADD leaderboard 1800 "charlie"

# Get by rank (0-indexed, lowest score first):
ZRANGE leaderboard 0 -1 WITHSCORES    # all, ascending
ZREVRANGE leaderboard 0 2 WITHSCORES  # top 3, descending
ZRANK leaderboard "alice"              # rank (0=lowest)
ZREVRANK leaderboard "alice"           # rank from highest
ZSCORE leaderboard "alice"             # 1500

# Range by score:
ZRANGEBYSCORE leaderboard 1000 2000 WITHSCORES  # score range

# Update score:
ZINCRBY leaderboard 100 "alice"        # atomic add to score → 1600
```

---

## Common Patterns

### Caching

```javascript
// Cache-aside pattern (most common):
async function getUserById(id: string) {
  const cacheKey = `user:${id}`;

  // 1. Check cache
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // 2. Cache miss — query DB
  const user = await db.users.findById(id);
  if (!user) return null;

  // 3. Store in cache with TTL
  await redis.setex(cacheKey, 3600, JSON.stringify(user));
  return user;
}

// Invalidation on update:
async function updateUser(id: string, data: Partial<User>) {
  const user = await db.users.update(id, data);
  await redis.del(`user:${id}`); // invalidate cache
  return user;
}
```

### Distributed Lock

```javascript
// Acquire lock with NX + EX (atomic):
async function acquireLock(resource: string, ttlMs: number = 30000) {
  const lockKey = `lock:${resource}`;
  const lockValue = crypto.randomUUID(); // unique per lock holder

  const result = await redis.set(lockKey, lockValue, 'NX', 'PX', ttlMs);
  if (result !== 'OK') return null; // lock already held

  return {
    release: async () => {
      // Lua script for atomic compare-and-delete:
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      await redis.eval(script, 1, lockKey, lockValue);
    }
  };
}

// Usage:
const lock = await acquireLock('process:invoice:123');
if (!lock) throw new Error('Could not acquire lock');

try {
  await processInvoice(123);
} finally {
  await lock.release();
}
```

### Rate Limiting

```javascript
// Fixed window rate limiter:
async function rateLimit(userId: string, limit: number, windowSec: number) {
  const key = `rate:${userId}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSec);
  return count <= limit;
}

// Sliding window with sorted sets:
async function slidingWindowLimit(userId: string, limit: number, windowMs: number) {
  const key = `rate:sliding:${userId}`;
  const now = Date.now();
  const windowStart = now - windowMs;

  const multi = redis.multi();
  multi.zremrangebyscore(key, 0, windowStart); // remove old entries
  multi.zadd(key, now, `${now}-${Math.random()}`); // add current
  multi.zcard(key); // count in window
  multi.expire(key, Math.ceil(windowMs / 1000));

  const results = await multi.exec();
  const count = results[2] as number;
  return count <= limit;
}
```

### Session Storage

```javascript
// Store session:
await redis.hset(`session:${sessionId}`, {
  userId: user.id,
  createdAt: Date.now(),
  data: JSON.stringify(sessionData)
});
await redis.expire(`session:${sessionId}`, 86400); // 24h

// Get session:
const session = await redis.hgetall(`session:${sessionId}`);
if (!session?.userId) throw new Error('Invalid session');
```

### Job Queue

```javascript
// Producer:
await redis.lpush('jobs:email', JSON.stringify({
  to: 'alice@example.com',
  subject: 'Welcome!',
  template: 'welcome'
}));

// Consumer (blocking):
while (true) {
  const [queue, job] = await redis.blpop('jobs:email', 0); // block forever
  await processEmailJob(JSON.parse(job));
}
```

---

## Pub/Sub

```javascript
// Publisher (Node.js):
const publisher = redis.duplicate();
await publisher.publish('user:events', JSON.stringify({
  type: 'user:created',
  userId: '123',
  timestamp: Date.now()
}));

// Subscriber:
const subscriber = redis.duplicate();
await subscriber.subscribe('user:events');
subscriber.on('message', (channel, message) => {
  const event = JSON.parse(message);
  console.log(`Event: ${event.type}`);
});

// Pattern subscribe:
await subscriber.psubscribe('user:*'); // matches user:created, user:deleted, etc.
subscriber.on('pmessage', (pattern, channel, message) => {
  // pattern, actual channel, message
});
```

---

## Persistence Options

```
RDB (Redis Database) — Snapshots
- Periodic dump to disk (configurable intervals: every N seconds if M changes)
- Smaller files, faster restart
- Risk: data loss since last snapshot

AOF (Append Only File) — Write log
- Logs every write command
- Much more durable (fsync: always, everysec, or no)
- Larger files, slower restart, can rewrite to compact

Both: Use both for best durability
```

---

## Interview Questions

**Q: Why is Redis single-threaded and fast?**
A: Redis uses a single thread for command processing (I/O multiplexing via epoll/kqueue). No context switching, no lock contention. Operations are O(1) or O(log n). Data is in-memory — no disk I/O for reads. Starting Redis 6.0, network I/O uses multiple threads, but command execution is still single-threaded.

**Q: What is the difference between EXPIRE and EXPIREAT?**
A: `EXPIRE key seconds` sets relative TTL. `EXPIREAT key unix-timestamp` sets absolute expiry. `PEXPIRE` and `PEXPIREAT` are millisecond variants. `PERSIST` removes the TTL.

**Q: How do you implement a distributed lock with Redis?**
A: `SET key value NX PX ttl` atomically. NX = only if not exists, PX = millisecond TTL. Store a unique value (UUID) so only the lock holder can release it. Release with a Lua script to atomically check value and delete — prevents accidentally releasing someone else's lock. This is the basis of the Redlock algorithm for multi-node Redis.

**Q: What is the difference between Redis Pub/Sub and Redis Streams?**
A: Pub/Sub is fire-and-forget — messages are only delivered to currently-connected subscribers and not stored. Streams (`XADD`, `XREAD`, consumer groups) are like Kafka — messages are persisted, can be read by multiple consumer groups, messages can be acknowledged, and slow consumers don't lose data.
