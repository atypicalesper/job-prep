# SQL Window Functions

Window functions compute a value for each row using a set of rows related to the current row (the "window"), without collapsing rows like GROUP BY does.

---

## Syntax

```sql
function_name() OVER (
  [PARTITION BY column(s)]  -- define groups (like GROUP BY but rows kept)
  [ORDER BY column(s)]       -- order within partition
  [ROWS/RANGE frame]         -- define sliding window
)
```

---

## Ranking Functions

```sql
-- Sample data: employees(id, name, department, salary)

-- ROW_NUMBER() — unique sequential number
SELECT
  name, department, salary,
  ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary DESC) AS rn
FROM employees;
-- Each employee gets unique number 1,2,3... within department

-- RANK() — same rank for ties, gaps after ties
SELECT
  name, salary,
  RANK() OVER (ORDER BY salary DESC) AS rnk
FROM employees;
-- 100k → 1, 90k → 2, 90k → 2, 80k → 4 (gap at 3)

-- DENSE_RANK() — same rank for ties, NO gaps
SELECT
  name, salary,
  DENSE_RANK() OVER (ORDER BY salary DESC) AS drnk
FROM employees;
-- 100k → 1, 90k → 2, 90k → 2, 80k → 3 (no gap)

-- NTILE(n) — divide rows into n buckets
SELECT
  name, salary,
  NTILE(4) OVER (ORDER BY salary) AS quartile
FROM employees;
-- Labels each employee Q1, Q2, Q3, Q4 by salary
```

---

## Nth Highest Salary — Classic Interview Problem

```sql
-- Method 1: DENSE_RANK (handles ties correctly)
SELECT name, salary
FROM (
  SELECT name, salary,
    DENSE_RANK() OVER (ORDER BY salary DESC) AS rnk
  FROM employees
) ranked
WHERE rnk = 3; -- 3rd highest salary

-- Method 2: Subquery with LIMIT (simpler, specific databases)
SELECT DISTINCT salary
FROM employees
ORDER BY salary DESC
LIMIT 1 OFFSET 2; -- skip top 2, get 3rd

-- Method 3: Correlated subquery (less efficient)
SELECT DISTINCT salary
FROM employees e1
WHERE 2 = (
  SELECT COUNT(DISTINCT salary)
  FROM employees e2
  WHERE e2.salary > e1.salary
); -- 3rd highest: exactly 2 salaries are higher

-- Highest per department (very common question):
SELECT name, department, salary
FROM (
  SELECT name, department, salary,
    RANK() OVER (PARTITION BY department ORDER BY salary DESC) AS rnk
  FROM employees
) ranked
WHERE rnk = 1;
```

---

## Aggregate Window Functions

```sql
-- Running total (cumulative sum):
SELECT
  name, amount, created_at,
  SUM(amount) OVER (ORDER BY created_at) AS running_total
FROM orders;

-- Running total per user:
SELECT
  user_id, amount, created_at,
  SUM(amount) OVER (
    PARTITION BY user_id
    ORDER BY created_at
  ) AS user_running_total
FROM orders;

-- Moving average (last 7 days):
SELECT
  date, revenue,
  AVG(revenue) OVER (
    ORDER BY date
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) AS moving_avg_7d
FROM daily_revenue;

-- Percentage of total:
SELECT
  department, salary,
  ROUND(
    salary * 100.0 / SUM(salary) OVER (),
    2
  ) AS pct_of_total_salary_bill
FROM employees;

-- Percentage within department:
SELECT
  department, name, salary,
  ROUND(
    salary * 100.0 / SUM(salary) OVER (PARTITION BY department),
    2
  ) AS pct_of_dept
FROM employees;
```

---

## LAG and LEAD — Accessing Adjacent Rows

```sql
-- Compare current row with previous:
SELECT
  date, revenue,
  LAG(revenue, 1) OVER (ORDER BY date) AS prev_day_revenue,
  revenue - LAG(revenue, 1) OVER (ORDER BY date) AS daily_change,
  ROUND(
    (revenue - LAG(revenue, 1) OVER (ORDER BY date)) * 100.0
    / LAG(revenue, 1) OVER (ORDER BY date),
    2
  ) AS pct_change
FROM daily_revenue;

-- LEAD — look ahead:
SELECT
  user_id, event_type, event_time,
  LEAD(event_type) OVER (
    PARTITION BY user_id
    ORDER BY event_time
  ) AS next_event
FROM user_events;

-- Default value for LAG/LEAD when no previous/next row:
SELECT
  date, revenue,
  LAG(revenue, 1, 0) OVER (ORDER BY date) AS prev  -- 0 if no previous
FROM daily_revenue;
```

---

## FIRST_VALUE, LAST_VALUE, NTH_VALUE

```sql
-- First sale in each department:
SELECT
  department, name, salary,
  FIRST_VALUE(salary) OVER (
    PARTITION BY department
    ORDER BY salary DESC
  ) AS top_salary_in_dept
FROM employees;

-- LAST_VALUE needs explicit frame (gotcha!):
SELECT
  department, name, salary,
  LAST_VALUE(salary) OVER (
    PARTITION BY department
    ORDER BY salary DESC
    ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING  -- must specify!
  ) AS lowest_salary_in_dept
FROM employees;
-- Without the ROWS BETWEEN, LAST_VALUE defaults to CURRENT ROW
-- which means it returns the current row's value!
```

---

## Frame Clauses

```sql
-- ROWS — physical rows
-- RANGE — logical range (values equal to ORDER BY column)

-- Common frames:
ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW  -- from start to current
ROWS BETWEEN 2 PRECEDING AND 2 FOLLOWING           -- 5-row window
ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING   -- from current to end
ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING -- entire partition

-- RANGE vs ROWS difference:
-- If multiple rows have the same ORDER BY value:
-- RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
-- includes all rows with same value as current (they're all "CURRENT RANGE")
-- ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
-- includes only physically up to the current row
```

---

## Interview Questions

**Q: What is the difference between RANK and DENSE_RANK?**
A: Both give the same rank to tied rows. RANK leaves gaps — if two rows tie for rank 2, next rank is 4. DENSE_RANK has no gaps — next rank after tied 2 is 3. For "find Nth highest salary" use DENSE_RANK so ties at any level don't skip ranks.

**Q: Why does LAST_VALUE often return unexpected results?**
A: The default window frame is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`, so LAST_VALUE returns the current row's value (the last in the range up to current row). To get the true last value, specify `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING`.

**Q: What is the difference between window functions and GROUP BY?**
A: GROUP BY collapses rows — you get one row per group. Window functions compute per-row values using a window of rows, but keep all rows. You can have both in the same query (GROUP BY first, then window on the results).

**Q: How would you find employees earning more than their department average?**
```sql
SELECT name, department, salary
FROM (
  SELECT name, department, salary,
    AVG(salary) OVER (PARTITION BY department) AS dept_avg
  FROM employees
) t
WHERE salary > dept_avg;
```
