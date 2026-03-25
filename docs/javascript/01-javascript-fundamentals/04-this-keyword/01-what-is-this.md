# The `this` Keyword

## What is `this`?

`this` is a special identifier available inside every function. It refers to the **execution context** — the object that the function is currently operating on. The key rule:

> **For regular functions, `this` is determined at CALL TIME, not at definition time.**

This is the opposite of closure variables, which are determined at definition time (lexical scope). `this` is dynamic — it depends on HOW a function is called.

---

## The 4 Rules of `this` Binding

Every function call falls into one of these 4 categories (in priority order):

### Rule 1: New Binding (Highest Priority)

When a function is called with `new`, JavaScript allocates a fresh empty object, sets its `[[Prototype]]` to the function's `.prototype`, runs the function body with `this` pointing to that new object, and returns it. This is the highest-priority binding because `new` is an explicit signal that you are creating an instance — there is no ambiguity about what `this` should be.

When a function is called with `new`:
- A new object is created
- `this` refers to that new object

```javascript
function Person(name) {
  this.name = name;  // this = new object being created
  this.greet = function() { return `Hi, I'm ${this.name}`; };
}

const alice = new Person('Alice');
alice.name;   // 'Alice'
alice.greet(); // "Hi, I'm Alice"
```

### Rule 2: Explicit Binding

Explicit binding allows you to call any function with a specific `this` value, regardless of how or where that function is defined. `call` and `apply` invoke the function immediately; `bind` returns a new permanently-bound function that ignores any subsequent `call`, `apply`, or even another `bind` attempt to change `this`. Explicit binding overrides implicit binding because the programmer's explicit instruction takes precedence over an inferred context.

When `call()`, `apply()`, or `bind()` is used:
- `this` is explicitly set to the provided value

```javascript
function greet() {
  return `Hello, I'm ${this.name}`;
}

const user = { name: 'Bob' };

greet.call(user);   // "Hello, I'm Bob" — this = user
greet.apply(user);  // "Hello, I'm Bob" — same

const boundGreet = greet.bind(user);
boundGreet();       // "Hello, I'm Bob" — always user
```

### Rule 3: Implicit Binding

Implicit binding is the most common `this` pattern: when you call a function as a property of an object (`obj.fn()`), JavaScript implicitly sets `this` to that object. The binding is called "implicit" because you never write it explicitly — JavaScript infers it from the call-site syntax. The critical caveat is that the binding is only established at the call site; storing the function reference in a variable and calling it later loses the implicit binding.

When a function is called as a method of an object:
- `this` = the object before the dot

```javascript
const obj = {
  name: 'Object',
  greet() {
    return `Hello from ${this.name}`;
  }
};

obj.greet(); // "Hello from Object" — this = obj
```

### Rule 4: Default Binding (Lowest Priority)

Default binding applies when a function is called as a plain function — no `new`, no explicit binding, and no object before the dot. In non-strict mode, it falls back to the global object (a legacy behavior from the earliest days of JavaScript). In strict mode, it is `undefined` instead, which is much safer because accessing properties on `undefined` throws immediately rather than silently modifying global state. Class bodies and ES modules are always strict, so default binding in those contexts always yields `undefined`.

When none of the above apply (plain function call):
- In **strict mode**: `this = undefined`
- In **non-strict mode**: `this = global` (window in browser, global in Node.js)

```javascript
function showThis() {
  console.log(this);
}

// Non-strict:
showThis(); // global object

// Strict mode:
'use strict';
showThis(); // undefined
```

---

## Priority Order — Which Rule Wins?

When a call site satisfies multiple rules simultaneously (e.g., calling a bound method on an object with `call`), the higher-priority rule wins. `new` > explicit (`bind`/`call`/`apply`) > implicit (method call) > default (plain call). In practice, `new` and explicit binding are never combined accidentally, but the interaction between explicit and implicit binding is a common interview topic.

```javascript
function test() { return this.x; }

const obj1 = { x: 1, test };
const obj2 = { x: 2, test };

// Rule 4 (default) — lowest
test(); // undefined.x → TypeError (strict) or global.x

// Rule 3 (implicit)
obj1.test(); // 1 — this = obj1
obj2.test(); // 2 — this = obj2

// Rule 2 (explicit) — overrides implicit
obj1.test.call(obj2); // 2 — explicit wins over implicit

// Rule 1 (new) — highest
new test(); // this = new object, this.x = undefined
```

---

## Strict Mode Effect on `this`

Strict mode was introduced partly to make `this` safer. In non-strict mode, default binding hands a plain function call access to the global object — a dangerous footgun where typos or extracted methods silently read/write global state. Strict mode converts this to `undefined`, causing an immediate, visible `TypeError` instead. Since ES6 modules and class bodies are implicitly strict, most modern code already benefits from this protection.

```javascript
// Without strict mode
function foo() {
  console.log(this); // global object (window/global)
}
foo();

// With strict mode
'use strict';
function bar() {
  console.log(this); // undefined!
}
bar();

// Class bodies are always strict
class Foo {
  method() {
    console.log(this); // undefined if called without context
  }
}
const m = new Foo().method; // extracting method
m(); // undefined — not Foo instance
```

---

## Common `this` Pitfall: Implicit Binding Loss

The most frequent `this` bug — extracting a method from an object:

```javascript
const timer = {
  count: 0,
  start() {
    // Method is called as timer.start() — this = timer
    setInterval(function() {
      this.count++; // ❌ this is NOT timer here!
      // setTimeout/setInterval calls the callback with default binding
      // this = global (non-strict) or undefined (strict)
    }, 1000);
  }
};

timer.start(); // NaN or error — count never increments properly
```

**Fixes:**
```javascript
// Fix 1: Arrow function (lexical this)
start() {
  setInterval(() => {
    this.count++; // ✅ this = timer (lexical)
  }, 1000);
}

// Fix 2: Capture this in a variable
start() {
  const self = this;
  setInterval(function() {
    self.count++; // ✅ self always = timer
  }, 1000);
}

// Fix 3: bind()
start() {
  setInterval(function() {
    this.count++;
  }.bind(this), 1000); // ✅ explicitly bind timer
}
```

---

## Arrow Functions and `this`

Arrow functions do NOT have their own `this`. They inherit `this` from the **enclosing lexical scope** at definition time.

```javascript
const obj = {
  name: 'Obj',
  regularMethod: function() {
    console.log(this.name); // ✅ 'Obj' — method call, this = obj

    const inner = function() {
      console.log(this.name); // ❌ undefined — lost this
    };
    inner();

    const arrowInner = () => {
      console.log(this.name); // ✅ 'Obj' — inherits from regularMethod
    };
    arrowInner();
  },

  // ❌ Arrow as method — inherits this from module scope (not obj)
  arrowMethod: () => {
    console.log(this); // NOT obj — it's the outer 'this' (module/global)
  }
};

obj.regularMethod();
obj.arrowMethod(); // wrong this!
```

**Rule:** Arrow functions are great for CALLBACKS inside methods. But never use arrows as object methods themselves.

---

## `this` in Different Contexts

`this` has different values depending on where and how code is executed. Each context has its own rules, and conflating them is a common source of confusion. The table below covers every common context — understand each row independently rather than trying to memorize a single rule.

```javascript
// 1. Global context
console.log(this); // {} in Node.js modules, window in browser

// 2. Regular function
function fn() { return this; }
fn(); // global (non-strict) or undefined (strict)

// 3. Method
const o = { fn() { return this; } };
o.fn(); // o

// 4. Constructor
function Ctor() { this.x = 1; }
new Ctor(); // new object with x: 1

// 5. Arrow function
const arrow = () => this; // this from outer scope
arrow(); // same as outer this

// 6. Class method
class C {
  method() { return this; }
}
new C().method(); // C instance
const m = new C().method;
m(); // undefined (strict mode — classes are always strict)

// 7. Event listener (browser)
btn.addEventListener('click', function() {
  this; // the button element (implicit binding)
});
btn.addEventListener('click', () => {
  this; // outer lexical this (NOT the button)
});
```

---

## `this` in Node.js

Node.js's module system introduces an extra subtlety: every module file is wrapped in a function before execution, making `this` at the top level of a file refer to `module.exports` (an empty object `{}`), not to the Node.js `global` object. This surprises developers coming from browser JavaScript where top-level `this === window`. Inside regular functions, the behavior follows the standard 4-rule system, with non-strict defaulting to `global` and strict mode giving `undefined`.

```javascript
// At module top level in Node.js:
console.log(this); // {} (module.exports — not global!)

// Inside a regular function at top level:
function test() {
  console.log(this); // global object (in non-strict CommonJS)
}
test();

// In strict mode:
'use strict';
function test2() {
  console.log(this); // undefined
}
test2();
```

This is why `this` at the top level of a Node.js module is `{}` (empty `module.exports`), not the global object.

---

## Interview Questions

**Q: What determines the value of `this`?**
A: For regular functions, `this` is determined at call time by HOW the function is called: 1) `new` binding, 2) explicit binding (call/apply/bind), 3) implicit binding (method call), 4) default binding (global or undefined in strict). For arrow functions, `this` is lexically inherited from the enclosing scope at definition time.

**Q: What is implicit binding loss?**
A: When you extract a method from an object and call it as a plain function, it loses its implicit `this` binding. `const fn = obj.method; fn();` — `fn()` is a plain call, so default binding applies (not `obj`).

**Q: Why can't arrow functions be constructors?**
A: Arrow functions don't have their own `this` (they inherit it lexically), so `new` can't set `this` to a new object. Also, they don't have a `prototype` property, which `new` uses to set the new object's `__proto__`.
