# Error Tracking — Sentry & Distributed Error Context

## Why Error Tracking Matters

```
Without error tracking:
  User: "The app is broken"
  Dev: "Works on my machine"
  → Hours spent reproducing

With error tracking:
  Alert fires: "TypeError: Cannot read 'id' of undefined — 47 occurrences"
  Stack trace: src/handlers/user.ts:82 ← UserService.findById ← GET /api/users/:id
  Breadcrumbs: [login] → [fetch /users] → [click Edit] → ERROR
  Context: user_id=123, version=2.4.1, browser=Safari 17, route=/dashboard
  → Fix in 10 minutes
```

---

## Sentry Setup — Node.js

```bash
npm install @sentry/node @sentry/profiling-node
```

```typescript
// src/instrument.ts — import FIRST before anything else
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: process.env.SENTRY_RELEASE ?? 'unknown',

  // Performance monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  // Profile 10% of sampled transactions
  profilesSampleRate: 0.1,

  integrations: [
    nodeProfilingIntegration(),
    Sentry.httpIntegration(),        // auto-instruments http module
    Sentry.expressIntegration(),     // auto-instruments Express
    Sentry.prismaIntegration(),      // auto-instruments Prisma queries
  ],

  // Don't send errors for these
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    /^Network Error/,
  ],

  beforeSend(event, hint) {
    // Filter or modify events before sending
    if (event.user?.email?.endsWith('@internal.example.com')) {
      return null; // Don't send internal test errors
    }
    return event;
  },
});
```

```typescript
// src/app.ts — import instrument.ts first!
import './instrument';
import express from 'express';
import * as Sentry from '@sentry/node';

const app = express();

// Sentry request handler (must be FIRST middleware)
app.use(Sentry.expressRequestHandler());

app.use(express.json());
app.use(routes);

// Sentry error handler (must be LAST, after all routes)
app.use(Sentry.expressErrorHandler());

// Optional: custom error response after Sentry catches it
app.use((err, req, res, next) => {
  res.status(500).json({
    error: 'Internal server error',
    eventId: res.sentry,  // Sentry event ID — show to user for support
  });
});
```

---

## Sentry Setup — Next.js

```bash
npx @sentry/wizard@latest -i nextjs
# Auto-configures: sentry.client.config.ts, sentry.server.config.ts,
#                  sentry.edge.config.ts, next.config.js instrumentation
```

```typescript
// sentry.server.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // Automatically instruments: fetch, DB queries, Server Actions
});
```

```typescript
// app/global-error.tsx — catches React render errors
'use client';
import * as Sentry from '@sentry/nextjs';
import NextError from 'next/error';
import { useEffect } from 'react';

export default function GlobalError({ error }: { error: Error }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
```

---

## Manual Error Capture

```typescript
import * as Sentry from '@sentry/node';

// Capture exception
try {
  await processPayment(orderId);
} catch (err) {
  Sentry.captureException(err, {
    tags: {
      payment_provider: 'stripe',
      order_id: orderId,
    },
    extra: {
      order_data: order,
    },
    level: 'error',
  });
  throw err; // re-throw if you want it to propagate
}

// Capture a message (non-exception)
Sentry.captureMessage('Payment took >5s', {
  level: 'warning',
  tags: { payment_id: paymentId },
});

// Set user context (for all errors from this user)
Sentry.setUser({
  id: user.id,
  email: user.email,
  username: user.name,
});

// Add breadcrumb (trail of events leading to error)
Sentry.addBreadcrumb({
  category: 'payment',
  message: `Starting payment for order ${orderId}`,
  level: 'info',
  data: { amount: order.total },
});

// Scoped context (doesn't pollute global)
Sentry.withScope((scope) => {
  scope.setTag('background_job', 'email-sender');
  scope.setExtra('job_payload', payload);
  Sentry.captureException(err);
});
```

---

## Performance Monitoring & Tracing

```typescript
// Manual transaction/spans
const transaction = Sentry.startTransaction({
  name: 'process-order',
  op: 'job',
});

Sentry.getCurrentScope().setSpan(transaction);

try {
  const validateSpan = transaction.startChild({
    op: 'validate',
    description: 'Validate order data',
  });
  await validateOrder(order);
  validateSpan.finish();

  const chargeSpan = transaction.startChild({
    op: 'payment',
    description: 'Charge credit card',
  });
  await chargeCard(order);
  chargeSpan.finish();

  transaction.setStatus('ok');
} catch (err) {
  transaction.setStatus('internal_error');
  Sentry.captureException(err);
  throw err;
} finally {
  transaction.finish();
}
```

### Distributed Tracing

When a request spans multiple services, Sentry connects the traces.

```typescript
// Service A (API gateway) — outgoing HTTP request
const response = await fetch('http://users-service/api/user/123', {
  headers: {
    // Sentry auto-injects trace headers when using httpIntegration:
    // sentry-trace: trace-id-value
    // baggage: sentry-trace-id=..., sentry-transaction=...
  },
});

// Service B (users-service) — picks up trace from headers
// Sentry.init with httpIntegration automatically continues the trace
// Both services show as connected spans in Sentry's performance view
```

```
Sentry Trace View:
  GET /api/orders/123 (api-gateway)  250ms
    └── GET /users/456 (users-service)  80ms
          └── SELECT users WHERE id=456 (postgres)  12ms
    └── GET /products/789 (products-service)  140ms
          └── GET products:789 (redis)  2ms  [CACHE HIT]
```

---

## Source Maps — Making Stack Traces Readable

Without source maps, minified stack traces are unreadable.

```
Without source maps:
  TypeError at a.b.c:1:4823

With source maps:
  TypeError at src/services/UserService.ts:82:15
    → UserService.findById
```

### Upload Source Maps to Sentry

```bash
# Next.js — automatic with @sentry/nextjs
# Webpack — use Sentry webpack plugin

npm install @sentry/webpack-plugin --save-dev
```

```typescript
// next.config.ts
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig = { /* ... */ };

export default withSentryConfig(nextConfig, {
  org: 'my-org',
  project: 'my-project',
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload source maps to Sentry, delete from deploy
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,  // don't expose source maps publicly
  },

  // Automatically set release version
  release: { name: process.env.VERCEL_GIT_COMMIT_SHA },
});
```

```yaml
# GitHub Actions — set release
- name: Build
  env:
    SENTRY_RELEASE: ${{ github.sha }}
    SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
  run: npm run build

- name: Create Sentry release
  uses: getsentry/action-release@v1
  env:
    SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
    SENTRY_ORG: my-org
    SENTRY_PROJECT: my-project
  with:
    environment: production
    version: ${{ github.sha }}
```

---

## Error Grouping & Alerting

### Fingerprinting (Custom Grouping)

```typescript
Sentry.init({
  beforeSend(event) {
    // Custom fingerprint — group database errors by query type
    if (event.exception?.values?.[0]?.type === 'DatabaseError') {
      event.fingerprint = [
        'database-error',
        event.tags?.query_type ?? 'unknown',
      ];
    }
    return event;
  },
});
```

### Alert Rules (in Sentry UI or code)

```yaml
# Example alert config (Sentry issue alerts):
- name: "High error rate"
  conditions:
    - type: event_frequency
      value: 100
      interval: 1h
  actions:
    - type: slack
      channel: "#alerts-production"

- name: "New issue in production"
  conditions:
    - type: first_seen_event
  filters:
    - type: tagged_event
      key: environment
      value: production
  actions:
    - type: pagerduty
```

---

## Structured Logging + Error Tracking Together

```typescript
import * as Sentry from '@sentry/node';
import pino from 'pino';

const logger = pino({
  level: 'info',
  // Add Sentry trace ID to every log line
  mixin() {
    const span = Sentry.getActiveSpan();
    const traceId = span ? Sentry.spanToTraceHeader(span) : undefined;
    return { traceId };
  },
});

// Middleware to log + track
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      userId: req.user?.id,
    });

    if (res.statusCode >= 500) {
      Sentry.captureMessage(`${req.method} ${req.path} → ${res.statusCode}`, {
        level: 'error',
        tags: { status_code: String(res.statusCode) },
      });
    }
  });

  next();
});
```

---

## Alternatives to Sentry

| Tool | Type | Strengths |
|------|------|-----------|
| Sentry | Error + Performance | Most popular, great DX, free tier |
| Datadog APM | Full observability | Metrics + traces + logs unified |
| New Relic | Full observability | Good for legacy/enterprise |
| Honeycomb | Traces + events | Great for distributed systems |
| Rollbar | Error tracking | Simple, good Node.js support |
| Bugsnag | Error tracking | Good for mobile + web |
| OpenTelemetry | Standard protocol | Vendor-neutral, integrates with all |

---

## Interview Questions

**Q: What information should you capture with an error?**
At minimum: stack trace, error message, timestamp, environment, release version. For web apps: user ID, browser/OS, URL, HTTP method. For API errors: request headers (minus auth), request body (sanitized), response status. Breadcrumbs — the trail of events leading up to the error. Never log PII (passwords, SSNs, credit cards) in error context.

**Q: What are source maps and why do you delete them after upload?**
Source maps map minified/compiled code back to original source — making stack traces readable (`user.ts:82` instead of `bundle.min.js:1:48293`). You upload them to Sentry so Sentry can un-minify traces server-side. Then delete them from the deployed assets — if publicly accessible, they expose your source code (security risk).

**Q: How does distributed tracing work in Sentry?**
Each service propagates `sentry-trace` and `baggage` HTTP headers. When Service A calls Service B, Sentry instruments the outgoing fetch and injects these headers. Service B's Sentry SDK reads the headers and continues the same trace. In Sentry's UI, you see a unified trace waterfall showing time spent in each service/query — essential for finding the slow part in a multi-service request.

**Q: How do you avoid alert fatigue from error tracking?**
Set appropriate thresholds (alert on spike, not every occurrence), group similar errors by fingerprint, mute known non-actionable errors, configure severity levels (warning vs error vs fatal), route to different channels (PagerDuty for SEV1, Slack for warnings). Review and close resolved issues regularly. Track error budget — if <0.1% of requests error, don't page at night.
