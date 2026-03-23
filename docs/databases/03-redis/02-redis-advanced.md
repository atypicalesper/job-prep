# Redis Advanced — Streams, Pub/Sub, Distributed Locks

## 1. Redis Pub/Sub

### How it works
Publisher sends to a channel; all current subscribers receive it. Messages are **not persisted** — if subscriber is offline, the message is lost.

```js
// subscriber.js
const { createClient } = require('redis');

const sub = createClient();
await sub.connect();

await sub.subscribe('orders', (message, channel) => {
  console.log(`[${channel}] ${message}`);
  // [orders] {"id":"abc","amount":99}
});

// publisher.js
const pub = createClient();
await pub.connect();

await pub.publish('orders', JSON.stringify({ id: 'abc', amount: 99 }));
```

### Pattern subscriptions
```js
// subscribe to all channels matching pattern
await sub.pSubscribe('orders.*', (message, channel) => {
  // fires for orders.created, orders.cancelled, etc.
});
```

### Pub/Sub limitations
| Limitation | Effect |
|---|---|
| No persistence | Offline subscriber misses all messages |
| No consumer groups | Every subscriber gets every message (fan-out only) |
| No acknowledgement | Fire-and-forget — no delivery guarantee |
| Memory pressure | If a slow subscriber can't keep up, it gets disconnected |

**When to use Pub/Sub:** Real-time notifications, cache invalidation broadcast, live dashboards. For reliable messaging, use Streams.

---

## 2. Redis Streams

Streams are an append-only log, similar to Kafka topics but inside Redis. Messages persist and consumer groups track what's been processed.

### Basic stream operations

```js
const client = createClient();
await client.connect();

// XADD — append to stream, auto-generate ID
const id = await client.xAdd('events', '*', {
  type: 'user.signup',
  userId: '42',
  email: 'alice@example.com',
});
// returns '1699000000000-0' (timestamp-sequence)

// XLEN — count entries
const len = await client.xLen('events');

// XRANGE — read a slice
const entries = await client.xRange('events', '-', '+');
// '-' = min ID, '+' = max ID
// returns [{ id: '...', message: { type, userId, email } }, ...]

// XREVRANGE — newest first
const recent = await client.xRevRange('events', '+', '-', { COUNT: 10 });
```

### Consumer groups — reliable processing

```
┌─────────────────────────────────────────────┐
│  Stream: events                             │
│  ───────────────────────────────────────── │
│  1699-1  user.signup  alice@example.com     │
│  1699-2  user.signup  bob@example.com       │
│  1699-3  order.paid   orderId=99            │
└─────────────────────────────────────────────┘
         │            │
   Consumer A    Consumer B     (same group)
   gets 1699-1   gets 1699-2    (load balanced)
```

```js
// Create group (start from newest: '$', or from beginning: '0')
try {
  await client.xGroupCreate('events', 'email-service', '$', { MKSTREAM: true });
} catch (e) {
  if (!e.message.includes('BUSYGROUP')) throw e; // group exists, fine
}

// Consumer reads pending messages
async function consume(consumerId) {
  while (true) {
    const results = await client.xReadGroup(
      'email-service',   // group
      consumerId,        // consumer name
      [{ key: 'events', id: '>' }], // '>' = only undelivered messages
      { COUNT: 10, BLOCK: 2000 }     // block up to 2s waiting for messages
    );

    if (!results) continue; // timeout, loop again

    for (const { name: stream, messages } of results) {
      for (const { id, message } of messages) {
        try {
          await processEvent(message);
          // ACK after successful processing
          await client.xAck('events', 'email-service', id);
        } catch (err) {
          console.error('Failed, will retry:', id, err);
          // NOT ACKing — message stays in PEL (Pending Entry List)
        }
      }
    }
  }
}

// Run two consumers in parallel
consume('consumer-1');
consume('consumer-2');
```

### Claim stale messages (dead consumer recovery)

```js
// Find messages pending >30s (consumer may have crashed)
const stale = await client.xAutoClaim(
  'events',
  'email-service',
  'recovery-consumer',
  30_000, // min-idle-time in ms
  '0-0'   // start from beginning of PEL
);
// stale.messages = messages now owned by recovery-consumer
```

### Stream trimming

```js
// Keep only latest 10,000 entries (approximate, ~= is faster)
await client.xAdd('events', '*', data, { TRIM: { strategy: 'MAXLEN', threshold: 10_000, trimType: '~' } });

// Or trim explicitly
await client.xTrim('events', 'MAXLEN', '~', 10_000);
```

---

## 3. Distributed Locks (SETNX / Redlock)

### The problem
Multiple Node.js processes competing for a shared resource (e.g., sending a scheduled email exactly once).

### Simple lock: SET NX PX

```js
const LOCK_KEY = 'lock:cron:daily-report';
const LOCK_TTL = 30_000; // 30 seconds
const OWNER_ID = crypto.randomUUID(); // unique per process

async function acquireLock() {
  // SET key value NX PX ttl — atomic: only sets if key does NOT exist
  const result = await client.set(LOCK_KEY, OWNER_ID, {
    NX: true,   // only set if Not eXists
    PX: LOCK_TTL, // expire after 30s (safety valve if process crashes)
  });
  return result === 'OK'; // null if lock already held
}

async function releaseLock() {
  // MUST only release YOUR lock — use Lua script for atomicity
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  await client.eval(script, { keys: [LOCK_KEY], arguments: [OWNER_ID] });
}

// Usage
if (await acquireLock()) {
  try {
    await runDailyReport();
  } finally {
    await releaseLock();
  }
} else {
  console.log('Another process holds the lock, skipping');
}
```

**Why the Lua script?** Without it, between `GET` and `DEL` another process could acquire the lock. Lua scripts run atomically in Redis.

### Redlock algorithm (multi-node)

For high availability (Redis cluster), the simple approach fails if the Redis node dies after acquiring but before releasing. Redlock acquires the lock on **N independent Redis nodes** (typically 5).

```js
// npm install redlock
const Redlock = require('redlock');
const { createClient } = require('redis');

const clients = [
  createClient({ url: 'redis://node1:6379' }),
  createClient({ url: 'redis://node2:6379' }),
  createClient({ url: 'redis://node3:6379' }),
];
await Promise.all(clients.map(c => c.connect()));

const redlock = new Redlock(clients, {
  retryCount: 3,
  retryDelay: 200,
  retryJitter: 100,
});

const lock = await redlock.acquire(['lock:payment:txn-99'], 5000);
try {
  await processPayment('txn-99');
} finally {
  await lock.release();
}
```

Redlock succeeds only if it acquires lock on ≥ (N/2 + 1) nodes. If a node fails, the other nodes' TTLs expire naturally.

---

## 4. Redis Data Structures for Common Patterns

### Rate limiting with sorted sets

```js
async function isRateLimited(userId, limit = 100, windowMs = 60_000) {
  const key = `ratelimit:${userId}`;
  const now = Date.now();
  const windowStart = now - windowMs;

  const pipeline = client.multi();
  pipeline.zRemRangeByScore(key, 0, windowStart);        // remove old entries
  pipeline.zAdd(key, [{ score: now, value: `${now}` }]); // add current request
  pipeline.zCard(key);                                    // count in window
  pipeline.expire(key, Math.ceil(windowMs / 1000));      // auto-cleanup

  const results = await pipeline.exec();
  const count = results[2]; // zCard result
  return count > limit;
}
```

### Session store with hash

```js
// Store session fields
await client.hSet(`session:${sessionId}`, {
  userId: '42',
  role: 'admin',
  createdAt: Date.now().toString(),
});
await client.expire(`session:${sessionId}`, 3600);

// Read specific field
const role = await client.hGet(`session:${sessionId}`, 'role');

// Read all fields
const session = await client.hGetAll(`session:${sessionId}`);
// { userId: '42', role: 'admin', createdAt: '...' }
```

### Leaderboard with sorted set

```js
// Add/update score
await client.zAdd('leaderboard', [{ score: 1500, value: 'alice' }]);

// Top 10
const top10 = await client.zRangeWithScores('leaderboard', 0, 9, { REV: true });
// [{ value: 'alice', score: 1500 }, ...]

// User's rank (0-indexed)
const rank = await client.zRevRank('leaderboard', 'alice');
```

---

## 5. Tricky Interview Questions

**Q: What's the difference between Redis Pub/Sub and Streams?**

| | Pub/Sub | Streams |
|---|---|---|
| Persistence | No | Yes (log on disk) |
| Replay | No | Yes (read from any offset) |
| Consumer groups | No | Yes |
| Fan-out | Yes (all subscribers) | Yes (different groups) |
| Backpressure | None | `BLOCK` + `COUNT` |
| At-least-once delivery | No | Yes (ACK mechanism) |

Use Pub/Sub for ephemeral broadcasts; Streams for reliable event processing.

---

**Q: Why must you use a Lua script to release a lock?**

Without Lua:
```
Process A: GET lock → "owner-A" ✓
           [context switch — lock expires — Process B acquires it]
Process A: DEL lock → deletes B's lock! BUG
```
Lua runs as a single atomic command, so no context switch is possible between GET and DEL.

---

**Q: What happens if a consumer in a consumer group crashes without ACKing?**

The message stays in the **PEL (Pending Entry List)**. Another consumer can claim it via `XAUTOCLAIM` or `XCLAIM` after a timeout. This is how Redis Streams provides at-least-once delivery semantics.

---

**Q: Is Redis Streams a replacement for Kafka?**

Not quite. Redis Streams is excellent for moderate throughput inside your existing Redis infrastructure. Kafka wins for:
- Very high throughput (millions of events/sec)
- Long-term event retention (days/weeks)
- Cross-datacenter replication
- Ecosystem (Kafka Connect, ksqlDB)

For most Node.js microservices, Redis Streams is simpler and fast enough.
