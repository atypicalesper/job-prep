# Event Loop — Tricky Interview Questions

These are the kinds of questions that trip up even experienced developers. Read each one, think about the output before reading the answer, and understand **why**.

---

## Q1: Classic Output Prediction

```javascript
console.log('1');
setTimeout(() => console.log('2'), 0);
Promise.resolve().then(() => console.log('3'));
console.log('4');
```

**Output:** `1 4 3 2`

**Why:**
- `1` → sync
- `setTimeout` → macrotask queue
- `Promise.then` → microtask queue
- `4` → sync
- Stack empty → drain microtasks → `3`
- Pick macrotask → `2`

---

## Q2: Nested Promises

```javascript
Promise.resolve()
  .then(() => {
    console.log('A');
    return Promise.resolve('B');
  })
  .then(v => console.log(v));

Promise.resolve()
  .then(() => console.log('C'))
  .then(() => console.log('D'));
```

**Output:** `A C D B`

**Why this is tricky:** `return Promise.resolve('B')` introduces an **extra microtask tick**. When you return a thenable from `.then()`, JS has to:
1. Resolve the outer promise with the inner promise
2. Subscribe to the inner promise — this costs 2 extra microtask ticks

So the chain looks like:
- Microtask tick 1: A fires, C fires
- Microtask tick 2: D fires, "B-inner" fires (registering follow-up)
- Microtask tick 3: B fires

**Lesson:** `return Promise.resolve(x)` inside `.then()` is NOT the same as `return x` — it adds microtask overhead.

---

## Q3: async/await Order

```javascript
async function foo() {
  console.log('foo start');
  await bar();
  console.log('foo end');
}

async function bar() {
  console.log('bar');
}

console.log('before');
foo();
console.log('after');
```

**Output:** `before foo start bar after foo end`

**Why:**
- `before` → sync
- `foo()` called → `foo start` → sync inside async function
- `await bar()` → calls `bar()` → `bar` logs → then suspends `foo`, schedules `foo end` as microtask
- `after` → sync (foo is suspended, not blocking)
- Stack empty → microtask: `foo end`

---

## Q4: process.nextTick vs Promise

```javascript
process.nextTick(() => console.log('nextTick 1'));
Promise.resolve().then(() => console.log('promise 1'));
process.nextTick(() => console.log('nextTick 2'));
Promise.resolve().then(() => console.log('promise 2'));
```

**Output:** `nextTick 1 nextTick 2 promise 1 promise 2`

**Why:** `process.nextTick` queue is processed BEFORE the Promise microtask queue. Both are "microtasks" conceptually, but Node.js has two queues: nextTick queue (higher) and promise microtask queue (lower).

---

## Q5: The Infinite nextTick Trap

```javascript
let count = 0;
function recurse() {
  if (count < 3) {
    count++;
    process.nextTick(recurse);
  }
}

process.nextTick(recurse);
setTimeout(() => console.log('timeout'), 0);
```

**Output:** `timeout` (after 3 recursions worth of nextTicks)

Actually wait — `count < 3` limits it, so nextTicks finish and timeout runs.

**Now this version:**
```javascript
function endless() {
  process.nextTick(endless);
}
endless();
setTimeout(() => console.log('never'), 0);
// setTimeout NEVER fires — nextTick queue never empties
```

**Lesson:** Recursive `process.nextTick` starves the event loop. Use `setImmediate` for recursive async patterns.

---

## Q6: setImmediate vs setTimeout Outside I/O

```javascript
setTimeout(() => console.log('timeout'), 0);
setImmediate(() => console.log('immediate'));
```

**Output:** Non-deterministic! Could be either order.

**Why:** When this runs outside an I/O callback, the order depends on system timer resolution and when the event loop checks timers vs check phase. This is a well-known Node.js quirk.

**BUT inside an I/O callback:**
```javascript
const fs = require('fs');
fs.readFile(__filename, () => {
  setTimeout(() => console.log('timeout'), 0);
  setImmediate(() => console.log('immediate'));
});
// Output: ALWAYS "immediate" then "timeout"
// Inside I/O: we're in poll phase, next is check phase (setImmediate)
```

---

## Q7: Promise Constructor is Synchronous

```javascript
console.log('1');
const p = new Promise((resolve) => {
  console.log('2');  // executor runs synchronously!
  resolve('done');
  console.log('3');  // still runs — after resolve()
});
p.then(v => console.log('4:', v));
console.log('5');
```

**Output:** `1 2 3 5 4: done`

**Why:** The Promise executor function runs synchronously. `resolve()` doesn't immediately run `.then()` callbacks — those are microtasks. Code after `resolve()` still runs.

---

## Q8: Chained then Return Values

```javascript
Promise.resolve(1)
  .then(x => x + 1)      // returns 2
  .then(x => {
    throw new Error('oops');
  })
  .then(x => console.log('then:', x))   // skipped!
  .catch(e => {
    console.log('catch:', e.message);
    return 'recovered';
  })
  .then(x => console.log('after catch:', x));
```

**Output:**
```
catch: oops
after catch: recovered
```

**Why:** When `.then()` throws, the error propagates down the chain, skipping all `.then()` handlers until it hits `.catch()`. After `.catch()` returns normally, the chain continues with `.then()`.

---

## Q9: Async forEach Trap

```javascript
async function processItems() {
  const items = [1, 2, 3];
  items.forEach(async (item) => {
    await delay(item * 100);
    console.log(item);
  });
  console.log('done');
}
```

**Output:** `done 1 2 3` (done appears BEFORE the items!)

**Why:** `Array.forEach` does NOT await async callbacks. Each async callback is called but immediately returns a Promise that forEach ignores. The `done` log runs synchronously after forEach returns.

**Fix:**
```javascript
// Option 1: for...of (sequential)
for (const item of items) {
  await delay(item * 100);
  console.log(item);
}

// Option 2: Promise.all (parallel)
await Promise.all(items.map(async (item) => {
  await delay(item * 100);
  console.log(item);
}));
```

---

## Q10: Microtask Between Each Await

```javascript
async function test() {
  console.log('A');
  await 1;
  console.log('B');
  await 2;
  console.log('C');
}

test();
Promise.resolve().then(() => console.log('D'));
console.log('E');
```

**Output:** `A E B D C`

**Step-by-step:**
- `test()` called → `A` (sync)
- `await 1` → suspends, schedules resume as microtask
- `D` callback → queued as microtask
- `E` → sync
- Stack empty → drain microtasks:
  - Resume test → `B`
  - `await 2` → suspends again, schedules resume
  - `D` callback runs → `D`
  - Resume test → `C`

---

## Q11: Error in Async Function Without Await

```javascript
async function fail() {
  throw new Error('async error');
}

fail(); // No await, no .catch()
// Does this crash the process?
```

**Answer:** It does NOT crash synchronously. It returns a rejected Promise. In newer Node.js (v15+), an unhandled rejection WILL crash the process by default. In older versions, it just emits a warning.

```javascript
// Safe pattern:
fail().catch(err => console.error('Caught:', err.message));

// Or:
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});
```

---

## Q12: The Classic Timer Loop Bug

```javascript
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0);
}
```

**Output:** `3 3 3` (NOT 0 1 2!)

**Why:** `var` is function-scoped, not block-scoped. All three closures reference the SAME `i`. By the time the callbacks run, the loop has finished and `i === 3`.

**Fixes:**
```javascript
// Fix 1: let (block-scoped — each iteration gets own i)
for (let i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0); // 0 1 2
}

// Fix 2: IIFE to capture value
for (var i = 0; i < 3; i++) {
  ((j) => setTimeout(() => console.log(j), 0))(i); // 0 1 2
}

// Fix 3: bind
for (var i = 0; i < 3; i++) {
  setTimeout(console.log.bind(null, i), 0); // 0 1 2
}
```

---

## Q13: Multiple Awaits on Same Promise

```javascript
const p = new Promise(resolve => setTimeout(() => resolve('done'), 1000));

async function a() {
  const result = await p;
  console.log('a:', result);
}

async function b() {
  const result = await p;
  console.log('b:', result);
}

a();
b();
```

**Output** (after 1 second): `a: done` then `b: done` (both receive the value)

**Why:** Promises are multicast. Multiple `.then()` handlers (and `await`s) on the same promise all get notified when it settles. The value is not consumed.

---

## Q14: queueMicrotask vs Promise.resolve().then()

```javascript
queueMicrotask(() => console.log('A'));
Promise.resolve().then(() => console.log('B'));
queueMicrotask(() => console.log('C'));
```

**Output:** `A B C`

They share the same microtask queue! `queueMicrotask` and `Promise.resolve().then()` are equivalent in terms of timing. Order is insertion order.

---

## Q15: Synchronous Promise Resolution Chain Length

```javascript
let resolveOuter;
const outer = new Promise(res => resolveOuter = res);

outer
  .then(() => console.log('1'))
  .then(() => console.log('2'))
  .then(() => console.log('3'));

resolveOuter();
console.log('sync');
```

**Output:** `sync 1 2 3`

Each `.then()` in a chain requires its own microtask tick. A 3-step chain takes 3 microtask ticks.

---

## Q16: Event Loop Starvation via Sync Code

```javascript
setTimeout(() => console.log('timeout'), 0);

// Synchronous operation that takes 2 seconds
const end = Date.now() + 2000;
while (Date.now() < end) {} // busy wait

console.log('sync done');
```

**Output:** `sync done` then (after 2s total) `timeout`

**Lesson:** Synchronous code always runs to completion. The event loop cannot intervene mid-execution.

---

## Q17: Promise.all Failure Behavior

```javascript
const p1 = Promise.resolve('success');
const p2 = new Promise((_, reject) => setTimeout(() => reject('error'), 100));
const p3 = new Promise(resolve => setTimeout(() => resolve('late'), 200));

Promise.all([p1, p2, p3])
  .then(results => console.log('results:', results))
  .catch(err => console.log('error:', err));
```

**Output** (after 100ms): `error: error`

**Why:** `Promise.all` short-circuits on first rejection. p3 is still pending but we get the error. p3's eventual resolution is ignored.

---

## Q18: Tricky async Return

```javascript
async function getVal() {
  return 42;
}

const result = getVal();
console.log(result);        // What is this?
console.log(result === 42); // true or false?
```

**Output:**
```
Promise { 42 }
false
```

**Why:** `async` functions ALWAYS return a Promise. The value 42 is the resolved value, not the return value directly. You need `await getVal()` or `.then()` to get 42.

---

## Q19: try/catch with async Doesn't Always Catch

```javascript
async function bad() {
  setTimeout(() => {
    throw new Error('from setTimeout'); // NOT caught!
  }, 100);
}

async function test() {
  try {
    await bad();
  } catch (e) {
    console.log('caught:', e); // This does NOT run!
  }
}

test();
```

**Why:** `bad()` returns a resolved Promise immediately. The setTimeout callback throws later, in a completely different call context. The try/catch can only catch errors thrown synchronously or from awaited Promises.

**Fix:** Wrap the error in a promise:
```javascript
async function better() {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('from setTimeout')), 100);
  });
}
```

---

## Q20: What Does the Event Loop Do When Idle?

When both queues are empty and no timers are pending, Node.js:
1. Enters poll phase and waits for I/O events
2. Goes to sleep (OS level)
3. Wakes up when an event arrives (timer expiry, network data, etc.)

This is why a Node.js server process stays alive — it's waiting in the poll phase for incoming connections, not spinning in a loop.

```javascript
// This process exits immediately (no pending work)
console.log('done');

// This process stays alive (has a pending I/O operation)
const server = require('net').createServer().listen(3000);
```

---

## Q21: Promise Created Inside setTimeout

```javascript
setTimeout(() => {
  Promise.resolve()
    .then(() => console.log('microtask inside macrotask'));
  console.log('macrotask body');
}, 0);

setTimeout(() => console.log('second macrotask'), 0);
```

**Output:**
```
macrotask body
microtask inside macrotask
second macrotask
```

**Why:** After each macrotask runs, microtasks drain. So the microtask created inside the first setTimeout runs BEFORE the second setTimeout callback.

---

## Q22: Promise.allSettled vs Promise.all vs Promise.race vs Promise.any

```javascript
const fast  = new Promise(resolve => setTimeout(() => resolve('fast'), 100));
const slow  = new Promise(resolve => setTimeout(() => resolve('slow'), 300));
const fail  = new Promise((_, reject) => setTimeout(() => reject('error'), 200));

// Promise.all — rejects as soon as ANY rejects:
Promise.all([fast, fail, slow])
  .catch(e => console.log('all:', e));
// Output: 'all: error' (after 200ms)

// Promise.allSettled — waits for ALL, never rejects:
Promise.allSettled([fast, fail, slow])
  .then(results => console.log(results));
// Output after 300ms:
// [
//   { status: 'fulfilled', value: 'fast' },
//   { status: 'rejected',  reason: 'error' },
//   { status: 'fulfilled', value: 'slow' }
// ]

// Promise.race — settles with first to settle (win OR fail):
Promise.race([fast, fail, slow])
  .then(v => console.log('race:', v));
// Output: 'race: fast' (after 100ms — first to settle)

// Promise.any — resolves with first to FULFILL (ignores rejects):
Promise.any([fail, fast, slow])
  .then(v => console.log('any:', v));
// Output: 'any: fast' (after 100ms — first to fulfill)
// If ALL reject → AggregateError
```

**Cheat sheet:**
| Method | Resolves | Rejects |
|--------|----------|---------|
| `all` | all fulfilled | first rejection |
| `allSettled` | always (with statuses) | never |
| `race` | first to settle (any) | first to settle (rejection) |
| `any` | first fulfilled | all rejected → AggregateError |

---

## Q23: Recursive setTimeout vs setInterval

```javascript
// setInterval — fixed gap from start of last execution:
const id = setInterval(() => {
  console.log('interval');
  // if this takes 150ms and interval is 100ms:
  // next call fires immediately after this one finishes (can stack up)
}, 100);

// Recursive setTimeout — fixed gap AFTER completion:
function tick() {
  console.log('tick');
  // next call is exactly 100ms AFTER this completes
  setTimeout(tick, 100);
}
setTimeout(tick, 100);
```

**When to prefer recursive setTimeout:**
- When the callback takes variable time (no overlapping calls)
- When you need to adjust delay dynamically
- When you want to stop the loop cleanly from inside

---

## Q24: What Happens When You clearTimeout an Expired Timer?

```javascript
const id = setTimeout(() => console.log('fired'), 0);

// The timer fires almost immediately.
// Then later:
setTimeout(() => {
  clearTimeout(id); // clearing an already-fired timer
  console.log('cleared (but already fired)');
}, 100);
```

**Output:** `'fired'` then `'cleared (but already fired)'`

`clearTimeout` on an already-fired or non-existent timer ID is a no-op. It doesn't throw. It's safe to always call `clearTimeout(id)` in cleanup even if you're not sure whether it fired.

---

## Q25: for await...of with Async Iterators

```javascript
async function* generate() {
  yield 1;
  await new Promise(resolve => setTimeout(resolve, 100));
  yield 2;
  yield 3;
}

async function main() {
  console.log('start');
  for await (const value of generate()) {
    console.log(value);
  }
  console.log('end');
}

main();
console.log('after main call'); // runs before 'start' completes?
```

**Output:**
```
start
after main call
1
2
3
end
```

`main()` is async — `for await...of` suspends at each `await` inside the generator. Code after `main()` runs while main is suspended (it returned a pending Promise immediately).

---

## Q26: Microtask Flooding — Too Many Promises

```javascript
let count = 0;
function floodMicrotasks() {
  if (count < 1000000) {
    count++;
    Promise.resolve().then(floodMicrotasks); // queue a microtask
  }
}
floodMicrotasks();
setTimeout(() => console.log('macrotask — count:', count), 0);
```

**Output:** `'macrotask — count: 1000000'` (but possibly after a long delay)

Microtasks drain **completely** before any macrotask runs. A million microtasks will all run before the setTimeout fires. This is why flooding microtasks starves I/O.

Compare: `process.nextTick` has same behavior (but even higher priority).

---

## Q27: Async Function Called Without await — When Does It Run?

```javascript
async function fetchData() {
  console.log('A');
  const result = await Promise.resolve('data');
  console.log('B', result);
  return result;
}

console.log('1');
const promise = fetchData(); // no await
console.log('2');
promise.then(v => console.log('3', v));
console.log('4');
```

**Output:** `1 A 2 4 B data 3 data`

**Step by step:**
- `1` sync
- `fetchData()` called → `A` sync, hits `await`, suspends
- `2` sync
- `.then(...)` registered on promise
- `4` sync
- Microtasks drain: resume fetchData → `B data`, returns `'data'`
- Chained `.then` → `3 data`

---

## Q28: Event Loop with Real I/O — Order Guarantee

```javascript
const fs = require('fs');

fs.readFile(__filename, () => {
  console.log('readFile callback');   // poll phase
  setTimeout(() => console.log('timeout inside I/O'), 0);
  setImmediate(() => console.log('immediate inside I/O'));
  process.nextTick(() => console.log('nextTick inside I/O'));
  Promise.resolve().then(() => console.log('promise inside I/O'));
});

setTimeout(() => console.log('timeout outside I/O'), 0);
setImmediate(() => console.log('immediate outside I/O'));
```

**Output (guaranteed order):**
```
immediate outside I/O       ← or timeout outside (indeterminate)
readFile callback
nextTick inside I/O         ← highest priority
promise inside I/O          ← second
immediate inside I/O        ← check phase (next)
timeout inside I/O          ← timers phase (after check)
```

Inside an I/O callback: nextTick > Promise > setImmediate > setTimeout.

---

## Quick Reference: Execution Order Rules

```
1. ALL synchronous code
     ↓
2. process.nextTick queue (drained completely)    [Node.js only]
     ↓
3. Promise microtask queue (drained completely)
     ↓
4. ONE macrotask (setTimeout/setInterval/setImmediate/I/O)
     ↓
5. Go back to step 2
```

**Memory trick:** "**S**ync → **N**ext → **P**romise → **M**acro → repeat"

## Quick Reference: Promise Combinators

| Method | Waits for | Short-circuits on | Returns |
|--------|-----------|-------------------|---------|
| `Promise.all(arr)` | all | first rejection | array of values |
| `Promise.allSettled(arr)` | all | never | array of `{status,value/reason}` |
| `Promise.race(arr)` | first | first settlement | single value/rejection |
| `Promise.any(arr)` | first fulfill | all reject | single value / AggregateError |
