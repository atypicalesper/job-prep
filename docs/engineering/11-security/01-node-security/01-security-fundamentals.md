# Node.js Security Fundamentals

---

## OWASP Top 10 for Node.js

The OWASP Top 10 is the industry standard reference for web application security risks, maintained by the Open Web Application Security Project and updated periodically based on real-world vulnerability data. It represents the most exploited and highest-impact classes of vulnerabilities rather than individual bugs. For Node.js applications specifically, the risks are shaped by the ecosystem: JavaScript's dynamic typing makes injection vulnerabilities easier to introduce, npm's large dependency surface creates supply-chain risks, and the async-first model can mask error handling gaps that become security holes. The list is ordered by prevalence and impact — Broken Access Control has been the number one risk since 2021 because it is both common and catastrophic.

```
1. Broken Access Control         — authorization bypasses
2. Cryptographic Failures        — weak/missing encryption
3. Injection                     — SQL, NoSQL, OS command injection
4. Insecure Design               — missing security patterns
5. Security Misconfiguration     — wrong defaults, exposed info
6. Vulnerable Components         — outdated packages with CVEs
7. Authentication Failures       — weak passwords, no rate limiting
8. Software/Data Integrity Failure — unverified updates, dependencies
9. Security Logging Failures     — not detecting/logging attacks
10. SSRF                         — fetching arbitrary internal URLs
```

---

## Input Validation

Input validation is the first and most fundamental defense in application security: all data arriving from outside the trust boundary (HTTP request bodies, query parameters, headers, file uploads) must be treated as potentially hostile until proven otherwise. Validation serves two purposes — it rejects malformed data early with a clear error message (422), and it normalizes and sanitizes what passes through (trimming whitespace, lowercasing emails, coercing types) so that downstream code can make safe assumptions about the data's shape. Zod is preferred in TypeScript projects because its schema definitions produce TypeScript types directly, eliminating the gap between runtime validation and static typing. The middleware pattern below shows the standard approach: validate at the route boundary so that handler functions receive data that is already typed and safe.

```typescript
// Never trust user input — validate at every boundary

import Joi from 'joi';
// Or zod (TypeScript-native):
import { z } from 'zod';

// Zod schema:
const CreateUserSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  email: z.string().email().toLowerCase(),
  age: z.number().int().min(0).max(150).optional(),
  role: z.enum(['user', 'admin']).default('user'),
});

// Middleware:
function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(422).json({
        error: 'VALIDATION_ERROR',
        details: result.error.flatten()
      });
    }
    req.body = result.data; // use parsed/cleaned data
    next();
  };
}

app.post('/users', validateBody(CreateUserSchema), createUserHandler);
```

---

## SQL Injection Prevention

SQL injection is one of the oldest and most devastating vulnerabilities in web applications: when user-supplied data is interpolated directly into SQL query strings, an attacker can terminate the intended query and append their own SQL — reading arbitrary tables, deleting data, or in some configurations executing operating system commands. It survives because string concatenation looks simple and harmless until it isn't. The complete defense is parameterized queries (prepared statements), where the SQL structure and the user data are sent to the database separately — the database treats the parameter as a value, never as SQL syntax, making injection structurally impossible regardless of what the attacker sends.

```typescript
// ❌ NEVER do this — SQL injection vulnerable:
app.get('/users', async (req, res) => {
  const name = req.query.name;
  const users = await db.query(`SELECT * FROM users WHERE name = '${name}'`);
  // Attacker: name = "'; DROP TABLE users; --"
});

// ✅ Always use parameterized queries:
app.get('/users', async (req, res) => {
  const name = req.query.name as string;
  const users = await db.query('SELECT * FROM users WHERE name = $1', [name]);
  // Parameter is never interpreted as SQL
});

// ✅ With ORMs (also safe):
const users = await User.findAll({ where: { name } }); // Sequelize
const users = await prisma.user.findMany({ where: { name } }); // Prisma
```

---

## NoSQL Injection Prevention

NoSQL databases like MongoDB are not immune to injection attacks — they simply use a different attack surface. Because MongoDB queries are expressed as JavaScript objects, an attacker who can control the shape of that object (not just its values) can inject MongoDB query operators like `$gt`, `$where`, and `$regex` to bypass authentication or exfiltrate data. This is possible when user input from a JSON body is merged directly into a query object without type-checking that the values are primitives. The defenses are explicit type validation (reject anything that isn't a string where a string is expected) and sanitization middleware that strips operator keys before they reach the database.

```typescript
// ❌ MongoDB injection:
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  // Attacker sends: { "username": {"$gt": ""}, "password": {"$gt": ""} }
  // This matches every user!
  const user = await User.findOne({ username, password });
});

// ✅ Sanitize query operators:
import mongoSanitize from 'express-mongo-sanitize';
app.use(mongoSanitize()); // removes $ and . from inputs

// ✅ Explicit type validation:
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Invalid input' });
  }
  // Now safe to use in query
});
```

---

## XSS (Cross-Site Scripting) Prevention

Cross-Site Scripting occurs when an attacker injects malicious scripts into web pages that are then executed in other users' browsers. The injected script runs with the same privileges as legitimate page scripts — meaning it can steal session cookies, make authenticated API requests on behalf of the victim, and exfiltrate sensitive data. XSS is a shared responsibility between backend and frontend: the backend must not reflect unescaped user input in HTML responses, and the frontend must not insert user-controlled strings into the DOM via `innerHTML`. Content Security Policy (CSP) provides a defense-in-depth layer at the browser level by restricting which script sources are trusted, so even if injection occurs the browser refuses to execute the injected script.

```typescript
// Backend responsibility: don't return executable scripts in responses
// Frontend responsibility: don't use innerHTML with user data

// Content Security Policy (CSP) via helmet:
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // avoid unsafe-inline if possible
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
    }
  }
}));

// Sanitize HTML output when you must render user content:
import DOMPurify from 'dompurify';
const safeHtml = DOMPurify.sanitize(userInput);

// Escape for HTML (if not using a templating engine that auto-escapes):
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

---

## Helmet — Security Headers

HTTP response headers are the first line of defense at the browser level: they instruct the browser how to handle the response and what it is permitted to do with it. Without them, browsers apply permissive defaults that enable entire classes of attacks — pages can be embedded in iframes on attacker-controlled sites (clickjacking), browsers will try to guess the MIME type of responses (MIME confusion attacks), and there is no restriction on where scripts can load from (XSS via injected script tags). Helmet is an Express middleware that sets these headers in a single line, applying the recommended defaults for each header. It is a zero-cost defense that should be applied to every Express application.

```typescript
import helmet from 'helmet';

app.use(helmet()); // enables all default protections:

// What helmet sets:
// Content-Security-Policy: prevent XSS
// X-Content-Type-Options: nosniff (no MIME sniffing)
// X-Frame-Options: DENY or SAMEORIGIN (clickjacking prevention)
// X-XSS-Protection: 0 (modern browsers, CSP is better)
// Strict-Transport-Security: HTTPS only (HSTS)
// Referrer-Policy: no-referrer (privacy)
// Permissions-Policy: disable camera, microphone by default

// Remove X-Powered-By (don't advertise Express):
app.disable('x-powered-by'); // helmet does this too
```

---

## Rate Limiting

Without rate limiting, any authenticated or unauthenticated endpoint can be called indefinitely from a single client, enabling brute-force attacks (trying millions of passwords against a login endpoint), credential stuffing, denial-of-service by resource exhaustion, and scraping. Rate limiting counters requests per client IP (or per user ID) within a sliding time window and rejects requests that exceed the threshold. The key design decisions are: the window size and request limit (too loose and you don't stop attacks; too strict and you break legitimate users), whether to store counters in memory (fine for single-server) or Redis (required for multiple server instances where each server would otherwise have an incomplete view of the client's request rate), and whether to apply separate, stricter limits to sensitive endpoints like login and password reset.

```typescript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

// Global rate limit:
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,                  // 100 requests per window
  standardHeaders: true,     // Return rate limit info in headers
  legacyHeaders: false,
  store: new RedisStore({ client: redis }), // distributed
  message: { error: 'Too many requests, try again later' }
});
app.use(limiter);

// Stricter limit for auth routes:
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 login attempts per 15 minutes
  skipSuccessfulRequests: true, // don't count successful logins
});
app.use('/auth/login', authLimiter);
```

---

## CORS (Cross-Origin Resource Sharing)

CORS is a browser security mechanism that restricts JavaScript running on one origin (`https://malicious.com`) from making requests to a different origin (`https://yourapi.com`) and reading the response. Without CORS headers, the browser blocks the response even if the server processed the request. The critical security principle is that `Access-Control-Allow-Origin: *` disables the protection entirely — and when combined with `credentials: true` (which allows cookies to be sent), browsers will outright refuse to make the request. A precise allowlist of trusted origins is the correct approach, with the `development` environment loosened only for localhost. Using `cors()` with no options (wildcard) is common in tutorials but should never reach production for APIs that use cookies or handle sensitive data.

```typescript
import cors from 'cors';

// Configure CORS precisely:
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'https://myapp.com',
      'https://app.myapp.com',
      process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : ''
    ].filter(Boolean);

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true, // allow cookies
  maxAge: 86400,     // preflight cache 24h
};

app.use(cors(corsOptions));

// Don't use: app.use(cors()) — allows ALL origins
```

---

## Prototype Pollution

Prototype pollution is a JavaScript-specific vulnerability that exploits the language's prototype chain. Every plain object in JavaScript inherits from `Object.prototype`, and if an attacker can cause your code to assign a property to `Object.prototype` itself (via keys like `__proto__` or `constructor.prototype`), every subsequent object in the process inherits that property — including server-side objects used for authorization checks. The attack vector is typically a JSON body containing `{"__proto__": {"isAdmin": true}}` that gets deep-merged into another object without filtering. The defenses are layered: strict schema validation that rejects unknown keys (Zod strips `__proto__` because it's not in the schema), explicit key checking in any custom merge functions, and using `Object.create(null)` for dictionaries that should be immune to inherited properties.

```typescript
// Vulnerability: attacker can pollute Object.prototype
// E.g., body: { "__proto__": { "admin": true } }
// After merge, every object has .admin === true!

// ❌ Unsafe deep merge:
function merge(target: any, source: any) {
  for (const key of Object.keys(source)) {
    if (typeof source[key] === 'object') {
      merge(target[key], source[key]); // VULNERABLE!
    } else {
      target[key] = source[key];
    }
  }
}

// ✅ Safe merge — check for prototype keys:
function safeMerge(target: any, source: any) {
  for (const key of Object.keys(source)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue; // skip dangerous keys
    }
    if (typeof source[key] === 'object' && source[key] !== null) {
      if (!target[key]) target[key] = {};
      safeMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
}

// ✅ Use Object.create(null) for dictionaries:
const dict = Object.create(null); // no prototype — immune to pollution!
dict.__proto__; // undefined — doesn't access Object.prototype

// ✅ Validate input schema strictly (Zod/Joi blocks unknown keys)
// ✅ npm package: sanitize-html, object-path-immutable avoid this
```

---

## Secrets Management

Hardcoded secrets in source code are one of the most common and most costly security mistakes — they are committed to version control, shared with every contributor, and often accidentally pushed to public repositories. Secrets have a fundamentally different lifecycle from code: they need to be rotated when compromised, scoped to environments, and audited for access. The correct model is to keep secrets entirely out of source code and build artifacts, injecting them at runtime via environment variables validated at startup. Validating at startup (not lazily on first use) ensures the application fails immediately and loudly if a required secret is missing, rather than silently in production when a code path that uses the missing secret is hit for the first time.

```typescript
// ❌ Never hardcode secrets:
const apiKey = 'sk-123456789'; // in source code
const dbPassword = 'password123'; // version controlled!

// ✅ Environment variables:
const apiKey = process.env.STRIPE_API_KEY;
if (!apiKey) throw new Error('STRIPE_API_KEY is required');

// ✅ Validate at startup with envalid/zod:
import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  STRIPE_API_KEY: z.string().startsWith('sk-'),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export const env = EnvSchema.parse(process.env);
// Throws at startup if any required variable is missing

// ✅ .env in .gitignore:
// .env — local secrets, NEVER committed
// .env.example — template without values, committed
```

---

## Interview Questions

**Q: What is prototype pollution and how do you prevent it?**
A: Attackers send JSON with `__proto__` or `constructor.prototype` keys. If your code merges this into objects without filtering, it pollutes `Object.prototype` — suddenly all objects gain malicious properties. Prevention: validate input schemas (Zod strips unknown keys), use `Object.create(null)` for dictionaries, explicitly check for `__proto__`/`constructor`/`prototype` keys in merge functions, or use lodash's `_.merge` (patched against this).

**Q: What is the difference between authentication and authorization?**
A: Authentication = "who are you?" (identity verification via password, JWT, OAuth). Authorization = "what can you do?" (access control — can this user read this resource?). Authentication comes first. Authorization uses the authenticated identity to make access decisions. `401 Unauthorized` = not authenticated. `403 Forbidden` = authenticated but not authorized.

**Q: What security headers does helmet set and why?**
A: `Content-Security-Policy` restricts where scripts/styles can load from (prevents XSS). `X-Content-Type-Options: nosniff` stops browsers from guessing MIME types (prevents MIME confusion attacks). `X-Frame-Options: DENY` prevents clickjacking (page embedded in iframe on another site). `Strict-Transport-Security` forces HTTPS. `Referrer-Policy` controls what's in the Referer header (privacy).

**Q: How do you prevent SQL injection?**
A: Parameterized queries (prepared statements) — never interpolate user input into SQL strings. Use query builders or ORMs that parameterize automatically. Validate and type-check all inputs. Use principle of least privilege for DB users (app user shouldn't have DROP TABLE permission).
