# Node.js Security Fundamentals

---

## OWASP Top 10 for Node.js

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
