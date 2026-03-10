# Promises — Internals and Deep Dive

## What is a Promise?

A Promise is an object representing the **eventual completion or failure** of an async operation. It's a proxy for a value that may not be available yet.

```
Promise States:
                ┌──────────────┐
         ┌────→ │  FULFILLED   │ (value available)
         │      └──────────────┘
┌─────────┐
│ PENDING │                        (irreversible once settled!)
└─────────┘
         │      ┌──────────────┐
         └────→ │   REJECTED   │ (reason/error available)
                └──────────────┘
```

- A Promise starts **pending**
- It settles to either **fulfilled** (with a value) or **rejected** (with a reason)
- Once settled, it **never changes state**

---

## Creating Promises

```javascript
// Constructor takes an executor function (runs synchronously!)
const p = new Promise((resolve, reject) => {
  // resolve(value) → fulfills the promise
  // reject(reason) → rejects the promise
  // Only the first call matters — subsequent calls are ignored

  console.log('executor runs synchronously');
  setTimeout(() => resolve('done'), 1000);
});

console.log('this logs before the promise resolves');
p.then(val => console.log(val)); // logs 'done' after 1s
```

### Already-settled Promises

```javascript
// Immediately fulfilled:
const fulfilled = Promise.resolve('immediate value');
fulfilled.then(v => console.log(v)); // 'immediate value' (next microtask)

// Immediately rejected:
const rejected = Promise.reject(new Error('immediate error'));
rejected.catch(e => console.error(e.message)); // 'immediate error'

// From a thenable:
Promise.resolve({ then: (resolve) => resolve(42) }); // resolves to 42
```

---

## The `.then()` Chain

`.then(onFulfilled, onRejected)` returns a **new Promise**:

```javascript
Promise.resolve(1)
  .then(x => x + 1)          // returns 2
  .then(x => x * 3)          // returns 6
  .then(x => {
    console.log(x);          // 6
    return x + 4;
  })
  .then(x => console.log(x)); // 10
```

### Return Values from .then()

What you return from `.then()` determines the next promise:

```javascript
// Return primitive → next promise fulfills with that value
.then(() => 42)              // next gets 42

// Return nothing (undefined) → next promise fulfills with undefined
.then(() => {})              // next gets undefined

// Return a promise → next waits for that promise
.then(() => fetch('/api'))   // next gets the fetch result

// Throw an error → next promise rejects
.then(() => { throw new Error('oops'); })  // next rejects

// Return a rejected promise → next rejects
.then(() => Promise.reject('fail'))         // next rejects
```

---

## Error Propagation

Errors skip fulfilled handlers and go to the next rejection handler:

```javascript
Promise.resolve('start')
  .then(v => { throw new Error('step 1 failed'); })
  .then(v => console.log('step 2'))   // SKIPPED
  .then(v => console.log('step 3'))   // SKIPPED
  .catch(e => {
    console.log('caught:', e.message); // 'step 1 failed'
    return 'recovered';
  })
  .then(v => console.log('step 4:', v)) // 'step 4: recovered' ← resumes!
  .catch(e => console.log('step 5 error')) // not reached
```

---

## .catch() and .finally()

```javascript
// .catch(fn) is shorthand for .then(undefined, fn)
promise.catch(err => handleError(err));
// equivalent to:
promise.then(undefined, err => handleError(err));

// .finally(fn) — runs regardless of outcome
fetch('/api')
  .then(res => res.json())
  .catch(err => handleError(err))
  .finally(() => {
    hideLoader(); // always runs — cleanup
    // Note: .finally() passes through the value/error to next handler
  });
```

---

## Promise Resolution Procedure

When you `resolve(x)`:

1. If `x` is the promise itself → reject with TypeError (circular)
2. If `x` is a thenable (has `.then` method) → adopt its state
3. Otherwise → fulfill with `x` directly

```javascript
// This is why returning Promise.resolve(x) in .then() costs extra ticks:
Promise.resolve()
  .then(() => Promise.resolve(42))  // extra microtask ticks to unwrap
  .then(v => console.log(v));       // 42 (but later than returning 42 directly)

// Returning 42 directly is faster:
Promise.resolve()
  .then(() => 42)      // 1 microtask tick
  .then(v => console.log(v));
```

---

## Implementing a Basic Promise (Simplified)

```javascript
class MyPromise {
  #state = 'pending';
  #value;
  #handlers = [];

  constructor(executor) {
    const resolve = (value) => {
      if (this.#state !== 'pending') return;
      this.#state = 'fulfilled';
      this.#value = value;
      this.#handlers.forEach(h => h.onFulfilled?.(value));
    };

    const reject = (reason) => {
      if (this.#state !== 'pending') return;
      this.#state = 'rejected';
      this.#value = reason;
      this.#handlers.forEach(h => h.onRejected?.(reason));
    };

    try {
      executor(resolve, reject);
    } catch(e) {
      reject(e);
    }
  }

  then(onFulfilled, onRejected) {
    return new MyPromise((resolve, reject) => {
      const handle = (fn, val, next) => {
        queueMicrotask(() => {
          try {
            if (typeof fn === 'function') {
              const result = fn(val);
              resolve(result);
            } else {
              next(val); // pass through
            }
          } catch(e) {
            reject(e);
          }
        });
      };

      if (this.#state === 'fulfilled') {
        handle(onFulfilled, this.#value, resolve);
      } else if (this.#state === 'rejected') {
        handle(onRejected, this.#value, reject);
      } else {
        this.#handlers.push({
          onFulfilled: (v) => handle(onFulfilled, v, resolve),
          onRejected:  (r) => handle(onRejected, r, reject)
        });
      }
    });
  }

  catch(onRejected) { return this.then(undefined, onRejected); }

  static resolve(v) { return new MyPromise(res => res(v)); }
  static reject(r)  { return new MyPromise((_, rej) => rej(r)); }
}
```

---

## Microtask Scheduling

Promises always execute callbacks asynchronously — even if already resolved:

```javascript
const p = Promise.resolve(1); // already resolved

p.then(v => console.log('then:', v));
console.log('sync code');

// Output:
// sync code   ← runs first
// then: 1     ← microtask
```

This guarantees consistent behavior — `.then()` is always async.

---

## Common Mistakes

```javascript
// ❌ Creating unnecessary promise wrapper:
function readData() {
  return new Promise((resolve, reject) => {
    fetch('/api')
      .then(res => resolve(res.json()))  // Redundant! fetch already returns a promise
      .catch(reject);
  });
}

// ✅ Just return the chain:
function readData() {
  return fetch('/api').then(res => res.json());
}

// ❌ Not returning in .then():
getUser()
  .then(user => {
    getOrders(user.id); // missing return! next .then gets undefined
  })
  .then(orders => console.log(orders)); // undefined!

// ✅ Always return:
getUser()
  .then(user => getOrders(user.id)) // return the promise
  .then(orders => console.log(orders)); // orders!
```

---

## Interview Questions

**Q: How many states does a Promise have? Can it transition back?**
A: Three states: pending, fulfilled, rejected. Once a Promise transitions from pending to fulfilled or rejected, it's settled and NEVER changes state. The value/reason is permanently stored.

**Q: What is the difference between `.then(fn, errFn)` and `.then(fn).catch(errFn)`?**
A: `.then(fn, errFn)` — `errFn` does NOT catch errors thrown in `fn` (both handlers are for the same promise). `.then(fn).catch(errFn)` — `errFn` catches errors from BOTH the original promise AND from `fn`. The second form is generally preferred.

**Q: Why is returning a Promise inside .then() different from returning a value?**
A: Returning a value immediately resolves the next promise with that value (1 microtask tick). Returning a Promise causes the chain to wait for that Promise to settle — the next handler only runs after the inner promise resolves. This costs extra microtask ticks.

**Q: Is the Promise executor synchronous or asynchronous?**
A: The executor function runs **synchronously** when `new Promise(executor)` is called. Only the `resolve`/`reject` callbacks (`.then()` handlers) are asynchronous (scheduled as microtasks).
