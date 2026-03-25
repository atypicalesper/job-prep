# SQL Transactions and ACID

---

## ACID Properties

A transaction is a group of SQL operations that must either all succeed or all fail together. ACID is the set of guarantees that makes this possible in a reliable way. These properties were defined because in systems with concurrent access and possible hardware failures, executing multiple operations "as if" they were a single atomic action requires careful coordination from the database engine. Each letter of ACID addresses a different failure mode: partial execution (Atomicity), constraint violations (Consistency), interference between concurrent transactions (Isolation), and data loss after a crash (Durability).

```
A — Atomicity:    All operations in a transaction succeed or ALL fail (all-or-nothing)
C — Consistency:  Transaction takes DB from one valid state to another (constraints always satisfied)
I — Isolation:    Concurrent transactions don't see each other's intermediate state
D — Durability:   Committed transactions survive crashes (written to disk/WAL)
```

---

## Transaction Basics

A transaction wraps one or more SQL statements in a block that either commits atomically on success or rolls back entirely on failure. Without transactions, a crash between two related updates (like a debit and a credit) would leave the database in an inconsistent state. The `BEGIN`/`COMMIT`/`ROLLBACK` pattern is standard SQL; in application code, you typically wrap this in a try/catch to ensure rollback happens on any error, including application-level exceptions not just SQL errors.

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

Isolation describes how visible one transaction's intermediate state is to other concurrent transactions. The SQL standard defines four isolation levels that trade off consistency against concurrency. Lower isolation levels allow more concurrency but expose your transactions to anomalies (dirty reads, non-repeatable reads, phantom reads). Higher isolation levels prevent these anomalies but require more locking or version tracking, which reduces throughput. PostgreSQL's default is `READ COMMITTED`; most applications never need anything stricter unless implementing financial ledgers or serializable workflows.

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

Explicit row-level locks let you control concurrency beyond what the isolation level provides. `SELECT ... FOR UPDATE` acquires an exclusive lock on the selected rows, preventing other transactions from modifying them until you commit or rollback. This is pessimistic locking — you lock preemptively, assuming conflict is likely. `FOR SHARE` allows multiple concurrent readers but blocks writers. `SKIP LOCKED` is a specialized option that skips already-locked rows instead of waiting, enabling multiple workers to process a queue without blocking each other.

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

A deadlock occurs when two transactions each hold a lock the other needs, creating a circular wait. Neither can proceed, and the database must intervene by killing one transaction and rolling it back. Deadlocks cannot be completely eliminated, but they can be made rare and predictable: the primary prevention strategy is to always acquire locks on multiple rows in the same consistent order across all transactions. If transaction A always locks row 1 before row 2, and transaction B does the same, a deadlock is impossible.

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

These are two philosophies for handling concurrent access to the same data. Pessimistic locking assumes conflicts are likely and blocks competing transactions upfront by holding a lock for the duration of the operation. Optimistic locking assumes conflicts are rare — it reads without locking, performs work, then verifies at write time that no one else modified the record (using a version number or timestamp). If the version has changed, it retries. Optimistic locking avoids blocking but requires application-level retry logic; it is preferred when read-to-write ratios are high and actual conflicts are infrequent.

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

A savepoint is a named marker within a transaction that you can roll back to without abandoning the entire transaction. This enables partial rollback — if a secondary operation fails, you can revert only that part while keeping the work done before the savepoint. Savepoints are useful for complex workflows where multiple steps can partially succeed, or for nested retry logic where an inner operation may fail but the outer transaction should continue.

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
