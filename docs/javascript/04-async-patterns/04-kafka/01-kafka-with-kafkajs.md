# Kafka with KafkaJS — Producer, Consumer, Consumer Groups

---

## Core Concepts

```
Topic:          Named stream of records. Like a table in a database but append-only.
Partition:      A topic is split into N partitions for parallelism.
                Messages with the same key always go to the same partition → ordering guarantee per key.
Offset:         Each message in a partition has a sequential offset number.
                Consumers track their position via offsets.
Consumer Group: Multiple consumers sharing work. Each partition is consumed by ONE consumer in the group.
                Scale consumers = scale partitions.
Broker:         A Kafka server. A cluster has multiple brokers for fault tolerance.
Replication:    Each partition has 1 leader + N-1 replicas. Leader handles reads/writes.
```

---

## Producer

A Kafka producer is responsible for writing records to topics. The key configuration decisions are durability (the `acks` setting controls how many replicas must confirm receipt before the send is considered successful) and idempotency (enabling the idempotent producer prevents a retry from creating a duplicate message if the broker received the original but the ack was lost). Producers are long-lived objects — connecting and disconnecting on every request is expensive; create one per service and reuse it for the lifetime of the process.

```typescript
import { Kafka, CompressionTypes, Partitioners } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'order-service',
  brokers: ['kafka1:9092', 'kafka2:9092'],
  // For production — SSL + SASL auth:
  // ssl: true,
  // sasl: { mechanism: 'plain', username: '...', password: '...' },
  retry: {
    initialRetryTime: 100,
    retries: 8,           // retry up to 8 times with exponential backoff
  },
});

const producer = kafka.producer({
  // Idempotent producer: exactly-once within a single producer session
  // (prevents duplicates from retries):
  idempotent: true,

  // transactional.id: required for cross-partition transactions
  // transactionalId: 'order-producer-1',
});

await producer.connect();

// Send a single message:
await producer.send({
  topic: 'orders',
  messages: [
    {
      key: order.customerId,   // same key → same partition → ordering guarantee
      value: JSON.stringify(order),
      headers: {
        'event-type': 'order.created',
        'trace-id': ctx.traceId,
      },
      // timestamp: Date.now().toString(), // defaults to broker time
    },
  ],
  compression: CompressionTypes.GZIP,
  acks: -1,  // -1 = all replicas ack (strongest durability), 0 = fire and forget, 1 = leader only
});

// Send a batch (more efficient):
await producer.sendBatch({
  topicMessages: [
    {
      topic: 'orders',
      messages: orders.map(o => ({
        key: o.customerId,
        value: JSON.stringify(o),
      })),
    },
    {
      topic: 'analytics',
      messages: orders.map(o => ({
        value: JSON.stringify({ event: 'order_created', orderId: o.id }),
      })),
    },
  ],
});

await producer.disconnect();
```

---

## Consumer and Consumer Groups

A consumer subscribes to one or more topics and processes messages. Consumers within the same `groupId` form a consumer group: Kafka distributes partitions among them so each partition is processed by exactly one consumer at a time, providing horizontal scaling bounded by partition count. Offset management is the core correctness concern: KafkaJS auto-commits the offset after `eachMessage` resolves, meaning a crash before the callback completes will re-deliver the message — this is the source of at-least-once semantics and why your processing logic should be idempotent.

```typescript
const consumer = kafka.consumer({
  groupId: 'payment-service',  // all instances with same groupId share partitions
  // Each partition → one consumer in the group at a time
  // 6 partitions, 3 consumers → 2 partitions per consumer

  sessionTimeout: 30_000,    // if no heartbeat for 30s, consumer assumed dead
  heartbeatInterval: 3_000,  // send heartbeat every 3s
  maxBytesPerPartition: 1_048_576, // 1MB per partition per fetch
});

await consumer.connect();
await consumer.subscribe({
  topics: ['orders'],
  fromBeginning: false,  // start from latest offset (not re-process old messages)
});

await consumer.run({
  eachMessage: async ({ topic, partition, message }) => {
    const order = JSON.parse(message.value!.toString());
    const traceId = message.headers?.['trace-id']?.toString();

    console.log(`Processing order ${order.id} from partition ${partition}, offset ${message.offset}`);

    try {
      await processOrder(order);
      // Offset committed automatically after eachMessage resolves
    } catch (err) {
      // If eachMessage throws, the consumer retries the message (from the uncommitted offset)
      // → guaranteed at-least-once delivery
      console.error('Failed to process order:', err);
      throw err; // rethrow to trigger retry
    }
  },

  // For manual offset management (advanced):
  // eachBatch: async ({ batch, resolveOffset, heartbeat, commitOffsetsIfNecessary }) => {
  //   for (const message of batch.messages) {
  //     await processMessage(message);
  //     resolveOffset(message.offset); // mark this offset as processed
  //     await heartbeat(); // prevent session timeout during long batches
  //   }
  // },
});
```

---

## Exactly-Once Processing Pattern

Kafka's at-least-once default means a message can be delivered multiple times if the consumer crashes after processing but before committing its offset. Two strategies achieve effectively-once semantics. The practical approach is idempotent consumers: store a deduplication key (topic + partition + offset) in the same database transaction as the business operation — if the message arrives again, the duplicate check prevents double-processing. The pure Kafka approach uses transactions to atomically commit both the output message and the input offset within a single Kafka transaction, but this only works when the output is also Kafka and cannot protect external systems.

```typescript
// Kafka guarantees at-least-once by default.
// For exactly-once, make your consumer idempotent:

// Option 1: Idempotency key in database (most practical):
async function processOrderIdempotent(order: Order, offset: string) {
  await db.transaction(async (tx) => {
    // Check if already processed (idempotency key = topic:partition:offset):
    const existing = await tx.query(
      'SELECT id FROM processed_messages WHERE message_id = $1',
      [`orders:${offset}`]
    );
    if (existing.rows.length > 0) {
      console.log(`Skipping duplicate message at offset ${offset}`);
      return;
    }

    // Process:
    await tx.query('INSERT INTO orders ...', [order.id, order.total]);

    // Mark as processed:
    await tx.query(
      'INSERT INTO processed_messages (message_id, processed_at) VALUES ($1, NOW())',
      [`orders:${offset}`]
    );
  });
}

// Option 2: Kafka Transactions (exactly-once end-to-end, same Kafka cluster):
const producer = kafka.producer({ transactionalId: 'order-processor-1', idempotent: true });

consumer.run({
  eachBatch: async ({ batch, resolveOffset, isRunning }) => {
    const transaction = await producer.transaction();
    try {
      for (const message of batch.messages) {
        if (!isRunning()) break;

        const result = processMessage(message);
        await transaction.send({ topic: 'processed-orders', messages: [result] });
        resolveOffset(message.offset);
      }

      // Commit consumer offset inside the transaction:
      await transaction.sendOffsets({
        consumerGroupId: 'payment-service',
        topics: [{ topic: batch.topic, partitions: [{ partition: batch.partition, offset: batch.lastOffset() }] }],
      });

      await transaction.commit();
    } catch (err) {
      await transaction.abort();
      throw err;
    }
  },
});
```

---

## Consumer Group Rebalancing

A rebalance is triggered whenever the membership of a consumer group changes — a consumer starts, stops, crashes, or fails to send a heartbeat within the session timeout. During a classic (eager) rebalance, all consumers in the group stop consuming, give up their partitions, and wait for the group coordinator to redistribute assignments. This creates a pause in processing that scales with group size. Minimizing rebalance frequency is a key operational concern: keep session timeouts appropriate, call `heartbeat()` during long message processing to prevent false-positive session timeouts, and consider cooperative rebalancing (incremental, only moves the partitions that need to move).

```typescript
// Rebalancing: when a consumer joins/leaves the group,
// partitions are redistributed. During rebalance: all consumers pause.

const consumer = kafka.consumer({ groupId: 'payment-service' });

// Handle rebalance events:
consumer.on('consumer.group_join', ({ payload }) => {
  console.log(`Joined group, assigned partitions:`, payload.memberAssignment);
});

consumer.on('consumer.stop', () => {
  console.log('Consumer stopped — likely rebalancing');
});

// During rebalance, in-flight messages may be re-delivered.
// Ensure your processing is idempotent!

// Cooperative rebalancing (KafkaJS 2.x) — incremental, less disruption:
const consumer = kafka.consumer({
  groupId: 'payment-service',
  partitionAssigners: [PartitionAssigners.roundRobin],
  // With cooperative sticky: only moved partitions are revoked, not all
});
```

---

## Manual Offset Management (Pause/Resume)

By default KafkaJS advances the offset automatically when `eachMessage` resolves. Manual offset management is needed when you want finer-grained control: pausing a partition when a downstream service is slow (backpressure), seeking to replay messages from a specific offset for recovery or reprocessing, or committing offsets only after a batch of messages has been durably written to an external store. Pausing a partition stops fetching from it while leaving other partitions running — essential for handling slow consumers without causing a session timeout across the entire group.

```typescript
// Pause a partition when downstream is slow (backpressure):
consumer.run({
  eachMessage: async ({ topic, partition, message, pause }) => {
    const resume = pause(); // pause this partition

    try {
      await slowDownstreamService(message.value);
      resume(); // resume when ready
    } catch (err) {
      // Don't resume → consumer paused indefinitely (manual intervention needed)
      // Or: resume after a delay
      setTimeout(resume, 5_000);
      throw err;
    }
  },
});

// Seek to a specific offset (replay messages):
await consumer.seek({
  topic: 'orders',
  partition: 0,
  offset: '100', // replay from offset 100
});
```

---

## Dead Letter Queue Pattern

A Dead Letter Queue (DLQ) is a separate Kafka topic where messages are sent after exhausting all retry attempts. Without a DLQ, a persistently failing message either blocks the partition indefinitely (if you keep retrying) or is silently dropped (if you skip it) — both outcomes are unacceptable in production. The DLQ preserves the original message with attached metadata (original topic, partition, offset, error, timestamp), enabling manual inspection, root-cause analysis, and selective reprocessing once the bug is fixed. The retry-count in the message header drives the retry loop; once the limit is reached the message is diverted rather than retried again.

```typescript
// Messages that fail processing go to a DLQ for investigation:
const DLQ_TOPIC = 'orders.dlq';

consumer.run({
  eachMessage: async ({ topic, partition, message }) => {
    let attempts = parseInt(message.headers?.['retry-count']?.toString() ?? '0');

    try {
      await processOrder(JSON.parse(message.value!.toString()));
    } catch (err) {
      attempts++;

      if (attempts >= 3) {
        // Send to DLQ:
        await producer.send({
          topic: DLQ_TOPIC,
          messages: [{
            key: message.key,
            value: message.value,
            headers: {
              ...message.headers,
              'original-topic': topic,
              'original-partition': String(partition),
              'original-offset': message.offset,
              'error': (err as Error).message,
              'failed-at': new Date().toISOString(),
            },
          }],
        });
        console.warn(`Message sent to DLQ after ${attempts} attempts`);
      } else {
        // Re-publish with incremented retry count and delay:
        await producer.send({
          topic,
          messages: [{
            ...message,
            headers: { ...message.headers, 'retry-count': String(attempts) },
          }],
        });
      }
    }
  },
});
```

---

## Interview Questions

**Q: What delivery guarantees does Kafka provide?**
A: By default: at-least-once. Producer sets `acks=-1` (all replicas ack) + enables idempotent producer (`idempotent: true`) to prevent duplicates within a session. Consumer commits offsets only after processing — if consumer crashes before committing, it re-processes from last committed offset. For exactly-once across read-process-write within Kafka: use transactions (`transactionalId` + `sendOffsets`). For exactly-once to external systems: idempotent consumers (deduplication key in DB).

**Q: What happens during a consumer group rebalance?**
A: When a consumer joins, leaves, or crashes, Kafka triggers rebalance: all consumers in the group pause consuming, the group leader redistributes partition assignments, consumers resume from their committed offsets. Messages between last commit and crash may be re-delivered (at-least-once). Cooperative rebalancing (incremental) reduces this: only partitions being moved are revoked, not all. Minimize rebalance frequency by tuning `sessionTimeout` and ensuring consumers send heartbeats.

**Q: How do you scale Kafka consumers?**
A: Parallelism is bounded by partition count — you can't have more active consumers than partitions. To scale to N consumers: ensure topic has at least N partitions. All consumers with the same `groupId` share partitions (each partition → one consumer). Multiple groups can consume the same topic independently (e.g., payment-service and analytics-service both subscribe to `orders`). To scale beyond partition count: process messages concurrently within a consumer (batch processing + worker pool).

**Q: What is the difference between Kafka and a traditional message queue (RabbitMQ)?**
A: Kafka: log-based — messages are retained for a configured period (days/weeks), not deleted on consume. Multiple consumer groups can replay independently. Ordered within partition. Pull-based consumers. Designed for high throughput (millions/sec). RabbitMQ: queue-based — message deleted when acked. Push-based. More complex routing (exchanges, bindings). Better for task queues, RPC patterns, complex routing. Use Kafka for: event streaming, audit logs, fan-out to multiple services. Use RabbitMQ for: task distribution, complex routing, when you need message TTL/priority.
