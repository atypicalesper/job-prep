# PostgreSQL Advanced — EXPLAIN ANALYZE, Indexes, CTEs

## 1. EXPLAIN ANALYZE

`EXPLAIN` shows the query plan. `EXPLAIN ANALYZE` actually runs the query and shows real timing.

```sql
EXPLAIN ANALYZE
SELECT u.name, COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.created_at > '2024-01-01'
GROUP BY u.id, u.name
ORDER BY order_count DESC
LIMIT 10;
```

### Reading the output

The plan is displayed as a tree of nodes, indented to show parent-child relationships. Each node represents an operation (scan, join, sort, aggregate). The planner estimates cost in abstract units — the absolute values are less important than relative comparisons between plan variants. The most useful diagnostic is when estimated rows diverge dramatically from actual rows: this means the planner is making decisions based on stale statistics, which you fix by running `ANALYZE`.

```
Limit (cost=842.32..842.35 rows=10) (actual time=12.4..12.5 rows=10)
  -> Sort (cost=842.32..854.82 rows=5000) (actual time=12.3..12.4 rows=10)
       Sort Key: count(o.id) DESC
       -> HashAggregate (cost=500.00..562.50 rows=5000) (actual time=8.1..9.2 rows=4800)
            -> Hash Left Join (cost=120.00..450.00) (actual time=0.8..6.3 rows=50000)
                 Hash Cond: (o.user_id = u.id)
                 -> Seq Scan on orders  (cost=0..200.00) (actual time=0.1..3.1 rows=50000)
                 -> Hash (cost=80.00..80.00 rows=3200) (actual time=0.4..0.4 rows=3200)
                      -> Index Scan on users using users_created_at_idx
                           Index Cond: (created_at > '2024-01-01')
```

**Key numbers:**

| Term | Meaning |
|---|---|
| `cost=X..Y` | Estimated: X = startup cost, Y = total cost (arbitrary units) |
| `actual time=X..Y` | Real: X = first row ms, Y = all rows ms |
| `rows=N` | Estimated vs actual row count — large divergence = stale stats |
| `loops=N` | How many times this node ran (nested loop joins) |

### What to look for

Focus on the nodes with the highest actual time and the widest gap between estimated and actual row counts. A `Seq Scan` on a large table is a red flag — it usually means a missing or unused index. A sort operation spilling to disk means `work_mem` is too low for the query. Nested loops with high iteration counts (visible in the `loops=N` field) signal a cartesian product risk or a missing join index.

```sql
-- WARNING signs:
Seq Scan on large_table  -- full table scan, may need index
rows=1 (actual rows=100000)  -- massive estimate error, run ANALYZE
Nested Loop (cost=0..999999)  -- cartesian product risk
Sort (disk: 8192kB)  -- sort spilling to disk, increase work_mem
```

### EXPLAIN options

The `BUFFERS` option reveals cache efficiency: `shared hit` means data was served from PostgreSQL's buffer cache (fast), while `read` means a disk I/O was needed (slow). A high `read` count on a query that runs frequently indicates a cache miss problem — either the working set exceeds available memory or the query is not selective enough to benefit from caching. The JSON output format is useful when integrating with external plan analysis tools.

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT ...;
-- BUFFERS shows cache hits vs disk reads:
-- Buffers: shared hit=1234 read=5  (good: mostly cache hits)
-- Buffers: shared hit=10 read=9999  (bad: mostly disk reads)

EXPLAIN (ANALYZE, FORMAT JSON) SELECT ...;
-- JSON format for programmatic analysis
```

---

## 2. Index Types

### B-tree (default)

Good for: equality, range queries, ORDER BY, <, >, BETWEEN, LIKE 'foo%'

```sql
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_created ON orders(created_at DESC); -- direction matters for ORDER BY

-- Composite index — order matters!
CREATE INDEX idx_orders_user_status ON orders(user_id, status);
-- Satisfies: WHERE user_id = 5 AND status = 'paid'
-- Satisfies: WHERE user_id = 5  (leading column)
-- Does NOT satisfy: WHERE status = 'paid'  (non-leading)
```

### Partial index

A partial index stores only the rows matching a `WHERE` condition, making it significantly smaller than a full index and faster to scan. The key constraint: the query must include a predicate that logically implies the index condition for the index to be used. This is ideal when queries always filter on a low-cardinality column alongside a high-cardinality one — index only the common case.

```sql
-- Only index active users (99% of queries filter for is_active = true)
CREATE INDEX idx_users_active_email ON users(email) WHERE is_active = true;

-- Only index unprocessed jobs
CREATE INDEX idx_jobs_pending ON jobs(created_at) WHERE status = 'pending';

-- The partial index is used ONLY when the query matches the WHERE clause
EXPLAIN SELECT email FROM users WHERE email = 'x@y.com' AND is_active = true;
-- uses idx_users_active_email ✓
EXPLAIN SELECT email FROM users WHERE email = 'x@y.com';
-- does NOT use it ✗
```

### Index on expression

An expression index stores the result of a function or expression on the column, not the raw column value. This allows index use when the query's `WHERE` clause wraps the column in the same expression. The tradeoff: the expression is evaluated for every row on insert/update, adding write overhead. Use expression indexes when you cannot change the query pattern (e.g., third-party code) or when case-insensitive searches are a core requirement.

```sql
CREATE INDEX idx_users_lower_email ON users(LOWER(email));

-- Query must use the same expression
SELECT * FROM users WHERE LOWER(email) = 'alice@example.com'; -- uses index ✓
SELECT * FROM users WHERE email = 'alice@example.com'; -- does NOT ✗
```

### GIN index (for full-text, arrays, JSONB)

GIN (Generalized Inverted Index) is designed for values that contain multiple keys — like an array of tags, a JSONB document, or a full-text search vector. It builds an inverted index mapping each element/key to the documents that contain it. GIN indexes are ideal when you query containment (`@>`, `?`, `@@`) rather than equality or range. They are slower to build and update than B-Tree indexes, so they are best on columns that are read far more than written.

```sql
-- Full-text search
CREATE INDEX idx_articles_fts ON articles USING GIN(to_tsvector('english', body));
SELECT * FROM articles WHERE to_tsvector('english', body) @@ to_tsquery('nodejs & interview');

-- JSONB queries
CREATE INDEX idx_events_data ON events USING GIN(data);
SELECT * FROM events WHERE data @> '{"type": "login"}'; -- uses GIN ✓
```

### BRIN index (for naturally ordered data)

BRIN (Block Range Index) stores only the minimum and maximum value of a column per disk block range. It is extremely compact — orders of magnitude smaller than a B-Tree — but only effective when the column's values are physically correlated with their disk location (i.e., new rows are always appended in order, as with timestamps or auto-increment IDs). Queries use the index to skip entire block ranges that cannot contain matching rows. Do not use BRIN when data is inserted in random order relative to the indexed column.

```sql
CREATE INDEX idx_logs_created ON logs USING BRIN(created_at);
-- 100x smaller than B-tree, fine for time-series data
```

---

## 3. CTEs vs Subqueries

### CTE basics

A CTE (`WITH` clause) names a subquery so it can be referenced by name in the main query. In PostgreSQL 12+, CTEs are inlined by default — the optimizer treats them like regular subqueries and can push predicates into them. The key readability benefit is that complex multi-step queries can be decomposed into named intermediate results that read like sequential steps rather than nested subqueries.

```sql
-- Named temporary result set
WITH monthly_revenue AS (
  SELECT
    DATE_TRUNC('month', created_at) AS month,
    SUM(amount) AS revenue
  FROM orders
  WHERE status = 'paid'
  GROUP BY 1
)
SELECT
  month,
  revenue,
  LAG(revenue) OVER (ORDER BY month) AS prev_month,
  ROUND((revenue - LAG(revenue) OVER (ORDER BY month)) /
        LAG(revenue) OVER (ORDER BY month) * 100, 2) AS growth_pct
FROM monthly_revenue
ORDER BY month;
```

### Recursive CTE

A recursive CTE defines a query in two parts separated by `UNION ALL`: the base case (anchor member, which runs once and produces the starting rows) and the recursive case (which references the CTE name and runs repeatedly until it produces no new rows). This is the SQL way to traverse trees and graphs — org charts, category hierarchies, file systems, bill-of-materials structures. The recursion stops automatically when the recursive part returns an empty result.

```sql
-- Traverse org hierarchy
WITH RECURSIVE org_tree AS (
  -- Base case: CEO (no manager)
  SELECT id, name, manager_id, 0 AS depth
  FROM employees
  WHERE manager_id IS NULL

  UNION ALL

  -- Recursive case: employees under each manager
  SELECT e.id, e.name, e.manager_id, ot.depth + 1
  FROM employees e
  JOIN org_tree ot ON e.manager_id = ot.id
)
SELECT depth, REPEAT('  ', depth) || name AS org_chart
FROM org_tree
ORDER BY depth, name;

-- Result:
-- 0  Alice (CEO)
-- 1    Bob
-- 1    Carol
-- 2      Dave
```

### CTE vs subquery performance

**PostgreSQL pre-v12:** CTEs were always "optimization fences" — materialized separately, couldn't be inlined. Could hurt or help performance.

**PostgreSQL v12+:** CTEs are inlined by default unless you use `MATERIALIZED`.

```sql
-- Force materialization (useful if CTE is expensive and referenced multiple times)
WITH MATERIALIZED expensive_calc AS (
  SELECT ... FROM large_table
)
SELECT * FROM expensive_calc WHERE x = 1
UNION ALL
SELECT * FROM expensive_calc WHERE x = 2;
-- expensive_calc runs ONCE, results cached

-- Force inline (v12+ default, or explicit)
WITH NOT MATERIALIZED cheap_subquery AS (
  SELECT id FROM users WHERE active = true
)
SELECT * FROM orders WHERE user_id IN (SELECT id FROM cheap_subquery);
```

---

## 4. Query Optimization Patterns

### The N+1 in SQL

The N+1 problem occurs when you fetch a list of N items and then issue a separate query for related data on each item — resulting in N+1 total queries. The solution is always to fetch the related data in a single query using a `JOIN` or a `WHERE id IN (...)` with the collected IDs. In SQL contexts, N+1 usually happens in ORM usage, but understanding it at the SQL level helps you recognize and fix it regardless of the abstraction layer.

```sql
-- BAD: N+1 — fetch users then loop and fetch orders
-- (equivalent of what ORMs do without eager loading)
SELECT id FROM users WHERE active = true; -- returns 1000 users
-- then for each user:
SELECT * FROM orders WHERE user_id = $1;  -- 1000 more queries!

-- GOOD: single JOIN
SELECT u.id, u.name, o.id AS order_id, o.amount
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.active = true;
```

### Avoid `SELECT *`

`SELECT *` fetches every column from the table heap, even columns you do not use. Beyond wasting bandwidth, it prevents PostgreSQL from using an "Index Only Scan" — where all needed data is served directly from the index without touching the table at all. By selecting only the columns you need, and creating a covering index that includes those columns, you can eliminate heap access entirely for hot query paths.

```sql
-- BAD: fetches all columns, can't use index-only scan
SELECT * FROM users WHERE email = 'alice@example.com';

-- GOOD: covering index scan if index includes all needed columns
CREATE INDEX idx_users_email_name ON users(email) INCLUDE (name, id);
SELECT id, name FROM users WHERE email = 'alice@example.com';
-- "Index Only Scan" — never touches the table heap
```

### UPSERT

An upsert is an atomic operation: insert a row if it does not exist, or update the existing row if it does — all in a single statement that is safe under concurrency. Without `ON CONFLICT`, two concurrent inserts for the same unique key would cause one to fail with a constraint violation. `EXCLUDED` refers to the values from the attempted insert, letting you reference the new data in the update expression.

```sql
-- Insert or update atomically
INSERT INTO user_stats (user_id, login_count, last_login)
VALUES ($1, 1, NOW())
ON CONFLICT (user_id) DO UPDATE SET
  login_count = user_stats.login_count + 1,
  last_login = EXCLUDED.last_login;
```

### Batch operations

Inserting rows one at a time in a loop has high overhead: each statement requires a round-trip to the database and a separate transaction (unless batched). Sending a single statement with multiple rows — either as a multi-row `VALUES` list or via `unnest` to expand arrays — dramatically reduces round-trips and transaction overhead. For bulk inserts of thousands of rows, `COPY` is even faster as it bypasses the SQL parser entirely.

```sql
-- BAD: individual inserts in a loop
INSERT INTO events (type, data) VALUES ('login', '...');
-- × 10000

-- GOOD: unnest bulk insert
INSERT INTO events (type, data)
SELECT unnest($1::text[]), unnest($2::jsonb[]);
-- single round-trip with arrays

-- Or VALUES with multiple rows
INSERT INTO events (type, data) VALUES
  ('login', '{"user":1}'),
  ('logout', '{"user":2}'),
  ...
```

---

## 5. Table Partitioning

Table partitioning divides a logically single large table into multiple physical sub-tables (partitions) based on a partition key. The database routes reads and writes to the correct partition transparently. The main benefit is "partition pruning": a query with a predicate on the partition key only scans the relevant partition(s), ignoring the rest entirely. This turns what would be an O(n) scan on 100M rows into an O(n/k) scan on one of k partitions. Partitioning also makes maintenance operations (deleting old data, vacuuming) much cheaper — drop an old partition instead of `DELETE`ing millions of rows.

```sql
-- Range partitioning by month
CREATE TABLE events (
  id BIGSERIAL,
  created_at TIMESTAMPTZ NOT NULL,
  type TEXT,
  data JSONB
) PARTITION BY RANGE (created_at);

CREATE TABLE events_2024_01 PARTITION OF events
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE events_2024_02 PARTITION OF events
  FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

-- Query planner prunes irrelevant partitions automatically
EXPLAIN SELECT * FROM events WHERE created_at >= '2024-01-15' AND created_at < '2024-02-01';
-- Only scans events_2024_01
```

---

## 6. Common Interview Questions

**Q: What causes a Seq Scan instead of Index Scan?**

1. No index on the filtered column
2. Table is small — seq scan is cheaper for <5% of rows
3. Query uses a non-sargable predicate: `WHERE UPPER(email) = '...'` (use expression index)
4. Statistics are stale — planner estimates wrong selectivity (run `ANALYZE`)
5. `enable_indexscan = off` in session settings

---

**Q: What is a covering index?**

An index that contains all columns needed by a query, so Postgres can answer it from the index alone without touching the main table ("Index Only Scan"). Use `INCLUDE` to add non-key columns:

```sql
CREATE INDEX idx_cover ON orders(user_id) INCLUDE (amount, status);
SELECT amount, status FROM orders WHERE user_id = 5;
-- Index Only Scan — never reads heap
```

---

**Q: CTE vs VIEW vs subquery — when to use each?**

- **Subquery:** One-time use, optimizer can inline it
- **CTE:** Improves readability, use `MATERIALIZED` when result is reused or to force a fence
- **VIEW:** Reusable across queries; use `MATERIALIZED VIEW` + `REFRESH` for precomputed expensive results
- **Materialized View:** Cache expensive query result; refresh manually or on schedule

---

**Q: How do you find slow queries?**

```sql
-- pg_stat_statements extension (must be enabled)
SELECT query, calls, total_exec_time / calls AS avg_ms, rows
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;

-- Or enable slow query logging in postgresql.conf:
-- log_min_duration_statement = 1000  (log queries > 1s)
```
