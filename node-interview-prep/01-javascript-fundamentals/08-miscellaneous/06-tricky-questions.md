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
