# Lexical Scope

## What is Lexical Scope?

**Lexical scope** (also called static scope) means that the scope of a variable is determined by **where it is written in the source code** — not where it is called from.

JavaScript uses lexical scope. When the JS engine looks up a variable, it looks at the code's **written structure** (where functions are defined), not the call stack (where functions are called from).

```javascript
const x = 'global';

function outer() {
  const x = 'outer';

  function inner() {
    console.log(x); // 'outer' — uses where inner was DEFINED
  }

  inner();
}

outer(); // logs: 'outer'
```

Even if `inner` was called from somewhere else, it would still see the `x` from where it was **defined**, not where it was **called**.

---

## Lexical Scope vs Dynamic Scope

| | Lexical Scope (JavaScript) | Dynamic Scope |
|---|---|---|
| Determined by | Where function is **defined** | Where function is **called** |
| Lookup | Source code structure | Call stack |
| Examples | JavaScript, Python, C | Bash, old Perl, Emacs Lisp |

```javascript
// In JavaScript (lexical scope):
const name = 'global';

function greet() {
  console.log(name); // always uses 'global' (where greet is defined)
}

function wrapper() {
  const name = 'local';
  greet(); // still logs 'global'
}

wrapper(); // logs: 'global'

// If JS had dynamic scope, it would log 'local'
// because 'name' = 'local' in the call stack at that point
```

---

## The Scope Chain

When JS looks up a variable, it walks up the **scope chain** — the nested structure of environments from inner to outer:

```javascript
const a = 1; // global scope

function level1() {
  const b = 2;

  function level2() {
    const c = 3;

    function level3() {
      // Scope chain lookup:
      console.log(c); // found in level3's own scope? No.
                      // found in level2's scope? Yes → 3
      console.log(b); // level3? No. level2? No. level1? Yes → 2
      console.log(a); // level3? No. level2? No. level1? No. global? Yes → 1
    }

    level3();
  }

  level2();
}

level1();
```

Scope chain for level3:
```
level3 scope → level2 scope → level1 scope → global scope → (not found → ReferenceError)
```

---

## Block Scope vs Function Scope

### var — Function Scoped

`var` declarations are scoped to the **nearest function** (or global), NOT to blocks like `{}`, `if`, `for`.

```javascript
function example() {
  if (true) {
    var x = 10;    // scoped to example(), not if block
    let y = 20;    // scoped to if block
    const z = 30;  // scoped to if block
  }

  console.log(x); // 10 — accessible!
  console.log(y); // ReferenceError — not in scope
  console.log(z); // ReferenceError — not in scope
}
```

### var Leaks Out of Blocks

```javascript
for (var i = 0; i < 3; i++) {
  // i is function-scoped, shared across iterations
}
console.log(i); // 3 — leaked out!

for (let j = 0; j < 3; j++) {
  // j is block-scoped to the for loop
}
console.log(j); // ReferenceError — not in scope
```

### let and const — Block Scoped

```javascript
{
  let blockVar = 'only here';
  const alsoBlockVar = 'here too';
}
// blockVar not accessible here
```

---

## Hoisting and Temporal Dead Zone

`var` declarations are **hoisted** to the top of their function scope and initialized to `undefined`:

```javascript
console.log(x); // undefined (not ReferenceError)
var x = 5;
console.log(x); // 5

// Equivalent to:
var x;           // hoisted declaration
console.log(x); // undefined
x = 5;
console.log(x); // 5
```

`let` and `const` are also hoisted, but NOT initialized — accessing them before their declaration is a **Temporal Dead Zone (TDZ)** error:

```javascript
console.log(y); // ReferenceError: Cannot access 'y' before initialization
let y = 5;
// y exists in the scope (hoisted) but is in TDZ until the declaration line
```

---

## How Closures and Lexical Scope Work Together

Closures are only possible because of lexical scope. When a function is created, it captures a reference to its lexical environment (outer scope). That environment is defined by where the function appears in the source code.

```javascript
function makeMultiplier(factor) {
  // factor is in the lexical scope of the returned function
  return (number) => number * factor;
}

const triple = makeMultiplier(3); // factor = 3 captured at DEFINITION
const quadruple = makeMultiplier(4); // factor = 4 captured at DEFINITION

triple(5);    // 15 — factor is always 3 regardless of where triple is called
quadruple(5); // 20
```

---

## Shadowing

A variable in an inner scope can **shadow** (hide) a variable with the same name in an outer scope:

```javascript
const color = 'blue'; // outer

function paint() {
  const color = 'red'; // shadows outer color in this function
  console.log(color);  // 'red'
}

paint();
console.log(color); // 'blue' — outer unchanged
```

Shadowing is valid but can be confusing. `let`/`const` with the same name as outer scope is usually intentional. Avoid shadowing outer variables unless you have a clear reason.

---

## Global Scope vs Module Scope

In Node.js, each file is a **module** with its own module scope. Variables declared at the top level of a file are NOT global — they're module-scoped.

```javascript
// file-a.js
const x = 10; // module scope — NOT global
module.exports = x;

// file-b.js
const x = require('./file-a'); // gets 10
// No conflict with any x in file-b's own scope
```

True globals in Node.js must be explicitly attached:
```javascript
global.myGlobal = 'I am truly global'; // accessible everywhere — bad practice
```

---

## Practical Implications

### 1. Variable Lookup is Determined at Write Time

```javascript
function makeCounter() {
  let count = 0;
  return {
    get: () => count,     // lexically sees count from makeCounter
    inc: () => ++count    // same count reference
  };
}
```

### 2. Arrow Functions Inherit Outer this (Lexical this)

`this` inside an arrow function is determined lexically — not dynamically:

```javascript
class Timer {
  constructor() {
    this.seconds = 0;
  }

  start() {
    // Arrow function uses 'this' from start()'s lexical scope (the class instance)
    setInterval(() => {
      this.seconds++; // works correctly
    }, 1000);

    // Regular function would have wrong 'this'
    setInterval(function() {
      this.seconds++; // 'this' is undefined in strict mode (or global)
    }, 1000);
  }
}
```

---

## Interview Questions

**Q: What is the difference between lexical scope and dynamic scope?**
A: Lexical scope is determined at write time by the code structure. Dynamic scope is determined at runtime by the call stack. JavaScript uses lexical scope — where a function is defined determines what variables it can access, not where it is called from.

**Q: What is the scope chain?**
A: The scope chain is the sequence of environments a variable lookup travels through — from the current function's scope outward through all enclosing scopes to global scope. If not found anywhere, it's a ReferenceError.

**Q: What is the difference between var, let, and const scoping?**
A: `var` is function-scoped (or global), `let` and `const` are block-scoped. `var` is hoisted and initialized to `undefined`, `let`/`const` are hoisted but in the TDZ until their declaration line.

**Q: Can let/const be redeclared?**
A: No. `let` and `const` cannot be redeclared in the same scope. `var` can be redeclared (second declaration is ignored). `const` additionally cannot be reassigned after initialization.
