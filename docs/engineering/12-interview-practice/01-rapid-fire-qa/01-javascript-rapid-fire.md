# JavaScript — 50 Rapid-Fire Q&A

---

**Q1: What is the output?**
```javascript
console.log(typeof null);
```
`"object"` — this is a historic bug in JavaScript, never fixed for backwards compatibility.

---

**Q2: What is the difference between `==` and `===`?**
`===` is strict equality — no type coercion. `==` coerces types: `'5' == 5` is `true`, `null == undefined` is `true`, but `null === undefined` is `false`.

---

**Q3: Is `NaN === NaN`?**
`false` — NaN is the only value not equal to itself. Use `Number.isNaN(val)` to check (not the global `isNaN` which coerces).

---

**Q4: What does `0.1 + 0.2 === 0.3` evaluate to?**
`false` — floating-point precision issue (`0.1 + 0.2 = 0.30000000000000004`). Use `Math.abs(a - b) < Number.EPSILON`.

---

**Q5: What is hoisting?**
Variable and function declarations are "moved" to the top of their scope before execution. `var` declarations are hoisted and initialized as `undefined`. `function` declarations are fully hoisted (function + body). `let`/`const`/`class` are hoisted but not initialized (TDZ).

---

**Q6: What is the TDZ (Temporal Dead Zone)?**
The period between when a `let`/`const` variable enters scope and when it's initialized. Accessing it throws `ReferenceError`. This is why `let` doesn't have the same hoisting behavior issues as `var`.

---

**Q7: What is the difference between `null` and `undefined`?**
`undefined` = variable declared but not assigned, function returns nothing, object property doesn't exist. `null` = intentional absence of value (you explicitly set it). `typeof undefined === 'undefined'`, `typeof null === 'object'`.

---

**Q8: What is a closure?**
A function that remembers variables from its outer scope even after the outer function has returned. Closures are created whenever a function is defined inside another function and accesses the outer function's variables.

---

**Q9: What does `this` refer to in an arrow function?**
Arrow functions don't have their own `this` — they capture `this` from the surrounding lexical scope at definition time. This is why arrow functions are often used for callbacks inside classes.

---

**Q10: What is the output?**
```javascript
const obj = {
  x: 10,
  getX: function() { return this.x; },
  getXArrow: () => this.x
};
console.log(obj.getX());      // ?
console.log(obj.getXArrow()); // ?
```
`10` (regular function: `this` = `obj`), `undefined` (arrow: `this` = global/undefined in strict mode).

---

**Q11: What is event delegation?**
Attaching one event listener to a parent element instead of N listeners on N child elements. Events bubble up from child to parent. More memory efficient, works with dynamically added elements.

---

**Q12: What is the difference between `call`, `apply`, and `bind`?**
All set `this` explicitly. `call(thisArg, arg1, arg2)` — calls immediately with individual args. `apply(thisArg, [arg1, arg2])` — calls immediately with array. `bind(thisArg, arg1)` — returns a new function with `this` bound (doesn't call).

---

**Q13: What is a Promise?**
An object representing an eventual value: pending → fulfilled or rejected. Allows chaining async operations with `.then()` and `.catch()`. Better than callbacks for avoiding callback hell.

---

**Q14: What is `async/await`?**
Syntactic sugar over Promises. `async` marks a function as returning a Promise. `await` pauses execution until the Promise resolves. Makes async code look synchronous. Errors can be caught with `try/catch`.

---

**Q15: What is the difference between `Promise.all` and `Promise.allSettled`?**
`Promise.all` — fails fast: rejects as soon as any promise rejects. `Promise.allSettled` — waits for all, never rejects, returns `{status: 'fulfilled'|'rejected', value|reason}` for each.

---

**Q16: What is the output?**
```javascript
async function main() {
  console.log(1);
  await Promise.resolve();
  console.log(2);
}
console.log(3);
main();
console.log(4);
```
`3`, `1`, `4`, `2` — `console.log(3)` before calling main, then main runs `1`, hits await (microtask), `4` runs, then microtask queue: `2`.

---

**Q17: What is event loop?**
The mechanism that allows Node.js/browsers to perform non-blocking operations. Continuously checks: if call stack is empty, pick next task from queue. Microtasks (Promises, queueMicrotask) run before macrotasks (setTimeout, setInterval, I/O).

---

**Q18: What is the prototype chain?**
Every object has a `__proto__` pointing to its prototype. Property lookup traverses the chain until found or until `null` is reached. `Object.prototype.__proto__ === null` — end of chain.

---

**Q19: What does `Object.create(null)` do?**
Creates an object with no prototype. Useful for pure dictionaries — no inherited properties like `toString`, `hasOwnProperty`, `constructor`. Immune to prototype pollution.

---

**Q20: What is the output?**
```javascript
[1, 2, 3].map(parseInt)
```
`[1, NaN, NaN]` — `map` passes `(element, index, array)`. `parseInt('1', 0)` = 1, `parseInt('2', 1)` = NaN (base 1 invalid), `parseInt('3', 2)` = NaN ('3' is not valid in base 2).

---

**Q21: What is destructuring?**
Extracting values from arrays/objects into variables. `const { a, b } = obj`, `const [x, y] = arr`. Can have defaults: `const { a = 10 } = {}`. Can rename: `const { a: myA } = obj`.

---

**Q22: What is the spread operator?**
`...` spreads an iterable into individual elements. Array: `[...arr1, ...arr2]`. Object: `{ ...obj1, ...obj2 }` (shallow copy + merge). Function call: `fn(...args)`. Rest params: `function fn(...args)` — collects remaining.

---

**Q23: What is a generator?**
A function that can pause execution with `yield` and resume from where it paused. Returns an iterator. Useful for lazy sequences, async flows, co-routines.

---

**Q24: What is the difference between `for...in` and `for...of`?**
`for...in` iterates over enumerable property keys (including inherited). `for...of` iterates over iterable values (arrays, strings, Maps, Sets, generators). Use `for...of` for arrays to avoid prototype property issues.

---

**Q25: What is WeakMap?**
A Map where keys must be objects and are held weakly — if no other reference to the key exists, it can be garbage collected. Good for private data storage on objects without preventing GC.

---

**Q26: What is the output?**
```javascript
let a = { x: 1 };
let b = a;
b.x = 2;
console.log(a.x); // ?
```
`2` — objects are assigned by reference. `a` and `b` point to the same object. Modifying via `b` affects `a`.

---

**Q27: What is a pure function?**
A function that: (1) always returns the same output for the same input, (2) has no side effects (doesn't modify external state). Examples: `Math.sqrt`, `Array.map`. Important for testability and predictability.

---

**Q28: What is memoization?**
Caching the result of a function for given inputs to avoid recomputing. `const memo = new Map(); if (memo.has(n)) return memo.get(n);`. Useful for expensive pure functions called repeatedly.

---

**Q29: What is the difference between `slice` and `splice`?**
`slice(start, end)` — returns new array, non-mutating. `splice(start, deleteCount, ...items)` — mutates original, returns removed elements, can insert. Mnemonic: splice = modify in place.

---

**Q30: What is `Symbol` used for?**
Creates unique, non-string property keys that don't appear in `for...in` or `JSON.stringify`. Used for "private-ish" properties, well-known symbols (`Symbol.iterator`, `Symbol.toPrimitive`), preventing name collisions in libraries.

---

**Q31: What does `use strict` do?**
Enables strict mode: prevents using undeclared variables, `this` is `undefined` in global functions (not window), prevents `delete` on non-configurable properties, prohibits duplicate parameter names, etc.

---

**Q32: What is currying?**
Transforming a function that takes multiple arguments into a sequence of functions each taking one argument. `curry(f)(a)(b)(c)` vs `f(a, b, c)`. Useful for partial application.

---

**Q33: What is the output?**
```javascript
function outer() {
  var x = 10;
  function inner() {
    console.log(x);
    var x = 20;
  }
  inner();
}
outer();
```
`undefined` — `var x` inside `inner` is hoisted to the top of `inner`, so at `console.log(x)`, x is declared (hoisted) but not yet assigned.

---

**Q34: What is tail call optimization?**
When the last operation in a function is a recursive call, some JS engines can reuse the same stack frame instead of creating a new one. Prevents stack overflow for deep recursion. ES6 specifies it; V8 partially implemented it.

---

**Q35: What is the difference between `Object.freeze` and `const`?**
`const` prevents reassignment of the variable binding. `Object.freeze` prevents modification of the object's properties. `const obj = {}`; you can still do `obj.x = 1`. After `Object.freeze(obj)`, `obj.x = 1` fails silently (or throws in strict mode). Both are shallow.

---

**Q36: What is optional chaining (`?.`)?**
`obj?.prop` — returns `undefined` if `obj` is `null`/`undefined` instead of throwing. `arr?.[0]`, `fn?.()`. Short-circuits: `a?.b?.c` — stops at first nullish value.

---

**Q37: What is nullish coalescing (`??`)?**
`a ?? b` — returns `b` if `a` is `null` or `undefined` (NOT if falsy). Differs from `||`: `0 ?? 'default'` = `0`, but `0 || 'default'` = `'default'`.

---

**Q38: What is the output?**
```javascript
console.log(1 < 2 < 3);
console.log(3 > 2 > 1);
```
`true`, `false` — left to right evaluation: `1 < 2` = `true`, `true < 3` = `1 < 3` = `true`. `3 > 2` = `true`, `true > 1` = `1 > 1` = `false`.

---

**Q39: What is `structuredClone`?**
Native deep copy method (Node.js 17+, browsers). Better than `JSON.parse(JSON.stringify())`: handles `Date`, `Map`, `Set`, `ArrayBuffer`, circular references (throws on circular), but not `Function` or `undefined`.

---

**Q40: What is the `in` operator?**
`'key' in obj` — checks if property exists on object OR its prototype chain. `0 in [1,2,3]` = `true` (checks index 0). Different from `obj.hasOwnProperty('key')` which only checks own properties.

---

**Q41: What is computed property syntax?**
```javascript
const key = 'name';
const obj = { [key]: 'Alice' }; // { name: 'Alice' }
```
Square brackets evaluate an expression as the property key at runtime.

---

**Q42: What is the difference between `Array.from` and spread?**
`Array.from` can take a mapping function: `Array.from({length: 5}, (_, i) => i)` = `[0,1,2,3,4]`. Spread `[...iterable]` doesn't take a mapper. Both convert iterables to arrays.

---

**Q43: What is `setTimeout(fn, 0)` used for?**
Defers execution to the next iteration of the event loop (macrotask). Used to allow the browser to repaint, break up long computations, or run code after current synchronous code completes.

---

**Q44: What is the output?**
```javascript
const arr = [1, [2, [3, [4]]]];
console.log(arr.flat());    // ?
console.log(arr.flat(Infinity)); // ?
```
`[1, 2, [3, [4]]]` (one level), `[1, 2, 3, 4]` (all levels).

---

**Q45: What is `Array.prototype.reduce`?**
Reduces array to a single value by running an accumulator function over each element. `[1,2,3].reduce((acc, n) => acc + n, 0)` = `6`. Starting value is the second argument (important to always provide it).

---

**Q46: What does `delete` do?**
Removes a property from an object: `delete obj.prop`. Returns `true` on success, `false` if property is non-configurable. Does NOT work on variables (`delete x` is invalid/no-op). Does NOT free memory — GC handles that.

---

**Q47: What is the `arguments` object?**
A pseudo-array inside non-arrow functions containing all passed arguments. Not a real array (no `.map`, `.filter`). Modern alternative: rest params `function fn(...args)` which IS a real array. Not available in arrow functions.

---

**Q48: What is `Object.keys` vs `Object.entries` vs `Object.values`?**
`keys` → array of own enumerable property names. `values` → array of own enumerable property values. `entries` → array of `[key, value]` pairs. All ignore inherited/non-enumerable properties. None of them include Symbol keys.

---

**Q49: What is the output?**
```javascript
Promise.resolve(1)
  .then(x => x + 1)
  .then(x => { throw new Error('boom'); })
  .catch(e => e.message)
  .then(msg => console.log(msg));
```
`'boom'` — `.then` passes value forward, `.catch` catches the thrown error and returns its message, final `.then` logs it.

---

**Q50: What is the difference between synchronous and asynchronous iteration?**
`for...of` with regular iterables is synchronous. `for await...of` works with async iterables (objects with `[Symbol.asyncIterator]`). Useful for reading streams: `for await (const chunk of readableStream)`. Each iteration awaits the next value before continuing.
