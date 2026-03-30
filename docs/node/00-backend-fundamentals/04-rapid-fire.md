# Backend Rapid Fire Q&A

---

## HTTP

**Q: What is the difference between PUT and PATCH?**
PUT replaces the entire resource. PATCH applies partial updates — only the fields provided are changed.

**Q: What does idempotent mean? Which HTTP methods are idempotent?**
Multiple identical requests produce the same result. GET, PUT, DELETE, HEAD, OPTIONS are idempotent. POST and PATCH are not.

**Q: What is the difference between 401 and 403?**
401 Unauthorized — the client is not authenticated (no/invalid credentials). 403 Forbidden — the client is authenticated but lacks permission.

**Q: What happens during a CORS preflight request?**
For non-simple requests (POST with JSON, custom headers), the browser first sends an OPTIONS request. The server must respond with `Access-Control-Allow-*` headers. If the response is missing or disallows the origin, the browser blocks the actual request.

**Q: What is the difference between `Cache-Control: no-cache` and `no-store`?**
`no-cache` allows caching but requires revalidation with the server on every use. `no-store` forbids caching entirely — the response is never saved.

**Q: What is an ETag?**
A fingerprint (hash) of the response body. Clients send it back via `If-None-Match`. If content is unchanged, the server returns 304 Not Modified with no body — saves bandwidth.

**Q: What is HTTP/2's main advantage over HTTP/1.1?**
Multiplexing — multiple requests/responses over a single TCP connection simultaneously, eliminating HTTP/1.1's head-of-line blocking per-connection.

**Q: What is a webhook?**
A server-to-server HTTP POST triggered by an event (e.g. Stripe sends a `payment.succeeded` webhook to your endpoint). The receiving server must acknowledge with 2xx quickly; heavy work should be done asynchronously.

---

## Authentication & Security

**Q: Why store JWT in a httpOnly cookie instead of localStorage?**
`httpOnly` cookies are inaccessible via JavaScript, preventing XSS from stealing tokens. `localStorage` is readable by any script on the page.

**Q: What is the difference between authentication and authorization?**
Authentication verifies identity (who you are). Authorization verifies permissions (what you can do).

**Q: What is PKCE and why is it needed?**
Proof Key for Code Exchange — prevents authorization code interception in public clients (SPAs, mobile apps). The client generates a `code_verifier`, hashes it to a `code_challenge`, sends the challenge in the auth request, and proves the original verifier at token exchange.

**Q: Why shouldn't you use MD5 or SHA256 for passwords?**
They are fast — an attacker can compute billions per second. Use bcrypt, argon2, or scrypt which are intentionally slow (adjustable cost factor).

**Q: What is SQL injection and how do you prevent it?**
Attacker injects SQL via user input: `' OR '1'='1`. Prevented with parameterized queries / prepared statements — input is never concatenated into SQL strings.

**Q: What is XSS and how do you prevent it?**
Cross-Site Scripting — attacker injects malicious scripts into pages viewed by others. Prevented by: escaping output, `textContent` over `innerHTML`, CSP headers, sanitizing user HTML (DOMPurify).

**Q: What is CSRF and how do you prevent it?**
Cross-Site Request Forgery — tricks authenticated users into submitting requests to another site. Prevented by: `SameSite=Lax/Strict` cookies, CSRF tokens, checking `Origin`/`Referer` headers.

**Q: What is the principle of least privilege?**
Grant users/services only the permissions they need. A read-only API should use a DB user with SELECT only. A service that reads S3 shouldn't have write access.

**Q: What does rate limiting protect against?**
Brute force attacks (trying many passwords), credential stuffing, DDoS, resource exhaustion. Apply per-IP and per-user, stricter on auth endpoints.

---

## Databases

**Q: What is the N+1 problem?**
Fetching a list of N items then making N additional queries for each item's related data. Fix: eager loading (JOIN / `include` in ORMs) or DataLoader batching.

**Q: What is a database transaction?**
A unit of work where all operations succeed or all are rolled back. Guarantees ACID properties so partial failures don't leave data in an inconsistent state.

**Q: What is the difference between a clustered and non-clustered index?**
A clustered index determines the physical row order — one per table (usually the PK). Non-clustered indexes are separate structures pointing to rows.

**Q: When would you use a composite index?**
When queries filter or sort on multiple columns together. The column order matters — most selective / most queried columns first (leftmost prefix rule).

**Q: What is eventual consistency?**
In distributed systems, replicas may temporarily diverge but will converge to the same value given enough time. Contrast with strong consistency (every read sees the latest write).

**Q: What is database connection pooling?**
Maintaining a pool of reusable DB connections instead of opening/closing a connection per request. Avoids the overhead of TCP handshakes and auth. Set `max` connections below the DB's limit.

**Q: When should you use NoSQL over SQL?**
When schema evolves rapidly, data is document-shaped (nested objects), horizontal scale is required from day one, or access patterns are simple (no complex JOINs).

**Q: What is the difference between `DELETE` and `TRUNCATE` in SQL?**
`DELETE` removes rows one by one, fires triggers, can be rolled back, supports `WHERE`. `TRUNCATE` removes all rows at once, faster, minimal logging, cannot be filtered.

---

## Caching

**Q: What is cache-aside (lazy loading)?**
Check cache first → miss → fetch from DB → populate cache → return. Simple and resilient. Downside: first request is always slow; cache can serve stale data.

**Q: What is cache invalidation and why is it hard?**
Removing or updating stale cache entries when underlying data changes. Hard because distributed caches may have multiple keys for the same data, and invalidation must be atomic with the DB write.

**Q: What is a TTL and how do you choose it?**
Time-to-live — how long a cache entry lives before being evicted. Shorter = fresher data, more DB load. Longer = stale risk, fewer DB hits. Choose based on how often data changes and how stale is acceptable.

**Q: What is Redis used for beyond caching?**
Session storage, pub/sub messaging, leaderboards (sorted sets), rate limiting (counters), distributed locks, job queues (lists), real-time features (presence, notifications).

---

## Architecture

**Q: What is the difference between horizontal and vertical scaling?**
Vertical: add more resources (CPU, RAM) to one server — has a ceiling. Horizontal: add more servers — no ceiling but requires stateless design and a load balancer.

**Q: What is a message queue and when do you use it?**
Async communication between services (RabbitMQ, SQS, Kafka). Use when: decoupling producers/consumers, handling traffic spikes (queue as buffer), ensuring at-least-once delivery, background processing.

**Q: What is the difference between REST and GraphQL?**
REST has multiple endpoints per resource, over/under-fetching is common. GraphQL has one endpoint, client specifies exactly the fields needed, reduces round trips. GraphQL adds complexity (N+1 at resolver level, schema design).

**Q: What is a reverse proxy?**
A server (Nginx, Caddy) sitting between clients and origin servers. Handles: SSL termination, load balancing, caching, rate limiting, serving static files — offloads these from the app server.

**Q: What is idempotency in APIs and why does it matter?**
An idempotent endpoint produces the same result regardless of how many times called. Critical for retries — if a payment request times out, the client must be able to retry safely without double-charging. Implement via idempotency keys.
