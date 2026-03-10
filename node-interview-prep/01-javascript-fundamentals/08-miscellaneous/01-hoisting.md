# Hoisting

## What is Hoisting?

Hoisting is JavaScript's behavior of moving **declarations** (not initializations) to the top of their scope before code execution. This is done by the JS engine during the compilation phase.

---

## var Hoisting — Declaration Only

`var` declarations are hoisted to the top of their function (or global) scope and initialized to `undefined`.

```javascript
console.log(x); // undefined (NOT ReferenceError!)
var x = 5;
console.log(x); // 5

// Equivalent to what the engine sees:
var x;           // hoisted declaration
console.log(x); // undefined
x = 5;
console.log(x); // 5
```

```javascript
function example() {
  console.log(a); // undefined — var 'a' is hoisted to function top
  if (true) {
    var a = 10;   // declaration hoisted OUT of the if block
  }
  console.log(a); // 10
}
```

---

## Function Declaration Hoisting — Fully Hoisted

Function declarations are **fully hoisted** — both the declaration AND the definition.

```javascript
// Can call before declaration!
greet('Alice'); // 'Hello, Alice' — works!

function greet(name) {
  return `Hello, ${name}`;
}
```

Function declarations are hoisted above `var`:

```javascript
console.log(typeof foo); // 'function' — not 'undefined'
var foo = 'variable';
function foo() {}
// In hoisting order: function foo comes FIRST
```

---

## let and const — Temporal Dead Zone (TDZ)

`let` and `const` ARE hoisted (they're known to the scope), but they're NOT initialized. Accessing them before their declaration throws a `ReferenceError` — this period is the **Temporal Dead Zone**.

```javascript
console.log(x); // ReferenceError: Cannot access 'x' before initialization
let x = 5;

// The variable 'x' EXISTS in scope (hoisted) but is in TDZ
// until the declaration line is reached

// Another TDZ example:
{
  console.log(x); // ReferenceError — in TDZ
  let x = 10;
  console.log(x); // 10 — TDZ ended
}
```

```javascript
// typeof also throws for TDZ (unlike var which returns 'undefined'):
typeof undeclaredVar; // 'undefined' — safe
typeof tdzVar;        // ReferenceError — if let tdzVar later in scope
let tdzVar = 1;
```

---

## Function Expression vs Function Declaration

```javascript
// ❌ Function expression NOT hoisted (only var declaration is):
console.log(greet); // undefined
greet('Alice');     // TypeError: greet is not a function

var greet = function(name) {
  return `Hello, ${name}`;
};

// ✅ Function declaration IS hoisted:
greet('Alice'); // Works!
function greet(name) {
  return `Hello, ${name}`;
}
```

Arrow functions are function expressions — same rules apply:

```javascript
sayHi(); // TypeError: sayHi is not a function
var sayHi = () => 'hi';
```

---

## Class Hoisting — TDZ Like let/const

Classes are hoisted but in the TDZ — like `let`:

```javascript
const obj = new MyClass(); // ReferenceError: Cannot access 'MyClass' before initialization
class MyClass {}

// Use the class after declaration:
class Dog {}
const rex = new Dog(); // OK
```

---

## Hoisting Order

When multiple declarations exist, the order matters:

```javascript
console.log(foo); // [Function: foo]
var foo = 'variable';
function foo() {}

// Hoisting order:
// 1. Function declarations first
// 2. var declarations (if variable already declared as function, skip)
// 3. Assignments happen in code order
```

Another example:

```javascript
var x = 1;
function x() {}
console.log(x); // 1 — assignment overwrites the function

// Hoisting: function x declared, then var x (skipped — already declared)
// Then: x = 1 (assignment)
```

---

## Practical Implications

```javascript
// ❌ var in conditionals — unpredictable hoisting:
function maybeCreate(flag) {
  if (flag) {
    var result = 'created'; // hoisted to function top!
  }
  return result; // accessible! But undefined if flag is false
}

maybeCreate(true);  // 'created'
maybeCreate(false); // undefined (not ReferenceError)

// ✅ let — scoped to block:
function maybeCreate(flag) {
  if (flag) {
    let result = 'created'; // block-scoped
  }
  return result; // ReferenceError if flag is false
}
```

---

## Interview Questions

**Q: What is hoisting?**
A: The JS engine's behavior of processing variable and function declarations before executing code. Declarations are "moved to the top" of their scope. `var` is hoisted and initialized to `undefined`. Function declarations are fully hoisted (definition included). `let`/`const`/`class` are hoisted but NOT initialized (TDZ).

**Q: What is the Temporal Dead Zone?**
A: The period between the start of a block scope and the actual `let`/`const`/`class` declaration line. During TDZ, the variable is known to the scope (hoisted) but cannot be accessed — doing so throws a `ReferenceError`.

**Q: Why do function declarations hoist but function expressions don't?**
A: The declaration form (`function foo() {}`) tells the engine "this name refers to this function." Expressions (`var foo = function() {}`) declare the variable first (`var foo` is hoisted to `undefined`), then assign the function as a value at runtime.

**Q: What's the output?**
```javascript
var x = 1;
function test() {
  console.log(x);
  var x = 2;
  console.log(x);
}
test();
```
A: `undefined` then `2`. The `var x` inside `test` is hoisted to the top of `test`, creating a local `x`. The first `console.log` sees the local `x` (before assignment) = `undefined`.
