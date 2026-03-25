# Observability — OpenTelemetry & Distributed Tracing

## The Three Pillars of Observability

```
┌──────────────┬─────────────────────────────────────────────────────┐
│ Metrics      │ Aggregated numbers over time: req/s, p99 latency,   │
│              │ error rate. Good for alerting. (Prometheus, Datadog) │
├──────────────┼─────────────────────────────────────────────────────┤
│ Logs         │ Discrete events with context. Good for debugging.    │
│              │ (Winston, Pino, ELK stack)                           │
├──────────────┼─────────────────────────────────────────────────────┤
│ Traces       │ End-to-end journey of a request across services.     │
│              │ Good for latency attribution. (Jaeger, Zipkin, OTLP) │
└──────────────┴─────────────────────────────────────────────────────┘
```

---

## OpenTelemetry (OTel)

OpenTelemetry is a vendor-neutral CNCF standard for collecting telemetry. It replaces per-vendor SDKs (Datadog tracer, Jaeger client, etc.) with a single API.

### Key concepts

Before reading the code, it is important to understand the vocabulary. A *trace* is the complete record of a single request's journey from entry point to final response, potentially spanning dozens of services. A *span* is one unit of work within that trace — "HTTP POST /orders" is one span, "SELECT * FROM orders" is a child span within it. The `trace_id` is a 16-byte random identifier that links all spans from the same original request together across service boundaries. Spans are linked into a tree via `parent_span_id`. An *exporter* ships the finished span data to a backend (Jaeger, Zipkin, Datadog, or an OTel Collector) asynchronously in the background so it never adds latency to the request path.

```
Trace   — A complete request journey across all services
  └─ Span   — One unit of work (e.g., "HTTP POST /orders", "DB query")
       ├─ SpanContext  — trace_id + span_id, propagated across network
       ├─ Attributes   — key/value metadata (http.method, db.statement)
       ├─ Events       — timestamped log-like messages inside a span
       └─ Status       — OK / ERROR

Propagation — How trace context travels between services (W3C TraceContext header)
Exporter    — Where telemetry goes (Jaeger, Zipkin, OTLP collector)
```

### Distributed trace visualization

```
Frontend (span 1)
  │  trace_id: abc123, span_id: 001
  ├── API Gateway (span 2, parent: 001)
  │     span_id: 002
  │     ├── Auth Service (span 3, parent: 002)  → 5ms
  │     └── Orders Service (span 4, parent: 002)
  │           ├── DB query (span 5, parent: 004) → 120ms ← SLOW!
  │           └── Redis get (span 6, parent: 004) → 2ms
```

---

## Setup in Node.js

Setting up OpenTelemetry in Node.js requires installing the SDK, auto-instrumentation packages, and exporters, then loading the instrumentation script before any application code runs (via `node --require`). The auto-instrumentation packages use Node.js's module loading hooks to patch `http`, `express`, `pg`, `redis`, and other popular modules at import time, automatically creating spans for every inbound request and outbound call without any changes to application code. The exporter sends spans to an OTel Collector (or directly to Jaeger/Zipkin in development). Add manual spans on top of auto-instrumentation for business-logic operations that have no built-in instrumentation.

```bash
npm install @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/exporter-prometheus
```

### Instrumentation setup (must run BEFORE requiring app code)

The OTel SDK patches modules at import time using Node.js require hooks. If `tracing.js` is loaded *after* `express` or `pg` have already been required, those modules will not be patched and no spans will be generated for them. The `node --require ./tracing.js` flag guarantees that instrumentation runs before any other module is loaded. In ESM projects, use `--import` instead of `--require`.

```js
// tracing.js — loaded first via node --require ./tracing.js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');

const traceExporter = new OTLPTraceExporter({
  url: 'http://otel-collector:4318/v1/traces',
});

const metricExporter = new PrometheusExporter({
  port: 9464, // scrape at :9464/metrics
});

const sdk = new NodeSDK({
  serviceName: 'orders-service',
  traceExporter,
  metricReader: metricExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': { enabled: true },
      '@opentelemetry/instrumentation-express': { enabled: true },
      '@opentelemetry/instrumentation-pg': { enabled: true },
      '@opentelemetry/instrumentation-redis': { enabled: true },
    }),
  ],
});

sdk.start();

process.on('SIGTERM', () => sdk.shutdown().finally(() => process.exit(0)));
```

```json
// package.json script
{
  "scripts": {
    "start": "node --require ./tracing.js src/server.js"
  }
}
```

### Manual spans for business logic

Auto-instrumentation creates spans for framework-level operations (HTTP request received, SQL query executed) but knows nothing about your business logic. A `process-order` span that wraps the entire payment processing flow is far more informative in a trace than a collection of database and HTTP spans with no business context. The `startActiveSpan` pattern makes the new span "active" in the current async context, so any auto-instrumented operations called inside it automatically become child spans. Always call `span.end()` in a `finally` block — a span that is never ended leaks memory and will not be exported.

```js
const { trace, SpanStatusCode } = require('@opentelemetry/api');
const tracer = trace.getTracer('orders-service', '1.0.0');

async function processOrder(orderId) {
  return tracer.startActiveSpan('process-order', async (span) => {
    span.setAttribute('order.id', orderId);
    span.setAttribute('order.source', 'api');

    try {
      const order = await db.findOrder(orderId); // auto-instrumented DB span
      span.addEvent('order-fetched', { 'order.status': order.status });

      const result = await chargeCustomer(order);
      span.setAttribute('payment.transaction_id', result.transactionId);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      span.recordException(err); // captures stack trace
      throw err;
    } finally {
      span.end(); // ALWAYS end the span
    }
  });
}
```

### Custom metrics

OTel metrics go beyond what auto-instrumentation captures. Counters track cumulative totals (orders created, errors thrown). Histograms capture distributions of values (processing duration, payload size) — they are the right instrument for latency because they let you compute percentiles (p50, p95, p99). Observable gauges capture current state that is sampled periodically (queue depth, active connections, cache size). The key rule: never use high-cardinality values (user IDs, request IDs) as metric attributes — each unique attribute combination creates a separate time series, and millions of time series will crash Prometheus.

```js
const { metrics } = require('@opentelemetry/api');
const meter = metrics.getMeter('orders-service');

// Counter
const ordersCreated = meter.createCounter('orders.created', {
  description: 'Total orders created',
});

// Histogram (for latencies, sizes)
const orderProcessingTime = meter.createHistogram('orders.processing_duration_ms', {
  description: 'Time to process an order',
  unit: 'ms',
});

// Observable gauge (for current state)
const queueDepth = meter.createObservableGauge('queue.depth');
queueDepth.addCallback((result) => {
  result.observe(getCurrentQueueDepth(), { queue: 'orders' });
});

// Usage
async function createOrder(data) {
  const start = Date.now();
  ordersCreated.add(1, { region: data.region, source: data.source });
  try {
    const order = await db.insertOrder(data);
    orderProcessingTime.record(Date.now() - start, { status: 'success' });
    return order;
  } catch (err) {
    orderProcessingTime.record(Date.now() - start, { status: 'error' });
    throw err;
  }
}
```

---

## Context Propagation

When a request crosses a service boundary, the trace context must be passed in headers.

Without context propagation, each service would start a new unrelated trace when it receives a request, making it impossible to reconstruct the end-to-end journey of a single user request across multiple services. The W3C `traceparent` header is the standard carrier: it encodes the `trace_id` (16 bytes, same across the entire distributed trace), the `span_id` of the calling span (16 bytes), and trace flags. Auto-instrumented HTTP clients inject this header automatically on outbound calls, and auto-instrumented HTTP servers extract it and use it as the parent span. Manual propagation is only needed when using non-HTTP transports (message queues, gRPC metadata).

```js
// Outgoing HTTP call — propagate context (auto-instrumented does this)
const { context, propagation } = require('@opentelemetry/api');

async function callInventoryService(orderId) {
  const headers = {};
  propagation.inject(context.active(), headers);
  // headers now contains: { traceparent: '00-abc123...-001-01' }

  const response = await fetch(`http://inventory-service/stock/${orderId}`, { headers });
  return response.json();
}

// Receiving end — extract context (auto-instrumented does this for HTTP)
app.use((req, res, next) => {
  const ctx = propagation.extract(context.active(), req.headers);
  context.with(ctx, next);
});
```

### W3C TraceContext header format

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
             ^^  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^  ^^
           version       trace-id (16 bytes)       parent-span-id    flags
```

---

## Structured Logging with Trace Correlation

Link logs to traces so you can jump from a log line to the full trace.

Structured logging and distributed tracing are complementary: traces show the timeline and causal structure of a request, while logs provide rich free-text context at specific moments. By injecting the current `trace_id` and `span_id` into every log line, you create a bidirectional link — from a log line you can navigate directly to the full trace in Jaeger, and from a slow span in Jaeger you can pull all correlated log lines from Elasticsearch. This correlation eliminates the need to search logs by timestamp (imprecise) or request-specific fields (requires forethought).

```js
const pino = require('pino');
const { trace } = require('@opentelemetry/api');

const logger = pino();

function getTraceContext() {
  const span = trace.getActiveSpan();
  if (!span) return {};
  const { traceId, spanId } = span.spanContext();
  return { traceId, spanId };
}

function createLogger(component) {
  return {
    info: (msg, extra = {}) => logger.info({ ...getTraceContext(), component, ...extra }, msg),
    error: (msg, extra = {}) => logger.error({ ...getTraceContext(), component, ...extra }, msg),
  };
}

const log = createLogger('orders');
log.info('Processing order', { orderId: '99' });
// { traceId: 'abc123', spanId: '001', component: 'orders', orderId: '99', msg: 'Processing order' }
```

---

## Sampling Strategies

Recording every request is expensive. Sampling decides what to keep.

At high throughput (thousands of requests per second), recording 100% of traces would overwhelm both the OTel Collector and the backend storage. Sampling reduces this to a manageable fraction while preserving the traces that matter most. Head sampling (decided at trace start) is simple and low overhead but discards some errors and slow requests randomly. Tail sampling (decided after the trace completes at the Collector) is more sophisticated: it can always keep errors and slow traces (the ones you most need to debug) and sample the uneventful traces at a low rate. Tail sampling requires the OTel Collector to buffer traces until they are complete.

```js
const { ParentBasedSampler, TraceIdRatioBasedSampler } = require('@opentelemetry/sdk-trace-base');

// Always sample if parent says to; otherwise 10% of new traces
const sampler = new ParentBasedSampler({
  root: new TraceIdRatioBasedSampler(0.1), // 10%
});

// Head sampling (decided at trace start) — simple but loses some errors
// Tail sampling (decided after trace completes) — keeps errors, needs OTel Collector
```

### Tail sampling via OTel Collector (recommended)

The OTel Collector's `tail_sampling` processor evaluates completed traces against a set of policies and keeps or drops them based on criteria. The recommended configuration always retains error traces and slow traces (the ones you need most for debugging), then samples the remaining "healthy" traces at a low percentage. `decision_wait` is the buffer time the Collector holds spans before deciding — it must exceed the maximum trace duration in your system.

```yaml
# otel-collector-config.yaml
processors:
  tail_sampling:
    decision_wait: 10s
    policies:
      - name: errors-policy
        type: status_code
        status_code: { status_codes: [ERROR] }   # always keep errors
      - name: slow-policy
        type: latency
        latency: { threshold_ms: 1000 }           # keep slow requests
      - name: sample-rest
        type: probabilistic
        probabilistic: { sampling_percentage: 5 } # 5% of everything else
```

---

## OTel Collector Architecture

```
Services → OTel SDK → OTel Collector → Jaeger (traces)
                                    → Prometheus (metrics)
                                    → Loki (logs)
```

The Collector acts as a buffer and fan-out router, so you can change backends without touching application code.

---

## Interview Q&A

**Q: What's the difference between tracing and logging?**

Logs are individual timestamped events. Traces are causal chains — a trace groups all logs/spans from a single request journey, even across services. You can correlate them by injecting `trace_id` into log lines.

---

**Q: What is a span and what info does it carry?**

A span represents a single unit of work. It carries: operation name, start/end time, attributes (key/value metadata), events (point-in-time log entries), a status (OK/ERROR), and its parent span ID for the tree structure.

---

**Q: How do you avoid performance overhead from tracing?**

1. **Sampling** — only record a % of traces
2. **Async exporting** — export spans in background batches, never in request path
3. **Tail sampling** — keep 100% of errors/slow requests, sample the rest
4. **Attribute cardinality** — avoid high-cardinality attributes (user IDs) as labels in metrics; they explode cardinality in Prometheus

---

**Q: What's the difference between RED and USE metrics?**

**RED** (for services): Rate, Errors, Duration — how is the service performing for users?
**USE** (for resources): Utilization, Saturation, Errors — how is the CPU/memory/DB performing?

---

**Q: How would you debug a latency spike in a microservices call chain?**

1. Check RED metrics — which service's p99 spiked?
2. Open a trace from that time window in Jaeger
3. Identify the slow span (visually the longest bar)
4. Check span attributes and events for context (slow query? lock contention?)
5. Cross-reference with logs using `trace_id`
