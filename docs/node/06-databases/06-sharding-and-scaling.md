# Database Sharding & Scaling

## Scaling Strategies Overview

```
Vertical Scaling (Scale Up)          Horizontal Scaling (Scale Out)
─────────────────────────────        ─────────────────────────────
  More RAM/CPU/Disk                  More servers
  Single node                        Multiple nodes
  Simpler                            Complex coordination
  Limited ceiling                    Nearly unlimited
  No distribution bugs               Distributed systems problems
```

For databases, horizontal scaling usually means:
1. **Read replicas** — scale reads
2. **Sharding** — scale writes & storage

---

## Read Replicas

### Architecture

```
                    ┌──────────────┐
                    │   Primary    │
                    │  (read/write)│
                    └──────┬───────┘
                           │ replication stream
           ┌───────────────┼───────────────┐
           ↓               ↓               ↓
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ Replica 1│    │ Replica 2│    │ Replica 3│
    │(read-only)│   │(read-only)│   │(read-only)│
    └──────────┘    └──────────┘    └──────────┘
```

### Replication Lag

Replicas are eventually consistent. Writes to primary appear on replicas after replication lag (typically 1-100ms, can be seconds if primary is under load).

```sql
-- Check replication lag in PostgreSQL
SELECT
  client_addr,
  pg_wal_lsn_diff(pg_current_wal_lsn(), sent_lsn) AS send_lag,
  pg_wal_lsn_diff(sent_lsn, replay_lsn) AS replay_lag
FROM pg_stat_replication;
```

### Read-Your-Writes Consistency

After a user writes, they expect to read their own write. Can't rely on replica.

**Solutions:**

```js
// Option 1: Route user's own reads to primary (sticky reads)
async function getUser(userId, request) {
  // If user just performed a write, read from primary
  const justWrote = request.session.lastWriteTime
    && (Date.now() - request.session.lastWriteTime < 5000);

  const db = justWrote ? primaryDb : replicaDb;
  return db.findUser(userId);
}

// Option 2: Wait for replication (PostgreSQL)
// After write: capture LSN, wait for replica to catch up
const { pg_current_wal_lsn: lsn } = await primary.query(
  'SELECT pg_current_wal_lsn()'
);
// On replica read:
await replica.query(
  'SELECT pg_wal_lsn_diff($1, pg_last_wal_replay_lsn()) <= 0',
  [lsn]
);

// Option 3: Use version/timestamp token (DynamoDB)
// Write returns a version, subsequent reads include it
// DB waits until replica is at least at that version
```

### Connection Pooling with Replicas (PgBouncer / Prisma)

```js
// Prisma read replicas
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.PRIMARY_URL },
  },
});

// Use $extends for read replica routing
const prismaExtended = prisma.$extends(
  readReplicas({
    url: [process.env.REPLICA1_URL, process.env.REPLICA2_URL],
  })
);

// Reads go to replica automatically
const users = await prismaExtended.user.findMany(); // → replica

// Writes go to primary
await prismaExtended.user.create({ data: { name: 'Alice' } }); // → primary

// Force primary read (after write)
const user = await prismaExtended.user.findUnique({
  where: { id },
  // $primaryKey
});
```

---

## Database Sharding

Split data across multiple database instances (shards). Each shard holds a subset of the data.

```
Without sharding:                  With sharding:
┌────────────────┐                ┌────────────┐ ┌────────────┐ ┌────────────┐
│   All users    │                │ Users 0-33%│ │Users 33-66%│ │Users 66-99%│
│  users table   │                │  Shard 0   │ │  Shard 1   │ │  Shard 2   │
│  100M rows     │                │  ~33M rows │ │  ~33M rows │ │  ~33M rows │
└────────────────┘                └────────────┘ └────────────┘ └────────────┘
```

### Sharding Strategies

#### 1. Range-Based Sharding
```
Shard 0: user_id 1–1,000,000
Shard 1: user_id 1,000,001–2,000,000
Shard 2: user_id 2,000,001–3,000,000

Shard key: user_id
```

**Pros:** Range queries efficient (scan one shard), easy to add new shards at end.
**Cons:** Hotspot problem — new users always go to last shard ("write hotspot").

```js
function getShard(userId, totalShards = 3) {
  const rangeSize = 1_000_000;
  return Math.floor(userId / rangeSize) % totalShards;
}
```

#### 2. Hash-Based Sharding
```
shard = hash(user_id) % N

user_id=42  → hash → shard 1
user_id=43  → hash → shard 0
user_id=44  → hash → shard 2
```

**Pros:** Even distribution, no hotspots.
**Cons:** Range queries require all shards, resharding is expensive.

```js
function getShard(userId, totalShards) {
  // Consistent hash preferred over simple modulo (see below)
  return murmurhash(userId.toString()) % totalShards;
}
```

#### 3. Consistent Hashing
Solves the resharding problem with hash-based sharding.

```
Ring of hash values (0 to 2^32):

          0
        /   \
    Node B   Node A
      |         |
   Node C   Node D
        \   /
         2^32

Data point → find nearest node clockwise
```

When adding Node E:
- Only data between E's predecessor and E migrates to E
- Other nodes unaffected (unlike modulo where all data moves)

```js
class ConsistentHashRing {
  constructor(nodes = [], replicas = 150) {
    this.replicas = replicas;
    this.ring = new Map();
    this.sortedKeys = [];
    nodes.forEach(n => this.addNode(n));
  }

  hash(key) {
    // Use murmurhash or fnv in production
    let h = 0;
    for (const c of key) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
    return Math.abs(h);
  }

  addNode(node) {
    for (let i = 0; i < this.replicas; i++) {
      const key = this.hash(`${node}:${i}`);
      this.ring.set(key, node);
      this.sortedKeys.push(key);
    }
    this.sortedKeys.sort((a, b) => a - b);
  }

  getNode(key) {
    const hash = this.hash(key);
    // Find first node with hash >= key hash
    const idx = this.sortedKeys.findIndex(k => k >= hash);
    const ringKey = idx === -1
      ? this.sortedKeys[0]              // wrap around
      : this.sortedKeys[idx];
    return this.ring.get(ringKey);
  }
}

const ring = new ConsistentHashRing(['shard0', 'shard1', 'shard2']);
ring.getNode('user:42');  // → 'shard1'
ring.getNode('user:100'); // → 'shard0'
```

#### 4. Directory-Based Sharding
A lookup table maps shard keys to shard locations.

```
lookup_table:
  user_id 1-1000      → shard0
  user_id 1001-2000   → shard1
  org_id 'acme'       → shard3  (tenant-based)

Pros: Maximum flexibility, easy to rebalance
Cons: Lookup table is a bottleneck, must be highly available
```

---

## Choosing a Shard Key

The most important decision. A bad shard key causes:
- **Hotspots** — one shard gets all traffic
- **Uneven data** — one shard fills up
- **Cross-shard queries** — slow, requires scatter-gather

### Good shard key properties
1. High cardinality (many distinct values)
2. Even distribution
3. Co-locates frequently queried data
4. Avoids cross-shard transactions

### Examples

```
BAD:  shard by country → most users in US → shard_US is a hotspot
BAD:  shard by created_at → new data piles on the latest shard
BAD:  shard by user_type → 90% are 'free' users → one shard overwhelmed

GOOD: shard by user_id hash → even spread, user data co-located
GOOD: shard by (org_id, user_id) → multi-tenant app, org data co-located
GOOD: shard by UUID → inherently random, even distribution
```

---

## Cross-Shard Operations

The pain of sharding:

### Scatter-Gather Queries
```js
// Find all users with age > 30 — must query all shards
async function findUsersOverAge(age) {
  const shards = [shard0, shard1, shard2];
  const results = await Promise.all(
    shards.map(shard =>
      shard.query('SELECT * FROM users WHERE age > $1', [age])
    )
  );
  // Merge and sort results
  return results.flat().sort((a, b) => a.id - b.id);
}
```

### Cross-Shard Transactions
Avoid if possible. If needed:
- Use Saga pattern (eventual consistency)
- Use 2PC with a transaction coordinator (high latency)
- Redesign to co-locate related data

```js
// Transfer between users on different shards — Saga approach
async function transfer(fromUserId, toUserId, amount) {
  const fromShard = ring.getNode(fromUserId);
  const toShard = ring.getNode(toUserId);

  // Step 1: Debit
  await fromShard.query(
    'UPDATE users SET balance = balance - $1 WHERE id = $2 AND balance >= $1',
    [amount, fromUserId]
  );

  // Step 2: Credit (may fail — need compensation)
  try {
    await toShard.query(
      'UPDATE users SET balance = balance + $1 WHERE id = $2',
      [amount, toUserId]
    );
  } catch (err) {
    // Compensate: refund
    await fromShard.query(
      'UPDATE users SET balance = balance + $1 WHERE id = $2',
      [amount, fromUserId]
    );
    throw err;
  }
}
```

---

## CQRS — Command Query Responsibility Segregation

Separate the read model and write model.

```
                 ┌───────────────────────────────┐
                 │          Application           │
                 └────────┬────────────┬──────────┘
                          │            │
                   Commands           Queries
                  (writes)           (reads)
                          │            │
                 ┌────────▼──┐    ┌───▼────────────┐
                 │  Command  │    │  Query Handler  │
                 │  Handler  │    │                 │
                 └────────┬──┘    └───▲────────────┘
                          │           │
                 ┌────────▼──┐    ┌───┴────────────┐
                 │Write Model│    │  Read Model     │
                 │(normalized│    │(denormalized,   │
                 │Postgres)  │    │ Elasticsearch,  │
                 └────────┬──┘    │ Redis, etc.)    │
                          │       └────────────────┘
                          │  Event / Projection
                          └──────────────────────►
```

### Example: Order System

```js
// Write model — normalized, consistent
// orders table: id, user_id, status, created_at
// order_items: order_id, product_id, quantity, price

// Command
async function placeOrder(command) {
  const { userId, items } = command;

  await db.transaction(async (trx) => {
    const order = await trx('orders').insert({
      user_id: userId,
      status: 'pending',
      created_at: new Date(),
    }).returning('*');

    await trx('order_items').insert(
      items.map(item => ({ order_id: order[0].id, ...item }))
    );

    // Emit event for read model projection
    await eventBus.publish('OrderPlaced', {
      orderId: order[0].id,
      userId,
      items,
    });
  });
}

// Read model — denormalized for fast queries
// Read store (Redis/Elasticsearch/denormalized PG table):
// {
//   orderId, userId, userName, userEmail,
//   items: [{ productName, quantity, price }],
//   total, status, createdAt
// }

// Projection — subscribes to events, updates read model
eventBus.subscribe('OrderPlaced', async (event) => {
  const user = await db('users').where({ id: event.userId }).first();
  const products = await db('products').whereIn('id',
    event.items.map(i => i.productId)
  );

  const readModel = {
    orderId: event.orderId,
    userId: event.userId,
    userName: user.name,
    userEmail: user.email,
    items: event.items.map(item => ({
      productName: products.find(p => p.id === item.productId).name,
      quantity: item.quantity,
      price: item.price,
    })),
    total: event.items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    status: 'pending',
  };

  await redis.set(`order:${event.orderId}`, JSON.stringify(readModel));
  await elasticsearch.index({ index: 'orders', body: readModel });
});

// Query — ultra-fast, no joins
async function getOrder(orderId) {
  return JSON.parse(await redis.get(`order:${orderId}`));
}
```

### When to Use CQRS
- Read/write workloads are very different (e.g., 100:1 read to write ratio)
- Read model needs different structure than write model (search, reports)
- Need to scale reads independently
- Event sourcing (natural fit)

### When NOT to Use CQRS
- Simple CRUD with no complex business logic
- Small teams / simple domains (added complexity not worth it)
- Eventual consistency is unacceptable for reads

---

## Connection Pooling Deep Dive

### Why Connection Pooling

Each PostgreSQL connection = ~5-10MB RAM + OS thread. With 1000 concurrent requests, 1000 connections = 5-10GB just for connections. PgBouncer pools connections, limiting actual DB connections.

```
App servers (1000 concurrent)    PgBouncer          PostgreSQL
   ─────────────────────────     ─────────          ──────────
   [req1] ──────────────────►   pool 100 ──────►   max 100 conns
   [req2] ──────────────────►   connections         shared
   [req3] ──────────────────►
   ...
   [req1000]
```

### PgBouncer Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| Session | Connection held for session lifetime | Legacy apps |
| Transaction | Connection held per transaction (default) | Most web apps |
| Statement | Connection released after each statement | Rarely used |

### Pool Sizing Formula

```
Pool size = Tn × (Cm - 1) + 1

Tn = number of threads in the application
Cm = time to complete a query / time to send + receive query

Simpler guideline (PostgreSQL wiki):
connections = ((core_count * 2) + effective_spindle_count)
```

```js
// pg-pool configuration
const pool = new Pool({
  host: 'localhost',
  database: 'mydb',
  max: 20,           // max connections in pool
  min: 5,            // min connections to keep warm
  idleTimeoutMillis: 30000,  // close idle after 30s
  connectionTimeoutMillis: 2000,  // fail if no connection in 2s
  maxUses: 7500,     // recycle connection after N uses
});

// Monitoring pool health
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
});

setInterval(() => {
  console.log({
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  });
}, 5000);
```

---

## Interview Questions

**Q: What is sharding and when would you use it?**
Sharding horizontally partitions data across multiple DB instances. Use when: single DB can't handle write throughput, dataset too large for one node, or need geographic distribution. Trade-offs: operational complexity, cross-shard queries are expensive, resharding is hard.

**Q: What's the difference between range and hash sharding?**
Range: shard by value range (e.g., user_id 1-1M → shard0). Efficient for range queries but prone to hotspots. Hash: shard = hash(key) % N. Even distribution but range queries hit all shards. Use consistent hashing to avoid bulk data movement when adding shards.

**Q: How do you handle replication lag in a read replica setup?**
Options: (1) read-your-writes: route user's own reads to primary for a short window after a write, (2) version tokens: include the write's LSN in the response, replica waits until it catches up, (3) sticky sessions: always route a user to the same replica. In practice, a combination: primary for writes + recent reads, replicas for everything else.

**Q: What's the benefit of CQRS?**
Separates write model (normalized, consistent, ACID) from read model (denormalized, optimized for queries). Allows independent scaling, technology choice per side (e.g., Postgres for writes, Elasticsearch for full-text search reads), and keeps complex domain logic in the command/write side without polluting the query side.

**Q: Why is connection pooling critical for Node.js apps?**
Node.js may have hundreds of concurrent async operations. Without pooling, each would need a DB connection, exhausting DB connection limits (PostgreSQL defaults to 100). Pooling reuses connections across requests — with transaction-mode PgBouncer, a high-traffic app can multiplex thousands of concurrent requests onto ~20-100 actual connections.
