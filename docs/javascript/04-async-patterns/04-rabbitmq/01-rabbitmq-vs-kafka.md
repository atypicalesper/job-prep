# RabbitMQ vs Kafka — When to Use Which

## Mental Model

```
RabbitMQ — Smart broker, dumb consumer
  Broker routes, filters, transforms messages
  Consumer just receives what broker sends
  Message deleted after ACK

Kafka — Dumb broker, smart consumer
  Broker just stores an ordered log
  Consumer tracks its own position (offset)
  Message retained for configurable period
```

---

## RabbitMQ Architecture

RabbitMQ's routing model is built around three concepts: exchanges receive messages from producers, queues hold messages for consumers, and bindings define the rules for routing messages from an exchange to a queue. Producers never send directly to a queue — they always publish to an exchange and let the exchange decide where the message goes. This separation is what gives RabbitMQ its flexible routing capabilities. Exchanges come in four types, each implementing a different routing algorithm: `direct` (exact key match), `topic` (wildcard pattern match), `fanout` (broadcast), and `headers` (match on message headers).

```
Producer → Exchange → [Binding] → Queue → Consumer
               │
               ├── direct: route by routing key
               ├── topic:  route by pattern (logs.*.error)
               ├── fanout: broadcast to all bound queues
               └── headers: route by message headers
```

### Exchange types

```js
const amqplib = require('amqplib');
const conn = await amqplib.connect('amqp://localhost');
const ch = await conn.createChannel();

// Direct exchange — exact routing key match
await ch.assertExchange('orders', 'direct', { durable: true });
await ch.assertQueue('orders.paid', { durable: true });
await ch.bindQueue('orders.paid', 'orders', 'paid');
await ch.bindQueue('orders.refunded', 'orders', 'refunded');

ch.publish('orders', 'paid', Buffer.from(JSON.stringify({ orderId: '123' })));
// → goes to orders.paid queue only

// Topic exchange — pattern matching
await ch.assertExchange('logs', 'topic', { durable: true });
await ch.bindQueue('error-alerts', 'logs', '*.error'); // any service, error level
await ch.bindQueue('all-logs', 'logs', '#');           // everything

ch.publish('logs', 'payments.error', Buffer.from('payment failed'));
// → goes to both error-alerts and all-logs

// Fanout — broadcast
await ch.assertExchange('cache-invalidate', 'fanout', { durable: false });
ch.publish('cache-invalidate', '', Buffer.from(JSON.stringify({ key: 'user:42' })));
// → goes to every bound queue (all service instances receive it)
```

### Consumer with manual ACK

RabbitMQ delivers messages to consumers via push — the broker sends messages as fast as the `prefetch` limit allows. Manual acknowledgement (`ch.ack(msg)`) tells the broker the message was successfully processed and can be permanently deleted. `ch.nack(msg)` signals failure; with `requeue: false` the broker routes the message to the Dead Letter Exchange (if configured) rather than requeueing it for redelivery. `prefetch(N)` is a critical flow-control setting: it limits unacknowledged messages to N, preventing a fast producer from overwhelming a slow consumer.

```js
await ch.assertQueue('orders.paid', { durable: true });
ch.prefetch(10); // max 10 unacked messages at once (flow control)

ch.consume('orders.paid', async (msg) => {
  if (!msg) return;
  try {
    await processOrder(JSON.parse(msg.content.toString()));
    ch.ack(msg); // tell broker to delete this message
  } catch (err) {
    // nack: requeue=false sends to Dead Letter Exchange
    ch.nack(msg, false, false);
  }
});
```

### Dead Letter Exchange (DLX)

A Dead Letter Exchange is a regular exchange that receives messages when they are rejected (`nack` with `requeue: false`), expire (message TTL exceeded), or overflow a queue. By configuring `x-dead-letter-exchange` on a queue you create a safety net: failed messages are not silently dropped but routed to a predictable location for inspection and reprocessing. The `x-death` header automatically appended to dead-lettered messages records the full history of why and how many times the message was rejected, which is invaluable for debugging.

```js
// Queue that sends failed messages to a DLX
await ch.assertQueue('orders.paid', {
  durable: true,
  arguments: {
    'x-dead-letter-exchange': 'dlx',
    'x-dead-letter-routing-key': 'orders.paid.dead',
    'x-message-ttl': 30_000, // also DLX after 30s (if not consumed)
  },
});

await ch.assertExchange('dlx', 'direct', { durable: true });
await ch.assertQueue('orders.paid.dead', { durable: true });
await ch.bindQueue('orders.paid.dead', 'dlx', 'orders.paid.dead');

// Now inspect dead-lettered messages for debugging
ch.consume('orders.paid.dead', (msg) => {
  console.log('Dead letter:', msg.properties.headers['x-death']);
});
```

---

## Kafka Architecture

Kafka's architecture is fundamentally different from RabbitMQ's: instead of a smart routing broker, Kafka is a distributed, ordered log. A topic is divided into partitions, and each partition is an immutable, append-only sequence of messages. Consumers maintain their own offset (position) in each partition and pull messages at their own pace — the broker does not track per-consumer state beyond the committed offset. This design enables multiple completely independent consumer groups to read the same messages (fan-out) and allows any group to replay from an earlier offset at any time, neither of which is possible with a traditional message queue.

```
Topic: orders
  Partition 0: [msg0] [msg1] [msg5] [msg8]  ← offset 0,1,2,3
  Partition 1: [msg2] [msg3] [msg6]          ← offset 0,1,2
  Partition 2: [msg4] [msg7] [msg9]          ← offset 0,1,2

Consumer Group A (orders-service):
  Consumer 1 → Partition 0
  Consumer 2 → Partition 1 + 2

Consumer Group B (analytics):
  Consumer 1 → all partitions (independent of Group A)
```

```js
const { Kafka } = require('kafkajs');
const kafka = new Kafka({ brokers: ['localhost:9092'] });

// Producer
const producer = kafka.producer();
await producer.connect();
await producer.send({
  topic: 'orders',
  messages: [
    { key: 'user-42', value: JSON.stringify({ orderId: '123', amount: 99 }) },
    // key determines partition — same user → same partition → ordering guaranteed
  ],
});

// Consumer
const consumer = kafka.consumer({ groupId: 'orders-service' });
await consumer.connect();
await consumer.subscribe({ topic: 'orders', fromBeginning: false });

await consumer.run({
  eachMessage: async ({ topic, partition, message, heartbeat }) => {
    const order = JSON.parse(message.value.toString());
    await processOrder(order);
    // Kafka auto-commits offset (or manual with commitOffsets)
    await heartbeat(); // prevent rebalance on slow processing
  },
});
```

---

## Head-to-Head Comparison

| Aspect | RabbitMQ | Kafka |
|---|---|---|
| **Model** | Message queue (push) | Distributed log (pull) |
| **Message retention** | Deleted after ACK | Retained (days/weeks/forever) |
| **Ordering** | Per-queue | Per-partition |
| **Throughput** | 20k–50k msg/s | 1M+ msg/s |
| **Replay** | No (deleted) | Yes (from any offset) |
| **Consumer groups** | Competing consumers | Independent offsets per group |
| **Routing** | Flexible (exchange types) | None (consumers subscribe to topics) |
| **Protocol** | AMQP (also MQTT, STOMP) | Kafka binary protocol |
| **Horizontal scale** | Limited (mirrored queues) | Native (partitions) |
| **Use case** | Task queues, RPC, routing | Event streaming, audit log, analytics |

---

## When to Use RabbitMQ

1. **Task queues** — distribute work items to workers (image resizing, email sending)
2. **Request/reply (RPC)** — synchronous-like async patterns with reply-to queues
3. **Complex routing** — route by message type, content, or pattern without app-level logic
4. **Priority queues** — `x-max-priority` argument on queues
5. **Short-lived messages** — you don't need replay; message is done after processing

```js
// RPC pattern with reply-to
const replyQueue = await ch.assertQueue('', { exclusive: true });
const correlationId = crypto.randomUUID();

// Send request
ch.sendToQueue('rpc-server', Buffer.from(JSON.stringify({ n: 30 })), {
  correlationId,
  replyTo: replyQueue.queue,
});

// Wait for response
const result = await new Promise((resolve) => {
  ch.consume(replyQueue.queue, (msg) => {
    if (msg.properties.correlationId === correlationId) {
      resolve(JSON.parse(msg.content.toString()));
    }
  });
});
```

## When to Use Kafka

1. **Event sourcing / audit log** — need history of all events
2. **Multiple independent consumers** — analytics team reads same events as the app
3. **High throughput** — millions of events per second
4. **Stream processing** — Kafka Streams / ksqlDB for real-time aggregations
5. **Cross-datacenter replication** — MirrorMaker
6. **Decoupled microservices** — event-driven architecture at scale

---

## Reliability Patterns

### RabbitMQ — Publisher confirms

By default, `ch.publish()` is fire-and-forget — the broker may or may not have persisted the message when the call returns. Publisher confirms (`confirmSelect`) switches the channel to confirm mode: the broker sends an acknowledgement once it has written the message to disk. This is the RabbitMQ equivalent of Kafka's `acks=-1` and is required for durable, loss-safe publishing in production.

```js
await ch.confirmSelect();
await ch.publish('exchange', 'key', Buffer.from(data));
await new Promise((resolve, reject) => ch.waitForConfirms((err) => err ? reject(err) : resolve()));
// waits until broker has persisted the message
```

### Kafka — Idempotent producer

An idempotent Kafka producer assigns a sequence number to each message batch. If the broker receives a duplicate (from a retry after a lost ack), it recognizes the sequence number and discards the duplicate rather than appending it twice. This provides exactly-once delivery guarantees within a single producer session without requiring transactions. Setting `acks: -1` alongside idempotency ensures all in-sync replicas have persisted the message before the producer considers the send successful.

```js
const producer = kafka.producer({
  idempotent: true,        // exactly-once producer semantics
  maxInFlightRequests: 5,
  acks: -1,                // all replicas must ack
});
```

---

## Interview Q&A

**Q: Can Kafka replace RabbitMQ?**

For task queues with complex routing — no. RabbitMQ's exchange/binding model is more flexible for routing. For event streaming, high throughput, or message replay — Kafka wins. Many systems use both: Kafka for the event backbone, RabbitMQ for internal task dispatch.

---

**Q: What is a Kafka consumer group rebalance?**

When a consumer joins or leaves a group, Kafka reassigns partitions among the remaining consumers. During rebalance, consumption pauses. Long rebalances happen with many consumers or slow `poll()` calls. Mitigate with: incremental cooperative rebalancing (KIP-429), proper `max.poll.interval.ms` config, and calling `heartbeat()` during long processing.

---

**Q: How does RabbitMQ ensure a message is processed exactly once?**

It can't, natively — it guarantees at-least-once delivery. For exactly-once, you need idempotent consumers: store processed message IDs in a database and check before processing.

---

**Q: What is a partition key in Kafka and why does it matter?**

The partition key determines which partition a message goes to (via `hash(key) % numPartitions`). Messages with the same key always go to the same partition, guaranteeing ordering for that key. Without a key, messages are round-robined across partitions — no ordering guarantee.
