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

## Q28: Promise.all Short-Circuit — Do Other Promises Stop?

```javascript
let sideEffects = [];

const p1 = new Promise(resolve => {
  setTimeout(() => { sideEffects.push('p1'); resolve('p1'); }, 200);
});
const p2 = Promise.reject('fail');
const p3 = new Promise(resolve => {
  setTimeout(() => { sideEffects.push('p3'); resolve('p3'); }, 100);
});

try {
  await Promise.all([p1, p2, p3]);
} catch (e) {
  console.log('error:', e);
}

await new Promise(r => setTimeout(r, 300));
console.log('sideEffects:', sideEffects);
```

**Output:**
```
error: fail
sideEffects: [ 'p3', 'p1' ]
```

**Why:** `Promise.all` rejects immediately when any promise rejects, but it does NOT cancel the other promises. They continue running and their side effects still happen. Promises are not cancellable by default — `Promise.all` just ignores their results.

---

## Q29: Promise.allSettled vs Promise.all

```javascript
const promises = [
  Promise.resolve('ok'),
  Promise.reject('bad'),
  Promise.resolve('also ok'),
];

const allResult = Promise.all(promises).catch(e => `all failed: ${e}`);
const settledResult = Promise.allSettled(promises);

console.log(await allResult);
console.log(await settledResult);
```

**Output:**
```
all failed: bad
[
  { status: 'fulfilled', value: 'ok' },
  { status: 'rejected', reason: 'bad' },
  { status: 'fulfilled', value: 'also ok' }
]
```

**Why:** `Promise.all` short-circuits on the FIRST rejection. `Promise.allSettled` NEVER short-circuits — it waits for every promise to settle and reports all results with `status`, `value`, and `reason` fields. Use `allSettled` when you want results regardless of individual failures.

---

## Q30: Promise.any vs Promise.race

```javascript
const slow = new Promise(resolve => setTimeout(() => resolve('slow'), 200));
const fast = new Promise((_, reject) => setTimeout(() => reject('fast-err'), 50));
const medium = new Promise(resolve => setTimeout(() => resolve('medium'), 100));

// Promise.race: first to SETTLE (resolve or reject)
try {
  console.log('race:', await Promise.race([slow, fast, medium]));
} catch (e) {
  console.log('race rejected:', e);
}

// Promise.any: first to FULFILL (ignores rejections)
try {
  console.log('any:', await Promise.any([slow, fast, medium]));
} catch (e) {
  console.log('any rejected:', e);
}
```

**Output:**
```
race rejected: fast-err
any: medium
```

**Why:** `Promise.race` resolves/rejects with whichever promise settles first — here `fast` rejects at 50ms. `Promise.any` ignores rejections and resolves with the first fulfillment — here `medium` at 100ms. `Promise.any` only rejects with `AggregateError` if ALL promises reject.

---

## Q31: Promise.any — AggregateError

```javascript
try {
  await Promise.any([
    Promise.reject('a'),
    Promise.reject('b'),
    Promise.reject('c'),
  ]);
} catch (e) {
  console.log(e.constructor.name);
  console.log(e.errors);
}
```

**Output:**
```
AggregateError
[ 'a', 'b', 'c' ]
```

**Why:** When ALL promises passed to `Promise.any` reject, it throws an `AggregateError` containing all rejection reasons in the `errors` property. This is the only combinator that uses `AggregateError`.

---

## Q32: Unhandled Rejection Detection Timing

```javascript
const p = Promise.reject(new Error('oops'));

// Attach handler asynchronously — is it too late?
setTimeout(() => {
  p.catch(e => console.log('caught:', e.message));
}, 0);
```

**Answer:** In Node.js, an `unhandledRejection` event fires on the next microtask drain if no handler is attached. The `setTimeout` handler attaches too late — the rejection is already flagged as unhandled. In Node v15+, this causes a crash by default.

```javascript
// Safe: attach handler synchronously (same microtask)
const p2 = Promise.reject(new Error('ok'));
p2.catch(e => console.log('caught:', e.message)); // fine — same tick
```

---

## Q33: Promise Constructor Executor — Synchronous Proof

```javascript
let executorRan = false;

const p = new Promise(resolve => {
  executorRan = true;
  resolve();
});

console.log('executorRan:', executorRan); // ?
```

**Output:** `executorRan: true`

**Why:** The executor function is called **synchronously** inside the `new Promise()` constructor, before the constructor returns. This is a key difference from `.then()` callbacks which always run as microtasks.

---

## Q34: Thenable Duck Typing — Surprising Behavior

```javascript
const sneakyObj = {
  then(onFulfill, onReject) {
    console.log('then called');
    onFulfill(99);
  }
};

async function test() {
  const val = await sneakyObj;
  console.log('val:', val);
}

test();
```

**Output:**
```
then called
val: 99
```

**Why:** `await` (and `Promise.resolve`) check if the value has a `.then` method. If it does, the value is treated as a thenable — its `then` method is called with resolve/reject handlers. This is duck typing: any object with a `.then()` becomes promise-like, even accidentally.

---

## Q35: Accidental Thenable

```javascript
const config = {
  then: 'some-string-value',
  host: 'localhost',
};

async function loadConfig() {
  return config;
}

try {
  const result = await loadConfig();
  console.log(result);
} catch (e) {
  console.log('error:', e.message);
}
```

**Output:** `error: config.then is not a function`

**Why:** `await` sees that `config` has a `then` property. It tries to call it as a function. Since `then` is a string, calling it throws a TypeError. Any object with a `then` property is treated as a thenable — even if `then` is not a function. Avoid naming properties `then` on objects that might be awaited.

---

## Q36: async Function Always Returns a Promise — Even with throw

```javascript
async function a() { return 1; }
async function b() { throw new Error('x'); }
async function c() { /* empty */ }

console.log(a() instanceof Promise);
console.log(b().catch(() => {}) instanceof Promise);
console.log(c() instanceof Promise);
console.log((async () => 42)() instanceof Promise);
```

**Output:**
```
true
true
true
true
```

**Why:** Every `async` function returns a Promise, always. Return value → fulfilled promise. Throw → rejected promise. No return → `Promise<undefined>`. There is no way to make an async function return a non-Promise.

---

## Q37: await in for...of Loop — Sequential

```javascript
function delay(ms, val) {
  return new Promise(r => setTimeout(() => r(val), ms));
}

async function sequential() {
  const items = [300, 200, 100];
  const start = Date.now();

  for (const ms of items) {
    const val = await delay(ms, ms);
    console.log(val);
  }

  console.log(`Total: ~${Date.now() - start}ms`);
}

await sequential();
```

**Output:**
```
300
200
100
Total: ~600ms
```

**Why:** `await` inside a `for...of` loop is sequential — each iteration waits for the previous one. Total time = 300 + 200 + 100 = ~600ms. To run in parallel, start all promises first, then await:

```javascript
async function parallel() {
  const items = [300, 200, 100];
  const start = Date.now();
  const promises = items.map(ms => delay(ms, ms));
  const results = await Promise.all(promises);
  console.log(results); // [300, 200, 100]
  console.log(`Total: ~${Date.now() - start}ms`); // ~300ms
}
```

---

## Q38: for await...of — Gotcha with Regular Arrays

```javascript
async function test() {
  const arr = [
    Promise.resolve(1),
    Promise.resolve(2),
    Promise.reject(3),
    Promise.resolve(4),
  ];

  try {
    for await (const val of arr) {
      console.log(val);
    }
  } catch (e) {
    console.log('caught:', e);
  }
  console.log('done');
}

await test();
```

**Output:**
```
1
2
caught: 3
done
```

**Why:** `for await...of` works on arrays of promises. It awaits each promise sequentially. When it hits the rejected promise, it throws into the loop body — you can catch it with try/catch. But promise #4 is never consumed. Unlike `Promise.allSettled`, `for await...of` stops on first rejection (unless you catch and continue).

---

## Q39: for await...of — Not Parallel

```javascript
async function* generateSlowly() {
  yield await new Promise(r => setTimeout(() => r('a'), 200));
  yield await new Promise(r => setTimeout(() => r('b'), 200));
  yield await new Promise(r => setTimeout(() => r('c'), 200));
}

const start = Date.now();
for await (const val of generateSlowly()) {
  console.log(val, `+${Date.now() - start}ms`);
}
```

**Output:**
```
a +~200ms
b +~400ms
c +~600ms
```

**Why:** `for await...of` is inherently sequential. Each iteration waits for the previous async generator yield. Total time is ~600ms, not ~200ms. There is no built-in parallel version — you'd need to buffer into an array and use `Promise.all`.

---

## Q40: Promise.resolve with a Thenable Chain

```javascript
const thenable = {
  then(resolve) {
    console.log('outer then');
    resolve({
      then(resolve) {
        console.log('inner then');
        resolve(42);
      }
    });
  }
};

const val = await Promise.resolve(thenable);
console.log('value:', val);
```

**Output:**
```
outer then
inner then
value: 42
```

**Why:** `Promise.resolve` recursively unwraps thenables. The outer thenable resolves with another thenable, so Promise.resolve calls its `.then()` too. This continues until a non-thenable value is found. This recursive unwrapping is part of the spec and prevents nested Promises like `Promise<Promise<42>>`.

---

## Q41: Microtask Ordering — Multiple Promise Chains

```javascript
Promise.resolve().then(() => console.log('A1')).then(() => console.log('A2'));
Promise.resolve().then(() => console.log('B1')).then(() => console.log('B2'));
```

**Output:**
```
A1
B1
A2
B2
```

**Why:** Microtasks are interleaved between chains:
1. Two microtasks are queued: A1-handler, B1-handler
2. A1-handler runs → logs `A1`, queues A2-handler
3. B1-handler runs → logs `B1`, queues B2-handler
4. A2-handler runs → logs `A2`
5. B2-handler runs → logs `B2`

Each `.then()` queues a new microtask — they don't run the full chain in one go.

---

## Q42: Microtask Ordering — Three Chains

```javascript
const p = Promise.resolve();

p.then(() => {
  console.log('1');
  Promise.resolve().then(() => console.log('1a'));
}).then(() => console.log('1b'));

p.then(() => console.log('2'));
p.then(() => console.log('3'));
```

**Output:**
```
1
2
3
1a
1b
```

**Why:** All three `.then()` on `p` are queued immediately (1-handler, 2-handler, 3-handler). During drain:
- `1` logs, queues `1a`
- `2` logs
- `3` logs
- `1a` logs (queued during 1-handler), queues `1b`
- `1b` logs

Microtask queue is FIFO — newly queued tasks go to the end.

---

## Q43: Error Swallowing — The Silent Killer

```javascript
async function fetchData() {
  throw new Error('network failure');
}

// Bug: no catch, no await in a fire-and-forget call
function handleRequest() {
  fetchData(); // promise rejection is silently swallowed!
  console.log('request handled');
}

handleRequest();
```

**Output:**
```
request handled
```
(Plus UnhandledPromiseRejection warning/crash in Node v15+)

**Why:** Calling an async function without `await` or `.catch()` means the rejected promise has no handler. The error is "swallowed" from the caller's perspective. Always handle async errors:

```javascript
// Fix 1: await it
async function handleRequest() {
  await fetchData();
}

// Fix 2: catch it
function handleRequest() {
  fetchData().catch(console.error);
}
```

---

## Q44: .then() Without .catch() — Error Swallowed?

```javascript
Promise.resolve(1)
  .then(v => { throw new Error('oops'); })
  .then(v => console.log('never'));
// No .catch() — what happens?
```

**Answer:** The error creates a rejected promise that is never handled. In Node v15+, this triggers `unhandledRejection` and crashes the process. In browsers, you get a console warning. The second `.then` is skipped because the chain is in rejected state.

**Fix:** Always terminate chains with `.catch()`:
```javascript
Promise.resolve(1)
  .then(v => { throw new Error('oops'); })
  .then(v => console.log('never'))
  .catch(e => console.error('handled:', e.message));
```

---

## Q45: Async Generator Basics

```javascript
async function* counter(limit) {
  for (let i = 1; i <= limit; i++) {
    await new Promise(r => setTimeout(r, 100));
    yield i;
  }
}

const gen = counter(3);

console.log(await gen.next()); // ?
console.log(await gen.next()); // ?
console.log(await gen.next()); // ?
console.log(await gen.next()); // ?
```

**Output:**
```
{ value: 1, done: false }
{ value: 2, done: false }
{ value: 3, done: false }
{ value: undefined, done: true }
```

**Why:** Async generators combine `async` and `function*`. Each `yield` pauses the generator, and `gen.next()` returns a Promise that resolves when the next value is yielded. After the loop ends, `done: true` with `value: undefined`.

---

## Q46: Async Generator — Early Return

```javascript
async function* infiniteStream() {
  let i = 0;
  try {
    while (true) {
      yield i++;
    }
  } finally {
    console.log('cleanup!');
  }
}

const gen = infiniteStream();
console.log((await gen.next()).value); // 0
console.log((await gen.next()).value); // 1
console.log(await gen.return('stop'));
```

**Output:**
```
0
1
cleanup!
{ value: 'stop', done: true }
```

**Why:** Calling `gen.return()` forces the generator to exit. The `finally` block runs for cleanup. The returned value becomes the `value` in the result. This is how you gracefully stop an infinite async generator.

---

## Q47: AbortController with Custom Promises

```javascript
function cancellableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve('done'), ms);

    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

const controller = new AbortController();
setTimeout(() => controller.abort(), 50);

try {
  const result = await cancellableDelay(1000, controller.signal);
  console.log(result);
} catch (e) {
  console.log(e.name, e.message); // ?
}
```

**Output:** `AbortError Aborted`

**Why:** The AbortController signals cancellation at 50ms. The abort listener clears the timer and rejects the promise. This is the standard pattern for making any promise cancellable. Always use `AbortError` (via `DOMException` or `e.name === 'AbortError'`) so callers can distinguish cancellation from real errors.

---

## Q48: AbortSignal.timeout — Built-in Timeout

```javascript
// Node 18+
try {
  await fetch('https://slow-api.example.com', {
    signal: AbortSignal.timeout(3000),
  });
} catch (e) {
  console.log(e.name); // 'TimeoutError'
}

// Composing signals (Node 20+):
const controller = new AbortController();
const timeoutSignal = AbortSignal.timeout(5000);

const combined = AbortSignal.any([controller.signal, timeoutSignal]);
// Aborts if either the controller fires or 5s passes
```

**Why:** `AbortSignal.timeout()` creates a signal that auto-aborts after the given ms. `AbortSignal.any()` (Node 20+) combines multiple signals — useful for "user cancel OR timeout" patterns.

---

## Q49: Promise.withResolvers()

```javascript
// ES2024 (Node 22+)
const { promise, resolve, reject } = Promise.withResolvers();

setTimeout(() => resolve('hello'), 100);

const result = await promise;
console.log(result); // ?
```

**Output:** `hello`

**Why:** `Promise.withResolvers()` is the standardized version of the "deferred" pattern (see Q25). It returns `{ promise, resolve, reject }` in one call. No more extracting resolve/reject from the constructor:

```javascript
// Old way (Q25):
let resolve, reject;
const promise = new Promise((res, rej) => { resolve = res; reject = rej; });

// New way:
const { promise, resolve, reject } = Promise.withResolvers();
```

---

## Q50: Double Resolve — Second Call Is Ignored

```javascript
const p = new Promise((resolve, reject) => {
  resolve('first');
  resolve('second');    // ignored
  reject('error');      // also ignored
  console.log('executor continues');
});

p.then(v => console.log('value:', v));
```

**Output:**
```
executor continues
value: first
```

**Why:** A promise can only be settled ONCE. The first `resolve('first')` locks the state to fulfilled. Subsequent `resolve()` and `reject()` calls are silently ignored — no errors thrown. But the executor function keeps running (it's not `return`'d).

**Common bug:**
```javascript
// Forgetting return after resolve:
new Promise((resolve, reject) => {
  if (err) reject(err);    // should be: return reject(err);
  resolve(data);            // runs even when err is truthy!
});
```

---

## Q51: Promise in finally — Delays the Chain

```javascript
const result = await Promise.resolve('value')
  .finally(() => {
    console.log('finally');
    return new Promise(r => setTimeout(r, 200));
  })
  .then(v => {
    console.log('then:', v);
    return v;
  });

console.log('result:', result);
```

**Output:**
```
finally
then: value      (after ~200ms delay)
result: value
```

**Why:** `finally` normally passes through the resolved value (unlike `.then`, `finally`'s return value is ignored). BUT if `finally` returns a promise, the chain WAITS for it before continuing. The resolved value still passes through — the delay promise's resolved value is discarded.

---

## Q52: finally Can Override Rejection

```javascript
const result = await Promise.reject('error')
  .finally(() => {
    return Promise.reject('finally-error');
  })
  .catch(e => {
    console.log('caught:', e);
    return 'recovered';
  });

console.log('result:', result);
```

**Output:**
```
caught: finally-error
result: recovered
```

**Why:** If `finally` throws or returns a rejected promise, it OVERRIDES the original rejection. The original `'error'` is lost — `'finally-error'` becomes the new rejection reason. Be careful with async operations in `finally` — they can mask the original error.

---

## Q53: Nested async/await Error Propagation

```javascript
async function inner() {
  throw new Error('inner error');
}

async function middle() {
  try {
    await inner();
  } catch (e) {
    console.log('middle caught:', e.message);
    throw new Error('middle error');
  }
}

async function outer() {
  try {
    await middle();
  } catch (e) {
    console.log('outer caught:', e.message);
  }
}

await outer();
```

**Output:**
```
middle caught: inner error
outer caught: middle error
```

**Why:** Errors propagate up the async call stack just like synchronous try/catch. `middle` catches the inner error but throws a new one. `outer` catches middle's error. The original "inner error" is lost unless you chain it:

```javascript
// Better: preserve the cause
throw new Error('middle error', { cause: e });
// Access with: error.cause.message → 'inner error'
```

---

## Q54: Nested async Error — Missing await

```javascript
async function inner() {
  throw new Error('boom');
}

async function outer() {
  try {
    inner(); // forgot await!
    console.log('no error?');
  } catch (e) {
    console.log('caught:', e.message);
  }
}

await outer();
```

**Output:**
```
no error?
```
(Plus UnhandledPromiseRejection in Node v15+)

**Why:** Without `await`, the rejected promise from `inner()` is completely disconnected from the try/catch. The try block sees no error because `inner()` returns a rejected Promise — it doesn't throw synchronously. The catch never fires. This is one of the most common async bugs.

**Rule:** If you call an async function inside try/catch, you MUST `await` it for errors to be caught.

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
