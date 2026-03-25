# Functional Programming in JavaScript

FP treats computation as evaluation of mathematical functions — avoiding shared mutable state and side effects.

**Core principles:**
- **Pure functions** — same input always produces same output, no side effects
- **Immutability** — don't mutate, create new values
- **First-class functions** — functions as values, passed and returned
- **Composition** — build complex behavior from simple functions
- **Declarative** — describe *what*, not *how*

---

## Pure Functions

```js
// ❌ Impure — depends on external state, has side effects
let total = 0;
function addToTotal(n) {
  total += n;  // mutates external state
  console.log(total); // side effect
}

// ✅ Pure — predictable, testable, no side effects
function add(a, b) { return a + b; }
function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

// Pure function test — deterministic, no mocks needed
console.log(add(2, 3));              // always 5
console.log(formatCurrency(1234.5)); // always '$1,234.50'
```

---

## Immutability

Never mutate — return new values:

```js
// ❌ Mutation
const user = { name: 'Alice', age: 30 };
user.age = 31; // mutated original

// ✅ Immutable update
const updatedUser = { ...user, age: 31 }; // new object

// ❌ Array mutation
const arr = [1, 2, 3];
arr.push(4); // mutates

// ✅ Immutable array operations
const newArr = [...arr, 4];         // append
const without = arr.filter(x => x !== 2); // remove
const replaced = arr.map(x => x === 2 ? 99 : x); // replace

// Deep immutable update (nested)
const state = { user: { name: 'Alice', prefs: { theme: 'dark' } } };
const newState = {
  ...state,
  user: {
    ...state.user,
    prefs: { ...state.user.prefs, theme: 'light' }
  }
};

// Structured Clone (deep copy for complex objects)
const deepCopy = structuredClone(state); // ES2022

// Object.freeze — shallow immutability
const config = Object.freeze({ apiUrl: 'https://api.example.com', timeout: 5000 });
config.apiUrl = 'changed'; // silently fails (throws in strict mode)
config.timeout;            // 5000 — unchanged
```

### Immutable Data Structures (production)

```js
// Immer — write mutable-looking code that produces immutable result
import { produce } from 'immer';

const nextState = produce(state, (draft) => {
  draft.user.prefs.theme = 'light'; // looks like mutation
  draft.notifications.push({ id: 1, msg: 'Hello' });
}); // state unchanged, nextState is a new object

// Immer is used by Redux Toolkit internally
```

---

## Higher-Order Functions

Functions that take or return other functions:

```js
// Built-in HOFs
[1, 2, 3].map(x => x * 2);         // [2, 4, 6] — transform
[1, 2, 3, 4].filter(x => x % 2);   // [1, 3] — select
[1, 2, 3].reduce((acc, x) => acc + x, 0); // 6 — accumulate
[1, 2, 3].every(x => x > 0);       // true
[1, -1, 2].some(x => x < 0);       // true
[3, 1, 2].sort((a, b) => a - b);   // [1, 2, 3]
[1, [2, [3]]].flat(Infinity);       // [1, 2, 3]
[1, 2].flatMap(x => [x, x * 2]);   // [1, 2, 2, 4]

// Custom HOF
function withRetry(fn, maxAttempts = 3) {
  return async function(...args) {
    let lastError;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        return await fn(...args);
      } catch (err) {
        lastError = err;
        if (i < maxAttempts - 1) await new Promise(r => setTimeout(r, 2 ** i * 100));
      }
    }
    throw lastError;
  };
}

const fetchWithRetry = withRetry(fetch, 3);

// withLogger
function withLogger(fn, name = fn.name) {
  return function(...args) {
    console.time(name);
    const result = fn.apply(this, args);
    console.timeEnd(name);
    return result;
  };
}
```

---

## Currying

Currying transforms a function that takes N arguments into a chain of N single-argument functions. The key benefit is **partial application via specialization**: you call the curried function with some arguments up front and get back a new function pre-loaded with those arguments, ready to receive the rest later. This enables creating reusable, domain-specific function variants (`double`, `triple`, `onClick`) from a single general-purpose function without any wrapper boilerplate. Currying differs from partial application: currying always produces single-argument functions in a strict chain, while partial application fixes any number of arguments in one step. Use currying (or libraries like Ramda/fp-ts that curry by default) when building composable point-free pipelines.

```js
// Manual curry
function curry(fn) {
  return function curried(...args) {
    if (args.length >= fn.length) {
      return fn.apply(this, args);
    }
    return function(...moreArgs) {
      return curried.apply(this, args.concat(moreArgs));
    };
  };
}

const add = curry((a, b, c) => a + b + c);
add(1)(2)(3);    // 6
add(1, 2)(3);    // 6
add(1)(2, 3);    // 6
add(1, 2, 3);    // 6

// Practical: create specialized functions
const multiply = curry((factor, n) => n * factor);
const double = multiply(2);
const triple = multiply(3);

[1, 2, 3].map(double); // [2, 4, 6]
[1, 2, 3].map(triple); // [3, 6, 9]

// Event handling
const addEventListener = curry((event, handler, element) =>
  element.addEventListener(event, handler)
);
const onClick = addEventListener('click');
const onButtonClick = onClick(() => console.log('clicked'));
// onButtonClick(buttonElement);
```

---

## Partial Application

Partial application fixes a subset of a function's arguments now and returns a new function that accepts the remaining arguments later. Unlike currying (which always produces single-argument chains), partial application can fix any number of arguments in one call. It solves the configuration problem: when you have a general-purpose function and a known context (a log level, a base URL, a multiplier), partial application creates a context-aware version without repeating the fixed argument at every call site. `Function.prototype.bind` is the built-in partial application mechanism.

```js
function partial(fn, ...presetArgs) {
  return function(...laterArgs) {
    return fn(...presetArgs, ...laterArgs);
  };
}

function log(level, timestamp, message) {
  console.log(`[${level}] ${timestamp}: ${message}`);
}

const logInfo = partial(log, 'INFO');
const logError = partial(log, 'ERROR');
logInfo(Date.now(), 'Server started');
logError(Date.now(), 'Connection failed');

// Using bind for partial application
const double = Math.pow.bind(null, 2);  // base = 2
double(10); // 2^10 = 1024
```

---

## Function Composition

Combine multiple functions into one:

```js
// compose: right-to-left (mathematical order)
const compose = (...fns) => x => fns.reduceRight((acc, fn) => fn(acc), x);

// pipe: left-to-right (data flow order — more readable)
const pipe = (...fns) => x => fns.reduce((acc, fn) => fn(acc), x);

// Building a data transformation pipeline
const trim = s => s.trim();
const toLowerCase = s => s.toLowerCase();
const removeSpaces = s => s.replace(/\s+/g, '-');
const slugify = pipe(trim, toLowerCase, removeSpaces);

slugify('  Hello World  '); // 'hello-world'

// Complex pipeline
const processUsers = pipe(
  users => users.filter(u => u.active),
  users => users.map(u => ({ ...u, name: u.name.trim() })),
  users => users.sort((a, b) => a.name.localeCompare(b.name)),
  users => users.slice(0, 10),
);

processUsers(rawUsers);
```

---

## Functors and Monads (simplified)

A **functor** is any container that implements a `map` method which applies a function to its contents and returns the same container type — `Array` is the most familiar example. A **monad** extends this with a `flatMap`/`chain` method that handles nested containers and sequencing. The practical value in JavaScript is handling nullable values and errors without null checks scattered throughout the code. The `Maybe` monad wraps a potentially-absent value; every `.map()` on a `Nothing` is a no-op, so you can chain transformations safely and only handle the absent case once at the end. Use this pattern when you find yourself writing deeply nested `if (x && x.y && x.y.z)` guards.

```js
// Functor: a container you can map over
// Array is a functor: [1,2,3].map(fn) → [fn(1), fn(2), fn(3)]

// Maybe monad — safe operations on nullable values
class Maybe {
  #value;
  constructor(value) { this.#value = value; }

  static of(value) { return new Maybe(value); }
  static empty() { return new Maybe(null); }

  isNothing() { return this.#value == null; }

  map(fn) {
    return this.isNothing() ? Maybe.empty() : Maybe.of(fn(this.#value));
  }

  getOrElse(defaultValue) {
    return this.isNothing() ? defaultValue : this.#value;
  }
}

// No null checks scattered through code
const getCity = (user) =>
  Maybe.of(user)
    .map(u => u.address)
    .map(a => a.city)
    .getOrElse('Unknown');

getCity({ address: { city: 'NYC' } }); // 'NYC'
getCity({ address: null });            // 'Unknown'
getCity(null);                         // 'Unknown'
```

---

## Memoization

Cache results of expensive pure functions:

```js
function memoize(fn) {
  const cache = new Map();
  return function(...args) {
    const key = JSON.stringify(args);
    if (!cache.has(key)) cache.set(key, fn.apply(this, args));
    return cache.get(key);
  };
}

const fibonacci = memoize(function fib(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
});

fibonacci(40); // fast
fibonacci(40); // instant (cached)

// WeakMap-based memoize (for object args, avoids memory leaks)
function memoizeWeak(fn) {
  const cache = new WeakMap();
  return function(obj, ...rest) {
    if (!cache.has(obj)) cache.set(obj, fn(obj, ...rest));
    return cache.get(obj);
  };
}
```

---

## Transducers (advanced)

Transducers are composable transformation functions that are independent of the data source and sink. Where chaining `.filter().map()` creates one intermediate array per step, a transducer composes the transformations into a single reducing function that processes each element exactly once. This makes transducers ideal for processing large arrays or streams where allocating intermediate collections is too expensive. Transducers are context-free: the same transducer can be applied to arrays, generators, observable streams, or any reducible container. The cost is a higher conceptual overhead compared to method chaining.

Composable, efficient data transformations — no intermediate arrays:

```js
// Regular: creates two intermediate arrays
const result = [1,2,3,4,5,6,7,8,9,10]
  .filter(x => x % 2 === 0)  // intermediate array
  .map(x => x * 3);           // intermediate array

// Transducer: single pass, no intermediates
const filterEven = reducer => (acc, x) => x % 2 === 0 ? reducer(acc, x) : acc;
const multiplyBy3 = reducer => (acc, x) => reducer(acc, x * 3);

const append = (acc, x) => [...acc, x];

const transduce = (...transducers) =>
  (reducer) => transducers.reduceRight((r, t) => t(r), reducer);

const xform = transduce(filterEven, multiplyBy3);
[1,2,3,4,5,6,7,8,9,10].reduce(xform(append), []); // [6, 12, 18, 24, 30]
```

---

## Practical FP: Replacing Imperative Code

```js
// ❌ Imperative
function processOrders(orders) {
  const result = [];
  for (const order of orders) {
    if (order.status === 'completed') {
      const total = order.items.reduce((sum, item) => sum + item.price * item.qty, 0);
      if (total > 100) {
        result.push({ ...order, total, discount: total * 0.1 });
      }
    }
  }
  return result;
}

// ✅ Declarative FP
const calcTotal = order =>
  order.items.reduce((sum, item) => sum + item.price * item.qty, 0);

const processOrders = pipe(
  orders => orders.filter(o => o.status === 'completed'),
  orders => orders.map(o => ({ ...o, total: calcTotal(o) })),
  orders => orders.filter(o => o.total > 100),
  orders => orders.map(o => ({ ...o, discount: o.total * 0.1 })),
);
```
