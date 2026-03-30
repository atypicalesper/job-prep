# Databases & Caching

## Relational Databases (SQL)

### Core Concepts

```sql
-- DDL: Define schema
CREATE TABLE users (
  id         SERIAL PRIMARY KEY,
  email      VARCHAR(255) UNIQUE NOT NULL,
  name       VARCHAR(100) NOT NULL,
  role       VARCHAR(20)  NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE posts (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  body       TEXT,
  published  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
```

### Querying

```sql
-- SELECT with filtering
SELECT id, name, email FROM users
WHERE role = 'admin' AND created_at > '2024-01-01'
ORDER BY created_at DESC
LIMIT 20 OFFSET 40;

-- JOINs
SELECT u.name, COUNT(p.id) AS post_count
FROM users u
LEFT JOIN posts p ON p.user_id = u.id
WHERE p.published = TRUE
GROUP BY u.id, u.name
HAVING COUNT(p.id) > 5
ORDER BY post_count DESC;

-- INNER JOIN  — only rows that match both sides
-- LEFT JOIN   — all left rows, NULLs for unmatched right
-- RIGHT JOIN  — all right rows, NULLs for unmatched left
-- FULL OUTER JOIN — all rows from both, NULLs where no match

-- Subqueries
SELECT * FROM users
WHERE id IN (SELECT user_id FROM posts WHERE published = TRUE);

-- CTEs (Common Table Expressions)
WITH active_users AS (
  SELECT user_id FROM posts
  WHERE created_at > NOW() - INTERVAL '30 days'
  GROUP BY user_id
)
SELECT u.name FROM users u
JOIN active_users au ON au.user_id = u.id;

-- Upsert
INSERT INTO settings (user_id, theme)
VALUES (1, 'dark')
ON CONFLICT (user_id) DO UPDATE SET theme = EXCLUDED.theme;
```

---

## Indexing

Indexes speed up reads but slow down writes (index must be updated).

```sql
-- B-tree (default) — range queries, equality, ORDER BY
CREATE INDEX idx_email ON users(email);
CREATE INDEX idx_created ON posts(created_at DESC);

-- Composite index — order matters (leftmost prefix rule)
CREATE INDEX idx_status_date ON posts(published, created_at DESC);
-- Useful for: WHERE published = TRUE ORDER BY created_at
-- Not useful for: WHERE created_at > ... (published not in WHERE)

-- Partial index — smaller, faster for filtered queries
CREATE INDEX idx_active_users ON users(email) WHERE active = TRUE;

-- Covering index — query satisfied entirely from index (no heap fetch)
CREATE INDEX idx_cover ON posts(user_id) INCLUDE (title, created_at);
```

### When indexes help / hurt

| Scenario | Use index? |
|---------|-----------|
| `WHERE email = ?` (high cardinality) | ✅ |
| `WHERE status IN ('A', 'B')` (low cardinality) | ❌ — full scan often faster |
| `ORDER BY created_at DESC LIMIT 10` | ✅ |
| `WHERE LOWER(email) = ?` | Only with functional index |
| Small table (< ~1000 rows) | ❌ — sequential scan faster |

**EXPLAIN ANALYZE** — always check the query plan:
```sql
EXPLAIN ANALYZE SELECT * FROM posts WHERE user_id = 1;
-- Look for: Seq Scan (bad on large tables), Index Scan (good), Nested Loop
```

---

## Transactions & ACID

```sql
BEGIN;
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
  UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;

-- On error
ROLLBACK;

-- Savepoints
BEGIN;
  SAVEPOINT sp1;
  UPDATE ...;
  ROLLBACK TO SAVEPOINT sp1;  -- undo just this part
COMMIT;
```

**ACID properties:**
- **Atomicity** — all or nothing; partial changes are rolled back
- **Consistency** — constraints (FK, unique, check) enforced
- **Isolation** — concurrent transactions don't interfere
- **Durability** — committed data survives crashes (WAL)

### Isolation Levels

```
READ UNCOMMITTED  — can read uncommitted data (dirty read) — rarely used
READ COMMITTED    — default in Postgres — only see committed data
REPEATABLE READ   — same row returns same value within transaction
SERIALIZABLE      — full isolation, as if transactions run sequentially
```

| Problem | READ COMMITTED | REPEATABLE READ | SERIALIZABLE |
|---------|---------------|----------------|-------------|
| Dirty read | ✅ prevented | ✅ | ✅ |
| Non-repeatable read | ❌ possible | ✅ prevented | ✅ |
| Phantom read | ❌ possible | ❌ | ✅ prevented |

---

## NoSQL — Document (MongoDB)

```js
// Collections are like tables, documents are like rows
// Schema-free — documents in same collection can differ

// Insert
await db.collection('users').insertOne({ name: 'Alice', role: 'admin' })
await db.collection('users').insertMany([...])

// Find
await db.collection('users').findOne({ email: 'alice@example.com' })
await db.collection('users').find({ role: 'admin' }).sort({ name: 1 }).limit(10).toArray()

// Update
await db.collection('users').updateOne(
  { _id: id },
  { $set: { role: 'moderator' }, $push: { tags: 'verified' } }
)

// Delete
await db.collection('users').deleteOne({ _id: id })

// Aggregation pipeline
await db.collection('orders').aggregate([
  { $match: { status: 'completed' } },
  { $group: { _id: '$userId', total: { $sum: '$amount' } } },
  { $sort: { total: -1 } },
  { $limit: 10 },
]).toArray()
```

### SQL vs NoSQL Decision

| Criteria | SQL | NoSQL (Document) |
|----------|-----|-----------------|
| Schema | Rigid, enforced | Flexible |
| Relationships | Strong FK constraints | Embed or reference manually |
| Transactions | Full ACID | Limited (MongoDB has multi-doc since 4.0) |
| Scalability | Vertical + read replicas | Horizontal sharding |
| Query complexity | Powerful (JOINs, CTEs) | Limited aggregations |
| Use cases | Financial, ERP, complex queries | Catalogs, user profiles, logs |

---

## Redis — In-Memory Cache

```js
import { createClient } from 'redis'

const redis = createClient({ url: process.env.REDIS_URL })
await redis.connect()

// Strings — cache API responses
await redis.set('user:1', JSON.stringify(user), { EX: 3600 })  // TTL 1h
const cached = JSON.parse(await redis.get('user:1') ?? 'null')

// Cache-aside pattern
async function getUser(id) {
  const key = `user:${id}`
  const cached = await redis.get(key)
  if (cached) return JSON.parse(cached)

  const user = await db.findUser(id)
  await redis.set(key, JSON.stringify(user), { EX: 3600 })
  return user
}

// Invalidation
await redis.del('user:1')
await redis.del(...userKeys)  // bulk delete

// Counters (atomic)
await redis.incr('api:calls:today')
await redis.incrBy('score:user:1', 10)

// Sets — unique members
await redis.sAdd('online_users', userId)
await redis.sRem('online_users', userId)
await redis.sMembers('online_users')

// Sorted sets — leaderboards
await redis.zAdd('leaderboard', [{ score: 1500, value: 'user:1' }])
await redis.zRangeWithScores('leaderboard', 0, 9, { REV: true })  // top 10

// Lists — queues
await redis.lPush('job_queue', JSON.stringify(job))  // enqueue
await redis.rPop('job_queue')                         // dequeue (FIFO)

// Hash — structured objects
await redis.hSet('session:abc', { userId: '1', role: 'admin' })
await redis.hGet('session:abc', 'userId')
await redis.hGetAll('session:abc')
await redis.expire('session:abc', 86400)
```

### Caching Strategies

```
Cache-aside (Lazy loading)
  Read: check cache → miss → fetch DB → populate cache → return
  Write: update DB → invalidate cache
  Pro: Only cache what's requested, cache failures are recoverable
  Con: First request always slow; potential stale data

Write-through
  Write: update cache + DB together (synchronously)
  Pro: Cache always fresh
  Con: Every write goes to cache (wasted for rarely-read data)

Write-behind (Write-back)
  Write: update cache → async batch write to DB
  Pro: Low write latency
  Con: Data loss risk if cache fails before flush

Read-through
  Delegate cache population to the caching layer (cache fetches DB on miss)
  Pro: Application code simpler
  Con: Cache library must know about DB
```

---

## Connection Pooling

```js
// Postgres with pg
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,              // max connections in pool
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
})

// Always release connections back to pool
const client = await pool.connect()
try {
  const result = await client.query('SELECT * FROM users WHERE id = $1', [id])
  return result.rows[0]
} finally {
  client.release()  // critical — always release
}

// Or use pool.query directly (auto-release)
const result = await pool.query('SELECT * FROM users WHERE id = $1', [id])

// With Prisma — pool is managed automatically
// Configure via connection string: ?connection_limit=20&pool_timeout=10
```

---

## Database Design Principles

```
Normalization (reduce redundancy):
  1NF — atomic values, no repeating groups
  2NF — no partial dependencies on composite key
  3NF — no transitive dependencies (every non-key column depends only on PK)

Denormalization — intentional redundancy for read performance
  - Store computed totals (order_total)
  - Duplicate user name on posts for fast reads
  - Use materialized views

N+1 Problem — avoid in ORMs
  // ❌ N+1: 1 query for users + N queries for each user's posts
  const users = await User.findAll()
  for (const user of users) {
    user.posts = await Post.findAll({ where: { userId: user.id } })
  }

  // ✅ Eager load with JOIN
  const users = await prisma.user.findMany({ include: { posts: true } })
```
