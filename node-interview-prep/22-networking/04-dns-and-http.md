# DNS & HTTP

DNS translates human-readable names to IP addresses. HTTP is how browsers and servers talk. Both run on top of TCP (mostly) and are the backbone of the web.

---

## DNS — Domain Name System

DNS is a distributed, hierarchical database. No single server holds all mappings — lookups are delegated across a tree of authoritative servers.

### DNS Hierarchy

```
                    . (root)
                   / \
                .com  .io  .org  ...
               /    \
           google   amazon
          /      \
        www      mail
```

Every domain name ends with a dot (implicit root): `www.google.com.`

### DNS Resolution — Full Walk

When you type `www.github.com` for the first time:

```
Browser cache          → miss
OS cache / /etc/hosts  → miss
Recursive resolver      → (your ISP or 8.8.8.8)
   |
   ├─→ Root nameserver (.)
   │       "I don't know .com, but here are the .com TLD servers"
   │
   ├─→ .com TLD nameserver
   │       "I don't know github.com, but here's github's authoritative NS"
   │
   └─→ github.com authoritative nameserver
           "www.github.com → 140.82.121.4" ✓

Recursive resolver caches result (TTL) → returns to client
```

```
Client → Recursive Resolver → Root NS → TLD NS → Authoritative NS
                           ←──────────────────────────────────────
                                        answer + TTL
```

### DNS Record Types

| Record | Purpose | Example |
|---|---|---|
| **A** | IPv4 address | `github.com → 140.82.121.4` |
| **AAAA** | IPv6 address | `github.com → 2606:50c0:8000::154` |
| **CNAME** | Alias to another name | `www → github.com` |
| **MX** | Mail exchange (priority) | `github.com → aspmx.l.google.com (10)` |
| **TXT** | Arbitrary text (SPF, DKIM, verification) | `"v=spf1 include:..."` |
| **NS** | Nameserver for zone | `github.com → ns1.p16.dynect.net` |
| **SOA** | Zone authority (serial, refresh, retry) | Start of Authority |
| **PTR** | Reverse DNS (IP → name) | `4.121.82.140.in-addr.arpa → github.com` |
| **SRV** | Service location (host + port) | `_http._tcp.example.com → 10 5 80 web.example.com` |
| **CAA** | Certificate authority allowed | `issue "letsencrypt.org"` |

### TTL (Time-To-Live)

Cached by resolvers for TTL seconds. Short TTL = faster failover, more DNS queries. Long TTL = fewer queries, slower propagation.

```
; Common TTLs
3600    ; 1 hour — normal records
300     ; 5 min — during migrations
86400   ; 24 hours — stable infrastructure
60      ; 1 min — during incident failover
```

### Query with `dig`

```bash
dig www.github.com              # A record lookup
dig www.github.com AAAA         # IPv6
dig github.com MX               # Mail servers
dig github.com NS               # Name servers
dig +short github.com           # IP only
dig @8.8.8.8 github.com         # Use specific resolver
dig +trace github.com           # Show full resolution chain
nslookup github.com             # Windows-friendly alternative
```

---

## HTTP — HyperText Transfer Protocol

### HTTP/1.1

Text-based protocol, request/response over TCP.

```
GET /api/users HTTP/1.1
Host: api.example.com
Accept: application/json
Authorization: Bearer eyJhbGc...
Connection: keep-alive

```

```
HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 85
Cache-Control: max-age=300

{"users": [...]}
```

**Persistent connections** (`Connection: keep-alive`): reuse TCP connection across requests. Default in HTTP/1.1. Without it, every request needs a new 3-way handshake.

**Pipelining** (HTTP/1.1): send multiple requests without waiting for responses. Rarely used — head-of-line blocking: responses must arrive in order.

### HTTP/2

Binary framing (not text). Multiplexed streams over a single TCP connection. Header compression (HPACK). Server push.

```
Single TCP connection
  Stream 1: GET /index.html
  Stream 3: GET /style.css
  Stream 5: GET /app.js
  ← responses interleaved, no HOL at HTTP level
```

**HPACK compression**: headers deduplicated using a static + dynamic table. `:method: GET` → index 2 (1 byte vs 14 bytes).

**Server push**: server sends resources proactively before client requests them. Rarely used now (CDNs and `<link rel=preload>` are better).

Still suffers from TCP-level HOL blocking.

### HTTP/3 (QUIC)

Same semantics as HTTP/2 but over QUIC (UDP). No TCP HOL blocking. Faster connection establishment (0-RTT for known servers). See TCP/UDP section for QUIC details.

### HTTP Status Codes

```
1xx — Informational
  100 Continue
  101 Switching Protocols (WebSocket upgrade)

2xx — Success
  200 OK
  201 Created
  204 No Content
  206 Partial Content (range requests)

3xx — Redirection
  301 Moved Permanently (cache the redirect)
  302 Found (temporary — don't cache)
  304 Not Modified (conditional GET, use cache)
  307 Temporary Redirect (preserve method)
  308 Permanent Redirect (preserve method)

4xx — Client Error
  400 Bad Request
  401 Unauthorized (not authenticated)
  403 Forbidden (authenticated but not allowed)
  404 Not Found
  405 Method Not Allowed
  409 Conflict
  410 Gone (permanently deleted)
  422 Unprocessable Entity (validation error)
  429 Too Many Requests (rate limit)

5xx — Server Error
  500 Internal Server Error
  502 Bad Gateway (upstream server error)
  503 Service Unavailable (overloaded/down)
  504 Gateway Timeout (upstream timeout)
```

### HTTP Methods

| Method | Idempotent | Safe | Body | Use |
|---|---|---|---|---|
| GET | Yes | Yes | No | Retrieve resource |
| HEAD | Yes | Yes | No | GET but response body omitted |
| POST | No | No | Yes | Create / trigger action |
| PUT | Yes | No | Yes | Replace resource entirely |
| PATCH | No | No | Yes | Partial update |
| DELETE | Yes | No | No | Remove resource |
| OPTIONS | Yes | Yes | No | CORS preflight, list methods |

**Safe**: no side effects. **Idempotent**: same result if called once or N times.

---

## HTTPS & TLS

HTTPS = HTTP over TLS. TLS provides:
- **Confidentiality** — encrypted payload
- **Integrity** — tamper detection (HMAC)
- **Authentication** — server presents a certificate signed by a trusted CA

### TLS 1.3 Handshake (1-RTT)

```
Client                              Server
  |── ClientHello ───────────────>|
  |   (TLS version, cipher suites,|
  |    client random, key_share)   |
  |                                |
  |<─ ServerHello ────────────────|
  |<─ {Certificate} ──────────────|  ← encrypted from here
  |<─ {CertificateVerify} ────────|
  |<─ {Finished} ─────────────────|
  |                                |
  |── {Finished} ─────────────────>|
  |── {Application Data} ─────────>|  ← 1 RTT total
```

Key improvements in TLS 1.3 over 1.2:
- Removed RSA key exchange (forward secrecy only via ECDHE)
- Reduced cipher suites to 5 (removed weak ones)
- 1-RTT handshake (was 2-RTT in 1.2)
- 0-RTT session resumption (with replay-attack caveats)

### Certificate Chain

```
Root CA (DigiCert, Let's Encrypt, etc.)
    └── Intermediate CA
            └── Your certificate (github.com)
```

Browser validates chain up to a trusted root CA stored in OS/browser trust store.

### HSTS (HTTP Strict Transport Security)

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

Tells browser: never connect to this domain over HTTP. Prevents downgrade attacks.

---

## Caching

### HTTP Cache Headers

```
# Response headers (server → client)
Cache-Control: max-age=3600            # cache for 1 hour
Cache-Control: no-cache                # must revalidate before using cached copy
Cache-Control: no-store                # never cache (sensitive data)
Cache-Control: private                 # browser cache only, not CDN
Cache-Control: public, max-age=86400   # CDN + browser, 24h
ETag: "686897696a7c876b7e"             # fingerprint of resource
Last-Modified: Wed, 21 Oct 2024 07:28:00 GMT

# Request headers (browser → server)
If-None-Match: "686897696a7c876b7e"    # → 304 if unchanged
If-Modified-Since: Wed, 21 Oct 2024 07:28:00 GMT
```

### Conditional GET Flow

```
Browser          Server
  |── GET /logo.png ──────────>|
  |<─ 200 OK (ETag: "abc123") ─|
  |
  [1 hour later]
  |── GET /logo.png ──────────>|
  |   If-None-Match: "abc123"  |
  |<─ 304 Not Modified ────────|  ← no body, bandwidth saved
  |   (use cached copy)        |
```

---

## Content Negotiation

Client tells server what formats it accepts:

```
Accept: application/json, text/html;q=0.9, */*;q=0.8
Accept-Language: en-US,en;q=0.9
Accept-Encoding: gzip, br, zstd
```

Server responds with what it used:

```
Content-Type: application/json; charset=utf-8
Content-Language: en
Content-Encoding: gzip
```

---

## WebSockets

Full-duplex bidirectional over a single TCP connection. Starts as HTTP, upgrades.

### Upgrade Handshake

```
Client → Server (HTTP):
GET /ws HTTP/1.1
Host: example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13

Server → Client:
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

After 101, the connection is a raw WebSocket — no more HTTP. Either side can send frames at any time.

```javascript
// Node.js server (ws library)
import { WebSocketServer } from 'ws';
const wss = new WebSocketServer({ port: 8080 });
wss.on('connection', ws => {
  ws.on('message', data => ws.send(`echo: ${data}`));
});

// Browser
const ws = new WebSocket('wss://example.com/ws');
ws.onmessage = e => console.log(e.data);
ws.send('hello');
```

---

## Server-Sent Events (SSE)

One-way: server → client. Simpler than WebSockets for push notifications, streaming.

```
GET /events HTTP/1.1
Accept: text/event-stream

HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache

data: {"update": "job queued"}

data: {"update": "job started"}
id: 42
event: progress
data: {"pct": 50}

```

Client API:
```javascript
const es = new EventSource('/events');
es.onmessage = e => console.log(JSON.parse(e.data));
es.addEventListener('progress', e => console.log(e.data));
```

Reconnects automatically if connection drops (browser uses `Last-Event-ID` header).

---

## Common Interview Questions

**Q: What happens when you type a URL and press Enter?**

1. Browser checks cache (DNS cache, connection cache)
2. DNS resolution: recursive resolver → root → TLD → authoritative NS → IP
3. TCP connection: 3-way handshake to server IP on port 443
4. TLS handshake: negotiate cipher suite, exchange keys, verify certificate
5. HTTP request sent: `GET / HTTP/2 Host: example.com ...`
6. Server processes request, returns HTTP response
7. Browser parses HTML, builds DOM, fetches sub-resources (CSS, JS, images)
8. Render: CSSOM, layout, paint, composite

**Q: Difference between 301 and 302?**

301 is permanent — browsers cache it indefinitely (without Expires header), and search engines transfer link equity to the new URL. 302 is temporary — browsers do not cache it by default, and the original URL remains canonical for search engines. Use 308/307 if you need to preserve HTTP method (POST → POST instead of POST → GET).

**Q: What is the difference between `no-cache` and `no-store`?**

`no-cache` means "you can cache it but must revalidate before using it" — the browser sends a conditional GET (`If-None-Match`) and gets 304 if unchanged. `no-store` means "never cache this at all" — used for sensitive data like banking pages. `no-cache` is usually preferred as it still allows the 304 fast path.

**Q: How does TLS prevent man-in-the-middle attacks?**

The server presents a certificate signed by a trusted Certificate Authority (CA). The CA's root certificate is pre-installed in the OS/browser. The client verifies the chain: server cert signed by intermediate CA, intermediate signed by root CA, root in trust store. The certificate also contains the domain name — browser checks it matches the hostname. An attacker can't forge this without compromising a CA's private key.

**Q: HTTP/2 vs HTTP/3?**

HTTP/2 multiplexes streams over one TCP connection, solving HTTP/1.1 head-of-line blocking, but still has TCP-level HOL blocking: if one TCP segment is lost, all streams stall. HTTP/3 uses QUIC over UDP, implementing per-stream reliability in userspace — a lost packet blocks only its stream. HTTP/3 also enables 0-RTT for known servers and connection migration (changing IPs without reconnecting).

---

## Links to Refer

- [How DNS Works (comic)](https://howdns.works/)
- [RFC 2616 — HTTP/1.1](https://datatracker.ietf.org/doc/html/rfc2616)
- [RFC 9114 — HTTP/3](https://datatracker.ietf.org/doc/html/rfc9114)
- [SSL Labs — TLS Best Practices](https://github.com/ssllabs/research/wiki/SSL-and-TLS-Deployment-Best-Practices)
- [Julia Evans — HTTP zine](https://jvns.ca/blog/2019/09/12/new-zine-on-http/)
