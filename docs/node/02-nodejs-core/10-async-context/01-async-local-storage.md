# AsyncLocalStorage — Request Context Without Prop Drilling

---

## The Problem

```javascript
// Without AsyncLocalStorage: pass context everywhere (prop drilling)
async function handleRequest(req, res) {
  const traceId = req.headers['x-trace-id'];
  const userId = req.user.id;

  // Must pass traceId/userId to EVERY function call:
  const user = await getUser(userId, traceId);
  const permissions = await getPermissions(user, traceId);
  const result = await processRequest(req.body, userId, permissions, traceId);

  // And getUser must pass it down too:
  // async function getUser(id, traceId) {
  //   const data = await db.findUser(id, traceId); // and so on...
  // }
}

// This is tedious and pollutes every function signature.
// AsyncLocalStorage provides implicit context — like a "request-scoped global".
```

---

## Basic Usage

```javascript
const { AsyncLocalStorage } = require('async_hooks');

// Create a store (one per context type):
const requestContext = new AsyncLocalStorage();

// Set context when a request starts:
app.use((req, res, next) => {
  const context = {
    traceId: req.headers['x-trace-id'] || crypto.randomUUID(),
    userId: req.user?.id,
    startTime: Date.now(),
  };

  // Run next() inside the store — all async code within this request
  // will have access to this context:
  requestContext.run(context, next);
});

// Read context anywhere — no need to pass it as argument:
function getContext() {
  return requestContext.getStore();
}

// In any deeply nested function:
async function queryDatabase(sql, params) {
  const ctx = getContext();

  // Automatically has the right context for this request:
  logger.info({ traceId: ctx?.traceId, sql }, 'Running query');

  const result = await db.query(sql, params);

  logger.info({ traceId: ctx?.traceId, rows: result.rowCount }, 'Query complete');
  return result;
}

// Works even after awaits, setTimeouts, or callbacks:
async function handleRequest(req, res) {
  // This function runs inside the store set by middleware
  const user = await getUser(req.params.id); // no context arg needed!
  const orders = await getOrders(user.id);   // still same context
  res.json({ user, orders });
}
```

---

## How It Works Under the Hood

```
AsyncLocalStorage uses async_hooks — Node.js tracks async resource lifecycle:
  - init: new async operation created (setTimeout, Promise, etc.)
  - before/after: async callback about to run / finished
  - destroy: async resource cleaned up
  - promiseResolve: promise resolved

When AsyncLocalStorage.run(store, fn) is called:
  - Associates the store with the current async context ID
  - When new async operations are created (Promises, timers) inside fn,
    they INHERIT the parent's context ID
  - When they execute, AsyncLocalStorage looks up the context by async ID

This is why context persists across:
  - await (creates a new Promise microtask)
  - setTimeout/setInterval callbacks
  - EventEmitter callbacks
  - Streams
  - Any Node.js async primitive
```

---

## Production Pattern: Logger with Automatic Context

```typescript
import { AsyncLocalStorage } from 'async_hooks';
import pino from 'pino';
import { randomUUID } from 'crypto';

// ── Context Store ──────────────────────────────────────────────────────────

interface RequestContext {
  traceId: string;
  spanId: string;
  userId?: string;
  requestPath?: string;
}

const als = new AsyncLocalStorage<RequestContext>();

export function getContext(): RequestContext | undefined {
  return als.getStore();
}

export function runWithContext<T>(
  ctx: RequestContext,
  fn: () => T
): T {
  return als.run(ctx, fn);
}

// ── Auto-Instrumented Logger ───────────────────────────────────────────────

const baseLogger = pino({ level: process.env.LOG_LEVEL || 'info' });

export const logger = {
  info(msg: string, data?: object) {
    baseLogger.info({ ...getContext(), ...data }, msg);
  },
  warn(msg: string, data?: object) {
    baseLogger.warn({ ...getContext(), ...data }, msg);
  },
  error(msg: string, err?: Error, data?: object) {
    baseLogger.error({ ...getContext(), ...data, err }, msg);
  },
};

// ── Express Middleware ─────────────────────────────────────────────────────

export function contextMiddleware(req: any, res: any, next: any) {
  const ctx: RequestContext = {
    traceId: req.headers['x-trace-id'] as string || randomUUID(),
    spanId: randomUUID(),
    userId: req.user?.id,
    requestPath: req.path,
  };

  // Propagate traceId in response headers:
  res.setHeader('x-trace-id', ctx.traceId);

  runWithContext(ctx, next);
}

// ── Usage (anywhere in the codebase) ──────────────────────────────────────

// No context arg needed — it's always available:
async function chargePayment(orderId: string, amount: number) {
  logger.info('Charging payment', { orderId, amount });

  try {
    const result = await paymentGateway.charge({ orderId, amount });
    logger.info('Payment successful', { orderId, transactionId: result.id });
    return result;
  } catch (err) {
    logger.error('Payment failed', err as Error, { orderId });
    throw err;
  }
}
```

---

## Multiple Stores

```typescript
// You can have multiple independent stores:
const requestStore = new AsyncLocalStorage<{ traceId: string }>();
const dbTransactionStore = new AsyncLocalStorage<{ txId: string; client: any }>();

// Nesting: inner run() creates a new context for its scope,
// but the outer store is still accessible:
requestStore.run({ traceId: 'abc' }, async () => {
  console.log(requestStore.getStore()); // { traceId: 'abc' }

  // Nested: creates a new db transaction context
  dbTransactionStore.run({ txId: 'tx-1', client: txClient }, async () => {
    console.log(requestStore.getStore());       // { traceId: 'abc' } — outer still accessible
    console.log(dbTransactionStore.getStore()); // { txId: 'tx-1' }

    await doWorkInTransaction();
  });

  // After nested run(), db store is back to undefined:
  console.log(dbTransactionStore.getStore()); // undefined
});
```

---

## Database Transaction Pattern

```typescript
// Elegant transaction propagation without passing `client` everywhere:
const txStore = new AsyncLocalStorage<{ client: DatabaseClient }>();

// Wrapper that runs a function in a transaction:
async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const client = await db.pool.connect();
  await client.query('BEGIN');

  return txStore.run({ client }, async () => {
    try {
      const result = await fn();
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
}

// Any DB function automatically uses the transaction client if one is active:
async function query(sql: string, params: any[]) {
  const tx = txStore.getStore();
  const client = tx?.client ?? db.pool;  // use transaction client or pool
  return client.query(sql, params);
}

// Usage — no explicit transaction client passing:
await withTransaction(async () => {
  await query('INSERT INTO orders ...', []);
  await query('UPDATE inventory ...', []);
  // Both automatically use the same transaction client
});
```

---

## Performance Considerations

```javascript
// AsyncLocalStorage has overhead — benchmark before heavy use:
// Typically 2-5% overhead in real applications.

// Minimize overhead:
// 1. Don't call getStore() in tight loops — cache it:
async function processItems(items) {
  const ctx = getContext(); // ✅ call once, reuse
  for (const item of items) {
    doSomething(item, ctx); // pass the cached value
  }
}

// 2. disable/enable for non-request code:
// AsyncLocalStorage.disable() — static method, disables ALL instances globally
// Use only in non-async contexts (e.g., synchronous CPU-bound work)

// 3. In Node.js 16+: AsyncLocalStorage is based on AsyncContext API and
// is significantly faster than the original async_hooks implementation.
```

---

## Interview Questions

**Q: What is AsyncLocalStorage and what problem does it solve?**
A: AsyncLocalStorage provides implicit, async-safe context — like thread-local storage in multithreaded languages but for async Node.js code. It solves "context prop drilling": passing requestId/userId/traceId through every function signature. Instead, set context at the request boundary (`als.run(ctx, next)`), and retrieve it anywhere with `als.getStore()`. It persists correctly across `await`, `setTimeout`, streams, and all async operations because Node.js async_hooks track the async resource lifecycle.

**Q: How does AsyncLocalStorage maintain context across `await`?**
A: Node.js async_hooks assign every async operation an ID and track parent-child relationships. When an `await` creates a new Promise microtask, it inherits the parent's async context ID. AsyncLocalStorage stores its map keyed by async context ID — when `getStore()` is called from any callback/continuation, it looks up the current async ID and returns the associated value. This works for Promises, timers, I/O callbacks, and anything built on Node's async primitives.

**Q: What's the difference between `run()` and `enterWith()`?**
A: `run(store, fn)` — scoped: the store is active only during `fn` and its async descendants. The surrounding context is restored after `fn` completes. `enterWith(store)` — unscoped: changes the store for the ENTIRE current async context and all descendants, irreversibly. `enterWith` is rarely the right choice — `run` is almost always preferred because it's predictable and scoped.

**Q: Can AsyncLocalStorage be used for database transactions?**
A: Yes — it's a clean pattern. Wrap the transaction in `als.run({ client }, fn)`. Any database query function checks `als.getStore()` — if a transaction is active, it uses the transaction client; otherwise uses the pool. This lets you compose transactional code without explicitly threading the client through every function call. This is similar to how Hibernate's `@Transactional` works in Java or Flask's `g` object.
