# Backend Cheatsheet

## HTTP Status Codes

```
200 OK              201 Created         204 No Content
301 Moved Perm.     302 Found           304 Not Modified
400 Bad Request     401 Unauthorized    403 Forbidden
404 Not Found       409 Conflict        422 Unprocessable
429 Too Many Req.   500 Server Error    502 Bad Gateway
503 Unavailable     504 Gateway Timeout
```

## REST URL Patterns

```
GET    /resources           list
POST   /resources           create
GET    /resources/:id       get one
PUT    /resources/:id       replace
PATCH  /resources/:id       partial update
DELETE /resources/:id       delete

GET /resources?q=x&sort=y&page=2&limit=20
POST /resources/:id/actions
```

## HTTP Headers Quick Reference

```
Authorization: Bearer <token>
Content-Type: application/json
Accept: application/json
Cache-Control: no-cache | no-store | max-age=N | public | private
ETag: "hash"
X-Request-Id: uuid
Access-Control-Allow-Origin: https://example.com
Set-Cookie: k=v; HttpOnly; Secure; SameSite=Lax; Max-Age=86400
```

---

## JWT

```js
// Sign
jwt.sign({ sub: userId, role }, secret, { expiresIn: '1h' })

// Verify
jwt.verify(token, secret)          // throws on invalid/expired

// Middleware
const token = req.headers.authorization?.split(' ')[1]
```

## bcrypt

```js
const hash  = await bcrypt.hash(password, 12)
const match = await bcrypt.compare(input, hash)
```

## Zod Validation

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
-- CRUD
SELECT col, col FROM table WHERE cond ORDER BY col DESC LIMIT N OFFSET M;
INSERT INTO table (col) VALUES (?) RETURNING id;
UPDATE table SET col = ? WHERE id = ?;
DELETE FROM table WHERE id = ?;

-- JOIN
SELECT * FROM a JOIN b ON b.a_id = a.id;    -- INNER
SELECT * FROM a LEFT JOIN b ON ...;          -- keep all a
SELECT * FROM a FULL OUTER JOIN b ON ...;    -- keep all

-- Aggregate
GROUP BY col HAVING COUNT(*) > N
COUNT(*), SUM(col), AVG(col), MAX(col), MIN(col)

-- Index
CREATE INDEX idx ON table(col);
CREATE INDEX idx ON table(col1, col2);       -- composite
CREATE INDEX idx ON table(col) WHERE active; -- partial
EXPLAIN ANALYZE SELECT ...;                  -- check plan

-- Upsert (Postgres)
INSERT INTO t (id, val) VALUES (1, 'x')
ON CONFLICT (id) DO UPDATE SET val = EXCLUDED.val;

-- Transaction
BEGIN; ... COMMIT; / ROLLBACK;
```

---

## Redis Quick Reference

```js
// String / cache
redis.set(key, value, { EX: 3600 })
redis.get(key)
redis.del(key)

// Counter
redis.incr(key)
redis.incrBy(key, n)

// Set
redis.sAdd(key, member)
redis.sMembers(key)
redis.sRem(key, member)

// Sorted set (leaderboard)
redis.zAdd(key, [{ score: 100, value: 'user:1' }])
redis.zRangeWithScores(key, 0, 9, { REV: true })  // top 10
redis.zRank(key, 'user:1', { REV: true })

// Hash
redis.hSet(key, { field: value })
redis.hGet(key, field)
redis.hGetAll(key)

// List (queue)
redis.lPush(key, value)   // enqueue
redis.rPop(key)            // dequeue

// TTL
redis.expire(key, seconds)
redis.ttl(key)
```

## Cache-Aside Pattern

```js
async function get(id) {
  const cached = await redis.get(`res:${id}`)
  if (cached) return JSON.parse(cached)
  const data = await db.findById(id)
  await redis.set(`res:${id}`, JSON.stringify(data), { EX: 300 })
  return data
}
async function update(id, data) {
  await db.update(id, data)
  await redis.del(`res:${id}`)  // invalidate
}
```

---

## Express Essentials

```js
// App setup
const app = express()
app.use(express.json())
app.use(helmet())
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }))

// Router
const router = express.Router()
router.get('/:id', auth, async (req, res, next) => {
  try {
    const item = await service.findById(req.params.id)
    if (!item) return res.status(404).json({ error: 'Not found' })
    res.json(item)
  } catch (e) { next(e) }
})

// Error handler (must have 4 params)
app.use((err, req, res, next) => {
  console.error(err)
  res.status(err.status ?? 500).json({ error: err.message ?? 'Internal error' })
})

// Rate limit
app.use(rateLimit({ windowMs: 15*60*1000, max: 100 }))
```

---

## Security Checklist

```
✅ HTTPS everywhere (HSTS header)
✅ Parameterized queries (no string concat SQL)
✅ bcrypt/argon2 for passwords (cost ≥ 12)
✅ JWT in httpOnly cookie
✅ CORS restricted to known origins
✅ Rate limiting on auth endpoints
✅ Helmet headers (CSP, X-Frame, HSTS)
✅ Validate + sanitize all input (Zod)
✅ Env secrets never committed
✅ npm audit in CI
✅ Least-privilege DB user
✅ Structured error logs (no stack traces to client)
```

---

## Common Response Shapes

```js
// Success
res.status(200).json({ data: result })
res.status(201).json({ data: created })
res.status(204).end()

// Paginated
res.json({
  data: items,
  meta: { total, page, limit, hasNext: page * limit < total }
})

// Error
res.status(400).json({ error: 'Validation failed', fields: { email: 'Invalid' } })
res.status(401).json({ error: 'Unauthorized' })
res.status(500).json({ error: 'Internal server error' })
```
