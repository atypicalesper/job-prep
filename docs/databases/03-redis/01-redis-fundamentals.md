# Redis Fundamentals

Redis (Remote Dictionary Server) is an in-memory data structure store used as cache, message broker, session store, and more.

---

## Data Types

Redis is not just a key-value store — it provides a set of native data structures that operate atomically at the server. Choosing the right data type is what makes Redis solutions elegant: using a sorted set for a leaderboard is idiomatic; simulating it with strings requires application-side sorting and loses atomicity. Each data type is optimized for specific operations (strings for counters, sorted sets for score-ordered data, hyperloglog for approximate counting) and the choice directly impacts performance and memory usage.

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

Despite the name, Redis strings can hold any binary data up to 512MB — text, serialized JSON, integers, or raw bytes. The atomic increment commands (`INCR`, `INCRBY`) are one of Redis's most important features: they read and increment a counter in a single operation, eliminating the read-modify-write race condition that would occur if you did this in application code. The `NX` flag on `SET` enables the distributed lock primitive — a key that can only be set if it does not already exist, atomically.

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

A Redis hash is a flat map of string fields to string values stored under a single key — ideal for representing objects like user profiles or configuration records. The advantage over storing the entire object as a serialized JSON string is granularity: you can read or update a single field without fetching and reserializing the whole object. `HINCRBY` allows atomic increment of a specific field, which is useful for per-user counters stored alongside other user data.

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

A Redis list is an ordered sequence of strings implemented as a doubly-linked list, making head and tail operations O(1). This makes it the natural data structure for queues (push to tail, pop from head) and stacks (push and pop from the same end). `BLPOP` (blocking left pop) is key for job queues: it blocks the connection until an item is available or the timeout expires, eliminating the need for polling loops. `LTRIM` is the pattern for maintaining a capped recent-items list — push the new item, then trim to keep only the N most recent.

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

A Redis set is an unordered collection of unique string members. The uniqueness guarantee is enforced atomically — `SADD` is idempotent for duplicate values. Sets are optimized for membership tests (`SISMEMBER` is O(1)) and set algebra (`SUNION`, `SINTER`, `SDIFF`), making them suitable for tracking unique visitors, computing tag intersections, or finding users common to two segments. When ordering or scoring matters, use a sorted set instead.

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

A sorted set stores unique members each associated with a floating-point score. Members are always kept in score order, enabling O(log n) insertion, O(log n) rank lookup, and O(log n + k) range queries. This makes sorted sets ideal for leaderboards, priority queues, rate limiting with sliding windows, and any application that needs both uniqueness and ordering. `ZINCRBY` atomically adds to a member's score, handling the concurrent increment problem that would require a transaction in a regular database.

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

The cache-aside (lazy loading) pattern is the most common Redis caching strategy. The application is responsible for populating the cache on a miss and invalidating it on write — the database is the source of truth, and Redis is a fast approximation. The TTL (time-to-live) is a safety net: even if explicit invalidation is missed, the cached data will eventually expire. The key design decision is TTL length — too short and the cache hit rate drops; too long and stale data lingers after updates.

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

A distributed lock ensures that only one process across multiple machines can execute a critical section at a time. Redis implements this with `SET key value NX PX ttl`: the `NX` flag makes the set conditional (only if the key does not exist), and `PX` sets an expiry so the lock is automatically released if the holder crashes. The lock value must be unique per holder (a UUID) so that the release operation can verify it is releasing its own lock, not one acquired by a different process after a timeout.

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

Rate limiting controls how many requests a client can make in a given time window. The fixed window approach is simple: key the counter by user ID and the current window index, increment atomically, and set an expiry on the first increment. The sliding window approach uses a sorted set, where each request is stored as a member with its timestamp as the score — you remove expired entries and count what remains, giving a true per-rolling-period limit without the spike vulnerability at window boundaries.

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

Redis is the canonical session store for horizontally scaled applications. Unlike in-memory sessions (which are tied to one server instance), Redis sessions survive restarts and work across all instances. Storing sessions as hashes (rather than serialized strings) allows individual fields to be read or updated without loading and reserializing the entire session object. The TTL on the session key acts as the session timeout — sliding expiration can be implemented by resetting the TTL on each access.

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

A Redis list works as a simple, durable job queue: producers push jobs to the tail, and consumers pop from the head. `BLPOP` with a timeout of 0 blocks indefinitely until a job appears, making it a push-based queue with no polling overhead. For production workloads with reliability requirements (retry on failure, acknowledgement, visibility timeout), consider purpose-built libraries like BullMQ or use Redis Streams instead, which offer these guarantees natively.

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

Redis Pub/Sub is a messaging pattern where publishers send messages to named channels without knowing who is listening, and subscribers receive all messages published to their subscribed channels. It is fire-and-forget: if no subscriber is connected when a message is published, the message is lost permanently. This makes Pub/Sub suitable for ephemeral, real-time notifications (live dashboard updates, cache invalidation signals, WebSocket fan-out) but unsuitable for anything requiring reliable delivery.

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

Redis is primarily in-memory, but it provides two persistence mechanisms so data survives restarts. RDB (snapshotting) periodically writes the entire dataset to disk — fast to restore but may lose writes since the last snapshot. AOF (Append-Only File) logs every write command — more durable but generates larger files and slower restarts. The `fsync` policy on AOF controls the durability guarantee: `always` (safest, slowest), `everysec` (one second of data loss risk, good balance), or `no` (OS decides, fastest). Most production deployments enable both for combined safety.

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
