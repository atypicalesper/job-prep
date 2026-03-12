# Caching Strategies

Caching is the single highest-ROI performance technique. A cache hit costs microseconds; a DB query costs milliseconds. But bad caching causes stale data, stampedes, and hard-to-debug bugs.

---

## Cache Hierarchy

```
Request → L1 (in-process memory) → L2 (Redis) → L3 (DB/origin)
            ~0.1ms                   ~1-5ms         ~10-100ms

Each layer is ~10-100x slower than the one above.
Serve from the highest (fastest) layer possible.
```

---

## Cache-Aside (Lazy Loading) — Most Common Pattern

```typescript
// Read: check cache → miss → fetch → populate cache
// Write: update DB, then invalidate cache

async function getUser(id: string): Promise<User> {
  // 1. Check Redis
  const cached = await redis.get(`user:${id}`);
  if (cached) return JSON.parse(cached) as User;

  // 2. Cache miss — fetch from DB
  const user = await db.users.findById(id);
  if (!user) throw new NotFoundError(id);

  // 3. Populate cache (5 min TTL)
  await redis.setex(`user:${id}`, 300, JSON.stringify(user));
  return user;
}

async function updateUser(id: string, patch: Partial<User>): Promise<User> {
  const user = await db.users.update(id, patch);
  await redis.del(`user:${id}`); // invalidate — next read will repopulate
  return user;
}
```

**When to use:** read-heavy data that changes infrequently. Default choice.

---

## Write-Through — Cache Always Up to Date

```typescript
// Write: update both DB and cache simultaneously
// Read: always from cache (guaranteed fresh)

async function updateUser(id: string, patch: Partial<User>): Promise<User> {
  const user = await db.users.update(id, patch);
  await redis.setex(`user:${id}`, 3600, JSON.stringify(user)); // update cache too
  return user;
}

// Benefit: no stale reads
// Cost: every write hits both DB and Redis (slightly slower writes)
```

---

## Two-Level Cache (L1 in-process + L2 Redis)

```typescript
// L1: Map/LRU in memory (0.1ms, no network)
// L2: Redis (2ms, shared across instances)

import LRUCache from 'lru-cache';

const l1 = new LRUCache<string, User>({
  max:  500,                   // max 500 entries
  ttl:  10_000,                // 10 second TTL
});

async function getUser(id: string): Promise<User> {
  const key = `user:${id}`;

  // L1 check (sync, zero network):
  const l1Hit = l1.get(key);
  if (l1Hit) return l1Hit;

  // L2 check (Redis):
  const l2Hit = await redis.get(key);
  if (l2Hit) {
    const user = JSON.parse(l2Hit) as User;
    l1.set(key, user); // backfill L1
    return user;
  }

  // Miss — fetch from DB:
  const user = await db.users.findById(id);
  await redis.setex(key, 300, JSON.stringify(user)); // populate L2
  l1.set(key, user);                                 // populate L1
  return user;
}

// Cache invalidation across all instances:
// When a user is updated, publish an invalidation event
// so all instances clear their L1 cache:
async function invalidateUser(id: string) {
  const key = `user:${id}`;
  await redis.del(key);                    // clear L2
  await redis.publish('invalidate', key);  // notify all instances
}

// Each instance subscribes:
const sub = redis.duplicate();
await sub.subscribe('invalidate');
sub.on('message', (_, key) => l1.delete(key)); // clear L1 on event
```

---

## Cache Stampede Protection

```typescript
// Problem: 1000 requests all miss cache simultaneously
// → 1000 DB queries at once → DB overload

// Solution: request coalescing (single-flight)

const inFlight = new Map<string, Promise<unknown>>();

async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSec = 300,
): Promise<T> {
  // Check cache first
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as T;

  // Coalesce concurrent cache misses into one DB call:
  if (!inFlight.has(key)) {
    const promise = fetcher()
      .then(async data => {
        await redis.setex(key, ttlSec, JSON.stringify(data));
        return data;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
  }

  return inFlight.get(key) as Promise<T>;
}

// 1000 concurrent misses for 'user:42'
// → only 1 DB query fires, 999 others await the same promise
```

---

## Cache Warm-Up

```typescript
// After deploy, cache is empty → first users hit cold DB
// Solution: pre-warm on startup

async function warmCache() {
  console.log('Warming cache...');

  // Pre-load hot data on startup:
  const [topUsers, popularPosts, config] = await Promise.all([
    db.users.findTopActive(100),    // top 100 active users
    db.posts.findTrending(50),      // trending posts
    db.config.findAll(),            // app config (rarely changes)
  ]);

  const pipeline = redis.pipeline();
  topUsers.forEach(u  => pipeline.setex(`user:${u.id}`,    3600, JSON.stringify(u)));
  popularPosts.forEach(p => pipeline.setex(`post:${p.id}`, 1800, JSON.stringify(p)));
  config.forEach(c    => pipeline.setex(`config:${c.key}`,  86400, JSON.stringify(c)));
  await pipeline.exec();

  console.log(`Cache warmed: ${topUsers.length + popularPosts.length + config.length} keys`);
}

// Run on startup, before accepting traffic:
await warmCache();
server.listen(PORT);
```

---

## HTTP Caching Headers

```typescript
// Let browsers and CDNs cache responses — free performance

app.get('/api/config', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
  res.json(config);
});

// ETag for conditional requests (304 Not Modified):
app.get('/api/posts', async (req, res) => {
  const posts = await getPosts();
  const etag  = `"${hashObject(posts)}"`;

  res.setHeader('ETag', etag);

  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end(); // browser uses its cached version
  }

  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
  res.json(posts);
});

// stale-while-revalidate: serve stale instantly, refresh in background
app.get('/api/leaderboard', async (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  // Serve for up to 60s, then serve stale for 5 more minutes while CDN refetches
  res.json(leaderboard);
});

// Cache-Control values:
// no-store:              never cache (sensitive data)
// no-cache:              cache but revalidate every time
// private:               only browser cache (not CDN)
// public:                browser + CDN
// max-age=N:             fresh for N seconds
// stale-while-revalidate: serve stale while refetching
// immutable:             content will never change (use with hashed filenames)
```

---

## Cache Eviction Strategies

```
LRU (Least Recently Used) — default Redis when maxmemory-policy = allkeys-lru
  Evicts the item that was accessed longest ago.
  Good for: general-purpose caches where recency predicts future use.

LFU (Least Frequently Used) — Redis 4.0+ allkeys-lfu
  Evicts the item accessed least often.
  Good for: skewed access patterns (80% of hits to 20% of keys).

TTL-based — explicit expiry per key
  Items expire after N seconds regardless of access.
  Good for: data with known staleness tolerance (user profiles, session data).

Write-Through with TTL — most practical production pattern
  Every write refreshes TTL. Items expire if not written within TTL window.
```

```javascript
// Configure Redis eviction (in redis.conf or at runtime):
// maxmemory 2gb
// maxmemory-policy allkeys-lru

// Check eviction stats:
// redis-cli INFO stats | grep evicted_keys
// High evicted_keys → cache too small or TTLs too long
```

---

## Caching Anti-Patterns

```typescript
// ❌ Caching unbounded collections:
async function getUserPosts(userId: string) {
  const key = `posts:${userId}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  const posts = await db.posts.findAll({ userId }); // could be 100k posts!
  await redis.setex(key, 3600, JSON.stringify(posts)); // 100k objects in Redis
  return posts;
}
// ✅ Cache paginated results with cursor in key:
async function getUserPostsPage(userId: string, cursor?: string) {
  const key = `posts:${userId}:${cursor ?? 'first'}`;
  // ...
}

// ❌ Not setting TTL (keys live forever):
await redis.set('config', JSON.stringify(data)); // no TTL!
// ✅ Always set a TTL:
await redis.setex('config', 86400, JSON.stringify(data));

// ❌ Thundering herd — many keys expire at same time:
// All keys set with TTL=3600 at startup expire together at startup+1hr
// ✅ Add jitter:
const ttl = 3600 + Math.floor(Math.random() * 300); // 3600-3900s
await redis.setex(key, ttl, value);

// ❌ Caching errors:
const result = await cachedFetch('user:123', () => fetchUser('123'));
// If fetchUser throws, don't cache the error!
// ✅ Only cache successful results (handled automatically in cachedFetch above)
```

---

## Tricky Interview Questions

**Q: How do you decide what TTL to use?**
- How often does the data change? (frequency of writes)
- How bad is it to serve stale data? (business impact)
- How expensive is a cache miss? (DB query cost)
- Example: user profile → 5 min TTL (changes rarely, low staleness impact). Inventory stock → 5 sec TTL (changes often, high staleness impact).

**Q: What's cache coherence and why is it hard in distributed systems?**
When multiple instances have different versions of the same cached value. Hard because: instances cache independently, network partitions prevent immediate invalidation, and clocks drift. Solution: short TTLs, event-driven invalidation via pub/sub.

**Q: How would you cache a value that takes 10 seconds to compute, with high read traffic?**
1. Background refresh: always serve from cache, refresh async before expiry (never a blocking miss)
2. Request coalescing: first miss triggers computation, all other requests wait for the same promise
3. Precomputation: scheduled job recomputes value and pushes to cache before it's needed

**Q: Redis vs Memcached — when to use which?**
Redis: persistence, data structures (sorted sets, hashes), pub/sub, Lua scripts, clustering — nearly always the right choice. Memcached: purely simple key-value, multi-threaded for extreme scale, but has no persistence or data structures.
