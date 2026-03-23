# SQL — 35 Tricky Interview Questions

---

## NULL Behavior

### Q1: What does this return?

```sql
SELECT NULL = NULL;    -- ?
SELECT NULL != NULL;   -- ?
SELECT NULL IS NULL;   -- ?
SELECT 1 + NULL;       -- ?
SELECT 'hello' || NULL; -- ?
```

**Answers:** `NULL`, `NULL`, `TRUE`, `NULL`, `NULL` (PostgreSQL) or `'hello'` (MySQL)

**Why:** NULL is "unknown." Any comparison to NULL returns NULL (not TRUE or FALSE). `IS NULL` is the correct way to check for null. Arithmetic with NULL returns NULL. String concatenation varies by database — PostgreSQL treats NULL as NULL, MySQL's `CONCAT` ignores NULLs.

---

### Q2: The NULL trap in WHERE

```sql
-- Table: employees(id, name, manager_id)
-- Some employees have manager_id = NULL (they're the top-level managers)

-- Find employees WITHOUT a manager:
SELECT * FROM employees WHERE manager_id != 5; -- Does this include NULLs?
```

**Answer:** No! `manager_id != 5` is `NULL` when `manager_id` is `NULL`. Rows with `NULL` manager_id are excluded.

```sql
-- Correct:
SELECT * FROM employees WHERE manager_id != 5 OR manager_id IS NULL;
```

---

### Q3: COUNT and NULLs

```sql
-- Table: employees(id, name, bonus)
-- 3 employees: bonus = 1000, bonus = 2000, bonus = NULL

SELECT
  COUNT(*) AS total,
  COUNT(bonus) AS with_bonus,
  AVG(bonus) AS avg_bonus
FROM employees;
```

**Answer:** `total = 3`, `with_bonus = 2`, `avg_bonus = 1500`

**Why:** `COUNT(*)` counts all rows. `COUNT(column)` counts non-NULL values. `AVG` ignores NULLs — it divides sum by count of non-NULL values (2000 + 1000) / 2 = 1500, NOT (2000 + 1000 + 0) / 3.

---

### Q4: COALESCE vs NULLIF vs ISNULL

```sql
SELECT COALESCE(NULL, NULL, 'third', 'fourth'); -- ?
SELECT NULLIF(5, 5); -- ?
SELECT NULLIF(5, 6); -- ?
SELECT COALESCE(10 / NULLIF(divisor, 0), 0) FROM ...;
```

**Answers:** `'third'` (first non-NULL), `NULL` (equal values → NULL), `5`, safe division (0 when divisor = 0)

---

## GROUP BY Gotchas

### Q5: GROUP BY with SELECT expressions

```sql
-- PostgreSQL: does this work?
SELECT name, COUNT(*) FROM employees GROUP BY department_id;
```

**Answer:** ❌ Error in PostgreSQL/MySQL strict mode — `name` is not in GROUP BY and not aggregated.

```sql
-- Valid: only grouped/aggregated columns in SELECT
SELECT department_id, COUNT(*) FROM employees GROUP BY department_id;
-- Or aggregate name:
SELECT department_id, STRING_AGG(name, ', ') FROM employees GROUP BY department_id;
```

---

### Q6: HAVING without GROUP BY

```sql
SELECT COUNT(*) FROM employees HAVING COUNT(*) > 5;
```

**Answer:** ✅ Valid — without GROUP BY, the whole table is one group. Returns 1 row with count if > 5, else 0 rows.

---

### Q7: Filtering in WHERE vs JOIN ON

```sql
-- Are these equivalent?

-- Query 1:
SELECT u.name, o.amount
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE o.amount > 100;

-- Query 2:
SELECT u.name, o.amount
FROM users u
LEFT JOIN orders o ON u.id = o.user_id AND o.amount > 100;
```

**Answer:** NOT equivalent!

- Query 1: WHERE filters AFTER the join — users with no matching orders (amount > 100) are excluded (effectively becomes INNER JOIN)
- Query 2: condition is in ON clause — filters which orders to join, but keeps all users (NULL if no matching orders)

```
Result 1: Only users with at least one order > 100
Result 2: All users; those with no order > 100 show NULL for amount
```

---

## Subqueries and CTEs

### Q8: Correlated vs Non-correlated Subquery

```sql
-- Non-correlated (runs once):
SELECT name FROM employees
WHERE salary > (SELECT AVG(salary) FROM employees);

-- Correlated (runs once PER ROW):
SELECT name FROM employees e1
WHERE salary > (
  SELECT AVG(salary) FROM employees e2
  WHERE e2.department_id = e1.department_id  -- references outer query
);
-- Finds employees earning above THEIR department's average
-- Much slower — runs subquery for each row!
```

---

### Q9: EXISTS vs IN Performance

```sql
-- These often return same results but have different performance:

-- IN: runs subquery, gets list of values, checks each row
SELECT * FROM departments
WHERE id IN (SELECT department_id FROM employees WHERE salary > 100000);

-- EXISTS: stops at first match (short-circuit)
SELECT * FROM departments d
WHERE EXISTS (
  SELECT 1 FROM employees e
  WHERE e.department_id = d.id AND e.salary > 100000
);

-- For large subquery results: EXISTS is often faster (short-circuits)
-- For small subquery results: IN may be OK
-- When subquery has NULLs: IN can misbehave (NOT IN trap!)
```

---

### Q10: CTE vs Subquery

```sql
-- CTE (Common Table Expression):
WITH high_earners AS (
  SELECT *, DENSE_RANK() OVER (PARTITION BY department_id ORDER BY salary DESC) AS rnk
  FROM employees
),
top_per_dept AS (
  SELECT * FROM high_earners WHERE rnk = 1
)
SELECT d.name, t.name, t.salary
FROM top_per_dept t
JOIN departments d ON t.department_id = d.id;

-- Benefits of CTEs:
-- Readable (named subqueries)
-- Reusable within query
-- Recursive CTEs for hierarchical data

-- Recursive CTE — find org chart:
WITH RECURSIVE org AS (
  SELECT id, name, manager_id, 0 AS level
  FROM employees WHERE manager_id IS NULL  -- root

  UNION ALL

  SELECT e.id, e.name, e.manager_id, org.level + 1
  FROM employees e
  INNER JOIN org ON e.manager_id = org.id  -- recursive part
)
SELECT * FROM org ORDER BY level, name;
```

---

## JOINs and Set Operations

### Q11: UNION vs UNION ALL

```sql
-- Which is faster and why?
SELECT name FROM employees_us
UNION
SELECT name FROM employees_eu;

SELECT name FROM employees_us
UNION ALL
SELECT name FROM employees_eu;
```

**Answer:** `UNION ALL` is faster. `UNION` deduplicates (requires sort/hash). `UNION ALL` keeps all rows including duplicates. Use `UNION ALL` unless you need deduplication.

---

### Q12: INTERSECT and EXCEPT

```sql
-- Employees in both US and EU:
SELECT name FROM employees_us
INTERSECT
SELECT name FROM employees_eu;

-- Employees in US but NOT EU:
SELECT name FROM employees_us
EXCEPT
SELECT name FROM employees_eu;
-- Equivalent to:
SELECT u.name FROM employees_us u
LEFT JOIN employees_eu e ON u.name = e.name
WHERE e.name IS NULL;
```

---

### Q13: Duplicate Rows

```sql
-- Find duplicate emails:
SELECT email, COUNT(*) AS cnt
FROM users
GROUP BY email
HAVING COUNT(*) > 1;

-- Delete duplicates, keep the one with lowest id:
DELETE FROM users
WHERE id NOT IN (
  SELECT MIN(id) FROM users GROUP BY email
);

-- PostgreSQL — cleaner with CTE:
WITH dupes AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY email ORDER BY id) AS rn
  FROM users
)
DELETE FROM users WHERE id IN (SELECT id FROM dupes WHERE rn > 1);
```

---

## Classic Problems

### Q14: Find Employees Earning More Than Their Manager

```sql
SELECT e.name AS employee, e.salary, m.name AS manager, m.salary AS manager_salary
FROM employees e
JOIN employees m ON e.manager_id = m.id
WHERE e.salary > m.salary;
```

---

### Q15: Consecutive Numbers / Gaps in Sequence

```sql
-- Find gaps in an ID sequence:
SELECT id + 1 AS gap_start
FROM orders o1
WHERE NOT EXISTS (
  SELECT 1 FROM orders o2 WHERE o2.id = o1.id + 1
)
AND id < (SELECT MAX(id) FROM orders);

-- Alternative with LAG:
SELECT id, LAG(id) OVER (ORDER BY id) AS prev_id,
  id - LAG(id) OVER (ORDER BY id) AS gap
FROM orders
WHERE id - LAG(id) OVER (ORDER BY id) > 1;
```

---

### Q16: Pivot Table

```sql
-- Rows to columns (pivot):
-- From: (month, category, sales) → (month, electronics, clothing, food)

SELECT
  month,
  SUM(CASE WHEN category = 'electronics' THEN sales ELSE 0 END) AS electronics,
  SUM(CASE WHEN category = 'clothing'    THEN sales ELSE 0 END) AS clothing,
  SUM(CASE WHEN category = 'food'        THEN sales ELSE 0 END) AS food
FROM sales_data
GROUP BY month
ORDER BY month;
```

---

### Q17: Running Total Reset

```sql
-- Running total that resets each month:
SELECT
  date, amount,
  SUM(amount) OVER (
    PARTITION BY DATE_TRUNC('month', date)  -- reset each month
    ORDER BY date
  ) AS monthly_running_total
FROM transactions;
```

---

### Q18: Date Range Overlaps

```sql
-- Find overlapping bookings:
-- Two ranges [s1,e1] and [s2,e2] overlap if: s1 < e2 AND s2 < e1
SELECT a.id, b.id
FROM bookings a
JOIN bookings b ON a.id < b.id  -- avoid duplicates and self-comparison
  AND a.start_date < b.end_date
  AND b.start_date < a.end_date;
```

---

### Q19: Median Calculation

```sql
-- PostgreSQL:
SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY salary) AS median
FROM employees;

-- Manual median (works anywhere):
SELECT AVG(salary) AS median
FROM (
  SELECT salary,
    ROW_NUMBER() OVER (ORDER BY salary) AS rn,
    COUNT(*) OVER () AS total
  FROM employees
) t
WHERE rn IN (FLOOR((total + 1) / 2.0), CEIL((total + 1) / 2.0));
```

---

### Q20: Latest Record Per Group

```sql
-- Most recent order per user — 3 approaches:

-- 1. Window function (usually fastest):
SELECT user_id, order_id, amount, created_at
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
  FROM orders
) t
WHERE rn = 1;

-- 2. Correlated subquery:
SELECT * FROM orders o1
WHERE created_at = (
  SELECT MAX(created_at) FROM orders o2 WHERE o2.user_id = o1.user_id
);

-- 3. LEFT JOIN anti-pattern:
SELECT o1.*
FROM orders o1
LEFT JOIN orders o2 ON o1.user_id = o2.user_id AND o1.created_at < o2.created_at
WHERE o2.id IS NULL; -- no newer order exists
```

---

### Q21: Cumulative Percentage

```sql
-- Cumulative revenue percentage (running/total):
SELECT
  product_name,
  revenue,
  SUM(revenue) OVER (ORDER BY revenue DESC) AS cumulative_revenue,
  ROUND(
    SUM(revenue) OVER (ORDER BY revenue DESC) * 100.0 /
    SUM(revenue) OVER (),
    2
  ) AS cumulative_pct
FROM products
ORDER BY revenue DESC;
-- Useful for Pareto analysis (80/20 rule)
```

---

### Q22: Self-Referential Hierarchy

```sql
-- Find all subordinates of a manager (any depth):
WITH RECURSIVE subordinates AS (
  SELECT id, name, manager_id, 1 AS depth
  FROM employees
  WHERE id = 100  -- starting manager

  UNION ALL

  SELECT e.id, e.name, e.manager_id, s.depth + 1
  FROM employees e
  INNER JOIN subordinates s ON e.manager_id = s.id
)
SELECT * FROM subordinates ORDER BY depth, name;

-- Prevent infinite loops (cycles in data):
WITH RECURSIVE subordinates AS (
  SELECT id, name, manager_id, ARRAY[id] AS path
  FROM employees WHERE id = 100

  UNION ALL

  SELECT e.id, e.name, e.manager_id, s.path || e.id
  FROM employees e
  JOIN subordinates s ON e.manager_id = s.id
  WHERE NOT e.id = ANY(s.path)  -- cycle detection
)
SELECT * FROM subordinates;
```

---

### Q23: String Aggregation and Splitting

```sql
-- Combine rows into string:
SELECT department_id,
  STRING_AGG(name, ', ' ORDER BY name) AS employees
FROM employees
GROUP BY department_id;

-- Split string into rows (PostgreSQL):
SELECT UNNEST(STRING_TO_ARRAY('a,b,c', ',')) AS item;
-- Returns: 'a', 'b', 'c' as separate rows

-- MySQL:
SELECT JSON_TABLE('["a","b","c"]', '$[*]' COLUMNS (item VARCHAR(10) PATH '$')) AS t;
```

---

### Q24: Conditional Aggregation

```sql
-- Count by category in one query:
SELECT
  COUNT(*) FILTER (WHERE status = 'active') AS active_count,
  COUNT(*) FILTER (WHERE status = 'inactive') AS inactive_count,
  SUM(amount) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') AS last_30d_revenue
FROM users, orders;

-- Or using CASE:
SELECT
  SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count,
  SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) AS inactive_count
FROM users;
```

---

### Q25: UPDATE with JOIN

```sql
-- Update users' tier based on their total spending:
-- PostgreSQL:
UPDATE users u
SET tier = CASE
  WHEN total_spent >= 10000 THEN 'gold'
  WHEN total_spent >= 1000  THEN 'silver'
  ELSE 'bronze'
END
FROM (
  SELECT user_id, SUM(amount) AS total_spent
  FROM orders
  GROUP BY user_id
) spending
WHERE u.id = spending.user_id;

-- MySQL (different syntax):
UPDATE users u
JOIN (
  SELECT user_id, SUM(amount) AS total_spent
  FROM orders GROUP BY user_id
) spending ON u.id = spending.user_id
SET u.tier = CASE ... END;
```

---

### Q26: DELETE with Conditions from Another Table

```sql
-- Delete inactive users who have never ordered:
DELETE FROM users
WHERE active = false
AND id NOT IN (SELECT DISTINCT user_id FROM orders WHERE user_id IS NOT NULL);

-- Or with EXISTS:
DELETE FROM users u
WHERE active = false
AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id);

-- PostgreSQL USING clause:
DELETE FROM users u
USING orders o
WHERE u.id = o.user_id
AND o.status = 'cancelled'; -- delete users whose orders are all cancelled
```

---

### Q27: Stored Procedure vs Function

```sql
-- Function: returns a value, can be used in SELECT
CREATE FUNCTION get_user_tier(user_id INT) RETURNS VARCHAR AS $$
  SELECT tier FROM users WHERE id = user_id;
$$ LANGUAGE SQL;

SELECT name, get_user_tier(id) FROM users;

-- Procedure: executes actions, can have OUT params, transactions
CREATE PROCEDURE transfer_funds(from_id INT, to_id INT, amount DECIMAL) AS $$
BEGIN
  UPDATE accounts SET balance = balance - amount WHERE id = from_id;
  UPDATE accounts SET balance = balance + amount WHERE id = to_id;
END;
$$ LANGUAGE plpgsql;

CALL transfer_funds(1, 2, 500.00);
```

---

### Q28: Triggers

```sql
-- Auto-update timestamp on record change:
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Audit log trigger:
CREATE OR REPLACE FUNCTION audit_log()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs(table_name, operation, old_data, new_data, changed_at)
  VALUES (TG_TABLE_NAME, TG_OP, row_to_json(OLD), row_to_json(NEW), NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

### Q29: Table Partitioning

```sql
-- Range partitioning by date (PostgreSQL):
CREATE TABLE orders (
  id BIGINT,
  user_id INT,
  amount DECIMAL,
  created_at TIMESTAMP NOT NULL
) PARTITION BY RANGE (created_at);

CREATE TABLE orders_2024 PARTITION OF orders
  FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

CREATE TABLE orders_2025 PARTITION OF orders
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

-- Query automatically routes to correct partition:
SELECT * FROM orders WHERE created_at BETWEEN '2024-06-01' AND '2024-06-30';
-- Only scans orders_2024
```

---

### Q30: N+1 Query Problem

```sql
-- N+1: fetching N users then 1 query per user for their orders
-- Application code (bad):
const users = await db.query('SELECT * FROM users LIMIT 10'); -- 1 query
for (const user of users) {
  const orders = await db.query('SELECT * FROM orders WHERE user_id = $1', [user.id]); // N queries!
}
// Total: 11 queries

-- Fix 1: JOIN in one query
SELECT u.*, o.* FROM users u
LEFT JOIN orders o ON u.id = o.user_id
LIMIT 10; -- careful with LIMIT + JOIN semantics

-- Fix 2: Two queries with IN
const users = await db.query('SELECT * FROM users LIMIT 10');
const userIds = users.map(u => u.id);
const orders = await db.query('SELECT * FROM orders WHERE user_id = ANY($1)', [userIds]);
// Group orders by user_id in application code
// Total: 2 queries ✅

-- Fix 3: DataLoader (for GraphQL) batches automatically
```

---

### Q31: Explain Slow Query Optimization

```sql
-- Slow query:
SELECT u.name, COUNT(o.id) AS order_count, SUM(o.amount) AS total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.created_at > '2024-01-01'
  AND o.status = 'completed'
GROUP BY u.id, u.name
HAVING SUM(o.amount) > 1000
ORDER BY total_spent DESC;

-- Optimization steps:
-- 1. EXPLAIN ANALYZE to find bottleneck
-- 2. Index on users.created_at (filter)
-- 3. Index on orders(user_id, status) or orders(status, user_id)
-- 4. Composite index on orders(user_id, status, amount) for covering index
-- 5. Check if WHERE on o.status is defeating LEFT JOIN (it is! — must handle NULL)
```

---

### Q32: Schema Design — Is This Normalized?

```sql
-- Bad design (not normalized):
CREATE TABLE orders (
  id INT,
  customer_name VARCHAR,    -- violates 3NF (depends on customer_id)
  customer_email VARCHAR,   -- redundant
  customer_id INT,
  product_name VARCHAR,     -- violates 3NF (depends on product_id)
  product_price DECIMAL,    -- could change
  quantity INT,
  total DECIMAL             -- calculated column (bad!)
);

-- Better (3NF):
CREATE TABLE customers (id, name, email);
CREATE TABLE products (id, name, price);
CREATE TABLE orders (id, customer_id, created_at);
CREATE TABLE order_items (id, order_id, product_id, quantity, unit_price);
-- unit_price captures price AT TIME OF ORDER (products can change price)
```

---

### Q33: JSON in PostgreSQL

```sql
-- PostgreSQL JSON operations:
CREATE TABLE events (
  id SERIAL,
  payload JSONB  -- use JSONB not JSON (indexed, binary, deduplicated)
);

-- Query nested JSON:
SELECT payload->>'user_id' AS user_id,
       payload->'metadata'->>'source' AS source
FROM events
WHERE payload->>'event_type' = 'purchase';

-- Index on JSON field:
CREATE INDEX idx_events_type ON events((payload->>'event_type'));

-- Array operations:
SELECT * FROM events WHERE payload->'tags' ? 'featured'; -- contains tag
SELECT * FROM events WHERE payload->'tags' @> '["featured", "new"]'::jsonb;
```

---

### Q34: UPSERT (INSERT ... ON CONFLICT)

```sql
-- PostgreSQL:
INSERT INTO users (email, name, updated_at)
VALUES ('alice@example.com', 'Alice', NOW())
ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name,
  updated_at = EXCLUDED.updated_at;
-- EXCLUDED refers to the row that was attempted to be inserted

-- Insert and ignore if exists:
INSERT INTO users (email, name)
VALUES ('alice@example.com', 'Alice')
ON CONFLICT (email) DO NOTHING;

-- MySQL:
INSERT INTO users (email, name)
VALUES ('alice@example.com', 'Alice')
ON DUPLICATE KEY UPDATE name = VALUES(name);
```

---

### Q35: Window Function vs Subquery Trade-offs

```sql
-- Find top 3 products per category by revenue:

-- Window function approach (cleaner, runs once):
SELECT category, product, revenue
FROM (
  SELECT category, product, revenue,
    RANK() OVER (PARTITION BY category ORDER BY revenue DESC) AS rnk
  FROM products
) t
WHERE rnk <= 3;

-- Subquery approach (harder to read, may be slower):
SELECT p1.category, p1.product, p1.revenue
FROM products p1
WHERE (
  SELECT COUNT(DISTINCT p2.revenue)
  FROM products p2
  WHERE p2.category = p1.category
  AND p2.revenue >= p1.revenue
) <= 3;
-- Note: DISTINCT handles ties (like DENSE_RANK)
```
