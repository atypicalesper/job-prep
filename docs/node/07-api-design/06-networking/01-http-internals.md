# HTTP Internals — HTTP/1.1, HTTP/2, HTTP/3

---

## HTTP/1.1 — The Baseline

### Request/Response Structure

```
Client → TCP handshake (SYN, SYN-ACK, ACK) → TLS handshake → HTTP request

GET /api/users HTTP/1.1
Host: api.example.com
Connection: keep-alive
Accept: application/json
Authorization: Bearer eyJhb...
User-Agent: node-fetch/3.0
Accept-Encoding: gzip, deflate, br

───────────────────────────────────────────────────────

HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 128
Cache-Control: max-age=60
ETag: "abc123"
Connection: keep-alive

{"users": [...]}
```

### Keep-Alive — Connection Reuse

```
Without keep-alive (HTTP/1.0 default):
  req1: TCP open → request → response → TCP close
  req2: TCP open → request → response → TCP close
  req3: TCP open → request → response → TCP close
  Cost: 3 × (TCP + TLS handshake) ← expensive

With keep-alive (HTTP/1.1 default):
  TCP open → req1 → res1 → req2 → res2 → req3 → res3 → TCP close
  Cost: 1 × (TCP + TLS handshake)
```

```javascript
// Node.js http.Agent controls connection pooling:
import https from 'https';

const agent = new https.Agent({
  keepAlive: true,           // reuse connections
  maxSockets: 10,            // max concurrent connections per host
  maxFreeSockets: 5,         // idle connections to keep alive
  keepAliveMsecs: 60_000,    // how long to keep idle connection
  timeout: 30_000,
});

const response = await fetch('https://api.example.com/data', {
  agent,  // reuse connection for subsequent requests
});

// Default agent has keepAlive: false — creates a new connection every time!
// For high-throughput apps, always pass a custom agent.
```

### Head-of-Line Blocking in HTTP/1.1

```
HTTP/1.1 pipelining (send multiple requests without waiting for response):
  Client: → req1 → req2 → req3
  Server: → res1 → res2 → res3  (MUST respond in order)

Problem: If res1 is slow, res2 and res3 wait even if they're ready.
This is HEAD-OF-LINE blocking at the HTTP layer.

Workaround: browsers open 6 concurrent TCP connections per domain.
CDN sharding (assets.1.example.com, assets.2.example.com) to bypass limit.
```

---

## HTTP/2 — Multiplexing Over One Connection

### Key Improvements Over HTTP/1.1

```
1. Binary framing layer — data split into frames (not plain text)
2. Multiplexing — multiple requests/responses on ONE TCP connection, interleaved
3. Header compression (HPACK) — headers sent as indexed table diffs, not full text
4. Server Push — server can send resources proactively (before client asks)
5. Stream prioritization — client can signal which streams are more important
6. Single TCP connection per origin — fewer handshakes
```

### Multiplexing — No Head-of-Line Blocking (at HTTP layer)

```
HTTP/1.1: 3 requests need 3 connections (or pipeline and wait):
  conn1: req1 ──────────── res1
  conn2: req2 ──── res2
  conn3: req3 ── res3

HTTP/2: 3 requests over ONE connection, interleaved frames:
  conn:  [req1 frame] [req2 frame] [req3 frame] [res3] [res2] [res1 frame] [res1 frame]

  Response order doesn't matter — client matches frames by stream ID.
```

### HPACK Header Compression

```
First request:
  Client sends full headers:
    :method GET
    :path /api/users
    :scheme https
    :authority api.example.com
    authorization: Bearer abc123
    user-agent: node-fetch
  Server builds a header table (index 1-N for each header seen)

Second request to same origin:
  Client sends ONLY changed headers + index references:
    :path /api/orders  (changed)
    (all others referenced by index — 1-2 bytes each instead of full string)

  Savings: 70-85% reduction in header size for typical APIs
```

### HTTP/2 in Node.js

```javascript
import http2 from 'http2';
import { readFileSync } from 'fs';

// HTTP/2 server (requires TLS — browsers won't use h2 without HTTPS):
const server = http2.createSecureServer({
  key:  readFileSync('./server.key'),
  cert: readFileSync('./server.crt'),
});

server.on('stream', (stream, headers) => {
  const path = headers[':path'];
  const method = headers[':method'];

  if (method === 'GET' && path === '/api/data') {
    stream.respond({
      ':status': 200,
      'content-type': 'application/json',
    });
    stream.end(JSON.stringify({ message: 'hello h2' }));
  }
});

server.listen(8443);

// ─── Server Push — send assets before the client asks ───────────────────
server.on('stream', (stream, headers) => {
  if (headers[':path'] === '/') {
    // Push CSS before client requests it
    stream.pushStream({ ':path': '/style.css' }, (err, pushStream) => {
      if (!err) {
        pushStream.respond({ ':status': 200, 'content-type': 'text/css' });
        pushStream.end('body { margin: 0; }');
      }
    });

    stream.respond({ ':status': 200, 'content-type': 'text/html' });
    stream.end('<html>...</html>');
  }
});

// ─── HTTP/2 client ────────────────────────────────────────────────────────
const client = http2.connect('https://api.example.com');

const req = client.request({
  ':method': 'GET',
  ':path': '/api/users',
  'authorization': 'Bearer token',
});

req.on('response', (headers) => {
  console.log('status:', headers[':status']);
});

let data = '';
req.on('data', chunk => data += chunk);
req.on('end', () => {
  console.log(JSON.parse(data));
  client.close();
});
req.end();
```

### HTTP/2 Still Has Head-of-Line Blocking — At TCP Layer

```
HTTP/2 solves HOL blocking at the HTTP layer.
But it runs over ONE TCP connection.

TCP guarantees ordered delivery. If a packet is lost:
  All streams in that connection STALL waiting for the retransmit,
  even streams whose data already arrived.

This is TCP-level head-of-line blocking.
HTTP/3 solves this by using QUIC (UDP-based).
```

---

## HTTP/3 — QUIC-Based Transport

```
HTTP/3 = HTTP/2 semantics + QUIC transport (replaces TCP + TLS)

QUIC runs over UDP, handles:
  - Multiplexing without HOL blocking (each stream is independent)
  - Built-in TLS 1.3 (0-RTT connection establishment)
  - Connection migration (IP change doesn't drop connection — mobile!)
  - Forward error correction

Connection establishment:
  HTTP/1.1 over TLS:  TCP SYN + TLS handshake = 3 round trips minimum
  HTTP/2 over TLS:    Same — 2-3 round trips (TLS 1.3 = 1 RTT)
  HTTP/3 over QUIC:   0-RTT for returning clients (sends data with first packet)
```

---

## TLS/SSL Handshake

```
TLS 1.2 (full handshake — 2 RTTs):
  1. Client → ClientHello (supported cipher suites, random nonce)
  2. Server → ServerHello (chosen cipher, certificate, random nonce)
  3. Client → verifies certificate, sends PreMasterSecret encrypted with server's public key
  4. Server → decrypts with private key, both sides derive session keys
  5. Both → send Finished (verify handshake integrity)

TLS 1.3 (1 RTT):
  1. Client → ClientHello + key_share (DH public key guess)
  2. Server → ServerHello + key_share + certificate + Finished + encrypted data
  3. Client → Finished + first application data

  0-RTT (session resumption): client sends data in first packet using session ticket

Key concepts:
  Certificate: server's public key + identity, signed by a CA
  CA (Certificate Authority): trusted third party (Let's Encrypt, DigiCert)
  SNI (Server Name Indication): TLS extension so server knows which cert to send
    (multiple virtual hosts on one IP need SNI)
  HSTS: HTTP Strict Transport Security — browser always uses HTTPS
  Certificate pinning: client only accepts specific cert/CA (mobile apps)
```

```javascript
// Node.js HTTPS server with modern TLS config:
import https from 'https';

const server = https.createServer({
  key:  readFileSync('./server.key'),
  cert: readFileSync('./server.crt'),
  // Disable old TLS versions:
  minVersion: 'TLSv1.2',
  // Prefer server cipher order:
  honorCipherOrder: true,
  // Modern cipher suite (no RC4, no export grade):
  ciphers: [
    'TLS_AES_256_GCM_SHA384',
    'TLS_CHACHA20_POLY1305_SHA256',
    'ECDHE-RSA-AES256-GCM-SHA384',
  ].join(':'),
}, app);

// Check TLS details of incoming connection:
server.on('secureConnection', (socket) => {
  console.log('TLS version:', socket.getProtocol());  // 'TLSv1.3'
  console.log('Cipher:', socket.getCipher());
});
```

---

## HTTP Methods — Idempotency and Safety

```
Method      Safe    Idempotent   Body    Use
──────────────────────────────────────────────────────────────────
GET         ✓       ✓            No      Read resource
HEAD        ✓       ✓            No      Headers only (check existence/ETag)
OPTIONS     ✓       ✓            No      CORS preflight, discover methods
POST        ✗       ✗            Yes     Create / non-idempotent actions
PUT         ✗       ✓            Yes     Full replace (idempotent: same result)
PATCH       ✗       ✗            Yes     Partial update (may not be idempotent)
DELETE      ✗       ✓            Maybe   Delete (idempotent: 2nd delete = 404)

Safe = no side effects (can be cached, prefetched)
Idempotent = multiple identical requests = same server state
  PUT /users/1 { name: "Alice" } ×3 → same as ×1
  POST /users { name: "Alice" } ×3 → creates 3 users
```

---

## HTTP Status Codes — The Full Picture

```
2xx Success:
  200 OK                  — standard success
  201 Created             — POST created a resource (return Location header)
  202 Accepted            — async processing started (not done yet)
  204 No Content          — success but no body (DELETE, some PATCHes)
  206 Partial Content     — Range request (video streaming)

3xx Redirect:
  301 Moved Permanently   — update bookmarks/cache (GET becomes GET)
  302 Found               — temporary (GET becomes GET) — most browsers follow
  303 See Other           — redirect to GET after POST (PRG pattern)
  304 Not Modified        — conditional GET, use cached version (ETag matched)
  307 Temporary Redirect  — preserve HTTP method (POST stays POST)
  308 Permanent Redirect  — preserve HTTP method + update bookmarks

4xx Client Error:
  400 Bad Request         — malformed request / validation failure
  401 Unauthorized        — not authenticated (misleading name) — send credentials
  403 Forbidden           — authenticated but not authorized
  404 Not Found           — resource doesn't exist
  405 Method Not Allowed  — e.g., GET on endpoint that only accepts POST
  408 Request Timeout     — client too slow to send body
  409 Conflict            — state conflict (optimistic locking fail, duplicate)
  410 Gone                — permanently deleted (vs 404 which could be temp)
  413 Payload Too Large   — request body exceeds limit
  422 Unprocessable Entity— semantic validation error (valid JSON but wrong data)
  429 Too Many Requests   — rate limited (include Retry-After header)

5xx Server Error:
  500 Internal Server Error — generic, unhandled exception
  501 Not Implemented       — method not supported at all
  502 Bad Gateway           — upstream service returned invalid response
  503 Service Unavailable   — server overloaded or in maintenance (Retry-After)
  504 Gateway Timeout       — upstream service timed out
```

---

## Caching Headers

```javascript
// ─── Cache-Control directives ─────────────────────────────────────────────
// max-age=N: cache for N seconds
// s-maxage=N: CDN/shared cache TTL (overrides max-age for proxies)
// no-cache: must revalidate with server before using cached copy
// no-store: never cache (sensitive data)
// private: only browser cache, not CDN
// public: CDN can cache
// must-revalidate: when stale, MUST revalidate (don't serve stale on error)
// stale-while-revalidate=N: serve stale up to N seconds while fetching fresh

// Strong ETag: content hash
// Weak ETag: semantically equivalent (W/"abc")

// Server sends:
res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=60');
res.setHeader('ETag', '"abc123"');
res.setHeader('Last-Modified', new Date().toUTCString());

// Conditional requests from client:
// If-None-Match: "abc123"   → server returns 304 if ETag matches
// If-Modified-Since: date   → server returns 304 if not modified

// Express ETag middleware (built-in):
app.set('etag', 'strong'); // default — uses content hash

// Manual conditional check:
app.get('/api/data', (req, res) => {
  const data = getData();
  const etag = `"${hash(data)}"`;

  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end(); // Not Modified — no body sent
  }

  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json(data);
});
```

---

## Content Negotiation

```javascript
// Client sends Accept headers to specify preferred formats:
// Accept: application/json, text/html;q=0.9, */*;q=0.8
// Accept-Encoding: gzip, deflate, br
// Accept-Language: en-US,en;q=0.9

// Express compression middleware (gzip/brotli):
import compression from 'compression';
app.use(compression({
  level: 6,        // 0-9 (6 = good balance)
  threshold: 1024, // only compress responses > 1KB
  filter: (req, res) => {
    // Don't compress server-sent events
    if (req.headers['accept'] === 'text/event-stream') return false;
    return compression.filter(req, res);
  }
}));
```

---

## Common Interview Questions

**Q: What's the difference between HTTP/1.1 and HTTP/2?**
HTTP/2 uses binary framing, multiplexes multiple requests on one TCP connection (no HOL blocking at HTTP layer), compresses headers with HPACK, and supports server push. HTTP/1.1 sends plain text, requires 6 parallel connections to fake concurrency, and repeats headers on every request.

**Q: What is head-of-line blocking?**
In HTTP/1.1 pipelining, responses must come back in request order. A slow response blocks all subsequent ones. HTTP/2 solves this at the HTTP layer via multiplexing, but TCP itself still has HOL blocking (a lost packet stalls all streams). HTTP/3/QUIC solves it completely.

**Q: What happens during a TLS handshake?**
Client sends supported cipher suites. Server responds with its chosen cipher and certificate. Client verifies the certificate against trusted CAs, then both sides use Diffie-Hellman key exchange to derive a shared session key without transmitting it. TLS 1.3 does this in 1 RTT; TLS 1.2 needs 2 RTTs.

**Q: What is HSTS?**
HTTP Strict Transport Security. The server sends `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`. The browser remembers to always use HTTPS for that domain, even if the user types `http://`. Prevents SSL stripping attacks.

**Q: 401 vs 403?**
401 Unauthorized = not authenticated (no valid credentials, or token expired). Send credentials or re-authenticate.
403 Forbidden = authenticated but not authorized (you're logged in but lack permission).

**Q: When would you use 202 vs 201?**
201 = resource was created synchronously, include `Location` header pointing to new resource.
202 = request accepted, processing happens asynchronously (e.g., batch job started). Include a polling URL or job ID.

**Q: What is CORS and how does it work?**
Cross-Origin Resource Sharing. Browser enforces same-origin policy — JS can't call `api.other.com` from `app.mysite.com` by default.
- Simple requests: browser adds `Origin` header, server responds with `Access-Control-Allow-Origin`
- Preflighted requests: browser sends `OPTIONS` first asking permission (for non-simple methods/headers), server responds with allowed methods/headers, then browser sends actual request.
- Credentials: `Access-Control-Allow-Credentials: true` + specific origin (not `*`) to allow cookies.
