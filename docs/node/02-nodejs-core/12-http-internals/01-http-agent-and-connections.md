# Node.js HTTP Internals — Agent, Keep-Alive, and Connection Pooling

---

## How Node.js HTTP Works Under the Hood

Every outbound HTTP request from Node.js starts as a TCP socket. For HTTPS, a TLS handshake is layered on top of the TCP connection before the HTTP request bytes are sent. Without connection reuse, every single request pays this setup cost — roughly 3ms for TCP plus 50–100ms for TLS on a typical network. Node.js's `http.Agent` is the connection pool that amortises this cost: it maintains a set of idle sockets to each host and reuses them for subsequent requests. The difference between the default agent (`keepAlive: false`) and a keep-alive agent is the difference between paying the full handshake cost per request versus paying it once per connection lifetime. For a service making 100 req/s to a downstream HTTPS API, this can mean the difference between 10 seconds of handshake overhead per second (absurd) versus near zero.

```
Node.js HTTP client (http/https module) sits on top of net.Socket (TCP).

Without keep-alive:
  Request 1: TCP connect → TLS handshake → send → receive → TCP close
  Request 2: TCP connect → TLS handshake → send → receive → TCP close
  Each request pays full connection overhead (~100ms+ for HTTPS)

With keep-alive (HTTP/1.1 default):
  TCP connect → TLS handshake → request 1 → request 2 → request 3 → TCP close
  Connection reused: ~5-10ms per request after first

HTTP/2:
  One TCP connection, multiple streams multiplexed
  No head-of-line blocking per connection
  Node.js http2 module or undici for HTTP/2 client support
```

---

## http.Agent — Connection Pool

`http.Agent` is Node.js's built-in HTTP connection pool. It maintains a set of reusable TCP (and TLS) sockets to a given host, eliminating the handshake cost on subsequent requests. Without an agent — or with the default agent that has `keepAlive: false` — every single HTTP request pays the full TCP + TLS setup latency (~100–200ms for HTTPS). The agent is a singleton resource: create one per external service at startup and reuse it across all requests. Creating a new agent per request is one of the most common and expensive Node.js performance mistakes.

```javascript
const http = require('http');
const https = require('https');

// Default agent: keepAlive = false (creates new connection per request!)
// This is a major performance mistake in high-throughput services.

// ❌ Default behavior — new TCP connection per request:
fetch('https://api.example.com/users'); // each call creates new connection

// ✅ Custom agent with keep-alive:
const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,         // max concurrent sockets per host (default: Infinity!)
  maxFreeSockets: 10,     // max idle sockets to keep open (default: 256)
  keepAliveMsecs: 60_000, // how long to keep idle sockets (ms)
  timeout: 30_000,        // socket timeout
});

// Pass agent to requests:
const response = await fetch('https://api.example.com/users', {
  // @ts-ignore — agent is Node.js-specific, not in fetch spec
  agent,
});

// With node-fetch or axios:
import axios from 'axios';

const apiClient = axios.create({
  baseURL: 'https://api.example.com',
  httpsAgent: new https.Agent({
    keepAlive: true,
    maxSockets: 50,
    maxFreeSockets: 10,
  }),
  timeout: 10_000,
});

// Reuse the same axios instance — it reuses the agent and its connections.
```

---

## Understanding maxSockets

`maxSockets` is a per-host limit on the number of simultaneous open TCP connections. The default is `Infinity` — meaning under load your service could open thousands of connections to the same downstream server, overwhelming it. Setting a reasonable cap (10–100 depending on the target) causes excess requests to queue in `agent.requests` rather than opening new sockets, creating natural backpressure. The right value depends on the target server's connection limit and your service's concurrency needs; monitor `agent.requests` queue depth in production to tune it.

```javascript
// maxSockets: max concurrent connections TO A SINGLE HOST
// NOT max connections total (it's per-host)

const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 10, // at most 10 concurrent connections to api.example.com
});

// If you make 20 simultaneous requests to api.example.com:
// - 10 go immediately (use 10 sockets)
// - 10 queue and wait for a socket to free up
// Without maxSockets limit (Infinity): 20 connections created — overwhelms server

// ⚠️ Common mistake: creating a new Agent per request:
async function getUser(id) {
  const agent = new https.Agent({ keepAlive: true }); // ❌ new pool each time!
  return fetch(`/users/${id}`, { agent });
  // Previous agent's connections are abandoned
}

// ✅ Create agent once, reuse everywhere:
const globalAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });

async function getUser(id) {
  return fetch(`/users/${id}`, { agent: globalAgent }); // ✅ reuses pool
}
```

---

## Monitoring the Agent

An agent exposes live state through three properties: `sockets` (connections actively handling a request), `freeSockets` (idle connections kept alive), and `requests` (queued requests waiting for a free socket). Periodically logging these metrics tells you whether your pool is sized correctly. A long `requests` queue means `maxSockets` is too low and latency is building up. A large `freeSockets` count means `maxFreeSockets` is higher than needed, wasting memory and file descriptors. Instrument this in production alongside your APM to correlate pool saturation with latency spikes.

```javascript
// Inspect current pool state:
const agent = new https.Agent({ keepAlive: true, maxSockets: 10 });

setInterval(() => {
  console.log({
    // Active (in-use) sockets per host:
    sockets: Object.entries(agent.sockets).map(([host, sockets]) => ({
      host,
      count: sockets.length,
    })),
    // Free (idle) sockets per host:
    freeSockets: Object.entries(agent.freeSockets).map(([host, sockets]) => ({
      host,
      count: sockets.length,
    })),
    // Queued requests waiting for a socket:
    requests: Object.entries(agent.requests).map(([host, reqs]) => ({
      host,
      count: reqs.length,
    })),
  });
}, 5_000);

// Metrics to watch:
// - High requests queue → maxSockets too low (increase it)
// - High freeSockets → maxFreeSockets too high (reduce to save memory)
// - Zero reuse → keepAlive not working, check headers
```

---

## Undici — Modern HTTP Client (Node.js 18+)

Undici is the HTTP/1.1 and HTTP/2 client that powers Node.js's built-in `fetch`. Compared to the legacy `http`/`https` modules, it offers better throughput, a cleaner API, native HTTP/2 multiplexing support, and connection pooling built in by default. The `Pool` class manages a fixed number of connections to a single origin and is the direct replacement for hand-managing an `https.Agent`. If you are building a new service or replacing a custom HTTP client wrapper, prefer Undici (or `fetch` which uses it under the hood) over the legacy `http` module directly.

```javascript
// undici: the HTTP client used internally by Node.js fetch()
// Better performance than http module, HTTP/2 support, connection pooling built-in

import { request, Pool } from 'undici';

// Single request:
const { statusCode, headers, body } = await request('https://api.example.com/users', {
  method: 'GET',
  headers: { authorization: `Bearer ${token}` },
});
const data = await body.json();

// Connection pool:
const pool = new Pool('https://api.example.com', {
  connections: 10,         // number of connections in pool
  pipelining: 1,           // requests per connection (1 = no pipelining, safe)
  connect: {
    timeout: 10_000,       // connection timeout
    keepAliveTimeout: 60_000,
  },
});

// Use pool (connections are reused automatically):
const { statusCode, body } = await pool.request({
  path: '/users',
  method: 'GET',
});

// pool.close() on shutdown:
await pool.close();

// Built-in Node.js fetch uses undici under the hood (Node 18+):
// No agent needed — fetch manages its own undici pool
const res = await fetch('https://api.example.com/users');
```

---

## HTTPS and TLS Internals

Every HTTPS connection begins with a TLS handshake that authenticates the server and negotiates a session key. With keep-alive, this cost is paid once per connection lifetime and amortised across hundreds or thousands of requests. Without keep-alive, it is paid on every single request. For internal services using self-signed or private CA certificates, you must provide the CA certificate to the agent so Node.js can verify the server's identity — setting `rejectUnauthorized: false` disables all verification and is equivalent to having no TLS security at all. Mutual TLS (mTLS) adds client certificate authentication on top of server authentication, which is the standard for zero-trust internal service meshes.

```javascript
// TLS handshake adds ~100ms on first connection.
// With keep-alive: paid only once per connection (not per request).

// TLS session resumption: further reduces reconnect overhead
const agent = new https.Agent({
  keepAlive: true,
  // TLS session resumption is automatic when reusing connections
  // Sessions are cached by the TLS context
});

// Self-signed certs (dev/testing only — NEVER in production):
const agent = new https.Agent({
  rejectUnauthorized: false, // ⚠️ dangerous! disables cert verification
});

// ✅ Custom CA (for internal certificates):
const agent = new https.Agent({
  ca: fs.readFileSync('./internal-ca.pem'),
  // Validates server cert against this CA
});

// Mutual TLS (mTLS) — client presents a certificate:
const agent = new https.Agent({
  cert: fs.readFileSync('./client.pem'),
  key: fs.readFileSync('./client-key.pem'),
  ca: fs.readFileSync('./ca.pem'),
  rejectUnauthorized: true,
});
```

---

## Connection Timeouts vs Request Timeouts

There are three distinct timeout concepts that are commonly confused. The *connect timeout* limits how long to wait for the TCP handshake to complete — relevant when the target host is down or unreachable. The *socket idle timeout* fires if no data arrives on an already-open connection for the specified duration — it resets with each data chunk, so it detects stalled mid-stream responses but not slow-starting ones. The *request timeout* (via `AbortController`) is a total wall-clock budget from initiation to fully received response — the right tool for enforcing SLAs ("this downstream call must complete within 2 seconds, no matter what").

```javascript
// Three different timeouts to configure:

// 1. Connection timeout: how long to wait for TCP connection to establish
// 2. Socket timeout: how long to wait for data on an established connection
// 3. Request timeout: total time from request start to response complete

import { request } from 'undici';
import { AbortController } from 'node:abort-controller';

// Total request timeout with AbortController:
async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { statusCode, body } = await request(url, {
      signal: controller.signal,
    });
    return { statusCode, data: await body.json() };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// With http module — socket timeout:
const req = https.get('https://api.example.com/users', (res) => {
  // ...
});

req.setTimeout(10_000, () => {
  req.destroy(new Error('Request timed out'));
});

req.on('error', (err) => {
  console.error('Request error:', err.message);
});
```

---

## HTTP Keep-Alive Headers

Keep-alive connection reuse is negotiated by HTTP headers: both sides must agree. The client signals willingness with `Connection: keep-alive` (HTTP/1.1 default), and the server confirms with `Connection: keep-alive` and optionally a `Keep-Alive: timeout=N, max=M` header specifying how long to hold the socket open and how many requests to serve on it. Node.js's `https.Agent` handles this negotiation automatically when `keepAlive: true`. Understanding the headers lets you verify keep-alive is actually working (check the response headers in development) and diagnose cases where the server closes connections sooner than expected.

```javascript
// Keep-alive is negotiated via headers:
// Request:  Connection: keep-alive
// Response: Connection: keep-alive
//           Keep-Alive: timeout=60, max=1000

// Node.js http.Agent handles these automatically when keepAlive: true

// Verify keep-alive is working:
const agent = new https.Agent({ keepAlive: true });

// First request — will show 'Connection: keep-alive' in response headers
const res1 = await fetch('https://api.example.com/1', { agent });
console.log(res1.headers.get('connection')); // 'keep-alive'

// Second request — socket is reused (check with tcpdump or agent.sockets)

// If server sends 'Connection: close' → socket closed after this response
// regardless of agent configuration — server controls keep-alive
```

---

## Common Mistakes and Best Practices

The four most impactful mistakes with HTTP agents are: creating a new agent per request (defeats pooling), leaving `maxSockets` at `Infinity` (can overwhelm downstream servers), not calling `agent.destroy()` on shutdown (idle sockets keep the event loop alive and delay process exit), and creating one shared agent for all external services (obscures per-service tuning and monitoring). Treat each external service as a distinct dependency with its own agent, timeout configuration, and monitoring.

```javascript
// ❌ New agent per request:
async function callApi(path) {
  const agent = new https.Agent({ keepAlive: true });
  return fetch(path, { agent });
}

// ✅ Singleton agent:
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });
async function callApi(path) {
  return fetch(path, { agent: httpsAgent });
}

// ❌ maxSockets: Infinity (default!) — no connection limit:
// Under load, you can open thousands of connections, overwhelming the server

// ✅ Set appropriate limits based on server capacity and your needs

// ❌ Not closing the agent on graceful shutdown:
// Idle sockets keep the event loop alive, delaying process exit

// ✅ Destroy agent on shutdown:
process.on('SIGTERM', async () => {
  agent.destroy(); // closes all sockets immediately
  // or: wait for existing requests to finish, then destroy
});

// ❌ Sharing agents between services (different hosts):
// Agent pools are per-host, but mixing contexts is confusing

// ✅ One agent per external service:
const paymentsAgent = new https.Agent({ keepAlive: true, maxSockets: 20 });
const notificationsAgent = new https.Agent({ keepAlive: true, maxSockets: 10 });
```

---

## Interview Questions

**Q: Why is the default Node.js HTTP agent bad for production?**
A: The default agent has `keepAlive: false` — every request opens a new TCP + TLS connection. For HTTPS, that's a TCP 3-way handshake + TLS 1.3 handshake = ~100-200ms overhead per request. In a service making 1000 req/s, you're wasting significant latency and CPU just on connection setup. With `keepAlive: true`, connections are reused, paying the handshake cost once per connection lifetime.

**Q: What does `maxSockets` control and what happens when it's reached?**
A: `maxSockets` limits concurrent TCP connections per host. When all sockets are in use, new requests queue in `agent.requests` and wait for a socket to free up. This is backpressure at the connection pool level — it prevents overwhelming the destination server. Default is `Infinity` (no limit), which can create thousands of connections under load. A reasonable value is 10-100 depending on the target server's capacity.

**Q: What is the difference between `socket timeout` and `request timeout`?**
A: Socket timeout (`req.setTimeout`) fires if no data is received on the socket for the specified duration — resets on each data event, so a slow streaming response won't trigger it. Request timeout (via `AbortController`) is a total wall-clock limit from the moment the request is initiated to when the response is fully received. Use request timeout for SLA enforcement ("this call must complete in under 2 seconds"), socket timeout for detecting stalled connections.

**Q: When would you use HTTP/2 over HTTP/1.1?**
A: HTTP/2 multiplexes multiple requests over a single TCP connection — eliminates head-of-line blocking at the HTTP level and reduces connection overhead for many parallel requests. Best for: many concurrent requests to the same server (GraphQL subscriptions, microservice fan-out), browser → server (browsers already prefer HTTP/2), gRPC (always HTTP/2). HTTP/1.1 is still common for server-to-server when connection count is not the bottleneck or when proxies don't support HTTP/2. Use undici's `Pool` or `Client` with `allowH2: true` for HTTP/2 in Node.js.
