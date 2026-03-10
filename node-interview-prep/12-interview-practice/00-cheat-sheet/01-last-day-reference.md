# Last-Day Cheat Sheet

Read this the morning of the interview. Condensed essentials only.

---

## JavaScript Output Prediction — Know These Cold

```javascript
// 1. Event loop order: sync → microtasks → macrotasks
console.log('1');
setTimeout(() => console.log('2'), 0);
Promise.resolve().then(() => console.log('3'));
console.log('4');
// Output: 1, 4, 3, 2

// 2. nextTick runs before Promises:
Promise.resolve().then(() => console.log('promise'));
process.nextTick(() => console.log('nextTick'));
// Output: nextTick, promise

// 3. Closure captures reference, not value:
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0);
}
// Output: 3, 3, 3  (not 0, 1, 2)
// Fix: use let, or IIFE

// 4. typeof null === 'object'  (historical bug)
// typeof undefined === 'undefined'
// typeof function(){} === 'function'
// typeof [] === 'object'  (use Array.isArray())

// 5. this in arrow function = enclosing context, not call site
const obj = {
  name: 'obj',
  regular() { return this.name; },     // 'obj' when called as obj.method()
  arrow: () => this.name,              // undefined (or global.name)
};
```

---

## Node.js Event Loop — 6 Phases

```
timers → pending callbacks → idle/prepare → poll → check → close callbacks
         ↑_______________________________________________|
                         (repeat)

nextTick queue: runs after EACH phase (not a phase itself)
microtask queue (Promises): runs after each phase too, after nextTick

Priority: nextTick > Promise > setTimeout/setImmediate

setTimeout(fn, 0) vs setImmediate(fn):
  - In main module: indeterminate order (depends on system clock)
  - Inside I/O callback: setImmediate ALWAYS runs first
```

---

## TypeScript — Most Tested Concepts

```typescript
// 1. structural typing — shape matters, not name:
interface A { x: number }
interface B { x: number }
const b: B = { x: 1 };
const a: A = b; // ✅ same shape

// 2. never propagates: string & number = never

// 3. keyof union vs intersection:
type A = { a: 1 }; type B = { b: 2 };
keyof (A | B)  // never  (only keys common to ALL)
keyof (A & B)  // 'a' | 'b' (keys from EITHER)

// 4. any extends string → 0 | 1  (distributive)

// 5. Utility types — know these:
Partial<T>     // all optional
Required<T>    // all required
Readonly<T>    // all readonly
Pick<T, K>     // subset of keys
Omit<T, K>     // all except K
Record<K, V>   // map type
Exclude<T, U>  // remove from union
Extract<T, U>  // keep from union
NonNullable<T> // remove null/undefined
ReturnType<T>  // return type of function
Parameters<T>  // args tuple of function

// 6. satisfies — validates type, keeps inferred literal types
// 7. const type param — infers literal types in generic functions
```

---

## SQL — Never Forget These

```sql
-- NULL trap: anything = NULL → NULL (not TRUE/FALSE)
-- NOT IN with NULL → returns nothing (use NOT EXISTS instead)
SELECT * FROM a WHERE id NOT IN (SELECT id FROM b WHERE id IS NOT NULL);

-- Window function order matters:
SELECT ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC) -- rank within dept

-- LAST_VALUE needs explicit frame (default frame excludes current row's peers):
LAST_VALUE(salary) OVER (ORDER BY hire_date
  ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)

-- Nth highest (interview staple):
SELECT salary FROM employees ORDER BY salary DESC LIMIT 1 OFFSET N-1;
-- OR:
SELECT DISTINCT salary FROM employees e1
WHERE N-1 = (SELECT COUNT(DISTINCT salary) FROM employees e2 WHERE e2.salary > e1.salary);

-- Index gotchas that kill performance:
-- Function on column: WHERE UPPER(name) = 'ALICE'  ← index not used
-- Leading wildcard: WHERE name LIKE '%alice'        ← index not used
-- Implicit cast: WHERE int_col = '42'               ← may not use index
-- OR conditions: use UNION instead
```

---

## Redis — Commands That Come Up

```
String:    SET key value EX 3600 NX  (set if not exists, 1hr TTL)
           INCR / INCRBY / DECRBY

Hash:      HSET key field value
           HGET key field / HGETALL key

List:      LPUSH / RPUSH / LPOP / RPOP / LLEN
           BLPOP key timeout  (blocking pop — job queue pattern)

Set:       SADD / SREM / SMEMBERS / SISMEMBER / SCARD

SortedSet: ZADD key score member
           ZRANGE key 0 -1 WITHSCORES  (low to high)
           ZREVRANGE key 0 9            (top 10)
           ZRANK / ZREVRANK             (0-indexed rank)
           ZRANGEBYSCORE key min max

Distributed lock: SET lock:key uniqueId NX PX 30000
Release (Lua):    if redis.call('GET',k)==ARGV[1] then redis.call('DEL',k) end
```

---

## Common System Design Tradeoffs

```
Consistency vs Availability:
  Strong consistency → single leader reads/writes → lower availability
  Eventual consistency → any node → higher availability, stale reads possible
  Use case drives choice: banking → strong, social feed → eventual

SQL vs NoSQL:
  SQL:   ACID, joins, schema-enforced, vertical scale
  NoSQL: flexible schema, horizontal scale, eventual consistency, no joins

Cache invalidation strategies:
  Cache-aside: app manages cache (most common)
  Write-through: write to cache + DB simultaneously
  Write-behind: write to cache, async to DB (risk of loss)

Message queue guarantees:
  At-most-once:   may lose messages (fire and forget)
  At-least-once:  may duplicate (ack after processing)
  Exactly-once:   idempotent consumers + deduplication

API rate limiting algorithms:
  Fixed window:   simple, burst at boundary
  Sliding window: accurate, more memory
  Token bucket:   allows controlled burst
  Leaky bucket:   smooths traffic to fixed rate
```

---

## Node.js Numbers to Know

```
libuv thread pool default: 4 threads (UV_THREADPOOL_SIZE env var)
Thread pool handles: fs (most ops), crypto, dns.lookup, zlib
Does NOT use thread pool: TCP, UDP, pipes (uses OS async I/O)

Default highWaterMark: 16KB for binary streams, 16 objects for objectMode
Max HTTP headers: 8KB by default
Default max EventEmitter listeners: 10

process.nextTick: runs before I/O events (can starve I/O if abused)
setImmediate: runs in check phase, after I/O events

Buffer.alloc(n): safe — zeroed memory
Buffer.allocUnsafe(n): fast — may contain old data (never send to client)
```

---

## Behavioral — Quick Reminders

```
STAR format:  Situation → Task → Action → Result

Always include numbers:
  ❌ "improved performance"
  ✅ "reduced p99 latency from 2.3s to 180ms"

Disagreement questions:
  - Acknowledge the other perspective has merit
  - State what data/principles drove your position
  - Explain how you reached resolution (data, prototype, compromise)

"Tell me about a production incident":
  - What went wrong (briefly)
  - How you detected it
  - How you fixed it
  - What you changed afterward (postmortem action items)

Questions to ask them:
  - "What does a typical on-call incident look like?"
  - "How do you measure engineering effectiveness?"
  - "What's the biggest technical challenge the team is facing?"
  - "How does code review work — what's the typical cycle time?"
```

---

## Quick Mental Checklist Before Answering

```
Coding:
  [ ] Clarify input/output format and edge cases
  [ ] State time/space complexity before coding
  [ ] Code the happy path first, then edge cases
  [ ] Test with: empty input, single element, duplicates, negatives

System design:
  [ ] Clarify scale numbers (DAU, RPS, data size, latency SLA)
  [ ] Draw components before going deep on any one
  [ ] Name the bottleneck before solving it
  [ ] Address failure modes (what if DB is down? what if cache misses?)

TypeScript/JS question:
  [ ] Say what you think the output is AND why
  [ ] Mention any edge cases ("this would differ if...")
  [ ] If unsure, reason out loud — process matters

General:
  [ ] Think 30 seconds before speaking (silence is OK)
  [ ] If you don't know: "I haven't used that specifically, but based on
      what I know about X, I'd expect..."
  [ ] Never say "I don't know" and stop — always reason to a best guess
```
