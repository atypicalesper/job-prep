# Types of Errors in Node.js

## Operational vs Programmer Errors

This is the most important distinction in Node.js error handling.

### Operational Errors — Expected Failures

Operational errors are runtime failures that a correctly-written program must anticipate and handle. They are not bugs — they are the normal consequence of interacting with external systems that can fail: networks go down, files get deleted, users submit bad data. The appropriate response to an operational error is a controlled action: retry with backoff, return a 4xx/5xx response, log the event, fall back to a default. The system remains in a known, consistent state after handling them.

```
Examples:
- Network timeout / connection refused
- File not found (ENOENT)
- Invalid user input
- Database query failed
- Out of disk space
- Permission denied
- API rate limit hit
```

**How to handle:** Gracefully — retry, fallback, return error to user, log and continue.

### Programmer Errors — Bugs

Programmer errors are defects in the code itself — incorrect assumptions about types, null dereferences, algorithm bugs. Unlike operational errors, catching and silently continuing from a programmer error is dangerous: the system is now in an unknown state, and further operations on corrupt data can cause subtle downstream failures that are much harder to diagnose than the original crash. The correct response is to let the process terminate (so the process manager restarts it in a clean state) and fix the defect.

```
Examples:
- TypeError: undefined is not a function
- ReferenceError: x is not defined
- Wrong type passed to function
- Accessing property on null
- Logic errors (wrong algorithm)
```

**How to handle:** Fix the code. In Node.js servers — crash and let process manager restart.

---

## Error Class Hierarchy

JavaScript has a built-in `Error` class hierarchy where each subtype represents a distinct category of mistake. Node.js extends this with *system errors* — objects that have an additional `code` property (e.g., `ENOENT`, `ECONNREFUSED`) corresponding to the underlying OS error code. Understanding the hierarchy lets you write `instanceof` checks that target the right level of specificity: catching a `TypeError` means you want to handle type mistakes; catching only `ENOENT` means you specifically want to handle missing files and let other errors propagate.

```
Error
├── EvalError
├── RangeError         (value out of range — new Array(-1))
├── ReferenceError     (undefined variable)
├── SyntaxError        (invalid JS)
├── TypeError          (wrong type)
├── URIError           (malformed URI)
└── Custom AppErrors   (your application errors)

Node.js System Errors:
├── ENOENT             (No such file or directory)
├── ECONNREFUSED       (Connection refused)
├── EADDRINUSE         (Address already in use)
├── EACCES             (Permission denied)
├── ETIMEDOUT          (Connection timed out)
├── ECONNRESET         (Connection reset by peer)
└── EMFILE             (Too many open files)
```

---

## System Error Codes

When a Node.js I/O operation fails, the error object carries OS-level metadata beyond the message string: `code` (the symbolic error constant like `ENOENT`), `errno` (the numeric code), `syscall` (which OS call failed), and sometimes `path` or `address`. Checking `err.code` rather than parsing `err.message` strings is the correct and stable way to handle specific I/O failures programmatically. For example, `ENOENT` means "create the file", `EADDRINUSE` means "try a different port", and `ECONNRESET` means "the remote peer disconnected mid-request and you should retry".

```javascript
const fs = require('fs');

fs.readFile('/nonexistent', (err) => {
  if (err) {
    console.log(err.code);    // 'ENOENT'
    console.log(err.errno);   // -2 (OS error number)
    console.log(err.syscall); // 'open' (which syscall failed)
    console.log(err.path);    // '/nonexistent'
    console.log(err.message); // "ENOENT: no such file or directory, open '/nonexistent'"
  }
});

// Common error codes and their meanings:
const errorCodes = {
  ENOENT:       'No such file or directory',
  EACCES:       'Permission denied',
  EADDRINUSE:   'Address already in use (port taken)',
  ECONNREFUSED: 'Connection refused (nothing listening)',
  ECONNRESET:   'Connection reset by peer (disconnected)',
  ETIMEDOUT:    'Operation timed out',
  EMFILE:       'Too many open files',
  EPIPE:        'Broken pipe (writing to closed connection)',
  EEXIST:       'File already exists',
};
```

---

## Custom Error Classes

Built-in `Error` types carry only a message and a stack trace, which is insufficient for an application that needs to distinguish a 404 from a 422 or attach structured validation details. Custom error classes solve this by subclassing `Error` and adding domain-specific properties like `statusCode`, `code`, and `details`. The key discipline is calling `Error.captureStackTrace(this, this.constructor)` to exclude the constructor from the stack trace, and setting `this.name` so logs and stack traces identify the subclass rather than just "Error". A shared `isOperational` flag lets the global error handler decide whether to return a structured response (operational) or crash and restart (programmer error).

```javascript
// Base application error
class AppError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code || 'INTERNAL_ERROR';
    this.statusCode = options.statusCode || 500;
    this.isOperational = options.isOperational ?? true; // operational by default
    this.details = options.details || null;

    // Capture proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details
    };
  }
}

// Specific error types
class NotFoundError extends AppError {
  constructor(resource, id) {
    super(`${resource} with id '${id}' not found`, {
      code: 'NOT_FOUND',
      statusCode: 404
    });
    this.resource = resource;
    this.id = id;
  }
}

class ValidationError extends AppError {
  constructor(message, fields) {
    super(message, { code: 'VALIDATION_ERROR', statusCode: 422 });
    this.fields = fields;
  }
}

class AuthError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, { code: 'UNAUTHORIZED', statusCode: 401 });
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, { code: 'FORBIDDEN', statusCode: 403 });
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super(message, { code: 'CONFLICT', statusCode: 409 });
  }
}

// Usage:
async function getUser(id) {
  const user = await db.users.findById(id);
  if (!user) throw new NotFoundError('User', id);
  return user;
}

async function createUser(data) {
  const errors = validate(data);
  if (errors.length) throw new ValidationError('Invalid input', errors);
  // ...
}
```

---

## Error Handling Middleware in Express

Express distinguishes error-handling middleware from regular middleware solely by function arity: a handler with exactly four parameters `(err, req, res, next)` is treated as an error handler and is only invoked when an error is passed to `next(err)`. This central error handler is the right place to: log every error, map `isOperational` errors to structured HTTP responses, and either return a generic 500 or crash the process for programmer errors. Placing all error-formatting logic here keeps route handlers clean and ensures consistent API error shapes across the whole application.

```javascript
// Error handler (must have 4 params):
app.use((err, req, res, next) => {
  // Log all errors
  console.error({
    message: err.message,
    stack: err.stack,
    code: err.code,
    url: req.url,
    method: req.method
  });

  // Operational errors — send proper response
  if (err.isOperational) {
    return res.status(err.statusCode || 500).json({
      error: err.code,
      message: err.message,
      ...(err.fields && { fields: err.fields })
    });
  }

  // Programmer errors — generic response + crash
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Something went wrong' });

  // In production: exit and let PM2/k8s restart
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});
```

---

## Interview Questions

**Q: What is the difference between operational and programmer errors?**
A: Operational errors are expected runtime failures (network timeout, file not found, invalid user input) — handle gracefully with retries, fallbacks, or error responses. Programmer errors are bugs (null reference, wrong type) — don't catch and swallow them, fix the code. In production, programmer errors should crash the process so it restarts in a clean state.

**Q: How do you create a custom error class in Node.js?**
A: Extend `Error`, call `super(message)`, set `this.name`, add custom properties (`statusCode`, `code`, etc.), and call `Error.captureStackTrace(this, this.constructor)` for proper stack traces.

**Q: What does the `err.code` property on a Node.js system error tell you?**
A: It's the OS-level error code as a string (ENOENT, ECONNREFUSED, EADDRINUSE, etc.). Use it to handle specific error types programmatically — e.g., if `err.code === 'ENOENT'` create the file, if `err.code === 'EADDRINUSE'` try a different port.
