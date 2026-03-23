# JavaScript Miscellaneous — Tricky Interview Questions

---

## Q1: Hoisting Order

```javascript
console.log(typeof foo);
var foo = 'string';
function foo() {}
console.log(typeof foo);
```

**Output:** `'function'` then `'string'`

**Why:** Function declarations hoist above `var`. After hoisting: `function foo` is declared first. Then `var foo` is ignored (already declared). At runtime: `typeof foo` = `'function'`. Then `foo = 'string'` assignment executes. Second `typeof foo` = `'string'`.

---

## Q2: TDZ Scope

```javascript
let x = 1;
{
  console.log(x); // ?
  let x = 2;
}
```

**Output:** `ReferenceError: Cannot access 'x' before initialization`

**Why:** Inside the block, `let x = 2` creates a NEW `x` scoped to the block. This `x` is in TDZ until line `let x = 2`. Even though outer `x = 1` exists, the inner declaration "shadows" it — but is in TDZ.

---

## Q3: Coercion Surprise

```javascript
console.log(1 + '2' + 3);
console.log(1 + 2 + '3');
console.log(+'3' + 3);
console.log([] + []);
console.log([] + {});
console.log({} + []);
```

**Outputs:**
- `'123'` — `1 + '2'` = `'12'`, `'12' + 3` = `'123'`
- `'33'` — `1 + 2` = `3`, `3 + '3'` = `'33'`
- `6` — unary `+` converts `'3'` to `3`, `3 + 3 = 6`
- `''` — `[] → ''`, `'' + ''` = `''`
- `'[object Object]'` — `[] → ''`, `{} → '[object Object]'`, `'' + '[object Object]'`
- `0` — `{}` treated as EMPTY BLOCK in statement context, `+[]` = `+''` = `0`

---

## Q4: NaN Comparison

```javascript
console.log(NaN === NaN);
console.log(NaN == NaN);
console.log(isNaN('hello'));
console.log(Number.isNaN('hello'));
console.log(Number.isNaN(NaN));
```

**Outputs:** `false`, `false`, `true`, `false`, `true`

**Why:** NaN is never equal to itself. `isNaN()` coerces first (`'hello'` → NaN → true). `Number.isNaN()` only returns true if the value IS the actual NaN number value.

---

## Q5: typeof on Undeclared Variable

```javascript
console.log(typeof undeclaredVariable);
console.log(undeclaredVariable);
```

**Output:** `'undefined'` then `ReferenceError`

**Why:** `typeof` is safe — doesn't throw for undeclared variables, returns `'undefined'`. Direct access to an undeclared variable throws `ReferenceError`.

---

## Q6: Object Equality

```javascript
const a = {};
const b = {};
const c = a;

console.log(a === b); // ?
console.log(a === c); // ?
console.log(a == b);  // ?
```

**Output:** `false`, `true`, `false`

**Why:** `a` and `b` are different objects in memory. `c` references the same object as `a`. `==` with objects compares references, not content.

---

## Q7: for...in Surprises

```javascript
const arr = [1, 2, 3];
arr.foo = 'bar'; // add non-index property

for (const i in arr) {
  console.log(i);
}
```

**Output:** `'0'`, `'1'`, `'2'`, `'foo'`

**Why:** `for...in` enumerates ALL enumerable properties including non-index ones. This is why you should never use `for...in` for arrays. Use `for...of`, `forEach`, or standard `for` loop.

---

## Q8: Comma Operator

```javascript
const x = (1, 2, 3, 4, 5);
console.log(x); // ?

let a = 0;
for (let i = 0, j = 10; i < 3; i++, j--) {
  a += i + j;
}
console.log(a); // ?
```

**Output:** `5` and `33`

**Why:** The comma operator evaluates each expression and returns the LAST. `(1,2,3,4,5)` returns `5`.
Loop: `(0+10) + (1+9) + (2+8)` = `10 + 10 + 10` = Wait, j starts at 10:
- i=0, j=10: a += 0+10 = 10
- i=1, j=9: a += 1+9 = 10 → total 20
- i=2, j=8: a += 2+8 = 10 → total 30

Hmm, `a = 30`. Let me recount: `0+10=10`, `1+9=10`, `2+8=10`. Total=30. Output: `5` and `30`.

---

## Q9: Short-Circuit Evaluation

```javascript
const a = null;
const b = a || 'default';
const c = a && a.value;
const d = a ?? 'fallback';
const e = 0 || 'fallback';
const f = 0 ?? 'fallback';
```

**Values:** `'default'`, `null`, `'fallback'`, `'fallback'`, `0`

- `||` returns first truthy or last value (`null` is falsy → `'default'`)
- `&&` returns first falsy or last value (`null` is falsy → `null`)
- `??` (nullish coalescing) returns right side only if left is `null`/`undefined`
- `0 || 'fallback'` → `'fallback'` (0 is falsy)
- `0 ?? 'fallback'` → `0` (0 is NOT null/undefined)

---

## Q10: delete Operator

```javascript
const obj = { a: 1, b: 2 };
delete obj.a;
console.log(obj); // ?

const arr = [1, 2, 3];
delete arr[1];
console.log(arr); // ?
console.log(arr.length); // ?
```

**Output:**
- `{ b: 2 }`
- `[1, empty, 3]` (sparse array — index 1 is deleted, not shifted)
- `3` — length unchanged!

---

## Q11: void Operator

```javascript
console.log(void 0);      // ?
console.log(void 'hello'); // ?
console.log(void(1 + 2)); // ?
```

**Output:** `undefined`, `undefined`, `undefined`

`void expression` evaluates the expression and always returns `undefined`. Common use: `void 0` as a safe way to get `undefined` (before `undefined` could be reassigned in old JS).

---

## Q12: Object Property Shorthand

```javascript
const x = 1, y = 2;
const obj = { x, y }; // shorthand
console.log(obj); // ?

function makeObj(name, age) {
  return { name, age }; // shorthand
}
console.log(makeObj('Alice', 30)); // ?
```

**Output:** `{ x: 1, y: 2 }`, `{ name: 'Alice', age: 30 }`

---

## Q13: Optional Chaining Edge Cases

```javascript
const user = { profile: null };

console.log(user?.profile?.name);  // ?
console.log(user?.profile?.name ?? 'Anonymous'); // ?
console.log(user?.scores?.[0]);   // ?
console.log(user?.getScore?.());  // ?
```

**Output:** `undefined`, `'Anonymous'`, `undefined`, `undefined`

Optional chaining short-circuits and returns `undefined` without throwing when it hits `null`/`undefined`.

---

## Q14: Destructuring Default Values

```javascript
const { a = 1, b = 2, c = 3 } = { a: 10, b: null };
console.log(a, b, c); // ?
```

**Output:** `10 null 3`

**Why:** Default values kick in only when the value is `undefined`. `b: null` — null is NOT undefined, so the default `2` is NOT used. `c` is not in the source object → `undefined` → default `3` used.

---

## Q15: Computed Property Keys

```javascript
const key = 'name';
const prefix = 'user';

const obj = {
  [key]: 'Alice',
  [`${prefix}Id`]: 42,
  [Symbol.iterator]() { return this; }
};

console.log(obj.name);   // ?
console.log(obj.userId); // ?
```

**Output:** `'Alice'`, `42`

---

## Q16: String vs String Object

```javascript
const str1 = 'hello';
const str2 = new String('hello');

console.log(typeof str1); // ?
console.log(typeof str2); // ?
console.log(str1 === str2); // ?
console.log(str1 == str2);  // ?
```

**Output:** `'string'`, `'object'`, `false`, `true`

`new String()` creates an object wrapper. `typeof` = `'object'`. `===` fails (different types). `==` converts the String object to primitive `'hello'` then compares.

---

## Q17: Chained Ternary

```javascript
const score = 75;
const grade = score >= 90 ? 'A'
            : score >= 80 ? 'B'
            : score >= 70 ? 'C'
            : score >= 60 ? 'D'
            : 'F';
console.log(grade); // ?
```

**Output:** `'C'` (75 >= 70 is first true condition)

---

## Q18: Symbol Equality

```javascript
const s1 = Symbol('desc');
const s2 = Symbol('desc');
const s3 = s1;

console.log(s1 === s2); // ?
console.log(s1 === s3); // ?
console.log(typeof s1); // ?
```

**Output:** `false`, `true`, `'symbol'`

Symbols are always unique — `Symbol('desc')` creates a new unique symbol each time. `s3` references the same symbol as `s1`.

---

## Q19: Array Holes (Sparse Arrays)

```javascript
const arr = [1, , 3]; // hole at index 1
console.log(arr.length);    // ?
console.log(arr[1]);        // ?
console.log(1 in arr);      // ?
console.log(arr.map(x => x * 2)); // ?
```

**Output:** `3`, `undefined`, `false`, `[2, empty, 6]`

Array holes are different from `undefined` — `1 in arr` is `false` (property doesn't exist). `map`/`forEach`/`filter` skip holes.

---

## Q20: typeof vs instanceof for Primitives

```javascript
console.log(typeof 42 === 'number');           // ?
console.log(42 instanceof Number);             // ?
console.log(new Number(42) instanceof Number); // ?
console.log(typeof new Number(42));            // ?
```

**Output:** `true`, `false`, `true`, `'object'`

Primitive `42` is not an instance of `Number` — it's not an object. `new Number(42)` creates an object wrapper — IS an instance of Number, but `typeof` returns `'object'`.

---

## Q21: [1, 2, 3].map(parseInt) — The Classic Trap

```javascript
console.log([1, 2, 3].map(parseInt));
```

**Output:** `[1, NaN, NaN]`

**Why:** `map` calls `parseInt(element, index, array)`. So it becomes:
- `parseInt('1', 0)` → radix 0 means 10 → `1`
- `parseInt('2', 1)` → radix 1 is invalid → `NaN`
- `parseInt('3', 2)` → base 2, but `'3'` is not a valid binary digit → `NaN`

**Fix:**
```javascript
[1, 2, 3].map(Number)   // [1, 2, 3]
[1, 2, 3].map(n => parseInt(n, 10)) // [1, 2, 3]
```

---

## Q22: Floating Point Gotcha

```javascript
console.log(0.1 + 0.2);
console.log(0.1 + 0.2 === 0.3);
console.log(0.1 + 0.2 === 0.30000000000000004);
```

**Output:** `0.30000000000000004`, `false`, `true`

**Why:** IEEE 754 double-precision floating point cannot represent 0.1 or 0.2 exactly. They're recurring fractions in binary.

**Fix:**
```javascript
// Option 1: epsilon comparison
Math.abs(0.1 + 0.2 - 0.3) < Number.EPSILON  // true

// Option 2: round to known precision
parseFloat((0.1 + 0.2).toFixed(10)) === 0.3  // true

// Option 3: work in integers
(10 + 20) / 100 === 30 / 100  // true
```

---

## Q23: [] == ![] is true

```javascript
console.log([] == ![]);
console.log([] == false);
console.log([] == 0);
console.log('' == false);
```

**Output:** `true`, `true`, `true`, `true`

**Why — step by step:**
1. `![]` → `false` (empty array is truthy, `!truthy` = `false`)
2. `[] == false` → Abstract equality: `false` → `0`, `[]` → `''` → `0`
3. `0 == 0` → `true`

**Coercion chain:**
```
[] == ![]
[] == false        // ![] is false
[] == 0            // false → Number → 0
'' == 0            // [] → '' (Array.prototype.toString)
0  == 0            // '' → Number → 0
true               // ✓
```

This is why `===` (strict equality) exists. Never use `==` with objects.

---

## Q24: Sort Is Lexicographic by Default

```javascript
const nums = [10, 9, 2, 1, 100, 20];
console.log(nums.sort());
console.log([1, 30, 4, 21].sort());
```

**Output:** `[1, 10, 100, 2, 20, 9]` and `[1, 21, 30, 4]`

**Why:** `Array.prototype.sort()` converts elements to strings and sorts lexicographically (character by character). `'10' < '9'` because `'1' < '9'`.

**Fix:**
```javascript
nums.sort((a, b) => a - b);   // ascending:  [1, 2, 9, 10, 20, 100]
nums.sort((a, b) => b - a);   // descending: [100, 20, 10, 9, 2, 1]

// String sort (locale-aware):
['banana', 'Apple', 'cherry'].sort((a, b) => a.localeCompare(b));
// ['Apple', 'banana', 'cherry']
```

---

## Q25: JSON.stringify Silently Drops Values

```javascript
const obj = {
  a: 1,
  b: undefined,
  c: function() {},
  d: Symbol('id'),
  e: null,
  f: NaN,
  g: Infinity,
};

console.log(JSON.stringify(obj));
```

**Output:** `{"a":1,"e":null,"f":null,"g":null}`

**Why:**
- `undefined`, functions, Symbols → **omitted** from objects (silently dropped)
- `NaN`, `Infinity` → converted to `null`
- `null` → kept as `null`

**In arrays:**
```javascript
JSON.stringify([undefined, function(){}, Symbol(), null, NaN])
// '[null,null,null,null,null]'
// undefined/function/Symbol in arrays → null (can't omit array slots)
```

**Circular reference:**
```javascript
const a = {};
a.self = a;
JSON.stringify(a); // TypeError: Converting circular structure to JSON
```

---

## Q26: Object.assign Is Shallow

```javascript
const target = { a: 1, nested: { x: 10 } };
const source = { b: 2, nested: { y: 20 } };
const result = Object.assign({}, target, source);

console.log(result);
result.nested.y = 99;
console.log(source.nested.y); // ?
```

**Output:** `{ a: 1, nested: { y: 20 }, b: 2 }` then `99`

**Why:** `Object.assign` copies property references, not deep copies. `result.nested` and `source.nested` point to the SAME object. Mutating one mutates the other.

Same applies to spread: `{ ...target, ...source }` is also shallow.

**Deep clone options:**
```javascript
// 1. structuredClone (native, handles most types)
const deep = structuredClone(obj);

// 2. JSON round-trip (loses undefined/functions/Dates become strings)
const deep = JSON.parse(JSON.stringify(obj));

// 3. Lodash _.cloneDeep
```

---

## Q27: Arguments Object vs Rest Parameters

```javascript
function withArguments() {
  console.log(arguments);
  console.log(Array.isArray(arguments));
  const arr = Array.from(arguments);
  return arr.reduce((a, b) => a + b, 0);
}

const withRest = (...args) => {
  console.log(args);
  console.log(Array.isArray(args));
  return args.reduce((a, b) => a + b, 0);
};

withArguments(1, 2, 3);
withRest(1, 2, 3);
```

**Output:**
```
[Arguments] { '0': 1, '1': 2, '2': 3 }
false
[1, 2, 3]
true
```

**Key differences:**
| Feature | `arguments` | `...rest` |
|---------|------------|-----------|
| Type | array-like object | real Array |
| Arrow functions | ❌ not available | ✅ works |
| Has `.map/.filter` | ❌ no | ✅ yes |
| Contains all args | always | from rest position on |

---

## Q28: Getter Is Evaluated Lazily

```javascript
const obj = {
  get now() {
    return Date.now();
  },
  cached: Date.now(), // evaluated once at definition
};

const t1 = obj.now;
const t2 = obj.now;
console.log(t1 === t2);       // ?
console.log(obj.cached === obj.cached); // ?
```

**Output:** `false`, `true`

`obj.now` calls the getter each time — returns a fresh `Date.now()` on every access. `obj.cached` is a plain property set once.

```javascript
// Memoized getter with defineProperty:
const obj2 = {};
Object.defineProperty(obj2, 'expensive', {
  get() {
    const value = computeExpensiveThing();
    Object.defineProperty(this, 'expensive', { value, writable: false });
    return value;
  },
  configurable: true,
});
// First access: computes. Subsequent: returns cached value.
```

---

## Q29: typeof class Returns 'function'

```javascript
class Foo {}
console.log(typeof Foo);           // ?
console.log(typeof Foo.prototype); // ?
console.log(typeof new Foo());     // ?
console.log(Foo instanceof Function); // ?
```

**Output:** `'function'`, `'object'`, `'object'`, `true`

Classes are syntactic sugar over constructor functions. `typeof` a class is `'function'`. The class itself is a `Function` instance.

---

## Q30: Prototype Pollution via __proto__

```javascript
const userInput = '{"__proto__": {"isAdmin": true}}';
const parsed = JSON.parse(userInput);
const obj = Object.assign({}, parsed);

console.log(obj.isAdmin);          // ?
console.log({}.isAdmin);           // ?
```

**Output:** `undefined`, `undefined`

`JSON.parse` does NOT pollute prototypes — it creates own properties. `Object.assign` copies the `__proto__` key as a string key (not as the prototype setter because source is a plain object from JSON.parse — the `__proto__` is a regular string-keyed property here).

**Actual pollution (the real danger):**
```javascript
// THIS is dangerous:
const malicious = JSON.parse('{"__proto__": {"isAdmin": true}}');
Object.assign(Object.prototype, malicious.__proto__); // explicit merge = polluted!
console.log({}.isAdmin); // true — all objects polluted!

// Safe merge:
const safe = Object.assign(Object.create(null), parsed); // null prototype
```

---

## Q31: in Operator Checks Prototype Chain

```javascript
function Animal(name) {
  this.name = name;
}
Animal.prototype.type = 'animal';

const dog = new Animal('Rex');

console.log('name' in dog);          // ?
console.log('type' in dog);          // ?
console.log(dog.hasOwnProperty('name')); // ?
console.log(dog.hasOwnProperty('type')); // ?
```

**Output:** `true`, `true`, `true`, `false`

`in` checks own properties AND the entire prototype chain. `hasOwnProperty` checks only own properties.

---

## Q32: Array Destructuring with Skips and Defaults

```javascript
const [a, , b, c = 'default', ...rest] = [1, 2, 3, undefined, 5, 6];
console.log(a);    // ?
console.log(b);    // ?
console.log(c);    // ?
console.log(rest); // ?
```

**Output:** `1`, `3`, `'default'`, `[5, 6]`

- `, ,` skips index 1 (value 2)
- `c = 'default'` — default activates because index 3 is `undefined`
- `...rest` collects remaining: `[5, 6]`

---

## Q33: Object.freeze vs const

```javascript
const obj = Object.freeze({ a: 1, nested: { b: 2 } });

obj.a = 99;           // silently ignored (not in strict mode)
obj.nested.b = 99;    // WORKS — freeze is shallow!
obj.c = 3;            // silently ignored

console.log(obj.a);        // ?
console.log(obj.nested.b); // ?
console.log(obj.c);        // ?
```

**Output:** `1`, `99`, `undefined`

`Object.freeze` prevents adding/deleting/modifying own properties. It does NOT deep-freeze nested objects. The `const` keyword prevents REASSIGNMENT of the binding — it doesn't freeze the object.

```javascript
// const vs freeze:
const x = { a: 1 };
x.a = 2;   // ✅ allowed — const prevents x = {...}, not mutation
x = {};    // ❌ TypeError — can't reassign const binding

// Deep freeze:
function deepFreeze(obj) {
  Object.getOwnPropertyNames(obj).forEach(name => {
    const val = obj[name];
    if (typeof val === 'object' && val !== null) deepFreeze(val);
  });
  return Object.freeze(obj);
}
```

---

## Q34: Tagged Template Literals

```javascript
function tag(strings, ...values) {
  console.log(strings);
  console.log(values);
  return strings.reduce((result, str, i) =>
    result + str + (values[i] !== undefined ? `[${values[i]}]` : ''), '');
}

const name = 'Alice';
const age = 30;
const result = tag`Hello ${name}, you are ${age} years old`;
console.log(result);
```

**Output:**
```
['Hello ', ', you are ', ' years old']
['Alice', 30]
'Hello [Alice], you are [30] years old'
```

`strings` is the array of string parts (always `values.length + 1`). `values` are the interpolated expressions. Used in: styled-components, SQL template literals (auto-parameterization), i18n.

---

## Q35: Implicit Return vs Block Body in Arrow Functions

```javascript
const f1 = x => x * 2;           // implicit return
const f2 = x => { x * 2 };       // block body, no return → undefined
const f3 = x => ({ value: x });  // return object literal (must wrap in parens)
const f4 = x => { return x * 2 }; // explicit return

console.log(f1(3)); // ?
console.log(f2(3)); // ?
console.log(f3(3)); // ?
```

**Output:** `6`, `undefined`, `{ value: 3 }`

`{ }` after `=>` is always a block body. To return an object literal, wrap it in `( )`.

---

## Q36: Spread in Function Call vs Array

```javascript
function sum(a, b, c) { return a + b + c; }
const nums = [1, 2, 3];

console.log(sum(...nums));        // ? (spread as arguments)
console.log(Math.max(...nums));   // ?
console.log(Math.max(nums));      // ?

const combined = [0, ...nums, 4];
console.log(combined);            // ?
```

**Output:** `6`, `3`, `NaN`, `[0, 1, 2, 3, 4]`

`Math.max(nums)` passes an array as a single argument — `Math.max([1,2,3])` → `NaN`. `Math.max(...nums)` spreads to `Math.max(1, 2, 3)` → `3`.

---

## Q37: Chaining with null/undefined — Optional Chaining Internals

```javascript
const data = {
  users: [
    { name: 'Alice', address: { city: 'NYC' } },
    { name: 'Bob' }
  ]
};

console.log(data.users[0]?.address?.city);  // ?
console.log(data.users[1]?.address?.city);  // ?
console.log(data.users[2]?.address?.city);  // ?
console.log(data.users?.[0]?.name);         // ?

// Calling a method that might not exist:
console.log(data.users[0]?.getScore?.());   // ?
```

**Output:** `'NYC'`, `undefined`, `undefined`, `'Alice'`, `undefined`

Optional chaining short-circuits the moment it hits `null`/`undefined` — the rest of the chain is not evaluated at all.

---

## Q38: WeakMap vs Map — Garbage Collection

```javascript
let obj = { name: 'temp' };

const map = new Map();
const weakMap = new WeakMap();

map.set(obj, 'in map');
weakMap.set(obj, 'in weakmap');

obj = null; // remove our reference

// What happens now?
// map: obj still lives — Map holds a strong reference → memory leak possible
// weakMap: obj can be GC'd — WeakMap holds a WEAK reference

console.log(map.size);      // 1 (still there)
// weakMap.has(obj) — can't check, obj is null now
```

**Use WeakMap for:**
- DOM element → metadata mapping (element removed → data auto-cleaned)
- Private class data (class instance as key)
- Memoization where the cache should die with the object

**Key difference:** WeakMap keys must be objects, is not iterable, has no `.size`.

---

## Q39: String Immutability

```javascript
let str = 'hello';
str[0] = 'H';         // silently ignored
str.toUpperCase();    // returns NEW string, doesn't mutate

console.log(str);     // ?
console.log(str.toUpperCase()); // ?
console.log(str);     // ?
```

**Output:** `'hello'`, `'HELLO'`, `'hello'`

Strings are immutable primitives. `str[0] = 'H'` does nothing. String methods always return new strings. To "mutate" a string, reassign the variable.

---

## Q40: Label Statement

```javascript
outer: for (let i = 0; i < 3; i++) {
  for (let j = 0; j < 3; j++) {
    if (j === 1) break outer;
    console.log(i, j);
  }
}
```

**Output:** `0 0`

`break outer` breaks out of the labeled (outer) loop, not just the inner loop. Labels can also be used with `continue outer` to skip to the next iteration of the outer loop.

---

## Q41: Number Edge Cases

```javascript
console.log(Number.MAX_SAFE_INTEGER);       // ?
console.log(Number.MAX_SAFE_INTEGER + 1);   // ?
console.log(Number.MAX_SAFE_INTEGER + 2);   // ?
console.log(Number.isFinite(Infinity));     // ?
console.log(Number.isFinite(1 / 0));        // ?
console.log(isFinite('5'));                 // ?
console.log(Number.isFinite('5'));          // ?
```

**Output:** `9007199254740991`, `9007199254740992`, `9007199254740992`, `false`, `false`, `true`, `false`

Past `MAX_SAFE_INTEGER`, integers can't be represented exactly. `MAX_SAFE_INTEGER + 1 === MAX_SAFE_INTEGER + 2` because both round to the same float.

`isFinite('5')` → coerces → `true`. `Number.isFinite('5')` → no coerce → `false`. Always prefer `Number.isFinite` / `Number.isNaN`.

**Use BigInt for large integers:**
```javascript
const big = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
console.log(big); // 9007199254740992n
```

---

## Q42: Function Hoisting vs var Hoisting — Same Name

```javascript
var foo = 10;
function foo() { return 20; }

console.log(typeof foo);
console.log(foo);
```

**Output:** `'number'`, `10`

**Why:** Function declarations hoist ABOVE `var` declarations. After hoisting, the execution order is: `function foo` is declared → `var foo` is ignored (already declared) → `foo = 10` assignment runs at runtime. By the time `console.log` executes, `foo` is `10`.

---

## Q43: let/const in for Loops — Fresh Binding Per Iteration

```javascript
const fns = [];
for (let i = 0; i < 3; i++) {
  fns.push(() => i);
}
console.log(fns.map(f => f()));

const fns2 = [];
for (var j = 0; j < 3; j++) {
  fns2.push(() => j);
}
console.log(fns2.map(f => f()));
```

**Output:** `[0, 1, 2]`, `[3, 3, 3]`

**Why:** `let` creates a NEW binding for each loop iteration — each closure captures its own `i`. `var` has a single binding shared across all iterations — all closures see the final value `3`.

---

## Q44: TDZ in Default Parameters

```javascript
function greet(a = b, b = 2) {
  return a + b;
}

console.log(greet(1, 2));  // ?
console.log(greet());      // ?
```

**Output:** `3`, then `ReferenceError: Cannot access 'b' before initialization`

**Why:** Default parameter expressions are evaluated left-to-right. When `greet()` is called, `a = b` tries to read `b` — but `b` hasn't been initialized yet (it's in its own TDZ). Default parameters have their own scope and TDZ rules.

---

## Q45: Destructuring — Renaming and Nested Defaults

```javascript
const { a: x, b: { c: y = 42 } = {} } = { a: 1 };
console.log(typeof a); // ?
console.log(x);        // ?
console.log(y);        // ?
```

**Output:** `'undefined'`, `1`, `42`

**Why:** `a: x` renames `a` to `x` — `a` is NOT declared as a variable. `b` is missing from the source → falls back to `{}` → `c` is missing → falls back to default `42`. The variable `a` was never declared — `typeof a` is `'undefined'`.

---

## Q46: Spread Does Not Copy Getters — It Evaluates Them

```javascript
const source = {
  get value() {
    console.log('getter called');
    return 42;
  }
};

const copy = { ...source };
console.log(Object.getOwnPropertyDescriptor(copy, 'value'));
console.log(copy.value);
```

**Output:**
```
getter called
{ value: 42, writable: true, enumerable: true, configurable: true }
42
```

**Why:** Spread calls the getter during the copy and stores the RESULT as a plain data property. The getter function itself is NOT copied. If you need to copy property descriptors, use `Object.defineProperties(target, Object.getOwnPropertyDescriptors(source))`.

---

## Q47: Optional Chaining Does Not Short-Circuit Assignment

```javascript
const obj = {};
obj?.foo = 'bar'; // ?
```

**Output:** `SyntaxError: Invalid left-hand side in assignment`

**Why:** Optional chaining (`?.`) is not valid on the LEFT side of an assignment. It's a read-only expression — you can't use it to conditionally assign properties. You need explicit checks: `if (obj) obj.foo = 'bar';`

---

## Q48: for...in Iterates Strings Too

```javascript
for (const ch in 'abc') {
  console.log(ch);
}

for (const ch of 'abc') {
  console.log(ch);
}
```

**Output:**
```
0
1
2
a
b
c
```

**Why:** `for...in` iterates over enumerable property KEYS — for strings, those are the character indices (`'0'`, `'1'`, `'2'`). `for...of` iterates over values — for strings, those are individual characters. `for...of` works on any iterable (strings, arrays, Maps, Sets). `for...in` works on any object's enumerable keys.

---

## Q49: WeakSet — Cannot Store Primitives

```javascript
const ws = new WeakSet();
ws.add({ id: 1 });         // ✅ OK
ws.add([1, 2, 3]);          // ✅ OK (arrays are objects)

try {
  ws.add('hello');           // ?
} catch (e) {
  console.log(e.message);
}

console.log(ws.has({ id: 1 }));  // ?
```

**Output:** `'Invalid value used in weak set'`, then `false`

**Why:** WeakSet (and WeakMap keys) only accept objects — primitives can't be weakly held because they aren't garbage collected. `ws.has({ id: 1 })` is `false` because it's a DIFFERENT object in memory, not the one we added.

---

## Q50: Proxy — Intercepting Property Access

```javascript
const handler = {
  get(target, prop, receiver) {
    if (prop in target) return target[prop];
    return `Property '${prop}' not found`;
  },
  set(target, prop, value) {
    if (typeof value !== 'number') {
      throw new TypeError(`Expected number, got ${typeof value}`);
    }
    target[prop] = value;
    return true; // must return true for success
  }
};

const obj = new Proxy({}, handler);
obj.x = 10;
console.log(obj.x);       // ?
console.log(obj.missing);  // ?

try {
  obj.y = 'hello';
} catch (e) {
  console.log(e.message);
}
```

**Output:** `10`, `"Property 'missing' not found"`, `'Expected number, got string'`

**Why:** Proxy intercepts fundamental operations. The `get` trap fires on every property read. The `set` trap fires on every write. Forgetting `return true` in a `set` trap causes a `TypeError` in strict mode.

---

## Q51: Reflect.ownKeys — Includes Symbols and Non-Enumerable

```javascript
const sym = Symbol('hidden');
const obj = { a: 1, [sym]: 2 };
Object.defineProperty(obj, 'secret', {
  value: 3,
  enumerable: false
});

console.log(Object.keys(obj));            // ?
console.log(Object.getOwnPropertyNames(obj)); // ?
console.log(Reflect.ownKeys(obj));        // ?
```

**Output:**
- `['a']`
- `['a', 'secret']`
- `['a', 'secret', Symbol(hidden)]`

**Why:** `Object.keys` → own enumerable string keys only. `getOwnPropertyNames` → own string keys (enumerable + non-enumerable). `Reflect.ownKeys` → ALL own keys (strings + symbols, enumerable + non-enumerable).

---

## Q52: Symbol.for — Global Symbol Registry

```javascript
const s1 = Symbol('app');
const s2 = Symbol('app');
const s3 = Symbol.for('app');
const s4 = Symbol.for('app');

console.log(s1 === s2); // ?
console.log(s3 === s4); // ?
console.log(s1 === s3); // ?
console.log(Symbol.keyFor(s3)); // ?
console.log(Symbol.keyFor(s1)); // ?
```

**Output:** `false`, `true`, `false`, `'app'`, `undefined`

**Why:** `Symbol()` always creates a unique symbol. `Symbol.for()` looks up the global registry — if a symbol with that key exists, it returns the same one. `s1` was created with `Symbol()`, not `Symbol.for()`, so it's not in the registry and `Symbol.keyFor` returns `undefined`.

---

## Q53: Module Scope — import is Hoisted and Live-Bound

```javascript
// counter.mjs
export let count = 0;
export function increment() { count++; }

// main.mjs
import { count, increment } from './counter.mjs';

console.log(count);   // 0
increment();
console.log(count);   // 1 — live binding!

count = 10;           // TypeError: Assignment to constant variable
```

**Output:** `0`, `1`, then `TypeError`

**Why:** ES module `import` bindings are LIVE — they reflect the current value in the exporting module. But imported bindings are READ-ONLY from the importing module's perspective. Also, `import` statements are hoisted to the top of the module regardless of where they appear in code.

---

## Q54: Tagged Template Literals — Raw Strings

```javascript
function raw(strings) {
  console.log(strings[0]);
  console.log(strings.raw[0]);
}

raw`Hello\nWorld`;
```

**Output:**
```
Hello
World
Hello\nWorld
```

**Why:** `strings[0]` processes escape sequences — `\n` becomes an actual newline. `strings.raw[0]` preserves the raw source text — `\n` stays as a literal backslash + n. This is how `String.raw` works: `` String.raw`Hello\nWorld` `` returns the literal string `Hello\nWorld`.

---

## Q55: Generator — yield Is an Expression

```javascript
function* gen() {
  const x = yield 'first';
  console.log('x =', x);
  const y = yield 'second';
  console.log('y =', y);
  return 'done';
}

const g = gen();
console.log(g.next());        // ?
console.log(g.next('A'));     // ?
console.log(g.next('B'));     // ?
console.log(g.next());        // ?
```

**Output:**
```
{ value: 'first', done: false }
x = A
{ value: 'second', done: false }
y = B
{ value: 'done', done: true }
{ value: undefined, done: true }
```

**Why:** The first `next()` runs until the first `yield` and returns `'first'`. The argument to the NEXT `next('A')` call becomes the return value of that `yield` expression — so `x = 'A'`. After `return`, subsequent `next()` calls always return `{ value: undefined, done: true }`.

---

## Q56: Regex lastIndex Gotcha with Global Flag

```javascript
const regex = /a/g;

console.log(regex.test('abc'));  // ?
console.log(regex.lastIndex);   // ?
console.log(regex.test('abc'));  // ?
console.log(regex.lastIndex);   // ?
console.log(regex.test('abc'));  // ?
```

**Output:** `true`, `1`, `false`, `0`, `true`

**Why:** With the `/g` (or `/y`) flag, `regex.test()` and `regex.exec()` are STATEFUL. They update `lastIndex` after each match. On the second call, it starts searching at index 1 — no `'a'` at or after index 1 → `false`, and `lastIndex` resets to `0`. This is a classic bug when reusing a global regex across multiple strings. Fix: create a new regex each time, or manually reset `regex.lastIndex = 0`.

---

## Q57: eval and Scope — Direct vs Indirect

```javascript
const x = 'global';

function directEval() {
  const x = 'local';
  return eval('x');
}

function indirectEval() {
  const x = 'local';
  const myEval = eval;
  return myEval('x');
}

console.log(directEval());   // ?
console.log(indirectEval()); // ?
```

**Output:** `'local'`, `'global'`

**Why:** A DIRECT call to `eval` (using the literal name `eval`) executes in the local scope — sees `x = 'local'`. An INDIRECT call (assigned to another variable, called via `(0, eval)('x')`, etc.) executes in the GLOBAL scope — sees the global `x`. Direct eval can also introduce new variables into the local scope, which is why it defeats engine optimizations.

---

## Q58: with Statement — Scope Injection (Deprecated)

```javascript
'use strict';
with ({ a: 1 }) { console.log(a); }
```

**Output:** `SyntaxError: Strict mode code may not include a with statement`

**Non-strict mode:**
```javascript
const obj = { a: 1, b: 2 };
with (obj) {
  console.log(a);  // 1
  console.log(b);  // 2
  c = 3;           // creates global variable! (not on obj)
}
console.log(obj.c);  // undefined
console.log(c);      // 3 (leaked to global)
```

**Why:** `with` injects the object's properties into the scope chain. It's banned in strict mode because it makes scope unpredictable — the engine can't know at compile time whether `a` refers to the object's property or a variable. Assignments to non-existent properties leak to global scope.

---

## Q59: Labeled Statement with Block

```javascript
foo: {
  console.log('before');
  break foo;
  console.log('after');
}
console.log('outside');
```

**Output:** `'before'`, `'outside'`

**Why:** Labels can be applied to any block statement, not just loops. `break foo` exits the labeled block early — `'after'` is never reached. This is rarely used in practice but is valid JavaScript. `continue` with labels only works inside loops.

---

## Q60: void Operator in Arrow Functions

```javascript
const sideEffect = () => void console.log('fired');

const result = sideEffect();
console.log(result);

const arr = [1, 2, 3];
arr.forEach(x => void x);
console.log(arr);
```

**Output:** `'fired'`, `undefined`, `[1, 2, 3]`

**Why:** `void expr` evaluates `expr` and returns `undefined`. `void console.log('fired')` runs the log (side effect) but the function returns `undefined`. Useful for arrow functions where you want a side effect but explicitly no return value — prevents accidentally returning something from a one-liner arrow.

---

## Q61: delete on Variables and Properties

```javascript
var x = 10;
let y = 20;
globalThis.z = 30;

console.log(delete x);            // ?
console.log(delete y);            // ?
console.log(delete globalThis.z); // ?
console.log(typeof x);            // ?
console.log(typeof z);            // ?
```

**Output:** `false`, `false`, `true`, `'number'`, `'undefined'`

**Why:** `delete` only works on OBJECT PROPERTIES, not variable declarations. `var` and `let` create non-configurable bindings → `delete` returns `false` and does nothing. `globalThis.z` is a configurable property → `delete` succeeds and returns `true`. Note: in non-strict mode, `delete` on a variable silently fails. In strict mode, `delete x` on a declared variable is a `SyntaxError`.

---

## Q62: Object.seal vs Object.freeze

```javascript
const sealed = Object.seal({ a: 1, b: { c: 2 } });
const frozen = Object.freeze({ a: 1, b: { c: 2 } });

sealed.a = 99;        // ?
sealed.newProp = 42;   // ?
delete sealed.a;       // ?
sealed.b.c = 99;       // ?

console.log(sealed.a);       // ?
console.log(sealed.newProp); // ?
console.log(sealed.b.c);    // ?

frozen.a = 99;        // silently fails
console.log(frozen.a); // ?
```

**Output:** `99`, `undefined`, `99`, `1`

**Why:**
| Operation          | `Object.seal` | `Object.freeze` |
|--------------------|---------------|-----------------|
| Modify existing    | ✅ allowed     | ❌ no            |
| Add new property   | ❌ no          | ❌ no            |
| Delete property    | ❌ no          | ❌ no            |
| Nested mutation    | ✅ allowed     | ✅ allowed (shallow!) |

Both are SHALLOW — nested objects are not sealed/frozen. `Object.isFrozen()` and `Object.isSealed()` check the status.

---

## Q63: structuredClone — What It Can't Clone

```javascript
// ✅ Works:
const cloned = structuredClone({
  date: new Date(),
  regex: /abc/gi,
  map: new Map([['key', 'val']]),
  set: new Set([1, 2, 3]),
  nested: { deep: { arr: [1, 2] } },
  buffer: new ArrayBuffer(8),
});
console.log(cloned.date instanceof Date);  // true
console.log(cloned.map instanceof Map);    // true

// ❌ Throws:
try {
  structuredClone({ fn: () => {} });
} catch (e) {
  console.log(e.message);  // ?
}

try {
  structuredClone({ sym: Symbol('x') });
} catch (e) {
  console.log(e.message);  // ?
}

// ❌ Also cannot clone:
// - DOM nodes
// - Proxy objects
// - Property descriptors (getters/setters become plain values)
// - Prototype chain (result is always plain Object)
```

**Output:** `true`, `true`, then two `DataCloneError` messages about uncloneable types.

**Why:** `structuredClone` uses the structured clone algorithm (same as `postMessage`). It handles Date, RegExp, Map, Set, ArrayBuffer, and cyclic references — but CANNOT handle functions, Symbols, DOM nodes, or Proxy objects. It also strips the prototype chain and property descriptors.

---

## Q64: for...of on Objects — TypeError

```javascript
const obj = { a: 1, b: 2, c: 3 };

try {
  for (const val of obj) {
    console.log(val);
  }
} catch (e) {
  console.log(e.message); // ?
}

// Fix: make it iterable
for (const [key, val] of Object.entries(obj)) {
  console.log(key, val);
}
```

**Output:** `'obj is not iterable'`, then `a 1`, `b 2`, `c 3`

**Why:** Plain objects are NOT iterable — they don't have a `[Symbol.iterator]` method. `for...of` requires an iterable (arrays, strings, Maps, Sets, generators). Use `Object.entries()`, `Object.keys()`, or `Object.values()` to iterate over objects with `for...of`. Alternatively, add `[Symbol.iterator]` to make any object iterable.

---

## Q65: Regex exec with Capture Groups

```javascript
const regex = /(\d{4})-(\d{2})-(\d{2})/;
const match = regex.exec('Date: 2025-03-14');

console.log(match[0]);  // ?
console.log(match[1]);  // ?
console.log(match[2]);  // ?
console.log(match[3]);  // ?
console.log(match.index); // ?

// Named capture groups (ES2018):
const named = /(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})/;
const m = named.exec('2025-03-14');
console.log(m.groups.year);  // ?
console.log(m.groups.month); // ?
```

**Output:** `'2025-03-14'`, `'2025'`, `'03'`, `'14'`, `6`, `'2025'`, `'03'`

**Why:** `match[0]` is the full match. `match[1..N]` are capture groups in order. `match.index` is the position of the match in the input string. Named groups provide `match.groups` for readable access.

---

## Q66: Generator — return() and throw()

```javascript
function* gen() {
  try {
    yield 1;
    yield 2;
    yield 3;
  } finally {
    console.log('cleanup');
  }
}

const g = gen();
console.log(g.next());      // ?
console.log(g.return(99));   // ?
console.log(g.next());      // ?
```

**Output:**
```
{ value: 1, done: false }
cleanup
{ value: 99, done: true }
{ value: undefined, done: true }
```

**Why:** `g.return(99)` forces the generator to finish — it jumps to the `finally` block (if any), then returns `{ value: 99, done: true }`. After that, the generator is done — all subsequent `next()` calls return `{ value: undefined, done: true }`. Similarly, `g.throw(err)` throws an error inside the generator at the point of the last `yield`.
