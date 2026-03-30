# System Design Cheatsheet

## HLD Framework (Interview Structure)

```
1. Clarify requirements (5 min)
   - Functional:  What features? Core vs nice-to-have?
   - Non-functional: Scale, latency, consistency, availability?
   - Out of scope: What explicitly NOT building?

2. Estimate scale (3 min)
   - DAU / MAU
   - Requests per second (peak vs avg)
   - Storage per day / year
   - Bandwidth

3. High-level design (10 min)
   - Client → LB → Services → DB/Cache
   - Draw core data flow

4. Deep dive on critical components (15-20 min)
   - DB choice, schema, indexing
   - Caching strategy
   - API design
   - Scale bottlenecks

5. Identify and resolve bottlenecks (5 min)
   - Single points of failure
   - Scaling strategies
```

---

## Scale Estimates (Back of Envelope)

```
1M users posting once/day     ≈ 12 writes/sec
1M users reading 10x/day      ≈ 120 reads/sec
1 photo at 1MB, 1M uploads/day ≈ 1TB/day storage
Twitter-scale (500M/day tweets) ≈ 6000 writes/sec, ~60K reads/sec

Latency cheat sheet:
  L1 cache          ~1ns
  L2 cache          ~4ns
  RAM               ~100ns
  SSD random read   ~100µs
  HDD random read   ~10ms
  Network within DC ~0.5ms
  Network cross-DC  ~50ms
```

---

## Common Architecture Components

```
Load Balancer    — distributes traffic, health checks, SSL termination
CDN              — static assets, edge caching, geo-distribution
API Gateway      — auth, rate limiting, routing, versioning
Cache (Redis)    — session, hot data, rate counters, leaderboards
Message Queue    — async decoupling, buffering, at-least-once delivery
Search Engine    — full-text (Elasticsearch), inverted index
Object Storage   — S3/GCS for blobs, images, videos
Database Proxy   — connection pooling (PgBouncer), failover
```

---

## Database Selection

| Need | Choice |
|------|--------|
| ACID transactions, complex queries | PostgreSQL |
| Massive scale, simple access patterns | DynamoDB, Cassandra |
| Documents with flexible schema | MongoDB |
| Time-series data | InfluxDB, TimescaleDB |
| Full-text search | Elasticsearch |
| In-memory cache + data structures | Redis |
| Graph relationships | Neo4j |
| Analytics / OLAP | BigQuery, Redshift, ClickHouse |

---

## Caching Patterns

```
Cache-aside     check cache → miss → DB → populate cache
Write-through   write cache + DB together
Write-behind    write cache → async batch write to DB
Read-through    cache layer fetches DB on miss

What to cache:
  - Expensive DB queries (leaderboards, aggregates)
  - Session data
  - Static/semi-static config
  - API responses (with short TTL)

Cache invalidation:
  - TTL (simple, allows stale window)
  - Event-driven (delete on write)
  - Cache tags (invalidate groups)

Eviction policies: LRU, LFU, FIFO
```

---

## Databases: Scaling Patterns

```
Vertical scaling      — bigger machine (CPU, RAM, SSD)
Read replicas         — scale reads, async replication
Connection pooling    — PgBouncer, reduce connection overhead
Sharding              — horizontal partition by key (user_id % N)
  Range sharding:  shard by ID range
  Hash sharding:   consistent hashing (add/remove nodes gracefully)
CQRS                  — separate read/write models
Denormalization       — duplicate data to reduce JOINs
Materialized views    — pre-compute expensive queries
Partitioning          — time-based (monthly tables), list, range
```

---

## Consistency vs Availability (CAP)

```
CAP Theorem: in a partition, choose:
  CP — consistent + partition tolerant (e.g. HBase, Zookeeper)
  AP — available + partition tolerant (e.g. Cassandra, DynamoDB)
  (CA — not realistic in distributed systems)

Consistency spectrum:
  Strong      — every read sees latest write
  Causal      — reads see causally related writes in order
  Eventual    — all replicas converge eventually
  Read-your-writes — you see your own writes immediately
```

---

## Common System Design Patterns

### Rate Limiting Algorithms

```
Fixed window    — reset counter every N seconds (bursty at window edge)
Sliding window  — track timestamps in sorted set, O(requests) space
Token bucket    — tokens added at fixed rate, burst allowed (AWS, Stripe)
Leaky bucket    — requests processed at constant rate (smooths bursts)
```

### Idempotency

```
Problem: client retries duplicate a payment / email
Solution:
  1. Client sends idempotency-key: uuid header
  2. Server stores (key → response) in Redis with TTL
  3. On duplicate: return stored response, skip processing
```

### Fan-out Patterns

```
Fan-out on write  — precompute feeds on post (read cheap, write expensive)
Fan-out on read   — compute feed on read (write cheap, read expensive)
Hybrid            — small following: write-time; celebrity: read-time merge
```

### Distributed Locking (Redis)

```js
// SETNX + TTL — acquire lock
const acquired = await redis.set(key, clientId, { NX: true, EX: 30 })
// Release — only if we own it (Lua script for atomicity)
const script = `
  if redis.call("get", KEYS[1]) == ARGV[1]
  then return redis.call("del", KEYS[1])
  else return 0 end`
await redis.eval(script, { keys: [key], arguments: [clientId] })
```

---

## API Design Checklist

```
✅ Versioned (/api/v1/...)
✅ Consistent error shape { error: { code, message, fields } }
✅ Pagination (cursor-based for large datasets)
✅ Rate limit headers (X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After)
✅ Idempotency keys for mutations
✅ Filtering, sorting, field selection via query params
✅ HTTPS + HSTS
✅ Auth on every endpoint (deny by default)
✅ Audit log for sensitive operations
```

---

## Classic System Design Cheat Codes

| System | Key Components |
|--------|---------------|
| URL Shortener | Hash (MD5/base62), Redis cache, 301 vs 302, analytics counter |
| Twitter/Feed | Fan-out (write for small, read for celebrities), Redis timelines |
| Rate Limiter | Token bucket in Redis, Lua atomic script |
| Chat App | WebSocket, message queue, read receipts, presence via Redis |
| File Storage | CDN + S3, chunked upload, metadata in DB, blob in object store |
| Search | Inverted index (Elasticsearch), tokenization, TF-IDF |
| Notification | Message queue → consumer → push gateway (FCM/APNs) |
| Ride Share | Geospatial index, WebSocket location updates, driver matching |
| Video | Chunked upload, transcoding pipeline, CDN, adaptive bitrate |
| Payments | Idempotency keys, saga pattern, audit log, double-entry bookkeeping |

---

## Non-Functional Requirements Quick Reference

```
Availability  = uptime / (uptime + downtime)
  99%   = 3.65 days downtime/year
  99.9% = 8.77 hours/year
  99.99% = 52 min/year
  99.999% = 5.26 min/year (five nines)

Latency targets:
  p50 = median user
  p95 = 95th percentile (slow users)
  p99 = 99th percentile (tail latency, SLA critical)

Consistency models (weakest → strongest):
  Eventual → Monotonic Reads → Read-Your-Writes → Causal → Sequential → Linearizable
```
