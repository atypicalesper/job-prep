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

Closures are the primary tool for creating private, stateful objects without a class. The outer function defines the private variable, and the returned object's methods close over it. Each call to the factory produces a completely independent instance with its own isolated state — there is no way for external code to read or modify the variable directly.

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

Memoization is a caching technique that trades memory for speed: the first time a function is called with a given set of arguments, the result is computed and stored; on subsequent calls with the same arguments, the stored result is returned immediately. Closures make this clean because the `cache` data structure lives in the outer function's scope, invisible to callers, and is shared across all invocations of the memoized function.

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

Partial application creates a new, more specific function by pre-filling some arguments of a more general one. The pre-filled arguments are captured in the outer scope and closed over by the returned function. This avoids repetition when you repeatedly call the same function with the same leading arguments, and produces self-documenting named functions like `double` or `triple` that communicate intent.

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

When you need each UI element to maintain its own independent state without sharing a global variable, closures are the natural solution. The factory is called once per element, creating a separate closure environment for each — so two buttons created from the same factory have completely independent click counters, even though they use identical code.

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

A closed-over variable is held by a reference from the function object. As long as the function object is reachable (e.g., stored in a variable, referenced by an event listener, or held in a data structure), the garbage collector cannot free anything that variable references — even if the data is enormous and you only ever use a tiny slice of it. This is the primary way closures contribute to memory leaks in long-running Node.js services and single-page applications.

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

This is one of the most important properties of closures to internalize. Closures capture **references** to variables, not their values at the time of capture. This means multiple functions that close over the same variable all see the same current value of that variable — mutations made by one function are immediately visible to all others. It is this shared-reference behavior that enables the classic loop gotcha (covered in `04-closures-and-loops-gotcha.md`) and also what makes stateful objects built from closures work correctly.

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

The module pattern was the dominant way to structure JavaScript before ES modules existed. It uses an IIFE (Immediately Invoked Function Expression) to create a one-time closure scope, then returns only the public-facing API while keeping internal state and helper functions completely private. Understanding this pattern is important for reading legacy codebases and for understanding what ES modules themselves were designed to replace.

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
