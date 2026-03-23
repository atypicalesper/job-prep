# Database Design

Schema design, normalization, and architectural patterns for production systems.

---

## Normalization

Normalization reduces redundancy and improves data integrity by organizing data into related tables.

### Normal Forms

**1NF — First Normal Form**
- Each column holds atomic (indivisible) values
- No repeating groups or arrays in columns
- Each row is unique (has a primary key)

```sql
-- ❌ Violates 1NF: phone_numbers is not atomic
CREATE TABLE contacts (
  id INT,
  name TEXT,
  phone_numbers TEXT  -- "555-1234, 555-5678"
);

-- ✅ 1NF: separate table
CREATE TABLE contact_phones (
  contact_id INT,
  phone_number TEXT,
  PRIMARY KEY (contact_id, phone_number)
);
```

**2NF — Second Normal Form**
- Must be in 1NF
- No partial dependencies: non-key columns depend on the WHOLE primary key
- Applies to composite primary keys

```sql
-- ❌ Violates 2NF: product_name depends only on product_id, not (order_id, product_id)
CREATE TABLE order_items (
  order_id INT,
  product_id INT,
  product_name TEXT,  -- depends only on product_id
  quantity INT,
  PRIMARY KEY (order_id, product_id)
);

-- ✅ 2NF: split product_name to products table
CREATE TABLE products (id INT PRIMARY KEY, name TEXT);
CREATE TABLE order_items (
  order_id INT, product_id INT REFERENCES products(id),
  quantity INT,
  PRIMARY KEY (order_id, product_id)
);
```

**3NF — Third Normal Form**
- Must be in 2NF
- No transitive dependencies: non-key columns depend only on the primary key, not on other non-key columns

```sql
-- ❌ Violates 3NF: zip_code → city (transitive dependency)
CREATE TABLE employees (
  id INT PRIMARY KEY,
  name TEXT,
  zip_code TEXT,
  city TEXT   -- depends on zip_code, not on id
);

-- ✅ 3NF
CREATE TABLE zip_codes (zip TEXT PRIMARY KEY, city TEXT);
CREATE TABLE employees (
  id INT PRIMARY KEY, name TEXT, zip_code TEXT REFERENCES zip_codes(zip)
);
```

**BCNF (Boyce-Codd NF)** — stricter 3NF: every determinant is a candidate key.

**Practical rule**: normalize to 3NF for OLTP systems. Denormalize deliberately for read-heavy/reporting workloads.

---

## Schema Patterns

### One-to-Many

Most common. Foreign key on the "many" side.

```sql
CREATE TABLE users    (id SERIAL PRIMARY KEY, email TEXT UNIQUE);
CREATE TABLE orders   (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id), total NUMERIC);
CREATE TABLE items    (id SERIAL PRIMARY KEY, order_id INT REFERENCES orders(id), sku TEXT, qty INT);
```

### Many-to-Many

Junction (join) table with two foreign keys.

```sql
CREATE TABLE tags     (id SERIAL PRIMARY KEY, name TEXT UNIQUE);
CREATE TABLE posts    (id SERIAL PRIMARY KEY, title TEXT);
CREATE TABLE post_tags (
  post_id INT REFERENCES posts(id) ON DELETE CASCADE,
  tag_id  INT REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);
```

### Self-Referential (Adjacency List)

Hierarchical data: categories, org charts, thread replies.

```sql
CREATE TABLE categories (
  id        SERIAL PRIMARY KEY,
  name      TEXT,
  parent_id INT REFERENCES categories(id)  -- NULL = root
);

-- Query entire tree (PostgreSQL recursive CTE)
WITH RECURSIVE tree AS (
  SELECT id, name, parent_id, 0 AS depth
  FROM categories WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, c.name, c.parent_id, t.depth + 1
  FROM categories c JOIN tree t ON c.parent_id = t.id
)
SELECT * FROM tree ORDER BY depth, name;
```

Alternatives for hierarchical data: **Nested Sets** (fast reads, slow writes), **Materialized Path** (`/root/child/grandchild`), **Closure Table** (all ancestor-descendant pairs).

### Polymorphic Associations

One table relates to multiple others. Two approaches:

```sql
-- ❌ Nullable FKs (messy)
CREATE TABLE comments (
  id INT PRIMARY KEY,
  post_id    INT REFERENCES posts(id),    -- NULL if on a video
  video_id   INT REFERENCES videos(id),   -- NULL if on a post
  body TEXT
);

-- ✅ Type + ID pattern (no FK constraint, but cleaner)
CREATE TABLE comments (
  id           INT PRIMARY KEY,
  target_type  TEXT NOT NULL,   -- 'post' | 'video'
  target_id    INT  NOT NULL,
  body         TEXT,
  INDEX idx_target (target_type, target_id)
);
```

---

## CQRS — Command Query Responsibility Segregation

Separate the write model (commands) from the read model (queries).

```
┌─────────────┐    command     ┌──────────────┐
│   Client    │ ─────────────> │  Write Model  │ → normalized DB
│             │                └──────────────┘
│             │    query       ┌──────────────┐
│             │ <───────────── │  Read Model   │ ← denormalized views/replica
└─────────────┘                └──────────────┘
```

**When to use**: high-traffic reads with complex reporting needs; read and write scaling requirements differ; audit/event history needed.

**Implementation options**:
- Same DB, separate query/command services
- Read replica for queries, primary for writes
- Separate stores: PostgreSQL for writes, Elasticsearch/Redis for reads

---

## Event Sourcing

Instead of storing current state, store all events. State is derived by replaying events.

```javascript
// Events stored (append-only)
{ type: 'OrderPlaced',    orderId: 1, userId: 42, at: '...' }
{ type: 'ItemAdded',      orderId: 1, sku: 'A1', qty: 2,   at: '...' }
{ type: 'PaymentReceived',orderId: 1, amount: 49.99,        at: '...' }
{ type: 'OrderShipped',   orderId: 1, trackingNo: 'XYZ',    at: '...' }

// Current state = replay of events
function buildOrder(events) {
  return events.reduce((state, event) => {
    switch (event.type) {
      case 'OrderPlaced': return { ...state, id: event.orderId, status: 'placed' };
      case 'ItemAdded':   return { ...state, items: [...(state.items||[]), event] };
      case 'OrderShipped': return { ...state, status: 'shipped', tracking: event.trackingNo };
    }
    return state;
  }, {});
}
```

**Projections (read models)**: pre-built views derived from the event stream, updated on each new event.

**Snapshots**: periodically snapshot state to avoid replaying all events from the beginning.

**Trade-offs**: full audit trail, easy temporal queries, event-driven integration. But: eventual consistency on read side, schema evolution is harder, storage grows.

---

## Soft Deletes

Never physically delete — mark as deleted. Useful for audit trails, undo, compliance.

```sql
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Soft delete
UPDATE users SET deleted_at = NOW() WHERE id = 42;

-- Query (always filter)
SELECT * FROM users WHERE deleted_at IS NULL;

-- Partial index — only index non-deleted rows
CREATE INDEX idx_users_email_active ON users(email) WHERE deleted_at IS NULL;
```

**Risks**: forgotten WHERE clauses expose deleted records. Mitigate with row-level security or views:

```sql
CREATE VIEW active_users AS SELECT * FROM users WHERE deleted_at IS NULL;
```

---

## Audit Tables

Track who changed what and when.

```sql
CREATE TABLE users_audit (
  audit_id    BIGSERIAL PRIMARY KEY,
  op          CHAR(1) NOT NULL,  -- 'I'nsert, 'U'pdate, 'D'elete
  changed_at  TIMESTAMPTZ DEFAULT NOW(),
  changed_by  TEXT DEFAULT current_user,
  old_data    JSONB,
  new_data    JSONB
);

-- PostgreSQL trigger
CREATE OR REPLACE FUNCTION audit_users() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO users_audit(op, old_data, new_data)
  VALUES (
    CASE TG_OP WHEN 'INSERT' THEN 'I' WHEN 'UPDATE' THEN 'U' ELSE 'D' END,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE row_to_json(OLD)::jsonb END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE row_to_json(NEW)::jsonb END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON users
FOR EACH ROW EXECUTE FUNCTION audit_users();
```

---

## Partitioning

Split large tables into smaller physical pieces while appearing as one table.

```sql
-- Range partitioning by date (PostgreSQL)
CREATE TABLE events (
  id         BIGSERIAL,
  created_at TIMESTAMPTZ NOT NULL,
  data       JSONB
) PARTITION BY RANGE (created_at);

CREATE TABLE events_2024 PARTITION OF events
  FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
CREATE TABLE events_2025 PARTITION OF events
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

-- Query hits only relevant partition (partition pruning)
SELECT * FROM events WHERE created_at >= '2025-01-01';
```

**Partition types**: Range (dates, IDs), List (region, status), Hash (even distribution).

**Benefits**: faster queries (partition pruning), faster deletes (drop partition), archive old data.

---

## Interview Questions

**Q: When would you denormalize a schema?**

When read performance outweighs write complexity: reporting/analytics (fewer joins), caching frequently-read aggregates (e.g., storing `comment_count` on posts to avoid COUNT queries), materialized views for dashboards. Always measure first — premature denormalization creates update anomalies.

**Q: What is the N+1 query problem?**

Fetching a list of N records, then issuing one query per record to fetch related data. Result: N+1 total queries instead of 1 or 2. Fix with JOINs, eager loading (`include` in ORMs), or DataLoader (batching + deduplication). Example: fetching 100 posts then querying author for each = 101 queries; instead JOIN posts + users = 1 query.

**Q: How would you model a hierarchical structure like categories?**

Four patterns: Adjacency List (simple, recursive CTEs for queries), Nested Sets (fast subtree reads, slow writes), Materialized Path (store `/parent/child` string, fast LIKE queries), Closure Table (all pairs in separate table, fastest reads, most storage). For most use cases with moderate hierarchy depth, Adjacency List + recursive CTE is sufficient. Closure Table for heavily read-optimized hierarchies.

**Q: CQRS vs traditional CRUD — when do you choose CQRS?**

Choose CQRS when: read and write loads differ significantly (scale them independently), read models need complex aggregations not suitable for the write schema, you need event sourcing or audit history, or different teams own reads vs writes. Avoid CQRS for simple CRUD apps — it adds significant complexity (eventual consistency, two models to maintain, synchronization).
