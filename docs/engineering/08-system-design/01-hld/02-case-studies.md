# System Design Case Studies

---

## 1. URL Shortener (bit.ly)

### Requirements
```
Functional:
- Shorten a long URL → short code (e.g., bit.ly/abc123)
- Redirect short URL to original
- Optional: custom alias, expiry, analytics

Non-functional:
- 100M URLs created/day = ~1,200 writes/sec
- 10B redirects/day = ~115,000 reads/sec (read-heavy 10,000:1)
- Latency: redirect < 10ms
- 99.99% availability
```

### Scale Estimation
```
Storage:
- 1 URL ≈ 500 bytes (short code + long URL + metadata)
- 100M/day × 365 days × 5 years = 182B URLs
- 182B × 500 bytes = ~91 TB

Reads: 115,000/sec → need caching
Writes: 1,200/sec → single primary DB can handle
```

### Design
```
                    CDN (cache popular redirects)
                         ↓
Client → Load Balancer → URL Service → Redis Cache (hot URLs)
                              ↓                ↓ (miss)
                         PostgreSQL      Redirect served
                         (URL mappings)

Short code generation:
1. Base62 encoding (a-z, A-Z, 0-9) → 62^7 = 3.5 trillion codes for 7 chars
2. Options:
   a. Auto-increment ID → base62 encode (predictable, simple)
   b. MD5/SHA of long URL, take first 7 chars (may collide)
   c. Nanoid/UUID (random, no collision, but harder to check uniqueness)

Recommended: auto-increment with a counter service
- Counter service distributes ID ranges to app servers
- Each server gets a range (e.g., 1-1000), uses them, then gets next range
- No coordination per URL creation
```

### Schema
```sql
CREATE TABLE urls (
  id BIGINT PRIMARY KEY,
  short_code VARCHAR(10) UNIQUE NOT NULL,
  long_url TEXT NOT NULL,
  user_id BIGINT,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  click_count BIGINT DEFAULT 0
);

CREATE INDEX idx_short_code ON urls(short_code);
CREATE INDEX idx_expires_at ON urls(expires_at) WHERE expires_at IS NOT NULL;
```

### Redirect Flow
```
1. Client: GET /abc123
2. Load balancer routes to URL service
3. Service checks Redis cache:
   - HIT → 301/302 redirect immediately (< 1ms)
   - MISS → query PostgreSQL → cache result → redirect
4. Async: increment click counter (don't block redirect)
   - Use Redis INCR, batch flush to DB every minute

Cache strategy:
- Cache popular URLs (80/20 rule)
- TTL = 24 hours for active URLs
- 301 (permanent) vs 302 (temporary): 302 for analytics (client always hits us)
```

---

## 2. Chat Application (WhatsApp-style)

### Requirements
```
Functional:
- 1:1 and group messaging
- Message delivery status (sent, delivered, read)
- Online presence
- Push notifications for offline users
- Message history

Non-functional:
- 50M DAU, 40 messages/user/day = 2B messages/day
- Low latency (< 100ms message delivery)
- Message ordering guaranteed
- At-least-once delivery
```

### Design
```
                   WebSocket Server Cluster
                  /    |     |    \
Client ─────────┤     LB     ├──── Client
                  \    |    /
                   Message Bus (Kafka)
                        |
               ┌────────┴────────┐
          Message Service    Presence Service
               |                 |
          Cassandra           Redis
         (messages)         (online status)
               |
          Push Service (Firebase/APNs for offline)
```

### WebSocket Connection Management
```javascript
// Each WebSocket server knows which users are connected to IT
// Problem: User A on server 1 messages User B on server 2

// Solution: Pub/Sub via Redis or Kafka
// Server 1 publishes to channel "user:B"
// Server 2 (where B is connected) subscribes to "user:B"
// Server 2 delivers to B's WebSocket

const redis = require('redis');
const subscriber = redis.createClient();
const publisher = redis.createClient();

// When user connects:
async function handleConnection(userId, ws) {
  await redis.set(`presence:${userId}`, 'online', 'EX', 30);
  await subscriber.subscribe(`user:${userId}`, (message) => {
    ws.send(message); // deliver to this user's WebSocket
  });
}

// Send message:
async function sendMessage(toUserId, message) {
  const isOnline = await redis.get(`presence:${toUserId}`);
  if (isOnline) {
    await publisher.publish(`user:${toUserId}`, JSON.stringify(message));
  } else {
    await pushNotification(toUserId, message); // offline user
  }
  await cassandra.execute('INSERT INTO messages ...', [message]);
}
```

### Message Storage Schema (Cassandra)
```sql
-- Partitioned by conversation_id for fast retrieval of conversation history
CREATE TABLE messages (
  conversation_id UUID,
  message_id TIMEUUID,  -- time-sortable UUID for ordering
  sender_id UUID,
  content TEXT,
  created_at TIMESTAMP,
  PRIMARY KEY (conversation_id, message_id)
) WITH CLUSTERING ORDER BY (message_id DESC);

-- Delivery status:
CREATE TABLE message_status (
  message_id UUID,
  user_id UUID,
  status TEXT,  -- 'sent', 'delivered', 'read'
  updated_at TIMESTAMP,
  PRIMARY KEY (message_id, user_id)
);
```

---

## 3. Rate Limiter Design

### Requirements
```
- Limit: 100 requests per user per minute
- Distributed (multiple API servers)
- Fast (< 1ms overhead per request)
- Multiple algorithms support
```

### Algorithms Comparison
```
Fixed Window:
  - Counter resets every minute on the dot
  - Simple but allows burst at window boundaries:
    99 req at 11:59 + 99 req at 12:00 = 198 in 2 seconds!

Sliding Window Log:
  - Store timestamp of each request, count last N seconds
  - Accurate but high memory (stores all timestamps)

Sliding Window Counter:
  - Approximate sliding window using two fixed windows
  - weight = prev_count × (1 - elapsed/window) + curr_count
  - Memory-efficient, ~0.003% error rate (used by Cloudflare)

Token Bucket:
  - Tokens refill at constant rate, consumed per request
  - Allows bursts up to bucket capacity
  - Used by AWS API Gateway, Stripe

Leaky Bucket:
  - Requests enter a queue, processed at fixed rate
  - Smooths out bursts (no burst behavior)
  - Good for downstream protection
```

### Sliding Window Counter Implementation
```javascript
async function isRateLimited(userId: string, limit: number, windowSec: number): Promise<boolean> {
  const now = Date.now();
  const currentWindow = Math.floor(now / 1000 / windowSec);
  const prevWindow = currentWindow - 1;
  const elapsed = (now / 1000) % windowSec;

  const [prevCount, currCount] = await redis.mget(
    `rate:${userId}:${prevWindow}`,
    `rate:${userId}:${currentWindow}`
  );

  const prevWeight = 1 - elapsed / windowSec;
  const weightedCount = (parseInt(prevCount || '0') * prevWeight) + parseInt(currCount || '0');

  if (weightedCount >= limit) return true; // rate limited

  // Increment current window:
  const multi = redis.multi();
  multi.incr(`rate:${userId}:${currentWindow}`);
  multi.expire(`rate:${userId}:${currentWindow}`, windowSec * 2);
  await multi.exec();

  return false;
}
```

---

## 4. Notification System

### Requirements
```
Functional:
- Multiple channels: push, email, SMS, in-app
- Scheduled notifications
- User preferences (opt-in/out per channel)
- Delivery tracking

Non-functional:
- 10M notifications/day across channels
- Email SLA: < 1 minute
- Push: < 5 seconds
- 99.9% delivery rate (retry for failures)
```

### Design
```
              API / Event Triggers
                     ↓
              Notification Service
                     ↓
              Message Queue (Kafka)
          ┌─────────┼─────────┐
          ↓         ↓         ↓
    Push Worker  Email Worker  SMS Worker
    (Firebase)  (SendGrid)   (Twilio)
          ↓         ↓         ↓
    Delivery Tracker (update status in DB)
          ↓
    Retry Service (re-queue failed, exponential backoff)
```

### Template System
```javascript
// Notification template with variable substitution:
const templates = {
  'order_shipped': {
    email: {
      subject: 'Your order {{orderId}} has shipped!',
      body: 'Hi {{userName}}, your order is on its way. Track: {{trackingUrl}}'
    },
    push: {
      title: 'Order shipped!',
      body: 'Your order {{orderId}} is on its way'
    },
    sms: 'Your order {{orderId}} shipped. Track: {{trackingUrl}}'
  }
};

async function sendNotification(userId: string, type: string, vars: Record<string, string>) {
  const prefs = await getUserPreferences(userId);
  const template = templates[type];

  if (prefs.email && template.email) {
    await emailQueue.add({ userId, template: template.email, vars });
  }
  if (prefs.push && template.push) {
    await pushQueue.add({ userId, template: template.push, vars });
  }
}
```

---

## 5. Key System Design Trade-offs

### When to Use SQL vs NoSQL

```
SQL (PostgreSQL):
✅ Complex queries (JOINs, aggregations)
✅ ACID transactions
✅ Strong consistency
✅ Well-understood query patterns
Use for: financial data, user accounts, orders, inventory

NoSQL — Document (MongoDB):
✅ Flexible schema (evolving data)
✅ Nested documents (no JOINs)
✅ Good for read-heavy with complex documents
Use for: product catalogs, content management, logs

NoSQL — Wide Column (Cassandra):
✅ Massive write throughput
✅ Linear scalability
✅ Good for time-series data
Use for: messages, events, IoT data, audit logs

NoSQL — Key-Value (Redis):
✅ Sub-millisecond latency
✅ Simple access patterns
Use for: sessions, cache, leaderboards, pub/sub

NoSQL — Search (Elasticsearch):
✅ Full-text search
✅ Aggregations on large datasets
Use for: product search, log analysis, analytics
```

### How to Answer "How Would You Scale X"
```
1. Start with single server
2. Add read replicas (read-heavy)
3. Add caching layer (Redis)
4. Add CDN for static assets
5. Add load balancer + horizontal scaling
6. Database sharding (write-heavy, > 1TB data)
7. Microservices (independent scaling per service)
8. Message queues (decouple async work)
9. Global distribution (multi-region)
```
