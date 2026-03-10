# Type Coercion and Equality

## == vs === (Loose vs Strict Equality)

`===` (strict equality): No type conversion. Both type AND value must match.
`==` (loose equality): Performs type coercion if types differ.

```javascript
// === never coerces:
1 === 1;     // true
1 === '1';   // false — different types
null === undefined; // false
NaN === NaN; // false — NaN is never equal to anything, even itself!

// == coerces:
1 == '1';    // true — '1' coerced to number 1
0 == false;  // true — false coerced to 0
0 == '';     // true — '' coerced to 0
null == undefined; // true — special case rule
null == 0;   // false — null only equals undefined with ==
NaN == NaN;  // false — NaN is still not equal to itself
```

---

## Truthy and Falsy Values

Every value is either truthy or falsy in a boolean context:

### Falsy Values (only 8)

```javascript
false
0
-0
0n          // BigInt zero
''          // empty string
null
undefined
NaN
```

### Everything Else is Truthy

```javascript
// These surprise people:
'0'         // truthy! Non-empty string
'false'     // truthy!
[]          // truthy! Empty array
{}          // truthy! Empty object
-1          // truthy! Non-zero number
function(){} // truthy!
```

```javascript
// Gotcha:
if ([]) console.log('array is truthy'); // logs!
if ({}) console.log('object is truthy'); // logs!

// But:
[] == false; // true — [] is coerced to '' then to 0, false to 0 → 0 == 0
// Even though [] is truthy in boolean context!

// This is why you should NEVER use == with arrays/objects
```

---

## Type Coercion Rules (Abstract Equality ==)

The Abstract Equality Algorithm:

1. Same type → use `===`
2. `null == undefined` → **true** (and only these two equal each other)
3. `null/undefined == anything_else` → **false**
4. If one is a number, coerce the other to number
5. If one is a boolean, coerce it to number first
6. If one is object and other is string/number/symbol → convert object to primitive

```javascript
// Rule 4: number vs string
1 == '1'     // '1' → 1 → 1 == 1 → true
0 == ''      // '' → 0 → 0 == 0 → true
0 == '0'     // '0' → 0 → true

// Rule 5: boolean coerced first
true == 1    // true → 1 → 1 == 1 → true
false == 0   // false → 0 → 0 == 0 → true
true == '1'  // true → 1, then '1' → 1 → true
false == ''  // false → 0, then '' → 0 → true
false == null // false → 0, but rule 3: null only == undefined → false!

// Rule 6: object to primitive
[] == 0      // [] → '' → 0 → 0 == 0 → true
['1'] == 1   // ['1'] → '1' → 1 → true
[1,2] == '1,2' // [1,2] → '1,2' → '1,2' == '1,2' → true
```

---

## Famous Gotchas

```javascript
null == undefined  // true (only case null == something)
null == 0          // false
null == ''         // false
null == false      // false

NaN == NaN         // false — NaN is never equal to anything
NaN === NaN        // false

'' == '0'          // false — both are strings, no coercion, different values
false == 'false'   // false → 0, 'false' → NaN → 0 == NaN → false
false == '0'       // false → 0, '0' → 0 → true (!)

// The infamous:
[] == ![]          // true!
// Right side: ![] = !true = false → 0
// Left side: [] → '' → 0
// 0 == 0 → true
```

---

## The + Operator Coercion

`+` is overloaded: numeric addition OR string concatenation.

Rules:
- If either operand is a string → string concatenation
- Otherwise → numeric addition

```javascript
1 + 2          // 3 (both numbers)
1 + '2'        // '12' (string concatenation)
'1' + 2        // '12'
'1' + '2'      // '12'

1 + true       // 2 (true → 1)
1 + false      // 1 (false → 0)
1 + null       // 1 (null → 0)
1 + undefined  // NaN (undefined → NaN)
1 + []         // '1' ([] → '' → string concat)
1 + {}         // '1[object Object]' ({} → '[object Object]' → string concat)
1 + [1,2]      // '11,2' ([1,2] → '1,2' → string concat)

// Unary + converts to number:
+'42'      // 42
+true      // 1
+false     // 0
+null      // 0
+undefined // NaN
+''        // 0
+[]        // 0
+{}        // NaN
+[1,2]     // NaN
```

---

## Object.is() — The Most Correct Equality

```javascript
// Fixes two edge cases of ===:
Object.is(NaN, NaN);  // true (=== returns false)
Object.is(+0, -0);    // false (=== returns true)

// Otherwise same as ===:
Object.is(1, 1);      // true
Object.is(1, '1');    // false
Object.is(null, null); // true
```

---

## Comparison Operators and Coercion

```javascript
// Relational operators always convert to numbers (or string comparison):
'5' > 3     // '5' → 5 → true
'5' < '30'  // lexicographic! '5' vs '3' → false (not 5 < 30!)
null > 0    // false (null → 0 for > operator)
null == 0   // false (special == rule: null only equals undefined)
null >= 0   // true (null → 0, 0 >= 0)
// This means: null >= 0 && !(null == 0) — weird!
```

---

## Safe Equality Patterns

```javascript
// Always prefer === over ==
// Use explicit type checks when needed:

// Check for null OR undefined:
value == null       // true for both null and undefined (safe use of ==)
value === null || value === undefined  // explicit

// Check for NaN:
Number.isNaN(value) // ✅ — doesn't coerce
isNaN(value)        // ❌ — coerces first: isNaN('hello') is true!

// Check numbers:
typeof value === 'number' && !Number.isNaN(value)

// Safe null check before access:
const city = user?.address?.city ?? 'Unknown';
```

---

## Interview Questions

**Q: What is the difference between == and ===?**
A: `===` (strict) compares value AND type without coercion. `==` (loose) performs Abstract Equality algorithm which coerces types. Use `===` almost always — `==` only has one common safe use: `value == null` to check for both null and undefined.

**Q: What are all the falsy values in JavaScript?**
A: `false`, `0`, `-0`, `0n`, `''`, `null`, `undefined`, `NaN`. Everything else is truthy, including `[]`, `{}`, `'0'`, `'false'`, and `-1`.

**Q: Why is `[] == ![]` true?**
A: `![]` is `false` (truthy array negated). Then `[] == false` → `false` coerces to `0`, `[]` coerces to `''` then `0`. `0 == 0` is `true`.

**Q: When is it safe to use ==?**
A: `value == null` is a common safe pattern to check if value is either `null` or `undefined` (the only two values that equal each other with `==`, and neither equals anything else). This avoids writing `value === null || value === undefined`.
