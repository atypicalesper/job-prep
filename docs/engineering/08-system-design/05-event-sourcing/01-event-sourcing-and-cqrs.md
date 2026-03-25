# Event Sourcing and CQRS

---

## Traditional CRUD vs Event Sourcing

Traditional persistence models store the current state of an entity: when something changes, you overwrite the previous value with the new one. This is simple and efficient for most applications, but it destroys information — you know what the state is now, but not how it got there, what it was before, or why it changed. Event Sourcing inverts this model: instead of storing current state, you store an immutable, append-only log of every change (event) that has ever occurred. Current state is a derived view computed by replaying all events in order. The append-only log becomes the single source of truth, making the system's full history queryable, auditable, and replayable. The fundamental trade-off is operational complexity: event sourcing requires more infrastructure and mental overhead than CRUD, but provides capabilities (audit trails, time travel, projections) that are impossible to retrofit into a CRUD system after the fact.

```
Traditional CRUD — store current state:
  UPDATE orders SET status = 'shipped' WHERE id = 1;
  You know the current state. You've lost the history.

  Problems:
    - No audit trail (who changed this, when, why?)
    - Debugging production issues: what was the state before?
    - Recreating past states is impossible
    - Race conditions: two updates arrive, last-write-wins silently

Event Sourcing — store events (facts that happened):
  INSERT INTO events (order_id, type, payload) VALUES
    (1, 'OrderPlaced',   '{"items": [...], "total": 99.99}'),
    (1, 'PaymentTaken',  '{"amount": 99.99, "method": "card"}'),
    (1, 'OrderShipped',  '{"trackingId": "UPS-123"}');

  Current state = replay all events for that entity.
  You never lose history. Every change is traceable.
```

---

## Event Sourcing Core Concepts

Before reading the code, it is important to have a firm mental model of the vocabulary, because these terms have precise meanings that differ from their informal usage. An event is not a notification or a trigger — it is a statement of fact about something that has already happened, expressed in past tense and never modified. An aggregate is the consistency boundary: all events for one aggregate are applied in order to produce that aggregate's state. Projections are secondary read models derived from the event stream and can be rebuilt from scratch at any time, which means you can add new query patterns retroactively without migrating data. Understanding these distinctions prevents the most common event sourcing mistakes, such as making events mutable or coupling projections to the aggregate's internal logic.

```
Event:       An immutable fact that happened in the past (past tense)
             { type: 'OrderShipped', orderId: 1, trackingId: 'UPS-123', at: '...' }

Stream:      All events for one aggregate (e.g., order #1's event history)

Aggregate:   The entity that events apply to (Order, User, Account)
             Rebuilt by replaying its event stream

Projection:  A read model built by processing events
             (e.g., "all active orders" table derived from events)

Snapshot:    Performance optimization — store aggregate state at event N
             Replay from snapshot instead of from event 0
             Useful when aggregate has 1000s of events

Event store: Append-only log of events (EventStoreDB, Kafka, PostgreSQL table)
```

---

## Implementing Event Sourcing in Node.js

The implementation below shows the canonical structure: typed domain events, an aggregate class that rebuilds itself from an event stream via a pure `applyEvent` reducer, an append-only event store with optimistic concurrency, and a command handler that loads the aggregate, applies business logic, and persists the new events. The `aggregateVersion` field on every event is central — it enables optimistic concurrency control, where two concurrent writes to the same aggregate are detected because only one can match the expected version. The aggregate itself never writes to the store directly; it only raises events and accumulates them as "uncommitted", leaving persistence to the command handler.

```typescript
// ─── Domain Events ──────────────────────────────────────────────────────────
interface DomainEvent {
  type: string;
  aggregateId: string;
  aggregateVersion: number;
  occurredAt: Date;
  payload: Record<string, unknown>;
}

interface OrderPlaced extends DomainEvent {
  type: 'OrderPlaced';
  payload: { items: Item[]; total: number; customerId: string };
}

interface PaymentTaken extends DomainEvent {
  type: 'PaymentTaken';
  payload: { amount: number; method: string; transactionId: string };
}

interface OrderShipped extends DomainEvent {
  type: 'OrderShipped';
  payload: { trackingId: string; carrier: string };
}

interface OrderCancelled extends DomainEvent {
  type: 'OrderCancelled';
  payload: { reason: string };
}

type OrderEvent = OrderPlaced | PaymentTaken | OrderShipped | OrderCancelled;

// ─── Aggregate ────────────────────────────────────────────────────────────────
type OrderStatus = 'pending' | 'paid' | 'shipped' | 'cancelled';

interface OrderState {
  id: string;
  status: OrderStatus;
  total: number;
  items: Item[];
  trackingId?: string;
  version: number;
}

class Order {
  private state: OrderState;
  private uncommittedEvents: OrderEvent[] = [];

  private constructor(state: OrderState) {
    this.state = state;
  }

  // ─── Rebuild from event history ─────────────────────────────────────────
  static reconstitute(events: OrderEvent[]): Order {
    const initial: OrderState = {
      id: '', status: 'pending', total: 0, items: [], version: 0
    };
    const state = events.reduce(Order.applyEvent, initial);
    return new Order(state);
  }

  // Pure function — applies event to state, returns new state:
  private static applyEvent(state: OrderState, event: OrderEvent): OrderState {
    switch (event.type) {
      case 'OrderPlaced':
        return {
          ...state,
          id: event.aggregateId,
          items: event.payload.items,
          total: event.payload.total,
          status: 'pending',
          version: event.aggregateVersion,
        };
      case 'PaymentTaken':
        return { ...state, status: 'paid', version: event.aggregateVersion };
      case 'OrderShipped':
        return {
          ...state,
          status: 'shipped',
          trackingId: event.payload.trackingId,
          version: event.aggregateVersion,
        };
      case 'OrderCancelled':
        return { ...state, status: 'cancelled', version: event.aggregateVersion };
      default:
        return state;
    }
  }

  // ─── Business logic / commands ───────────────────────────────────────────
  static place(id: string, items: Item[], customerId: string): Order {
    const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);
    const event: OrderPlaced = {
      type: 'OrderPlaced',
      aggregateId: id,
      aggregateVersion: 1,
      occurredAt: new Date(),
      payload: { items, total, customerId },
    };
    const order = new Order({ id, status: 'pending', total, items, version: 0 });
    order.raise(event);
    return order;
  }

  ship(trackingId: string, carrier: string): void {
    if (this.state.status !== 'paid') {
      throw new Error(`Cannot ship order in status: ${this.state.status}`);
    }
    const event: OrderShipped = {
      type: 'OrderShipped',
      aggregateId: this.state.id,
      aggregateVersion: this.state.version + 1,
      occurredAt: new Date(),
      payload: { trackingId, carrier },
    };
    this.raise(event);
  }

  cancel(reason: string): void {
    if (this.state.status === 'shipped') {
      throw new Error('Cannot cancel a shipped order');
    }
    const event: OrderCancelled = {
      type: 'OrderCancelled',
      aggregateId: this.state.id,
      aggregateVersion: this.state.version + 1,
      occurredAt: new Date(),
      payload: { reason },
    };
    this.raise(event);
  }

  private raise(event: OrderEvent): void {
    // Apply to current state immediately:
    this.state = Order.applyEvent(this.state, event);
    this.uncommittedEvents.push(event);
  }

  getState(): Readonly<OrderState> { return this.state; }
  getUncommittedEvents(): OrderEvent[] { return [...this.uncommittedEvents]; }
  clearUncommittedEvents(): void { this.uncommittedEvents = []; }
}

// ─── Event Store (PostgreSQL) ─────────────────────────────────────────────────
class PostgresEventStore {
  constructor(private readonly pool: Pool) {}

  async append(
    aggregateId: string,
    events: DomainEvent[],
    expectedVersion: number  // optimistic concurrency
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Optimistic concurrency check:
      const { rows } = await client.query(
        'SELECT MAX(version) AS max_version FROM events WHERE aggregate_id = $1',
        [aggregateId]
      );
      const currentVersion = rows[0].max_version ?? 0;
      if (currentVersion !== expectedVersion) {
        throw new Error(
          `Concurrency conflict: expected v${expectedVersion}, got v${currentVersion}`
        );
      }

      // Append events:
      for (const event of events) {
        await client.query(
          `INSERT INTO events (aggregate_id, type, version, payload, occurred_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [event.aggregateId, event.type, event.aggregateVersion,
           JSON.stringify(event.payload), event.occurredAt]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getEvents(aggregateId: string, fromVersion = 0): Promise<DomainEvent[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM events WHERE aggregate_id = $1 AND version > $2
       ORDER BY version ASC`,
      [aggregateId, fromVersion]
    );
    return rows.map(r => ({
      type: r.type,
      aggregateId: r.aggregate_id,
      aggregateVersion: r.version,
      occurredAt: r.occurred_at,
      payload: r.payload,
    }));
  }
}

// ─── Command Handler ──────────────────────────────────────────────────────────
class OrderCommandHandler {
  constructor(private readonly eventStore: PostgresEventStore) {}

  async placeOrder(cmd: { orderId: string; items: Item[]; customerId: string }) {
    const order = Order.place(cmd.orderId, cmd.items, cmd.customerId);
    await this.eventStore.append(cmd.orderId, order.getUncommittedEvents(), 0);
    order.clearUncommittedEvents();
    return order.getState();
  }

  async shipOrder(cmd: { orderId: string; trackingId: string; carrier: string }) {
    // Load from event store:
    const events = await this.eventStore.getEvents(cmd.orderId) as OrderEvent[];
    if (!events.length) throw new Error(`Order ${cmd.orderId} not found`);

    const order = Order.reconstitute(events);
    const prevVersion = order.getState().version;

    order.ship(cmd.trackingId, cmd.carrier);

    await this.eventStore.append(
      cmd.orderId,
      order.getUncommittedEvents(),
      prevVersion
    );
    order.clearUncommittedEvents();
    return order.getState();
  }
}
```

---

## CQRS — Command Query Responsibility Segregation

CQRS recognizes that the optimal data model for writing is rarely the same as the optimal model for reading. On the write side you need normalized data, transactional integrity, and rich domain behavior. On the read side you need fast, denormalized views tailored to specific query patterns — joining across five tables at query time is slow, but a pre-built summary table makes it a trivial single-table SELECT. CQRS separates these into two distinct models: commands mutate state and return nothing meaningful except success/failure; queries return data and have no side effects. When combined with Event Sourcing, the write side produces events that drive one or more projections on the read side, each independently optimized for its query pattern. The cost is eventual consistency: the read model may lag milliseconds behind the write side while the projection processes new events.

```
Traditional: one model handles both reads and writes
  Problem: write optimized schema ≠ read optimized schema
  Order table: normalized, good for integrity
  Dashboard query: needs joins across 5 tables, aggregate stats — slow

CQRS: separate the write model from the read model

  Write side (Command):
    Complex domain model (aggregates, business rules)
    Normalized DB, consistent
    Returns: success/failure (not data)

  Read side (Query):
    Denormalized view tables or separate DB
    Optimized for specific query patterns
    Eventually consistent (updated by projections)
    Returns: data (no side effects)

  ┌────────────┐    command     ┌──────────────────┐
  │   Client   │ ─────────────→│  Command Handler  │ → Event Store
  │            │               └──────────────────┘
  │            │                        │ events
  │            │                        ↓
  │            │               ┌──────────────────┐
  │            │               │  Projections      │ → Read DB (denormalized)
  │            │    query      └──────────────────┘
  │            │ ─────────────→ Read Model (fast, simple SELECT)
  └────────────┘
```

---

## Projections — Building Read Models from Events

A projection is an event handler that builds and maintains a read-optimized view by processing the event stream. Each time a new event is appended to the event store, it is dispatched to all registered projections, which update their respective read tables accordingly. The power of projections is that they are fully disposable and rebuildable: if your query requirements change, you modify the projection logic and run the `rebuild()` method to replay all historical events through the new logic. This means you can add new read models retroactively without migrating your canonical data — the events contain everything. The projection shown here maintains a flat `order_summary` table that makes dashboard queries trivial single-table reads rather than expensive multi-table joins.

```typescript
// Projection: maintain a denormalized "order_summary" table
// Updated every time an order event is published

class OrderSummaryProjection {
  constructor(private readonly pool: Pool) {}

  // Called for each new event (event handler):
  async handle(event: OrderEvent): Promise<void> {
    switch (event.type) {
      case 'OrderPlaced':
        await this.pool.query(`
          INSERT INTO order_summary (id, customer_id, total, status, item_count)
          VALUES ($1, $2, $3, 'pending', $4)
        `, [
          event.aggregateId,
          event.payload.customerId,
          event.payload.total,
          event.payload.items.length,
        ]);
        break;

      case 'PaymentTaken':
        await this.pool.query(
          'UPDATE order_summary SET status = $1 WHERE id = $2',
          ['paid', event.aggregateId]
        );
        break;

      case 'OrderShipped':
        await this.pool.query(
          'UPDATE order_summary SET status = $1, tracking_id = $2 WHERE id = $3',
          ['shipped', event.payload.trackingId, event.aggregateId]
        );
        break;

      case 'OrderCancelled':
        await this.pool.query(
          'UPDATE order_summary SET status = $1 WHERE id = $2',
          ['cancelled', event.aggregateId]
        );
        break;
    }
  }

  // Rebuild from scratch (if projection logic changes):
  async rebuild(eventStore: PostgresEventStore): Promise<void> {
    await this.pool.query('TRUNCATE TABLE order_summary');
    const allEvents = await eventStore.getAllEvents(); // fetch all in order
    for (const event of allEvents) {
      await this.handle(event as OrderEvent);
    }
  }
}

// Query side — simple, fast reads:
class OrderQueryService {
  constructor(private readonly pool: Pool) {}

  async getOrderSummaries(customerId: string) {
    const { rows } = await this.pool.query(
      'SELECT * FROM order_summary WHERE customer_id = $1 ORDER BY created_at DESC',
      [customerId]
    );
    return rows;
  }

  async getDashboardStats() {
    const { rows } = await this.pool.query(`
      SELECT
        status,
        COUNT(*) AS count,
        SUM(total) AS revenue
      FROM order_summary
      GROUP BY status
    `);
    return rows;
  }
}
```

---

## Event Sourcing + Kafka for Cross-Service Projections

When projections live inside the same service that owns the event store, they can be updated synchronously in the same process. But in a microservices system, multiple independent services often need to react to the same domain events — inventory needs to reserve stock when an order is placed, the notification service needs to send confirmation emails, and analytics needs to update dashboards. Kafka bridges the gap: after appending events to the local event store (the source of truth), you publish the same events to a Kafka topic keyed by aggregate ID. The key-based partitioning guarantees that all events for a given order arrive at the same Kafka partition in the same order they were produced, which preserves the event sequence that downstream consumers depend on.

```typescript
// Publish events to Kafka after appending to event store:
class OrderCommandHandler {
  constructor(
    private readonly eventStore: PostgresEventStore,
    private readonly producer: KafkaProducer,
  ) {}

  async placeOrder(cmd: PlaceOrderCommand) {
    const order = Order.place(cmd.orderId, cmd.items, cmd.customerId);
    const events = order.getUncommittedEvents();

    // 1. Append to event store (source of truth):
    await this.eventStore.append(cmd.orderId, events, 0);

    // 2. Publish to Kafka (for other services to consume):
    await this.producer.send({
      topic: 'order-events',
      messages: events.map(e => ({
        key: e.aggregateId,        // same key → same partition → ordered
        value: JSON.stringify(e),
      })),
    });

    order.clearUncommittedEvents();
    return order.getState();
  }
}

// Inventory service: listens to order events to reserve stock
// Notification service: listens to send shipping confirmation email
// Analytics service: listens to update dashboard in real time
```

---

## Snapshots — Performance Optimization

Replaying every event from the beginning of time to reconstruct an aggregate's current state is correct but increasingly expensive as aggregates accumulate events over their lifetime. An order that has been through hundreds of status transitions, a bank account with years of transactions, or a document with thousands of edit history entries would require replaying thousands of events on every command. Snapshots address this by periodically persisting the fully computed aggregate state at a given event version. On the next load, the system starts from the snapshot and replays only the events that arrived after it, reducing the replay cost to a small constant. Snapshots do not replace the event log — the log remains the source of truth, and the snapshot is just a cache of a point-in-time state that can be discarded and recreated from events if needed.

```typescript
interface Snapshot {
  aggregateId: string;
  version: number;
  state: unknown;
  createdAt: Date;
}

class SnapshotStore {
  async save(aggregateId: string, state: unknown, version: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO snapshots (aggregate_id, version, state)
       VALUES ($1, $2, $3)
       ON CONFLICT (aggregate_id) DO UPDATE SET version = $2, state = $3`,
      [aggregateId, version, JSON.stringify(state)]
    );
  }

  async load(aggregateId: string): Promise<Snapshot | null> {
    const { rows } = await this.pool.query(
      'SELECT * FROM snapshots WHERE aggregate_id = $1',
      [aggregateId]
    );
    return rows[0] ?? null;
  }
}

// Loading with snapshot optimization:
async function loadOrder(
  id: string,
  eventStore: PostgresEventStore,
  snapshotStore: SnapshotStore
): Promise<Order> {
  const snapshot = await snapshotStore.load(id);
  const fromVersion = snapshot?.version ?? 0;

  // Only replay events AFTER the snapshot:
  const events = await eventStore.getEvents(id, fromVersion) as OrderEvent[];

  if (snapshot) {
    // Restore from snapshot + replay remaining events
    const order = Order.fromSnapshot(snapshot.state as OrderState);
    return order.apply(events);
  }

  return Order.reconstitute(events);
}

// Take a snapshot every N events:
const SNAPSHOT_THRESHOLD = 50;
if (order.getState().version % SNAPSHOT_THRESHOLD === 0) {
  await snapshotStore.save(id, order.getState(), order.getState().version);
}
```

---

## When to Use Event Sourcing + CQRS

Event Sourcing and CQRS are powerful but come with significant complexity costs — more infrastructure, steeper learning curve, eventual consistency to reason about, and the permanent challenge of event versioning. They are not a default architecture choice; they are specialized tools for specific problems. The clearest signal to use them is when audit history is a non-negotiable business requirement (you need to know exactly what happened and when, not just the current state), or when you need multiple independently optimized read models over the same data. The clearest signal to avoid them is when your team is small, the domain is simple CRUD, and you have no cross-service event consumers — in that case the overhead is pure cost with no benefit.

```
USE when:
  ✓ Audit trail is a business requirement (finance, healthcare, e-commerce)
  ✓ Need to rebuild past state ("what was the order status last Tuesday?")
  ✓ Multiple different read models from the same data
  ✓ Event-driven architecture with multiple downstream consumers
  ✓ Temporal queries ("show me all changes in the last hour")
  ✓ Conflict resolution in distributed systems

DON'T USE when:
  ✗ Simple CRUD with no audit requirements
  ✗ Team unfamiliar with the pattern (steep learning curve)
  ✗ Small application — massive over-engineering
  ✗ Queries need to JOIN events from multiple aggregates (hard to query)

Complexity costs:
  - Eventual consistency: read model may lag behind writes
  - Projection rebuilds: schema changes require full event replay
  - Event versioning: events are immutable, how to change their schema?
  - No easy UPDATE/DELETE: everything is append-only
```

---

## Event Versioning — Handling Schema Changes

Events are immutable and eternal — once appended to the store, they must never be modified because the entire system's history is built on them. Yet business requirements evolve and the shape of an event that was perfectly adequate at launch may be inadequate a year later. This creates a tension: the code needs to move forward but the old events cannot. The recommended approach is upcasting: instead of touching the stored events, you add a transformation layer that converts old event schemas to the current schema on read. The aggregate and projections always see the latest event shape; the upcaster handles backward compatibility transparently. For breaking changes too large for upcasting, versioned event types (`OrderPlacedV2`) can coexist with older versions in the aggregate's switch handler.

```typescript
// Problem: event schema changes over time.
// Events are immutable — you can't change old events.
// Solution: upcasting (transform old format to new format on read)

type OrderPlacedV1 = {
  version: 1;
  items: string[];  // old format — just item IDs
};

type OrderPlacedV2 = {
  version: 2;
  items: { id: string; name: string; price: number; qty: number }[];  // new format
};

type OrderPlacedEvent = OrderPlacedV1 | OrderPlacedV2;

function upcast(event: OrderPlacedEvent): OrderPlacedV2 {
  if (event.version === 1) {
    // Transform old format to new:
    return {
      version: 2,
      items: event.items.map(id => ({
        id,
        name: 'Unknown',  // best effort — historical data may be incomplete
        price: 0,
        qty: 1,
      })),
    };
  }
  return event;
}
```

---

## Common Interview Questions

**Q: What is the difference between Event Sourcing and just keeping an audit log?**
An audit log is secondary — the source of truth is still the current state in your DB. Event Sourcing makes the event log the ONLY source of truth — current state is derived by replaying events. With Event Sourcing, you can rebuild your entire system from the event log. With an audit log, you can't (the current state table is authoritative).

**Q: What is CQRS and why use it?**
Separating the write model (commands, complex domain logic) from the read model (queries, denormalized views). Allows each side to be independently optimized and scaled. Read models can be rebuilt from events if query patterns change. Tradeoff: eventual consistency between write and read sides.

**Q: How do you handle eventual consistency in CQRS?**
Accept it: most reads are acceptable slightly stale. Return the command's result immediately (201 Created) and let the projection update asynchronously. For cases that need strong consistency, read from the write store directly, or use a "wait for event" pattern (poll/subscribe until projection catches up).

**Q: What is an optimistic concurrency check?**
Before appending events, verify the aggregate's current version matches what you expect. If another process wrote in between, the version won't match → throw a conflict error → caller retries with fresh state. This prevents two concurrent modifications from conflicting silently (last-write-wins). Same principle as HTTP ETags.

**Q: How do you change an event schema?**
Events are immutable. Options: (1) Upcasting — transform old events to new format when reading (best for minor changes), (2) Versioned events — `OrderPlacedV2` coexists with `OrderPlacedV1`, aggregate handles both, (3) Event migration — write a script to copy old events as new events (only for major overhauls).
