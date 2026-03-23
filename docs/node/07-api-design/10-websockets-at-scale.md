# WebSockets at Scale

## The Problem: Sticky State

A WebSocket is a persistent, stateful connection to a **specific server instance**. This breaks horizontal scaling.

```
Client A connected to Server 1
Client B connected to Server 2

Client A sends message to Client B
→ Server 1 has no idea Client B exists on Server 2
→ Message is lost
```

---

## Solution 1: Redis Pub/Sub Adapter

The most common approach. All server instances subscribe to a shared Redis channel. When any instance receives a message, it broadcasts via Redis to all other instances.

```
Server 1 ──publish──► Redis ──subscribe──► Server 2
                              └──subscribe──► Server 3

Client A (on S1) sends message
→ S1 publishes to Redis
→ Redis delivers to S2 and S3
→ S2 and S3 forward to their connected clients
```

### Socket.IO + Redis Adapter

```bash
npm install socket.io @socket.io/redis-adapter ioredis
```

```typescript
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'ioredis';

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: '*' },
  // Tune these for scale
  pingTimeout: 20000,
  pingInterval: 25000,
});

// Two separate Redis connections — one pub, one sub
const pubClient = createClient({ host: 'redis', port: 6379 });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);

// Attach Redis adapter — all multi-server coordination is automatic
io.adapter(createAdapter(pubClient, subClient));

io.on('connection', (socket) => {
  const userId = socket.handshake.auth.userId;
  console.log(`User ${userId} connected from ${socket.id}`);

  // Join user to their own room (for direct messages)
  socket.join(`user:${userId}`);

  socket.on('join-room', (roomId: string) => {
    socket.join(roomId);
    // Room membership is synced across all instances via Redis
  });

  socket.on('message', (data: { roomId: string; text: string }) => {
    // Broadcast to everyone in room — even on other servers
    io.to(data.roomId).emit('message', {
      from: userId,
      text: data.text,
      timestamp: Date.now(),
    });
  });

  socket.on('disconnect', () => {
    console.log(`User ${userId} disconnected`);
  });
});

httpServer.listen(3000);
```

### Direct Message to User (Any Server)

```typescript
// Send to specific user regardless of which server they're on
async function notifyUser(userId: string, event: string, data: unknown) {
  // io.to() with Redis adapter broadcasts across all instances
  io.to(`user:${userId}`).emit(event, data);
}

// From a background job / another service
async function sendFromExternalService(userId: string, notification: Notification) {
  // Publish directly to Redis — Socket.IO adapter picks it up
  await pubClient.publish(
    'socket.io#/#',  // adapter channel
    JSON.stringify({
      type: 2, // EVENT
      nsp: '/',
      data: ['notification', notification],
      rooms: [`user:${userId}`],
    })
  );
}
```

---

## Solution 2: Sticky Sessions (Simpler but Limited)

Route each client to the same server instance for the lifetime of the connection.

```
Load Balancer (with sticky sessions)
  Client A → always → Server 1  (by IP or cookie)
  Client B → always → Server 2
  Client C → always → Server 1
```

**Nginx sticky session config:**
```nginx
upstream websocket_backend {
  ip_hash;  # route by client IP

  server server1:3000;
  server server2:3000;
  server server3:3000;
}

server {
  location /socket.io/ {
    proxy_pass http://websocket_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;  # keep WS connections alive
  }
}
```

**Problems with sticky sessions:**
- Server goes down → all sticky clients disconnect, reconnect to other servers
- Uneven load (one IP with many connections saturates one server)
- Cross-server messaging still requires Redis or another coordination mechanism

---

## Solution 3: Dedicated WebSocket Service

Separate the WebSocket layer from application logic.

```
                         ┌─────────────────┐
Client ─── WS ────────►  │  WS Gateway     │  (stateful, few instances)
                         │  (Socket.IO)    │
                         └────────┬────────┘
                                  │ REST/gRPC/Redis
                         ┌────────▼────────┐
                         │   App Servers   │  (stateless, many instances)
                         │  (REST/GraphQL) │
                         └─────────────────┘
```

WS Gateway handles only connection management. App servers handle business logic and tell the gateway who to notify.

---

## Connection Management at Scale

### Presence System (Who's Online)

```typescript
import { Redis } from 'ioredis';

const redis = new Redis();

const PRESENCE_TTL = 30; // seconds

io.on('connection', async (socket) => {
  const userId = socket.handshake.auth.userId;

  // Mark user as online
  await redis.setex(`presence:${userId}`, PRESENCE_TTL, socket.id);

  // Heartbeat — refresh TTL while connected
  const heartbeat = setInterval(async () => {
    await redis.setex(`presence:${userId}`, PRESENCE_TTL, socket.id);
  }, 15_000);

  socket.on('disconnect', async () => {
    clearInterval(heartbeat);
    await redis.del(`presence:${userId}`);

    // Notify friends that user went offline
    io.to(`friends:${userId}`).emit('user-offline', { userId });
  });
});

// Query who's online
async function getOnlineUsers(userIds: string[]): Promise<string[]> {
  const pipeline = redis.pipeline();
  for (const id of userIds) pipeline.exists(`presence:${id}`);
  const results = await pipeline.exec();
  return userIds.filter((_, i) => results![i][1] === 1);
}
```

### Rate Limiting WebSocket Events

```typescript
import { RateLimiterRedis } from 'rate-limiter-flexible';

const limiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'ws_ratelimit',
  points: 10,     // 10 messages
  duration: 1,    // per second
});

io.on('connection', (socket) => {
  const userId = socket.handshake.auth.userId;

  socket.on('message', async (data) => {
    try {
      await limiter.consume(userId);
      // Process message
    } catch {
      socket.emit('error', { code: 'RATE_LIMITED', retryAfter: 1 });
    }
  });
});
```

### Reconnection & Message Buffering

```typescript
// Client-side — Socket.IO handles reconnect automatically
const socket = io('wss://api.example.com', {
  auth: { token: getAuthToken() },
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

// Handle missed messages during disconnect
socket.on('connect', () => {
  const lastEventId = localStorage.getItem('lastEventId');
  if (lastEventId) {
    // Request missed events since last received
    socket.emit('sync', { since: lastEventId });
  }
});

// Server: buffer recent messages per room in Redis
async function bufferMessage(roomId: string, message: Message) {
  const key = `buffer:${roomId}`;
  await redis.lpush(key, JSON.stringify(message));
  await redis.ltrim(key, 0, 99);   // keep last 100
  await redis.expire(key, 3600);   // 1 hour TTL
}

socket.on('sync', async ({ since }) => {
  const buffer = await redis.lrange(`buffer:${roomId}`, 0, -1);
  const missed = buffer
    .map(m => JSON.parse(m) as Message)
    .filter(m => m.id > since)
    .reverse();
  socket.emit('sync-response', missed);
});
```

---

## Scaling Numbers

```
Socket.IO with Redis adapter:
  Per Node.js process: ~10k-50k concurrent connections
  With Redis adapter: scale horizontally until Redis is bottleneck
  Redis Pub/Sub: ~100k messages/sec on a t3.medium

Cloudflare Durable Objects (edge approach):
  Per room (Durable Object): handles all connections in that room
  Scales per-room, not per-server
  Zero ops overhead

AWS API Gateway WebSockets:
  Serverless, pay per message
  Scales automatically
  Connection IDs stored in DynamoDB
  Lambda handles each event
```

### AWS API Gateway WebSocket Pattern

```typescript
// Lambda handler for WebSocket events
export const handler = async (event: APIGatewayProxyEvent) => {
  const { connectionId, routeKey } = event.requestContext;
  const domain = event.requestContext.domainName;
  const stage = event.requestContext.stage;

  const api = new ApiGatewayManagementApiClient({
    endpoint: `https://${domain}/${stage}`,
  });

  switch (routeKey) {
    case '$connect':
      await dynamo.put({ TableName: 'connections', Item: { connectionId } }).promise();
      break;

    case '$disconnect':
      await dynamo.delete({ TableName: 'connections', Key: { connectionId } }).promise();
      break;

    case 'message':
      const body = JSON.parse(event.body!);
      const connections = await dynamo.scan({ TableName: 'connections' }).promise();

      // Broadcast to all connections
      await Promise.allSettled(
        connections.Items!.map(({ connectionId: cid }) =>
          api.send(new PostToConnectionCommand({
            ConnectionId: cid,
            Data: JSON.stringify(body),
          }))
        )
      );
      break;
  }

  return { statusCode: 200 };
};
```

---

## Interview Questions

**Q: Why can't you horizontally scale WebSocket servers without extra coordination?**
WebSocket connections are stateful — a client is connected to a specific server instance. If Client A is on Server 1 and Client B is on Server 2, a message from A to B requires Server 1 to coordinate with Server 2. Without coordination (Redis pub/sub, message broker), the message is lost.

**Q: What is the Socket.IO Redis adapter and how does it work?**
It replaces Socket.IO's in-memory event bus with Redis Pub/Sub. When you call `io.to(room).emit(event, data)`, instead of only broadcasting to local connections, it publishes to a Redis channel. All other server instances are subscribed to that channel, receive the message, and forward it to their local connections in the same room. Transparent to application code.

**Q: What are the trade-offs of sticky sessions vs Redis pub/sub?**
Sticky sessions (IP hash or cookie-based routing) send the same client to the same server — simpler, no Redis needed, but breaks when a server restarts (all its clients reconnect to different servers, causing brief spike), and doesn't solve cross-server messaging. Redis pub/sub solves cross-server messaging and handles server restarts gracefully, but adds Redis as a dependency and latency (~1ms per cross-server message).

**Q: How do you handle WebSocket connections when a server restarts (rolling deploy)?**
Socket.IO clients automatically reconnect with exponential backoff. The client reconnects to a potentially different server (if no sticky sessions). With the Redis adapter, room memberships are re-joined on reconnect. Buffer recent messages in Redis and let clients request missed messages on reconnect (using a `since` cursor or last event ID).
