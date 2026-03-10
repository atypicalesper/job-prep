# SDE3 / Senior Engineer Topics

These are the topics that differentiate senior engineers from mid-level. Interviewers probe for depth, trade-off thinking, and system-level understanding.

---

## 1. Distributed Systems Fundamentals

### Consistency Models

```
Strong Consistency (Linearizability):
- Every read sees the most recent write
- Operations appear instantaneous and in order
- Expensive (coordination, latency)
- Use: banking, inventory, leader election

Sequential Consistency:
- Operations appear in the order they happened per process
- Global order may differ from real time
- Easier than linearizability

Causal Consistency:
- Related (causally connected) operations are ordered
- Unrelated operations may be reordered
- Balanced: correct and relatively fast
- Use: social feeds, collaborative editing

Eventual Consistency:
- If no more writes, all replicas eventually converge
- Reads may be stale
- Fast and highly available
- Use: DNS, shopping carts, social likes

Read-your-writes:
- After a write, same client always sees it
- Other clients may not see it yet
- Use: user profile updates
```

### Vector Clocks

```javascript
// Track causality in distributed systems
// Each node maintains a vector of logical clocks

class VectorClock {
  constructor(nodeId, nodes) {
    this.nodeId = nodeId;
    this.clock = Object.fromEntries(nodes.map(n => [n, 0]));
  }

  tick() {
    this.clock[this.nodeId]++;
    return { ...this.clock };
  }

  update(receivedClock) {
    // Take max of each position:
    for (const [node, time] of Object.entries(receivedClock)) {
      this.clock[node] = Math.max(this.clock[node] || 0, time);
    }
    this.clock[this.nodeId]++; // increment own
  }

  // Returns: 'before', 'after', 'concurrent'
  compare(other) {
    let less = false, greater = false;
    for (const node of Object.keys(this.clock)) {
      if (this.clock[node] < other[node]) less = true;
      if (this.clock[node] > other[node]) greater = true;
    }
    if (less && !greater) return 'before';
    if (greater && !less) return 'after';
    return 'concurrent'; // conflict!
  }
}
```

---

## 2. Microservices Architecture

### Service Communication Patterns

```
Synchronous (Request/Response):
- REST / gRPC — caller waits for response
- Use when: you need the result immediately to continue
- Coupling: tight (service must be up)
- Problem: cascading failures

Asynchronous (Event-driven):
- Message queues (Kafka, RabbitMQ)
- Use when: result not needed immediately, fire-and-forget
- Coupling: loose (services decoupled)
- Problem: eventual consistency, harder to debug

Saga Pattern for Distributed Transactions:
- Each service executes local transaction and publishes event
- Next service listens and executes its local transaction
- Compensating transactions on failure (rollback logic)

Orchestration Saga:
  Saga Orchestrator → Order Service → Payment Service → Inventory Service
  If Inventory fails → Orchestrator tells Payment to refund

Choreography Saga:
  Order created → (event) → Payment Service charges → (event) → Inventory reserves
  If Inventory fails → emits failed event → Payment listens and refunds
```

### API Gateway Pattern

```
Client → API Gateway → [Auth, Rate Limit, Routing, Transform] → Microservices

Gateway responsibilities:
- Authentication (validate JWT once here)
- Authorization (route-level permission check)
- Rate limiting
- Request routing (path → service)
- Protocol translation (REST → gRPC)
- Response aggregation (BFF pattern)
- SSL termination
- Logging + tracing injection
- Circuit breaking

BFF (Backend for Frontend):
- Separate API Gateway per client type (mobile, web, partner)
- Web BFF returns rich data with many fields
- Mobile BFF returns minimal data, mobile-optimized
- Avoids over/under-fetching for different clients
```

---

## 3. Observability (Logs, Metrics, Traces)

```javascript
// The Three Pillars of Observability:

// 1. Logs — what happened (structured logging with Winston/Pino):
import pino from 'pino';
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: ['password', 'token', 'secret', 'creditCard'], // never log sensitive fields!
});

// Always include: requestId, userId, service, duration
logger.info({
  requestId: req.id,
  userId: req.user?.id,
  method: req.method,
  path: req.path,
  statusCode: res.statusCode,
  duration: Date.now() - req.startTime,
  msg: 'Request completed'
});

// 2. Metrics — how much (Prometheus):
import { Counter, Histogram, Gauge } from 'prom-client';

const httpRequests = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status']
});

const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Active WebSocket connections'
});

// 3. Traces — where time was spent (OpenTelemetry):
import { trace, context, propagation } from '@opentelemetry/api';

const tracer = trace.getTracer('my-service');

async function processOrder(orderId: string) {
  const span = tracer.startSpan('processOrder');
  span.setAttribute('order.id', orderId);

  try {
    const span2 = tracer.startSpan('db.query', { parent: span });
    const order = await db.orders.findById(orderId);
    span2.end();

    const span3 = tracer.startSpan('payment.charge', { parent: span });
    await chargePayment(order);
    span3.end();

    span.setStatus({ code: SpanStatusCode.OK });
    return order;
  } catch (err) {
    span.recordException(err);
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw err;
  } finally {
    span.end();
  }
}
```

---

## 4. Code Quality and Architecture Patterns

### Clean Architecture / Hexagonal Architecture

```
                    ┌──────────────────────┐
                    │   Infrastructure     │  (DB, HTTP, Queue, Cache)
                    │  ┌──────────────┐   │
                    │  │  Application │   │  (Use Cases, Services)
                    │  │ ┌──────────┐ │   │
                    │  │ │  Domain  │ │   │  (Entities, Business Rules)
                    │  │ └──────────┘ │   │
                    │  └──────────────┘   │
                    └──────────────────────┘

Rules:
- Dependencies point INWARD only
- Domain has no external dependencies
- Application depends on Domain
- Infrastructure depends on Application interfaces

Example structure:
src/
  domain/
    user.entity.ts          (pure business object, no framework dependencies)
    user.repository.ts      (interface — abstract, no implementation)
  application/
    create-user.usecase.ts  (orchestrates domain + calls repository interface)
  infrastructure/
    postgres.user.repo.ts   (implements domain/user.repository.ts)
    express.routes.ts        (HTTP layer, calls use cases)
```

### Repository Pattern

```typescript
// Domain interface:
interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<User>;
  delete(id: string): Promise<void>;
}

// Concrete implementation (infrastructure):
class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<User | null> {
    const record = await this.prisma.user.findUnique({ where: { id } });
    return record ? this.toDomain(record) : null;
  }

  private toDomain(record: PrismaUser): User {
    return new User(record.id, record.name, record.email);
  }
}

// Test implementation (in-memory):
class InMemoryUserRepository implements IUserRepository {
  private store = new Map<string, User>();

  async findById(id: string): Promise<User | null> {
    return this.store.get(id) ?? null;
  }

  async save(user: User): Promise<User> {
    this.store.set(user.id, user);
    return user;
  }
}

// Use case depends on interface, not implementation:
class CreateUserUseCase {
  constructor(private readonly repo: IUserRepository) {} // ← interface!

  async execute(data: CreateUserDto): Promise<User> {
    const existing = await this.repo.findByEmail(data.email);
    if (existing) throw new ConflictError('Email already in use');
    const user = User.create(data);
    return this.repo.save(user);
  }
}
```

---

## 5. Technical Leadership Topics

### Code Review Best Practices

```
What to look for:
✅ Correctness — does it do what it's supposed to?
✅ Security — injection, auth, data exposure, timing attacks
✅ Performance — N+1, unbounded loops, memory leaks
✅ Error handling — what happens when it fails?
✅ Testability — can this be unit tested easily?
✅ Maintainability — will someone understand this in 6 months?
✅ Edge cases — empty input, concurrent access, large data

What NOT to do:
❌ Rewrite the whole thing in review comments
❌ Enforce personal style preferences without justification
❌ Block PRs for minor nits (use "nit:" prefix for optional suggestions)
❌ Approve without actually reading (rubber stamp)

PR author responsibilities:
- Small PRs (< 400 lines) are reviewed better
- Clear description: what, why, how to test
- Self-review before requesting review
- Respond to all comments
```

### Incident Response (STAR Format)

```
SRE practices a senior engineer should know:
- SLA: Service Level Agreement (contract with users, e.g., 99.9% uptime)
- SLO: Service Level Objective (internal target, e.g., 99.95% uptime)
- SLI: Service Level Indicator (metric, e.g., % of successful requests)
- Error Budget: 1 - SLO = acceptable downtime (0.05% = ~4.4 hours/year)

Incident lifecycle:
1. Detection (alert fires, user reports)
2. Triage (severity assessment)
3. Mitigation (stop the bleeding — rollback, disable feature flag)
4. Resolution (fix root cause)
5. Post-mortem (blameless, action items, timeline)

Runbook components:
- What does this alert mean?
- How to investigate (what to check first)
- Common causes and fixes
- Who to escalate to
- How to rollback
```

---

## 6. Performance Engineering (Senior Level)

### Database Query Optimization

```sql
-- ALWAYS: understand what your ORM generates
-- In Prisma: prisma.$on('query', e => console.log(e.query))
-- In pg: { log: ['query'] }

-- Steps for slow query:
1. EXPLAIN ANALYZE the query
2. Look for: Seq Scan on large tables, high actual rows vs estimated rows
3. Add index on filtered/joined columns
4. Consider query rewrite (subquery → join, or join → EXISTS)
5. Verify with EXPLAIN ANALYZE again

-- Example optimization:
-- ❌ Slow (correlated subquery — runs per row):
SELECT * FROM orders o
WHERE (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) > 5;

-- ✅ Fast (join with aggregation):
SELECT o.*
FROM orders o
JOIN (
  SELECT order_id, COUNT(*) as item_count
  FROM order_items
  GROUP BY order_id
  HAVING COUNT(*) > 5
) counts ON o.id = counts.order_id;
```

### Memory Management at Scale

```javascript
// Streams for large data (never load all in memory):
async function exportUsersToCSV(res) {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');

  const stream = db.query('SELECT id, name, email FROM users')
    .stream(); // PostgreSQL cursor-based streaming

  const csv = new Transform({
    objectMode: true,
    transform(row, _, cb) {
      cb(null, `${row.id},${row.name},${row.email}\n`);
    }
  });

  stream.pipe(csv).pipe(res);
  // Processes one row at a time — works for 10M rows without OOM
}

// Event loop protection for heavy computation:
async function processLargeArray(items) {
  const CHUNK_SIZE = 1000;
  const results = [];

  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    results.push(...processChunk(chunk));

    // Yield to event loop every chunk — allows other requests to proceed:
    await new Promise(r => setImmediate(r));
  }

  return results;
}
```

---

## 7. Interview Questions for SDE3 Level

**Q: How do you ensure backward compatibility when evolving an API?**
A: (1) Never change field meaning — add new fields, deprecate old ones. (2) Make new fields optional with sensible defaults. (3) Use API versioning (v1, v2) for breaking changes. (4) Provide deprecation notices in headers/docs with sunset dates. (5) Keep old versions alive long enough for clients to migrate (6-12 months). (6) Write contract tests to catch breaking changes before deployment.

**Q: How would you handle a situation where a service needs to read its own writes?**
A: "Read-your-writes" consistency problem. Solutions: (1) Route reads to primary DB (defeats the purpose of replicas). (2) After write, include a token/timestamp and read from replica only if it's caught up past that point. (3) Cache the written value client-side and use it for subsequent reads until replica lag passes. (4) Sticky routing — same user always hits the same replica. Recommendation: explicit session consistency flag in DB clients (AWS Aurora supports this).

**Q: What is the difference between horizontal and vertical partitioning (sharding vs partitioning)?**
A: Vertical partitioning: split columns across tables (e.g., store rarely-used columns like user_bio in a separate table). Reduces row width, speeds up queries that don't need those columns. Horizontal partitioning (sharding): split rows across servers — shard 1 has users 1-1M, shard 2 has users 1M-2M. Enables scale-out. Partitioning within one DB instance (PostgreSQL `PARTITION BY`) is the same concept but stays on one server.

**Q: Walk me through designing a resilient payment processing system.**
A: Key points: (1) Idempotency keys — client generates unique ID per payment attempt; server stores result and returns same result on retry. (2) Saga pattern for multi-step: reserve funds → charge card → confirm order → each with compensating transactions. (3) Outbox pattern: write payment record and outbox event atomically, separate process publishes event — prevents lost events. (4) At-least-once delivery with deduplication. (5) Timeout + async confirmation — charge may succeed but response lost; use async status webhook. (6) PCI compliance — never store raw card numbers, use tokenization (Stripe tokens).

**Q: How do you approach database migrations in production with zero downtime?**
A: Expand-contract pattern: (1) Expand — add new column (nullable or with default), both old and new code work. (2) Migrate — backfill existing rows, deploy new code that writes to both old and new. (3) Contract — once all data migrated and old code retired, remove old column. Never: rename a column in one step (breaks old code), add NOT NULL without default (locks table). Always: test migration on a copy of production data first; have rollback plan; run during low traffic.
