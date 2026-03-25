# Async Error Handling Patterns

## try/catch with async/await

`try/catch` is the standard error-handling mechanism for `async/await` code. It works for both rejected Promises (via `await`) and synchronous exceptions thrown in the async function body. The key property: `catch` only intercepts errors from expressions that are `await`ed — errors inside non-awaited callbacks (like `setTimeout`) escape the `try/catch` because they run in a different call stack context.

```javascript
async function fetchUser(id) {
  try {
    const res = await fetch(`/api/users/${id}`);
    if (!res.ok) {
      throw new Error(`HTTP error: ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    // Catches both:
    // 1. Network errors (fetch rejects)
    // 2. Explicit throws (like the HTTP error above)
    console.error('Failed to fetch user:', err.message);
    throw err; // re-throw if caller needs to handle it
  }
}
```

## .catch() on Promise Chain

`.catch()` can be used as an alternative or complement to `try/catch`. Attaching `.catch(fn)` inline (on a single operation rather than the whole function) lets you handle that specific failure gracefully and continue execution with a fallback value. This is more granular than wrapping the entire function in try/catch and avoids masking errors from unrelated operations.

```javascript
// .catch() at end of chain
fetchUser(1)
  .then(user => process(user))
  .catch(err => {
    console.error('Error in chain:', err);
    return DEFAULT_USER; // recover gracefully
  });

// Inline .catch() for individual operations
async function safeOp() {
  const result = await riskyOp().catch(() => null); // null on error
  if (!result) return; // handle null
  // ...
}
```

## The `to()` Helper — Go-Style Error Handling

Deeply nested try/catch blocks are difficult to read and make error-handling logic harder to follow. The `to()` helper is inspired by Go's multiple-return error pattern: it converts a Promise into a `[error, result]` tuple, so errors and results can be checked with a flat `if` statement rather than nested catch blocks. This keeps the happy path linear while making error handling explicit at each step.

Avoids deeply nested try/catch:

```javascript
function to(promise) {
  return promise
    .then(data => [null, data])
    .catch(err => [err, null]);
}

// Usage — flat, readable:
async function loadDashboard(userId) {
  const [err1, user] = await to(getUser(userId));
  if (err1) return { error: 'User not found' };

  const [err2, orders] = await to(getOrders(userId));
  if (err2) return { user, orders: [] }; // graceful degradation

  return { user, orders };
}
```

## Unhandled Rejections

An unhandled Promise rejection occurs when a Promise rejects and no `.catch()` handler or `try/catch` around an `await` is present to handle it. In Node.js v15 and later, an unhandled rejection terminates the process with a non-zero exit code — the same severity as an uncaught synchronous exception. Earlier Node.js versions only printed a warning, which led to silent failures in production. Always handle rejections, either locally or via a global handler as a safety net.

```javascript
// ❌ Creates unhandled rejection
async function bad() {
  throw new Error('oops');
}
bad(); // No .catch(), no await — unhandled rejection!

// In Node.js v15+: process exits with error
// In Node.js v14-: warning logged

// ✅ Always handle:
bad().catch(console.error);
// or:
try { await bad(); } catch(e) { console.error(e); }

// Global handler (last resort):
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1); // recommended: exit and let process manager restart
});
```

## Error Boundaries in async Functions

An error boundary is a higher-order function that wraps an async operation in a try/catch and provides a fallback value or function on failure. It is a reusable abstraction for the common pattern of "try this, fall back to that." By accepting a fallback as either a value or a function (which receives the error), it handles both simple defaults and error-aware fallback logic.

```javascript
// Wrap entire async flow with error boundary
async function withErrorBoundary(fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    console.error('Error in async operation:', err);
    return typeof fallback === 'function' ? fallback(err) : fallback;
  }
}

const data = await withErrorBoundary(
  () => fetchFromPrimarySource(),
  () => fetchFromFallback() // fallback function
);
```

## Retry with Exponential Backoff

Retry with exponential backoff is the standard resilience pattern for transient failures in distributed systems. After each failed attempt, the delay before the next retry doubles (base × 2^attempt), giving the remote service time to recover. Random jitter (±10%) is added to prevent thundering herd: if many clients retry simultaneously with the same schedule, they hammer the recovering service all at once. The maximum delay cap prevents the backoff from growing impractically large for long retry sequences.

```javascript
async function withRetry(fn, options = {}) {
  const { maxAttempts = 3, baseDelay = 1000, maxDelay = 10000 } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts) throw err; // final attempt — propagate

      const delay = Math.min(baseDelay * 2 ** (attempt - 1), maxDelay);
      const jitter = Math.random() * delay * 0.1; // ±10% jitter
      console.log(`Attempt ${attempt} failed. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
    }
  }
}

// Usage:
const data = await withRetry(() => fetch('/api/data').then(r => r.json()), {
  maxAttempts: 3,
  baseDelay: 500
});
```

## Custom Error Classes

A custom error hierarchy allows you to distinguish between different categories of errors programmatically — checking `err instanceof NotFoundError` rather than parsing `err.message` strings. Extending `Error` properly requires calling `super(message)` to set the `message` property, manually setting `this.name` (because `constructor.name` does not propagate automatically in transpiled code), and using `Error.captureStackTrace` (V8-specific) to exclude the constructor itself from the stack trace. The `isOperational` flag separates expected runtime errors (which should be handled gracefully) from unexpected programmer errors (which should crash the process and trigger an alert).

```javascript
class AppError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code || 'UNKNOWN_ERROR';
    this.statusCode = options.statusCode || 500;
    this.isOperational = options.isOperational ?? true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class NotFoundError extends AppError {
  constructor(resource, id) {
    super(`${resource} with id ${id} not found`);
    this.code = 'NOT_FOUND';
    this.statusCode = 404;
  }
}

class ValidationError extends AppError {
  constructor(message, fields) {
    super(message);
    this.code = 'VALIDATION_ERROR';
    this.statusCode = 422;
    this.fields = fields;
  }
}

// Usage:
async function getUser(id) {
  const user = await db.users.findById(id);
  if (!user) throw new NotFoundError('User', id);
  return user;
}

// Error handler middleware (Express):
app.use((err, req, res, next) => {
  if (err instanceof AppError && err.isOperational) {
    return res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      ...(err.fields && { fields: err.fields })
    });
  }
  // Programmer errors — log and crash
  console.error('FATAL:', err);
  process.exit(1);
});
```

## Interview Questions

**Q: What is the difference between operational errors and programmer errors?**
A: Operational errors are expected runtime failures (network issues, invalid user input, DB unavailable). Programmer errors are bugs (undefined is not a function, accessing null). Operational errors should be handled gracefully. Programmer errors should crash the process (they indicate unknown state).

**Q: Why should you always add a global unhandledRejection handler?**
A: Unhandled Promise rejections that aren't caught will crash Node.js v15+ (or just log a warning in older versions). A global handler is a safety net to log the error and exit cleanly, allowing a process manager (PM2, Kubernetes) to restart.

**Q: What's wrong with a generic catch-all `catch(err) { console.log(err) }` pattern?**
A: It swallows errors silently — the caller never knows something went wrong. You should either re-throw, return an error indicator, or log AND re-throw. Blind error swallowing hides bugs.
