# Last-Day Cheat Sheet

Read this the morning of the interview. Dense but complete.

---

## JavaScript Output Prediction — Know These Cold

```javascript
// ── 1. Event loop order: sync → microtasks → macrotasks ──────────────────
console.log('1');
setTimeout(() => console.log('2'), 0);
Promise.resolve().then(() => console.log('3'));
console.log('4');
// Output: 1, 4, 3, 2
// Why: sync runs first (1,4), then microtasks (Promise → 3), then macrotasks (setTimeout → 2)

// ── 2. nextTick vs Promise order ─────────────────────────────────────────
Promise.resolve().then(() => console.log('promise'));
process.nextTick(() => console.log('nextTick'));
// Output: nextTick, promise
// Why: nextTick queue drains before the microtask (Promise) queue

// ── 3. Nested async — what runs when? ────────────────────────────────────
console.log('a');
setTimeout(() => {
  console.log('b');
  Promise.resolve().then(() => console.log('c'));
}, 0);
Promise.resolve().then(() => {
  console.log('d');
  setTimeout(() => console.log('e'), 0);
});
console.log('f');
// Output: a, f, d, b, c, e
// Step by step:
//   sync: a, f
//   microtask: d  (also schedules setTimeout e)
//   macrotask1: b  (also schedules Promise c)
//   microtask: c   (drains before next macrotask)
//   macrotask2: e

// ── 4. Closure captures reference, not value ─────────────────────────────
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0);
}
// Output: 3, 3, 3
// Fix 1: let (block-scoped, new binding per iteration)
for (let i = 0; i < 3; i++) { setTimeout(() => console.log(i), 0); }
// Fix 2: IIFE to capture current value
for (var i = 0; i < 3; i++) { ((j) => setTimeout(() => console.log(j), 0))(i); }

// ── 5. typeof ─────────────────────────────────────────────────────────────
typeof null        // 'object'  ← historical bug, not a bug you can fix
typeof undefined   // 'undefined'
typeof []          // 'object'  ← use Array.isArray()
typeof {}          // 'object'
typeof function(){}// 'function'
typeof NaN         // 'number'  ← NaN is of type number!
typeof class {}    // 'function'

// ── 6. Equality traps ─────────────────────────────────────────────────────
null == undefined  // true   (only equal to each other with ==)
null === undefined // false
NaN === NaN        // false  (use Number.isNaN())
0 === -0           // true   (use Object.is(0, -0) → false)
[] == false        // true   ([] → '' → 0, false → 0)
'' == false        // true
'' === false       // false  (=== never coerces)

// ── 7. this binding rules ─────────────────────────────────────────────────
// 1. new binding:          new Foo()           → fresh object
// 2. explicit binding:     fn.call(ctx)        → ctx
// 3. implicit binding:     obj.method()        → obj
// 4. default binding:      fn()                → global / undefined (strict)
// Arrow functions: NO own this — inherit from enclosing lexical scope

const obj = {
  name: 'obj',
  regular() { return this.name; },    // 'obj' (implicit binding)
  arrow: () => this?.name,            // undefined (lexical — module scope)
  inner() {
    const arrowInner = () => this.name; // 'obj' (captured from inner's this)
    return arrowInner();
  }
};

// ── 8. Prototype chain ────────────────────────────────────────────────────
function Animal(name) { this.name = name; }
Animal.prototype.speak = function() { return `${this.name} speaks`; };

const dog = new Animal('Rex');
dog.hasOwnProperty('name');   // true  — own property
dog.hasOwnProperty('speak');  // false — on prototype
'speak' in dog;               // true  — own OR prototype

Object.getPrototypeOf(dog) === Animal.prototype; // true
dog instanceof Animal;                           // true

// ── 9. Hoisting ───────────────────────────────────────────────────────────
// var: hoisted, initialized to undefined
// function declaration: fully hoisted (callable before declaration)
// let/const: hoisted but in TDZ — ReferenceError if accessed before declaration
// class: hoisted but in TDZ

console.log(x); // undefined  (var hoisted)
var x = 5;

console.log(y); // ReferenceError  (TDZ)
let y = 5;

foo(); // ✅ works (function declaration fully hoisted)
function foo() {}

bar(); // ❌ TypeError: bar is not a function (var hoisted as undefined)
var bar = function() {};

// ── 10. Spread / rest / destructuring gotchas ─────────────────────────────
const [a, ...rest] = [1, 2, 3]; // a=1, rest=[2,3]
const { x: renamed, y = 10 } = { x: 5 }; // renamed=5, y=10 (default)
const copy = { ...obj }; // shallow copy — nested objects still shared
```

---

## Node.js Event Loop — Deep Reference

```
6 Phases (runs in order, repeats):
┌─────────────────────────────────────────────────┐
│  1. timers          setTimeout, setInterval      │
│  2. pending I/O     deferred I/O callbacks       │
│  3. idle/prepare    internal use only            │
│  4. poll            new I/O events (blocks here  │
│                     if queue empty + no timers)  │
│  5. check           setImmediate callbacks       │
│  6. close callbacks socket.on('close', ...)      │
└─────────────────────────────────────────────────┘

Between EVERY phase (highest priority first):
  1. process.nextTick queue  (drains fully before moving on)
  2. Promise microtask queue (drains fully before moving on)

Key rules:
  nextTick > Promise.then > setImmediate > setTimeout(fn, 0)
  BUT: setImmediate vs setTimeout(fn,0) in MAIN module → indeterminate
       setImmediate vs setTimeout(fn,0) inside I/O callback → setImmediate FIRST

What uses the libuv thread pool (4 threads by default):
  ✓ fs.readFile / fs.writeFile (most fs ops)
  ✓ crypto.pbkdf2, crypto.randomBytes (heavy crypto)
  ✓ dns.lookup (NOT dns.resolve — that's async)
  ✓ zlib compression
  ✗ TCP/UDP sockets (OS async, no thread needed)
  ✗ http.request (non-blocking at OS level)

Increase thread pool: UV_THREADPOOL_SIZE=8 node app.js  (max 128)
```

```javascript
// Output prediction — tricky nextTick + Promise nesting:
process.nextTick(() => console.log('1'));
Promise.resolve().then(() => {
  console.log('2');
  process.nextTick(() => console.log('3')); // queued mid-microtask
});
process.nextTick(() => console.log('4'));
// Output: 1, 4, 2, 3
// nextTick queue: [1, 4] → drains: 1, 4
// Promise queue: [2] → runs 2, queues nextTick(3)
// nextTick queue: [3] → drains: 3
// (nextTick drains before continuing microtask queue in Node.js v11+)
```

---

## TypeScript — Most Tested Concepts

```typescript
// ── Structural typing ─────────────────────────────────────────────────────
interface A { x: number }
interface B { x: number; y: string }
const b: B = { x: 1, y: 'hi' };
const a: A = b; // ✅ B is structurally assignable to A (B has at least all of A's shape)

// ── Excess property check (ONLY on fresh object literals) ─────────────────
const a2: A = { x: 1, y: 'extra' }; // ❌ Error — excess property check
const obj = { x: 1, y: 'extra' };
const a3: A = obj;                   // ✅ No error — obj is not a "fresh literal"

// ── never propagates ──────────────────────────────────────────────────────
type T = string & number;          // never
type U = never | string;           // string  (never in union disappears)
type V = never & string;           // never   (never in intersection stays)

// ── keyof union vs intersection ───────────────────────────────────────────
type X = { a: 1; b: 2 };
type Y = { b: 3; c: 4 };
type KUnion = keyof (X | Y);       // 'b'        (only common keys)
type KInter = keyof (X & Y);       // 'a'|'b'|'c' (all keys from both)

// ── Conditional type distribution ─────────────────────────────────────────
type IsString<T> = T extends string ? 'yes' : 'no';
type R1 = IsString<string | number>; // 'yes' | 'no'  (distributed over union)
type R2 = IsString<string>;          // 'yes'
// Prevent distribution: wrap in tuple
type IsString2<T> = [T] extends [string] ? 'yes' : 'no';
type R3 = IsString2<string | number>; // 'no'  (not distributed)

// ── infer ─────────────────────────────────────────────────────────────────
type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;
type Awaited<T> = T extends Promise<infer U> ? Awaited<U> : T; // recursive
type Head<T extends any[]> = T extends [infer H, ...any[]] ? H : never;
type Tail<T extends any[]> = T extends [any, ...infer T] ? T : never;

// ── Mapped types ──────────────────────────────────────────────────────────
type Mutable<T> = { -readonly [K in keyof T]: T[K] };      // remove readonly
type Required2<T> = { [K in keyof T]-?: T[K] };            // remove optional
type Nullable<T> = { [K in keyof T]: T[K] | null };

// Filter keys by value type:
type PickByValue<T, V> = {
  [K in keyof T as T[K] extends V ? K : never]: T[K]
};
type StringKeys = PickByValue<{ a: string; b: number; c: string }, string>;
// { a: string; c: string }

// ── Discriminated unions ───────────────────────────────────────────────────
type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'rect'; width: number; height: number };

function area(s: Shape): number {
  switch (s.kind) {
    case 'circle': return Math.PI * s.radius ** 2;
    case 'rect':   return s.width * s.height;
    // Exhaustiveness check:
    default: const _: never = s; throw new Error('Unknown shape');
  }
}

// ── satisfies vs annotation ────────────────────────────────────────────────
// annotation: validates type AND widens to that type
// satisfies: validates type but KEEPS inferred literal/narrow type
const palette = {
  red: [255, 0, 0],
  green: '#00ff00',
} satisfies Record<string, string | number[]>;
palette.red.map(c => c); // ✅ TypeScript still knows red is number[], not string|number[]

// ── Utility types quick reference ─────────────────────────────────────────
// Partial<T>         all properties optional
// Required<T>        all properties required
// Readonly<T>        all properties readonly
// Pick<T, K>         keep only keys K
// Omit<T, K>         remove keys K
// Record<K, V>       { [key in K]: V }
// Exclude<T, U>      remove from union T any type assignable to U
// Extract<T, U>      keep from union T only types assignable to U
// NonNullable<T>     remove null and undefined
// ReturnType<F>      return type of function F
// Parameters<F>      parameter types as tuple
// Awaited<T>         unwrap Promise recursively
// InstanceType<C>    instance type of constructor C
```

---

## SQL — Complete Reference

```sql
-- ── NULL rules ──────────────────────────────────────────────────────────
-- NULL = NULL       → NULL  (not TRUE — always use IS NULL / IS NOT NULL)
-- NULL != NULL      → NULL
-- NULL + 5          → NULL  (any arithmetic with NULL = NULL)
-- COUNT(col)        → skips NULLs;  COUNT(*) → includes NULLs
-- AVG(col)          → skips NULLs;  SUM(col) → skips NULLs

-- NOT IN with NULL subquery → returns 0 rows (silent gotcha!)
SELECT * FROM a WHERE id NOT IN (SELECT id FROM b); -- if b has any NULL id → empty!
-- Fix: filter NULLs OR use NOT EXISTS:
SELECT * FROM a WHERE NOT EXISTS (SELECT 1 FROM b WHERE b.id = a.id);

-- ── JOIN types ───────────────────────────────────────────────────────────
-- INNER JOIN:  only rows with match in both tables
-- LEFT JOIN:   all rows from left, NULL for non-matching right
-- RIGHT JOIN:  all rows from right, NULL for non-matching left
-- FULL JOIN:   all rows from both, NULL where no match
-- CROSS JOIN:  cartesian product (every combination)
-- SELF JOIN:   table joined with itself (manager-employee hierarchy)

-- WHERE vs ON for LEFT JOIN — critical difference:
SELECT * FROM orders o
LEFT JOIN customers c ON o.customer_id = c.id
WHERE c.country = 'US';   -- ← effectively becomes INNER JOIN (NULLs filtered out)

SELECT * FROM orders o
LEFT JOIN customers c ON o.customer_id = c.id AND c.country = 'US'; -- ← keeps all orders

-- ── Window functions ─────────────────────────────────────────────────────
-- ROW_NUMBER(): unique sequential (1,2,3,4)         — no ties
-- RANK():       gaps on ties    (1,1,3,4)           — ties get same rank, gap after
-- DENSE_RANK(): no gaps         (1,1,2,3)           — ties get same rank, no gap
-- NTILE(n):     divide into n buckets

SELECT name, salary,
  ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC) AS row_num,
  RANK()       OVER (PARTITION BY dept ORDER BY salary DESC) AS rnk,
  DENSE_RANK() OVER (PARTITION BY dept ORDER BY salary DESC) AS dense_rnk,
  LAG(salary, 1, 0)  OVER (ORDER BY hire_date) AS prev_salary,
  LEAD(salary, 1, 0) OVER (ORDER BY hire_date) AS next_salary,
  SUM(salary)  OVER (ORDER BY hire_date ROWS UNBOUNDED PRECEDING) AS running_total
FROM employees;

-- LAST_VALUE gotcha — default frame is RANGE UNBOUNDED PRECEDING to CURRENT ROW
-- so LAST_VALUE gives current row's value, not the last in partition!
-- Fix: use explicit frame:
LAST_VALUE(salary) OVER (
  PARTITION BY dept ORDER BY salary
  ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
)

-- Nth highest salary (3 methods):
-- 1. DENSE_RANK:
SELECT salary FROM (
  SELECT salary, DENSE_RANK() OVER (ORDER BY salary DESC) AS rnk FROM employees
) t WHERE rnk = N;
-- 2. OFFSET:
SELECT DISTINCT salary FROM employees ORDER BY salary DESC LIMIT 1 OFFSET N-1;
-- 3. Correlated subquery:
SELECT DISTINCT salary FROM employees e1
WHERE N-1 = (SELECT COUNT(DISTINCT salary) FROM employees e2 WHERE e2.salary > e1.salary);

-- ── Indexes ──────────────────────────────────────────────────────────────
-- Composite index (a, b, c) — usable queries:
--   WHERE a = ?                    ✅
--   WHERE a = ? AND b = ?          ✅
--   WHERE a = ? AND b = ? AND c = ?✅
--   WHERE b = ?                    ❌ (doesn't start at a)
--   WHERE a = ? AND c = ?          ✅ for a only (b skipped)

-- Index NOT used when:
WHERE UPPER(name) = 'ALICE'        -- function on column
WHERE name LIKE '%alice'           -- leading wildcard
WHERE int_col = '42'               -- implicit type cast
WHERE a = 1 OR b = 2               -- OR (use UNION)
WHERE col != 5                     -- inequality (usually)

-- ── ACID & Isolation levels ───────────────────────────────────────────────
-- READ UNCOMMITTED: can see uncommitted changes (dirty reads)
-- READ COMMITTED:   only see committed (default in most DBs)
-- REPEATABLE READ:  same row read twice gives same result (no non-repeatable reads)
-- SERIALIZABLE:     fully isolated, slowest

-- Isolation level  | Dirty Read | Non-repeatable | Phantom
-- READ UNCOMMITTED | ✓ possible | ✓ possible     | ✓ possible
-- READ COMMITTED   | ✗ no       | ✓ possible     | ✓ possible
-- REPEATABLE READ  | ✗ no       | ✗ no           | ✓ possible (MySQL: ✗ with gap locks)
-- SERIALIZABLE     | ✗ no       | ✗ no           | ✗ no

-- FOR UPDATE: locks selected rows (prevents concurrent writes)
-- FOR SHARE: shared read lock (others can read, not write)
-- SKIP LOCKED: skip rows locked by other transactions (job queue pattern)
SELECT * FROM jobs WHERE status = 'pending' LIMIT 1 FOR UPDATE SKIP LOCKED;

-- ── Execution order (SQL is NOT executed top-to-bottom) ───────────────────
-- 1. FROM + JOINs
-- 2. WHERE
-- 3. GROUP BY
-- 4. HAVING
-- 5. SELECT
-- 6. DISTINCT
-- 7. ORDER BY
-- 8. LIMIT / OFFSET
-- (Column aliases from SELECT can't be used in WHERE or HAVING — not yet evaluated)
```

---

## Redis — Complete Command Reference

```
── Strings ──────────────────────────────────────────────────────────────────
SET key value                     basic set
SET key value EX 3600             set with TTL (seconds)
SET key value PX 30000            set with TTL (milliseconds)
SET key value NX                  set only if NOT exists (returns nil if exists)
SET key value XX                  set only if exists
SET key value EX 3600 NX          atomic: set if not exists with TTL ← distributed lock
GET key                           get value
MGET k1 k2 k3                     get multiple
INCR key / INCRBY key n           atomic increment (counter, rate limiting)
DECRBY key n
GETSET key value                  get old value, set new (for lock release pattern)
TTL key                           remaining TTL in seconds (-1 = no TTL, -2 = gone)
PERSIST key                       remove TTL

── Hashes ────────────────────────────────────────────────────────────────────
HSET key field value              set field
HGET key field                    get one field
HMSET key f1 v1 f2 v2             set multiple fields
HGETALL key                       get all fields + values
HDEL key field                    delete field
HEXISTS key field                 check field exists
HINCRBY key field n               increment numeric field (session hit counter)

── Lists ─────────────────────────────────────────────────────────────────────
LPUSH / RPUSH key value           push to left / right
LPOP / RPOP key                   pop from left / right
LLEN key                          length
LRANGE key 0 -1                   get all elements
BLPOP key timeout                 BLOCKING pop — waits up to timeout (0 = forever)
                                  ← job queue consumer pattern

── Sets ──────────────────────────────────────────────────────────────────────
SADD key member                   add member
SREM key member                   remove member
SMEMBERS key                      get all members
SISMEMBER key member              check membership O(1)
SCARD key                         cardinality (count)
SUNION k1 k2                      union of sets
SINTER k1 k2                      intersection
SDIFF k1 k2                       difference

── Sorted Sets ───────────────────────────────────────────────────────────────
ZADD key score member             add/update
ZADD key NX score member          add only if not exists
ZADD key XX score member          update only if exists
ZADD key GT score member          update only if new score > current
ZSCORE key member                 get score
ZRANK key member                  rank (low score = rank 0)
ZREVRANK key member               rank (high score = rank 0) ← leaderboard
ZRANGE key 0 -1 WITHSCORES       all by score ascending
ZREVRANGE key 0 9 WITHSCORES     top 10 descending ← leaderboard top 10
ZINCRBY key increment member      increment score ← game score update
ZRANGEBYSCORE key min max         range by score value
ZREMRANGEBYSCORE key min max      remove by score ← sliding window rate limit cleanup
ZCARD key                         count members

── Key management ────────────────────────────────────────────────────────────
DEL key                           delete
EXISTS key                        check existence
EXPIRE key seconds                set TTL
TYPE key                          get type (string/hash/list/set/zset)
KEYS pattern                      find keys (⚠️ blocks in prod — use SCAN)
SCAN cursor MATCH pattern COUNT n safe iteration

── Pub/Sub ───────────────────────────────────────────────────────────────────
PUBLISH channel message           publish
SUBSCRIBE channel                 subscribe (blocking — separate connection)

── Lua scripting (atomic operations) ────────────────────────────────────────
EVAL script numkeys [key...] [arg...]

-- Distributed lock release (atomic compare-and-delete):
EVAL "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end" 1 lock:key myUniqueId

-- Sliding window rate limiter:
EVAL "
  redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1])
  local count = redis.call('ZCARD', KEYS[1])
  if count < tonumber(ARGV[3]) then
    redis.call('ZADD', KEYS[1], ARGV[2], ARGV[2])
    redis.call('PEXPIRE', KEYS[1], ARGV[4])
    return 1
  end
  return 0
" 1 ratelimit:userId windowStart now limit windowMs
```

---

## System Design — Tradeoffs Reference

```
── CAP Theorem ──────────────────────────────────────────────────────────────
During a network partition, choose:
  CP (Consistency + Partition tolerance): refuse requests until consistent
     Examples: HBase, Zookeeper, etcd
     Use when: banking, inventory, anything where stale = wrong
  AP (Availability + Partition tolerance): serve possibly stale data
     Examples: Cassandra, DynamoDB (default), CouchDB
     Use when: social feed, product catalog, DNS

PACELC (extends CAP to normal operation):
  Even without partition, there's a Latency vs Consistency tradeoff.
  Strong consistency requires coordination → higher latency.

── Consistency models (weakest to strongest) ────────────────────────────────
Eventual        writes propagate eventually, reads may be stale
Read-your-writes you always see your own writes (not others')
Monotonic reads  repeated reads never go back in time
Causal           causally related operations seen in order
Sequential       all operations seen in same order everywhere
Linearizable     operations appear instantaneous (strongest, most expensive)

── Scaling strategies ───────────────────────────────────────────────────────
Vertical:   bigger machine — simple, has ceiling, SPOF
Horizontal: more machines — complex, no ceiling, needs LB + statelessness
DB replicas: read from replicas — reduces primary load, adds replication lag
DB sharding: split data by key (user_id % N) — scale writes, complex queries
CQRS:       separate read model from write model — optimize each independently

── Caching patterns ─────────────────────────────────────────────────────────
Cache-aside (lazy): read cache → miss → read DB → populate cache → return
  Pro: only caches what's actually needed; Con: cache miss = 2 round trips
Write-through:      write DB + cache together
  Pro: cache always fresh; Con: writes slower, caches things never read
Write-behind:       write cache, async flush to DB
  Pro: very fast writes; Con: data loss if cache fails before flush
Read-through:       cache handles DB read on miss (cache is the client)
  Pro: simple app code; Con: cache layer must know DB schema

Cache eviction policies:
  LRU (Least Recently Used):     evict item not accessed longest ← most common
  LFU (Least Frequently Used):   evict item accessed fewest times
  TTL-based:                     evict on expiry

── Message queue guarantees ─────────────────────────────────────────────────
At-most-once:    message may be lost; never duplicated (fire and forget)
At-least-once:   message never lost; may be delivered multiple times ← DEFAULT
Exactly-once:    no loss, no duplicates — requires idempotent consumers + dedup

Kafka vs RabbitMQ:
  Kafka:     log-based, retained messages, multiple consumer groups, high throughput
             → event streaming, audit logs, fan-out
  RabbitMQ:  queue-based, deleted on ack, complex routing, push-based
             → task queues, RPC, complex routing

── Database selection guide ─────────────────────────────────────────────────
PostgreSQL:   relational, ACID, JSON support, strong consistency, vertical scale
MongoDB:      document, flexible schema, horizontal scale, eventual consistency
Redis:        in-memory, key-value, microsecond latency, cache + pub/sub + queue
Cassandra:    wide-column, AP, write-optimized, time-series, geo-distributed
Elasticsearch:full-text search, analytics, log aggregation, NOT a primary store
ClickHouse:   columnar OLAP, analytics queries on billions of rows

── API rate limiting ─────────────────────────────────────────────────────────
Fixed window:    count per fixed period; burst possible at boundary (200 req/min window)
Sliding window:  count in rolling window; more accurate; Redis ZSET approach
Token bucket:    tokens added at rate R, consumed per request; allows burst up to bucket size
Leaky bucket:    requests drain at fixed rate; smooths bursts into steady flow
```

---

## Node.js — Complete Numbers and Gotchas

```
── Key numbers ──────────────────────────────────────────────────────────────
libuv thread pool:     4 (default), max 128       UV_THREADPOOL_SIZE=N
V8 heap default:       ~1.5GB old space            --max-old-space-size=N (MB)
New space (young gen): ~16MB (2x semi-space)       --max-semi-space-size=N
Stream highWaterMark:  16KB binary / 16 objects    objectMode
EventEmitter max:      10 listeners before warning setMaxListeners(n)
HTTP header size:      8KB (--max-http-header-size)
process.pid:           current process ID
process.ppid:          parent process ID

── Thread pool handles vs OS async ──────────────────────────────────────────
Thread pool (blocking in thread):          OS async (no thread):
  fs.readFile, fs.writeFile                  TCP sockets (net module)
  fs.stat, most fs operations                UDP sockets
  crypto.pbkdf2, crypto.randomBytes          pipes / IPC
  dns.lookup                                 http.request
  zlib.gzip/gunzip                           Child process spawning

── Streams quick reference ───────────────────────────────────────────────────
Readable events: 'data' (flowing), 'readable' (paused), 'end', 'error', 'close'
Writable events: 'drain' (buffer cleared), 'finish' (all flushed), 'error', 'close'
pipe() → returns destination stream (for chaining)
pipe() → does NOT propagate errors or clean up on error
pipeline() → propagates errors + cleans up all streams ← always prefer this

── Signals ───────────────────────────────────────────────────────────────────
SIGTERM: graceful shutdown request (can be caught) — sent by K8s/PM2 on stop
SIGKILL: forced kill (cannot be caught) — sent after grace period
SIGINT:  Ctrl+C (can be caught)
SIGUSR2: user-defined (PM2 uses for hot reload; nodemon uses for restart)
SIGHUP:  terminal closed (often used to trigger config reload)

process.on('SIGTERM', handler) — handle graceful shutdown
process.on('uncaughtException', handler) — last resort, should exit after
process.on('unhandledRejection', handler) — unhandled promise rejection

── Module system ─────────────────────────────────────────────────────────────
require() is synchronous + cached after first load
require.cache: object of all loaded modules
module.exports vs exports: exports is a reference to module.exports;
  if you reassign exports = {...}, module.exports is unchanged → bug!
Circular require: you get a partially-filled {} — avoid or restructure

ESM vs CJS:
  CJS: synchronous, dynamic (require() anywhere), module.exports
  ESM: async (top-level await), static analysis, import/export
  ESM imports are LIVE BINDINGS (changes in exporter visible to importer)
  CJS require() is a COPY (snapshot at import time)
```

---

## Behavioral — Full Reference

```
── STAR format ───────────────────────────────────────────────────────────────
Situation: 1-2 sentences. Context only — don't over-explain.
Task:      What specifically was YOUR responsibility?
Action:    What DID YOU DO? (not "we") — specific technical decisions.
Result:    Measurable outcome. Latency numbers, uptime %, user impact, revenue.

── Stories to prepare (have 5-7 ready) ──────────────────────────────────────
1. Performance improvement you led (numbers: before/after latency, throughput)
2. Production incident you handled (detection → diagnosis → fix → prevention)
3. Technical disagreement you navigated (you were right, you were wrong)
4. Project you delivered under ambiguity (how you drove clarity)
5. System you designed from scratch (architecture decisions + tradeoffs)
6. How you mentored/influenced another engineer
7. Time you pushed back on a requirement / said no to something

── "Tell me about a time you disagreed" ────────────────────────────────────
Template:
  "The team wanted to [X]. I thought [Y] was better because [specific technical reason].
  I [proposed a prototype / benchmarked / referenced RFC]. The result was [we adopted Y /
  we found X was actually better / we compromised with Z]. I learned [what]."

Key: show you can change your mind with evidence. Show you don't just capitulate.

── "Tell me about a production incident" ───────────────────────────────────
Template:
  "We had [service / metric] go [down / spike] on [approximate timeframe].
  I [detected it via alert / was paged / noticed in monitoring].
  Root cause was [specific technical cause].
  I [mitigation step — rollback / hotfix / config change].
  Recovery took [N minutes]. Impact was [users affected / revenue].
  Postmortem action: [what we permanently fixed]."

Key: show ownership, show you fixed the root cause not just symptoms.

── Questions to ask the interviewer (pick 2-3) ──────────────────────────────
Technical depth:
  "What does your typical deployment pipeline look like?"
  "How do you handle on-call — what's the rotation and typical incident frequency?"
  "What's the biggest technical debt the team is actively paying down?"
  "What observability tools do you use — metrics, tracing, logging?"

Team / culture:
  "How does code review work — synchronous or async, what's cycle time?"
  "How are technical decisions made — RFCs, ADRs, informal?"
  "What does the path from senior to staff look like here?"

Growth / impact:
  "What's the most important project I'd be working on in the first 6 months?"
  "What would make someone wildly successful in this role?"

── Things NOT to say ─────────────────────────────────────────────────────────
❌ "We did X" — say "I did X, coordinating with the team"
❌ "I don't know" (and stop) — say "I haven't used that directly, but based on..."
❌ "That's a bad question" — no such thing in an interview
❌ Criticizing previous employer — always frame as learning or growth
❌ "I work best alone" — collaboration is always valued
```

---

## Quick Mental Checklist Before Answering

```
Coding question:
  [ ] Restate the problem in your own words — confirm you understand
  [ ] Ask about input constraints (size, negatives, duplicates, sorted?)
  [ ] State naive O(n²) approach briefly, then optimize
  [ ] State time + space complexity BEFORE writing code
  [ ] Write code talking through what each line does
  [ ] Dry-run with a simple example (trace through [1,2,3])
  [ ] Test edge cases: empty [], single element, all same, negative nums, overflow
  [ ] Ask "does this look right to you?" before submitting

System design question:
  [ ] Clarify: functional requirements (what it does) + non-functional (scale, SLA)
  [ ] Estimate: DAU, RPS (req per second), storage per day, bandwidth
  [ ] Draw high-level: clients → LB → services → DB/cache
  [ ] Deep-dive the 2 hardest components — interviewer will guide
  [ ] Explicitly name every tradeoff ("I chose X over Y because...")
  [ ] Address: how does it handle failure? how does it scale 10x?
  [ ] Add: monitoring, alerting, how you'd detect problems

JS/TS output prediction:
  [ ] Trace the call stack and queues on paper if complex
  [ ] State WHAT it outputs AND WHY (the why is what they're testing)
  [ ] Note "this would differ if..." for any subtle edge cases

General:
  [ ] Silence is OK — 15-30s thinking is normal and shows deliberateness
  [ ] "Let me think about this for a moment" is a complete sentence
  [ ] Narrow from general to specific: principle → application → example
  [ ] If you get stuck: "Can I talk through what I know and reason from there?"
```
