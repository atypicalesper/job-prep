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

---

## Q29: queueMicrotask Inside queueMicrotask vs Promise Chain

```javascript
queueMicrotask(() => {
  console.log('A');
  queueMicrotask(() => console.log('B'));
});

Promise.resolve()
  .then(() => console.log('C'))
  .then(() => console.log('D'));
```

**Output:** `A C B D`

**Why:** Both `queueMicrotask` and `Promise.resolve().then()` share the same microtask queue in FIFO order.
- Tick 1: outer `queueMicrotask` runs → `A`, queues `B`; then `.then(C)` runs → `C`, queues `D`
- Tick 2: `B` runs, then `D` runs

**Lesson:** Nested microtasks are appended to the end of the current microtask queue, interleaving with other pending microtasks.

---

## Q30: queueMicrotask Error vs Promise Rejection

```javascript
queueMicrotask(() => {
  throw new Error('qMT error');
});

Promise.resolve().then(() => {
  throw new Error('promise error');
});
```

**What happens:**
- `queueMicrotask` throw → uncaught exception (like any synchronous throw). In Node.js this crashes the process.
- `Promise.then` throw → becomes a rejected promise → triggers `unhandledRejection` handler.

**Lesson:** `queueMicrotask` and `Promise.resolve().then()` are NOT identical. Errors from `queueMicrotask` bypass Promise rejection handling entirely. This matters for error recovery strategies.

---

## Q31: requestAnimationFrame vs Microtask vs setTimeout (Browser)

```javascript
// Browser only
console.log('sync');

requestAnimationFrame(() => console.log('rAF'));
setTimeout(() => console.log('timeout'), 0);
Promise.resolve().then(() => console.log('microtask'));
queueMicrotask(() => console.log('qMT'));
```

**Output:**
```
sync
microtask
qMT
rAF        ← or after timeout, depends on browser
timeout    ← or before rAF
```

**Why:** Microtasks always run first. But `rAF` vs `setTimeout(0)` ordering is NOT guaranteed. `rAF` fires before the next repaint (typically ~16ms at 60fps). `setTimeout(0)` fires on the next macrotask. In Chrome, `setTimeout(0)` usually fires before `rAF` because the timer resolves before the next frame.

**Key insight:** `rAF` is NOT a microtask and NOT a regular macrotask — it has its own queue processed once per frame, after macrotasks and before paint.

---

## Q32: requestAnimationFrame Creates Microtasks

```javascript
// Browser only
requestAnimationFrame(() => {
  console.log('rAF 1');
  Promise.resolve().then(() => console.log('microtask in rAF'));
});

requestAnimationFrame(() => {
  console.log('rAF 2');
});
```

**Output:**
```
rAF 1
microtask in rAF
rAF 2
```

**Why:** Microtasks drain between each rAF callback, just like they drain between each macrotask. This means a microtask queued inside one rAF callback runs BEFORE the next rAF callback.

---

## Q33: process.nextTick Inside a Promise vs Promise Inside nextTick

```javascript
Promise.resolve().then(() => {
  console.log('P1');
  process.nextTick(() => console.log('NT inside P'));
});

process.nextTick(() => {
  console.log('NT1');
  Promise.resolve().then(() => console.log('P inside NT'));
});
```

**Output:** `NT1 P inside NT P1 NT inside P`

**Why:** Step-by-step:
1. nextTick queue drains first: `NT1`, which queues a promise microtask
2. Promise microtask queue drains: `P inside NT` (queued by NT1), then `P1` (original), which queues a nextTick
3. nextTick queue drains again: `NT inside P`

**Key insight:** After each microtask phase, Node checks the nextTick queue again before moving on. The two queues interleave: nextTick → promises → check nextTick again → check promises again → until both empty.

---

## Q34: Multiple Nested setTimeout(0) — Timing Accumulates

```javascript
console.time('total');

setTimeout(() => {
  console.log('1');
  setTimeout(() => {
    console.log('2');
    setTimeout(() => {
      console.log('3');
      console.timeEnd('total');
    }, 0);
  }, 0);
}, 0);
```

**Output:** `1` then `2` then `3` then `total: ~3-12ms` (browser may clamp to 4ms each)

**Why:** In browsers, nested `setTimeout(0)` calls beyond depth 4 get clamped to a minimum of 4ms. Three nested levels ≈ 12ms minimum. In Node.js, there's no such clamping — setTimeout(0) becomes setTimeout(1) but nested calls still run in consecutive event loop iterations with minimal delay.

**This is why `setTimeout(0)` is NOT a reliable way to schedule tight loops.**

---

## Q35: setTimeout(0) vs setTimeout(0) vs setTimeout(0) — FIFO?

```javascript
setTimeout(() => console.log('A'), 0);
setTimeout(() => console.log('B'), 0);
setTimeout(() => console.log('C'), 0);
```

**Output:** `A B C` — always

**Why:** Multiple `setTimeout(0)` calls at the same level are FIFO. They all expire in the same timer phase and are processed in registration order. This is guaranteed by the spec.

**BUT this is NOT FIFO:**
```javascript
setTimeout(() => console.log('X'), 10);
setTimeout(() => console.log('Y'), 0);
setTimeout(() => console.log('Z'), 5);
```

**Output:** `Y Z X` — sorted by expiration time, not registration order.

---

## Q36: async/await in for...of vs forEach vs for Loop

```javascript
const delay = ms => new Promise(r => setTimeout(r, ms));

async function sequential() {
  const items = [300, 100, 200];

  console.time('for-of');
  for (const ms of items) {
    await delay(ms);
  }
  console.timeEnd('for-of'); // ~600ms (sequential)
}

async function parallel() {
  const items = [300, 100, 200];

  console.time('map');
  await Promise.all(items.map(ms => delay(ms)));
  console.timeEnd('map'); // ~300ms (parallel, limited by slowest)
}

async function broken() {
  const items = [300, 100, 200];

  console.time('forEach');
  items.forEach(async ms => {
    await delay(ms);
  });
  console.timeEnd('forEach'); // ~0ms!! forEach doesn't await
}
```

**Lesson:** `for...of` = sequential, `Promise.all(map)` = parallel, `forEach` = fire-and-forget disaster.

---

## Q37: for...of with await — Each Iteration Is a Separate Microtask Checkpoint

```javascript
async function test() {
  const items = [1, 2, 3];

  for (const item of items) {
    await Promise.resolve();
    console.log('item', item);
  }
}

test();
Promise.resolve()
  .then(() => console.log('X'))
  .then(() => console.log('Y'))
  .then(() => console.log('Z'));
```

**Output:** `X item 1 Y item 2 Z item 3`

**Why:** Each `await` in the for loop yields control. The loop resumes as a microtask, interleaving with the chained `.then()` calls. They take turns on the microtask queue.

---

## Q38: Promise.race — Losers Still Execute

```javascript
let sideEffect = 0;

const slow = new Promise(resolve => {
  setTimeout(() => {
    sideEffect++;
    console.log('slow finished');
    resolve('slow');
  }, 200);
});

const fast = new Promise(resolve => {
  setTimeout(() => {
    resolve('fast');
  }, 50);
});

const winner = await Promise.race([slow, fast]);
console.log('winner:', winner);
console.log('sideEffect:', sideEffect); // 0 at this point

await new Promise(r => setTimeout(r, 300));
console.log('sideEffect after wait:', sideEffect); // 1!
```

**Output:**
```
winner: fast
sideEffect: 0
slow finished
sideEffect after wait: 1
```

**Why:** `Promise.race` does NOT cancel losers. The slow promise's callback still fires. This is a common source of bugs — resource leaks, double writes, stale state updates.

**Fix:** Use `AbortController` to actually cancel the losing operations.

---

## Q39: Promise.all with setTimeout Mixing — Parallel Timing

```javascript
const makeTimer = (label, ms) =>
  new Promise(resolve => setTimeout(() => {
    console.log(label);
    resolve(label);
  }, ms));

console.log('start');

await Promise.all([
  makeTimer('A', 300),
  makeTimer('B', 100),
  makeTimer('C', 200),
]);

console.log('all done');
```

**Output:**
```
start
B        ← 100ms
C        ← 200ms
A        ← 300ms
all done ← immediately after A (last one)
```

**Why:** `Promise.all` runs all promises concurrently. They resolve in time-order, not array-order. But the resolved value array still preserves the original order: `['A', 'B', 'C']`.

---

## Q40: MutationObserver Uses Microtasks

```javascript
// Browser only
const div = document.createElement('div');

const observer = new MutationObserver(() => {
  console.log('mutation');
});
observer.observe(div, { attributes: true });

console.log('before');
div.setAttribute('data-x', '1');
console.log('after');

Promise.resolve().then(() => console.log('promise'));
queueMicrotask(() => console.log('qMT'));
```

**Output:**
```
before
after
mutation
promise
qMT
```

**Why:** `MutationObserver` callbacks are microtasks. The mutation is observed synchronously but the callback is queued as a microtask. Since it was queued before the Promise and queueMicrotask, it runs first (FIFO within the microtask queue).

---

## Q41: MutationObserver Batches Synchronous Mutations

```javascript
// Browser only
const div = document.createElement('div');
let callCount = 0;

const observer = new MutationObserver((mutations) => {
  callCount++;
  console.log('mutations:', mutations.length, 'callCount:', callCount);
});
observer.observe(div, { attributes: true });

div.setAttribute('a', '1');
div.setAttribute('b', '2');
div.setAttribute('c', '3');
```

**Output:** `mutations: 3 callCount: 1`

**Why:** MutationObserver batches all synchronous DOM changes into a single microtask callback. Even though we made 3 changes, the observer fires once with all 3 mutations. This is more efficient than individual mutation events.

---

## Q42: setImmediate vs setTimeout(0) — The Definitive Test

```javascript
// Node.js only
const results = [];

for (let i = 0; i < 100; i++) {
  const order = [];
  setTimeout(() => order.push('T'), 0);
  setImmediate(() => {
    order.push('I');
    if (order.length === 2) results.push(order.join(''));
  });
}

setTimeout(() => {
  const TI = results.filter(r => r === 'TI').length;
  const IT = results.filter(r => r === 'IT').length;
  console.log(`TI: ${TI}, IT: ${IT}`);
  // Mix of both! Neither order is guaranteed.
}, 1000);
```

**Why:** At the top level (not inside I/O), `setTimeout(0)` and `setImmediate` race. The timer resolution varies by OS. Inside I/O callbacks, `setImmediate` always wins because we're in the poll phase and check phase comes next.

---

## Q43: setImmediate Recursion Does NOT Starve I/O

```javascript
// Node.js only
let count = 0;

function recurseImmediate() {
  count++;
  if (count <= 5) setImmediate(recurseImmediate);
}

setImmediate(recurseImmediate);

setTimeout(() => console.log('timeout ran, count:', count), 0);
```

**Output:** `timeout ran, count: 1` (or 2, or small number)

**Why:** Unlike `process.nextTick`, recursive `setImmediate` does NOT starve the event loop. Each `setImmediate` callback runs in the check phase, but the recursive one is scheduled for the NEXT iteration of the event loop, not the current one. So timers and I/O still get a chance to run between iterations.

**This is why `setImmediate` is preferred over `process.nextTick` for recursive patterns.**

---

## Q44: AbortController with Fetch — Timing Matters

```javascript
const controller = new AbortController();

// Abort before the fetch even starts
controller.abort();

try {
  const response = await fetch('https://example.com', {
    signal: controller.signal,
  });
  console.log('success'); // Never reached
} catch (err) {
  console.log(err.name);  // 'AbortError'
  console.log(controller.signal.aborted); // true
  console.log(controller.signal.reason);  // DOMException or Error
}
```

**Output:** `AbortError` then `true` then the abort reason

**Why:** Aborting BEFORE calling fetch still throws. The signal is checked immediately when the fetch starts. This is useful for pre-cancellation patterns (e.g., a component unmounts before the request fires).

---

## Q45: AbortController with Custom Async Operations

```javascript
async function longTask(signal) {
  for (let i = 0; i < 5; i++) {
    if (signal.aborted) {
      throw new Error('Aborted at step ' + i);
    }
    console.log('step', i);
    await new Promise(r => setTimeout(r, 100));
  }
  return 'done';
}

const controller = new AbortController();
setTimeout(() => controller.abort(), 250);

try {
  const result = await longTask(controller.signal);
  console.log(result);
} catch (e) {
  console.log('caught:', e.message);
}
```

**Output:**
```
step 0
step 1
step 2
caught: Aborted at step 3
```

**Why:** The abort signal is checked at the top of each iteration. Steps 0, 1, 2 run fine (under 250ms). By step 3 (~300ms), the abort has fired. The check at the start of iteration 3 throws.

**Gotcha:** If you don't check `signal.aborted`, the operation runs to completion even after abort. AbortController doesn't magically cancel running code — you must cooperatively check it.

---

## Q46: Event Listeners Fire Synchronously, Creating Microtask Traps

```javascript
const btn = new EventTarget();

btn.addEventListener('click', () => {
  console.log('listener 1');
  Promise.resolve().then(() => console.log('microtask 1'));
});

btn.addEventListener('click', () => {
  console.log('listener 2');
  Promise.resolve().then(() => console.log('microtask 2'));
});

btn.dispatchEvent(new Event('click'));
console.log('after dispatch');
```

**Output:**
```
listener 1
listener 2
after dispatch
microtask 1
microtask 2
```

**Why:** `dispatchEvent` is synchronous — all listeners run as part of the current call stack. Microtasks queued inside listeners don't drain between listeners, they drain after the entire synchronous dispatch completes.

**BUT in browsers with real user clicks:**
```javascript
// If user physically clicks the button:
// listener 1
// microtask 1    ← microtask drains between listeners!
// listener 2
// microtask 2
```

**This is a real difference between `dispatchEvent()` and actual user interaction.** With `dispatchEvent`, all listeners share one synchronous call stack. With real clicks, each listener is essentially its own task.

---

## Q47: Event Listener removal During Dispatch

```javascript
const target = new EventTarget();

function handler1() {
  console.log('handler1');
  target.removeEventListener('test', handler2);
}

function handler2() {
  console.log('handler2');
}

target.addEventListener('test', handler1);
target.addEventListener('test', handler2);
target.dispatchEvent(new Event('test'));
```

**Output:** `handler1 handler2`

**Why:** Even though `handler2` is removed during dispatch, it still fires for the current dispatch cycle. The browser snapshots the listener list when dispatch begins. Removal takes effect on the NEXT dispatch.

---

## Q48: Top-Level Await Blocks Module Graph

```javascript
// slow-module.mjs
console.log('slow: start');
await new Promise(r => setTimeout(r, 2000));
console.log('slow: done');
export const value = 42;

// fast-module.mjs
console.log('fast: loaded');
export const speed = 'fast';

// main.mjs
import { value } from './slow-module.mjs';
import { speed } from './fast-module.mjs';
console.log('main:', value, speed);
```

**Output:**
```
slow: start
(2 second pause)
slow: done
fast: loaded
main: 42 fast
```

**Why:** Top-level `await` blocks all modules that depend on it AND all sibling imports. `fast-module.mjs` won't even start loading until `slow-module.mjs` finishes, because modules in the same graph are evaluated in dependency order.

**Gotcha:** This can silently make your app startup horrifically slow if a deeply nested dependency uses top-level await.

---

## Q49: Top-Level Await — Parallel Import Trick

```javascript
// main.mjs — WRONG (sequential):
import { a } from './slow-a.mjs'; // top-level await inside, 2s
import { b } from './slow-b.mjs'; // top-level await inside, 2s
// Total: ~4 seconds

// main.mjs — STILL sequential!
// Static imports CANNOT be parallelized with top-level await

// main.mjs — RIGHT (parallel with dynamic import):
const [modA, modB] = await Promise.all([
  import('./slow-a.mjs'),
  import('./slow-b.mjs'),
]);
// Total: ~2 seconds (parallel)
```

**Lesson:** Static `import` declarations execute in dependency order. To parallelize modules that use top-level await, you must use dynamic `import()` with `Promise.all`.

---

## Q50: Generator Yield Interleaves with Event Loop

```javascript
function* gen() {
  console.log('gen: before yield 1');
  yield 1;
  console.log('gen: before yield 2');
  yield 2;
}

const it = gen();
console.log('A');
console.log('next:', it.next());
console.log('B');
setTimeout(() => {
  console.log('next:', it.next());
  console.log('next:', it.next());
}, 0);
console.log('C');
```

**Output:**
```
A
gen: before yield 1
next: { value: 1, done: false }
B
C
gen: before yield 2
next: { value: 2, done: false }
next: { value: undefined, done: true }
```

**Why:** Generators are lazy and synchronous. Each `.next()` runs the generator until the next `yield`, then suspends. The generator doesn't resume until someone explicitly calls `.next()`. When `.next()` is called inside setTimeout, the generator resumes in that macrotask context.

---

## Q51: Async Generator + for await + Break = Cleanup

```javascript
async function* infinite() {
  let i = 0;
  try {
    while (true) {
      yield i++;
      await new Promise(r => setTimeout(r, 50));
    }
  } finally {
    console.log('generator cleanup, last i:', i);
  }
}

async function consume() {
  for await (const val of infinite()) {
    console.log('val:', val);
    if (val >= 2) break;
  }
  console.log('after loop');
}

await consume();
```

**Output:**
```
val: 0
val: 1
val: 2
generator cleanup, last i: 3
after loop
```

**Why:** When you `break` out of a `for await...of`, the engine calls `.return()` on the async generator, which triggers the `finally` block. This is how you do proper cleanup (closing connections, releasing resources). Without `try/finally`, the generator just gets garbage collected silently.

---

## Q52: Promise.resolve(thenable) — The Extra Tick Trap Revisited

```javascript
const thenable = {
  then(resolve) {
    console.log('thenable.then called');
    resolve('thenable value');
  }
};

Promise.resolve(thenable).then(v => console.log('resolved:', v));
Promise.resolve('plain').then(v => console.log('plain:', v));
```

**Output:**
```
thenable.then called
plain: plain
resolved: thenable value
```

**Why:** `Promise.resolve(thenable)` wraps the thenable by calling its `.then()` synchronously, but the resolution is still async (takes a microtask tick). Meanwhile, `Promise.resolve('plain')` already has its value, so its `.then()` callback runs first.

**This is why duck-typed thenables can cause subtle ordering bugs when mixed with real Promises.**

---

## Q53: Mixing async/await with Promise.all and Error Handling

```javascript
async function failing() {
  await new Promise(r => setTimeout(r, 50));
  throw new Error('fail');
}

async function succeeding() {
  await new Promise(r => setTimeout(r, 100));
  console.log('succeeding done');
  return 'ok';
}

try {
  const [a, b] = await Promise.all([failing(), succeeding()]);
} catch (e) {
  console.log('caught:', e.message);
}

await new Promise(r => setTimeout(r, 200));
console.log('final');
```

**Output:**
```
caught: fail
succeeding done
final
```

**Why:** `Promise.all` rejects immediately when `failing()` rejects at 50ms, but `succeeding()` is still running — its setTimeout callback fires at 100ms and logs regardless. `Promise.all` doesn't cancel ongoing operations.

**This causes bugs:** If `succeeding()` writes to a database, that write still happens even though you're in the catch block. Use `AbortController` to truly cancel.

---

## Q54: Double await — What Does It Mean?

```javascript
async function test() {
  const result = await await Promise.resolve(
    Promise.resolve('deep')
  );
  console.log(result);
}

test();
console.log('sync');
```

**Output:** `sync deep`

**Why:** `Promise.resolve(Promise.resolve('deep'))` doesn't double-wrap — `Promise.resolve` returns the same promise if passed a native promise. So `await await samePromise` is just two microtask ticks to unwrap the same value. The first `await` gets the inner promise, the second `await` gets `'deep'`.

---

## Q55: Promise Constructor + Immediate Reject + Then

```javascript
const p = new Promise((resolve, reject) => {
  reject('error');
  resolve('success'); // Does this do anything?
});

p.then(
  v => console.log('fulfilled:', v),
  e => console.log('rejected:', e)
);
```

**Output:** `rejected: error`

**Why:** A promise can only settle once. After `reject('error')`, calling `resolve('success')` is silently ignored. First settlement wins. This is by spec and is a safety feature.

**Gotcha variation:**
```javascript
const p = new Promise((resolve) => {
  resolve('first');
  resolve('second'); // Ignored
});
p.then(v => console.log(v)); // 'first'
```

---

## Q56: Microtask Ordering with Multiple Await Chains

```javascript
async function a() {
  await Promise.resolve();
  console.log('a1');
  await Promise.resolve();
  console.log('a2');
}

async function b() {
  await Promise.resolve();
  console.log('b1');
  await Promise.resolve();
  console.log('b2');
}

a();
b();
console.log('sync');
```

**Output:** `sync a1 b1 a2 b2`

**Why:** Both functions hit their first `await` and suspend. After sync code finishes:
- Microtask tick 1: both `a` and `b` resume → `a1` (queued first), `b1`
- Each hits second `await` and suspends again
- Microtask tick 2: both resume → `a2`, `b2`

**Key insight:** Multiple async functions interleave at `await` points. They don't run sequentially — they take turns on the microtask queue, creating a round-robin effect.

---

## Q57: AbortSignal.timeout — The Modern Pattern

```javascript
// Node.js 18+ / Modern browsers
async function fetchWithTimeout() {
  try {
    const response = await fetch('https://httpbin.org/delay/10', {
      signal: AbortSignal.timeout(2000),
    });
    console.log('response:', response.status);
  } catch (err) {
    console.log(err.name);          // 'TimeoutError' (NOT AbortError!)
    console.log(err instanceof DOMException); // true
  }
}
```

**Output:** `TimeoutError` then `true`

**Why:** `AbortSignal.timeout()` throws a `TimeoutError`, not an `AbortError`. This lets you distinguish between user-initiated abort and timeout. Before this API, you had to manually wire `setTimeout` + `AbortController`, which was error-prone.

```javascript
// Combining user abort with timeout:
const userController = new AbortController();
const signal = AbortSignal.any([
  userController.signal,
  AbortSignal.timeout(5000),
]);
// AbortSignal.any() — first signal to abort wins
```

---

## Q58: process.nextTick Inside setImmediate — Priority Reasserts

```javascript
// Node.js only
setImmediate(() => {
  console.log('immediate 1');

  process.nextTick(() => console.log('nextTick inside immediate'));
  Promise.resolve().then(() => console.log('promise inside immediate'));

  console.log('immediate 1 end');
});

setImmediate(() => {
  console.log('immediate 2');
});
```

**Output:**
```
immediate 1
immediate 1 end
nextTick inside immediate
promise inside immediate
immediate 2
```

**Why:** Between each `setImmediate` callback, Node.js drains the nextTick and promise microtask queues. So `nextTick` and promise callbacks queued during `immediate 1` run before `immediate 2`.

This is the same pattern as setTimeout callbacks — microtasks always drain between macrotask callbacks.

---

## Q59: Generator + Promise — Building Async/Await from Scratch

```javascript
function run(generatorFn) {
  const it = generatorFn();

  function step(value) {
    const result = it.next(value);
    if (result.done) return Promise.resolve(result.value);
    return Promise.resolve(result.value).then(step);
  }

  return step();
}

run(function* () {
  console.log('start');
  const a = yield Promise.resolve(1);
  console.log('a:', a);
  const b = yield Promise.resolve(a + 1);
  console.log('b:', b);
  return b + 1;
}).then(result => console.log('result:', result));

console.log('sync');
```

**Output:**
```
start
sync
a: 1
b: 2
result: 3
```

**Why:** This is how `async/await` works under the hood. The `run` function drives the generator, passing each yielded promise's value back in via `.next(value)`. `start` logs synchronously, then the generator yields a promise and suspends. `sync` runs. Then microtasks drive the generator forward.

**This is exactly what Babel used to do** to transpile `async/await` for older runtimes.

---

## Q60: Event Loop Phases — I/O Callback Queues Microtask

```javascript
// Node.js only
const fs = require('fs');

fs.readFile(__filename, () => {
  console.log('I/O callback');

  process.nextTick(() => {
    console.log('nextTick in I/O');
    Promise.resolve().then(() => console.log('promise in nextTick in I/O'));
  });

  setImmediate(() => console.log('immediate in I/O'));

  Promise.resolve().then(() => {
    console.log('promise in I/O');
    process.nextTick(() => console.log('nextTick in promise in I/O'));
  });
});
```

**Output:**
```
I/O callback
nextTick in I/O
promise in nextTick in I/O
promise in I/O
nextTick in promise in I/O
immediate in I/O
```

**Why:** After the I/O callback:
1. nextTick queue drains → `nextTick in I/O`, which queues a promise
2. Promise queue drains → `promise in nextTick in I/O`, then `promise in I/O`, which queues a nextTick
3. nextTick queue drains again → `nextTick in promise in I/O`
4. Both microtask queues empty → move to check phase → `immediate in I/O`

The nextTick and promise queues ping-pong until both are empty before any macrotask runs.

---

## Q61: Async Stack Trace Gotcha — Where Did the Error Come From?

```javascript
async function inner() {
  await new Promise(r => setTimeout(r, 100));
  throw new Error('deep error');
}

async function middle() {
  return inner(); // Note: no await!
}

async function outer() {
  try {
    await middle();
  } catch (e) {
    console.log(e.stack);
  }
}

outer();
```

**Output:** Stack trace shows `inner` and `outer` but may NOT show `middle`.

**Why:** `middle()` does `return inner()` without `await`. This means `middle` is not on the async call stack when the error occurs — it returned the promise directly without suspending. The engine can't reconstruct the frame.

**Fix:**
```javascript
async function middle() {
  return await inner(); // 'await' keeps middle in the stack trace
}
```

**Lesson:** `return await` is NOT redundant in error-handling scenarios. It preserves the stack frame for better debugging. ESLint's `no-return-await` rule is controversial for this reason.

---

## Q62: Promise.race with Immediately Resolved Promise

```javascript
const never = new Promise(() => {}); // never settles

const result = await Promise.race([
  never,
  Promise.resolve('instant'),
]);

console.log(result);
```

**Output:** `instant`

**Why:** `Promise.race` resolves with the first promise to settle. `Promise.resolve('instant')` is already resolved, so race settles immediately. The `never` promise doesn't matter.

**But watch out:**
```javascript
const result = await Promise.race([
  new Promise(() => {}), // never settles
]);
// This hangs forever! Race with a single never-settling promise = deadlock
```

---

## Q63: Thenable in Promise.all — Non-Promise Objects

```javascript
const thenable = {
  then(resolve) {
    setTimeout(() => resolve('thenable!'), 100);
  }
};

const results = await Promise.all([
  Promise.resolve('promise'),
  thenable,
  42,                        // plain value
  'string',                  // plain value
]);

console.log(results);
```

**Output:** `['promise', 'thenable!', 42, 'string']`

**Why:** `Promise.all` wraps each element with `Promise.resolve()`. Plain values become immediately resolved promises. Thenables get their `.then()` called. You can mix promises, thenables, and plain values freely.

**Gotcha:** An object with a `then` property that's a function is treated as a thenable, even accidentally:
```javascript
const data = { then: 'some string value', other: 42 };
// Promise.resolve(data) — works fine, 'then' is not a function

const bug = { then: () => {} }; // 'then' IS a function!
// Promise.resolve(bug) — NEVER settles! The 'then' function
// is called but never calls resolve/reject.
```

---

## Q64: for await...of on Non-Async Iterable — It Works!

```javascript
const syncIterable = {
  [Symbol.iterator]() {
    let i = 0;
    return {
      next() {
        return i < 3
          ? { value: Promise.resolve(i++), done: false }
          : { done: true };
      }
    };
  }
};

for await (const val of syncIterable) {
  console.log(val);
}
```

**Output:** `0 1 2`

**Why:** `for await...of` works on regular iterables too, not just async iterables. It awaits each value. If the values are promises, they get unwrapped. If they're plain values, they pass through like `await plainValue`.

**This is a feature, not a bug** — it makes `for await` a universal loop for any mix of sync/async iterables.

---

## Q65: Promise.any — All Reject = AggregateError

```javascript
async function test() {
  try {
    await Promise.any([
      Promise.reject('error 1'),
      Promise.reject('error 2'),
      Promise.reject('error 3'),
    ]);
  } catch (e) {
    console.log(e instanceof AggregateError); // true
    console.log(e.errors);                    // ['error 1', 'error 2', 'error 3']
    console.log(e.message);                   // 'All promises were rejected'
  }
}

test();
```

**Output:**
```
true
['error 1', 'error 2', 'error 3']
All promises were rejected
```

**Why:** `Promise.any` only rejects when ALL promises reject. The `AggregateError` collects every rejection reason. This is the inverse of `Promise.all` — one must succeed instead of all must succeed.

**Gotcha:** `AggregateError.errors` preserves the original array order, NOT the rejection order.

---

## Q66: Mixing sync throw with async in Promise.all

```javascript
function syncThrow() {
  throw new Error('sync boom');
}

async function asyncOk() {
  await new Promise(r => setTimeout(r, 100));
  console.log('async completed');
  return 'ok';
}

try {
  await Promise.all([syncThrow(), asyncOk()]);
} catch (e) {
  console.log('caught:', e.message);
}

await new Promise(r => setTimeout(r, 200));
console.log('end');
```

**Output:**
```
caught: sync boom
async completed
end
```

**Wait — trick question!** This actually throws BEFORE `Promise.all` even executes. `syncThrow()` is evaluated as an argument, and it throws synchronously. The `try/catch` catches it.

But `asyncOk()` was also called as an argument — arguments evaluate left to right. Since `syncThrow()` throws first, `asyncOk()` is NEVER called... right?

**Actually:** JavaScript evaluates all function call arguments before passing them. Arguments are evaluated left-to-right. `syncThrow()` is called first and throws, so `asyncOk()` is never called. The output is just:
```
caught: sync boom
end
```

`async completed` never appears because `asyncOk()` was never invoked.

---

## Q67: setTimeout Minimum Delay is NOT 0

```javascript
// Node.js
console.time('timer');
setTimeout(() => {
  console.timeEnd('timer');
}, 0);
```

**Output:** `timer: 1.xxx ms` (NOT 0ms)

**Why:** In Node.js, `setTimeout(fn, 0)` is silently coerced to `setTimeout(fn, 1)`. The minimum delay is 1ms. In browsers, after 4 nested setTimeout calls, the minimum is clamped to 4ms (per HTML spec).

```javascript
// Prove it in Node.js:
setTimeout(() => {
  setTimeout(() => {
    setTimeout(() => {
      setTimeout(() => {
        console.log('depth 4');
      }, 0);
    }, 0);
  }, 0);
}, 0);
// Each level adds ~1ms in Node, ~1-4ms in browsers
```

---

## Q68: Unhandled Rejection Window — You Have One Microtask

```javascript
const p = Promise.reject('oops');

// Is this "handled" or "unhandled"?
setTimeout(() => {
  p.catch(e => console.log('late catch:', e));
}, 0);
```

**Behavior:** This triggers an `unhandledRejection` event in Node.js! Even though we add a `.catch()` handler, we add it too late — in the next macrotask. The rejection is considered unhandled if no handler is attached by the end of the current microtask checkpoint.

**This IS handled:**
```javascript
const p = Promise.reject('oops');
// Attaching synchronously or in a microtask — fine:
queueMicrotask(() => {
  p.catch(e => console.log('caught:', e)); // Handled!
});
```

**Lesson:** Always attach `.catch()` synchronously or in the same microtask tick. Never rely on setTimeout to add error handlers.
