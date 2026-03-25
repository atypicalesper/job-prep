# Practical Uses of Closures

Closures aren't just a theoretical concept — they power many real-world patterns in JavaScript. Here are the most important ones.

---

## 1. Data Privacy / Encapsulation

Closures are the original way to create private variables in JavaScript (before `#privateFields` in classes):

```javascript
function createBankAccount(initialBalance) {
  let balance = initialBalance; // truly private

  return {
    deposit(amount) {
      if (amount <= 0) throw new Error('Amount must be positive');
      balance += amount;
      return balance;
    },
    withdraw(amount) {
      if (amount > balance) throw new Error('Insufficient funds');
      balance -= amount;
      return balance;
    },
    getBalance() {
      return balance;
    }
  };
}

const account = createBankAccount(1000);
account.deposit(500);   // 1500
account.withdraw(200);  // 1300
account.getBalance();   // 1300

// Cannot access or modify balance directly:
console.log(account.balance); // undefined
account.balance = 99999;       // does nothing to actual balance
account.getBalance();          // still 1300
```

---

## 2. Function Factories

A function factory is a higher-order function that returns a new, specialized function each time it is called. The returned function closes over the arguments passed to the factory, making those arguments a permanent part of its behavior. This pattern is powerful for creating families of related functions — validators, formatters, loggers — without repeating the shared configuration in every call.

Create specialized functions based on parameters:

```javascript
function createValidator(min, max) {
  return function validate(value) {
    if (typeof value !== 'number') return { valid: false, error: 'Not a number' };
    if (value < min) return { valid: false, error: `Below minimum ${min}` };
    if (value > max) return { valid: false, error: `Above maximum ${max}` };
    return { valid: true };
  };
}

const validateAge     = createValidator(0, 120);
const validateScore   = createValidator(0, 100);
const validatePercent = createValidator(0, 1);

validateAge(25);     // { valid: true }
validateAge(150);    // { valid: false, error: 'Above maximum 120' }
validateScore(85);   // { valid: true }
```

---

## 3. Memoization

Memoization is an optimization where a function caches its return values indexed by its input arguments, so repeated calls with the same arguments skip recomputation entirely. The cache is a variable in the outer scope, closed over by the memoized wrapper — invisible to callers but persistent across all invocations. Only use memoization for pure functions (same inputs always produce the same output with no side effects), and be mindful that the cache grows unboundedly unless you add an eviction policy.

Cache expensive function results:

```javascript
function memoize(fn) {
  const cache = new Map();

  return function memoized(...args) {
    const key = JSON.stringify(args);

    if (cache.has(key)) {
      return cache.get(key);
    }

    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };
}

// Fibonacci without memo: O(2^n) — exponential
function fib(n) {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
}

// With memoization: O(n)
const memoFib = memoize(function(n) {
  if (n <= 1) return n;
  return memoFib(n - 1) + memoFib(n - 2);
});

console.time('slow'); fib(40);      console.timeEnd('slow');   // ~1000ms
console.time('fast'); memoFib(40);  console.timeEnd('fast');   // <1ms
```

---

## 4. Debounce

Delay execution until user stops doing something (e.g., typing). The closure holds `timerId` — every call resets it, so the function only fires after the caller has been quiet for `delay` ms:

```javascript
function debounce(fn, delay) {
  let timerId;

  return function debounced(...args) {
    clearTimeout(timerId); // reset the timer on every call
    timerId = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

// Only fires 300ms after user stops typing
const handleSearch = debounce((query) => {
  fetchSearchResults(query);
}, 300);

searchInput.addEventListener('input', (e) => handleSearch(e.target.value));
```

**Leading-edge variant** — fire immediately on the first call, then lock out for `delay` ms:

```javascript
function debounceLeading(fn, delay) {
  let timerId;
  return function debounced(...args) {
    if (!timerId) fn.apply(this, args); // fire on first call
    clearTimeout(timerId);
    timerId = setTimeout(() => { timerId = null; }, delay);
  };
}
```

**How the closure works:** `timerId` is captured by `debounced`. Every call can read AND modify the same `timerId` — cancelling the previous timer and scheduling a new one. See [`08-debounce-throttle.md`](../08-miscellaneous/08-debounce-throttle.md) for the full implementation with `cancel`, `flush`, and `maxWait`.

---

## 5. Throttle

Limit how often a function fires — guaranteed to run at most once per `interval` ms during a burst of calls. Unlike debounce, throttle always fires while the event stream is active:

```javascript
function throttle(fn, interval) {
  let lastTime = 0;

  return function throttled(...args) {
    const now = Date.now();
    if (now - lastTime >= interval) {
      lastTime = now;               // timestamp approach — no drift
      fn.apply(this, args);
    }
  };
}

// handleScroll runs at most once per 100ms
const handleScroll = throttle(() => {
  updateScrollPosition();
}, 100);

window.addEventListener('scroll', handleScroll);
```

**How the closure works:** `lastTime` persists between calls. The condition `now - lastTime >= interval` gates execution, and updating `lastTime` inside the function maintains the rate limit.

**Debounce vs Throttle in one line:** Debounce fires _after_ activity stops. Throttle fires _at a capped rate_ while activity continues. See [`08-debounce-throttle.md`](../08-miscellaneous/08-debounce-throttle.md) for rAF throttle, React hooks, and common mistakes.

---

## 6. Once — Execute Exactly Once

The `once` pattern guarantees a function runs at most one time regardless of how many times the wrapper is invoked. It is useful for initialization logic that is dangerous to repeat — database connections, event listener registration, app bootstrapping. The `called` flag and the cached `result` both live in the outer function's scope, closed over by the returned wrapper. Even after the inner function runs, the wrapper safely returns the stored result on subsequent calls.

```javascript
function once(fn) {
  let called = false;
  let result;

  return function(...args) {
    if (!called) {
      called = true;
      result = fn.apply(this, args);
    }
    return result; // always returns first result
  };
}

const initializeApp = once(() => {
  console.log('App initialized!');
  return 'init-result';
});

initializeApp(); // 'App initialized!' — runs
initializeApp(); // silent — doesn't run again
initializeApp(); // silent
```

---

## 7. Partial Application

Partial application is the technique of creating a new function by pre-filling (partially applying) one or more arguments of an existing function. The pre-filled arguments are captured in the closure of the returned function. Unlike `bind`, this generic implementation works with any function and any subset of leading arguments, enabling highly composable function pipelines without losing the original function's identity.

Pre-fill some arguments:

```javascript
function partial(fn, ...presetArgs) {
  return function(...laterArgs) {
    return fn(...presetArgs, ...laterArgs);
  };
}

function add(a, b, c) {
  return a + b + c;
}

const add5 = partial(add, 5);        // a = 5 is preset
const add5and3 = partial(add, 5, 3); // a = 5, b = 3 are preset

add5(2, 3);     // 10 (5 + 2 + 3)
add5and3(10);   // 18 (5 + 3 + 10)
```

---

## 8. Currying

Currying transforms a function that takes multiple arguments into a chain of functions that each take one argument. Each intermediate function closes over the arguments collected so far, waiting until all required arguments have been provided before calling the original function. Currying enables point-free programming styles and makes it easy to create reusable, partially-applied variants of any function.

Transform a multi-argument function into a chain of single-argument functions:

```javascript
function curry(fn) {
  return function curried(...args) {
    if (args.length >= fn.length) {
      return fn(...args);
    }
    return function(...moreArgs) {
      return curried(...args, ...moreArgs);
    };
  };
}

const curriedAdd = curry((a, b, c) => a + b + c);

curriedAdd(1)(2)(3);     // 6
curriedAdd(1, 2)(3);     // 6
curriedAdd(1)(2, 3);     // 6
curriedAdd(1, 2, 3);     // 6

// Create specialized functions:
const addTen = curriedAdd(10);
addTen(5)(3); // 18
```

---

## 9. Iterator / Generator Pattern (Without Generators)

Before native generators existed (and as a complement to them today), closures were used to implement stateful iterators. Each call to `next()` advances the iterator's internal cursor — a variable in the closure — and returns the next value in the sequence. The iterator implements the JavaScript iterator protocol by returning `{ value, done }` objects, making it compatible with `for...of`, spread, and destructuring.

```javascript
function createRange(start, end, step = 1) {
  let current = start;

  return {
    next() {
      if (current <= end) {
        const value = current;
        current += step;
        return { value, done: false };
      }
      return { value: undefined, done: true };
    },
    [Symbol.iterator]() { return this; }
  };
}

const range = createRange(1, 10, 2);
for (const n of range) {
  console.log(n); // 1, 3, 5, 7, 9
}
```

---

## 10. Async Operation with Retry Logic

The retry wrapper pattern uses a closure to bind the target function and its configuration (max attempts, backoff strategy) into a single reusable decorator. Every call to the returned async function has access to those captured settings via the closure, without needing to pass them as arguments each time. Exponential backoff — where each successive delay doubles — is the standard strategy because it reduces thundering-herd pressure on a service that is already struggling.

```javascript
function withRetry(fn, maxRetries = 3, baseDelay = 1000) {
  return async function retried(...args) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn(...args);
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt); // exponential backoff
          console.log(`Attempt ${attempt + 1} failed. Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  };
}

const fetchWithRetry = withRetry(fetch, 3, 500);
const data = await fetchWithRetry('/api/data');
```

---

## 11. Event Bus / Pub-Sub

A pub-sub event bus decouples event emitters from event listeners: neither side needs to know about the other. The closure over `listeners` (the internal registry Map) is what makes the entire bus work — all three methods (`on`, `emit`, `off`) share access to the same Map, so registering a listener in `on` makes it immediately visible to `emit`. This is also a good pattern for returning an unsubscribe function directly from `on`, rather than requiring a separate `off` call.

```javascript
function createEventBus() {
  const listeners = new Map(); // closed over by all methods

  return {
    on(event, callback) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(callback);
      return () => listeners.get(event).delete(callback); // returns unsubscribe fn
    },
    emit(event, data) {
      const callbacks = listeners.get(event);
      if (callbacks) callbacks.forEach(cb => cb(data));
    },
    off(event, callback) {
      listeners.get(event)?.delete(callback);
    }
  };
}

const bus = createEventBus();
const unsub = bus.on('userLogin', (user) => console.log('User logged in:', user));
bus.emit('userLogin', { name: 'Alice' }); // fires
unsub(); // unsubscribe
bus.emit('userLogin', { name: 'Bob' });   // won't fire
```

---

## Interview Questions

**Q: How would you implement a function that can only be called N times?**
```javascript
function times(fn, n) {
  let count = 0;
  return function(...args) {
    if (count < n) {
      count++;
      return fn(...args);
    }
  };
}
const greetTwice = times(() => console.log('Hello'), 2);
greetTwice(); // Hello
greetTwice(); // Hello
greetTwice(); // silent
```

**Q: What's the difference between debounce and throttle?**
A: Debounce fires AFTER activity stops (waits for quiet period). Throttle fires at most once per interval (rate limiting). Debounce: search-as-you-type. Throttle: scroll handlers, resize.

**Q: How does memoization use closures?**
A: The `cache` (Map/object) is declared in the outer function and closed over by the inner function. Every call to the memoized function can read and write to the same `cache` object.
