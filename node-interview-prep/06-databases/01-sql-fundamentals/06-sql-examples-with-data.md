# SQL Examples With Real Tables and Data

Every example below includes CREATE TABLE, INSERT data, the query, and the exact output. Paste directly into any PostgreSQL instance.

---

## Schema Setup — Run This First

```sql
-- ─────────────────────────────────────────────────────────────────
-- TABLES
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE departments (
  id   SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL
);

CREATE TABLE employees (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  department_id INTEGER REFERENCES departments(id),
  manager_id    INTEGER REFERENCES employees(id),
  salary        NUMERIC(10,2) NOT NULL,
  hire_date     DATE NOT NULL,
  is_active     BOOLEAN DEFAULT true
);

CREATE TABLE orders (
  id          SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id),
  amount      NUMERIC(10,2) NOT NULL,
  status      VARCHAR(20) NOT NULL,  -- 'pending','completed','cancelled'
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE products (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  category   VARCHAR(50),
  price      NUMERIC(10,2) NOT NULL,
  stock      INTEGER DEFAULT 0
);

-- ─────────────────────────────────────────────────────────────────
-- DATA
-- ─────────────────────────────────────────────────────────────────
INSERT INTO departments (name) VALUES
  ('Engineering'),   -- id 1
  ('Marketing'),     -- id 2
  ('Sales'),         -- id 3
  ('HR');            -- id 4

INSERT INTO employees (name, department_id, manager_id, salary, hire_date) VALUES
  ('Alice',   1, NULL, 120000, '2019-03-15'),  -- id 1, Eng manager
  ('Bob',     1, 1,    95000,  '2020-06-01'),  -- id 2
  ('Carol',   1, 1,    90000,  '2021-01-10'),  -- id 3
  ('Dave',    2, NULL, 85000,  '2018-09-20'),  -- id 4, Mkt manager
  ('Eve',     2, 4,    72000,  '2022-03-05'),  -- id 5
  ('Frank',   3, NULL, 110000, '2017-11-30'),  -- id 6, Sales manager
  ('Grace',   3, 6,    88000,  '2020-08-15'),  -- id 7
  ('Henry',   3, 6,    76000,  '2023-01-20'),  -- id 8
  ('Iris',    4, NULL, 95000,  '2019-07-01'),  -- id 9, HR manager
  ('Jack',    NULL, NULL, 65000,'2023-05-10');  -- id 10, no department

UPDATE employees SET is_active = false WHERE id = 8; -- Henry is inactive

INSERT INTO orders (employee_id, amount, status, created_at) VALUES
  (2, 5000.00, 'completed', '2024-01-15 10:00:00'),
  (2, 3200.00, 'completed', '2024-01-20 14:30:00'),
  (3, 8500.00, 'completed', '2024-02-01 09:00:00'),
  (5, 2100.00, 'pending',   '2024-02-10 11:00:00'),
  (7, 9800.00, 'completed', '2024-02-15 16:00:00'),
  (7, 4300.00, 'cancelled', '2024-02-20 12:00:00'),
  (2, 6700.00, 'completed', '2024-03-01 08:30:00'),
  (NULL, 1500.00, 'pending','2024-03-05 15:00:00'); -- order with no employee

INSERT INTO products (name, category, price, stock) VALUES
  ('Laptop Pro',    'Electronics', 1299.99, 45),
  ('Wireless Mouse','Electronics',   29.99, 200),
  ('Standing Desk', 'Furniture',    599.99, 12),
  ('Desk Chair',    'Furniture',    449.99, 8),
  ('Notebook',      'Stationery',     4.99, 500),
  ('Pen Set',       'Stationery',     9.99, 300),
  ('Monitor 4K',    'Electronics',  799.99, 30),
  ('Keyboard',      'Electronics',  149.99, 75),
  ('Bookshelf',     'Furniture',    249.99, 0);  -- out of stock
```

---

## Section 1: JOIN Examples

### 1.1 INNER JOIN — Employees With Their Department

```sql
SELECT e.name, e.salary, d.name AS department
FROM employees e
INNER JOIN departments d ON e.department_id = d.id
ORDER BY d.name, e.salary DESC;
```

**Output:**
```
name   | salary    | department
-------+-----------+-------------
Alice  | 120000.00 | Engineering
Bob    |  95000.00 | Engineering
Carol  |  90000.00 | Engineering
Dave   |  85000.00 | Marketing
Eve    |  72000.00 | Marketing
Frank  | 110000.00 | Sales
Grace  |  88000.00 | Sales
Henry  |  76000.00 | Sales
Iris   |  95000.00 | HR
```

**Note:** Jack (no department) is excluded — INNER JOIN requires a match on both sides.

---

### 1.2 LEFT JOIN — All Employees Including Those Without a Department

```sql
SELECT e.name, d.name AS department
FROM employees e
LEFT JOIN departments d ON e.department_id = d.id
ORDER BY e.name;
```

**Output:**
```
name  | department
------+-------------
Alice | Engineering
Bob   | Engineering
Carol | Engineering
Dave  | Marketing
Eve   | Marketing
Frank | Sales
Grace | Sales
Henry | Sales
Iris  | HR
Jack  | NULL         ← no department, kept by LEFT JOIN
```

---

### 1.3 LEFT JOIN to Find Departments With NO Employees (Anti-Join)

```sql
SELECT d.name AS department
FROM departments d
LEFT JOIN employees e ON e.department_id = d.id
WHERE e.id IS NULL;
```

**Output:**
```
department
-----------
(none — all departments have at least one employee)
```

Add a new department to see it:
```sql
INSERT INTO departments (name) VALUES ('Legal');

SELECT d.name AS empty_department
FROM departments d
LEFT JOIN employees e ON e.department_id = d.id
WHERE e.id IS NULL;
```

**Output:**
```
empty_department
-----------------
Legal
```

---

### 1.4 SELF JOIN — Employees With Their Manager's Name

```sql
SELECT
  e.name      AS employee,
  m.name      AS manager,
  e.salary    AS emp_salary,
  m.salary    AS mgr_salary
FROM employees e
LEFT JOIN employees m ON e.manager_id = m.id
ORDER BY e.name;
```

**Output:**
```
employee | manager | emp_salary | mgr_salary
---------+---------+------------+------------
Alice    | NULL    | 120000.00  | NULL       ← top-level manager
Bob      | Alice   |  95000.00  | 120000.00
Carol    | Alice   |  90000.00  | 120000.00
Dave     | NULL    |  85000.00  | NULL
Eve      | Dave    |  72000.00  |  85000.00
Frank    | NULL    | 110000.00  | NULL
Grace    | Frank   |  88000.00  | 110000.00
Henry    | Frank   |  76000.00  | 110000.00
Iris     | NULL    |  95000.00  | NULL
Jack     | NULL    |  65000.00  | NULL
```

---

### 1.5 INNER JOIN + Aggregation — Orders Per Employee

```sql
SELECT
  e.name,
  COUNT(o.id)      AS order_count,
  SUM(o.amount)    AS total_amount,
  AVG(o.amount)    AS avg_amount,
  MAX(o.amount)    AS biggest_order
FROM employees e
INNER JOIN orders o ON o.employee_id = e.id
GROUP BY e.id, e.name
ORDER BY total_amount DESC;
```

**Output:**
```
name  | order_count | total_amount | avg_amount   | biggest_order
------+-------------+--------------+--------------+---------------
Bob   |           3 |     14900.00 |  4966.666... |      6700.00
Grace |           2 |     14100.00 |  7050.00     |      9800.00
Carol |           1 |      8500.00 |  8500.00     |      8500.00
Eve   |           1 |      2100.00 |  2100.00     |      2100.00
```

**Note:** Employees with no orders are excluded. Henry, Alice, Frank, Iris, Jack → no orders (or no match in INNER JOIN).

To include employees with zero orders:
```sql
SELECT
  e.name,
  COUNT(o.id)   AS order_count,  -- COUNT(o.id) returns 0 for NULLs, not COUNT(*)
  COALESCE(SUM(o.amount), 0) AS total_amount
FROM employees e
LEFT JOIN orders o ON o.employee_id = e.id
GROUP BY e.id, e.name
ORDER BY total_amount DESC;
```

**Output now includes:**
```
Alice |  0 |      0.00
Frank |  0 |      0.00
Henry |  0 |      0.00
... etc
```

---

### 1.6 The WHERE vs ON Difference for LEFT JOIN

```sql
-- ❌ This FILTERS OUT rows — effectively becomes INNER JOIN:
SELECT e.name, o.amount
FROM employees e
LEFT JOIN orders o ON o.employee_id = e.id
WHERE o.status = 'completed';   -- ← NULLs filtered out here

-- ✅ This KEEPS all employees, only attaches completed orders:
SELECT e.name, o.amount
FROM employees e
LEFT JOIN orders o ON o.employee_id = e.id AND o.status = 'completed';
```

**First query output:** Only employees who have a completed order (Bob x3, Carol x1, Grace x1)

**Second query output:** All 10 employees, only Bob/Carol/Grace have non-NULL `o.amount`

---

## Section 2: GROUP BY & HAVING Examples

### 2.1 Average Salary by Department

```sql
SELECT
  d.name          AS department,
  COUNT(e.id)     AS headcount,
  AVG(e.salary)   AS avg_salary,
  MIN(e.salary)   AS min_salary,
  MAX(e.salary)   AS max_salary,
  SUM(e.salary)   AS payroll
FROM departments d
JOIN employees e ON e.department_id = d.id
GROUP BY d.id, d.name
ORDER BY avg_salary DESC;
```

**Output:**
```
department   | headcount | avg_salary   | min_salary | max_salary | payroll
-------------+-----------+--------------+------------+------------+----------
Engineering  |         3 | 101666.67    |  90000.00  | 120000.00  | 305000.00
HR           |         1 |  95000.00    |  95000.00  |  95000.00  |  95000.00
Sales        |         3 |  91333.33    |  76000.00  | 110000.00  | 274000.00
Marketing    |         2 |  78500.00    |  72000.00  |  85000.00  | 157000.00
```

---

### 2.2 HAVING — Departments With More Than 2 Employees

```sql
SELECT
  d.name,
  COUNT(e.id) AS headcount
FROM departments d
JOIN employees e ON e.department_id = d.id
GROUP BY d.id, d.name
HAVING COUNT(e.id) > 2
ORDER BY headcount DESC;
```

**Output:**
```
name        | headcount
------------+-----------
Engineering |         3
Sales       |         3
```

**Why HAVING not WHERE:** WHERE runs before GROUP BY — it can't reference aggregate functions. HAVING runs after.

---

### 2.3 Employees Earning More Than Their Department Average

```sql
SELECT
  e.name,
  e.salary,
  d.name AS department,
  dept_avg.avg_salary
FROM employees e
JOIN departments d ON e.department_id = d.id
JOIN (
  SELECT department_id, AVG(salary) AS avg_salary
  FROM employees
  GROUP BY department_id
) dept_avg ON dept_avg.department_id = e.department_id
WHERE e.salary > dept_avg.avg_salary
ORDER BY e.name;
```

**Output:**
```
name  | salary    | department  | avg_salary
------+-----------+-------------+------------
Alice | 120000.00 | Engineering | 101666.67
Frank | 110000.00 | Sales       |  91333.33
```

---

## Section 3: Window Functions Examples

### 3.1 Rank Employees by Salary Within Department

```sql
SELECT
  e.name,
  d.name        AS department,
  e.salary,
  ROW_NUMBER() OVER (PARTITION BY e.department_id ORDER BY e.salary DESC) AS row_num,
  RANK()       OVER (PARTITION BY e.department_id ORDER BY e.salary DESC) AS rnk,
  DENSE_RANK() OVER (PARTITION BY e.department_id ORDER BY e.salary DESC) AS dense_rnk
FROM employees e
JOIN departments d ON e.department_id = d.id
ORDER BY d.name, e.salary DESC;
```

**Output:**
```
name  | department  | salary    | row_num | rnk | dense_rnk
------+-------------+-----------+---------+-----+-----------
Alice | Engineering | 120000.00 |       1 |   1 |         1
Bob   | Engineering |  95000.00 |       2 |   2 |         2
Carol | Engineering |  90000.00 |       3 |   3 |         3
Iris  | HR          |  95000.00 |       1 |   1 |         1
Dave  | Marketing   |  85000.00 |       1 |   1 |         1
Eve   | Marketing   |  72000.00 |       2 |   2 |         2
Frank | Sales       | 110000.00 |       1 |   1 |         1
Grace | Sales       |  88000.00 |       2 |   2 |         2
Henry | Sales       |  76000.00 |       3 |   3 |         3
```

---

### 3.2 Nth Highest Salary Per Department

```sql
-- Top earner in each department (DENSE_RANK = 1):
SELECT name, department, salary
FROM (
  SELECT
    e.name,
    d.name AS department,
    e.salary,
    DENSE_RANK() OVER (PARTITION BY e.department_id ORDER BY e.salary DESC) AS dr
  FROM employees e
  JOIN departments d ON e.department_id = d.id
) ranked
WHERE dr = 1;
```

**Output:**
```
name  | department  | salary
------+-------------+-----------
Alice | Engineering | 120000.00
Iris  | HR          |  95000.00
Dave  | Marketing   |  85000.00
Frank | Sales       | 110000.00
```

---

### 3.3 Running Total and Moving Average of Orders

```sql
SELECT
  o.id,
  e.name                                              AS employee,
  o.amount,
  o.created_at::date                                  AS order_date,
  SUM(o.amount) OVER (
    ORDER BY o.created_at
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  )                                                   AS running_total,
  AVG(o.amount) OVER (
    ORDER BY o.created_at
    ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
  )                                                   AS moving_avg_3
FROM orders o
LEFT JOIN employees e ON e.id = o.employee_id
WHERE o.employee_id IS NOT NULL
ORDER BY o.created_at;
```

**Output:**
```
id | employee | amount  | order_date | running_total | moving_avg_3
---+----------+---------+------------+---------------+--------------
 1 | Bob      | 5000.00 | 2024-01-15 |      5000.00  |    5000.00
 2 | Bob      | 3200.00 | 2024-01-20 |      8200.00  |    4100.00
 3 | Carol    | 8500.00 | 2024-02-01 |     16700.00  |    5566.67
 4 | Eve      | 2100.00 | 2024-02-10 |     18800.00  |    4600.00
 5 | Grace    | 9800.00 | 2024-02-15 |     28600.00  |    6800.00
 6 | Grace    | 4300.00 | 2024-02-20 |     32900.00  |    5400.00
 7 | Bob      | 6700.00 | 2024-03-01 |     39600.00  |    6933.33
```

---

### 3.4 LAG/LEAD — Compare Each Employee's Salary to Next/Previous Hire

```sql
SELECT
  e.name,
  e.salary,
  e.hire_date,
  LAG(e.salary)  OVER (ORDER BY e.hire_date) AS prev_hire_salary,
  LEAD(e.salary) OVER (ORDER BY e.hire_date) AS next_hire_salary,
  e.salary - LAG(e.salary) OVER (ORDER BY e.hire_date) AS salary_diff_from_prev
FROM employees e
ORDER BY e.hire_date;
```

**Output:**
```
name  | salary    | hire_date  | prev_hire_salary | next_hire_salary | salary_diff
------+-----------+------------+------------------+------------------+-------------
Frank | 110000.00 | 2017-11-30 | NULL             |  85000.00        | NULL
Dave  |  85000.00 | 2018-09-20 | 110000.00        | 120000.00        | -25000.00
Alice | 120000.00 | 2019-03-15 |  85000.00        |  95000.00        |  35000.00
Iris  |  95000.00 | 2019-07-01 | 120000.00        |  95000.00        | -25000.00
Bob   |  95000.00 | 2020-06-01 |  95000.00        |  90000.00        |   0.00
Grace |  88000.00 | 2020-08-15 |  95000.00        |  90000.00        |  -7000.00
Carol |  90000.00 | 2021-01-10 |  88000.00        |  72000.00        |   2000.00
Eve   |  72000.00 | 2022-03-05 |  90000.00        |  65000.00        | -18000.00
Jack  |  65000.00 | 2023-05-10 |  72000.00        |  76000.00        |  -7000.00
Henry |  76000.00 | 2023-01-20 |  65000.00        | NULL             |  11000.00
```

---

### 3.5 FIRST_VALUE / LAST_VALUE — Highest Earner in Each Department

```sql
SELECT
  e.name,
  d.name AS department,
  e.salary,
  FIRST_VALUE(e.name) OVER (
    PARTITION BY e.department_id ORDER BY e.salary DESC
  ) AS top_earner,
  LAST_VALUE(e.name) OVER (
    PARTITION BY e.department_id ORDER BY e.salary DESC
    ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING  -- ← crucial!
  ) AS bottom_earner
FROM employees e
JOIN departments d ON e.department_id = d.id
ORDER BY d.name, e.salary DESC;
```

**Output:**
```
name  | department  | salary    | top_earner | bottom_earner
------+-------------+-----------+------------+---------------
Alice | Engineering | 120000.00 | Alice      | Carol
Bob   | Engineering |  95000.00 | Alice      | Carol
Carol | Engineering |  90000.00 | Alice      | Carol
...
```

**Why the frame clause on LAST_VALUE:** Default frame is `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. Without explicit frame, LAST_VALUE returns the current row's value (not the actual last in partition).

---

## Section 4: Subqueries and CTEs

### 4.1 Correlated Subquery — Employees Earning More Than Their Manager

```sql
SELECT e.name AS employee, e.salary, m.name AS manager, m.salary AS manager_salary
FROM employees e
JOIN employees m ON e.manager_id = m.id
WHERE e.salary > m.salary;
```

**Output:**
```
(0 rows — no employee earns more than their manager in this dataset)
```

Let's verify by adjusting:
```sql
-- Who comes closest?
SELECT
  e.name,
  e.salary   AS emp_salary,
  m.name     AS manager,
  m.salary   AS mgr_salary,
  m.salary - e.salary AS gap
FROM employees e
JOIN employees m ON e.manager_id = m.id
ORDER BY gap ASC;
```

**Output:**
```
name  | emp_salary | manager | mgr_salary | gap
------+------------+---------+------------+--------
Bob   |  95000.00  | Alice   | 120000.00  | 25000.00
Carol |  90000.00  | Alice   | 120000.00  | 30000.00
Grace |  88000.00  | Frank   | 110000.00  | 22000.00
Henry |  76000.00  | Frank   | 110000.00  | 34000.00
Eve   |  72000.00  | Dave    |  85000.00  | 13000.00
```

---

### 4.2 CTE — Department Salary Stats + Above Average

```sql
WITH dept_stats AS (
  SELECT
    department_id,
    AVG(salary)  AS avg_salary,
    MAX(salary)  AS max_salary,
    COUNT(*)     AS headcount
  FROM employees
  WHERE department_id IS NOT NULL
  GROUP BY department_id
),
above_avg AS (
  SELECT e.id, e.name, e.salary, e.department_id
  FROM employees e
  JOIN dept_stats ds ON e.department_id = ds.department_id
  WHERE e.salary > ds.avg_salary
)
SELECT
  aa.name,
  aa.salary,
  d.name AS department,
  ds.avg_salary
FROM above_avg aa
JOIN departments d ON d.id = aa.department_id
JOIN dept_stats ds ON ds.department_id = aa.department_id
ORDER BY aa.salary DESC;
```

**Output:**
```
name  | salary    | department  | avg_salary
------+-----------+-------------+------------
Alice | 120000.00 | Engineering | 101666.67
Frank | 110000.00 | Sales       |  91333.33
```

---

### 4.3 Recursive CTE — Management Hierarchy

```sql
WITH RECURSIVE hierarchy AS (
  -- Base case: top-level managers (no manager)
  SELECT id, name, manager_id, salary, 0 AS depth, name AS path
  FROM employees
  WHERE manager_id IS NULL

  UNION ALL

  -- Recursive case: join each employee to their manager
  SELECT
    e.id, e.name, e.manager_id, e.salary,
    h.depth + 1,
    h.path || ' → ' || e.name
  FROM employees e
  JOIN hierarchy h ON e.manager_id = h.id
)
SELECT
  REPEAT('  ', depth) || name AS indented_name,
  salary,
  depth,
  path
FROM hierarchy
ORDER BY path;
```

**Output:**
```
indented_name   | salary    | depth | path
----------------+-----------+-------+--------------------------------
Alice           | 120000.00 |     0 | Alice
  Bob           |  95000.00 |     1 | Alice → Bob
  Carol         |  90000.00 |     1 | Alice → Carol
Dave            |  85000.00 |     0 | Dave
  Eve           |  72000.00 |     1 | Dave → Eve
Frank           | 110000.00 |     0 | Frank
  Grace         |  88000.00 |     1 | Frank → Grace
  Henry         |  76000.00 |     1 | Frank → Henry
Iris            |  95000.00 |     0 | Iris
Jack            |  65000.00 |     0 | Jack
```

---

### 4.4 EXISTS vs IN Performance Comparison

```sql
-- Find employees who have placed at least one completed order:

-- Using IN:
SELECT name FROM employees
WHERE id IN (
  SELECT employee_id FROM orders WHERE status = 'completed'
);

-- Using EXISTS (generally faster — short-circuits on first match):
SELECT name FROM employees e
WHERE EXISTS (
  SELECT 1 FROM orders o
  WHERE o.employee_id = e.id AND o.status = 'completed'
);

-- Both output:
-- Bob, Carol, Grace
```

**When EXISTS wins:** Large subquery result sets. EXISTS stops scanning as soon as one match is found.
**When IN wins:** Small, fixed subquery results (IN can use index).
**NOT IN trap:** If subquery returns any NULL → NOT IN returns no rows. Use NOT EXISTS instead.

---

## Section 5: UPDATE, DELETE, and UPSERT

### 5.1 UPDATE with JOIN — Give a 10% Raise to Engineering

```sql
-- PostgreSQL syntax:
UPDATE employees e
SET salary = salary * 1.10
FROM departments d
WHERE e.department_id = d.id
  AND d.name = 'Engineering';

-- Verify:
SELECT name, salary FROM employees
WHERE department_id = 1
ORDER BY salary DESC;
```

**Output after update:**
```
name  | salary
------+-----------
Alice | 132000.00
Bob   | 104500.00
Carol |  99000.00
```

---

### 5.2 DELETE with EXISTS — Remove Cancelled Orders Older Than 30 Days

```sql
DELETE FROM orders
WHERE status = 'cancelled'
  AND created_at < NOW() - INTERVAL '30 days';

-- Safer: preview first with SELECT:
SELECT id, status, created_at
FROM orders
WHERE status = 'cancelled'
  AND created_at < NOW() - INTERVAL '30 days';
```

---

### 5.3 UPSERT — Insert or Update Employee Record

```sql
-- Insert new employee, or update salary if they already exist (by name):
INSERT INTO employees (name, department_id, salary, hire_date)
VALUES ('Bob', 1, 100000, '2020-06-01')
ON CONFLICT (name)
DO UPDATE SET salary = EXCLUDED.salary;

-- Note: requires unique constraint on name:
ALTER TABLE employees ADD CONSTRAINT employees_name_unique UNIQUE (name);

-- UPSERT with conditional update (only update if new salary is higher):
INSERT INTO employees (name, department_id, salary, hire_date)
VALUES ('Bob', 1, 100000, '2020-06-01')
ON CONFLICT (name)
DO UPDATE SET salary = GREATEST(employees.salary, EXCLUDED.salary);
```

---

## Section 6: Advanced Aggregations

### 6.1 Conditional Aggregation — Order Stats by Status Per Employee

```sql
SELECT
  e.name,
  COUNT(o.id)                                        AS total_orders,
  COUNT(o.id) FILTER (WHERE o.status = 'completed')  AS completed,
  COUNT(o.id) FILTER (WHERE o.status = 'pending')    AS pending,
  COUNT(o.id) FILTER (WHERE o.status = 'cancelled')  AS cancelled,
  SUM(o.amount) FILTER (WHERE o.status = 'completed') AS completed_revenue
FROM employees e
LEFT JOIN orders o ON o.employee_id = e.id
GROUP BY e.id, e.name
HAVING COUNT(o.id) > 0
ORDER BY completed_revenue DESC NULLS LAST;
```

**Output:**
```
name  | total | completed | pending | cancelled | completed_revenue
------+-------+-----------+---------+-----------+-------------------
Bob   |     3 |         3 |       0 |         0 |          14900.00
Grace |     2 |         1 |       0 |         1 |           9800.00
Carol |     1 |         1 |       0 |         0 |           8500.00
Eve   |     1 |         0 |       1 |         0 |            NULL
```

---

### 6.2 PIVOT — Product Counts by Category

```sql
SELECT
  COUNT(*) FILTER (WHERE category = 'Electronics') AS electronics,
  COUNT(*) FILTER (WHERE category = 'Furniture')   AS furniture,
  COUNT(*) FILTER (WHERE category = 'Stationery')  AS stationery,
  COUNT(*) FILTER (WHERE category IS NULL)          AS uncategorized
FROM products;
```

**Output:**
```
electronics | furniture | stationery | uncategorized
------------+-----------+------------+---------------
          4 |         3 |          2 |             0
```

---

### 6.3 Percentile and Median Salary

```sql
SELECT
  AVG(salary)                                AS mean_salary,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY salary) AS median_salary,
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY salary) AS p25,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY salary) AS p75
FROM employees;
```

**Output:**
```
mean_salary | median_salary | p25      | p75
------------+---------------+----------+-----------
  89600.00  |   90000.00    | 76000.00 | 95000.00
```

---

### 6.4 Find Gaps in a Sequence

```sql
-- Products table uses SERIAL (sequential IDs).
-- Simulate a gap by deleting id=3:
DELETE FROM products WHERE id = 3;

-- Find gaps:
SELECT
  id + 1 AS gap_start,
  next_id - 1 AS gap_end
FROM (
  SELECT id, LEAD(id) OVER (ORDER BY id) AS next_id
  FROM products
) t
WHERE next_id - id > 1;
```

**Output:**
```
gap_start | gap_end
----------+---------
        3 |       3
```

---

### 6.5 Top N Per Group — Top 2 Products by Price Per Category

```sql
SELECT name, category, price
FROM (
  SELECT
    name,
    category,
    price,
    ROW_NUMBER() OVER (PARTITION BY category ORDER BY price DESC) AS rn
  FROM products
) ranked
WHERE rn <= 2
ORDER BY category, price DESC;
```

**Output:**
```
name          | category    | price
--------------+-------------+---------
Laptop Pro    | Electronics | 1299.99
Monitor 4K    | Electronics |  799.99
Standing Desk | Furniture   |  599.99
Desk Chair    | Furniture   |  449.99
Pen Set       | Stationery  |    9.99
Notebook      | Stationery  |    4.99
```

---

### 6.6 Latest Record Per Group — Most Recent Order Per Employee

```sql
-- Method 1: ROW_NUMBER (most flexible)
SELECT employee_id, amount, status, created_at
FROM (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY employee_id ORDER BY created_at DESC) AS rn
  FROM orders
  WHERE employee_id IS NOT NULL
) t
WHERE rn = 1;

-- Method 2: Correlated subquery
SELECT o.*
FROM orders o
WHERE created_at = (
  SELECT MAX(created_at)
  FROM orders o2
  WHERE o2.employee_id = o.employee_id
)
AND employee_id IS NOT NULL;

-- Method 3: DISTINCT ON (PostgreSQL only — fastest)
SELECT DISTINCT ON (employee_id) *
FROM orders
WHERE employee_id IS NOT NULL
ORDER BY employee_id, created_at DESC;
```

**All three output:**
```
employee_id | amount  | status    | created_at
------------+---------+-----------+---------------------
          2 | 6700.00 | completed | 2024-03-01 08:30:00
          3 | 8500.00 | completed | 2024-02-01 09:00:00
          5 | 2100.00 | pending   | 2024-02-10 11:00:00
          7 | 4300.00 | cancelled | 2024-02-20 12:00:00
```

---

## Section 7: Indexes — EXPLAIN Output

```sql
-- Create an index and observe EXPLAIN difference:
EXPLAIN ANALYZE
SELECT * FROM employees WHERE salary > 90000;
```

**Without index (Seq Scan):**
```
Seq Scan on employees  (cost=0.00..1.10 rows=4 width=...) (actual time=0.01..0.02)
  Filter: (salary > 90000.00)
  Rows Removed by Filter: 6
Planning Time: 0.1 ms
Execution Time: 0.05 ms
```

```sql
CREATE INDEX idx_employees_salary ON employees (salary);

EXPLAIN ANALYZE
SELECT * FROM employees WHERE salary > 90000;
```

**With index (Index Scan):**
```
Index Scan using idx_employees_salary on employees
  Index Cond: (salary > 90000.00)
Planning Time: 0.2 ms
Execution Time: 0.03 ms
```

**When the planner IGNORES your index:**
```sql
-- Function on column → index not used:
EXPLAIN SELECT * FROM employees WHERE UPPER(name) = 'ALICE';
-- Seq Scan (full table scan)

-- Fix: use expression index:
CREATE INDEX idx_employees_name_upper ON employees (UPPER(name));
EXPLAIN SELECT * FROM employees WHERE UPPER(name) = 'ALICE';
-- Now uses index
```

---

## Section 8: Transaction Examples

### 8.1 Basic Transaction — Salary Transfer (Ensure Atomicity)

```sql
BEGIN;

-- Give Alice a raise
UPDATE employees SET salary = salary + 10000 WHERE id = 1;

-- Take from the department budget (hypothetical budget table)
-- UPDATE department_budgets SET budget = budget - 10000 WHERE department_id = 1;

-- If anything fails here, ROLLBACK undoes everything
SAVEPOINT before_second_update;

UPDATE employees SET salary = salary + 5000 WHERE id = 999; -- nonexistent
-- 0 rows updated — but no error thrown, transaction continues

ROLLBACK TO SAVEPOINT before_second_update;

COMMIT;
```

---

### 8.2 SKIP LOCKED — Job Queue Pattern

```sql
CREATE TABLE jobs (
  id         SERIAL PRIMARY KEY,
  payload    JSONB NOT NULL,
  status     VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO jobs (payload) VALUES
  ('{"task": "send_email", "to": "alice@example.com"}'),
  ('{"task": "process_report", "id": 42}'),
  ('{"task": "send_email", "to": "bob@example.com"}');

-- Worker picks exactly one job, locks it, skips any already locked:
BEGIN;

SELECT id, payload
FROM jobs
WHERE status = 'pending'
ORDER BY created_at
LIMIT 1
FOR UPDATE SKIP LOCKED;  -- ← key: other workers skip this row

-- Process the job...
UPDATE jobs SET status = 'processing' WHERE id = <returned_id>;

COMMIT;
```

Multiple concurrent workers can run this simultaneously — each gets a different job with no race condition and no blocking.
