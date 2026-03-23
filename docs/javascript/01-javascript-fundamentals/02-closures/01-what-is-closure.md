# What is a Closure?

## Definition

A **closure** is a function that **remembers the variables from its outer scope** even after the outer function has finished executing.

More precisely: a closure is the combination of a **function** and its **lexical environment** (the scope in which it was created).

```javascript
function outer() {
  const secret = 'I am private'; // outer's local variable

  function inner() {
    console.log(secret); // inner "closes over" secret
  }

  return inner;
}

const fn = outer(); // outer() finishes executing
fn();               // logs: "I am private"
// outer is gone from the call stack
// but inner still has access to 'secret' via closure
```

This works because when `inner` was created, it captured a reference to the entire lexical environment of `outer` — including `secret`. Even after `outer` returns, `inner` keeps that environment alive.

---

## How Closures Work Under the Hood

When a function is created, V8 creates a **closure object** (sometimes called an environment record) that stores variables from the outer scope that the inner function references.

```
outer() execution:
┌────────────────────────────────┐
│  Execution Context (outer)     │
│  ┌──────────────────────────┐  │
│  │  Variable Environment    │  │
│  │  secret = 'I am private' │  │──────────────┐
│  └──────────────────────────┘  │              │
│                                │              │ closure reference
│  inner = function() {          │              │
│    console.log(secret)  ───────┼──────────────┘
│  }                             │
└────────────────────────────────┘

outer() returns inner

Stack frame for outer is gone — but closure keeps the environment alive
```

---

## Closure vs Scope

- **Scope** = the region of code where a variable is accessible (determined at write time)
- **Closure** = the mechanism by which a function retains access to its scope after that scope has "ended"

```javascript
// Scope: x is in the scope of foo
function foo() {
  const x = 10;
  return x; // x in scope here
}
// x not in scope here

// Closure: inner function retains access to x after foo returns
function foo() {
  const x = 10;
  return () => x; // closes over x
}
const getX = foo();
getX(); // 10 — x is gone from stack but closure keeps it
```

---

## Real-World Examples

### 1. Counter / State Encapsulation

```javascript
function createCounter(start = 0) {
  let count = start;  // private state

  return {
    increment() { return ++count; },
    decrement() { return --count; },
    value()     { return count; },
    reset()     { count = start; }
  };
}

const counter = createCounter(10);
counter.increment(); // 11
counter.increment(); // 12
counter.decrement(); // 11
counter.value();     // 11

// count is not directly accessible:
console.log(counter.count); // undefined
```

### 2. Memoization

```javascript
function memoize(fn) {
  const cache = new Map(); // closed over by the returned function

  return function(...args) {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      console.log('cache hit');
      return cache.get(key);
    }
    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };
}

const expensiveSquare = memoize((n) => {
  // simulate expensive computation
  return n * n;
});

expensiveSquare(5); // computed: 25
expensiveSquare(5); // cache hit: 25
expensiveSquare(6); // computed: 36
```

### 3. Partial Application / Currying

```javascript
function multiply(a) {
  return function(b) { // closes over a
    return a * b;
  };
}

const double = multiply(2);  // a = 2 is captured
const triple = multiply(3);  // a = 3 is captured

double(5);  // 10
triple(5);  // 15
double(10); // 20
```

### 4. Event Handlers with Private State

```javascript
function createButton(label) {
  let clickCount = 0; // private to this button instance

  return {
    click() {
      clickCount++;
      console.log(`${label} clicked ${clickCount} times`);
    }
  };
}

const btn1 = createButton('Submit');
const btn2 = createButton('Cancel');

btn1.click(); // Submit clicked 1 times
btn1.click(); // Submit clicked 2 times
btn2.click(); // Cancel clicked 1 times — separate closure
```

---

## Closure and Memory

Closures keep their captured variables alive as long as the closure itself is reachable. This is by design — but can cause memory issues if not managed carefully.

```javascript
function createHeavyThing() {
  const bigData = new Array(1_000_000).fill('x'); // 1MB+

  return function() {
    return bigData.length; // only needs .length, but holds ALL of bigData
  };
}

const fn = createHeavyThing();
// bigData stays in memory as long as fn is referenced!
fn = null; // now bigData can be garbage collected
```

**Best practice:** Only close over what you need. If a closure captures a large object just to access one property, consider extracting just that property before returning.

```javascript
// Better:
function createHeavyThing() {
  const bigData = new Array(1_000_000).fill('x');
  const length = bigData.length; // extract what we need

  return function() {
    return length; // bigData is not held by closure
  };
  // bigData can now be GC'd when createHeavyThing returns
}
```

---

## Closures are References, Not Copies

Closures capture **references** to variables, not their values at the time of capture.

```javascript
function makeAdder() {
  let x = 0;

  return {
    add(n)  { x += n; },
    getX()  { return x; }
  };
}

const adder = makeAdder();
adder.add(5);
adder.add(3);
adder.getX(); // 8 — both functions share the same x reference
```

This is powerful but also the source of the classic loop bug (covered in closures-and-loops.md).

---

## Module Pattern Using Closures

Before ES modules, closures were the main way to create modules with private state:

```javascript
const myModule = (function() {
  // Private
  let _count = 0;
  const _secret = 'hidden';

  function _helper() {
    return _count * 2;
  }

  // Public API
  return {
    increment() { _count++; },
    getDouble() { return _helper(); },
    // _secret and _helper not exposed
  };
})(); // IIFE — immediately invoked

myModule.increment();
myModule.increment();
myModule.getDouble(); // 4
myModule._secret;     // undefined — private!
```

---

## Interview Questions

**Q: What is a closure?**
A: A closure is a function that retains access to variables from its outer lexical scope even after the outer function has returned. It's the combination of a function and its surrounding state (lexical environment).

**Q: Why are closures useful?**
A: They enable data privacy, state persistence between calls, module patterns, partial application, memoization, and event handlers with access to their defining context.

**Q: Do closures cause memory leaks?**
A: They can if a closure holds references to large objects longer than needed, or if event listeners with closures are never removed. But closures themselves aren't leaks — they're just GC-preventing references. The fix is to null out references or use WeakMap/WeakRef.

**Q: Is every function in JavaScript a closure?**
A: Technically yes — every function captures its surrounding environment. But we typically say "closure" only when the inner function outlives the outer function and uses the outer variables.
