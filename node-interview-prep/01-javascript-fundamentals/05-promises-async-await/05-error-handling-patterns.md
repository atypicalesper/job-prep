# Async Error Handling Patterns

## try/catch with async/await

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
