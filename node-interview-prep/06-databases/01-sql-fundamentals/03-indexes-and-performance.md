# SQL Indexes and Performance

---

## What is an Index?

An index is a separate data structure (usually B-Tree) that maps column values to row locations, enabling fast lookups without full table scans.

```
Without index: O(n) full table scan
With index: O(log n) B-Tree lookup

Table: users (1M rows)
Query: SELECT * FROM users WHERE email = 'alice@example.com'

Without index: scan all 1M rows → ~500ms
With index on email: 3-4 B-Tree lookups → ~0.1ms
```

---

## Types of Indexes

```sql
-- B-Tree Index (default) — good for equality, ranges, sorting
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_orders_date ON orders(created_at);

-- Composite (multi-column) index
CREATE INDEX idx_users_dept_salary ON users(department_id, salary);
-- Works for queries on: (department_id), (department_id, salary)
-- Does NOT help for queries on: (salary) alone

-- Unique index — enforces uniqueness + faster lookup
CREATE UNIQUE INDEX idx_users_email ON users(email);

-- Partial index — index a subset of rows
CREATE INDEX idx_active_users ON users(email) WHERE active = true;
-- Only indexes active users — smaller, faster for filtered queries

-- Expression index
CREATE INDEX idx_lower_email ON users(LOWER(email));
-- Allows: WHERE LOWER(email) = 'alice@example.com' to use index

-- Full-text index (Postgres)
CREATE INDEX idx_posts_content ON posts USING GIN(to_tsvector('english', content));
```

---

## The Left-Prefix Rule (Composite Index)

```sql
-- Index on (last_name, first_name, age)
CREATE INDEX idx_name_age ON employees(last_name, first_name, age);

-- These USE the index:
WHERE last_name = 'Smith'                              -- ✅ leftmost prefix
WHERE last_name = 'Smith' AND first_name = 'John'     -- ✅ prefix
WHERE last_name = 'Smith' AND first_name = 'John' AND age = 30 -- ✅ all columns

-- These do NOT use the index:
WHERE first_name = 'John'                             -- ❌ skips last_name
WHERE age = 30                                        -- ❌ skips both

-- Range breaks the chain:
WHERE last_name = 'Smith' AND first_name > 'J'       -- ✅ uses first 2 cols
WHERE last_name = 'Smith' AND first_name > 'J' AND age = 30 -- age NOT indexed
```

---

## EXPLAIN and Query Plans

```sql
-- PostgreSQL:
EXPLAIN SELECT * FROM users WHERE email = 'alice@example.com';
EXPLAIN ANALYZE SELECT * FROM users WHERE email = 'alice@example.com';
-- EXPLAIN shows plan; ANALYZE actually runs it with timing

-- Key terms:
-- Seq Scan — full table scan (bad for large tables)
-- Index Scan — uses B-Tree index, fetches matching rows
-- Index Only Scan — data served from index, no heap access (fastest)
-- Bitmap Index Scan — for multiple conditions, combines bitmaps
-- Nested Loop / Hash Join / Merge Join — join strategies

-- Cost format: (startup_cost..total_cost rows=N width=W)
-- Lower is better; rows=N is estimated row count

-- Example output:
-- Seq Scan on users (cost=0.00..12543.00 rows=1 width=200)
--   Filter: (email = 'alice@example.com')

-- After adding index:
-- Index Scan using idx_users_email on users (cost=0.43..8.45 rows=1 width=200)
--   Index Cond: (email = 'alice@example.com')
```

---

## Index Pitfalls

```sql
-- 1. Functions on indexed columns defeat the index:
-- ❌ Index on email not used:
WHERE LOWER(email) = 'alice@example.com'
-- ✅ Use expression index:
CREATE INDEX idx_lower_email ON users(LOWER(email));

-- 2. Implicit casting defeats indexes:
-- ❌ If id is integer, this causes cast:
WHERE id = '123'; -- '123' is varchar, may cast id to varchar
-- ✅ Use matching types:
WHERE id = 123;

-- 3. LIKE with leading wildcard:
-- ❌ Can't use B-Tree index:
WHERE name LIKE '%smith%'
-- ✅ This can use B-Tree index:
WHERE name LIKE 'smith%'
-- ✅ For infix search, use full-text or GIN:
WHERE name @@ to_tsquery('smith')

-- 4. OR can prevent index usage:
-- ❌ May do full scan depending on optimizer:
WHERE last_name = 'Smith' OR first_name = 'John'
-- ✅ UNION can help:
SELECT * FROM users WHERE last_name = 'Smith'
UNION
SELECT * FROM users WHERE first_name = 'John';

-- 5. NOT, !=, <> often defeat indexes:
WHERE status != 'active' -- full scan
-- Better: partial index on the target status
```

---

## Index Cost/Benefit

```
Benefits:
- Faster SELECT with WHERE, JOIN, ORDER BY, GROUP BY
- Enforce uniqueness (UNIQUE index)
- Avoid sorts for ORDER BY (if index order matches)

Costs:
- Extra disk space
- Slower INSERT/UPDATE/DELETE (index must be maintained)
- Extra I/O for very low-selectivity queries (e.g., WHERE active = true on mostly-active table)

Rule of thumb:
- Index columns used in WHERE, JOIN ON, ORDER BY frequently
- Don't index low-cardinality columns (boolean, status with few values) unless with partial index
- For write-heavy tables, minimize indexes
```

---

## Interview Questions

**Q: When does an index NOT help?**
A: (1) Low cardinality — if a boolean column is 95% `true`, scanning the index then fetching heap pages is slower than a seq scan. (2) Functions on the column — `WHERE LOWER(col)` doesn't use index on `col`. (3) Leading wildcard LIKE. (4) Small tables — full scan is faster than index lookup on tiny tables. (5) Very high percentage of rows returned — if you're fetching 80% of the table, a seq scan is more efficient.

**Q: What is a covering index?**
A: An index that contains all columns needed for a query — both the filter columns AND the select columns. PostgreSQL calls this an "Index Only Scan." Example: query `SELECT name FROM users WHERE department_id = 5`, and index is on `(department_id, name)` — no heap access needed.

**Q: How do you know if a query uses an index?**
A: Use `EXPLAIN ANALYZE` to see the query plan. Look for "Index Scan" or "Index Only Scan" vs "Seq Scan." Also check the cost numbers and actual execution time. In MySQL, use `EXPLAIN` and look at the `key` column.

**Q: What is the difference between a clustered and non-clustered index?**
A: Clustered index determines the physical order of rows on disk (InnoDB primary key, PostgreSQL CLUSTER). Only one per table. Non-clustered index is a separate structure pointing to row locations. Clustered indexes make range scans faster. PostgreSQL doesn't have traditional clustered indexes — all indexes are "heap-based" (non-clustered), though you can use the CLUSTER command to reorder.
