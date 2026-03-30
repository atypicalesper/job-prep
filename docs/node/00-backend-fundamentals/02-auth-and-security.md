# Authentication & Security

## Authentication vs Authorization

- **Authentication** — who are you? (identity)
- **Authorization** — what can you do? (permissions)

---

## Session-Based Auth

```
1. User logs in → server creates session
2. Session stored server-side (Redis / DB)
3. Session ID sent to client as cookie (HttpOnly)
4. Every request sends cookie → server looks up session

Pros: Easy to invalidate (delete session), no token expiry problem
Cons: Stateful — doesn't scale horizontally without shared session store
```

```js
// Express + express-session
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: true,    // HTTPS only
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,  // 1 day
  },
  store: new RedisStore({ client: redisClient }),
}))

// Login
req.session.userId = user.id

// Logout
req.session.destroy()
```

---

## JWT (JSON Web Tokens)

Stateless authentication — server doesn't store session.

```
Header.Payload.Signature

Header:  { "alg": "HS256", "typ": "JWT" }
Payload: { "sub": "user_123", "role": "admin", "iat": 1700000000, "exp": 1700003600 }
Signature: HMACSHA256(base64(header) + "." + base64(payload), secret)
```

```js
import jwt from 'jsonwebtoken'

// Sign
const token = jwt.sign(
  { sub: user.id, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
)

// Verify
try {
  const payload = jwt.verify(token, process.env.JWT_SECRET)
  // payload.sub, payload.role
} catch (e) {
  if (e instanceof jwt.TokenExpiredError) { /* 401 */ }
  if (e instanceof jwt.JsonWebTokenError) { /* 401 invalid */ }
}

// Middleware
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]  // Bearer <token>
  if (!token) return res.status(401).json({ error: 'Missing token' })
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}
```

### JWT Best Practices

| Concern | Recommendation |
|---------|---------------|
| Storage | `httpOnly` cookie (prevents XSS) over `localStorage` |
| Algorithm | RS256 (asymmetric) for distributed systems; HS256 for single-service |
| Expiry | Short-lived access token (15m–1h) + long-lived refresh token |
| Refresh | Rotate refresh tokens on use (token rotation) |
| Revocation | Maintain denylist for JTI (JWT ID) if revocation needed |
| Payload | Never store sensitive data — payload is base64 decoded, not encrypted |

---

## OAuth 2.0 / OpenID Connect

```
OAuth 2.0 — Authorization framework (delegates access)
OpenID Connect (OIDC) — Identity layer on top of OAuth 2.0

Roles:
  Resource Owner   — the user
  Client           — your app
  Auth Server      — Google, GitHub, Auth0
  Resource Server  — API serving protected data
```

### Authorization Code Flow (with PKCE — standard for SPAs)

```
1. App → Auth server: /authorize?response_type=code&client_id=...&
         redirect_uri=...&scope=openid email&code_challenge=...

2. User authenticates, grants consent

3. Auth server → App: redirect to redirect_uri?code=AUTHCODE

4. App → Auth server: POST /token
         { code, client_id, client_secret, code_verifier }

5. Auth server → App: { access_token, id_token, refresh_token }

6. App → Resource server: GET /userinfo
         Authorization: Bearer access_token
```

**PKCE** (Proof Key for Code Exchange): prevents authorization code interception. Client generates a `code_verifier` (random), hashes it to `code_challenge`, sends challenge upfront, verifier on token exchange.

---

## Password Hashing

```js
import bcrypt from 'bcrypt'

const ROUNDS = 12  // cost factor — doubles work per increment

// Hash on registration
const hash = await bcrypt.hash(password, ROUNDS)
await db.save({ email, passwordHash: hash })

// Verify on login
const match = await bcrypt.compare(inputPassword, storedHash)
if (!match) return res.status(401).json({ error: 'Invalid credentials' })

// Never store plain text passwords
// Never use MD5/SHA1 for passwords — they're fast (attacker-friendly)
// bcrypt/argon2/scrypt are deliberately slow
```

---

## Input Validation & Sanitization

```js
import { z } from 'zod'

const CreateUserSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  email: z.string().email().toLowerCase(),
  age: z.number().int().min(0).max(150),
  role: z.enum(['user', 'admin']).default('user'),
})

// In handler
const parsed = CreateUserSchema.safeParse(req.body)
if (!parsed.success) {
  return res.status(400).json({ error: parsed.error.flatten() })
}
const { name, email, age, role } = parsed.data  // typed and safe
```

### SQL Injection Prevention

```js
// ❌ Vulnerable — never concatenate user input
const rows = await db.query(`SELECT * FROM users WHERE email = '${email}'`)

// ✅ Parameterized queries
const rows = await db.query('SELECT * FROM users WHERE email = $1', [email])

// With ORMs (Prisma, TypeORM) — automatically parameterized
const user = await prisma.user.findUnique({ where: { email } })
```

### XSS Prevention

```js
// Never render raw user content as HTML
// ❌
el.innerHTML = userContent

// ✅ Text only
el.textContent = userContent

// If HTML is required — sanitize
import DOMPurify from 'dompurify'
el.innerHTML = DOMPurify.sanitize(userContent)

// Content-Security-Policy header
res.setHeader('Content-Security-Policy',
  "default-src 'self'; script-src 'self'; object-src 'none'")
```

---

## CORS

```js
import cors from 'cors'

// Permissive (dev only)
app.use(cors())

// Production: explicit origins
app.use(cors({
  origin: ['https://myapp.com', 'https://www.myapp.com'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,       // allow cookies
  maxAge: 86400,           // cache preflight 24h
}))
```

**Preflight**: browser sends OPTIONS before non-simple requests (POST with JSON, custom headers). Server must respond with CORS headers or browser blocks the actual request.

Simple requests (no preflight): GET/HEAD/POST + standard headers + `Content-Type: form/text/multipart`.

---

## Rate Limiting

```js
import rateLimit from 'express-rate-limit'
import RedisStore from 'rate-limit-redis'

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                   // requests per window
  standardHeaders: true,      // X-RateLimit-* headers
  legacyHeaders: false,
  store: new RedisStore({ client: redisClient }),  // distributed
  keyGenerator: req => req.user?.id ?? req.ip,     // per-user or per-IP
  handler: (req, res) => res.status(429).json({ error: 'Too many requests' }),
})

app.use('/api/', limiter)

// Stricter for auth endpoints
const authLimiter = rateLimit({ windowMs: 60_000, max: 10 })
app.use('/api/auth/', authLimiter)
```

---

## Security Headers

```js
import helmet from 'helmet'

app.use(helmet())

// What helmet sets:
// Content-Security-Policy
// X-Content-Type-Options: nosniff
// X-Frame-Options: DENY            — clickjacking
// X-XSS-Protection: 0             — disable old XSS filter (CSP is better)
// Strict-Transport-Security        — HSTS, HTTPS-only
// Referrer-Policy: no-referrer
// Permissions-Policy               — restrict browser APIs
```

---

## OWASP Top 10 (Essentials)

| # | Vulnerability | Prevention |
|---|--------------|------------|
| A01 | Broken Access Control | Check permissions on every endpoint; deny by default |
| A02 | Cryptographic Failures | HTTPS everywhere, bcrypt for passwords, no MD5/SHA1 |
| A03 | Injection (SQL, XSS) | Parameterized queries, sanitize output, CSP |
| A04 | Insecure Design | Threat model, principle of least privilege |
| A05 | Security Misconfiguration | Helmet, disable debug in prod, change defaults |
| A06 | Vulnerable Components | Audit `npm audit`, update dependencies |
| A07 | Auth Failures | bcrypt, rate limiting, MFA, short-lived tokens |
| A08 | Software Integrity Failures | Verify package checksums (lockfiles) |
| A09 | Logging Failures | Log auth events, errors (no passwords in logs) |
| A10 | SSRF | Allowlist outbound URLs, block internal ranges |

---

## Environment Variables & Secrets

```bash
# .env — never commit
DATABASE_URL=postgres://user:pass@localhost/db
JWT_SECRET=minimum-32-chars-random-secret
GROQ_API_KEY=sk-...

# Validate at startup
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required')
```

```js
// Zod config validation
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
})

export const env = EnvSchema.parse(process.env)
```
