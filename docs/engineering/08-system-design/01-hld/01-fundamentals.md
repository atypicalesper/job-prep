# System Design Fundamentals (HLD)

---

## How to Approach System Design Interviews

```
1. Clarify requirements (5 min)
   - Functional: what does the system DO?
   - Non-functional: scale, availability, latency, consistency requirements

2. Estimate scale (3 min)
   - DAU, requests/second, storage, bandwidth

3. High-level design (10 min)
   - Core components, data flow, API design

4. Deep dive into components (20 min)
   - Database schema, algorithms, critical paths

5. Address bottlenecks (5 min)
   - Failures, scaling, monitoring
```

---

## Back-of-Envelope Estimation

```
Memory:
1 byte  = 1 character
1 KB    = 1,000 bytes (tweet, config)
1 MB    = 1,000 KB (image thumbnail, short video chunk)
1 GB    = 1,000 MB (HD video minute, large dataset)
1 TB    = 1,000 GB (typical disk)
1 PB    = 1,000 TB (large data warehouse)

Time:
Nanosecond  (ns)  = 10^-9 s — L1 cache hit
Microsecond (μs)  = 10^-6 s — SSD read, Redis get
Millisecond (ms)  = 10^-3 s — DB query, API call
Second            = cross-data-center roundtrip

Throughput:
1M users × 10 req/day = 10M req/day ≈ 115 req/sec

Storage example — Twitter:
- 500M tweets/day
- Average tweet: 300 bytes
- 500M × 300 bytes = 150GB/day
- 150GB × 365 = ~55TB/year
```

---

## CAP Theorem

```
In a distributed system, you can only guarantee 2 of 3:

C — Consistency: every read gets the most recent write (or error)
A — Availability: every request gets a response (not necessarily latest)
P — Partition Tolerance: system works despite network partitions

In practice: Network partitions WILL happen.
So the real choice is: CP or AP when a partition occurs?

CP (Consistency + Partition Tolerance):
- Banks, payments, inventory (correctness critical)
- Examples: HBase, Zookeeper, etcd, PostgreSQL

AP (Availability + Partition Tolerance):
- Social media, caching, DNS (availability critical)
- Examples: Cassandra, DynamoDB, Riak, CouchDB

CA (without partition tolerance) — only possible on single node:
- Not viable for distributed systems
```

---

## PACELC Extension to CAP

```
PACELC: If Partition (P): choose Availability (A) or Consistency (C)
        Else (E, normal operation): choose Latency (L) or Consistency (C)

DynamoDB: PA/EL — available during partition, low latency (eventually consistent)
PostgreSQL: PC/EC — consistent always, higher latency
Cassandra: PA/EL — available + low latency
HBase: PC/EC — consistent always
```

---

## Horizontal vs Vertical Scaling

```
Vertical Scaling (Scale Up):
- Bigger CPU, more RAM, faster SSD
- Simple, no code changes
- Limited by hardware ceiling
- Single point of failure
- Example: t2.micro → r5.2xlarge (32 vCPU, 256 GB RAM)

Horizontal Scaling (Scale Out):
- More servers
- Requires stateless application (or distributed state)
- Higher complexity (coordination, distributed bugs)
- Near-unlimited ceiling
- Example: 1 server → 10 servers + load balancer

Stateless scaling: Store state externally (Redis sessions, S3 files)
```

---

## Load Balancing

```
Algorithms:
1. Round Robin — requests distributed evenly (ignores load)
2. Weighted Round Robin — more capable servers get more requests
3. Least Connections — route to server with fewest active connections
4. IP Hash — same client always goes to same server (sticky sessions)
5. Least Response Time — route to fastest-responding server

Layers:
L4 (Transport) — routes by IP/port, fast, no content inspection
L7 (Application) — routes by URL, headers, cookies, enables A/B testing

Tools: Nginx, HAProxy, AWS ALB, Cloudflare

Health checks: periodic pings to remove unhealthy servers from rotation
```

---

## Database Scaling

```
Read Replicas:
- Primary handles writes
- Replicas handle reads (async replication, slight lag)
- Good for read-heavy workloads (80%+ reads)

Sharding (Horizontal Partitioning):
- Split data across multiple DB servers
- Shard key: user_id, region, hash
- Challenge: cross-shard queries, resharding

Partitioning (within one DB):
- Split large tables into smaller ones
- Range (by date), Hash (by id), List (by region)
- Same server, different storage files

Connection Pooling:
- DB connections are expensive (memory, OS resources)
- Pool: reuse connections across requests
- PgBouncer (PostgreSQL), ProxySQL (MySQL)
- Typical pool size: 10-20 connections per server
```

---

## Caching Strategies

```
Cache-Aside (Lazy Loading) — most common:
  Read: check cache → miss → read DB → write cache → return
  Write: update DB → invalidate cache (or update)
  Pro: only cache what's needed
  Con: cache miss on first request, staleness possible

Write-Through:
  Write to cache + DB simultaneously
  Pro: always consistent
  Con: write latency, cache fills with unused data

Write-Behind (Write-Back):
  Write to cache, async write to DB later
  Pro: very low write latency
  Con: data loss on cache crash

Read-Through:
  Application always reads from cache
  Cache fetches from DB on miss (cache manages refresh)

Cache Eviction Policies:
  LRU — Least Recently Used (most popular)
  LFU — Least Frequently Used (better for skewed access)
  FIFO — First In First Out
  TTL — Time-based expiration
```

---

## Message Queues

```
Decoupling: producers don't wait for consumers
Durability: messages survive crashes
Backpressure: consumers control their own pace
Retry: failed messages can be requeued

Patterns:
Point-to-Point (Queue): one producer, one consumer per message
Pub/Sub: one publisher, many subscribers
Fan-out: one message → multiple queues

Tools:
RabbitMQ — AMQP, complex routing, good for task queues
Kafka — event streaming, high throughput, log-based, replay
AWS SQS — managed, simple, at-least-once delivery
Redis Streams — lightweight, in-memory (limited durability)

Guarantees:
At-most-once: fire and forget (may lose)
At-least-once: retry until acknowledged (may duplicate)
Exactly-once: hardest, Kafka with transactions + idempotent consumers
```

---

## CDN (Content Delivery Network)

```
Edge servers distributed globally
Client requests served from nearest edge (low latency)
Static content: JS, CSS, images, videos

Origin pull: CDN fetches from origin on cache miss
Cache-Control headers control CDN caching
Cache invalidation: purge by URL, tag, or prefix

When to use CDN:
- Static assets (JS, CSS, images) — always
- API responses (if safe to cache) — GET /products, /categories
- Video streaming — HLS segments
- Geographic distribution — reduce latency globally
```

---

## Interview Questions

**Q: Walk me through how you'd design Twitter's feed.**

Key points to mention:
1. Fan-out on write: when user tweets, push to followers' feed lists (Redis sorted set by timestamp)
2. Fan-out on read: for users with millions of followers (celebrities), too expensive to fan-out on write — compute on read instead
3. Hybrid: regular users → write, celebrities → read
4. Storage: tweets in Cassandra (wide-column, high write throughput)
5. Timeline service: Redis sorted sets, LRU eviction for inactive users

**Q: What is the difference between a message queue and a pub/sub system?**
A: In a message queue (point-to-point), each message is consumed by exactly one consumer — good for task distribution. In pub/sub, each message goes to ALL subscribers — good for event notification. Kafka supports both: consumer groups act as a queue (one consumer per group per message), while multiple groups act as pub/sub. RabbitMQ can do both via routing topologies.

**Q: How do you handle database write hotspots?**
A: Hotspots occur when many requests hit the same row/shard. Solutions: (1) Write coalescing — buffer writes in Redis, flush to DB in batches. (2) Counter sharding — split counter across N shards, read by summing all shards. (3) Async processing — put writes in queue, process out of band. (4) Eventual consistency — accept counter drift, reconcile periodically.
