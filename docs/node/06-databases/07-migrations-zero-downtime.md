# Database Migrations — Zero-Downtime Strategies

## Why Migrations Are Risky

In production, you can't stop the app during a migration. At any point during a deploy, **two versions of your app run simultaneously** — old (v1) and new (v2). Your schema must be compatible with both.

```
Deploy Timeline:
t=0: 100% v1 → all use old schema
t=1: 80% v1, 20% v2 → schema must work for BOTH
t=2: 50% v1, 50% v2 → ...
t=3: 0% v1, 100% v2 → only new schema needed

Problem: If v2 needs column `user_type` but v1 writes rows without it,
and it's NOT NULL with no default → v1 writes FAIL during deploy!
```

---

## The Expand-Contract Pattern

The golden rule for zero-downtime migrations. Every schema change is split into multiple deploys.

```
Phase 1: EXPAND   — add new schema (backward compatible)
Phase 2: MIGRATE  — backfill data, update app code
Phase 3: CONTRACT — remove old schema (now safe)
```

---

## Common Migration Scenarios

### Adding a Column

```
❌ WRONG: Add NOT NULL column without default in one deploy
  → Old app writes rows without the column → DB rejects them

✅ RIGHT: Expand-contract

Deploy 1 (EXPAND): Add column as NULLABLE
  ALTER TABLE users ADD COLUMN phone VARCHAR(20);

Deploy 2 (APP): Both old and new code work.
  New code writes phone when available.
  Old code ignores the column.

Deploy 3 (BACKFILL): Fill missing values
  UPDATE users SET phone = '' WHERE phone IS NULL;

Deploy 4 (CONTRACT): Add NOT NULL constraint
  ALTER TABLE users ALTER COLUMN phone SET NOT NULL;
  -- or: ALTER TABLE users ALTER COLUMN phone SET DEFAULT '';
```

```sql
-- PostgreSQL: add column with default is instant in PG 11+ (no table rewrite)
-- Safe to do in one deploy if you have a sensible default:
ALTER TABLE users ADD COLUMN preferences JSONB DEFAULT '{}' NOT NULL;
```

### Renaming a Column

```
❌ WRONG: ALTER TABLE users RENAME COLUMN name TO full_name;
  → Old app still writes to `name` → column not found → ERROR

✅ RIGHT: Three-phase

Deploy 1 (EXPAND): Add new column, copy data
  ALTER TABLE users ADD COLUMN full_name VARCHAR(255);
  UPDATE users SET full_name = name;  -- or trigger

Deploy 1b: Add trigger to keep both in sync during transition
  CREATE OR REPLACE FUNCTION sync_name() RETURNS trigger AS $$
  BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
      NEW.full_name := COALESCE(NEW.full_name, NEW.name);
      NEW.name := COALESCE(NEW.name, NEW.full_name);
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER sync_name_trigger
    BEFORE INSERT OR UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION sync_name();

Deploy 2 (APP): Update all app code to use `full_name`

Deploy 3 (CONTRACT): Drop trigger, drop old column
  DROP TRIGGER sync_name_trigger ON users;
  ALTER TABLE users DROP COLUMN name;
```

### Changing a Column Type

```
❌ WRONG: ALTER TABLE orders ALTER COLUMN amount TYPE DECIMAL(10,2);
  → Locks the table for potentially minutes (rewrites all rows)

✅ RIGHT: New column approach

Deploy 1 (EXPAND):
  ALTER TABLE orders ADD COLUMN amount_v2 DECIMAL(10,2);

  -- Trigger to keep in sync
  CREATE OR REPLACE FUNCTION sync_amount() RETURNS trigger AS $$
  BEGIN
    NEW.amount_v2 := NEW.amount::DECIMAL(10,2);
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER sync_amount_trigger
    BEFORE INSERT OR UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION sync_amount();

Deploy 2 (BACKFILL):
  UPDATE orders SET amount_v2 = amount::DECIMAL(10,2)
  WHERE amount_v2 IS NULL;  -- batch this!

Deploy 3 (APP): Use amount_v2 everywhere

Deploy 4 (CONTRACT):
  DROP TRIGGER sync_amount_trigger ON orders;
  ALTER TABLE orders DROP COLUMN amount;
  ALTER TABLE orders RENAME COLUMN amount_v2 TO amount;
```

### Dropping a Column

```
❌ WRONG: DROP COLUMN in same deploy as removing code
  → Old app still references column during rolling deploy → errors

✅ RIGHT:

Deploy 1 (APP): Remove all code references to the column
  -- App ignores the column but doesn't error when it exists

Deploy 2 (CONTRACT): Drop the column
  ALTER TABLE users DROP COLUMN legacy_field;
```

### Adding an Index

```
❌ WRONG: CREATE INDEX idx_users_email ON users(email);
  → Locks the table during index creation (minutes on large tables)

✅ RIGHT: CONCURRENTLY
  CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
  -- No locks! Reads and writes continue.
  -- Takes longer but safe for production.

-- Check progress:
SELECT phase, blocks_done, blocks_total
FROM pg_stat_progress_create_index;
```

### Adding a Foreign Key

```sql
-- NOT VALID: add constraint without scanning existing rows (instant)
ALTER TABLE orders
  ADD CONSTRAINT fk_orders_user
  FOREIGN KEY (user_id) REFERENCES users(id)
  NOT VALID;

-- Validate in background (no lock on writes)
ALTER TABLE orders VALIDATE CONSTRAINT fk_orders_user;
-- This takes a ShareUpdateExclusiveLock — allows reads & writes
```

### Adding a NOT NULL Constraint

```sql
-- Fast approach: check constraint first, then NOT NULL
-- Step 1: Add check constraint (NOT VALID = no scan)
ALTER TABLE orders
  ADD CONSTRAINT orders_amount_not_null
  CHECK (amount IS NOT NULL) NOT VALID;

-- Step 2: Validate (no write lock)
ALTER TABLE orders VALIDATE CONSTRAINT orders_amount_not_null;

-- Step 3: Add NOT NULL (cheap when check constraint exists)
ALTER TABLE orders ALTER COLUMN amount SET NOT NULL;

-- Step 4: Drop redundant check constraint
ALTER TABLE orders DROP CONSTRAINT orders_amount_not_null;
```

---

## Large Table Backfills

Updating millions of rows in one query = long lock, possible timeout, huge WAL write.

```sql
-- BAD: Single giant update
UPDATE users SET status = 'active' WHERE status IS NULL;
-- Locks all rows, generates huge undo log, can OOM

-- GOOD: Batched updates with delay
DO $$
DECLARE
  batch_size INT := 1000;
  last_id BIGINT := 0;
  max_id BIGINT;
BEGIN
  SELECT MAX(id) INTO max_id FROM users;

  WHILE last_id < max_id LOOP
    UPDATE users
    SET status = 'active'
    WHERE id > last_id
      AND id <= last_id + batch_size
      AND status IS NULL;

    last_id := last_id + batch_size;
    PERFORM pg_sleep(0.01);  -- brief pause between batches
  END LOOP;
END;
$$;
```

```js
// Node.js batched backfill script
async function backfillUserStatus() {
  let lastId = 0;
  const batchSize = 1000;

  while (true) {
    const result = await db.query(`
      UPDATE users
      SET status = 'active'
      WHERE id > $1 AND id <= $1 + $2 AND status IS NULL
      RETURNING id
    `, [lastId, batchSize]);

    if (result.rows.length === 0) break;

    lastId += batchSize;
    console.log(`Backfilled up to id ${lastId}`);
    await new Promise(r => setTimeout(r, 10)); // 10ms pause
  }
}
```

---

## Migration Tools

### Prisma Migrate

```bash
# Development
npx prisma migrate dev --name add_phone_to_users
# Creates migration file + applies it

# Production
npx prisma migrate deploy
# Applies pending migrations (non-interactive)

# Check status
npx prisma migrate status
```

```sql
-- migrations/20240115_add_phone/migration.sql
-- Generated by Prisma, but edit if needed for safety:
ALTER TABLE "users" ADD COLUMN "phone" TEXT;
-- Note: Prisma doesn't add CONCURRENTLY — add manually for large tables
```

**Prisma Limitations:**
- Doesn't generate `CONCURRENTLY` for indexes — add manually
- Can't handle complex data migrations — use custom scripts
- `migrate dev` with shadow DB may not match prod behavior exactly

### Custom migration with Prisma

```typescript
// prisma/migrations/20240115_backfill_phone/migration.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function up() {
  // Custom logic Prisma can't auto-generate
  let cursor: string | undefined;
  do {
    const users = await prisma.user.findMany({
      take: 1000,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      where: { phone: null },
      select: { id: true, legacyPhone: true },
    });

    if (users.length === 0) break;

    await Promise.all(users.map(u =>
      prisma.user.update({
        where: { id: u.id },
        data: { phone: formatPhone(u.legacyPhone) },
      })
    ));

    cursor = users[users.length - 1].id;
  } while (true);
}
```

### Flyway / Liquibase (Java-world, used in some Node shops)

```sql
-- V1__create_users.sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL
);

-- V2__add_phone_nullable.sql
ALTER TABLE users ADD COLUMN phone VARCHAR(20);

-- V3__backfill_phone.sql
UPDATE users SET phone = '' WHERE phone IS NULL;

-- V4__phone_not_null.sql
ALTER TABLE users ALTER COLUMN phone SET NOT NULL;
```

---

## Locking Reference (PostgreSQL)

| Operation | Lock Type | Blocks |
|-----------|-----------|--------|
| `SELECT` | AccessShare | Only AccessExclusive |
| `INSERT/UPDATE/DELETE` | RowExclusive | ShareLock, ExclusiveLock |
| `CREATE INDEX` | ShareLock | ALL writes |
| `CREATE INDEX CONCURRENTLY` | ShareUpdateExclusive | Only other schema changes |
| `ALTER TABLE ADD COLUMN` (nullable, no default) | AccessExclusive | Everything |
| `ALTER TABLE ADD COLUMN DEFAULT` (PG 11+) | AccessExclusive | Brief (no rewrite) |
| `ALTER TABLE DROP COLUMN` | AccessExclusive | Everything |
| `VALIDATE CONSTRAINT` | ShareUpdateExclusive | Only schema changes |

**AccessExclusive** = full table lock. Avoid in production for large tables.

---

## Migration Checklist for Production

```
Before:
  □ Test migration on staging with production-size data
  □ Measure migration duration on staging
  □ Have rollback plan ready
  □ Schedule during low-traffic window if risky

SQL review:
  □ No table locks on large tables (use CONCURRENTLY, NOT VALID)
  □ Large backfills are batched, not single UPDATE
  □ New NOT NULL columns have defaults or are added in phases
  □ Indexes created CONCURRENTLY

Deployment:
  □ Schema changes deployed BEFORE code that requires them
  □ Old code still works with new schema (expand phase)
  □ Monitor error rates during deploy
  □ Monitor DB CPU/locks during migration

After:
  □ Contract phase: drop old columns/indexes once all instances updated
```

---

## Interview Questions

**Q: How do you rename a column in PostgreSQL without downtime?**
Three deploys: (1) EXPAND — add new column, backfill from old, add trigger to keep both in sync. (2) APP — update all code to read/write new column name. (3) CONTRACT — drop trigger and old column. Doing it in one step (`RENAME COLUMN`) requires no application change, but if any old app instances are running they'll fail.

**Q: Why is `CREATE INDEX CONCURRENTLY` important?**
Regular `CREATE INDEX` takes a ShareLock, blocking all writes for the duration (minutes on large tables). `CONCURRENTLY` uses ShareUpdateExclusiveLock, allowing reads and writes to continue. It takes longer (two passes over the table) but is safe for production.

**Q: What is the expand-contract pattern?**
A three-phase approach to zero-downtime schema changes: (1) EXPAND — add new backward-compatible schema (new nullable columns, new tables). Both old and new app code work. (2) MIGRATE — update app code to use new schema, backfill data. (3) CONTRACT — remove old schema after all instances run new code. Prevents the two-version compatibility problem during rolling deploys.

**Q: How do you add a NOT NULL column to a large table safely?**
Phase 1: Add the column as nullable. Phase 2: Backfill in batches (not a single UPDATE). Phase 3: Add `CHECK (col IS NOT NULL) NOT VALID` constraint, then `VALIDATE CONSTRAINT` (no write lock). Phase 4: Add `NOT NULL` (cheap now that the check constraint proves all rows are non-null). Phase 5: Drop the redundant check constraint.
