# Promises & async/await — Tricky Interview Questions

---

## Q1: Promise Constructor is Synchronous

```javascript
console.log('1');
new Promise(resolve => {
  console.log('2');
  resolve();
  console.log('3');
});
console.log('4');
```

**Output:** `1 2 3 4`

**Why:** The executor runs synchronously. Even `resolve()` is synchronous — it marks the promise as fulfilled, but the `.then()` callbacks run later (as microtasks). The code after `resolve()` still runs.

---

## Q2: async Function Return Value

```javascript
async function fn() {
  return 42;
}

const result = fn();
console.log(result);
console.log(result === 42);
```

**Output:**
```
Promise { 42 }
false
```

**Why:** `async` functions always return a Promise. `42` is wrapped in `Promise.resolve(42)`. You need `await fn()` or `.then()` to get `42`.

---

## Q3: await on Non-Promise

```javascript
async function test() {
  const x = await 42;
  const y = await null;
  const z = await undefined;
  console.log(x, y, z);
}
test();
```

**Output:** `42 null undefined`

**Why:** `await` wraps any value in `Promise.resolve()`. For non-Promises, it resolves immediately to that value. Still creates a microtask checkpoint though — code after any `await` runs async.

---

## Q4: Promise Chain Return Value

```javascript
Promise.resolve(1)
  .then(v => v + 1)
  .then(v => { v + 1 }) // no return!
  .then(v => v + 1)
  .then(console.log);
```

**Output:** `NaN`

**Why:** The second `.then` has no `return` statement — it returns `undefined`. Then `undefined + 1 = NaN`. `NaN` is logged.

Careful: `{ v + 1 }` is a block with an expression statement, NOT an object literal. To return an object, use `({ key: val })`.

---

## Q5: Promise.all Failure

```javascript
let completed = 0;

const p1 = new Promise(resolve => setTimeout(() => { completed++; resolve('p1'); }, 100));
const p2 = Promise.reject('error');
const p3 = new Promise(resolve => setTimeout(() => { completed++; resolve('p3'); }, 200));

Promise.all([p1, p2, p3])
  .catch(e => {
    console.log('caught:', e);
    console.log('completed:', completed);
  });
```

**Output** (at ~0ms):
```
caught: error
completed: 0
```

**Why:** `p2` rejects immediately. `Promise.all` rejects right away. `p1` and `p3` are still running but their results are ignored. `completed` is `0` because neither has resolved yet.

---

## Q6: async forEach Trap

```javascript
async function processAll() {
  const items = [1, 2, 3];
  items.forEach(async item => {
    await delay(item * 100);
    console.log(item);
  });
  console.log('done');
}

await processAll();
```

**Output:**
```
done
1
2
3
```

`done` logs FIRST. `forEach` doesn't await async callbacks. `processAll` finishes (await resolves) before any item logs.

---

## Q7: Microtask Between Each await

```javascript
async function run() {
  console.log('A');
  await 1; console.log('B');
  await 2; console.log('C');
}

run();
Promise.resolve().then(() => console.log('D'));
console.log('E');
```

**Output:** `A E B D C`

**Step by step:**
- `A` (sync inside async fn)
- `await 1` → suspends run, schedules resume as microtask
- Registers D as microtask
- `E` (sync)
- Drain microtasks: resume run → `B`, `await 2` → suspends, schedules resume; `D` → logs D; resume run → `C`

---

## Q8: try/catch Doesn't Catch All

```javascript
async function test() {
  try {
    setTimeout(() => {
      throw new Error('from timer');
    }, 100);
    console.log('no error yet');
  } catch(e) {
    console.log('caught:', e.message); // does this run?
  }
}

await test();
```

**Output:** `no error yet` (then an uncaught error after 100ms)

**Why:** The try/catch catches only synchronous throws and awaited Promise rejections. The setTimeout callback runs later in a different call context — completely outside the try/catch.

---

## Q9: What Does this Return?

```javascript
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sequential() {
  const start = Date.now();
  await delay(100);
  await delay(100);
  await delay(100);
  return Date.now() - start;
}

async function parallel() {
  const start = Date.now();
  await Promise.all([delay(100), delay(100), delay(100)]);
  return Date.now() - start;
}
```

**sequential:** ~300ms (waits for each delay in order)
**parallel:** ~100ms (all three delays run simultaneously)

---

## Q10: Returning a Promise from async

```javascript
async function a() {
  return Promise.resolve(42);
}

async function b() {
  return await Promise.resolve(42);
}

// Are a() and b() the same?
```

**They're nearly the same** — both resolve to `42`. The difference:
- `a()` has 2 microtask ticks to resolve (async wrapping + Promise unwrapping)
- `b()` has 3 microtask ticks (`await` adds an extra tick)

In practice, this matters only in edge cases. For error handling, there IS a real difference:

```javascript
async function a() {
  return Promise.reject(new Error('oops'));
  // If error occurs, a() REJECTS
}

async function b() {
  return await Promise.reject(new Error('oops'));
  // Error is caught inside b's try/catch scope
  // Difference: stack trace shows b() in the trace with await
}
```

---

## Q11: Promise.resolve vs new Promise

```javascript
// Are these equivalent?
const p1 = Promise.resolve(42);
const p2 = new Promise(resolve => resolve(42));
```

**Functionally:** Yes — both resolve to `42` as a microtask.

**Performance:** `Promise.resolve(42)` is slightly faster (avoids creating an executor function).

**Special case:** `Promise.resolve(existingPromise)` returns the SAME promise:
```javascript
const p = new Promise(res => res(1));
const p2 = Promise.resolve(p);
console.log(p === p2); // true! Same object returned
```

---

## Q12: Chaining vs nesting

```javascript
// Nested:
fetch('/user')
  .then(res => {
    return res.json().then(user => {
      return fetch(`/orders/${user.id}`).then(r => r.json());
    });
  })
  .then(orders => console.log(orders));

// Flat (equivalent, better):
fetch('/user')
  .then(res => res.json())
  .then(user => fetch(`/orders/${user.id}`))
  .then(res => res.json())
  .then(orders => console.log(orders));
```

Both work the same. Flat chains are easier to read and maintain.

---

## Q13: Promise.all with Empty Array

```javascript
const result = await Promise.all([]);
console.log(result); // ?
```

**Output:** `[]`

Resolves immediately with an empty array.

---

## Q14: Cancelling a Promise

```javascript
// Standard Promises cannot be cancelled. But with AbortController:
const controller = new AbortController();

const fetchPromise = fetch('/api/data', { signal: controller.signal });

setTimeout(() => controller.abort(), 5000); // cancel after 5s

try {
  const data = await fetchPromise;
} catch (e) {
  if (e.name === 'AbortError') {
    console.log('Fetch was cancelled');
  } else {
    throw e;
  }
}
```

---

## Q15: Async IIFE Pattern

```javascript
// Top-level await in CommonJS — use IIFE:
(async () => {
  const data = await loadData();
  console.log(data);
})().catch(console.error);

// Or named for better stack traces:
async function main() {
  const data = await loadData();
  console.log(data);
}
main().catch(console.error);
```

---

## Q16: What's the Output?

```javascript
async function outer() {
  async function inner() {
    return 1;
  }
  const result = inner(); // forgot await!
  console.log(result);    // ?
  console.log(result + 1); // ?
}
outer();
```

**Output:**
```
Promise { 1 }
[object Promise]1
```

`result` is a Promise, not `1`. `Promise + 1` coerces the Promise to `"[object Promise]"` and concatenates.

---

## Q17: Promise Error Recovery

```javascript
const p = Promise.reject('error')
  .catch(e => 'recovered')
  .then(v => v + '!')
  .catch(e => 'second catch');

p.then(console.log);
```

**Output:** `recovered!`

**Why:**
- `.catch(e => 'recovered')` — catches 'error', returns 'recovered' — chain RESUMES as fulfilled
- `.then(v => v + '!')` — runs with 'recovered' → 'recovered!'
- `.catch(...)` — not reached (chain is fulfilled)
- Result: 'recovered!'

---

## Q18: Parallel Limits

```javascript
// Process 100 items, max 5 at a time:
async function batchProcess(items, fn, concurrency = 5) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// Usage:
const processed = await batchProcess(userIds, id => fetchUser(id), 5);
```

---

## Q19: Unhandled Rejection — When Does It Crash?

```javascript
// Node.js v15+ crashes on unhandled rejection by default
async function fail() {
  throw new Error('oops');
}

// All of these create unhandled rejections:
fail();                          // no .catch(), no await
Promise.reject(new Error('x')); // no .catch()

// Safe patterns:
fail().catch(console.error);                      // option 1
const p = fail(); p.catch(console.error);         // option 2
process.on('unhandledRejection', (err) => {       // last resort
  console.error('unhandled:', err);
  process.exit(1);
});

// This does NOT cause unhandled rejection:
async function handler() {
  try {
    await fail();
  } catch (e) {
    console.error(e); // handled
  }
}
```

---

## Q20: Promise.resolve() on a Thenable

```javascript
const thenable = {
  then(resolve) {
    resolve(42);
  }
};

Promise.resolve(thenable).then(v => console.log(v)); // ?

// Is this a Promise?
console.log(thenable instanceof Promise); // ?
```

**Output:** `42`, `false`

`Promise.resolve()` checks if the argument has a `.then` method. If so, it treats it as a Promise (called a "thenable") and adopts its resolution. This is how third-party promise libraries interoperate with native Promises.

---

## Q21: async/await Error Stack Traces

```javascript
async function level3() {
  throw new Error('deep error');
}

async function level2() {
  await level3();
}

async function level1() {
  await level2();
}

// With await — stack trace includes full chain:
async function main() {
  try {
    await level1();
  } catch(e) {
    console.error(e.stack);
    // Error: deep error
    //   at level3 (...)
    //   at level2 (...)   ← preserved because of await
    //   at level1 (...)
    //   at main (...)
  }
}

// Without await — stack trace LOSES context:
async function mainBad() {
  try {
    return level1(); // no await — returns Promise directly
  } catch(e) {
    // This catch NEVER runs — the rejection is in the returned Promise!
  }
}
```

---

## Q22: Synchronous Throw Inside Promise Constructor

```javascript
const p1 = new Promise((resolve, reject) => {
  throw new Error('sync error in executor');
});

p1.catch(e => console.log('caught:', e.message));
// Output: 'caught: sync error in executor'

// BUT: synchronous throw AFTER resolve() is still caught:
const p2 = new Promise((resolve, reject) => {
  resolve('value');
  throw new Error('after resolve'); // still caught as rejection!
});

p2
  .then(v => console.log('resolved:', v))
  .catch(e => console.log('error:', e.message));
// Output: 'resolved: value'
// Why: once resolved, the promise state is locked. The throw is ignored.
```

Wait — actually the throw after resolve IS caught, but the promise is already resolved. Let me clarify:

```javascript
// After resolve(), subsequent throw is IGNORED:
const p = new Promise((resolve) => {
  resolve('ok');
  throw new Error('too late'); // silently ignored
});
p.then(v => console.log(v)); // 'ok'
```

---

## Q23: Detecting Whether Code Is Inside async Context

```javascript
// You cannot directly detect if you're in an async context.
// But you can use AsyncLocalStorage for context propagation:
const { AsyncLocalStorage } = require('async_hooks');
const storage = new AsyncLocalStorage();

async function handler(requestId) {
  storage.run({ requestId }, async () => {
    await doWork();
  });
}

function doWork() {
  const ctx = storage.getStore(); // available anywhere in the async chain
  console.log('requestId:', ctx?.requestId);
}
```

---

## Q24: Promise Chaining — What Each .then Returns

```javascript
const p = Promise.resolve(1);

const p1 = p.then(v => v + 1);          // returns Promise<2>
const p2 = p.then(v => Promise.resolve(v + 1)); // returns Promise<2>
const p3 = p.then(v => { v + 1 });      // returns Promise<undefined>
const p4 = p.then(v => { return; });    // returns Promise<undefined>
const p5 = p.then(() => { throw new Error('x'); }); // returns rejected Promise

await Promise.allSettled([p1, p2, p3, p4, p5]).then(results =>
  results.forEach(r => console.log(r.status, r.value ?? r.reason?.message))
);
// fulfilled 2
// fulfilled 2
// fulfilled undefined
// fulfilled undefined
// rejected  x
```

---

## Q25: The Deferred Pattern

```javascript
// Sometimes you need to resolve a promise from outside:
function createDeferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const { promise, resolve } = createDeferred();

// Resolve from outside:
setTimeout(() => resolve('done'), 1000);

const result = await promise; // waits for external resolve
console.log(result); // 'done'

// Real use case — waiting for a signal:
const { promise: ready, resolve: markReady } = createDeferred();

server.on('listening', markReady);
await ready; // wait until server is actually listening
```

---

## Q26: Promisifying Callback APIs

```javascript
const fs = require('fs');
const { promisify } = require('util');

// Manual promisify:
function readFile(path, options) {
  return new Promise((resolve, reject) => {
    fs.readFile(path, options, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

// Auto promisify (requires standard Node.js callback convention: (err, result)):
const readFileAsync = promisify(fs.readFile);

// fs.promises — already promisified:
const { readFile: readFileP } = require('fs').promises;

// All three are equivalent:
const data = await readFileP('./file.txt', 'utf8');
```

---

## Q27: What Does await undefined Do?

```javascript
async function test() {
  const a = await undefined;
  const b = await null;
  const c = await 0;
  const d = await false;
  const e = await '';

  console.log(a, b, c, d, e);
}
test();
```

**Output:** `undefined null 0 false ''`

`await` wraps any value in `Promise.resolve()`. Falsy values are still awaited correctly — they resolve to themselves. Each `await` still creates a microtask checkpoint (yields once to the event loop even for non-Promises).

---

## Quick Reference: async/await Execution Order

```javascript
console.log('1');        // sync

async function run() {
  console.log('2');      // sync (inside async fn, before await)
  await null;            // suspends, schedules resume as microtask
  console.log('4');      // resumes after microtask
}

run();
console.log('3');        // sync (after calling run())

// Output: 1 2 3 4
```
