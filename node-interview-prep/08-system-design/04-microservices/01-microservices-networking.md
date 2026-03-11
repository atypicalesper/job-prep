# Microservices Networking — Service Discovery, Mesh, and Communication

---

## Service-to-Service Communication Patterns

```
Synchronous (Request-Response):
  REST over HTTP    — simple, universal, human-readable
  gRPC              — binary, fast, streaming, strongly typed
  GraphQL           — flexible queries, good for BFF layer

Asynchronous (Message-Based):
  Message queue     — one sender, one receiver (RabbitMQ, SQS)
  Event streaming   — one sender, many receivers (Kafka, SNS)
  Pub/Sub           — Redis Pub/Sub, Google Pub/Sub

When to choose:
  Sync:  low latency needed, result required to continue, simple CRUD
  Async: can tolerate delay, decoupled lifecycle, fan-out (many consumers),
         event sourcing, order processing, notifications
```

---

## Service Discovery

```
Problem: in microservices, service instances come and go (scaling, restarts,
failures). Hard-coding IP addresses doesn't work.

Solution patterns:

── Client-Side Discovery ─────────────────────────────────────────────────
  Client queries service registry → gets list of instances → picks one → calls it
  Client owns load balancing logic
  Example: Netflix Eureka + Ribbon

    ┌────────┐    query     ┌──────────────┐
    │ Client │ ──────────→ │   Registry   │
    │        │ ←─────────  │  (Consul,    │
    │        │  instances  │   Eureka)    │
    │        │              └──────────────┘
    │        │    call           ┌──────────┐
    │        │ ─────────────────→│ Service  │
    └────────┘                   └──────────┘

── Server-Side Discovery ─────────────────────────────────────────────────
  Client calls a load balancer / API gateway
  Load balancer queries registry, picks instance, forwards request
  Client is unaware of instances
  Example: AWS ALB + ECS, Kubernetes Service

    ┌────────┐    call    ┌───────────┐   query   ┌──────────────┐
    │ Client │ ─────────→ │    LB     │ ─────────→│   Registry   │
    └────────┘             │  (nginx,  │           └──────────────┘
                           │   ALB)   │   forward    ┌──────────┐
                           │          │ ────────────→│ Service  │
                           └───────────┘              └──────────┘

── DNS-Based Discovery ───────────────────────────────────────────────────
  Services registered as DNS entries
  Kubernetes: service.namespace.svc.cluster.local
  Consul: service.service.consul
```

```javascript
// Consul service registration via HTTP API:
async function registerService() {
  await fetch('http://consul:8500/v1/agent/service/register', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Name: 'order-service',
      ID: `order-service-${process.env.HOSTNAME}`,
      Address: process.env.HOST_IP,
      Port: 3000,
      Check: {
        HTTP: `http://${process.env.HOST_IP}:3000/health`,
        Interval: '10s',
        Timeout: '5s',
        DeregisterCriticalServiceAfter: '30s',
      },
    }),
  });
}

// Discover service instances:
async function discoverService(name: string) {
  const res = await fetch(
    `http://consul:8500/v1/health/service/${name}?passing=true`
  );
  const instances = await res.json();
  return instances.map((i: any) => ({
    host: i.Service.Address,
    port: i.Service.Port,
  }));
}

// Simple round-robin client-side LB:
class ServiceClient {
  private index = 0;
  constructor(private readonly serviceName: string) {}

  async call(path: string) {
    const instances = await discoverService(this.serviceName);
    if (!instances.length) throw new Error(`No instances of ${this.serviceName}`);
    const instance = instances[this.index % instances.length];
    this.index++;
    return fetch(`http://${instance.host}:${instance.port}${path}`);
  }
}
```

---

## API Gateway

```
Single entry point for all client requests.
Handles cross-cutting concerns so microservices don't have to.

┌────────────────┐
│   API Gateway  │ ← SSL termination, rate limiting, auth, routing
│                │   request/response transformation, logging, tracing
└────────────────┘
   │    │    │
   ↓    ↓    ↓
  User Order Inventory
  Svc   Svc    Svc

Responsibilities:
  Authentication  — validate JWT/API key before forwarding
  Rate limiting   — per-client or global
  Request routing — /users/* → user-service, /orders/* → order-service
  Load balancing  — across service instances
  SSL termination — backend services use plain HTTP internally
  Request/response transformation — add headers, strip fields
  Caching         — cache GET responses
  API composition — combine responses from multiple services (BFF)
  Observability   — centralized access logs, tracing

Examples: AWS API Gateway, Kong, Nginx, Envoy, Traefik
```

---

## BFF — Backend for Frontend

```
Problem: mobile app, web app, and partner API all have different data needs.
One generic API forces clients to over-fetch or make many requests.

BFF pattern: separate API gateway per client type.

  Mobile App  → Mobile BFF  → User Svc, Order Svc, etc.
  Web App     → Web BFF     → (aggregates, formats for web)
  Partner API → Partner BFF → (filtered, rate-limited, versioned)

Each BFF:
  - Speaks the client's language (REST for web, gRPC for mobile, etc.)
  - Aggregates calls from multiple services
  - Formats data specifically for that client
  - Owned by the frontend team (not shared backend team)

Example — Web BFF aggregating profile page:
```

```javascript
// Web BFF: GET /profile/:userId
// Fetches user + orders + recommendations in parallel
app.get('/profile/:userId', authenticate, async (req, res) => {
  const { userId } = req.params;

  const [user, recentOrders, recommendations] = await Promise.all([
    userService.getUser(userId),
    orderService.getRecentOrders(userId, { limit: 5 }),
    recommendationService.getForUser(userId, { limit: 10 }),
  ]);

  // Shape the response for the web client's needs
  res.json({
    profile: {
      id: user.id,
      name: user.name,
      avatar: user.avatarUrl,
    },
    orders: recentOrders.map(o => ({
      id: o.id,
      total: o.totalAmount,
      status: o.status,
      date: o.createdAt,
    })),
    recommendations: recommendations.map(r => ({
      id: r.productId,
      title: r.productName,
      price: r.price,
      image: r.thumbnailUrl,
    })),
  });
});
```

---

## Circuit Breaker — Preventing Cascade Failures

```
Problem:
  Service A calls Service B. Service B is slow/down.
  Service A accumulates threads/connections waiting for B.
  Service A runs out of resources. Service A goes down.
  Service C calls A. C goes down. Cascade failure.

Circuit Breaker pattern:
  CLOSED (normal): requests pass through, failures counted
    If failures exceed threshold → trip to OPEN

  OPEN (tripped): all requests fail immediately (no network call)
    After timeout → move to HALF-OPEN

  HALF-OPEN (testing): one request allowed through
    Success → back to CLOSED
    Failure → back to OPEN

              failures > threshold
  ┌─────────────────────────────────────────────────────────────────┐
  │                                                                 │
CLOSED ──────────────────────────────────────────────────────────> OPEN
  ^                                                                   │
  │  success                                    timeout expires       │
  └────────── HALF-OPEN <──────────────────────────────────────────  │
                  │
                  └─── failure ──→ OPEN
```

```typescript
type State = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

class CircuitBreaker {
  private state: State = 'CLOSED';
  private failures = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  constructor(
    private readonly failureThreshold = 5,
    private readonly timeout = 60_000,      // ms before HALF_OPEN
    private readonly successThreshold = 2,  // successes to re-close
  ) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime < this.timeout) {
        throw new Error('Circuit breaker OPEN — fast fail');
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.reset();
      }
    } else {
      this.failures = 0;
    }
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.state === 'HALF_OPEN' || this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      this.successCount = 0;
    }
  }

  private reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successCount = 0;
  }

  getState() { return this.state; }
}

// Usage:
const breaker = new CircuitBreaker(5, 30_000);

async function callPaymentService(order: Order) {
  return breaker.call(() =>
    fetch('http://payment-service/charge', {
      method: 'POST',
      body: JSON.stringify(order),
    }).then(r => r.json())
  );
}
```

---

## Service Mesh

```
Problem: every service needs to implement its own:
  - Retries, timeouts
  - mTLS (mutual TLS — service-to-service auth)
  - Circuit breaking
  - Load balancing
  - Tracing headers propagation
  - Rate limiting

Service Mesh: infrastructure layer handling this transparently.

Architecture:
  Each service pod gets a sidecar proxy (Envoy).
  Sidecar intercepts all inbound/outbound traffic.
  Control plane (Istio/Linkerd) manages proxy config.

  Service A ──→ Envoy A ──→ (mTLS) ──→ Envoy B ──→ Service B
                   │                        │
                   └──── metrics/traces ────┘
                              │
                         Control Plane
                         (Istio/Linkerd)

Benefits:
  - mTLS between all services (zero-trust networking)
  - Automatic retries and circuit breaking
  - Traffic splitting (canary: 10% to new version)
  - Distributed tracing without code changes
  - Fine-grained RBAC between services

Tradeoff:
  - Complexity: control plane, sidecar overhead
  - Latency: extra hop through sidecar (~1ms)
  - Learning curve: YAML configuration
```

---

## Distributed Tracing

```javascript
// OpenTelemetry — instrument once, export to any backend (Jaeger, Tempo, etc.)
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { trace, context, propagation, SpanStatusCode } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';

// Bootstrap (before app code):
const sdk = new NodeSDK({
  resource: new Resource({ 'service.name': 'order-service' }),
  traceExporter: new OTLPTraceExporter({
    url: 'http://otel-collector:4318/v1/traces',
  }),
});
sdk.start();

// Propagate trace context across service calls:
const tracer = trace.getTracer('order-service');

async function processOrder(orderId: string) {
  const span = tracer.startSpan('processOrder', {
    attributes: { 'order.id': orderId },
  });

  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      // Propagate W3C traceparent header to downstream:
      const headers: Record<string, string> = {};
      propagation.inject(context.active(), headers);

      const inventory = await fetch('http://inventory-service/check', {
        headers,  // ← carries traceId to downstream service
      });

      span.setStatus({ code: SpanStatusCode.OK });
      return inventory.json();
    } catch (err: any) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      throw err;
    } finally {
      span.end();
    }
  });
}

// Trace headers (W3C standard):
// traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
//              version-traceId-spanId-flags
// tracestate: vendor-specific key=value pairs
```

---

## Retry Patterns — Preventing Thundering Herd

```typescript
// Exponential backoff with jitter:
async function withRetry<T>(
  fn: () => Promise<T>,
  options = { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 10_000 }
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;

      // Don't retry on client errors (4xx):
      if (err.status >= 400 && err.status < 500) throw err;

      if (attempt < options.maxAttempts) {
        // Exponential backoff + full jitter (spread retries over time):
        const exponentialDelay = options.baseDelayMs * (2 ** (attempt - 1));
        const cappedDelay = Math.min(exponentialDelay, options.maxDelayMs);
        const jitteredDelay = Math.random() * cappedDelay; // full jitter

        await new Promise(resolve => setTimeout(resolve, jitteredDelay));
      }
    }
  }

  throw lastError!;
}

// Thundering herd: without jitter, all services retry at the same time
// after a failure — floods the recovering service.
// Full jitter spreads retries uniformly across the backoff window.
```

---

## Common Interview Questions

**Q: How does service discovery work in Kubernetes?**
Each Kubernetes Service gets a stable DNS name: `servicename.namespace.svc.cluster.local`. CoreDNS in the cluster resolves this to a cluster-internal VIP (virtual IP). kube-proxy then load-balances that VIP across healthy pod IPs via iptables/IPVS rules. Pods register/deregister automatically as they start/stop, so the service always routes to healthy instances.

**Q: What is a service mesh and when do you need one?**
A service mesh adds a sidecar proxy (Envoy) to every service pod. It handles mTLS, retries, circuit breaking, and tracing transparently. You need it when: (1) you have many services and don't want each team to re-implement resilience logic, (2) you need zero-trust networking with mutual TLS, (3) you want traffic splitting/canary without app code changes. Tradeoff: significant operational complexity.

**Q: How would you design for resilience when calling an external service?**
1. **Timeout** — never let a single slow call hang indefinitely
2. **Retry** — idempotent requests only, with exponential backoff + jitter
3. **Circuit breaker** — stop calling a failing service immediately
4. **Fallback** — return cached/degraded response when circuit is open
5. **Bulkhead** — isolate resources (separate thread pool/connection pool per downstream)
6. **Idempotency key** — safe to retry without duplication

**Q: BFF vs API Gateway — what's the difference?**
API Gateway: single entry point for all clients — handles auth, routing, rate limiting. Technology/platform concern, usually managed.
BFF: per-client aggregation layer — aggregates data from multiple services, shapes response for a specific client. Product concern, owned by the frontend team. They're complementary: API Gateway handles cross-cutting concerns, BFF handles client-specific aggregation.

**Q: How do you propagate trace context across microservices?**
Use W3C TraceContext standard (`traceparent` header). When service A calls service B, inject the current span's trace ID + span ID into HTTP headers. Service B extracts these headers, creates a child span with the parent span ID. All spans share the same trace ID — a distributed tracing system (Jaeger, Tempo) can then reconstruct the full request path across all services.
