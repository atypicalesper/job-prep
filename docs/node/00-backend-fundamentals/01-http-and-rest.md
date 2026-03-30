# HTTP & REST Fundamentals

## HTTP Request/Response Cycle

```
Client                              Server
  │                                   │
  │── HTTP Request ──────────────────▶│
  │   Method: POST                    │
  │   URL: /api/users                 │
  │   Headers: Content-Type, Auth     │
  │   Body: { "name": "Alice" }       │
  │                                   │
  │◀─ HTTP Response ──────────────────│
  │   Status: 201 Created             │
  │   Headers: Content-Type, CORS     │
  │   Body: { "id": 1, "name": ... }  │
```

---

## HTTP Methods

| Method | Purpose | Idempotent | Safe | Body |
|--------|---------|-----------|------|------|
| GET | Retrieve resource | ✅ | ✅ | No |
| POST | Create resource | ❌ | ❌ | Yes |
| PUT | Replace resource entirely | ✅ | ❌ | Yes |
| PATCH | Partial update | ❌ | ❌ | Yes |
| DELETE | Remove resource | ✅ | ❌ | Optional |
| HEAD | Like GET, headers only | ✅ | ✅ | No |
| OPTIONS | Discover allowed methods | ✅ | ✅ | No |

**Idempotent** — multiple identical requests produce the same result.
**Safe** — does not modify server state.

---

## HTTP Status Codes

```
1xx — Informational
  100 Continue             — send request body

2xx — Success
  200 OK                   — standard success
  201 Created              — resource created (POST/PUT)
  204 No Content           — success, no body (DELETE)
  206 Partial Content      — range request (streaming)

3xx — Redirect
  301 Moved Permanently    — SEO-permanent, cache forever
  302 Found                — temporary redirect
  304 Not Modified         — cached version still valid (ETag/If-None-Match)
  307 Temporary Redirect   — same method preserved (unlike 302)
  308 Permanent Redirect   — same method preserved (unlike 301)

4xx — Client Error
  400 Bad Request          — malformed request / validation error
  401 Unauthorized         — missing/invalid credentials
  403 Forbidden            — authenticated but no permission
  404 Not Found            — resource doesn't exist
  405 Method Not Allowed   — wrong HTTP verb
  409 Conflict             — state conflict (e.g. duplicate)
  410 Gone                 — permanently removed
  422 Unprocessable Entity — validation error (semantically wrong)
  429 Too Many Requests    — rate limited

5xx — Server Error
  500 Internal Server Error — unhandled exception
  502 Bad Gateway          — upstream server returned invalid response
  503 Service Unavailable  — overloaded or down for maintenance
  504 Gateway Timeout      — upstream server timed out
```

---

## Important HTTP Headers

```
Request Headers:
  Authorization: Bearer <token>
  Content-Type: application/json
  Accept: application/json
  Cookie: session=abc123
  User-Agent: Mozilla/5.0 ...
  Origin: https://example.com
  Referer: https://example.com/page
  If-None-Match: "etag-value"          — conditional GET
  If-Modified-Since: Wed, 01 Jan 2025  — conditional GET

Response Headers:
  Content-Type: application/json; charset=utf-8
  Set-Cookie: token=abc; HttpOnly; Secure; SameSite=Lax
  Cache-Control: public, max-age=3600
  ETag: "abc123"                        — version fingerprint
  Last-Modified: Wed, 01 Jan 2025
  Location: /api/users/42              — after 201/301/302
  X-RateLimit-Limit: 100
  X-RateLimit-Remaining: 95
  X-Request-Id: uuid                   — distributed tracing

CORS Headers:
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, POST, PUT, DELETE
  Access-Control-Allow-Headers: Content-Type, Authorization
  Access-Control-Allow-Credentials: true
  Access-Control-Max-Age: 86400        — preflight cache duration
```

---

## REST Principles

REST (Representational State Transfer) is an architectural style, not a protocol.

### 6 Constraints

1. **Client-Server** — UI and data storage are separated
2. **Stateless** — each request contains all info needed; no server-side session
3. **Cacheable** — responses must indicate if they can be cached
4. **Uniform Interface** — consistent resource-based URLs
5. **Layered System** — client doesn't know if talking to load balancer or origin
6. **Code on Demand** *(optional)* — server can send executable code

### Resource URL Design

```
# Collections and items
GET    /users           → list users
POST   /users           → create user
GET    /users/:id       → get user
PUT    /users/:id       → replace user
PATCH  /users/:id       → update user fields
DELETE /users/:id       → delete user

# Nested resources (shallow nesting — max 2 levels)
GET    /users/:id/posts         → posts by user
GET    /users/:id/posts/:postId → specific post by user

# Actions that don't map to CRUD (use nouns or verbs clearly)
POST   /users/:id/activate
POST   /orders/:id/cancel
POST   /auth/login

# Filtering, sorting, pagination
GET /products?category=shoes&sort=price&order=asc&page=2&limit=20

# Versioning
/api/v1/users       — URL versioning (common)
Accept: application/vnd.api.v2+json  — header versioning
```

### Response Shape Conventions

```json
// Single resource
{
  "id": "1",
  "name": "Alice",
  "email": "alice@example.com",
  "createdAt": "2024-01-01T00:00:00Z"
}

// Collection
{
  "data": [...],
  "meta": {
    "total": 100,
    "page": 2,
    "limit": 20,
    "hasNext": true
  }
}

// Error
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is invalid",
    "fields": { "email": "Invalid format" }
  }
}
```

---

## HTTP/2 vs HTTP/3

| Feature | HTTP/1.1 | HTTP/2 | HTTP/3 |
|---------|----------|--------|--------|
| Transport | TCP | TCP | QUIC (UDP) |
| Multiplexing | ❌ (head-of-line) | ✅ (single connection) | ✅ |
| Header compression | ❌ | HPACK | QPACK |
| Server push | ❌ | ✅ | ✅ |
| HOL blocking | Yes | Stream-level fixed | Fixed at transport level |
| TLS required | No | Practically yes | Yes (built-in) |

**Head-of-line blocking**: in HTTP/1.1, a slow request blocks all subsequent requests on the same connection. HTTP/2 multiplexes streams but TCP HOL blocking remains. HTTP/3 uses QUIC (UDP) to eliminate this.

---

## Caching

```
Cache-Control directives:
  public         — any cache (CDN, browser) can store
  private        — browser only (user-specific data)
  no-cache       — always revalidate with server before using cache
  no-store       — never cache
  max-age=N      — seconds until stale (browser)
  s-maxage=N     — seconds until stale (CDN only)
  must-revalidate — don't serve stale, even if server is down
  immutable      — content will never change (content-hashed assets)

Example:
  Static assets:  Cache-Control: public, max-age=31536000, immutable
  API responses:  Cache-Control: private, no-cache
  HTML pages:     Cache-Control: no-cache
```

### ETags (Conditional Requests)

```
1. Client requests /api/user/1
2. Server responds: 200 + ETag: "abc123"
3. Client caches + stores ETag
4. Next request: If-None-Match: "abc123"
5. Server: data unchanged → 304 Not Modified (no body)
          data changed → 200 + new ETag
```

---

## WebSockets vs SSE vs Polling

| | Long Polling | SSE | WebSocket |
|--|-------------|-----|----------|
| Direction | Server → Client (simulated) | Server → Client only | Bidirectional |
| Protocol | HTTP | HTTP | WS (upgrade) |
| Connection | New request each message | Persistent | Persistent |
| Browser support | Universal | Universal | Universal |
| Complexity | Simple | Simple | Moderate |
| Use case | Legacy fallback | Notifications, live feeds | Chat, gaming, collab |

```js
// SSE (Server-Sent Events)
const es = new EventSource('/api/stream')
es.addEventListener('message', e => console.log(e.data))
es.addEventListener('update', e => console.log(e.data))  // named events
es.close()

// WebSocket
const ws = new WebSocket('wss://api.example.com/ws')
ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token }))
ws.onmessage = e => console.log(JSON.parse(e.data))
ws.onclose = e => console.log(e.code, e.reason)
ws.onerror = e => console.error(e)
```
