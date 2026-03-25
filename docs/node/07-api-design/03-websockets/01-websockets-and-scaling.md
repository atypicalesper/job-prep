# WebSockets — Real-Time Communication and Scaling

---

## WebSocket vs HTTP

HTTP is a request-response protocol — the client initiates every exchange and the server can only respond. This model is efficient for traditional web pages and REST APIs, but it breaks down for real-time applications that need the server to push updates as they happen (a new chat message, an auction bid, a live sports score). Polling workarounds (repeatedly asking "anything new?") waste bandwidth and CPU and still introduce latency equal to the poll interval. The WebSocket protocol solves this by upgrading an HTTP connection to a persistent, full-duplex TCP channel: after the initial handshake, either party can send a message frame to the other at any time with minimal overhead (~2–10 bytes of framing, no HTTP headers on each message).

```
HTTP (request-response):
  Client → Request → Server → Response → done
  New connection per request (HTTP/1.1: keep-alive helps but still req/res)
  Server cannot push without a request

WebSocket:
  Client → Upgrade handshake → Server → Persistent bidirectional channel
  Either side can send at any time
  Low overhead after handshake (no HTTP headers per message)
  Good for: chat, live updates, collaborative editing, gaming
```

---

## Basic WebSocket Server (ws library)

The `ws` package is the most widely used low-level WebSocket library for Node.js. It handles the HTTP Upgrade handshake, frame parsing, and ping/pong control frames, and exposes a clean event-based API. The key design decision is how to map connections to users: storing sockets in a `Map<userId, WebSocket>` allows direct delivery to a specific user, while a `Set` of all sockets supports broadcast. The `readyState === WebSocket.OPEN` check before writing is mandatory — attempting to send on a closing or closed socket throws. Heartbeat detection via `ping` / `pong` is essential because TCP's half-open state means a broken connection can appear `OPEN` indefinitely without any data flowing on it.

```javascript
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Track all connected clients:
const clients = new Map<string, WebSocket>(); // userId → socket

wss.on('connection', (ws, req) => {
  // Parse userId from URL or cookie:
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  clients.set(userId, ws);
  console.log(`User ${userId} connected. Total: ${clients.size}`);

  // Send a welcome message:
  ws.send(JSON.stringify({ type: 'CONNECTED', userId }));

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleMessage(userId, message, ws);
    } catch (err) {
      ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid JSON' }));
    }
  });

  ws.on('close', (code, reason) => {
    clients.delete(userId);
    console.log(`User ${userId} disconnected: ${code} ${reason}`);
  });

  ws.on('error', (err) => {
    console.error(`WebSocket error for user ${userId}:`, err.message);
    clients.delete(userId);
  });

  // Heartbeat: detect dead connections:
  (ws as any).isAlive = true;
  ws.on('pong', () => { (ws as any).isAlive = true; });
});

// Ping all clients every 30s — close dead ones:
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!(ws as any).isAlive) {
      ws.terminate(); // forcibly close dead connection
      return;
    }
    (ws as any).isAlive = false;
    ws.ping(); // expect pong back
  });
}, 30_000);

wss.on('close', () => clearInterval(heartbeat));

function handleMessage(userId: string, message: any, ws: WebSocket) {
  switch (message.type) {
    case 'CHAT':
      // Broadcast to recipient:
      const recipientWs = clients.get(message.to);
      if (recipientWs?.readyState === WebSocket.OPEN) {
        recipientWs.send(JSON.stringify({
          type: 'CHAT',
          from: userId,
          text: message.text,
          timestamp: Date.now(),
        }));
      }
      break;

    case 'PING':
      ws.send(JSON.stringify({ type: 'PONG' }));
      break;
  }
}
```

---

## Socket.io — Higher-Level Abstraction

Socket.io builds on top of the raw WebSocket protocol and adds several production-critical features that `ws` does not provide: automatic transport fallback to HTTP long-polling when WebSockets are blocked (corporate firewalls, old proxies), room-based message grouping, automatic reconnection with exponential backoff, and a Redis adapter that makes all `io.to('room').emit()` calls work across multiple server instances. The `socket.join(room)` / `io.to(room).emit(event, data)` pattern is the core abstraction — it lets you think in terms of rooms (chat channels, user-specific feeds, org-wide broadcasts) without managing per-socket delivery logic yourself. Prefer Socket.io when you need these features; use raw `ws` when you want minimal overhead and are building the higher-level features yourself.

```javascript
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL, credentials: true },
  // Fallback transports if WebSocket unavailable:
  transports: ['websocket', 'polling'],
  pingTimeout: 20_000,
  pingInterval: 25_000,
});

// Auth middleware:
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  try {
    const user = await verifyJwt(token);
    socket.data.user = user;
    next();
  } catch {
    next(new Error('Authentication failed'));
  }
});

io.on('connection', (socket) => {
  const { user } = socket.data;
  console.log(`${user.name} connected: ${socket.id}`);

  // Join user to their personal room and their org room:
  socket.join(`user:${user.id}`);
  socket.join(`org:${user.orgId}`);

  // Listen for events:
  socket.on('chat:send', async ({ roomId, text }) => {
    // Save to DB:
    const message = await db.messages.create({
      roomId, userId: user.id, text,
    });

    // Broadcast to everyone in room (including sender):
    io.to(`room:${roomId}`).emit('chat:message', {
      id: message.id,
      text,
      author: { id: user.id, name: user.name },
      timestamp: message.createdAt,
    });
  });

  socket.on('room:join', (roomId) => {
    socket.join(`room:${roomId}`);
    socket.to(`room:${roomId}`).emit('room:user_joined', {
      userId: user.id, name: user.name,
    });
  });

  socket.on('disconnect', (reason) => {
    console.log(`${user.name} disconnected: ${reason}`);
    // Notify others in their rooms:
    socket.rooms.forEach((room) => {
      if (room !== socket.id) {
        socket.to(room).emit('room:user_left', { userId: user.id });
      }
    });
  });
});
```

---

## Scaling WebSockets Across Multiple Servers

WebSocket connections are fundamentally stateful and sticky: a connected client's socket object lives in one server process's memory and cannot be accessed by any other process. This breaks horizontal scaling — if a load balancer routes two users to different server instances, neither server can deliver a message from user A to user B's socket because they are in different processes with no shared memory. The solution is a message bus that all server instances share: when any server needs to deliver a message to a user who might be connected to a different server, it publishes to a Redis channel; every server subscribes and delivers the message to any locally connected socket that matches. Socket.io's Redis adapter implements this pattern transparently so that `io.to('room').emit(...)` works regardless of which server each room member is connected to.

```
Problem: WebSocket connections are stateful — a user connected to Server A
can't receive messages from Server B.

Without Redis:
  User A (Server 1) → sends message to User B (Server 2)
  Server 1 doesn't have User B's socket → message lost!

Solution: Redis Pub/Sub as message bus between servers
  Server 1 → publishes to Redis channel → Server 2 → delivers to User B
```

```javascript
// Redis Pub/Sub adapter for Socket.io:
const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);

// Attach adapter — all Socket.io emits now go through Redis:
io.adapter(createAdapter(pubClient, subClient));

// Now io.to('room:123').emit() works across ALL server instances!
// Socket.io handles pub/sub routing automatically.

// Manual Redis pub/sub (without Socket.io adapter):
const publisher = createClient({ url: process.env.REDIS_URL });
const subscriber = createClient({ url: process.env.REDIS_URL });

// This server subscribes to all message channels:
await subscriber.subscribe('chat:*', (message, channel) => {
  const { roomId, data } = JSON.parse(message);
  // Deliver to local sockets in this room:
  localSockets.forEach((ws, userId) => {
    if (localRooms.get(userId)?.has(roomId)) {
      ws.send(JSON.stringify(data));
    }
  });
});

// When user sends a message, publish to Redis:
async function broadcastToRoom(roomId: string, data: any) {
  await publisher.publish(`chat:${roomId}`, JSON.stringify({ roomId, data }));
}
```

---

## Architecture: Chat at Scale

This diagram shows the complete scaled WebSocket architecture. The load balancer uses sticky sessions (IP hash or cookie-based) so each client always reconnects to the same server instance — this means the server's in-memory socket map is always valid for that client's connection. When a message needs to be delivered cross-server (Alice on Server 1 sending to Bob on Server 2), Server 1 publishes the message to a Redis Pub/Sub channel, all server instances are subscribed, and Server 2 receives the event and delivers it to Bob's local socket. The load balancer's sticky-session configuration is essential: without it, a reconnecting client might land on a different server that has no record of the user's room memberships.

```
                    ┌─────────────────┐
                    │  Load Balancer  │
                    │  (sticky        │
                    │   sessions)     │
                    └────────┬────────┘
             ┌───────────────┼───────────────┐
             ▼               ▼               ▼
      ┌──────────┐    ┌──────────┐    ┌──────────┐
      │ WS Srv 1 │    │ WS Srv 2 │    │ WS Srv 3 │
      │          │    │          │    │          │
      │ Users:   │    │ Users:   │    │ Users:   │
      │ Alice    │    │ Bob      │    │ Carol    │
      └────┬─────┘    └────┬─────┘    └────┬─────┘
           │               │               │
           └───────────────┼───────────────┘
                           ▼
                    ┌─────────────┐
                    │    Redis    │
                    │  Pub/Sub    │
                    └─────────────┘

Alice → Server 1 → publish to Redis → Server 2 → deliver to Bob
```

```javascript
// Sticky sessions: route same client to same server
// nginx config:
// upstream websocket {
//   ip_hash;  # or hash $cookie_session_id;
//   server ws1:3000;
//   server ws2:3000;
//   server ws3:3000;
// }
//
// Why sticky sessions? WebSocket upgrade is stateful — during reconnection,
// the client needs to hit the same server OR use Redis for state recovery.
```

---

## Connection State and Reconnection

WebSocket connections drop constantly in the real world: mobile devices switch between WiFi and cellular, laptops sleep and wake, load balancers time out idle connections, and server deployments restart processes. A production client must automatically reconnect and resume normal operation without user intervention. The key insight is that reconnection delay should grow exponentially with each failed attempt (to avoid overwhelming a recovering server with thundering-herd reconnects) and reset to the base value on a successful connection. Messages sent while disconnected should be queued locally and flushed on the next successful connection if delivery guarantees matter.

```javascript
// Client-side: handle reconnection with exponential backoff
class ReconnectingWebSocket {
  private ws: WebSocket | null = null;
  private reconnectDelay = 1000;
  private maxDelay = 30_000;
  private shouldReconnect = true;

  constructor(private url: string) {
    this.connect();
  }

  private connect() {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('Connected');
      this.reconnectDelay = 1000; // reset on successful connect
      this.onOpen?.();
    };

    this.ws.onmessage = (event) => {
      this.onMessage?.(JSON.parse(event.data));
    };

    this.ws.onclose = (event) => {
      if (!event.wasClean && this.shouldReconnect) {
        console.log(`Disconnected. Reconnecting in ${this.reconnectDelay}ms`);
        setTimeout(() => this.connect(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  send(data: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      // Queue for when reconnected:
      this.sendQueue.push(data);
    }
  }

  close() {
    this.shouldReconnect = false;
    this.ws?.close(1000, 'Normal closure');
  }

  onOpen?: () => void;
  onMessage?: (data: any) => void;
  private sendQueue: object[] = [];
}
```

---

## Server-Sent Events (SSE) — One-Way Alternative

Server-Sent Events (SSE) is an HTTP-based push mechanism where the server keeps a long-lived response open and writes events to it as they occur. Unlike WebSockets, SSE is strictly one-directional (server → client), works over standard HTTP/1.1 with no protocol upgrade, automatically reconnects on the browser side when the connection drops, and passes through HTTP proxies and load balancers that might block WebSocket upgrades. The `text/event-stream` content type activates the browser's built-in `EventSource` client, which handles reconnection transparently. SSE is the right choice for notifications, progress updates, live feeds, and any use case where the client only needs to receive data — not send it. Reserve WebSockets for bidirectional communication.

```javascript
// SSE: server → client only, over regular HTTP
// Good for: live feed, notifications, progress updates
// Advantage: works through proxies, automatic reconnect, no library needed

app.get('/events', (req, res) => {
  // Set SSE headers:
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // disable nginx buffering
  });

  // Send initial data:
  res.write('data: {"connected":true}\n\n');

  const userId = req.user.id;
  sseClients.set(userId, res);

  // Keep alive with comment every 15s:
  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 15_000);

  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(userId);
  });
});

// Push event to specific user:
function pushToUser(userId: string, event: string, data: any) {
  const res = sseClients.get(userId);
  if (res) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

// Client (browser):
const eventSource = new EventSource('/events', { withCredentials: true });
eventSource.addEventListener('notification', (e) => {
  const data = JSON.parse(e.data);
  showNotification(data);
});
eventSource.onerror = () => {
  // Browser auto-reconnects SSE after 3s by default
  console.log('SSE disconnected, will reconnect...');
};
```

---

## Interview Questions

**Q: When would you use WebSockets vs SSE vs long polling?**
A: WebSockets: bidirectional, low-latency, real-time — chat, gaming, collaborative editing, live dashboards where client also sends. SSE: server-to-client only — notifications, live feed, progress bars — simpler, auto-reconnects, works through HTTP/2 multiplexing. Long polling: fallback for environments where WebSockets are blocked (corporate firewalls), or when messages are infrequent. Long polling sends a request that the server holds until data is available, then client immediately re-requests.

**Q: How do you scale WebSocket connections across multiple Node.js instances?**
A: WebSocket connections are sticky to one server. Use Redis Pub/Sub as a message bus: when Server A needs to send to a user on Server B, it publishes to Redis, and Server B (subscribed to that channel) delivers it. Socket.io's Redis adapter handles this automatically. Also need sticky sessions at the load balancer so reconnections route to the same server.

**Q: What is the ping/pong heartbeat and why do you need it?**
A: TCP connections can appear open but actually be dead (half-open: network interruption where the FIN packet is lost). WebSocket ping/pong lets the server detect this: send a ping, expect a pong within a timeout. If no pong, terminate the connection and clean up state. Without heartbeats, dead connections accumulate, consuming memory and file descriptors. The WebSocket spec defines control frames for this; ws library handles it automatically when configured.

**Q: How do you handle messages sent while a user is temporarily disconnected?**
A: Options: (1) Message queue — store undelivered messages in Redis (LPUSH) or DB, and flush them when user reconnects. (2) Message offset/cursor — client sends last received message ID on reconnect, server replays missed messages. (3) Accept message loss — for ephemeral data (mouse positions, typing indicators). Approach depends on whether message delivery must be guaranteed. Most chat systems use DB persistence + "you missed N messages, click to load" pattern.
