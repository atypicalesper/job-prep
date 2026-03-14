# Type Coercion — 60 Tricky Interview Questions

Master every coercion edge case. For each question, predict the output before reading the answer.

---

## Q1: The Classic Empty Array

```javascript
console.log([] + []);
```

**Output:** `""` (empty string)

**Why:** Both arrays are converted to primitives via `.toString()`. `[].toString()` is `""`. So `"" + ""` = `""`.

---

## Q2: Array Plus Object

```javascript
console.log([] + {});
```

**Output:** `"[object Object]"`

**Why:** `[]` → `""`, `{}` → `"[object Object]"`. String concatenation: `"" + "[object Object]"`.

---

## Q3: Object Plus Array (The Gotcha)

```javascript
console.log({} + []);
```

**Output:** `0` (in most consoles) or `"[object Object]"` (when used as expression)

**Why:** At statement level, `{}` is parsed as an empty block, not an object literal. So it becomes `+[]` → `+""` → `0`. Wrap in parens to force expression: `({} + [])` → `"[object Object]"`.

---

## Q4: Boolean Arithmetic

```javascript
console.log(true + true + true);
```

**Output:** `3`

**Why:** `true` coerces to `1` in numeric context. `1 + 1 + 1 = 3`.

---

## Q5: String Wins

```javascript
console.log(1 + '2' + 3);
```

**Output:** `"123"`

**Why:** Left-to-right: `1 + '2'` → `"12"` (string wins), then `"12" + 3` → `"123"`.

---

## Q6: Subtraction Doesn't Concatenate

```javascript
console.log('5' - 3);
console.log('5' + 3);
```

**Output:** `2` then `"53"`

**Why:** `-` only does numeric operations, so `'5'` → `5`. But `+` prefers string concatenation when either side is a string.

---

## Q7: null Arithmetic

```javascript
console.log(null + 1);
console.log(null + '1');
```

**Output:** `1` then `"null1"`

**Why:** `null` → `0` in numeric context, but `null` → `"null"` in string context.

---

## Q8: undefined Arithmetic

```javascript
console.log(undefined + 1);
console.log(undefined + '1');
```

**Output:** `NaN` then `"undefined1"`

**Why:** `undefined` → `NaN` in numeric context (not 0 like null!), but → `"undefined"` in string context.

---

## Q9: The Infamous WAT

```javascript
console.log([] == false);
console.log([] == ![]);
```

**Output:** `true` then `true`

**Why:**
- `[] == false`: `false` → `0`, `[]` → `""` → `0`. `0 == 0` → `true`
- `[] == ![]`: `![]` is `false` (array is truthy, negated). Then same as above.

---

## Q10: Truthy Array, Falsy Comparison

```javascript
console.log(!![] === true);
console.log([] == true);
```

**Output:** `true` then `false`

**Why:** `!![]` → `true` (array is truthy). But `[] == true`: `true` → `1`, `[]` → `""` → `0`. `0 == 1` → `false`. An array is truthy but not `== true`!

---

## Q11: String to Number Edge Cases

```javascript
console.log(Number(''));
console.log(Number(' '));
console.log(Number('\n'));
console.log(Number('0x1A'));
console.log(Number('0b11'));
console.log(Number('0o17'));
console.log(Number('123abc'));
```

**Output:** `0`, `0`, `0`, `26`, `3`, `15`, `NaN`

**Why:** Empty/whitespace strings → `0`. Hex, binary, octal literals are parsed. Any non-numeric content → `NaN`.

---

## Q12: parseInt vs Number

```javascript
console.log(parseInt('123abc'));
console.log(Number('123abc'));
console.log(parseInt(''));
console.log(Number(''));
```

**Output:** `123`, `NaN`, `NaN`, `0`

**Why:** `parseInt` parses until first invalid char and stops. `Number` requires the entire string to be valid. But `parseInt('')` is `NaN` while `Number('')` is `0` — opposite behavior for empty strings!

---

## Q13: parseInt Radix Gotcha

```javascript
console.log(parseInt('08'));
console.log(parseInt('08', 10));
console.log(parseInt('111', 2));
console.log(parseInt('0xF'));
```

**Output:** `8`, `8`, `7`, `15`

**Why:** Modern engines parse `'08'` as decimal by default (older engines used octal). Always pass radix to be safe. `parseInt('111', 2)` parses as binary. `'0x'` prefix triggers hex.

---

## Q14: Comparison with null

```javascript
console.log(null > 0);
console.log(null < 0);
console.log(null == 0);
console.log(null >= 0);
console.log(null <= 0);
```

**Output:** `false`, `false`, `false`, `true`, `true`

**Why:** For `>/</>=/<=`, `null` → `0`. So `0 > 0` false, `0 < 0` false, `0 >= 0` true, `0 <= 0` true. But `==` has a special rule: `null` only equals `undefined`, NOT `0`.

---

## Q15: Comparison with undefined

```javascript
console.log(undefined > 0);
console.log(undefined < 0);
console.log(undefined == 0);
console.log(undefined == null);
```

**Output:** `false`, `false`, `false`, `true`

**Why:** `undefined` → `NaN` in numeric comparisons. `NaN` is not `>`, `<`, or `==` to anything. But `undefined == null` is a special `==` rule.

---

## Q16: String Comparison Lexicographic

```javascript
console.log('10' > '9');
console.log('10' > 9);
```

**Output:** `false` then `true`

**Why:** When both sides are strings, comparison is lexicographic (char by char). `'1' < '9'` so `'10' < '9'`. When one side is a number, string coerces to number: `10 > 9` → `true`.

---

## Q17: Plus Sign Unary

```javascript
console.log(+true);
console.log(+false);
console.log(+null);
console.log(+undefined);
console.log(+[]);
console.log(+[1]);
console.log(+[1,2]);
console.log(+{});
```

**Output:** `1`, `0`, `0`, `NaN`, `0`, `1`, `NaN`, `NaN`

**Why:** Unary `+` converts to number. `[]` → `""` → `0`. `[1]` → `"1"` → `1`. `[1,2]` → `"1,2"` → `NaN`. `{}` → `"[object Object]"` → `NaN`.

---

## Q18: Double Negation

```javascript
console.log(!!0);
console.log(!!'0');
console.log(!!'');
console.log(!!NaN);
console.log(!!null);
console.log(!!undefined);
console.log(!!-1);
console.log(!!{});
console.log(!![]);
```

**Output:** `false`, `true`, `false`, `false`, `false`, `false`, `true`, `true`, `true`

**Why:** `!!` converts to boolean. The 8 falsy values: `false`, `0`, `-0`, `0n`, `""`, `null`, `undefined`, `NaN`. Everything else is truthy — including `'0'`, `{}`, and `[]`.

---

## Q19: Template Literal Coercion

```javascript
console.log(`${[1,2,3]}`);
console.log(`${{}}`);
console.log(`${null}`);
console.log(`${undefined}`);
console.log(`${true}`);
```

**Output:** `"1,2,3"`, `"[object Object]"`, `"null"`, `"undefined"`, `"true"`

**Why:** Template literals call `.toString()` on values. Array.toString joins with commas.

---

## Q20: typeof Coercion

```javascript
console.log(typeof 1);
console.log(typeof '1');
console.log(typeof NaN);
console.log(typeof null);
console.log(typeof undefined);
console.log(typeof []);
console.log(typeof {});
console.log(typeof function(){});
```

**Output:** `"number"`, `"string"`, `"number"`, `"object"`, `"undefined"`, `"object"`, `"object"`, `"function"`

**Why:** `typeof null` is `"object"` (historical bug). `typeof NaN` is `"number"` (NaN is a number value). Arrays are objects.

---

## Q21: Equality Chain

```javascript
console.log('' == 0);
console.log(0 == '0');
console.log('' == '0');
```

**Output:** `true`, `true`, `false`

**Why:** `==` is NOT transitive! `'' == 0` (both coerce to 0), `0 == '0'` (both coerce to 0), but `'' == '0'` is same-type string comparison — different strings → false.

---

## Q22: Boolean in Comparison

```javascript
console.log(true == 'true');
console.log(true == '1');
console.log(true == 1);
console.log(false == '');
```

**Output:** `false`, `true`, `true`, `true`

**Why:** Booleans convert to numbers first: `true → 1`, `false → 0`. Then `1 == 'true'` → `'true'` → `NaN` → false. `1 == '1'` → `'1'` → `1` → true.

---

## Q23: Object to Primitive

```javascript
const obj = {
  valueOf() { return 42; },
  toString() { return 'hello'; }
};
console.log(obj + 1);
console.log(`${obj}`);
console.log(String(obj));
```

**Output:** `43`, `"hello"`, `"hello"`

**Why:** For `+` operator, `valueOf()` is preferred (numeric hint). For template literals and `String()`, `toString()` is preferred (string hint).

---

## Q24: Symbol.toPrimitive

```javascript
const obj = {
  [Symbol.toPrimitive](hint) {
    if (hint === 'number') return 10;
    if (hint === 'string') return 'ten';
    return true; // default hint
  }
};
console.log(+obj);
console.log(`${obj}`);
console.log(obj + '');
console.log(obj + 0);
```

**Output:** `10`, `"ten"`, `"true"`, `1`

**Why:** `Symbol.toPrimitive` overrides both `valueOf` and `toString`. `+obj` → number hint. Template literal → string hint. `+ ''` and `+ 0` → default hint (returns `true`). `true + '' = "true"`, `true + 0 = 1`.

---

## Q25: Loose Equality with Objects

```javascript
console.log([1] == 1);
console.log(['1'] == 1);
console.log([1] == '1');
console.log(['1'] == '1');
```

**Output:** `true`, `true`, `true`, `true`

**Why:** Arrays convert via `.toString()`: `[1]` → `"1"`, `['1']` → `"1"`. Then string/number coercion makes them all equal.

---

## Q26: NaN Surprises

```javascript
console.log(NaN === NaN);
console.log(NaN == NaN);
console.log(NaN > NaN);
console.log(NaN < NaN);
console.log(NaN != NaN);
console.log(isNaN('hello'));
console.log(Number.isNaN('hello'));
```

**Output:** `false`, `false`, `false`, `false`, `true`, `true`, `false`

**Why:** `NaN` is not equal to anything, including itself. `NaN != NaN` is true! `isNaN()` coerces first: `isNaN('hello')` → `isNaN(NaN)` → true. `Number.isNaN()` does NOT coerce — only true for actual NaN value.

---

## Q27: Comma in Array Constructor

```javascript
console.log([,,,].length);
console.log([1,,3].length);
console.log([1,,3][1]);
```

**Output:** `3`, `3`, `undefined`

**Why:** Trailing comma doesn't add element, so `[,,,]` has 3 empty slots. `[1,,3]` has empty slot at index 1 which returns `undefined` when accessed.

---

## Q28: Math.max and Math.min

```javascript
console.log(Math.max());
console.log(Math.min());
console.log(Math.max() < Math.min());
```

**Output:** `-Infinity`, `Infinity`, `true`

**Why:** `Math.max()` with no args returns `-Infinity` (identity for max). `Math.min()` returns `Infinity` (identity for min). `-Infinity < Infinity` → `true`.

---

## Q29: Negation and Coercion

```javascript
console.log(-'1');
console.log(-true);
console.log(-null);
console.log(-undefined);
console.log(-[]);
console.log(-[5]);
```

**Output:** `-1`, `-1`, `-0`, `NaN`, `-0`, `-5`

**Why:** Unary `-` coerces to number then negates. `null` → `0` → `-0`. `undefined` → `NaN`. `[]` → `""` → `0` → `-0`. `[5]` → `"5"` → `5` → `-5`.

---

## Q30: Double Equals with Boolean

```javascript
console.log([] == false);
console.log({} == false);
console.log('' == false);
console.log('0' == false);
console.log('1' == true);
console.log('2' == true);
```

**Output:** `true`, `false`, `true`, `true`, `true`, `false`

**Why:** Boolean coerces to number first: `false → 0`, `true → 1`. Then: `[] → "" → 0 == 0` ✓. `{} → "[object Object]" → NaN == 0` ✗. `'2' → 2 == 1` ✗ — only `'1'` equals `true`!

---

## Q31: Addition Operator Ambiguity

```javascript
console.log(1 + 2 + '3');
console.log('1' + 2 + 3);
console.log(1 + +'2' + 3);
```

**Output:** `"33"`, `"123"`, `6`

**Why:** Left-to-right evaluation. `1+2=3`, then `3+'3'="33"`. `'1'+2="12"`, then `"12"+3="123"`. `+'2'=2` (unary), then `1+2+3=6`.

---

## Q32: Increment and Coercion

```javascript
let x = '5';
x++;
console.log(x, typeof x);

let y = '5';
y = y + 1;
console.log(y, typeof y);
```

**Output:** `6 "number"` then `"51" "string"`

**Why:** `++` always converts to number first. But `+ 1` triggers string concatenation because `y` is a string.

---

## Q33: Comparison Coercion Chain

```javascript
console.log('2' > '10');
console.log(2 > '10');
console.log('02' == 2);
```

**Output:** `true`, `false`, `true`

**Why:** String vs string: lexicographic, `'2' > '1'`. Number vs string: string → number, `2 > 10` false. `'02'` → `2`, `2 == 2` true.

---

## Q34: Object Equality

```javascript
console.log({} == {});
console.log({} === {});
console.log([] == []);
console.log([] === []);
```

**Output:** `false`, `false`, `false`, `false`

**Why:** Objects/arrays are compared by reference, not by value. Two different literals are two different references.

---

## Q35: Weird valueOf

```javascript
const a = {
  val: 0,
  valueOf() { return ++this.val; }
};

console.log(a == 1);
console.log(a == 2);
console.log(a == 3);
```

**Output:** `true`, `true`, `true`

**Why:** Each `==` comparison calls `valueOf()`, which increments `val`. So `a` equals 1, then 2, then 3. This is the famous "make `a == 1 && a == 2 && a == 3` true" puzzle.

---

## Q36: if Coercion

```javascript
if ('false') console.log('A');
if ('0') console.log('B');
if (-1) console.log('C');
if ({}) console.log('D');
if ([]) console.log('E');
if ('') console.log('F');
if (0) console.log('G');
```

**Output:** `A B C D E`

**Why:** Only falsy values skip the block. `'false'` and `'0'` are non-empty strings → truthy. `{}` and `[]` are objects → truthy. `''` and `0` are falsy.

---

## Q37: Bitwise Coercion

```javascript
console.log(~~'5.7');
console.log(~~true);
console.log(~~null);
console.log(~~undefined);
console.log(~~[]);
console.log(~~NaN);
```

**Output:** `5`, `1`, `0`, `0`, `0`, `0`

**Why:** `~~` (double NOT) truncates to 32-bit integer. Coerces to number first, then truncates. `undefined` → `NaN` → `0` (bitwise treats NaN as 0).

---

## Q38: OR and AND Return Values

```javascript
console.log(0 || 'hello');
console.log(1 || 'hello');
console.log(0 && 'hello');
console.log(1 && 'hello');
console.log('' || 0 || null || 'found');
console.log(1 && 2 && 3);
console.log(1 && 0 && 3);
```

**Output:** `"hello"`, `1`, `0`, `"hello"`, `"found"`, `3`, `0`

**Why:** `||` returns first truthy value (or last value). `&&` returns first falsy value (or last value). They return the actual value, not a boolean!

---

## Q39: Nullish Coalescing vs OR

```javascript
console.log(0 ?? 'default');
console.log('' ?? 'default');
console.log(null ?? 'default');
console.log(undefined ?? 'default');
console.log(0 || 'default');
console.log('' || 'default');
```

**Output:** `0`, `""`, `"default"`, `"default"`, `"default"`, `"default"`

**Why:** `??` only triggers on `null`/`undefined`. `||` triggers on any falsy value. `0` and `""` are falsy but not nullish — so `??` keeps them, `||` replaces them.

---

## Q40: Implicit toString in Object Keys

```javascript
const obj = {};
const a = {};
const b = {};
obj[a] = 1;
obj[b] = 2;
console.log(obj[a]);
console.log(Object.keys(obj));
```

**Output:** `2`, `["[object Object]"]`

**Why:** Object keys must be strings (or Symbols). Both `a` and `b` coerce to `"[object Object]"` — same key! So `obj[b] = 2` overwrites `obj[a] = 1`.

---

## Q41: Array Coercion in Comparison

```javascript
console.log([0] == false);
console.log([1] == true);
console.log([2] == true);
console.log([''] == false);
console.log([null] == false);
console.log([undefined] == false);
```

**Output:** `true`, `true`, `false`, `true`, `true`, `true`

**Why:** Arrays → `.toString()`: `[0]→"0"→0`, `[1]→"1"→1`, `[2]→"2"→2`. Boolean → number: `false→0`, `true→1`. So `[2]==true` is `2==1` → false. `[null]→""→0`, `[undefined]→""→0`.

---

## Q42: String Multiplication

```javascript
console.log('3' * '4');
console.log('3' * true);
console.log('foo' * 1);
console.log(null * undefined);
```

**Output:** `12`, `3`, `NaN`, `NaN`

**Why:** `*` always converts both sides to numbers. `'3'→3`, `'4'→4`, `true→1`, `'foo'→NaN`, `null→0`, `undefined→NaN`. `0*NaN=NaN`.

---

## Q43: JSON.stringify Coercion

```javascript
console.log(JSON.stringify(undefined));
console.log(JSON.stringify(null));
console.log(JSON.stringify(NaN));
console.log(JSON.stringify(Infinity));
console.log(JSON.stringify({ a: undefined, b: null, c: NaN }));
```

**Output:** `undefined`, `"null"`, `"null"`, `"null"`, `'{"b":null,"c":null}'`

**Why:** `JSON.stringify(undefined)` returns JS `undefined` (not the string). In objects, `undefined` values are omitted. `NaN` and `Infinity` become `null` in JSON.

---

## Q44: Array Holes vs undefined

```javascript
const a = [1, , 3];
const b = [1, undefined, 3];

console.log(a.map(x => 'v'));
console.log(b.map(x => 'v'));
console.log(0 in a);
console.log(1 in a);
```

**Output:** `["v", empty, "v"]`, `["v", "v", "v"]`, `true`, `false`

**Why:** Array holes (sparse slots) are skipped by `.map()`, `.forEach()`, etc. `undefined` is an actual value and is iterated. `1 in a` checks if index exists — holes don't have the index.

---

## Q45: toString and valueOf Priority

```javascript
const a = {
  toString() { return '10'; },
  valueOf() { return 5; }
};

console.log(a + 1);
console.log(a + '1');
console.log(`${a}`);
console.log(Number(a));
console.log(String(a));
```

**Output:** `6`, `"51"`, `"10"`, `5`, `"10"`

**Why:** For `+` operator (default hint), `valueOf()` is called first → `5`. For template literals and `String()`, `toString()` is called → `"10"`. `Number()` uses `valueOf()` → `5`.

---

## Q46: Infinity Edge Cases

```javascript
console.log(Infinity + Infinity);
console.log(Infinity - Infinity);
console.log(Infinity * 0);
console.log(Infinity / Infinity);
console.log(1 / 0);
console.log(-1 / 0);
console.log(0 / 0);
```

**Output:** `Infinity`, `NaN`, `NaN`, `NaN`, `Infinity`, `-Infinity`, `NaN`

**Why:** Indeterminate forms (∞ - ∞, ∞ × 0, ∞ / ∞, 0 / 0) all produce `NaN`. Division by zero gives `±Infinity` (not an error!).

---

## Q47: BigInt Coercion

```javascript
console.log(1n + 2n);
// console.log(1n + 2); // TypeError!
console.log(typeof 1n);
console.log(1n == 1);
console.log(1n === 1);
```

**Output:** `3n`, `"bigint"`, `true`, `false`

**Why:** BigInt and Number cannot be mixed with `+`. But `==` does coerce between them (`1n == 1` is true). `===` doesn't coerce, so different types → false.

---

## Q48: Automatic Semicolon Insertion

```javascript
function foo() {
  return
  {
    value: 42
  }
}
console.log(foo());
```

**Output:** `undefined`

**Why:** ASI inserts a semicolon after `return`, making it `return;`. The object literal is never reached. Always keep the opening brace on the same line as `return`.

---

## Q49: void Operator

```javascript
console.log(void 0);
console.log(void 'hello');
console.log(void (1 + 2));
console.log(typeof void 0);
```

**Output:** `undefined`, `undefined`, `undefined`, `"undefined"`

**Why:** `void` evaluates the expression but always returns `undefined`. `void 0` is a reliable way to get `undefined` (can't be overridden in old JS).

---

## Q50: Labeled Statements Confusion

```javascript
const result = (() => {
  foo: {
    console.log('A');
    break foo;
    console.log('B');
  }
  console.log('C');
  return 'done';
})();
console.log(result);
```

**Output:** `A`, `C`, `"done"`

**Why:** `foo:` is a label, not an object key. `break foo` exits the labeled block, skipping `'B'`, and continues to `'C'`.

---

## Q51: Chained Assignment Coercion

```javascript
let a = '10';
let b = a - 5;
let c = a + 5;
console.log(b, typeof b);
console.log(c, typeof c);
```

**Output:** `5 "number"` then `"105" "string"`

**Why:** `-` forces numeric: `'10' - 5 = 5`. `+` prefers string: `'10' + 5 = '105'`.

---

## Q52: Boolean Constructor vs Literal

```javascript
const a = new Boolean(false);
console.log(a == false);
console.log(!!a);
console.log(typeof a);

if (a) {
  console.log('truthy!');
}
```

**Output:** `true`, `true`, `"object"`, `"truthy!"`

**Why:** `new Boolean(false)` creates an object wrapper. Objects are truthy, so `if (a)` is true! But `a == false` coerces the object to its primitive (false), so it equals false. Never use `new Boolean()`.

---

## Q53: Array.isArray vs typeof

```javascript
console.log(typeof []);
console.log(typeof {});
console.log(Array.isArray([]));
console.log(Array.isArray({}));
console.log([] instanceof Array);
console.log([] instanceof Object);
```

**Output:** `"object"`, `"object"`, `true`, `false`, `true`, `true`

**Why:** `typeof` can't distinguish arrays from objects (both `"object"`). Use `Array.isArray()`. Arrays are instances of both `Array` and `Object`.

---

## Q54: String Comparison Edge Cases

```javascript
console.log('a' > 'A');
console.log('Z' > 'a');
console.log('banana' > 'cherry');
console.log('2' > '12');
```

**Output:** `true`, `false`, `false`, `true`

**Why:** String comparison uses Unicode code points. Lowercase letters have higher code points than uppercase. Lexicographic comparison goes char by char: `'2'(50) > '1'(49)`.

---

## Q55: Spread and Coercion

```javascript
console.log([...'hello']);
console.log([...123]);     // TypeError!
```

**Output:** `["h","e","l","l","o"]` then TypeError

**Why:** Spread works on iterables. Strings are iterable (char by char). Numbers are not iterable.

---

## Q56: delete and undefined

```javascript
const obj = { a: 1, b: undefined };
console.log('a' in obj);
console.log('b' in obj);

delete obj.a;
console.log('a' in obj);
console.log(obj.a);
console.log(obj.b);
```

**Output:** `true`, `true`, `false`, `undefined`, `undefined`

**Why:** `in` checks if property exists — `b` exists even though its value is `undefined`. After `delete obj.a`, property is removed. Accessing deleted/non-existent property returns `undefined`, same as explicit `undefined` — but they're semantically different.

---

## Q57: Map Keys vs Object Keys

```javascript
const map = new Map();
map.set(1, 'number');
map.set('1', 'string');
map.set(true, 'boolean');
console.log(map.size);

const obj = {};
obj[1] = 'number';
obj['1'] = 'string';
obj[true] = 'boolean';
console.log(Object.keys(obj).length);
```

**Output:** `3`, `2`

**Why:** Map preserves key types — `1`, `'1'`, and `true` are three different keys. Object coerces all keys to strings: `1→"1"`, `true→"true"`. So `obj["1"]` is overwritten twice, and we have keys `"1"` and `"true"`.

---

## Q58: Ternary and Comma

```javascript
const x = (1, 2, 3);
console.log(x);

const y = true ? 1, 2 : 3; // SyntaxError!
```

**Output:** `3` then SyntaxError

**Why:** Comma operator evaluates left-to-right, returns last value. But it can't be used directly in ternary without parens: `true ? (1, 2) : 3` would work and return `2`.

---

## Q59: String and Number Methods

```javascript
console.log(1.toString()); // SyntaxError!
console.log(1..toString());
console.log((1).toString());
console.log(1 .toString());
```

**Output:** SyntaxError, `"1"`, `"1"`, `"1"`

**Why:** `1.` is parsed as the number `1.0` — the parser expects more digits, not a method call. `1..toString()` works because first dot is decimal point, second is property access. Parens or space also fix it.

---

## Q60: Implicit Coercion in Switch

```javascript
const x = '1';

switch (x) {
  case 1:
    console.log('number');
    break;
  case '1':
    console.log('string');
    break;
}

switch (true) {
  case x == 1:
    console.log('loose');
    break;
  case x === 1:
    console.log('strict');
    break;
}
```

**Output:** `"string"` then `"loose"`

**Why:** `switch` uses `===` (strict equality) for matching. So `'1' === 1` fails, `'1' === '1'` matches. In the second switch, `true === (x == 1)` → `true === true` matches first.

---

## Quick Reference: Coercion Rules

| Expression | Result | Rule |
|---|---|---|
| `+[]` | `0` | `[] → "" → 0` |
| `+{}` | `NaN` | `{} → "[object Object]" → NaN` |
| `+null` | `0` | `null → 0` |
| `+undefined` | `NaN` | `undefined → NaN` |
| `+''` | `0` | `"" → 0` |
| `+'0'` | `0` | `"0" → 0` |
| `+true` | `1` | `true → 1` |
| `+false` | `0` | `false → 0` |
| `[] + []` | `""` | Both → "", concat |
| `[] + {}` | `"[object Object]"` | `"" + "[object Object]"` |
| `{} + []` | `0` | `{}` parsed as block, `+[]` = 0 |
| `null == undefined` | `true` | Special rule |
| `NaN == NaN` | `false` | NaN ≠ anything |
| `[] == false` | `true` | `[] → "" → 0 == 0` |
| `[] == ![]` | `true` | `![] = false → 0; [] → 0` |
