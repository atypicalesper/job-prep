# Promise.all, race, any, allSettled

## Promise.all — All Must Succeed

Waits for ALL promises. **Fails fast** on first rejection.

```javascript
const p1 = fetch('/api/users');
const p2 = fetch('/api/products');
const p3 = fetch('/api/orders');

const [users, products, orders] = await Promise.all([p1, p2, p3]);
// All three requests run in parallel
// Resolves when ALL succeed, with array of results in input order
// Rejects immediately when ANY fails
```

### Fail-Fast Behavior

```javascript
const slow  = new Promise(resolve => setTimeout(() => resolve('slow'), 3000));
const fast  = Promise.resolve('fast');
const fails = Promise.reject(new Error('oops'));

Promise.all([slow, fast, fails])
  .then(results => console.log(results))
  .catch(err => console.log('Error:', err.message));
// Output: 'Error: oops' (immediately — doesn't wait for 'slow')
// 'slow' is STILL RUNNING but its result is ignored
```

### Results Maintain Input Order

```javascript
const p1 = new Promise(resolve => setTimeout(() => resolve('first'), 300));
const p2 = new Promise(resolve => setTimeout(() => resolve('second'), 100));
const p3 = new Promise(resolve => setTimeout(() => resolve('third'), 200));

const results = await Promise.all([p1, p2, p3]);
console.log(results); // ['first', 'second', 'third'] — INPUT order, not resolution order
```

### Use Cases

```javascript
// 1. Parallel independent API calls
async function loadDashboard(userId) {
  const [user, stats, notifications] = await Promise.all([
    getUser(userId),
    getStats(userId),
    getNotifications(userId)
  ]);
  return { user, stats, notifications };
}

// 2. Parallel file processing
const files = ['a.txt', 'b.txt', 'c.txt'];
const contents = await Promise.all(files.map(f => fs.promises.readFile(f, 'utf8')));

// 3. Parallel DB queries
const [adminUsers, regularUsers] = await Promise.all([
  db.users.findAll({ where: { role: 'admin' } }),
  db.users.findAll({ where: { role: 'user' } })
]);
```

---

## Promise.allSettled — Wait for All, Never Fails

Waits for ALL promises to settle. Never rejects. Returns array of result objects.

```javascript
const results = await Promise.allSettled([
  Promise.resolve('success'),
  Promise.reject(new Error('failed')),
  Promise.resolve('also success'),
]);

results.forEach(result => {
  if (result.status === 'fulfilled') {
    console.log('Value:', result.value);
  } else {
    console.log('Reason:', result.reason.message);
  }
});
// Value: success
// Reason: failed
// Value: also success
```

### Result Object Shape

```javascript
// Fulfilled:
{ status: 'fulfilled', value: 'the-value' }

// Rejected:
{ status: 'rejected', reason: Error('the-error') }
```

### Use Cases

```javascript
// When you want ALL results, handling individual failures:

// Sending notifications to multiple users — don't fail if one fails
const userIds = [1, 2, 3, 4, 5];
const results = await Promise.allSettled(
  userIds.map(id => sendNotification(id))
);

const failed = results.filter(r => r.status === 'rejected');
const succeeded = results.filter(r => r.status === 'fulfilled');

console.log(`Sent: ${succeeded.length}, Failed: ${failed.length}`);

// Batch API calls where partial success is acceptable
async function fetchAll(urls) {
  const results = await Promise.allSettled(urls.map(url => fetch(url)));
  return results.map((result, i) => ({
    url: urls[i],
    data: result.status === 'fulfilled' ? result.value : null,
    error: result.status === 'rejected' ? result.reason : null
  }));
}
```

---

## Promise.race — First to Settle (Either Way)

Resolves or rejects with the **first** promise that settles (fulfilled OR rejected).

```javascript
const fast  = new Promise(resolve => setTimeout(() => resolve('fast'), 100));
const slow  = new Promise(resolve => setTimeout(() => resolve('slow'), 500));
const fails = new Promise((_, reject) => setTimeout(() => reject('error'), 200));

// Race between fast and slow (fast wins)
await Promise.race([fast, slow]); // 'fast' (resolves after 100ms)

// Race between fast and fails (fast wins — 100ms < 200ms)
await Promise.race([fast, fails]); // 'fast'

// Race between slow and fails (fails wins — 200ms < 500ms)
await Promise.race([slow, fails]); // throws 'error'
```

### Timeout Pattern

```javascript
function withTimeout(promise, ms, message = 'Operation timed out') {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(message)), ms)
  );
  return Promise.race([promise, timeout]);
}

// Usage:
const data = await withTimeout(fetch('/api/slow'), 5000, 'Request timed out');
```

### Use Cases

```javascript
// 1. Timeout any async operation
const result = await Promise.race([
  heavyOperation(),
  new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
]);

// 2. First successful cache/network response
const data = await Promise.race([
  cache.get(key),      // might be fast
  network.fetch(key)   // fallback if cache is slow
]);
```

---

## Promise.any — First to Succeed (Ignores Rejections)

Resolves with the **first fulfilled** promise. Only rejects if ALL promises reject.

```javascript
const results = await Promise.any([
  Promise.reject(new Error('fail 1')),
  new Promise(resolve => setTimeout(() => resolve('success'), 200)),
  Promise.reject(new Error('fail 2')),
]);
console.log(results); // 'success' — ignores the rejections

// All fail:
await Promise.any([
  Promise.reject('fail 1'),
  Promise.reject('fail 2'),
]).catch(e => {
  console.log(e instanceof AggregateError); // true
  console.log(e.errors); // ['fail 1', 'fail 2']
});
```

### AggregateError

When `Promise.any` rejects, it throws an `AggregateError` containing all rejection reasons:

```javascript
try {
  await Promise.any([
    Promise.reject(new Error('DB failed')),
    Promise.reject(new Error('Cache failed')),
    Promise.reject(new Error('API failed'))
  ]);
} catch (e) {
  if (e instanceof AggregateError) {
    e.errors.forEach(err => console.error(err.message));
    // DB failed
    // Cache failed
    // API failed
  }
}
```

### Use Cases

```javascript
// 1. Try multiple data sources, use first that succeeds
const data = await Promise.any([
  fetch('/api/primary').then(r => r.json()),
  fetch('/api/backup').then(r => r.json()),
  fetch('/api/fallback').then(r => r.json())
]);

// 2. First available resource from multiple mirrors
const content = await Promise.any(
  mirrors.map(url => fetch(url))
);
```

---

## Comparison Table

| Method | Resolves when | Rejects when | Result |
|--------|-------------|-------------|--------|
| `Promise.all` | ALL fulfill | ANY rejects | Array of values |
| `Promise.allSettled` | ALL settle | Never | Array of `{status, value/reason}` |
| `Promise.race` | FIRST settles | FIRST settles (if rejection) | Single value/error |
| `Promise.any` | FIRST fulfills | ALL reject | Single value / AggregateError |

---

## Implementing Them from Scratch

### Implement Promise.all

```javascript
function promiseAll(promises) {
  return new Promise((resolve, reject) => {
    if (promises.length === 0) return resolve([]);

    const results = new Array(promises.length);
    let remaining = promises.length;

    promises.forEach((p, i) => {
      Promise.resolve(p).then(val => {
        results[i] = val;
        if (--remaining === 0) resolve(results);
      }).catch(reject); // first rejection short-circuits
    });
  });
}
```

### Implement Promise.allSettled

```javascript
function promiseAllSettled(promises) {
  return Promise.all(promises.map(p =>
    Promise.resolve(p)
      .then(value  => ({ status: 'fulfilled', value }))
      .catch(reason => ({ status: 'rejected',  reason }))
  ));
}
```

### Implement Promise.race

```javascript
function promiseRace(promises) {
  return new Promise((resolve, reject) => {
    promises.forEach(p => Promise.resolve(p).then(resolve, reject));
  });
}
```

---

## Interview Questions

**Q: What is the difference between Promise.all and Promise.allSettled?**
A: `Promise.all` fails fast — rejects immediately when any promise rejects. `Promise.allSettled` always waits for all promises and never rejects — returns an array of result objects with `status: 'fulfilled'` or `status: 'rejected'`. Use `allSettled` when partial failure is acceptable.

**Q: When would you use Promise.any over Promise.race?**
A: Use `Promise.any` when you want the first SUCCESS and can ignore failures (e.g., trying multiple data sources). Use `Promise.race` when you want the first SETTLEMENT — fulfilled OR rejected (e.g., timeout patterns).

**Q: Implement Promise.all from scratch.**
A: (See implementation above.) Key points: track remaining count, store results at original index, reject immediately on first rejection.

**Q: Does Promise.race cancel the other promises?**
A: No — `Promise.race` doesn't cancel anything. The other promises continue running; their results are just ignored after the first settles. True cancellation requires AbortController.
