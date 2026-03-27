# Real-time Transports: WebSocket vs SSE vs Polling

---

## Comparison at a Glance

| | WebSocket | Server-Sent Events (SSE) | Long Polling | Short Polling |
|---|---|---|---|---|
| **Direction** | Bidirectional | Server → client only | Server → client (client initiates) | Server → client (client initiates) |
| **Protocol** | WS / WSS (upgrade from HTTP) | HTTP/1.1 or HTTP/2 | HTTP | HTTP |
| **Connection** | Persistent, full-duplex | Persistent, half-duplex | Held open per message | Opens/closes per interval |
| **Browser API** | `WebSocket` | `EventSource` | `fetch` / `XMLHttpRequest` | `fetch` / `XMLHttpRequest` |
| **Auto-reconnect** | Manual | Built-in | Manual | N/A |
| **Proxy/firewall** | Can be blocked (Upgrade header) | Works anywhere HTTP does | Works everywhere | Works everywhere |
| **HTTP/2 multiplex** | No (own framing) | Yes (multiplexed streams) | No | No |
| **Message format** | Any (text/binary) | Text only (UTF-8) | Any | Any |

---

## WebSocket

WebSocket starts as HTTP and upgrades to a persistent, full-duplex TCP connection.

### Handshake

```
Client → Server:
  GET /ws HTTP/1.1
  Upgrade: websocket
  Connection: Upgrade
  Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
  Sec-WebSocket-Version: 13

Server → Client (101 Switching Protocols):
  Upgrade: websocket
  Connection: Upgrade
  Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

After the handshake, both sides can send frames at any time with no HTTP overhead.

### Browser API

```js
const ws = new WebSocket('wss://api.example.com/ws');

ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe', channel: 'prices' }));

ws.onmessage = ({ data }) => {
  const msg = JSON.parse(data);
  updateUI(msg);
};

ws.onerror = (err) => console.error('WS error', err);
ws.onclose = ({ code, reason, wasClean }) => {
  if (!wasClean) scheduleReconnect();
};
```

### Close codes

| Code | Meaning |
|---|---|
| 1000 | Normal closure |
| 1001 | Going away (server restart, browser navigation) |
| 1006 | Abnormal closure (no close frame — connection lost) |
| 1008 | Policy violation |
| 1011 | Server error |

### Reconnection pattern

```js
function connect() {
  const ws = new WebSocket(URL);
  let retryDelay = 1000;

  ws.onclose = ({ wasClean }) => {
    if (!wasClean) {
      setTimeout(connect, Math.min(retryDelay *= 2, 30000));
    }
  };
  return ws;
}
```

Exponential backoff with a cap prevents thundering herds on server restart.

### When to use WebSocket

- Chat, multiplayer games, collaborative editing (bidirectional is essential)
- Live dashboards where clients also send actions (not just receive)
- Low-latency financial data (WS framing overhead is ~2–14 bytes vs HTTP headers)
- Anything that requires client → server push beyond occasional REST calls

---

## Server-Sent Events (SSE)

SSE is a standard browser API (EventSource) over a persistent HTTP connection. The server sends a stream of `data:` lines; the client cannot send messages on the same connection.

### Server response format

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"price": 42.50}\n\n

event: trade
data: {"side": "buy", "qty": 10}\n\n

id: 42
data: heartbeat\n\n
```

Each event ends with a blank line (`\n\n`). Fields:
- `data:` — event payload (can span multiple lines)
- `event:` — custom event type (default: `message`)
- `id:` — `Last-Event-ID` — browser sends this on reconnect
- `retry:` — reconnect delay in ms

### Browser API

```js
const es = new EventSource('/stream');

es.onmessage = ({ data }) => console.log(JSON.parse(data));

es.addEventListener('trade', ({ data }) => {
  const trade = JSON.parse(data);
  updateTradeLog(trade);
});

es.onerror = () => {
  // EventSource auto-reconnects with Last-Event-ID header
  // es.readyState: 0=CONNECTING, 1=OPEN, 2=CLOSED
};
```

### Auto-reconnect

`EventSource` reconnects automatically after network loss, sending:
```
Last-Event-ID: 42
```
The server can use this to replay missed events — a built-in resumability that WebSocket lacks out of the box.

### SSE with HTTP/2

Under HTTP/2, SSE streams are multiplexed — you can open many SSE connections without the browser's 6-connection-per-host limit (a problem with HTTP/1.1). Each stream uses a fraction of a single TCP connection.

### When to use SSE

- Notifications, live feeds, activity streams (server → client only)
- When you need auto-reconnect + resumability with `Last-Event-ID`
- Environments where WebSocket is blocked (proxies, strict firewalls) — SSE is plain HTTP
- Streaming LLM responses (OpenAI API, streaming chat) — the de-facto standard
- Next.js streaming / React streaming SSR

---

## Long Polling

The client makes an HTTP request; the server holds it open until an event occurs (or a timeout), then responds. The client immediately opens a new request.

```
Client                           Server
  │── GET /poll ─────────────────►│
  │                         (wait for event)
  │                               │
  │◄──── 200 { event: ... } ──────│
  │
  │── GET /poll ─────────────────►│ (immediately re-opens)
  │                               │
```

### Implementation

```js
// Client
async function poll() {
  while (true) {
    try {
      const res = await fetch('/api/events?timeout=30');
      const { events } = await res.json();
      events.forEach(handleEvent);
    } catch {
      await sleep(2000); // back off on error
    }
  }
}
```

```js
// Server (Express)
app.get('/api/events', async (req, res) => {
  const timeout = 30_000;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const events = await checkForNewEvents(req.query.lastId);
    if (events.length > 0) {
      return res.json({ events });
    }
    await sleep(500); // poll interval
  }

  res.json({ events: [] }); // timeout, client re-polls
});
```

### Drawbacks

- One open HTTP connection per client (significant server load at scale — use SSE instead).
- Not great for very high frequency updates (constant request/response overhead).
- Adds 1 round trip latency vs WebSocket/SSE.

### When to use Long Polling

- Legacy environments where SSE/WebSocket are unavailable.
- Very infrequent events where the complexity of WS/SSE isn't justified.
- As a fallback in libraries like Socket.IO (tries WS, falls back to long polling).

---

## Short Polling

Client polls an endpoint on a fixed interval with `setInterval`. Simple but wasteful.

```js
setInterval(async () => {
  const data = await fetch('/api/status').then(r => r.json());
  updateUI(data);
}, 5000);
```

**Use only when:**
- Events are infrequent and a few seconds of latency is acceptable.
- Implementation simplicity outweighs efficiency (quick prototype, cron-like dashboards).

---

## Proxy & Firewall Considerations

**WebSocket** requires the HTTP `Upgrade` header to be passed through. Many corporate proxies strip it, causing connections to fail silently. Symptoms: WS connects on local network but fails in production behind a load balancer/proxy.

Nginx config to pass WS:
```nginx
location /ws {
  proxy_pass http://backend;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 3600s; # keep connection alive
}
```

**SSE** is plain HTTP — it works through any proxy that allows long-lived responses. Caveat: some proxies buffer responses and delay delivery. Fix: `X-Accel-Buffering: no` (Nginx) or `proxy_buffering off`.

---

## Scaling Considerations

### WebSocket at scale

WebSocket connections are stateful — a client is connected to a specific server instance. This breaks horizontal scaling: if you have 3 servers and 30,000 clients, 10,000 clients are connected to each server.

To broadcast to all clients, you need a **pub/sub backplane**:
```
Client ──WS──► Server A ──publish──► Redis Pub/Sub ──subscribe──► Server B/C
                                                                      │
                                                                  Connected clients
```

Libraries: Socket.IO with Redis adapter, Ably, Pusher (managed).

### SSE at scale

Same stateful problem — each client is pinned to a server. Same solution: Redis pub/sub, or use an edge platform (Cloudflare Workers, Vercel Edge Functions) that handles fan-out.

---

## Interview Q&A

**Q: Why use SSE over WebSocket for a notification system?**
Notifications are one-directional (server → client). SSE is simpler to implement (plain HTTP, no upgrade), auto-reconnects with `Last-Event-ID` for resumability, works through proxies that block WebSocket, and multiplexes over HTTP/2. WebSocket's bidirectionality adds complexity for no benefit here.

**Q: How does Socket.IO differ from raw WebSocket?**
Socket.IO is a library on top of WebSocket (with long-polling fallback). It adds: event-based API (instead of raw messages), automatic reconnection, rooms/namespaces for broadcast groups, binary support, and acknowledgments (RPC-like callbacks). The tradeoff: Socket.IO clients and servers must both use Socket.IO (custom protocol on top of WS), unlike raw WS which is interoperable.

**Q: WebSocket connection drops every 30–60 seconds behind a load balancer. Why?**
Load balancers and proxies have idle connection timeouts — they kill connections with no traffic after N seconds. Fix: send heartbeat pings. WebSocket protocol has a built-in ping/pong frame; the server can send pings every 20–30 seconds to keep the connection alive. Alternatively, configure the load balancer's idle timeout to be longer (AWS ALB default is 60s; set to 3600s for WS).

**Q: What is the browser limit for simultaneous SSE connections?**
With HTTP/1.1: 6 connections per origin (shared with other requests). If you open 7 SSE streams to the same origin, the 7th blocks until one closes. With HTTP/2: no per-origin limit on streams — all SSE connections share one TCP connection.

**Q: How would you implement "exactly once" message delivery over WebSocket?**
The receiver sends an acknowledgment message back to the sender with the message ID. The sender retains the message in a pending queue until the ack arrives. If no ack arrives within a timeout, resend. The receiver must also be idempotent (ignore duplicate IDs). This is the pattern used by Socket.IO's `emit(..., callback)` acknowledgments and MQTT QoS 1.
