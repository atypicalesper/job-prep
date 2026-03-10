# REST API Design Principles

---

## REST Constraints (Roy Fielding's Dissertation)

```
1. Client-Server      — separation of concerns, independent evolution
2. Stateless          — each request has all info needed, no server session
3. Cacheable          — responses labeled cacheable or not
4. Uniform Interface  — consistent resource-based URLs and HTTP methods
5. Layered System     — client doesn't know if talking to origin or CDN/proxy
6. Code on Demand     — optional: server sends executable code (JS)
```

---

## Resource Design

```
Resources are nouns, not verbs. URLs identify resources, methods indicate actions.

❌ Bad (RPC-style):
POST /getUser
POST /createUser
POST /deleteUser
GET  /updateUserStatus?userId=1&status=active

✅ Good (REST):
GET    /users           — list users
POST   /users           — create user
GET    /users/:id       — get user
PUT    /users/:id       — replace user (full update)
PATCH  /users/:id       — partial update
DELETE /users/:id       — delete user

Nested resources:
GET  /users/:id/orders            — user's orders
POST /users/:id/orders            — create order for user
GET  /users/:id/orders/:orderId   — specific order

But avoid deep nesting (max 2-3 levels):
❌ /users/:id/orders/:orderId/items/:itemId/reviews
✅ /order-items/:itemId/reviews
```

---

## HTTP Methods and Idempotency

```
Method    Idempotent?   Safe?    Body?  Meaning
GET       ✅ Yes        ✅ Yes   No     Retrieve resource
HEAD      ✅ Yes        ✅ Yes   No     Like GET but no body (metadata)
OPTIONS   ✅ Yes        ✅ Yes   No     What methods are allowed?
POST      ❌ No         ❌ No    Yes    Create resource or trigger action
PUT       ✅ Yes        ❌ No    Yes    Replace entire resource
PATCH     ❌ No*        ❌ No    Yes    Partial update
DELETE    ✅ Yes        ❌ No    No     Delete resource

Idempotent: calling N times has same effect as calling once
Safe: no side effects (read-only)

*PATCH can be made idempotent with conditional requests
```

---

## HTTP Status Codes

```
2xx Success:
200 OK              — general success
201 Created         — resource created (include Location header)
202 Accepted        — async operation started
204 No Content      — success, no body (DELETE, PATCH with no response)

3xx Redirection:
301 Moved Permanently — redirect (cache forever)
302 Found             — temporary redirect
304 Not Modified      — cached version is still valid (ETag/Last-Modified)

4xx Client Errors:
400 Bad Request     — malformed request, validation error
401 Unauthorized    — not authenticated (misleading name!)
403 Forbidden       — authenticated but not authorized
404 Not Found       — resource doesn't exist
405 Method Not Allowed — wrong HTTP method
409 Conflict        — resource state conflict (duplicate, optimistic lock failure)
410 Gone            — resource permanently deleted (vs 404: was here, now gone)
422 Unprocessable Entity — semantically invalid (validation errors)
429 Too Many Requests   — rate limited

5xx Server Errors:
500 Internal Server Error — generic server error
502 Bad Gateway     — upstream service returned invalid response
503 Service Unavailable — temporarily down (maintenance, overload)
504 Gateway Timeout — upstream service timed out
```

---

## Request/Response Design

```json
// ✅ Good: consistent error format
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "email", "message": "Invalid email format" },
      { "field": "age", "message": "Must be at least 18" }
    ]
  }
}

// ✅ Good: consistent success format (envelope)
{
  "data": { ... },
  "meta": { "total": 100, "page": 1, "limit": 20 }
}

// ✅ Good: pagination
{
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": true
  }
}
```

---

## Pagination Strategies

```
1. Offset/Limit — simple but has problems at scale

GET /users?page=2&limit=20
GET /users?offset=40&limit=20

Problems:
- If items are inserted/deleted between pages, results skip or duplicate
- Slow on large offsets (SELECT ... OFFSET 10000 scans 10000 rows)

2. Cursor-based — better for infinite scroll, real-time data

GET /users?cursor=eyJpZCI6MTAwfQ&limit=20
Response includes: "nextCursor": "eyJpZCI6MTIwfQ"

SQL: WHERE id > :cursor ORDER BY id LIMIT 20
Fast O(log n) index lookup, consistent regardless of insertions

3. Keyset pagination — similar to cursor, uses actual column values

GET /users?after_id=100&limit=20

4. Time-based cursor (for real-time feeds):
GET /events?before=2024-01-15T10:00:00Z&limit=50
```

---

## Versioning Strategies

```
1. URL versioning (most common):
GET /v1/users
GET /v2/users
Pros: explicit, cacheable, easy to route
Cons: not truly RESTful (version isn't a resource property)

2. Header versioning:
GET /users
Accept: application/vnd.myapi.v2+json
Pros: clean URLs
Cons: harder to test in browser, cache issues

3. Query parameter:
GET /users?version=2
Pros: easy to test
Cons: pollutes query params, cache issues

4. Content negotiation:
Accept: application/vnd.myapi+json; version=2

Recommendation: URL versioning for public APIs (clear, discoverable)
```

---

## HATEOAS (Hypermedia as the Engine of Application State)

```json
// Self-describing responses with links — APIs discoverable without docs
{
  "id": "123",
  "name": "Alice",
  "status": "active",
  "_links": {
    "self": { "href": "/users/123" },
    "orders": { "href": "/users/123/orders" },
    "deactivate": { "href": "/users/123/deactivate", "method": "POST" }
  }
}
// Clients follow links, don't hardcode URLs
// Rarely implemented in practice but good to know in theory
```

---

## Headers Best Practices

```
Request:
Authorization: Bearer <token>        — JWT auth
Content-Type: application/json       — body format
Accept: application/json             — expected response format
X-Request-ID: uuid                   — trace requests through systems
If-None-Match: "abc123"              — conditional GET (ETag)
If-Modified-Since: Wed, 21 Oct 2024  — conditional GET

Response:
Content-Type: application/json; charset=utf-8
Cache-Control: max-age=3600, must-revalidate
ETag: "abc123"                       — resource version (for caching)
Last-Modified: Wed, 21 Oct 2024 ...  — when resource changed
Location: /users/456                 — after 201 Created
X-RateLimit-Limit: 1000             — rate limit info
X-RateLimit-Remaining: 950
X-RateLimit-Reset: 1705312800
```

---

## Interview Questions

**Q: What is the difference between PUT and PATCH?**
A: PUT replaces the entire resource — you send the full representation. PATCH sends only the fields you want to update (partial update). PUT is idempotent — calling it multiple times with the same body gives the same result. PATCH is typically not idempotent (e.g., PATCH `{ "count": { "$inc": 1 } }` — each call increments). For a simple "update some fields" API, PATCH is usually more appropriate.

**Q: What is the difference between 401 and 403?**
A: 401 Unauthorized means "not authenticated" — the client hasn't proven who they are (no credentials or invalid credentials). 403 Forbidden means "authenticated but not authorized" — we know who you are but you don't have permission. The naming is unfortunately misleading (401 says "unauthorized" but means unauthenticated).

**Q: Why is cursor-based pagination better than offset-based?**
A: Cursor-based is consistent (new items don't cause skips or duplicates), performant (O(log n) index scan vs O(n) offset scan), and handles large datasets well. Offset-based is simple to implement and supports jumping to arbitrary pages, but slows down with large offsets and has consistency issues when data changes between requests.

**Q: What does idempotent mean and which HTTP methods are idempotent?**
A: An idempotent operation produces the same result whether you call it once or N times. GET, HEAD, OPTIONS, PUT, DELETE are idempotent. POST and PATCH are not (generally). Idempotency matters for retry logic — if a request fails, you can safely retry idempotent operations. For non-idempotent operations, use idempotency keys.
