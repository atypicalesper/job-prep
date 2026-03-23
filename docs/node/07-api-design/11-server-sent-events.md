# Server-Sent Events (SSE)

## What is SSE?

SSE is a **one-way, server-to-client** streaming protocol over a single persistent HTTP connection. The server pushes data whenever it wants; the client never sends messages back on the same connection.

```
Client ──── GET /events ────────────────▶ Server
       ◀─── data: hello\n\n ────────────
       ◀─── data: world\n\n ────────────
       ◀─── data: {"score":42}\n\n ──── (connection stays open forever)
```

**Wire format** — plain text, `text/event-stream` MIME type:

```
id: 123
event: score-update
data: {"home":3,"away":1}
retry: 3000

data: simple message (no id, no event type)

```

Each field ends with `\n`. Each **message** ends with `\n\n` (blank line).

---

## Browser EventSource API

```js
const es = new EventSource('/api/events');

// Default unnamed events
es.onmessage = (e) => console.log(e.data);

// Named events (matches `event: score-update` in stream)
es.addEventListener('score-update', (e) => {
  const { home, away } = JSON.parse(e.data);
  render(home, away);
});

// Lifecycle
es.onopen  = () => console.log('connected');
es.onerror = (e) => {
  if (es.readyState === EventSource.CLOSED) {
    console.log('connection closed');
  }
};

// Clean up
es.close();
```

### Built-in auto-reconnect

The browser **automatically reconnects** after a disconnect, sending `Last-Event-ID` header so the server can resume from the right position.

```
GET /events
Last-Event-ID: 123
```

---

## Node.js Server Implementation

### Express

```js
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering

  res.write(':ok\n\n'); // comment — keeps connection alive, no event fired

  let id = 0;

  const interval = setInterval(() => {
    id++;
    res.write(`id: ${id}\n`);
    res.write(`event: tick\n`);
    res.write(`data: ${JSON.stringify({ ts: Date.now() })}\n\n`);
  }, 1000);

  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});
```

### With Redis pub/sub (fan-out to multiple clients)

```js
import { createClient } from 'redis';

const sub = createClient();
await sub.connect();

const clients = new Set<Response>();

app.get('/events', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.write(':connected\n\n');

  clients.add(res);

  req.on('close', () => clients.delete(res));
});

// Publisher (called whenever data changes)
await sub.subscribe('updates', (msg) => {
  const payload = `data: ${msg}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
});
```

---

## SSE vs WebSockets vs Long Polling

| Feature | SSE | WebSocket | Long Polling |
|---|---|---|---|
| Direction | Server → Client only | Bidirectional | Server → Client |
| Protocol | HTTP/1.1 or HTTP/2 | Upgrade to ws:// | HTTP |
| Auto-reconnect | ✅ Built-in | ❌ Manual | Manual |
| Load balancer friendly | ✅ (sticky not required for HTTP/2) | ⚠️ Needs sticky or Redis | ✅ |
| Binary data | ❌ Text only | ✅ | ✅ (base64) |
| Browser support | ✅ All modern (IE polyfill needed) | ✅ All modern | ✅ All |
| Max connections (HTTP/1.1) | 6 per domain | Unlimited | 6 per domain |
| Overhead per message | Low | Lowest | High (new request each time) |

**Choose SSE when:**
- You only need server → client push (notifications, live feeds, AI token streaming)
- You want simplicity — no library, no handshake
- You're behind a standard HTTP reverse proxy (nginx, Cloudflare)

**Choose WebSockets when:**
- You need bidirectional real-time (chat, collaborative editing, multiplayer games)
- You need binary data at high frequency

---

## HTTP/2 Multiplexing Advantage

With **HTTP/1.1**, browsers cap connections per origin at ~6. SSE burns one connection. Multiple SSE streams from same origin compete.

With **HTTP/2**, all SSE streams share a single TCP connection via multiplexing — the 6-connection limit is irrelevant.

```
HTTP/1.1:  tab1-SSE | tab2-SSE | tab3-SSE → 3 of your 6 connections gone
HTTP/2:    tab1-SSE + tab2-SSE + tab3-SSE → all multiplexed on 1 connection
```

---

## Nginx Configuration

SSE requires disabling buffering — otherwise nginx buffers the stream until the buffer fills, defeating real-time:

```nginx
location /events {
  proxy_pass          http://backend;
  proxy_http_version  1.1;
  proxy_set_header    Connection '';
  proxy_buffering     off;
  proxy_cache         off;
  proxy_read_timeout  86400s; # 24h — don't time out long-lived connections
  chunked_transfer_encoding on;
}
```

---

## Handling Missed Events (Resume)

```js
// Server — track events by ID
const eventLog: Map<number, string> = new Map();
let globalId = 0;

function broadcast(data: object) {
  globalId++;
  const msg = `id: ${globalId}\ndata: ${JSON.stringify(data)}\n\n`;
  eventLog.set(globalId, msg);
  // prune old events
  if (eventLog.size > 1000) eventLog.delete(eventLog.keys().next().value);
  for (const client of clients) client.write(msg);
}

app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');

  const lastId = Number(req.headers['last-event-id'] ?? 0);

  // Replay missed events
  for (const [id, msg] of eventLog) {
    if (id > lastId) res.write(msg);
  }

  clients.add(res);
  req.on('close', () => clients.delete(res));
});
```

---

## Retry Field

```
retry: 5000\n\n
```

Tells the browser to wait 5 seconds before reconnecting (default is ~3s). Useful for exponential backoff on the server side.

---

## Authentication with SSE

`EventSource` doesn't support custom headers — you can't do `Authorization: Bearer ...`. Three common workarounds:

```js
// 1. Token in query param (simple, but token visible in logs)
new EventSource(`/events?token=${accessToken}`);

// 2. Cookie-based auth (works if SSE endpoint is same-origin)
// Set-Cookie: session=... HttpOnly — browser sends automatically

// 3. First POST to get a one-time token, then use it in SSE URL
const { token } = await fetch('/events/auth', { method: 'POST' }).then(r => r.json());
new EventSource(`/events?ot=${token}`);
```

---

## Real-World Use Cases

| Use Case | Why SSE? |
|---|---|
| AI chat streaming (token-by-token) | Simple server push, no client messages needed |
| Live sports scores | One-way data, auto-reconnect handles drops |
| Dashboard metrics | Periodic pushes, HTTP/2 multiplexing |
| Notifications (alerts, inbox) | Lightweight, survives proxy restarts with Last-Event-ID |
| Build/CI log streaming | Server pushes log lines as they appear |

---

## Interview Q&A

**Q: Why use SSE instead of WebSockets for AI chat streaming?**

SSE is simpler — it's plain HTTP so it works through any standard proxy without configuration. The client never needs to send anything after the initial prompt (which is a separate POST), so bidirectionality adds zero value. Auto-reconnect with `Last-Event-ID` means dropped connections resume automatically.

**Q: SSE limits you to 6 connections per origin in HTTP/1.1 — how do you work around it?**

Three options: (1) Use HTTP/2 — all streams multiplex over one TCP connection so the limit doesn't apply. (2) Use a single SSE connection and multiplex different data types via `event:` field. (3) Use a shared worker — a single connection in a SharedWorker broadcasts to all tabs on the same origin via `postMessage`.

**Q: How do you scale SSE across multiple server instances?**

Each server only knows about its own connected clients. When a data update happens on server A, clients on server B never get it. Fix with a pub/sub layer (Redis, Kafka) — every server subscribes to the same channel; when any instance broadcasts, all connected clients receive it regardless of which instance they're connected to.

**Q: EventSource gives you no way to pass headers. How do you authenticate SSE in a JWT-based API?**

Options in order of preference: cookie-based sessions (browser sends automatically, works same-origin), one-time token (POST to exchange JWT for a short-lived opaque token, pass in query string, invalidate on first use), or a reverse proxy that extracts the cookie/token before passing to the SSE handler.
