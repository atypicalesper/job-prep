# DNS & HTTP

DNS translates human-readable names to IP addresses. HTTP is how browsers and servers talk. Both run on top of TCP (mostly) and are the backbone of the web.

---

## DNS — Domain Name System

DNS is a distributed, hierarchical database. No single server holds all mappings — lookups are delegated across a tree of authoritative servers.

### DNS Hierarchy

DNS is organized as a tree delegated from a single root. At the top are 13 sets of root nameservers that know which servers are authoritative for each top-level domain (`.com`, `.io`, `.org`). TLD nameservers know which servers are authoritative for each registered domain under them. Authoritative nameservers are the final authority for a specific domain — they hold the actual DNS records. No single entity controls the whole tree; each zone is independently administered, which is what makes DNS globally scalable and decentralized.

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

DNS resolution is recursive and cached at multiple levels. The browser checks its own cache first, then the OS resolver (which also checks `/etc/hosts`). If both miss, the query goes to a recursive resolver — typically provided by your ISP or a public resolver like `8.8.8.8` (Google) or `1.1.1.1` (Cloudflare). The recursive resolver does the hard work of walking the DNS tree: it contacts the root, then the TLD server, then the authoritative server for the domain. The result is cached at each level for the record's TTL, so subsequent lookups for the same name are answered from cache without repeating the walk.

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

Every domain is made up of different types of DNS records, each serving a specific purpose. When you manage a domain in a control panel (Cloudflare, Route 53, GoDaddy, etc.), you're creating and editing these records. Together they form a **zone file** — the complete configuration for your domain.

---

#### A Record — IPv4 Address

The most fundamental record. Maps a hostname directly to an IPv4 address. When someone visits `example.com`, their resolver ultimately returns an A record — an IP address their browser can connect to.

```
; Format: name  TTL  class  type  value
example.com.    3600  IN     A     93.184.216.34
www.example.com 3600  IN     A     93.184.216.34
```

- One domain can have **multiple A records** (DNS round-robin load balancing)
- The `@` symbol in control panels means the root domain itself (`example.com`)
- Every public-facing server needs an A record

```
; Multiple A records = round-robin
api.example.com  60  IN  A  10.0.0.1
api.example.com  60  IN  A  10.0.0.2
api.example.com  60  IN  A  10.0.0.3
; Resolver returns all three, client picks one
```

---

#### AAAA Record — IPv6 Address

The IPv6 equivalent of an A record. "AAAA" because IPv6 addresses are 4× longer (128-bit vs 32-bit). Most modern domains should have both A and AAAA records — clients that support IPv6 will prefer it.

```
example.com.  3600  IN  AAAA  2606:2800:220:1:248:1893:25c8:1946
```

- If a client has IPv6, it queries AAAA first; falls back to A if not found
- Not having AAAA records doesn't break anything — IPv4 still works
- Having both is called **dual-stack**

---

#### CNAME Record — Canonical Name (Alias)

A CNAME points a hostname to **another hostname**, not an IP. The resolver follows the chain until it reaches an A/AAAA record. It's an alias — "this name is really that name."

```
; www is an alias for the root domain
www.example.com.   3600  IN  CNAME  example.com.

; Subdomain aliased to a third-party service
blog.example.com.  3600  IN  CNAME  mysite.ghost.io.
shop.example.com.  3600  IN  CNAME  stores.shopify.com.
```

**Critical rules:**
- A CNAME **cannot** be on the root/apex domain (`example.com`) — only subdomains. This is the "CNAME flattening" problem; services like Cloudflare solve it with proprietary `ALIAS`/`ANAME` records
- A CNAME **cannot** coexist with other records for the same name (no MX + CNAME on the same host)
- CNAMEs can chain (A → B → C) but each hop adds latency — keep chains short

```
; CNAME chain — valid but avoid deep nesting
api.example.com  →  api.prod.example.com  →  lb-east.example.com  →  203.0.113.1 (A)
```

---

#### MX Record — Mail Exchange

Tells email servers where to deliver email for your domain. Without MX records, nobody can email you at `@example.com`. MX records point to hostnames (never IPs), and each has a **priority** — lower number = higher priority.

```
; Priority  Hostname
example.com.  3600  IN  MX  10  mail1.example.com.
example.com.  3600  IN  MX  20  mail2.example.com.  ; backup
example.com.  3600  IN  MX  10  aspmx.l.google.com. ; Google Workspace
```

- Sending servers try the lowest priority MX first; fail over to higher numbers
- MX records must point to A/AAAA records — never to a CNAME or IP directly
- Using Google Workspace, Outlook, or Zoho? They provide the MX values to set

```
; Google Workspace MX records
@  IN  MX  1   aspmx.l.google.com.
@  IN  MX  5   alt1.aspmx.l.google.com.
@  IN  MX  5   alt2.aspmx.l.google.com.
@  IN  MX  10  alt3.aspmx.l.google.com.
@  IN  MX  10  alt4.aspmx.l.google.com.
```

---

#### TXT Record — Text / Verification

Stores arbitrary text data in DNS. Originally for human-readable notes, now primarily used for **domain verification** and **email authentication**. Anyone can query TXT records — they're public.

```
example.com.  3600  IN  TXT  "v=spf1 include:_spf.google.com ~all"
example.com.  3600  IN  TXT  "google-site-verification=abc123xyz"
```

**Common uses:**

| Use | What the TXT record looks like | Why |
|---|---|---|
| **SPF** | `v=spf1 include:sendgrid.net ~all` | Authorizes which servers can send email for your domain |
| **DKIM** | `v=DKIM1; k=rsa; p=MIGfMA0...` | Public key for email signature verification |
| **DMARC** | `v=DMARC1; p=reject; rua=mailto:...` | Policy for what to do with SPF/DKIM failures |
| **Domain verification** | `google-site-verification=abc123` | Proves ownership to Google, GitHub, etc. |
| **Let's Encrypt / ACME** | `_acme-challenge.example.com TXT abc` | DNS challenge for wildcard SSL certs |

**SPF explained:** When Gmail receives email claiming to be from `@example.com`, it checks the SPF TXT record to see if the sending server is authorized. `~all` means "soft fail" (accept but mark), `-all` means "hard fail" (reject).

---

#### NS Record — Name Server

Delegates authority for your domain (or a subdomain) to specific nameservers. These are set at your domain registrar and tell the world "these servers are authoritative for this domain."

```
example.com.  86400  IN  NS  ns1.cloudflare.com.
example.com.  86400  IN  NS  ns2.cloudflare.com.
```

- You typically don't edit NS records directly — you set them at your registrar when you change DNS providers
- NS records have long TTLs (24–48 hours) because they change rarely and propagation is slow
- Subdomain delegation: point a subdomain's NS to a different provider

```
; Delegate api.example.com to a separate DNS zone
api.example.com.  86400  IN  NS  ns1.api-provider.com.
api.example.com.  86400  IN  NS  ns2.api-provider.com.
```

---

#### PTR Record — Pointer (Reverse DNS)

The reverse of an A record. Maps an IP address back to a hostname. Used for reverse DNS lookups (`rDNS`) — "what hostname is this IP?" Stored in a special `.in-addr.arpa` zone.

```
; Forward:  mail.example.com → 203.0.113.1
; Reverse:  203.0.113.1 → mail.example.com

1.113.0.203.in-addr.arpa.  3600  IN  PTR  mail.example.com.
```

- PTR records are set by whoever **owns the IP** — usually your hosting provider or ISP, not you
- **Email deliverability:** mail servers check PTR records. If `203.0.113.1` doesn't resolve back to a legitimate hostname, email is likely spam-filtered
- `dig -x 203.0.113.1` performs a reverse lookup

---

#### SRV Record — Service Location

Points to a specific **host and port** for a service. Lets clients discover where a service is running without hardcoding connection strings. Used by protocols like SIP (VoIP), XMPP (chat), Minecraft servers, and Kubernetes.

```
; Format: _service._proto.name  TTL  IN  SRV  priority  weight  port  target
_https._tcp.example.com.  3600  IN  SRV  10  20  443  web1.example.com.
_https._tcp.example.com.  3600  IN  SRV  10  80  443  web2.example.com.

; Minecraft server
_minecraft._tcp.play.example.com.  300  IN  SRV  0  5  25565  mc.example.com.

; SIP / VoIP
_sip._tcp.example.com.  3600  IN  SRV  10  50  5060  sip.example.com.
```

**Fields:**
- `priority` — lower = preferred (like MX)
- `weight` — load balancing between same-priority records (higher = more traffic)
- `port` — the port to connect on
- `target` — the hostname (must have its own A/AAAA record)

---

#### SOA Record — Start of Authority

Every DNS zone has exactly one SOA record. It's automatically created when you set up a zone and contains metadata about the zone itself — which server is primary, the admin email, and timing parameters for zone transfers between nameservers.

```
example.com.  3600  IN  SOA  ns1.cloudflare.com.  dns.cloudflare.com. (
    2024031501  ; serial — incremented on each change (YYYYMMDDNN format)
    7200        ; refresh — how often secondary NS checks for updates (2h)
    900         ; retry — how long to wait before retrying failed refresh (15m)
    1209600     ; expire — how long secondary NS serves zone if primary unreachable (14d)
    300         ; minimum TTL — negative caching TTL
)
```

You rarely edit SOA records manually — DNS providers manage them automatically.

---

#### CAA Record — Certification Authority Authorization

Specifies which Certificate Authorities (CAs) are allowed to issue SSL/TLS certificates for your domain. Prevents unauthorized certificate issuance — a security measure against CA compromise or misissuance.

```
example.com.  3600  IN  CAA  0  issue     "letsencrypt.org"
example.com.  3600  IN  CAA  0  issuewild "letsencrypt.org"
example.com.  3600  IN  CAA  0  iodef     "mailto:security@example.com"
```

- `issue` — which CA can issue regular certs
- `issuewild` — which CA can issue wildcard certs (`*.example.com`)
- `iodef` — where to send reports of unauthorized issuance attempts
- If no CAA record exists, any CA can issue — CAA is opt-in protection

---

#### Quick Reference

| Record | Maps | Used for | Who sets it |
|---|---|---|---|
| **A** | hostname → IPv4 | Pointing domain to server | You |
| **AAAA** | hostname → IPv6 | IPv6 support | You |
| **CNAME** | hostname → hostname | Aliases, third-party services | You |
| **MX** | domain → mail server | Email delivery | You |
| **TXT** | domain → text | SPF, DKIM, DMARC, verification | You |
| **NS** | domain → nameservers | Delegating DNS authority | Registrar/you |
| **PTR** | IP → hostname | Reverse DNS, email reputation | Hosting provider |
| **SRV** | service → host+port | Service discovery | You |
| **SOA** | zone → authority metadata | Zone management | Auto (DNS provider) |
| **CAA** | domain → allowed CAs | SSL certificate security | You |

#### Checking records with `dig`

```bash
# A record
dig example.com A

# MX records
dig example.com MX

# TXT records (SPF, DKIM, verification)
dig example.com TXT

# DKIM — the selector is in the key name (check your email provider)
dig google._domainkey.example.com TXT

# Reverse lookup (PTR)
dig -x 93.184.216.34

# All records
dig example.com ANY

# Check specific nameserver directly (bypass cache)
dig @ns1.cloudflare.com example.com A

# Check propagation — compare two resolvers
dig @8.8.8.8 example.com A    # Google
dig @1.1.1.1 example.com A    # Cloudflare
```

### TTL (Time-To-Live)

TTL is the number of seconds a resolver or browser is permitted to cache a DNS answer before it must query again. It is the key lever for trading off freshness against query volume. Before migrating a site or changing infrastructure, lower TTL to 60–300 seconds a day or two in advance — once the low TTL has propagated and existing long-TTL caches have expired, any change you make to the record will be seen globally within minutes. After the migration, raise TTL back to 3600+ to reduce query load.

Cached by resolvers for TTL seconds. Short TTL = faster failover, more DNS queries. Long TTL = fewer queries, slower propagation.

```
; Common TTLs
3600    ; 1 hour — normal records
300     ; 5 min — during migrations
86400   ; 24 hours — stable infrastructure
60      ; 1 min — during incident failover
```

### Query with `dig`

`dig` (Domain Information Groper) is the standard command-line tool for interrogating DNS. It queries a resolver and shows the full response including the answer, authority, and additional sections, making it invaluable for debugging DNS propagation issues, verifying record changes, and understanding the full resolution chain. The `+trace` flag is particularly useful: it walks the entire delegation from root to authoritative server, showing exactly where each delegation step occurs, which is essential when diagnosing misconfigured nameserver records.

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

HTTP is the application-layer protocol that powers data exchange on the web. It follows a request-response model: a client sends a request with a method, URL, headers, and optional body; the server processes it and responds with a status code, headers, and an optional body. HTTP has evolved through three major versions, each addressing performance limitations of the previous: HTTP/1.1 added persistent connections, HTTP/2 added multiplexing, and HTTP/3 eliminated TCP's head-of-line blocking by moving to UDP-based QUIC.

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

HTTP status codes communicate the outcome of a request in a standardized way that both humans and machines can interpret. The first digit indicates the class of response: 2xx means success, 3xx means the client should look elsewhere (redirect), 4xx means the client made an error, and 5xx means the server failed. Using the correct status code is not pedantry — clients, CDNs, and monitoring systems all make decisions based on status codes (301 vs 302 determines cacheability; 503 tells load balancers to stop routing; 429 tells clients to back off). Using 200 for everything and encoding success/failure in the body body is an antipattern that defeats these integrations.

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

HTTP methods convey the intended action on a resource, and two properties — safety and idempotency — have real consequences for how clients, proxies, and servers should treat them. A safe method has no observable side effects; a client can call it without worrying about mutating state. An idempotent method produces the same server state whether called once or many times; this is what makes retrying a `PUT` or `DELETE` safe but retrying a `POST` potentially dangerous (double-creation). These properties matter for implementing retry logic, caching, and browser behavior on back/forward navigation.

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

The TLS handshake establishes a shared secret between client and server without transmitting it over the wire — using Diffie-Hellman key exchange — and authenticates the server's identity via its certificate. TLS 1.3 streamlined this to a single round trip by merging the key share into the ClientHello, meaning application data can be sent immediately after the server's Finished message. This is a significant latency improvement over TLS 1.2's two round trips. The forward secrecy property means that even if the server's private key is later compromised, past sessions cannot be decrypted because each session uses an ephemeral key that is discarded after use.

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

TLS certificates use a chain of trust: your server's certificate is signed by an intermediate CA, which is signed by a root CA that is pre-installed in every OS and browser's trust store. Browsers verify this chain bottom-up — your cert must chain to a trusted root through valid intermediate signatures. Intermediate CAs exist because root CA private keys are kept offline in hardware vaults for security; the intermediate is what signs day-to-day certificates. When configuring a web server, you must include the intermediate certificate(s) in your TLS configuration alongside your own certificate, or clients that don't cache intermediates will fail to verify the chain.

```
Root CA (DigiCert, Let's Encrypt, etc.)
    └── Intermediate CA
            └── Your certificate (github.com)
```

Browser validates chain up to a trusted root CA stored in OS/browser trust store.

### HSTS (HTTP Strict Transport Security)

HSTS closes the window between a user typing `http://example.com` and the server redirecting them to `https://example.com`. During that initial HTTP request, an attacker on the network can intercept and modify the response before the redirect (SSL stripping). HSTS tells the browser to never send any request to this domain over HTTP — all requests become HTTPS at the browser level, before any network communication. The `preload` directive lists the domain in browsers' built-in HSTS preload lists, so the protection applies even on the very first visit to a domain (before any HSTS header has ever been seen).

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

Tells browser: never connect to this domain over HTTP. Prevents downgrade attacks.

---

## Caching

HTTP caching allows responses to be stored by browsers and intermediaries (CDNs, proxies) so that subsequent requests for the same resource can be served without hitting the origin server. Effective caching is one of the highest-leverage performance optimizations available: a cache hit eliminates the network round trip, server processing, and database queries entirely. The key is setting the right headers: `Cache-Control` defines the policy (how long, who can cache, whether revalidation is required), and `ETag` enables efficient revalidation (the server can confirm the resource hasn't changed with a 304 response that carries no body, saving bandwidth). The worst outcome is either caching sensitive data in a shared CDN or failing to cache static assets at all.

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

A conditional GET lets the browser confirm whether its cached copy is still fresh without re-downloading the full resource body. On the first request the server sends an `ETag` (a fingerprint of the resource content) or `Last-Modified` date. On subsequent requests the browser includes `If-None-Match` or `If-Modified-Since`. If the resource hasn't changed, the server responds with `304 Not Modified` — an empty body — and the browser uses its cached copy. This eliminates bandwidth for unchanged resources while still verifying freshness, which is especially valuable for large assets that change infrequently.

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

Content negotiation is the mechanism by which a client and server agree on the format, language, and encoding of a response. The client advertises its capabilities and preferences in `Accept*` request headers, and the server selects the best match and declares what it chose in `Content-*` response headers. This allows a single URL to serve JSON to an API client, HTML to a browser, and compressed content to any client that supports it — without separate endpoints. The `q` quality factor (e.g., `text/html;q=0.9`) expresses preference when the client accepts multiple formats, with `1.0` being highest preference.

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

WebSockets solve a fundamental limitation of HTTP: HTTP is inherently request-response and client-initiated. The server cannot push data to the client without the client first asking. For real-time applications — chat, live dashboards, collaborative editing, multiplayer games — this forces inefficient polling patterns. WebSockets upgrade an existing HTTP connection to a persistent, bidirectional channel where either side can send messages at any time with minimal overhead (a 2-6 byte frame header vs HTTP's kilobytes of headers). The initial upgrade uses HTTP (making WebSockets firewall-friendly on port 443), then the protocol switches and HTTP is no longer involved.

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

SSE is the lightweight alternative to WebSockets for the common case where only the server needs to push data — live feeds, progress updates, log streaming, AI token streaming. Unlike WebSockets, SSE is a standard HTTP response with `Content-Type: text/event-stream` that the server keeps open and writes to incrementally. It requires no special protocol upgrade, works through HTTP/2 multiplexing naturally, and the browser's `EventSource` API provides built-in reconnection with `Last-Event-ID` header resumption — if the connection drops, the browser automatically reconnects and the server can resume from where it left off. Use SSE over WebSockets when you only need server-to-client push and want simpler infrastructure (no WebSocket server, no load balancer configuration for connection upgrades).

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
