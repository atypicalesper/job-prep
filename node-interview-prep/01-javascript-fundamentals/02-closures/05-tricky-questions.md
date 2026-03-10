# Closures — Tricky Interview Questions

---

## Q1: What is the output?

```javascript
function makeCounter() {
  let count = 0;
  return {
    increment: () => ++count,
    decrement: () => --count,
    value: () => count
  };
}

const c1 = makeCounter();
const c2 = makeCounter();

c1.increment();
c1.increment();
c2.increment();
console.log(c1.value()); // ?
console.log(c2.value()); // ?
```

**Output:** `2` then `1`

**Why:** Each call to `makeCounter()` creates a NEW closure with its own `count` variable. `c1` and `c2` don't share state.

---

## Q2: The Shared Closure Trap

```javascript
const counters = [];

for (var i = 0; i < 3; i++) {
  counters.push({
    value: () => i  // all share same i
  });
}

console.log(counters[0].value()); // ?
console.log(counters[1].value()); // ?
console.log(counters[2].value()); // ?
```

**Output:** `3 3 3`

**Why:** `var i` is shared. All three closures reference the same `i`, which is 3 after the loop.

**Fix:**
```javascript
for (let i = 0; i < 3; i++) {
  counters.push({ value: () => i });
}
// Now: 0 1 2
```

---

## Q3: Closure Over a Mutated Variable

```javascript
function multiplier(factor) {
  return (number) => number * factor;
}

let x = 2;
const double = multiplier(x);
x = 10; // change x AFTER creating closure

console.log(double(5)); // ?
```

**Output:** `10`

**Why:** The closure captures `factor` (which is a copy of `x` at call time — value `2`). Wait — actually `factor` IS `2` at the time `multiplier(x)` is called. `x = 10` after doesn't affect `factor`.

**So output is actually: `10`?** No. Let me re-read.

`multiplier(x)` passes the value `2` as `factor`. The closure captures `factor = 2`. So `double(5)` = `5 * 2 = 10`.

**Output: `10`** ✅ (factor was 2, 5 × 2 = 10)

---

## Q4: Shared Reference Trap

```javascript
function makeAdders() {
  const adders = [];
  let n = 0;
  while (n < 3) {
    adders.push((x) => x + n); // n is shared!
    n++;
  }
  return adders;
}

const adders = makeAdders();
console.log(adders[0](10)); // ?
console.log(adders[1](10)); // ?
console.log(adders[2](10)); // ?
```

**Output:** `13 13 13` (10 + 3, because n is 3 after loop)

**Fix:**
```javascript
function makeAdders() {
  return [0, 1, 2].map(n => (x) => x + n);
  // map creates new 'n' binding per iteration
}
// Now: 10, 11, 12
```

---

## Q5: Closure Modifying Outer Variable

```javascript
function outer() {
  let x = 10;

  function inner() {
    x = 20; // modifies outer's x
  }

  inner();
  return x;
}

console.log(outer()); // ?
```

**Output:** `20`

**Why:** Closures don't just READ outer variables — they can WRITE to them. `inner()` directly modifies `x` in `outer()`'s scope.

---

## Q6: The Stale Closure Bug

```javascript
function Counter() {
  const [count, setCount] = useState(0); // hypothetical React-like

  function handleClick() {
    setTimeout(() => {
      console.log(count); // stale! always logs initial count
      setCount(count + 1); // wrong! always sets to 1
    }, 1000);
  }

  return { handleClick };
}
```

**Why:** The closure captures `count` at the time `handleClick` is created. After state updates, `handleClick` still references the OLD `count`.

**Fix (React pattern):**
```javascript
setCount(prevCount => prevCount + 1); // use functional update
```

---

## Q7: What Does This Return?

```javascript
function createSecret(key) {
  function getSecret() {
    return key;
  }
  key = key + '!'; // modify after function creation
  return getSecret;
}

const fn = createSecret('hello');
console.log(fn()); // ?
```

**Output:** `hello!`

**Why:** Closures capture a **reference** to the variable `key`, not the value at definition time. By the time `getSecret` is returned (and `fn()` is called), `key` has already been modified to `'hello!'`.

---

## Q8: Multiple Closures Sharing State

```javascript
function shared() {
  let data = [];

  function add(item) {
    data.push(item);
  }

  function get() {
    return [...data]; // returns copy
  }

  function clear() {
    data = []; // replaces reference
  }

  return { add, get, clear };
}

const store = shared();
store.add('a');
store.add('b');
console.log(store.get()); // ['a', 'b']
store.clear();
console.log(store.get()); // []
store.add('c');
console.log(store.get()); // ['c']
```

**Output:** `['a', 'b']` → `[]` → `['c']`

**Lesson:** All three functions (`add`, `get`, `clear`) close over the SAME `data` variable. `clear()` reassigns `data` to a new array — all functions now see the new array.

---

## Q9: Closure Memory Leak

```javascript
function leaky() {
  const bigData = new Array(1000000).fill('leak');

  return function() {
    // bigData is referenced by this closure
    return bigData.length;
  };
}

const fns = [];
for (let i = 0; i < 100; i++) {
  fns.push(leaky()); // 100 closures, each holding 1M array!
}
```

**Problem:** 100 closures × ~8MB each = ~800MB memory leak if `fns` is never cleared.

**Fix:**
```javascript
function notLeaky() {
  const bigData = new Array(1000000).fill('leak');
  const length = bigData.length; // extract only what's needed

  return function() {
    return length; // bigData not captured
  };
}
```

---

## Q10: Closure in Class Methods

```javascript
class Timer {
  constructor() {
    this.count = 0;
    this.start = this.start.bind(this); // needed?
  }

  start() {
    setInterval(function() {
      this.count++; // 'this' is what here?
      console.log(this.count);
    }, 1000);
  }
}

const t = new Timer();
t.start();
```

**Output:** `NaN NaN NaN...` (or TypeError in strict mode)

**Why:** `function` inside `setInterval` has its own `this`. In non-strict mode, `this` is the global object (`window` or `global`) — not the Timer instance. `global.count` is `undefined`, `undefined++` is `NaN`.

**Fix:**
```javascript
start() {
  setInterval(() => {        // arrow function — lexical this
    this.count++;            // 'this' is the Timer instance
    console.log(this.count);
  }, 1000);
}
```

---

## Q11: The once() Pattern

```javascript
function once(fn) {
  let result;
  let executed = false;
  return function(...args) {
    if (!executed) {
      executed = true;
      result = fn.apply(this, args);
    }
    return result;
  };
}

const init = once((name) => {
  console.log(`Initialized: ${name}`);
  return name.toUpperCase();
});

console.log(init('alice')); // Initialized: alice / ALICE
console.log(init('bob'));   // (nothing logged) / ALICE
console.log(init('carol')); // (nothing logged) / ALICE
```

**Output:**
```
Initialized: alice
ALICE
ALICE
ALICE
```

**Why:** `executed` and `result` are shared across all calls via closure. First call sets both and returns result. Subsequent calls return the cached `result`.

---

## Q12: Closure vs Object Method — this Binding

```javascript
const obj = {
  name: 'Alice',
  greet: function() {
    const inner = function() {
      console.log(this.name); // 'this' is NOT obj
    };
    inner();
  }
};

obj.greet(); // ?
```

**Output:** `undefined` (strict) or whatever `global.name` is

**Fix 1:** Arrow function
```javascript
greet: function() {
  const inner = () => console.log(this.name); // lexical this = obj
  inner();
}
```

**Fix 2:** self/that pattern
```javascript
greet: function() {
  const self = this;
  const inner = function() { console.log(self.name); };
  inner();
}
```

---

## Q13: What Does This Print?

```javascript
function createFunctions() {
  const functions = [];
  for (let i = 0; i < 5; i++) {
    functions.push(function() { return i * i; });
  }
  return functions;
}

const fns = createFunctions();
console.log(fns[0]()); // ?
console.log(fns[3]()); // ?
```

**Output:** `0` and `9`

**Why:** `let` creates a new binding per iteration. `fns[0]` captures `i = 0`, `fns[3]` captures `i = 3`. Each closure has its own `i`.

---

## Q14: Closure in Asynchronous Event Handlers

```javascript
function attachHandlers() {
  const elements = ['a', 'b', 'c'];

  elements.forEach((name, index) => {
    setTimeout(() => {
      console.log(`${index}: ${name}`);
    }, index * 100);
  });
}

attachHandlers();
```

**Output:**
```
0: a
1: b
2: c
```

**Why:** Arrow function in `forEach` callback + `setTimeout` arrow function both correctly close over `name` and `index`. `forEach` with arrow function creates proper per-iteration bindings.

---

## Q15: Recursive Closure

```javascript
function makeFactorial() {
  function factorial(n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1); // recursive call via closure
  }
  return factorial;
}

const fact = makeFactorial();
const anotherRef = fact;

// What if we null out fact?
// fact = null;
// anotherRef(5) still works because factorial internally
// calls 'factorial' (the closed-over name), not 'fact'

console.log(anotherRef(5)); // 120
```

**Output:** `120`

**Key lesson:** The recursive call uses the internal name `factorial`, not the external `fact` or `anotherRef` variable. Named function expressions are safer for recursion.

---

## Summary Cheatsheet

| Pattern | Closure captures | Common gotcha |
|---------|-----------------|---------------|
| Loop with var | Shared i | Use let or IIFE |
| setTimeout in loop | Shared variable | All callbacks see final value |
| Class method callback | Wrong this | Use arrow function |
| Mutable captured var | Reference | Modification affects all |
| Large object capture | Whole object | Extract only needed values |
| Stale closure (React) | Old state | Use functional updates |
