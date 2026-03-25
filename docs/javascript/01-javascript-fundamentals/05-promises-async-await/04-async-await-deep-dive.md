# async/await — Deep Dive

## What is async/await?

`async/await` is syntactic sugar over Promises. It makes asynchronous code look and behave like synchronous code, while still being non-blocking.

```javascript
// Promise-based:
function fetchUser(id) {
  return fetch(`/api/users/${id}`)
    .then(res => res.json())
    .then(user => {
      return fetch(`/api/orders/${user.orderId}`)
        .then(res => res.json());
    });
}

// async/await equivalent:
async function fetchUser(id) {
  const res  = await fetch(`/api/users/${id}`);
  const user = await res.json();
  const orderRes = await fetch(`/api/orders/${user.orderId}`);
  return orderRes.json();
}
```

---

## async Functions Always Return a Promise

An `async` function is fundamentally a factory for Promises. No matter what it returns, the caller always receives a Promise. If the function returns a non-Promise value, it is wrapped in `Promise.resolve()`. If the function throws, the returned Promise is rejected. If it returns a Promise, that Promise is *adopted* (not double-wrapped) — so the caller gets the inner Promise's state directly. This guarantee means all async functions are composable: you can always use `.then()`, `await`, or `Promise.all` on their return values.

```javascript
async function getValue() {
  return 42; // automatically wrapped in Promise.resolve(42)
}

const p = getValue();
console.log(p);          // Promise { 42 }
console.log(p === 42);   // false
const val = await p;     // 42

// Returning a Promise inside async — NOT double-wrapped:
async function getPromise() {
  return Promise.resolve(99);
}
await getPromise(); // 99 (not Promise<Promise<99>>)
```

---

## await — Pause and Resume

`await` is the mechanism that makes async functions appear synchronous. When the engine encounters `await expr`, it evaluates the expression, wraps it in `Promise.resolve()`, and suspends the async function — returning control to the caller. The suspended function is scheduled to resume as a microtask once the awaited Promise settles. This suspension is non-blocking: the event loop is free to process other callbacks while the function waits.

`await` pauses execution of the `async` function until the Promise resolves, then resumes with the resolved value:

```javascript
async function example() {
  console.log('1 — before await');
  const result = await delay(1000); // pauses here
  console.log('3 — after await:', result);
  return result;
}

console.log('0 — before calling async fn');
example();
console.log('2 — after calling async fn (sync continues!)');

// Output:
// 0 — before calling async fn
// 1 — before await
// 2 — after calling async fn (sync continues!)
// 3 — after await: (after 1s)
```

Under the hood, each `await` is equivalent to `.then()`:
```javascript
// async function:
async function f() {
  const x = await p1;
  const y = await p2;
  return x + y;
}

// Roughly equivalent generator-based:
function f() {
  return p1.then(x => p2.then(y => x + y));
}
```

---

## await on Non-Promises

Because `await` internally calls `Promise.resolve()` on any value, it can be applied to non-Promises without error. For primitives, this creates a microtask checkpoint — a brief suspension — but then immediately resumes with the original value. This property is useful for ensuring a consistent execution model and for testing async behavior without actual I/O, but it should not be used gratuitously as each `await` introduces a scheduling overhead.

`await` calls `Promise.resolve()` on the value. So you can `await` anything:

```javascript
async function test() {
  const a = await 42;           // 42 (await Promise.resolve(42))
  const b = await null;         // null
  const c = await 'string';    // 'string'
  const d = await { then: (res) => res('thenable') }; // 'thenable'
  return [a, b, c, d];
}
```

---

## Sequential vs Parallel Execution

The most important performance consideration with `async/await` is understanding the difference between sequential and parallel execution. Each `await` on a separate async operation is a pause — if you await them one after another, each operation waits for the previous one to finish before it starts. To run independent operations concurrently, you must *start* all the Promises first (before awaiting any of them) or use `Promise.all`. This is one of the most common performance bugs in async JavaScript.

This is the most critical pattern to understand:

```javascript
// ❌ SEQUENTIAL — waits for each one before starting next
async function sequential() {
  const user    = await getUser(1);    // 500ms
  const orders  = await getOrders(1); // 300ms
  const ratings = await getRatings(1); // 200ms
  return { user, orders, ratings };
  // Total: ~1000ms
}

// ✅ PARALLEL — all run concurrently
async function parallel() {
  const [user, orders, ratings] = await Promise.all([
    getUser(1),    // 500ms
    getOrders(1),  // 300ms
    getRatings(1)  // 200ms
  ]);
  return { user, orders, ratings };
  // Total: ~500ms (slowest wins)
}

// ✅ Start all, then await:
async function parallel2() {
  const p1 = getUser(1);    // START immediately
  const p2 = getOrders(1);  // START immediately
  const p3 = getRatings(1); // START immediately

  const user    = await p1; // Wait for results
  const orders  = await p2;
  const ratings = await p3;
  return { user, orders, ratings };
  // Also parallel — total ~500ms
}
```

---

## Error Handling with async/await

```javascript
// Using try/catch:
async function safeGet(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('Fetch failed:', err.message);
    return null; // or rethrow, or return default
  }
}

// Using .catch() on the async function:
const data = await safeGet('/api').catch(err => null);

// Helper for cleaner error handling (Go-style):
async function to(promise) {
  try {
    return [null, await promise];
  } catch(err) {
    return [err, null];
  }
}

const [err, user] = await to(getUser(1));
if (err) {
  console.error(err);
} else {
  console.log(user);
}
```

---

## async in Loops

Async operations in loops require careful pattern selection because the three common loop constructs — `forEach`, `for...of`, and `map` — behave very differently with `async`. Getting this wrong means either running everything in uncontrolled parallel (with `forEach`), running everything sequentially when parallelism would be faster (with sequential `for...of`), or missing the ability to await all results together. Matching the right pattern to your concurrency requirements is a critical async skill.

```javascript
const ids = [1, 2, 3, 4, 5];

// ❌ forEach doesn't await — all fire at once, completion untracked
ids.forEach(async id => {
  await processItem(id); // these run in parallel, uncontrolled
});
// The loop returns before any item is processed!

// ✅ Sequential — for...of
for (const id of ids) {
  await processItem(id); // one at a time, in order
}

// ✅ Parallel — map + Promise.all
await Promise.all(ids.map(id => processItem(id)));

// ✅ Controlled parallel (max N at a time):
async function processWithLimit(items, limit) {
  const chunks = [];
  for (let i = 0; i < items.length; i += limit) {
    chunks.push(items.slice(i, i + limit));
  }
  const results = [];
  for (const chunk of chunks) {
    const chunkResults = await Promise.all(chunk.map(processItem));
    results.push(...chunkResults);
  }
  return results;
}

await processWithLimit(ids, 2); // max 2 at a time
```

---

## Top-Level await (ESM Only)

Top-level `await` allows `await` expressions at the root of an ES module, outside of any `async` function. This is only available in ESM (`.mjs` files or `"type": "module"` in `package.json`). When a module uses top-level `await`, other modules that import it are paused until its top-level async work completes — the module graph handles this automatically. It is useful for async initialization (loading config, establishing connections) that must complete before a module's exports are used.

```javascript
// In ESM (.mjs or "type": "module"):
const config = await loadConfig(); // at module top level!
console.log('Config loaded:', config);

// In CommonJS — must wrap in async function:
async function main() {
  const config = await loadConfig();
}
main().catch(console.error);
```

---

## async/await Under the Hood

`async/await` is syntactic sugar that the engine (or a transpiler like Babel) desugars into generator functions coordinated with Promises. Each `await` corresponds to a `yield` in a generator — the generator function suspends itself and hands control to a runner that resolves the yielded Promise and then resumes the generator with the result. Understanding this desugaring explains why `await` in a regular function is a SyntaxError (generators have the same restriction) and why errors in async functions reject the returned Promise (generator `.throw()` is used for this).

`async/await` is transpiled to generator functions + Promise chains:

```javascript
// Original:
async function fetchData() {
  const result = await fetch('/api');
  return result.json();
}

// Conceptual transpilation (simplified):
function fetchData() {
  return new Promise((resolve, reject) => {
    const generator = (function* () {
      try {
        const result = yield fetch('/api');
        resolve(result.json());
      } catch(e) {
        reject(e);
      }
    })();

    function step(value) {
      const { value: yielded, done } = generator.next(value);
      if (!done) {
        Promise.resolve(yielded).then(step, (err) => generator.throw(err));
      }
    }
    step();
  });
}
```

---

## Common async/await Mistakes

These mistakes are all variants of the same underlying misunderstanding: forgetting that `async` functions return Promises and that `await` is required to unwrap them. A missing `await` leaves you with a Promise where you expected a value; a misplaced `await` (in a non-async function) is a syntax error; and a try/catch around async code only catches errors from `await`ed operations, not from callbacks inside the async function.

```javascript
// ❌ Missing await — function returns Promise, not value
async function getData() {
  const data = fetch('/api').then(r => r.json()); // forgot await!
  return data; // returns a Promise, not the data
}
const result = await getData(); // result is a Promise!

// ❌ await in non-async function
function bad() {
  const data = await fetch('/api'); // SyntaxError!
}

// ❌ Unhandled rejection in async function
async function risky() {
  throw new Error('boom');
}
risky(); // Promise rejection — unhandled! Add .catch() or await

// ❌ Try/catch only catches awaited operations
async function broken() {
  try {
    setTimeout(() => { throw new Error('timer error'); }, 100);
  } catch(e) {
    // Never reaches here! The setTimeout callback runs outside try/catch
  }
}
```

---

## Interview Questions

**Q: What does `async` before a function do?**
A: It makes the function always return a Promise. If the function returns a non-Promise value, it's wrapped in `Promise.resolve()`. If it throws, the returned Promise is rejected. It also enables `await` inside the function body.

**Q: What does `await` do?**
A: It pauses execution of the async function, waiting for the Promise to settle, then resumes with the resolved value. It calls `Promise.resolve()` on the value first, so non-Promises are handled gracefully. Code after `await` runs as a microtask.

**Q: How do you run multiple async operations in parallel?**
A: Use `Promise.all([...])` with `await`. Starting individual promises and then awaiting them sequentially also runs them in parallel. The key mistake is using `await` before starting each operation (sequential).

**Q: What happens if you use await inside forEach?**
A: `forEach` ignores the returned Promise from each async callback. The loop completes synchronously and the `forEach` call returns before any async work finishes. Use `for...of` for sequential or `Promise.all(array.map(...))` for parallel.
