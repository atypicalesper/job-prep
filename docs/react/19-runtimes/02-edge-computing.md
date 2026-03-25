# Edge Computing — Cloudflare Workers & Edge Runtimes

## What is Edge Computing?

Traditional server: one region, all requests travel to it.
Edge: code runs in datacenters **near the user** (100+ global locations).

```
Traditional:
  User (Tokyo) → request → Server (us-east-1) → response
  Latency: ~200ms RTT

Edge:
  User (Tokyo) → request → Edge node (Tokyo) → response
  Latency: ~5ms RTT

When it matters:
  - Geolocation-based routing
  - Auth token validation (reject at edge, not origin)
  - Personalization (A/B testing, feature flags)
  - Static asset serving
  - Bot detection
```

---

## Cloudflare Workers

Cloudflare Workers is the largest and most mature edge compute platform. Each Worker is a JavaScript/TypeScript (or WASM) function that responds to HTTP requests and is deployed to Cloudflare's 300+ global datacenters simultaneously — there is no concept of "picking a region." Workers run JavaScript/TypeScript (and WASM) on Cloudflare's global network using **V8 isolates** — not Node.js processes.

### V8 Isolates vs Containers

Traditional serverless functions spin up a full OS process (or container) per cold start, which takes 100–500ms because the OS must allocate memory, load the Node.js runtime, and execute initialization code. V8 isolates are JavaScript execution contexts inside a single shared V8 process — creating a new isolate takes microseconds because no OS process boundary is crossed. Cloudflare keeps a pool of pre-warmed V8 isolates, so Workers effectively have zero cold start. The tradeoff is strict isolation via context separation rather than process separation, and no access to the OS (no filesystem, no child processes).

```
Traditional serverless (Lambda):
  Cold start: 100-500ms (spin up container/process)
  Warm start: fast
  Memory: ~128-512MB
  Model: OS process per function

Cloudflare Workers (V8 Isolates):
  Cold start: ~0ms (V8 isolate, always warm)
  Memory: 128MB max
  CPU: 10ms (free) / 30s (paid) per request
  Model: Shared V8 process, isolated contexts
```

Workers have **no Node.js API access** — only Web Platform APIs:
```
✅ Available: fetch, Request, Response, URL, crypto (Web Crypto),
              TextEncoder/Decoder, ReadableStream, Headers,
              Cache API, WebSockets (server side)

❌ Not available: fs, path, http, net, child_process, buffer (Node.js)
                  process.env (use Wrangler env vars instead)
```

---

## Basic Worker

The entry point of every Worker is an exported `default` object with a `fetch` handler — a function that receives a `Request` and must return a `Response`. The `env` argument provides access to bindings (KV namespaces, D1 databases, secrets, environment variables) declared in `wrangler.toml`. The `ctx` argument provides `ctx.waitUntil()` for fire-and-forget async work that should complete even after the response is sent, and `ctx.passThroughOnException()` as a safety valve to fall back to origin on unhandled errors.

```typescript
// src/index.ts
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    // Routing
    if (url.pathname === '/api/users') {
      return handleUsers(request, env);
    }

    if (url.pathname.startsWith('/api/')) {
      return new Response('Not Found', { status: 404 });
    }

    // Serve from origin for non-API routes
    return fetch(request);
  },
};

async function handleUsers(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET') {
    const users = await env.DB.prepare('SELECT * FROM users').all();
    return Response.json(users.results);
  }

  if (request.method === 'POST') {
    const body = await request.json() as { name: string; email: string };
    await env.DB.prepare('INSERT INTO users (name, email) VALUES (?, ?)')
      .bind(body.name, body.email)
      .run();
    return Response.json({ success: true }, { status: 201 });
  }

  return new Response('Method Not Allowed', { status: 405 });
}

// Type for bindings
interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  QUEUE: Queue;
  MY_SECRET: string;
}
```

```toml
# wrangler.toml
name = "my-worker"
main = "src/index.ts"
compatibility_date = "2024-11-01"

[[d1_databases]]
binding = "DB"
database_name = "my-database"
database_id = "xxxx"

[[kv_namespaces]]
binding = "CACHE"
id = "xxxx"

[vars]
API_URL = "https://api.example.com"
```

---

## Cloudflare Platform Services

### KV — Global Key-Value Store

Cloudflare KV is an eventually consistent global key-value store. Writes propagate to all Cloudflare datacenters within seconds, but reads in distant locations may serve stale data for up to 60 seconds. This makes it ideal for data that is read frequently but updated rarely — feature flags, user preferences, rate limit counters, cached API responses. Because it is globally replicated with no single-region bottleneck, KV reads are extremely fast but you cannot rely on it for data requiring strong consistency (use Durable Objects for that).

```typescript
// Eventually consistent, globally replicated (reads eventually fresh)
// Great for: config, feature flags, user sessions, rate limit counters

// Write
await env.CACHE.put('user:123', JSON.stringify(user), {
  expirationTtl: 3600,  // 1 hour
});

// Write with metadata
await env.CACHE.put('feature:dark-mode', 'true', {
  metadata: { updatedAt: Date.now() },
  expirationTtl: 86400,
});

// Read
const cached = await env.CACHE.get('user:123');
const user = cached ? JSON.parse(cached) : null;

// Read with metadata
const { value, metadata } = await env.CACHE.getWithMetadata('feature:dark-mode');

// Delete
await env.CACHE.delete('user:123');

// List keys
const list = await env.CACHE.list({ prefix: 'user:', limit: 100 });
```

### D1 — SQLite at the Edge

D1 is Cloudflare's managed relational database, built on SQLite. It runs as a primary instance with optional read replicas co-located with Workers for low-latency reads. D1 supports standard SQL, transactions via batch operations, and prepared statements with parameterized queries (preventing SQL injection). It is the right choice when you need relational data modeling, JOINs, or indexes at the edge — unlike KV, which is a flat key-value store. D1 is eventually consistent for replica reads; writes go to the primary.

```typescript
// D1 is SQLite running at the edge
// Consistent reads possible via replication

// Query
const stmt = env.DB.prepare('SELECT * FROM users WHERE id = ?');
const { results } = await stmt.bind(userId).all();
const user = await stmt.bind(userId).first();

// Write
await env.DB.prepare(
  'INSERT INTO users (id, name, email) VALUES (?, ?, ?)'
).bind(id, name, email).run();

// Batch (transaction)
await env.DB.batch([
  env.DB.prepare('INSERT INTO orders VALUES (?, ?)').bind(orderId, userId),
  env.DB.prepare('UPDATE inventory SET stock = stock - 1 WHERE id = ?').bind(productId),
]);
```

### Durable Objects — Stateful Edge

Durable Objects provide **single-instance, globally consistent state** — a Cloudflare-managed actor. The fundamental problem they solve is coordination: when you have a chat room, a shared counter, or a real-time collaborative document, multiple users' requests must be serialized through a single authoritative source. With regular Workers you can't do this because requests can land on any of Cloudflare's 300+ nodes. Durable Objects solve this by routing all requests for a given ID (e.g., a room name) to the same single instance, which runs on one machine and processes requests sequentially. Each Durable Object has its own in-memory state and persistent storage that survives restarts.

```typescript
// Each room has ONE Durable Object — single authoritative state
export class ChatRoom {
  private sessions: Set<WebSocket> = new Set();
  private messages: string[] = [];

  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request);
    }
    return new Response('Not Found', { status: 404 });
  }

  private handleWebSocket(request: Request): Response {
    const [client, server] = Object.values(new WebSocketPair());

    server.accept();
    this.sessions.add(server);

    server.addEventListener('message', (event) => {
      // Broadcast to all connected clients in this room
      const msg = event.data as string;
      this.messages.push(msg);

      for (const session of this.sessions) {
        session.send(msg);
      }
    });

    server.addEventListener('close', () => {
      this.sessions.delete(server);
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}

// Worker routes to the Durable Object
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const roomId = url.searchParams.get('room') ?? 'default';

    // All requests for the same roomId go to the SAME Durable Object instance
    const id = env.CHAT_ROOM.idFromName(roomId);
    const room = env.CHAT_ROOM.get(id);
    return room.fetch(request);
  },
};
```

### Queues — Async Message Processing

Cloudflare Queues is a managed message queue for decoupling work that doesn't need to happen during the request-response cycle. A Worker acts as a producer by sending messages; a separate consumer Worker processes them in batches. This pattern is essential for work that is slow (sending emails, processing uploads), unreliable (third-party API calls that might fail), or high-volume (logging, analytics). The consumer's `message.retry()` re-queues failed messages with automatic exponential backoff.

```typescript
// Producer (in a Worker)
await env.QUEUE.send({
  type: 'email',
  to: 'user@example.com',
  subject: 'Welcome!',
  body: 'Hello...',
});

// Consumer (separate Worker)
export default {
  async queue(batch: MessageBatch<EmailMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        await sendEmail(message.body);
        message.ack();
      } catch (err) {
        message.retry();  // re-queue with backoff
      }
    }
  },
};
```

### Workers AI — Inference at Edge

Workers AI runs ML model inference directly on Cloudflare's GPU-equipped edge nodes. This eliminates the round trip to a centralized inference server — the model runs at the same edge location handling the request, giving lower latency than calling an external AI API. Cloudflare hosts a catalog of open-source models (Llama 3, Mistral, BAAI embeddings) that can be called with a single `env.AI.run()` call with no model management or GPU provisioning required.

```typescript
// Run AI models at the edge — no cold start, low latency
const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: prompt },
  ],
  stream: true,
});

// Embeddings
const { data } = await env.AI.run('@cf/baai/bge-small-en-v1.5', {
  text: ['Hello', 'World'],
});
```

---

## Edge Use Cases & Patterns

### Auth at the Edge

Validating authentication at the edge means unauthenticated requests are rejected before they ever reach your origin server — saving origin compute, reducing attack surface, and improving response time for auth failures. JWT validation is particularly well-suited to the edge because it is stateless (no database lookup needed) and uses Web Crypto API primitives that are available in all edge runtimes. The pattern below also injects user identity into the forwarded request headers so the origin doesn't need to re-validate the token.

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Validate JWT at edge — reject before hitting origin
    const token = request.headers.get('Authorization')?.split(' ')[1];

    if (!token) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      const payload = await verifyJWT(token, env.JWT_SECRET);

      // Inject user context for origin
      const modifiedRequest = new Request(request, {
        headers: {
          ...Object.fromEntries(request.headers),
          'x-user-id': payload.sub,
          'x-user-role': payload.role,
        },
      });

      return fetch(modifiedRequest);
    } catch {
      return Response.json({ error: 'Invalid token' }, { status: 401 });
    }
  },
};
```

### Geo-Routing

Cloudflare Workers receive rich geographic metadata on every request via `request.cf` — country, continent, city, timezone, and even ASN. This metadata is determined at the edge from the connecting IP and requires no third-party geolocation API. Geo-routing is the standard pattern for GDPR compliance (routing EU users to EU-region infrastructure) and for serving localized content (language selection, regional pricing) without a database lookup.

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const country = request.cf?.country ?? 'US';
    const continent = request.cf?.continent ?? 'NA';

    // Route EU users to EU origin (GDPR compliance)
    if (continent === 'EU') {
      const euRequest = new Request(
        request.url.replace('api.example.com', 'eu.api.example.com'),
        request
      );
      return fetch(euRequest);
    }

    return fetch(request);
  },
};
```

### Rate Limiting at Edge

Rate limiting at the edge blocks abusive traffic before it consumes origin resources. The pattern uses KV as a distributed counter keyed by IP address with a TTL equal to the rate limit window. Note that because KV is eventually consistent, this implementation may allow slight over-counting in the brief window between writes propagating globally — for strict accuracy, use Durable Objects (single authoritative counter). KV-based rate limiting is sufficient for most abuse prevention scenarios and is significantly cheaper than Durable Objects at scale.

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const key = `ratelimit:${ip}`;

    const current = parseInt(await env.CACHE.get(key) ?? '0');

    if (current >= 100) {  // 100 req/min
      return new Response('Too Many Requests', {
        status: 429,
        headers: { 'Retry-After': '60' },
      });
    }

    await env.CACHE.put(key, String(current + 1), { expirationTtl: 60 });

    return fetch(request);
  },
};
```

---

## Edge Runtimes Comparison

| Feature | Cloudflare Workers | Vercel Edge | Deno Deploy | AWS Lambda@Edge |
|---------|-------------------|-------------|-------------|-----------------|
| Runtime | V8 Isolates | V8 Isolates | V8 Isolates | Node.js/custom |
| Cold start | ~0ms | ~0ms | ~0ms | 100-500ms |
| Locations | 300+ | ~20 | ~35 | CloudFront POPs |
| CPU limit | 10ms-30s | 25s | uncapped | 5s (viewer) |
| Node.js APIs | No | Limited | Full (Deno 2) | Yes |
| Persistence | KV, D1, DO | Edge Config | KV, DO | None |
| Price | Very cheap | Per invocation | Per request | Per invocation |
| Vendor lock-in | High | Medium | Medium | High |

---

## Limitations of Edge

```
1. No Node.js APIs (most edge runtimes)
   - Can't use libraries that require fs, net, child_process
   - Use Web Crypto instead of Node.js crypto

2. CPU time limits
   - Cloudflare: 10ms free, 30s paid — no long-running computation
   - Not suitable for: video processing, ML inference (unless Workers AI)

3. Memory limits
   - 128MB typical — don't load large datasets

4. Eventual consistency (KV)
   - KV reads may be stale by seconds globally
   - For strong consistency: use Durable Objects or origin DB

5. Cold start "tax" for Durable Objects
   - First access to a new Durable Object has latency

6. Debugging complexity
   - Edge is distributed — harder to trace/debug than centralized
```

---

## Interview Questions

**Q: What is the difference between edge computing and traditional serverless?**
Traditional serverless (Lambda) runs in one or a few regions — requests from distant users have high latency. Edge runs code in 100+ locations close to users. V8 isolate-based edge (Workers) has near-zero cold starts vs 100-500ms for container-based Lambda. Edge is best for: auth, routing, personalization, low-latency APIs. Lambda is better for: long-running tasks, Node.js-heavy code, CPU-intensive work.

**Q: What are Cloudflare Durable Objects?**
Durable Objects provide a single, globally consistent instance per logical entity (identified by a name or ID). All requests for a given ID route to the same instance — enabling stateful coordination (chat rooms, collaborative editing, rate limiters) without external databases. Each Durable Object is like a single-threaded actor with its own storage.

**Q: What can't you do in a Cloudflare Worker?**
No Node.js APIs (fs, net, http module, child_process). CPU limited to 10ms-30s per request. Memory limited to 128MB. Can't run long-running processes. Libraries must use Web Platform APIs or be bundled. No access to the underlying OS. Use these constraints to design workers as lightweight middleware, not full application backends.

**Q: When would you use KV vs Durable Objects?**
KV: globally replicated, eventually consistent (seconds of lag). Great for read-heavy, infrequently-updated data (feature flags, config, caching). Durable Objects: single instance, strong consistency, coordinated state. Use for: real-time collaboration, per-entity counters, session state requiring strong consistency. D1 (SQLite) for relational data needs at edge.
