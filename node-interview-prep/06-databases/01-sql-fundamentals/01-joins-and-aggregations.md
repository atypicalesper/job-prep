# SQL Joins and Aggregations

---

## Types of Joins

```sql
-- Sample schema:
-- users(id, name, email, department_id)
-- departments(id, name, manager_id)
-- orders(id, user_id, amount, created_at)

-- INNER JOIN — only rows that match in BOTH tables
SELECT u.name, d.name AS dept
FROM users u
INNER JOIN departments d ON u.department_id = d.id;
-- Excludes users with no department, departments with no users

-- LEFT JOIN — all rows from left, matching from right (NULL if no match)
SELECT u.name, d.name AS dept
FROM users u
LEFT JOIN departments d ON u.department_id = d.id;
-- Includes users with no department (dept = NULL)

-- RIGHT JOIN — all rows from right, matching from left
SELECT u.name, d.name AS dept
FROM users u
RIGHT JOIN departments d ON u.department_id = d.id;
-- Includes departments with no users

-- FULL OUTER JOIN — all rows from both, NULLs where no match
SELECT u.name, d.name AS dept
FROM users u
FULL OUTER JOIN departments d ON u.department_id = d.id;

-- CROSS JOIN — cartesian product (every combination)
SELECT u.name, d.name
FROM users u
CROSS JOIN departments d;
-- n × m rows

-- SELF JOIN — join table with itself
SELECT e.name AS employee, m.name AS manager
FROM users e
LEFT JOIN users m ON e.manager_id = m.id;
```

---

## Finding Missing Records with JOINs

```sql
-- Users with NO orders (anti-join pattern):
SELECT u.*
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE o.id IS NULL;

-- Same with NOT EXISTS (often more readable):
SELECT * FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM orders o WHERE o.user_id = u.id
);

-- Same with NOT IN (careful with NULLs!):
SELECT * FROM users
WHERE id NOT IN (
  SELECT user_id FROM orders WHERE user_id IS NOT NULL -- must exclude NULLs!
);
-- If orders.user_id has any NULL, NOT IN returns no rows (NULL comparison issue)
```

---

## Aggregations

```sql
-- COUNT varieties:
SELECT
  COUNT(*)           AS total_rows,     -- counts all rows
  COUNT(email)       AS with_email,     -- counts non-NULL email
  COUNT(DISTINCT department_id) AS dept_count  -- distinct values
FROM users;

-- GROUP BY rules:
-- ALL non-aggregated columns in SELECT must be in GROUP BY
SELECT department_id, COUNT(*), AVG(salary)
FROM users
GROUP BY department_id; -- ✅

SELECT department_id, name, COUNT(*) -- ❌ name not in GROUP BY
FROM users
GROUP BY department_id;

-- HAVING — filter on groups (after aggregation)
SELECT department_id, COUNT(*) AS cnt
FROM users
GROUP BY department_id
HAVING COUNT(*) > 5; -- departments with more than 5 users

-- WHERE vs HAVING:
-- WHERE filters rows before grouping
-- HAVING filters groups after grouping
SELECT department_id, AVG(salary) AS avg_sal
FROM users
WHERE active = true          -- filter rows first
GROUP BY department_id
HAVING AVG(salary) > 50000; -- then filter groups

-- ORDER of execution:
-- FROM → JOIN → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT
```

---

## Multiple Aggregations

```sql
-- Sales report:
SELECT
  DATE_TRUNC('month', created_at) AS month,
  COUNT(*) AS order_count,
  SUM(amount) AS total_revenue,
  AVG(amount) AS avg_order_value,
  MIN(amount) AS min_order,
  MAX(amount) AS max_order,
  COUNT(DISTINCT user_id) AS unique_customers
FROM orders
WHERE created_at >= '2024-01-01'
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month;
```

---

## Interview Questions

**Q: What is the difference between WHERE and HAVING?**
A: WHERE filters individual rows before GROUP BY aggregation happens. HAVING filters groups after aggregation. You can't use aggregate functions in WHERE (because rows aren't grouped yet), but you can in HAVING.

**Q: Why can `NOT IN` fail with NULLs?**
A: `x NOT IN (1, 2, NULL)` evaluates as `x != 1 AND x != 2 AND x != NULL`. `x != NULL` is always `UNKNOWN` (NULL comparison), so the whole expression is `UNKNOWN`, never `TRUE`. This means rows that should be returned are excluded. Always add `WHERE column IS NOT NULL` in the subquery or use `NOT EXISTS` instead.

**Q: What is the order of SQL clause execution?**
A: FROM → JOIN → WHERE → GROUP BY → HAVING → SELECT (with window functions) → ORDER BY → LIMIT/OFFSET. This is why you can't use SELECT aliases in WHERE (WHERE runs before SELECT computes the alias), but you can use them in ORDER BY.
