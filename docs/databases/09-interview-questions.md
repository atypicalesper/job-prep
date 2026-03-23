# Database Interview Questions

Comprehensive Q&A covering SQL, indexing, transactions, scaling, Redis, and schema design.

---

## SQL & Query Optimization

**Q: Explain the difference between INNER JOIN, LEFT JOIN, and FULL OUTER JOIN.**

`INNER JOIN` returns only rows where a match exists in both tables. `LEFT JOIN` returns all rows from the left table, with NULLs for unmatched right rows — essential for "find all X with optional Y" queries. `FULL OUTER JOIN` returns all rows from both tables, NULLs where no match. Most performance-sensitive: INNER JOIN (smallest result set); most common mistake: using INNER JOIN when LEFT JOIN was intended, silently dropping unmatched rows.

**Q: When does a query not use an index?**

Common cases: (1) Leading wildcard LIKE (`%foo` — can't seek), (2) function applied to indexed column (`WHERE YEAR(created_at) = 2024` — use range instead), (3) implicit type cast (`WHERE id = '42'` when id is INT), (4) low-cardinality column (index on boolean rarely helps — query planner prefers seq scan), (5) OR conditions spanning multiple columns (use UNION instead), (6) NOT IN / NOT EXISTS with NULLs, (7) table too small — seq scan is faster. Use `EXPLAIN ANALYZE` to verify.

**Q: What is a covering index?**

An index that contains all columns needed to satisfy a query — the DB reads only the index, never the table (index-only scan). Example: `SELECT email, name FROM users WHERE status = 'active'` with index `(status, email, name)` — all three columns in index, no table lookup. Dramatically faster for read-heavy queries. Trade-off: larger indexes, slower writes.

**Q: Difference between WHERE and HAVING?**

`WHERE` filters rows before grouping — can use indexes, faster. `HAVING` filters after `GROUP BY` — operates on aggregated results. Use `WHERE` for raw column conditions, `HAVING` only for aggregate conditions (e.g., `HAVING COUNT(*) > 5`). Putting filterable conditions in `WHERE` instead of `HAVING` reduces rows before aggregation.

**Q: What are window functions and when do you use them?**

Window functions compute values across a set of rows related to the current row without collapsing them into groups. Use cases: rankings (`ROW_NUMBER()`, `RANK()`), running totals (`SUM() OVER (ORDER BY date)`), previous row comparison (`LAG()`), percentiles. Key difference from GROUP BY: each row in the result set is preserved. Example: find the top-selling product in each category without a subquery.

```sql
SELECT category, product, revenue,
  RANK() OVER (PARTITION BY category ORDER BY revenue DESC) AS rank
FROM sales
WHERE rank = 1;  -- ← use CTE/subquery since WHERE can't reference window alias
```

**Q: Explain CTEs vs subqueries vs temp tables.**

All three can break complex queries into steps. **CTE** (`WITH cte AS (...)`) is syntactically clean, can be referenced multiple times, and in PostgreSQL 12+ is inlined by the optimizer (no materialization cost). **Subquery** is inline — good for single-use, but harder to read when nested. **Temp table** (`CREATE TEMP TABLE`) is physically written to disk/memory — use when the intermediate result is large and reused multiple times, or when you need to index the intermediate result. Recursive CTEs are unique for hierarchical queries.

---

## Indexes

**Q: How does a B-tree index work?**

A B-tree (Balanced Tree) index maintains sorted key values in a tree structure where all leaf nodes are at the same depth. Each internal node holds K keys and K+1 pointers to child nodes. Leaf nodes hold the key + pointer (ROWID/heap pointer) to the actual table row. Searches, inserts, and deletes are all O(log n). The tree self-balances on modification. Most database indexes (PostgreSQL, MySQL, SQL Server) use B+ trees where internal nodes hold only keys (data at leaves), and leaf nodes are linked for range scans.

**Q: When would you use a partial index?**

When queries filter on a specific subset of rows. Example: `WHERE status = 'pending'` on an orders table where 95% of rows are 'completed' — index only the pending rows:
```sql
CREATE INDEX idx_pending_orders ON orders(created_at) WHERE status = 'pending';
```
Smaller index = faster scans, less write overhead. Also useful for soft deletes: `WHERE deleted_at IS NULL`.

**Q: Composite index — what is column order importance?**

A composite index on `(a, b, c)` can be used for queries on `a`, `(a, b)`, or `(a, b, c)` but NOT for `b` alone or `c` alone (leftmost prefix rule). Put the most selective column first for point lookups; put the equality-filtered column first, range-filtered column last. Example: for `WHERE status = 'active' AND created_at > '2024-01-01'`, use `(status, created_at)` not `(created_at, status)`.

**Q: Hash index vs B-tree index?**

Hash indexes are O(1) for equality lookups but don't support range queries, ORDER BY, or LIKE. B-tree supports equality, range, prefix LIKE, and sorting. In PostgreSQL, hash indexes are rarely used since B-tree is only marginally slower for equality and much more versatile. Hash indexes don't survive crash recovery before PostgreSQL 10. Use hash only when you have heavy equality-only lookups and profiling confirms it helps.

---

## Transactions & Consistency

**Q: Explain the 4 ACID properties.**

**Atomicity**: all operations in a transaction succeed or all are rolled back — no partial updates. **Consistency**: a transaction brings the DB from one valid state to another, respecting all constraints. **Isolation**: concurrent transactions don't interfere — intermediate state of one transaction is invisible to others (to varying degrees per isolation level). **Durability**: once committed, changes survive crashes (written to WAL/redo log before confirming).

**Q: Explain the 4 transaction isolation levels and their anomalies.**

| Level | Dirty Read | Non-Repeatable Read | Phantom Read |
|---|---|---|---|
| Read Uncommitted | ✓ possible | ✓ possible | ✓ possible |
| Read Committed (default PG) | ✗ prevented | ✓ possible | ✓ possible |
| Repeatable Read | ✗ | ✗ prevented | ✓ possible (not in PG) |
| Serializable | ✗ | ✗ | ✗ prevented |

**Dirty read**: reading uncommitted data from another transaction. **Non-repeatable read**: same SELECT returns different rows within a transaction (another transaction committed an UPDATE). **Phantom read**: same query returns different set of rows (another transaction committed an INSERT/DELETE). Higher isolation = fewer anomalies, more locking/overhead.

**Q: What is a deadlock and how do you prevent it?**

A deadlock occurs when transaction A holds lock on resource 1 and waits for resource 2, while transaction B holds lock on resource 2 and waits for resource 1. DBs detect cycles and kill one transaction. Prevention: (1) always acquire locks in the same order across transactions, (2) use SELECT FOR UPDATE with NOWAIT or SKIP LOCKED, (3) keep transactions short, (4) use optimistic locking where contention is rare.

**Q: Optimistic vs pessimistic locking — when to use each?**

**Pessimistic locking**: lock the row before reading (`SELECT FOR UPDATE`). Safe, prevents all conflicts, but reduces concurrency. Use when conflicts are frequent or the cost of retry is high (e.g., inventory decrement, financial ledger). **Optimistic locking**: read row with a version number, update only if version unchanged. No locks held during read, high concurrency, but requires retry logic on conflict. Use when conflicts are rare (e.g., profile updates, config changes). Optimistic locking is implemented with a `version` or `updated_at` column:

```sql
UPDATE products SET stock = stock - 1, version = version + 1
WHERE id = 42 AND version = 7;  -- 0 rows updated = conflict, retry
```

---

## Scaling

**Q: What is the difference between replication and sharding?**

**Replication**: copy the entire dataset to one or more replicas. Primary handles writes; replicas handle reads. Solves read scalability and availability but each node holds all data. **Sharding**: split data across multiple nodes — each shard holds a subset (e.g., users A-M on shard 1, N-Z on shard 2). Solves write scalability and storage limits but adds complexity: cross-shard queries, rebalancing, no cross-shard transactions.

**Q: What are the common sharding strategies?**

**Range sharding**: by value range (e.g., user ID 1-1M on shard 1). Simple but can cause hotspots. **Hash sharding**: `shard = hash(key) % n`. Even distribution but range queries hit all shards. **Directory sharding**: lookup table mapping keys to shards. Flexible but lookup table is a bottleneck. **Geo sharding**: by region. Reduces latency, meets data residency requirements.

**Q: What is connection pooling and why does it matter?**

Opening a new DB connection is expensive (~50ms, memory allocation). Without pooling, each app request opens/closes a connection. A connection pool maintains a pool of pre-opened connections, lending them to requests and returning them after. PgBouncer (PostgreSQL) and ProxySQL (MySQL) are common external poolers. Node.js `pg` pool, Python SQLAlchemy pool are application-level. Important settings: `max` (pool size — should match DB `max_connections`), `idleTimeoutMillis` (close idle connections), `connectionTimeoutMillis` (fail fast vs queue).

**Q: Read replicas — what are the consistency trade-offs?**

Replication lag: replica may be behind primary by milliseconds to seconds. Reading from replica after a write can return stale data. Mitigations: (1) read-your-own-writes — route reads to primary for a session window after writes, (2) sticky sessions — user always reads from same replica, (3) wait for replica to catch up (synchronous replication — high latency), (4) use replica only for non-critical reads (reports, exports). PostgreSQL `synchronous_standby_names` for synchronous; logical replication for cross-version.

---

## Redis

**Q: When would you use Redis over a traditional database for session storage?**

Redis is ideal for sessions because: (1) in-memory = microsecond reads, (2) built-in TTL — sessions expire automatically, (3) horizontal scaling with Redis Cluster, (4) atomic operations prevent race conditions on session reads/writes. Traditional DB would work but adds latency and load to your primary store. Redis Cluster or Redis Sentinel for HA. Store minimal data in session (user ID, role) — fetch full profile from DB when needed.

**Q: What is the difference between Redis SET and HSET?**

`SET key value` stores a string at a key. `HSET key field value` stores a field within a hash. Use `SET` for a single value (cache a serialized object as JSON). Use `HSET` for objects where you need to update individual fields without deserializing (`HSET user:42 email "new@example.com"`), or to reduce memory (Redis hashes use ziplist for small hashes). `HMSET`/`HGETALL` for bulk operations.

**Q: How do you implement a distributed lock with Redis?**

Use the Redlock algorithm or simple SET NX EX:

```
SET lock:resource_id unique_random_value NX EX 30
```

`NX` = only set if not exists (atomic). `EX 30` = auto-expire after 30s (prevents deadlock if holder crashes). On success (1 returned), you hold the lock. Release with Lua script (atomic check-and-delete):

```lua
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else return 0 end
```

Check the value before deleting to avoid releasing another holder's lock. Redlock for multi-node Redis HA.

---

## NoSQL

**Q: When would you choose MongoDB over PostgreSQL?**

MongoDB fits when: schema is dynamic or evolving rapidly (no ALTER TABLE), documents are naturally nested (embed instead of join), write throughput matters more than relational integrity, your team is iterating fast on schema. PostgreSQL with JSONB covers many MongoDB use cases. Choose PostgreSQL if you need transactions, complex joins, strong consistency, or mature ecosystem. MongoDB is a good fit for content platforms, catalogs, event logging where the document shape varies.

**Q: Explain CAP theorem.**

In a distributed system, you can guarantee at most 2 of 3: **Consistency** (every read gets the most recent write), **Availability** (every request gets a non-error response), **Partition tolerance** (system works despite network partitions). Since network partitions are unavoidable in distributed systems, the real trade-off is CP vs AP. Cassandra/DynamoDB = AP (available during partition, possibly stale reads). HBase/ZooKeeper = CP (consistent but may refuse requests during partition). Modern DBs offer tunable consistency (eventual → strong).
