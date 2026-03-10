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
