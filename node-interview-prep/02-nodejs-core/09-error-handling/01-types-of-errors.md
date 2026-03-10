# Types of Errors in Node.js

## Operational vs Programmer Errors

This is the most important distinction in Node.js error handling.

### Operational Errors — Expected Failures

Runtime problems that are expected in a correctly-written program. NOT bugs.

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

Mistakes in code. Should NOT be caught and swallowed — they indicate unknown state.

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
