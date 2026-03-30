# Backend Cheatsheet

## HTTP Status Codes

```
2xx  200 OK  201 Created  204 No Content
3xx  301 Permanent  302 Temporary  304 Not Modified
4xx  400 Bad Request  401 Unauth  403 Forbidden  404 Not Found
     409 Conflict  422 Unprocessable  429 Too Many Requests
5xx  500 Server Error  502 Bad Gateway  503 Unavailable  504 Timeout
```

## REST URL Conventions

```
GET    /resources              list
POST   /resources              create → 201
GET    /resources/:id          get one
PUT    /resources/:id          replace
PATCH  /resources/:id          partial update
DELETE /resources/:id          delete → 204

GET    /resources?q=x&sort=y&page=2&limit=20
POST   /resources/:id/activate  (actions)
```

## Common Response Shapes

```js
res.json({ data: result })
res.json({ data: items, meta: { total, page, limit, hasNext } })
res.status(400).json({ error: 'Validation failed', fields: { email: 'Invalid' } })
res.status(201).json({ data: created })
res.status(204).end()
```

---

## JWT

```js
jwt.sign({ sub: userId, role }, secret, { expiresIn: '1h' })
jwt.verify(token, secret)         // throws TokenExpiredError | JsonWebTokenError
req.headers.authorization?.split(' ')[1]  // Bearer <token>
// Store in httpOnly cookie, not localStorage
```

## bcrypt

```js
await bcrypt.hash(password, 12)    // rounds ≥ 12
await bcrypt.compare(input, hash)  // true/false
```

## Zod

```js
const Schema = z.object({
  email: z.string().email(),
  age:   z.number().int().min(0),
  role:  z.enum(['user','admin']).default('user'),
})
const { data, error } = Schema.safeParse(req.body)
if (error) return res.status(400).json(error.flatten())
```

---

## SQL Quick Reference

```sql
-- Query
SELECT col FROM table WHERE cond ORDER BY col DESC LIMIT N OFFSET M;
-- JOIN
SELECT * FROM a JOIN b ON b.a_id = a.id;
SELECT * FROM a LEFT JOIN b ON ...;
-- Aggregate
GROUP BY col HAVING COUNT(*) > N
COUNT(*) SUM(col) AVG(col) MAX(col) MIN(col)
-- Upsert (Postgres)
INSERT INTO t (id, v) VALUES (1,'x') ON CONFLICT (id) DO UPDATE SET v = EXCLUDED.v;
-- Index
CREATE INDEX idx ON table(col);
CREATE INDEX idx ON table(c1, c2);         -- composite
EXPLAIN ANALYZE SELECT ...;                -- check plan
-- Transaction
BEGIN; ... COMMIT; / ROLLBACK;
```

## SQL Isolation Levels

```
READ COMMITTED   — default, only see committed data
REPEATABLE READ  — same row returns same value in transaction
SERIALIZABLE     — full isolation
```

---

## Redis Quick Reference

```js
redis.set(key, JSON.stringify(v), { EX: 3600 })
redis.get(key)
redis.del(key)
redis.incr(key) / redis.incrBy(key, n)
redis.sAdd/sRem/sMembers(key, member)          // Set
redis.zAdd(key, [{ score, value }])             // Sorted set
redis.zRangeWithScores(key, 0, 9, { REV:true }) // Top 10
redis.hSet(key, { field: value })               // Hash
redis.hGetAll(key)
redis.lPush(key, val) / redis.rPop(key)         // List / queue
redis.expire(key, seconds)
```

## Cache-Aside

```js
const cached = await redis.get(key)
if (cached) return JSON.parse(cached)
const data = await db.find(id)
await redis.set(key, JSON.stringify(data), { EX: 300 })
return data
// On write: await redis.del(key)
```

---

## Express Setup

```js
app.use(express.json())
app.use(helmet())
app.use(cors({ origin: ALLOWED, credentials: true }))
app.use(rateLimit({ windowMs: 15*60*1000, max: 100 }))

// Route
router.get('/:id', auth, async (req, res, next) => {
  try {
    const item = await service.find(req.params.id)
    if (!item) return res.status(404).json({ error: 'Not found' })
    res.json({ data: item })
  } catch (e) { next(e) }
})

// Error handler
app.use((err, req, res, next) => {
  res.status(err.status ?? 500).json({ error: err.message ?? 'Internal error' })
})
```

## CORS

```js
cors({ origin: ['https://app.com'], methods: ['GET','POST','PUT','PATCH','DELETE'],
       allowedHeaders: ['Content-Type','Authorization'], credentials: true, maxAge: 86400 })
```

## Rate Limiting

```js
rateLimit({ windowMs: 15*60*1000, max: 100, standardHeaders: true,
            store: new RedisStore({ client }), keyGenerator: req => req.user?.id ?? req.ip })
```

---

## Security Checklist

```
✅ HTTPS + HSTS
✅ Parameterized SQL queries
✅ bcrypt (rounds ≥ 12) for passwords
✅ JWT in httpOnly Secure SameSite=Lax cookie
✅ CORS restricted to known origins
✅ Rate limit on auth endpoints
✅ helmet() headers (CSP, X-Frame, etc.)
✅ Validate all input with Zod / joi
✅ Secrets in env vars, never committed
✅ npm audit in CI
✅ Least-privilege DB user
✅ No stack traces to client in prod
```

## OWASP Top 10 Shortcuts

```
A01 Access Control      — deny by default, check every endpoint
A02 Crypto Failures     — HTTPS, bcrypt, no MD5 for passwords
A03 Injection           — parameterized queries, escape output
A05 Misconfiguration    — helmet, no debug in prod, change defaults
A06 Vulnerable Deps     — npm audit, keep deps updated
A07 Auth Failures       — bcrypt, rate limit, MFA, short-lived tokens
A09 Logging             — log events, never log passwords
```

---

## Environment Config (Zod)

```js
const Env = z.object({
  NODE_ENV:    z.enum(['development','test','production']).default('development'),
  PORT:        z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET:  z.string().min(32),
})
export const env = Env.parse(process.env)  // throws on startup if invalid
```
