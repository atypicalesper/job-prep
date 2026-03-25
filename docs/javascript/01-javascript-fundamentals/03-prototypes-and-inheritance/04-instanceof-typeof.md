# instanceof and typeof

## typeof — Type Checking Primitive

`typeof` is a unary operator (not a function) that returns a string from a fixed set of possible values: `'undefined'`, `'boolean'`, `'number'`, `'string'`, `'symbol'`, `'bigint'`, `'function'`, and `'object'`. It is the primary tool for checking whether a variable holds a primitive value and for safely testing whether a variable has been declared at all (without risking a `ReferenceError`). It works well for primitives but has some notorious quirks.

```javascript
typeof 42           // 'number'
typeof 3.14         // 'number'
typeof NaN          // 'number' ← NaN is a number type!
typeof 'hello'      // 'string'
typeof true         // 'boolean'
typeof undefined    // 'undefined'
typeof Symbol('x')  // 'symbol'
typeof 42n          // 'bigint'
typeof function(){} // 'function'
typeof class {}     // 'function' ← classes are functions!
typeof {}           // 'object'
typeof []           // 'object' ← arrays are objects!
typeof null         // 'object' ← THE FAMOUS BUG!
```

### typeof null === 'object' — The Historical Bug

This is a bug from JavaScript's very first implementation in 1995. In the original C code, all values had a type tag:
- Objects: `000`
- null: `000` (null pointer, also 000)

So `typeof null` returns `'object'` by mistake. This was never fixed to maintain backward compatibility.

```javascript
// Always check for null explicitly:
function isObject(val) {
  return val !== null && typeof val === 'object';
}

isObject({});    // true
isObject([]);    // true (arrays are objects)
isObject(null);  // false ← correctly excluded
isObject('str'); // false
```

### typeof for Safe Existence Check

`typeof` is the only operator in JavaScript that can be safely applied to an undeclared variable. Accessing an undeclared variable in any other context throws a `ReferenceError`, but `typeof undeclaredVar` returns `'undefined'` instead. This makes `typeof` the correct tool for checking whether an optional global (like `window`, `process`, or a feature flag) exists in the current environment before using it.

```javascript
// ❌ Throws ReferenceError if variable not declared
if (undeclaredVar) { ... }

// ✅ typeof is safe — returns 'undefined' for undeclared
if (typeof undeclaredVar !== 'undefined') { ... }
// Or use optional chaining / globalThis:
if (typeof window !== 'undefined') { /* browser */ }
```

---

## instanceof — Prototype Chain Check

`instanceof` is a binary operator that tests inheritance by walking the left operand's prototype chain looking for the right operand's `.prototype` property. It answers the question "was this object created from this constructor, or from something that inherits from it?" It is the standard way to check class membership and naturally handles subclass relationships. Its main weakness is that it is realm-specific: each JavaScript execution context (iframe, vm module, Worker) has its own set of built-in constructors, so an object from one realm will fail `instanceof` checks against constructors from another realm.

`instanceof` checks if a constructor's `.prototype` exists anywhere in the object's prototype chain.

```javascript
class Animal {}
class Dog extends Animal {}
class Cat extends Animal {}

const fido = new Dog();

fido instanceof Dog;    // true — Dog.prototype in fido's chain
fido instanceof Animal; // true — Animal.prototype also in chain
fido instanceof Cat;    // false — Cat.prototype NOT in chain
fido instanceof Object; // true — Object.prototype always in chain
```

### How instanceof Works

Understanding `instanceof` as a prototype chain walk clarifies why it works for subclasses automatically (both `Dog.prototype` and `Animal.prototype` are in the chain of a Dog instance) and why modifying `Constructor.prototype` after instances have been created breaks `instanceof` for existing instances (their `__proto__` still points to the old prototype object).

```javascript
// instanceof A checks: does obj.__proto__ chain contain A.prototype?
// Manual implementation:
function myInstanceof(obj, Constructor) {
  let proto = Object.getPrototypeOf(obj);
  while (proto !== null) {
    if (proto === Constructor.prototype) return true;
    proto = Object.getPrototypeOf(proto);
  }
  return false;
}
```

### instanceof Pitfalls

**1. Cross-realm failure**
```javascript
// In Node.js, different vm contexts have different constructors
const vm = require('vm');
const arr = vm.runInNewContext('[]');

arr instanceof Array; // false! Different Array constructor
Array.isArray(arr);   // true — works across realms
```

**2. Primitive values**
```javascript
'hello' instanceof String; // false — primitive, not object
new String('hello') instanceof String; // true — object wrapper
```

**3. Custom Symbol.hasInstance**
```javascript
class EvenNumber {
  static [Symbol.hasInstance](n) {
    return typeof n === 'number' && n % 2 === 0;
  }
}

2 instanceof EvenNumber;  // true
3 instanceof EvenNumber;  // false
4 instanceof EvenNumber;  // true
```

---

## Array.isArray — The Right Way to Check Arrays

`Array.isArray` is a static method that was introduced specifically to solve the cross-realm `instanceof Array` problem. It checks the internal `[[Class]]` of the value rather than walking the prototype chain, making it reliable across iframes, vm contexts, and Workers. It is the canonical way to check whether a value is an array in production JavaScript.

```javascript
// ❌ typeof is wrong for arrays
typeof [] === 'object'; // true — but doesn't tell us it's an array

// ❌ instanceof fails across realms
[] instanceof Array; // true locally, but fails in cross-realm

// ✅ Array.isArray — works everywhere
Array.isArray([]);       // true
Array.isArray({});       // false
Array.isArray('hello'); // false
Array.isArray(null);    // false
```

---

## Object.prototype.toString — The Universal Type Checker

`Object.prototype.toString` is the most reliable type checking mechanism in JavaScript. When called via `.call(value)`, it returns the internal `[[toStringTag]]` of any value as a string in the form `'[object TypeName]'`. It correctly distinguishes `null`, `undefined`, `Array`, `Date`, `Map`, `Set`, `RegExp`, `Promise`, and many more — cases where `typeof` returns unhelpfully generic results. Libraries like Lodash and Angular use this technique internally for robust type detection.

The most reliable way to check types for all values:

```javascript
const tag = (val) => Object.prototype.toString.call(val);

tag(42);           // '[object Number]'
tag('hello')       // '[object String]'
tag(true)          // '[object Boolean]'
tag(null)          // '[object Null]' ← correctly identifies null
tag(undefined)     // '[object Undefined]'
tag([])            // '[object Array]'
tag({})            // '[object Object]'
tag(function(){})  // '[object Function]'
tag(new Date())    // '[object Date]'
tag(/regex/)       // '[object RegExp]'
tag(new Map())     // '[object Map]'
tag(new Set())     // '[object Set]'
tag(Symbol())      // '[object Symbol]'
tag(42n)           // '[object BigInt]'
tag(new Promise(() => {})) // '[object Promise]'

// Extract just the type:
function getType(val) {
  return Object.prototype.toString.call(val).slice(8, -1); // 'Number', 'Array', etc.
}
```

Why `.call(val)`? Because if you call `val.toString()` directly, the method might be overridden on the object. We use the original from `Object.prototype`.

---

## Reliable Type Checking Patterns

A comprehensive type-checking utility consolidates all the special cases in one place: `null` must be handled separately from objects, `NaN` must be handled separately from numbers, and arrays must be checked before objects. This is the kind of utility you write once and import everywhere, rather than re-implementing per-callsite.

```javascript
// Type checking utility
const is = {
  null:      (v) => v === null,
  undefined: (v) => v === undefined,
  nullish:   (v) => v == null,  // null OR undefined
  number:    (v) => typeof v === 'number' && !Number.isNaN(v),
  nan:       (v) => Number.isNaN(v),
  string:    (v) => typeof v === 'string',
  boolean:   (v) => typeof v === 'boolean',
  symbol:    (v) => typeof v === 'symbol',
  bigint:    (v) => typeof v === 'bigint',
  function:  (v) => typeof v === 'function',
  array:     (v) => Array.isArray(v),
  object:    (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  date:      (v) => v instanceof Date && !isNaN(v),
  promise:   (v) => v instanceof Promise || (v !== null && typeof v?.then === 'function'),
  regexp:    (v) => v instanceof RegExp,
};

is.array([1,2,3]);    // true
is.object({ a: 1 }); // true
is.object([]);        // false — array, not plain object
is.nan(NaN);          // true
is.number(NaN);       // false ← proper NaN handling
```

---

## NaN Gotcha

`NaN` (Not a Number) is a value of the `number` type that represents the result of an invalid numeric operation. It has two properties that make it uniquely difficult to test: `typeof NaN === 'number'` (counterintuitively typed as a number), and `NaN !== NaN` (the only JavaScript value not equal to itself). The correct check is `Number.isNaN()`, not the global `isNaN()` which coerces its argument and returns misleading results for non-numeric inputs.

```javascript
typeof NaN; // 'number' — NaN is a "number" type!
NaN === NaN; // false — NaN is not equal to itself!

// ❌ Wrong ways to check NaN
if (value === NaN) { } // never true
if (value !== value) { } // works but unreadable

// ✅ Right ways
Number.isNaN(NaN);       // true
Number.isNaN(undefined); // false (unlike global isNaN which coerces)
Number.isNaN('hello');   // false
isNaN('hello');          // true ← global isNaN coerces first (misleading)

// Object.is handles NaN correctly
Object.is(NaN, NaN);  // true
Object.is(0, -0);     // false (=== considers them equal!)
```

---

## Interview Questions

**Q: What does `typeof null === 'object'` mean and why?**
A: It's a historical bug from JavaScript's initial implementation where null's bit pattern matched the object type tag. It was never fixed for backward compatibility. Always check `value !== null && typeof value === 'object'` to safely identify objects.

**Q: Why doesn't `instanceof` work across iframes or vm contexts?**
A: Each iframe/vm context has its own set of built-in constructors. An Array from frame A has a different `Array.prototype` than frame B, so `instanceof Array` from frame B fails. Use `Array.isArray()` or `Object.prototype.toString` for cross-realm checks.

**Q: What's the safest way to check if something is a plain object?**
A:
```javascript
function isPlainObject(v) {
  if (typeof v !== 'object' || v === null) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}
```

**Q: Why does `typeof function(){}` return 'function' instead of 'object'?**
A: Functions are objects in JS, but they have a `[[Call]]` internal method. The spec says `typeof` returns `'function'` for callable objects as a special case. This helps distinguish functions from regular objects.
