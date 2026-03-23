# Error Handling — Tricky Interview Questions

---

## Q1: uncaughtException — Should You Use It?

```javascript
process.on('uncaughtException', (err, origin) => {
  console.error('Uncaught exception:', err.message);
  // Is this safe to continue after?
});

setTimeout(() => {
  throw new Error('boom');
}, 100);
```

**Answer:** You can catch it, but **you should NOT continue running**. After an uncaught exception, the application is in an unknown state (partial operations, corrupted memory, open file handles). The safe pattern:

```javascript
process.on('uncaughtException', (err) => {
  // 1. Log the error
  console.error('FATAL - uncaughtException:', err);
  // 2. Try to close resources gracefully
  server.close(() => {
    // 3. Exit with error code
    process.exit(1);
  });
  // 4. Forced exit if cleanup takes too long
  setTimeout(() => process.exit(1), 5000).unref();
});
```

---

## Q2: unhandledRejection Behavior by Version

```javascript
async function fail() {
  throw new Error('async error');
}

fail(); // No .catch() or await!

// Node.js v14: Warning logged, process continues
// Node.js v15+: Process exits with code 1 by default!
// --unhandled-rejections flag controls behavior
```

**Handle globally:**
```javascript
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1); // recommended
});
```

---

## Q3: try/catch with async — What Does It Catch?

```javascript
async function test() {
  try {
    // Case 1: await — CAUGHT
    await Promise.reject(new Error('awaited rejection'));

    // Case 2: sync throw — CAUGHT
    throw new Error('sync throw');

    // Case 3: setTimeout — NOT CAUGHT
    setTimeout(() => { throw new Error('timer'); }, 0);

    // Case 4: unawaited promise — NOT CAUGHT
    Promise.reject(new Error('unawaited')); // unhandled rejection!
  } catch (e) {
    console.log('caught:', e.message);
  }
}
```

**Only awaited Promises and synchronous throws are caught by try/catch.**

---

## Q4: Error in Promise Chain

```javascript
Promise.resolve()
  .then(() => { throw new Error('from then'); })
  .catch(e => {
    console.log('caught:', e.message);
    throw new Error('from catch'); // rethrowing!
  })
  .then(() => console.log('after catch'))
  .catch(e => console.log('second catch:', e.message));
```

**Output:**
```
caught: from then
second catch: from catch
```

If `.catch()` re-throws, the error propagates to the next `.catch()`. `.then()` after the first `.catch()` is skipped.

---

## Q5: Error vs throw string

```javascript
try {
  throw 'string error'; // string, not Error object
} catch (e) {
  console.log(e instanceof Error); // ?
  console.log(typeof e);           // ?
  console.log(e.stack);            // ?
}
```

**Answer:** `false`, `'string'`, `undefined`

**Why:** You can throw anything in JS — strings, numbers, objects. But you lose the stack trace! Always throw Error objects:
```javascript
throw new Error('message'); // has .stack, .message, .name
```

---

## Q6: Domain Module vs AsyncLocalStorage

```javascript
// domains (deprecated) — old way to associate context with async:
const domain = require('domain');
const d = domain.create();
d.on('error', (err) => console.error('domain caught:', err));
d.run(() => {
  setTimeout(() => { throw new Error('in domain'); }, 100);
  // Domain catches it!
});

// Modern alternative — AsyncLocalStorage for context propagation:
const { AsyncLocalStorage } = require('async_hooks');
const requestContext = new AsyncLocalStorage();

app.use((req, res, next) => {
  requestContext.run({ requestId: uuid() }, next);
});

// Anywhere in the async chain — access the context:
const ctx = requestContext.getStore();
console.log(ctx.requestId); // same ID throughout the request lifecycle
```

---

## Q7: Error Propagation in Streams

```javascript
const readable = fs.createReadStream('nonexistent.txt');
const writable = fs.createWriteStream('output.txt');

// ❌ pipe doesn't forward errors!
readable.pipe(writable);
// readable errors don't propagate to writable
// writable stays open — file handle leak!

// ✅ pipeline handles errors:
pipeline(readable, writable, (err) => {
  if (err) {
    console.error('Pipeline failed:', err.message);
    // both streams are destroyed automatically
  }
});
```

---

## Q8: gracefulExit Pattern

```javascript
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\nReceived ${signal}. Graceful shutdown...`);

  // 1. Stop accepting new connections
  server.close();

  // 2. Wait for in-flight requests to complete
  // (you'd typically track these)

  // 3. Close database connections
  await db.end();

  // 4. Close message queue consumers
  await consumer.disconnect();

  console.log('Cleanup complete, exiting');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('Uncaught:', err);
  gracefulShutdown('uncaughtException').then(() => process.exit(1));
});
```

---

## Q9: Error instanceof Check

```javascript
class DatabaseError extends Error {}
class ConnectionError extends DatabaseError {}

const err = new ConnectionError('db down');

console.log(err instanceof Error);         // ?
console.log(err instanceof DatabaseError); // ?
console.log(err instanceof ConnectionError); // ?
console.log(err.name); // ?
```

**Answer:** `true`, `true`, `true`, `'ConnectionError'`

Custom errors work with `instanceof` through the prototype chain. `err.name` is automatically set to the class name when you extend Error (if you don't override the constructor without calling `super()`).

---

## Q10: try/catch with synchronous EventEmitter

```javascript
const { EventEmitter } = require('events');
const ee = new EventEmitter();

ee.on('error', (err) => {
  console.log('error event caught:', err.message);
});

try {
  ee.emit('error', new Error('emitted error'));
  console.log('after emit');
} catch (e) {
  console.log('try/catch caught:', e.message); // does this run?
}
```

**Answer:** `'error event caught: emitted error'` then `'after emit'`

Since there's an 'error' event listener, the error is handled by it (not thrown). `try/catch` doesn't catch it. If there were NO 'error' listener, `emit('error', err)` WOULD throw and the catch WOULD fire.
