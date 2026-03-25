# Express vs Fastify — Internals and Comparison

---

## Express Internals

### How Express Middleware Works

Express is built around a single central concept: the middleware stack. When a request arrives, Express walks an ordered array of middleware functions one at a time. Each function receives `req`, `res`, and `next` — calling `next()` passes control to the next function, calling `next(err)` skips ahead to the nearest 4-argument error handler, and writing to `res` (without calling `next`) ends the chain. This flat, sequential model is simple to understand and debug, but has no lifecycle concept: all middleware is equivalent, and the order of `app.use()` calls determines execution order. Understanding the stack as a linked list explains why error handling middleware must have exactly four parameters (Express counts them via `fn.length` to distinguish it) and why middleware registered after a route handler never runs for that route's matched requests.

```javascript
// Express is essentially a linked list of middleware functions.
// Each middleware receives (req, res, next) and calls next() to pass control.

const express = require('express');
const app = express();

// app.use() registers middleware in order:
app._router.stack = [
  { handle: bodyParserMiddleware, ... },
  { handle: authMiddleware, ... },
  { handle: routeHandler, ... },
  { handle: errorHandler, ... },  // 4-arg signature
];

// When a request comes in, Express walks the stack:
// 1. Does this layer match? (path prefix, method)
// 2. Call layer.handle(req, res, next)
// 3. If next() called → advance to next layer
// 4. If next(err) called → skip to next error handler (4-arg)
// 5. If res.send() called → stop (response sent)
```

```javascript
// Implementing a mini Express to understand it:
class MiniExpress {
  private middlewares: Function[] = [];

  use(fn: Function) {
    this.middlewares.push(fn);
    return this;
  }

  handle(req: any, res: any) {
    let index = 0;

    const next = (err?: Error) => {
      if (index >= this.middlewares.length) return;
      const middleware = this.middlewares[index++];

      if (err) {
        // Error middleware has 4 args: (err, req, res, next)
        if (middleware.length === 4) {
          middleware(err, req, res, next);
        } else {
          next(err); // skip non-error middleware
        }
      } else {
        if (middleware.length === 4) {
          next(); // skip error middleware when no error
        } else {
          try {
            middleware(req, res, next);
          } catch (e) {
            next(e as Error);
          }
        }
      }
    };

    next();
  }
}
```

### Error Handling in Express

```javascript
// Regular middleware: (req, res, next)
// Error middleware: (err, req, res, next) — 4 args, MUST have 4

// Express detects error middleware by function.length === 4

// ❌ This doesn't work as error middleware (3 args):
app.use((err, req, res) => {  // length === 3 — treated as regular middleware!
  res.status(500).json({ error: err.message });
});

// ✅ Must have all 4 parameters:
app.use((err, req, res, next) => {  // length === 4
  res.status(500).json({ error: err.message });
});

// Async error handling — must catch and call next(err):
app.get('/users', async (req, res, next) => {
  try {
    const users = await db.getUsers();
    res.json(users);
  } catch (err) {
    next(err);  // ← without this, Express never sees the error
  }
});

// Helper wrapper to avoid try/catch everywhere:
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

app.get('/users', asyncHandler(async (req, res) => {
  const users = await db.getUsers();
  res.json(users);  // if this throws, .catch(next) handles it
}));
```

### Express Router

`express.Router()` creates an isolated mini-application with its own middleware stack that can be mounted under a path prefix. Routers let you organise related routes and their middleware together — all user-related routes and the `authMiddleware` that protects them live in one file, mounted at `/api/v1`. The `router.param()` hook is a convenience for loading a route parameter resource (e.g., `findUser(id)`) once before any route handler that uses that parameter, avoiding the repetition of loading the same resource in every individual handler. Chaining `.get().put().delete()` on `router.route(path)` documents all supported methods on a path in one readable block.

```javascript
// Router is a mini-app — has its own middleware stack
const router = express.Router();

// Mount at a prefix:
app.use('/api/v1', router);

// Route parameters:
router.param('userId', async (req, res, next, userId) => {
  // Runs before any route handler that has :userId
  req.user = await db.findUser(userId);
  next();
});

router.get('/users/:userId', (req, res) => {
  res.json(req.user);  // already loaded by param middleware
});

// Chaining route methods:
router.route('/users/:id')
  .get(getUser)
  .put(updateUser)
  .delete(deleteUser);
```

---

## Fastify Internals

### Why Fastify Is Faster Than Express

Fastify achieves 4–5x higher throughput than Express on the same hardware through several compounding optimisations, not a single silver bullet. The most impactful is response serialisation: instead of calling `JSON.stringify` at runtime (which must inspect every object property via reflection), Fastify generates a specialised serialisation function from the route's response JSON Schema at startup time. This compiled function is 2–10x faster for large payloads. The second major gain is the radix-tree router (`find-my-way`) which matches routes in O(log n) rather than Express's O(n) linear stack walk. Schema-based request validation via Ajv (compiled to native functions, not interpreted) replaces runtime reflection for body validation. Together these optimisations reduce per-request overhead dramatically on CPU-bound, high-throughput workloads.

```
Benchmarks (typical, request/sec on 1 core):
  Express:   ~15,000 req/sec
  Fastify:   ~70,000 req/sec (4-5x)

Reasons:
  1. JSON serialization: uses fast-json-stringify (schema-based serialization)
     Bypasses JSON.stringify — generates optimized code from a schema
     ~2-10x faster than JSON.stringify for large payloads

  2. JSON parsing: uses @fastify/fast-json-parser
     Faster than JSON.parse in many scenarios

  3. Schema-based validation: uses Ajv at the route level
     Validates + coerces request body based on JSON Schema
     No runtime reflection — compiled validators

  4. Route matching: uses find-my-way (radix tree router)
     O(log n) matching vs Express's O(n) linear scan

  5. No unnecessary allocations:
     Fewer function call layers, less garbage collection pressure

  6. Plugin system: lifecycle hooks instead of middleware
     More predictable, no middleware ordering surprises
```

### Fastify Plugin Architecture

The Fastify plugin system is the architectural concept that makes Fastify composable at scale. Every `app.register(fn)` call creates an encapsulated context: decorators, hooks, and routes registered inside the plugin function are invisible to sibling plugins and the parent scope. This prevents plugin conflicts (two plugins both trying to add a `req.user` decorator won't clobber each other) and enables clean auth scoping (register an auth hook inside an `api` plugin so it only guards API routes, not public routes outside). When you need a plugin's additions to be visible to the whole app — a database connector, a shared utility — use `fastify-plugin` to opt out of encapsulation.

```javascript
import Fastify from 'fastify';

const app = Fastify({
  logger: true,
  // Schema-based JSON serialization:
  ajv: {
    customOptions: { removeAdditional: true, coerceTypes: true }
  }
});

// Plugins encapsulate scope:
app.register(async function userPlugin(fastify) {
  // This decorator is only available inside this plugin and its children:
  fastify.decorate('getUserFromDb', async (id) => db.findUser(id));

  // Route with full schema:
  fastify.post('/users', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'email'],
        properties: {
          name: { type: 'string', minLength: 1 },
          email: { type: 'string', format: 'email' },
        },
        additionalProperties: false,  // strips unknown fields
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            email: { type: 'string' },
          },
        },
      },
    },
    // Handler — no try/catch needed, errors propagate to error handler:
    handler: async (request, reply) => {
      const user = await fastify.getUserFromDb(request.body);
      reply.code(201).send(user);
    },
  });
}, { prefix: '/api/v1' });
```

### Fastify Lifecycle Hooks

Fastify replaces Express's flat middleware model with a structured lifecycle of named hooks, each corresponding to a specific stage in request processing. Rather than a single undifferentiated stack, each hook fires at a precise moment: `onRequest` before the body is read, `preValidation` before schema validation, `preHandler` before your route handler, and `preSerialization` before the response is JSON-encoded. This structure lets you apply logic at exactly the right stage — for example, rate-limiting in `onRequest` (before expensive body parsing), auth in `preHandler` (after validation confirms the request is well-formed), and response transformation in `preSerialization`. Hooks registered inside `app.register(...)` are scoped to that plugin's routes, giving clean isolation without shared global middleware.

```
Request lifecycle in Fastify (in order):
  onRequest       → raw request, before parsing
  preParsing      → before body parsing
  preValidation   → before schema validation
  preHandler      → before route handler
  [handler]       → your actual code
  preSerialization → before response serialization
  onSend          → response ready to send
  onResponse      → response sent
  onError         → on error (alternative to error handler)

Express equivalent: middleware stack (flat, ordered)
Fastify: lifecycle hooks (structured, per-stage)
```

```javascript
// Hook example — add request ID:
app.addHook('onRequest', async (request, reply) => {
  request.id = crypto.randomUUID();
  request.log.info({ requestId: request.id }, 'request received');
});

// Hook to add timing:
app.addHook('onResponse', async (request, reply) => {
  const duration = reply.elapsedTime;
  request.log.info({ duration, status: reply.statusCode }, 'response sent');
});

// Plugin-scoped hook (only runs for routes in this plugin):
app.register(async (fastify) => {
  fastify.addHook('preHandler', authenticate); // only for routes in this scope

  fastify.get('/protected', async (req) => {
    return { user: req.user };
  });
});

app.get('/public', async (req) => {
  // authenticate hook does NOT run here
  return { status: 'ok' };
});
```

### Fastify Error Handling

Fastify centralises error handling through `setErrorHandler`, a single function that receives every error thrown from any route handler or hook. This is more explicit than Express's 4-argument error middleware (where the arity distinction is a hidden convention) and runs automatically for both synchronous throws and rejected async Promises — no `try/catch` + `next(err)` wrapper is required in handlers. Fastify pre-populates `error.validation` for schema validation failures, so you can distinguish malformed-request errors (return 400) from application errors (return domain-appropriate status) from unknown errors (log and return 500) all in one function.

```javascript
// Set a custom error handler:
app.setErrorHandler(async (error, request, reply) => {
  // Validation errors from schema:
  if (error.validation) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: error.message,
      details: error.validation,
    });
  }

  // Custom app errors:
  if (error.statusCode) {
    return reply.status(error.statusCode).send({
      statusCode: error.statusCode,
      error: error.name,
      message: error.message,
    });
  }

  // Unknown errors — log and return 500:
  request.log.error(error, 'unhandled error');
  reply.status(500).send({ statusCode: 500, error: 'Internal Server Error' });
});

// Throwing custom errors:
class NotFoundError extends Error {
  statusCode = 404;
  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
  }
}

app.get('/users/:id', async (request) => {
  const user = await db.findUser(request.params.id);
  if (!user) throw new NotFoundError('User');  // caught by error handler
  return user;
});
```

---

## Head-to-Head Comparison

The fundamental difference between Express and Fastify is philosophy: Express is a minimal, flexible middleware framework that makes no assumptions about validation, serialisation, or logging — you add those yourself. Fastify is an opinionated performance framework with all of those built in via its schema and plugin system. Express's simplicity is a strength for teams that want full control or are adding one-off endpoints; Fastify's batteries-included approach pays off when you want consistent request validation, fast serialisation, and structured logging without gluing them together yourself.

```
Feature              | Express                  | Fastify
─────────────────────┼──────────────────────────┼─────────────────────────────
Performance          | ~15k req/s               | ~70k req/s
JSON serialization   | JSON.stringify (slow)    | fast-json-stringify (schema)
Body parsing         | body-parser (manual)     | built-in
Validation           | manual (joi, zod, etc.)  | built-in (Ajv, JSON Schema)
TypeScript           | @types/express (patchy)  | First-class types
Plugin system        | Flat middleware           | Encapsulated, scoped
Route matching       | O(n) linear              | O(log n) radix tree
Logging              | console / manual         | Built-in pino
Schema docs          | Swagger plugin           | Built-in OpenAPI support
Learning curve       | Very low                 | Low-medium
Ecosystem            | Huge, 10+ years          | Growing, 6+ years
Use at              | Vercel, many startups     | NestJS uses it internally
```

---

## When to Choose What

```
Choose Express when:
  ✓ Team already knows Express
  ✓ Lots of Express middleware needed (passport.js, etc.)
  ✓ Performance not critical (<10k req/s)
  ✓ Rapid prototyping
  ✓ Maximum ecosystem flexibility

Choose Fastify when:
  ✓ Performance matters (high-traffic APIs)
  ✓ Want schema validation built-in (reduces boilerplate)
  ✓ TypeScript-first project
  ✓ Want built-in OpenAPI docs generation
  ✓ New project, team willing to learn new patterns

Alternatives:
  Hono:       Ultra-fast, edge-compatible (Cloudflare Workers, Deno)
  tRPC:       End-to-end typesafe APIs (TypeScript only)
  NestJS:     Opinionated full framework (uses Express or Fastify underneath)
  Koa:        Express successor by same team, async-first, minimal
  Elysia:     Bun-native, extremely fast, TypeScript-first
```

---

## Common Interview Questions

**Q: How does Express middleware work internally?**
Express maintains an ordered array (stack) of middleware functions. When a request comes in, it walks the stack checking if each layer matches the request path/method. Calling `next()` advances to the next layer. Calling `next(err)` skips to the next 4-argument error handler. Each layer is a closure capturing its handler function.

**Q: Why doesn't Express handle async errors automatically?**
Express was designed before async/await. Its error handling relies on `next(err)` being called synchronously. An unhandled rejected promise in a route handler won't call `next(err)` — it just becomes an unhandled rejection. Solutions: wrap in try/catch + call `next(err)`, use an `asyncHandler` wrapper, or Express 5.x (which finally handles async errors natively).

**Q: What makes Fastify faster than Express?**
Schema-based JSON serialization (fast-json-stringify generates optimized serializers), compiled Ajv validators instead of runtime reflection, radix tree routing (O(log n) vs O(n) linear scan), fewer abstraction layers, and pino logging (fast asynchronous logger). The biggest win is serialization — bypassing `JSON.stringify` for large payloads.

**Q: What is the Fastify plugin system?**
Plugins are async functions that receive a scoped Fastify instance. Decorators, hooks, and routes registered inside a plugin are scoped to that plugin and its children (using `fastify-plugin` breaks encapsulation intentionally). This prevents plugin conflicts and allows clean composition. It's the fundamental difference from Express's flat middleware model.

**Q: How do you add TypeScript types to Express `req` and `res`?**
Use module augmentation to extend the `Request` interface:
```typescript
declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
    requestId: string;
  }
}
```
Set the property in middleware, and TypeScript knows about it everywhere. Fastify uses generics directly on route handlers — more type-safe and doesn't require module augmentation.
