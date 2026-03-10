# SQL Transactions and ACID

---

## ACID Properties

```
A — Atomicity:    All operations in a transaction succeed or ALL fail (all-or-nothing)
C — Consistency:  Transaction takes DB from one valid state to another (constraints always satisfied)
I — Isolation:    Concurrent transactions don't see each other's intermediate state
D — Durability:   Committed transactions survive crashes (written to disk/WAL)
```

---

## Transaction Basics

```sql
BEGIN; -- or START TRANSACTION

UPDATE accounts SET balance = balance - 500 WHERE id = 1; -- debit
UPDATE accounts SET balance = balance + 500 WHERE id = 2; -- credit

-- If both succeed:
COMMIT;

-- If anything fails:
ROLLBACK;

-- Practical Node.js pattern with pg:
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [500, 1]);
  await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [500, 2]);
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}
```

---

## Isolation Levels and Their Problems

```
Problems transactions cause:
1. Dirty Read      — reading uncommitted data from another transaction
2. Non-repeatable Read — same query returns different values within a transaction
3. Phantom Read    — same query returns different ROWS within a transaction (new rows added)
4. Lost Update     — two transactions overwrite each other

Isolation Levels (weakest → strongest):
┌──────────────────────┬────────────┬──────────────────┬──────────────┐
│ Level                │ Dirty Read │ Non-repeatable   │ Phantom Read │
├──────────────────────┼────────────┼──────────────────┼──────────────┤
│ READ UNCOMMITTED     │ Possible   │ Possible         │ Possible     │
│ READ COMMITTED       │ Prevented  │ Possible         │ Possible     │
│ REPEATABLE READ      │ Prevented  │ Prevented        │ Possible*    │
│ SERIALIZABLE         │ Prevented  │ Prevented        │ Prevented    │
└──────────────────────┴────────────┴──────────────────┴──────────────┘
*PostgreSQL REPEATABLE READ also prevents phantoms (MVCC implementation)
```

```sql
-- Set isolation level:
BEGIN ISOLATION LEVEL READ COMMITTED;    -- PostgreSQL default
BEGIN ISOLATION LEVEL REPEATABLE READ;
BEGIN ISOLATION LEVEL SERIALIZABLE;
```

---

## Locking

```sql
-- Row-level locking:
SELECT * FROM accounts WHERE id = 1 FOR UPDATE;
-- Locks the row — other transactions block on the same row
-- Released on COMMIT/ROLLBACK

SELECT * FROM accounts WHERE id = 1 FOR SHARE;
-- Multiple readers can hold FOR SHARE simultaneously
-- Writers block until all readers release

-- SKIP LOCKED — for job queues (very useful!):
SELECT * FROM jobs
WHERE status = 'pending'
ORDER BY created_at
LIMIT 1
FOR UPDATE SKIP LOCKED;
-- Gets next available job without waiting for locked rows
-- Multiple workers can safely dequeue without blocking each other

-- NOWAIT — fail immediately instead of waiting:
SELECT * FROM accounts WHERE id = 1 FOR UPDATE NOWAIT;
-- Throws error immediately if row is locked
```

---

## Deadlocks

```sql
-- Classic deadlock:
-- Transaction A:
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1; -- locks row 1
-- (waiting for row 2, held by B)
UPDATE accounts SET balance = balance + 100 WHERE id = 2;

-- Transaction B (simultaneously):
BEGIN;
UPDATE accounts SET balance = balance - 200 WHERE id = 2; -- locks row 2
-- (waiting for row 1, held by A)
UPDATE accounts SET balance = balance + 200 WHERE id = 1;

-- Result: Deadlock! Database detects cycle, kills one transaction.

-- Prevention: always acquire locks in the same order:
-- Both transactions: lock id=1 first, then id=2
```

---

## Optimistic vs Pessimistic Locking

```sql
-- Pessimistic: lock the row before reading (FOR UPDATE)
-- Use when: high contention, short transactions

-- Optimistic: read without locking, check on update (version column)
-- Use when: low contention, long-running operations

-- Optimistic locking pattern:
-- 1. Read row + version:
SELECT id, balance, version FROM accounts WHERE id = 1;
-- Returns: id=1, balance=1000, version=5

-- 2. Update with version check:
UPDATE accounts
SET balance = 900, version = version + 1
WHERE id = 1 AND version = 5;

-- If 0 rows affected → someone else updated it → retry
-- If 1 row affected → success
```

---

## Savepoints

```sql
BEGIN;

INSERT INTO orders VALUES (1, 'Alice', 100);

SAVEPOINT before_items;

INSERT INTO order_items VALUES (1, 'Widget', 50);
INSERT INTO order_items VALUES (1, 'Gadget', 50);

-- If items fail, rollback only to savepoint (keep order):
ROLLBACK TO SAVEPOINT before_items;

-- Order is still in transaction, commit without items:
COMMIT;
```

---

## Interview Questions

**Q: What is the difference between REPEATABLE READ and SERIALIZABLE?**
A: REPEATABLE READ guarantees that if you run the same query twice in a transaction, you get the same rows. But in some databases, phantom reads can occur (new rows matching the query criteria inserted by another transaction). SERIALIZABLE is the strictest — transactions behave as if they ran serially (one at a time), preventing all anomalies. PostgreSQL's SERIALIZABLE uses Serializable Snapshot Isolation (SSI) with minimal locking overhead.

**Q: What is MVCC?**
A: Multi-Version Concurrency Control. Instead of locking rows for reads, each transaction sees a snapshot of data as of its start time. Writers create new versions of rows; readers see the old version. This allows reads and writes to not block each other. PostgreSQL, MySQL InnoDB both use MVCC. The tradeoff: old versions accumulate (need vacuum/purge), and serializable anomalies can still occur without proper isolation.

**Q: When would you use `SKIP LOCKED`?**
A: For implementing job queues in SQL. Multiple workers can poll for jobs without blocking each other: `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1` — each worker atomically claims a job without waiting. Without SKIP LOCKED, workers would queue up waiting for the same locked row.

**Q: Explain the difference between optimistic and pessimistic locking.**
A: Pessimistic: lock the resource before using it (`FOR UPDATE`). Safe but blocks concurrent access — good for high contention, short operations. Optimistic: read without locking, update with a version check. If the version changed since you read it, retry. No blocking — good for low contention, longer operations (like web forms). Optimistic locking requires retry logic in application code.
