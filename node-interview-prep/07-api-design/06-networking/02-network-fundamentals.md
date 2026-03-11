# Network Fundamentals for Backend Engineers

---

## TCP vs UDP

```
TCP (Transmission Control Protocol):
  Connection-oriented — 3-way handshake before data
  Reliable delivery — retransmits lost packets
  Ordered delivery  — receiver reassembles in-order
  Flow control      — prevents fast sender overwhelming slow receiver
  Congestion control— backs off when network is congested
  Use for: HTTP, HTTPS, databases, SSH, email

UDP (User Datagram Protocol):
  Connectionless — no handshake, just send
  No guarantees  — packets can be lost, duplicated, reordered
  Low overhead   — no state, no retransmits, minimal headers
  Use for: DNS, video streaming, gaming, VoIP, QUIC (HTTP/3)

Why use UDP?
  - Some data is time-sensitive; old data is useless (video frame, game state)
  - Application-layer can handle retransmit if needed (more efficiently)
  - Multicast/broadcast only works with UDP
```

### TCP 3-Way Handshake

```
Client                    Server
  |                          |
  |──── SYN (seq=x) ────────>|   Client: "I want to connect, my seq starts at x"
  |<─── SYN-ACK (seq=y, ack=x+1) ──|   Server: "OK, my seq starts at y, I got your x"
  |──── ACK (ack=y+1) ──────>|   Client: "Got it, your seq y confirmed"
  |                          |
  |══════ data ══════════════|   Connection established
  |                          |
  |──── FIN ────────────────>|   4-way teardown (FIN, FIN-ACK, FIN, ACK)
```

```
TIME_WAIT state: after connection close, client waits 2×MSL (max segment lifetime ~60s)
before reusing port. This prevents delayed packets from old connection being
misinterpreted by new connection.

In high-connection-rate servers: TIME_WAIT accumulation can exhaust ports.
Fix: enable SO_REUSEADDR, tune tcp_fin_timeout, or use connection pooling.
```

---

## DNS Resolution — Step by Step

```
You type: api.example.com

1. Browser/OS checks local DNS cache
2. Check /etc/hosts
3. Query local resolver (router or ISP's DNS, e.g., 8.8.8.8)
4. Resolver queries Root nameserver: "Who handles .com?"
5. Root → "Ask TLD nameserver for .com" (a.gtld-servers.net)
6. Resolver queries .com TLD: "Who handles example.com?"
7. TLD → "Ask ns1.example.com" (authoritative nameserver)
8. Resolver queries ns1.example.com: "What is api.example.com?"
9. Authoritative → "It's 93.184.216.34, TTL 300"
10. Resolver caches result, returns to client

Total time: 50-200ms on first lookup, <1ms from cache

DNS record types:
  A     → IPv4 address (api.example.com → 1.2.3.4)
  AAAA  → IPv6 address
  CNAME → alias to another name (www.example.com → example.com)
  MX    → mail server
  TXT   → arbitrary text (SPF, DKIM, domain verification)
  NS    → nameserver for a domain
  SRV   → service location (host + port + priority — used by Kubernetes, SIP)
  PTR   → reverse DNS (IP → hostname)
```

```javascript
// dns.lookup vs dns.resolve — critical difference in Node.js:
import dns from 'dns';

// dns.lookup — uses OS resolver (respects /etc/hosts, /etc/resolv.conf)
// BLOCKING — runs in libuv thread pool
// Returns first result only
dns.lookup('example.com', (err, address, family) => {
  console.log(address); // '93.184.216.34'
});

// dns.resolve — uses Node.js async DNS resolver
// Non-blocking — uses OS async I/O
// Returns all records
dns.resolve4('example.com', (err, addresses) => {
  console.log(addresses); // ['93.184.216.34']
});

// Promises version:
const { promises: dnsPromises } = dns;
const addresses = await dnsPromises.resolve4('example.com');

// Get SRV records (used for service discovery):
const services = await dnsPromises.resolveSrv('_http._tcp.example.com');
// [{ name: 'service1.example.com', port: 8080, priority: 10, weight: 5 }]
```

---

## Load Balancing — Algorithms and Strategies

```
Layer 4 (Transport) Load Balancing:
  Operates on TCP/UDP level — sees IP:port only, not HTTP content
  Very fast (no packet inspection)
  Cannot route based on URL path or headers
  Examples: AWS NLB, HAProxy (TCP mode)

Layer 7 (Application) Load Balancing:
  Terminates TCP/TLS, inspects HTTP content
  Can route based on URL path, Host header, cookies
  Can do SSL termination, compression, WAF
  Slightly more overhead (TLS re-encryption to backend)
  Examples: AWS ALB, nginx, HAProxy (HTTP mode)

Algorithms:
  Round Robin:        requests go 1→2→3→1→2→3 in order (equal weight)
  Weighted RR:        server A gets 3x traffic of server B (capacity-based)
  Least Connections:  send to server with fewest active connections
  IP Hash:            hash client IP → same client always hits same server
  Random:             pick random server (with enough traffic ≈ round robin)
  Least Response Time: send to server with lowest avg latency

  Least Connections is best for heterogeneous requests (some slow, some fast).
  Round Robin is fine for uniform workloads.
  IP Hash needed for session affinity without distributed session store.
```

### Health Checks

```javascript
// nginx upstream health check config:
upstream api_servers {
  server api1.internal:3000;
  server api2.internal:3000;
  server api3.internal:3000;

  # Passive health check (built-in):
  # Mark server down after 3 failures in 10 seconds
  # Re-try after 30 seconds

  keepalive 32; // persistent connections to upstream
}

// Active health check (nginx Plus / HAProxy):
// Periodically GET /health, expect 200, remove from pool on failure
```

```javascript
// Express health endpoint (what load balancers poll):
app.get('/health', async (req, res) => {
  const checks = await Promise.allSettled([
    db.query('SELECT 1'),
    redis.ping(),
  ]);

  const dbOk    = checks[0].status === 'fulfilled';
  const redisOk = checks[1].status === 'fulfilled';

  const status = dbOk && redisOk ? 200 : 503;
  res.status(status).json({
    status: status === 200 ? 'ok' : 'degraded',
    db:    dbOk    ? 'ok' : 'error',
    redis: redisOk ? 'ok' : 'error',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});
```

---

## CDN — Content Delivery Networks

```
Origin server: your actual application server
Edge node (PoP): CDN server geographically close to user

Request flow:
  User in Tokyo → Tokyo CDN edge → cache hit? → return content
                                 → cache miss? → fetch from US origin → cache → return

Benefits:
  1. Latency: Tokyo user gets content from Tokyo, not US (10ms vs 200ms)
  2. Throughput: CDN handles static asset traffic, origin only handles dynamic
  3. DDoS protection: CDN absorbs large traffic spikes
  4. TLS termination at edge

Cache invalidation:
  TTL-based: edge caches for Cache-Control max-age seconds
  Purge API: manually invalidate specific paths (e.g., after deploy)
  Versioned URLs: /app.v3.js never needs invalidation (new file = new URL)
  Stale-while-revalidate: serve stale instantly, fetch fresh in background

What to CDN vs not:
  ✓ Static assets (JS, CSS, images, fonts)
  ✓ Mostly-static API responses (product catalog, public user profiles)
  ✓ Large file downloads
  ✗ Auth-gated content (per-user data)
  ✗ Frequently-changing real-time data
  ✗ POST/PUT/DELETE requests
```

---

## Proxies — Forward and Reverse

```
Forward Proxy (sits in front of CLIENTS):
  Client → Forward Proxy → Internet

  Client is aware of proxy.
  Uses: corporate filtering, privacy/anonymity (VPN-like), caching for clients
  Example: Squid, corporate firewalls

Reverse Proxy (sits in front of SERVERS):
  Client → Reverse Proxy → Backend servers

  Client is NOT aware — thinks it's talking to the real server.
  Uses: load balancing, SSL termination, caching, compression, routing
  Examples: nginx, HAProxy, Envoy, AWS ALB, Cloudflare

nginx as reverse proxy:
  server {
    listen 443 ssl;
    server_name api.example.com;

    ssl_certificate     /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    location /api/ {
      proxy_pass http://api_servers;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_connect_timeout 5s;
      proxy_read_timeout 30s;
    }

    location /static/ {
      root /var/www;
      expires 1y;
      add_header Cache-Control "public, immutable";
    }
  }

X-Forwarded-For: real IP header (proxy adds this — read in Node.js):
  app.set('trust proxy', 1); // trust first proxy
  req.ip // gives real client IP (not proxy IP)
```

---

## WebSockets at the Network Level

```
Upgrade handshake:
  Client sends regular HTTP request:
    GET /ws HTTP/1.1
    Host: api.example.com
    Upgrade: websocket
    Connection: Upgrade
    Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
    Sec-WebSocket-Version: 13

  Server responds:
    HTTP/1.1 101 Switching Protocols
    Upgrade: websocket
    Connection: Upgrade
    Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=  ← SHA1(key + magic)

  After this, the TCP connection is "hijacked" — no more HTTP framing.
  Raw WebSocket frames are sent directly.

WebSocket frame:
  FIN bit | opcode (text/binary/ping/pong/close) | MASK bit | payload length | payload

Ping/pong: heartbeat to keep connection alive through NAT/firewalls
  (idle TCP connections are killed by NAT after typically 30-300 seconds)
```

---

## Rate Limiting and Throttling — Network Level

```javascript
// Nginx rate limiting:
// limit_req_zone $binary_remote_addr zone=api:10m rate=100r/m;
// limit_req zone=api burst=20 nodelay;

// Application-level rate limiting with Redis (sliding window):
import { createClient } from 'redis';

async function rateLimiter(userId: string, limit = 100, windowMs = 60_000) {
  const now = Date.now();
  const windowStart = now - windowMs;
  const key = `ratelimit:${userId}`;

  const pipeline = redis.multi();
  pipeline.zRemRangeByScore(key, 0, windowStart);  // remove old entries
  pipeline.zCard(key);                              // count current window
  pipeline.zAdd(key, [{ score: now, value: String(now) }]); // add current
  pipeline.pExpire(key, windowMs);                 // TTL on the key

  const results = await pipeline.exec();
  const count = results[1] as number;

  return {
    allowed: count < limit,
    count,
    remaining: Math.max(0, limit - count - 1),
    resetAt: now + windowMs,
  };
}

// Middleware:
app.use(async (req, res, next) => {
  const { allowed, remaining } = await rateLimiter(req.ip);
  res.setHeader('X-RateLimit-Limit', 100);
  res.setHeader('X-RateLimit-Remaining', remaining);

  if (!allowed) {
    return res.status(429).json({
      error: 'Too Many Requests',
      retryAfter: 60,
    });
  }
  next();
});
```

---

## Common Interview Questions

**Q: What happens when you type a URL and press Enter?**
1. DNS lookup (local cache → /etc/hosts → local resolver → recursive lookup)
2. TCP 3-way handshake with server IP
3. TLS handshake (if HTTPS)
4. HTTP request sent
5. Server processes request, sends response
6. Browser parses HTML, discovers subresources (CSS/JS/images)
7. Parallel DNS+TCP+TLS for each new origin
8. Critical resources parsed/executed, page renders

**Q: What is a reverse proxy and why use it?**
A reverse proxy sits in front of backend servers and forwards client requests. Benefits: SSL termination (backend doesn't need TLS), load balancing, request routing, caching static assets, compression, rate limiting at the edge, hiding backend topology.

**Q: TCP vs UDP — when would you use UDP?**
UDP when: (1) speed matters more than reliability — live video/audio (late packet = useless), (2) app-level protocol handles retransmit better — QUIC/HTTP3, (3) broadcast needed, (4) simple one-shot queries where retransmit is just resending — DNS.

**Q: What is a CDN and how does cache invalidation work?**
CDN = geographically distributed cache servers (PoPs). Clients are routed to nearest PoP. Cache hit = fast. Cache miss = fetch from origin. Invalidation: let TTL expire (simple), call purge API (immediate), or use content-addressable URLs (hash in filename — never needs invalidation).

**Q: What is the difference between dns.lookup and dns.resolve in Node.js?**
`dns.lookup` uses the OS resolver — synchronous underneath, runs in libuv thread pool, respects `/etc/hosts`, returns one result. `dns.resolve` uses Node.js's own async DNS library — truly non-blocking, returns all records, bypasses `/etc/hosts`. For production, `dns.resolve` is generally preferable for its non-blocking behavior.

**Q: What is SNI?**
Server Name Indication — a TLS extension that lets the client say which hostname it's connecting to before the TLS handshake completes. This lets one IP address host multiple TLS-protected domains (virtual hosting). Without SNI, the server doesn't know which certificate to use until after TLS is established.
