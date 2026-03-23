# Destructuring, Spread & Rest

## Destructuring

### Array Destructuring

```js
const [a, b, c] = [1, 2, 3];
console.log(a, b, c); // 1 2 3

// Skip elements
const [, second, , fourth] = [1, 2, 3, 4];
console.log(second, fourth); // 2 4

// Rest element
const [first, ...rest] = [1, 2, 3, 4];
console.log(first); // 1
console.log(rest);  // [2, 3, 4]

// Default values
const [x = 10, y = 20] = [5];
console.log(x, y); // 5 20 (y uses default)

// Swap variables
let p = 1, q = 2;
[p, q] = [q, p];
console.log(p, q); // 2 1

// Nested
const [[r, s], [t, u]] = [[1, 2], [3, 4]];

// From function return
function getRange() { return [0, 100]; }
const [min, max] = getRange();

// Ignore with _
const [_id, name, _role] = [1, 'Alice', 'admin'];
```

### Object Destructuring

```js
const { name, age } = { name: 'Alice', age: 30, role: 'admin' };
console.log(name, age); // Alice 30

// Rename
const { name: userName, age: userAge } = { name: 'Alice', age: 30 };
console.log(userName, userAge); // Alice 30

// Default values
const { theme = 'dark', lang = 'en' } = { theme: 'light' };
console.log(theme, lang); // light en

// Rename + default
const { host: serverHost = 'localhost', port: serverPort = 3000 } = config;

// Rest
const { id, ...otherProps } = { id: 1, name: 'Alice', role: 'admin' };
console.log(id);         // 1
console.log(otherProps); // { name: 'Alice', role: 'admin' }

// Nested object destructuring
const { address: { city, country = 'US' } } = {
  address: { city: 'NYC' }
};
console.log(city, country); // NYC US

// Function parameters
function createUser({ name, age = 18, role = 'user' } = {}) {
  return { name, age, role };
}
createUser({ name: 'Alice', age: 25 }); // { name: 'Alice', age: 25, role: 'user' }
createUser();                           // default empty object — avoids TypeError

// Dynamic property names
const key = 'name';
const { [key]: value } = { name: 'Alice' };
console.log(value); // 'Alice'
```

### Mixed Destructuring

```js
const users = [
  { id: 1, name: 'Alice', scores: [95, 87, 92] },
  { id: 2, name: 'Bob',   scores: [70, 88, 76] },
];

const [{ name: first, scores: [top] }, { name: second }] = users;
console.log(first, top, second); // Alice 95 Bob

// API response
const { data: { users: [admin] }, meta: { total } } = {
  data: { users: [{ name: 'Admin', role: 'admin' }] },
  meta: { total: 1 }
};
console.log(admin.name, total); // Admin 1
```

---

## Spread Operator (`...`)

### Array Spread

```js
const a = [1, 2, 3];
const b = [4, 5, 6];

// Combine
const combined = [...a, ...b];          // [1, 2, 3, 4, 5, 6]
const withMiddle = [...a, 0, ...b];     // [1, 2, 3, 0, 4, 5, 6]

// Clone (shallow)
const copy = [...a]; // new array, same elements

// Convert iterable to array
const chars = [..."hello"];             // ['h', 'e', 'l', 'l', 'o']
const unique = [...new Set([1,1,2,3])]; // [1, 2, 3]
const entries = [...new Map([[1,'a']])] // [[1, 'a']]

// Function arguments
Math.max(...[1, 5, 3, 9, 2]); // 9

// Convert NodeList
const divs = [...document.querySelectorAll('div')];
divs.forEach(d => d.classList.add('processed'));
```

### Object Spread

```js
const base = { a: 1, b: 2 };
const extended = { ...base, c: 3 };         // { a: 1, b: 2, c: 3 }
const overridden = { ...base, b: 99 };      // { a: 1, b: 99 } — later wins

// Shallow clone
const clone = { ...base };

// Merge multiple
const merged = { ...defaults, ...userPrefs, ...urlParams };

// Conditional properties
const obj = {
  always: true,
  ...(condition && { optional: 'value' }),
  ...(user.isAdmin && { adminPanel: true }),
};

// Immutable update patterns
const state = { user: { name: 'Alice', age: 30 }, loading: false };
const newState = { ...state, loading: true };
const updatedUser = { ...state, user: { ...state.user, age: 31 } };

// Note: spread is SHALLOW
const nested = { a: { b: 1 } };
const shallow = { ...nested };
shallow.a.b = 99;
console.log(nested.a.b); // 99 — same reference!
// For deep clone: structuredClone(nested)
```

---

## Rest Parameters (`...`)

Collect remaining arguments into an array:

```js
// Function rest parameters
function sum(...numbers) {
  return numbers.reduce((acc, n) => acc + n, 0);
}
sum(1, 2, 3, 4); // 10

// Must be last parameter
function logger(level, ...messages) {
  messages.forEach(msg => console.log(`[${level}] ${msg}`));
}
logger('INFO', 'Server started', 'Listening on port 3000');

// Rest vs arguments object
function oldWay() {
  // arguments: array-like, not a real array, no arrow functions
  return Array.from(arguments).reduce((a, b) => a + b, 0);
}
function newWay(...args) {
  return args.reduce((a, b) => a + b, 0); // args is a real Array
}

// Collect remaining in destructuring
const [first, second, ...remaining] = [1, 2, 3, 4, 5];
const { id, ...rest } = { id: 1, name: 'Alice', age: 30 };
```

---

## Common Patterns

### Omit / Pick properties

```js
// Pick specific properties
function pick(obj, ...keys) {
  return Object.fromEntries(keys.map(k => [k, obj[k]]));
}
pick({ a: 1, b: 2, c: 3 }, 'a', 'c'); // { a: 1, c: 3 }

// Omit properties
function omit(obj, ...keys) {
  const { [keys[0]]: _, ...rest } = obj;
  return keys.length > 1 ? omit(rest, ...keys.slice(1)) : rest;
}

// Or using reduce:
const omit2 = (obj, ...keys) =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));

omit2({ a: 1, b: 2, c: 3 }, 'b'); // { a: 1, c: 3 }
```

### Rename keys

```js
const renameKey = (obj, oldKey, newKey) => {
  const { [oldKey]: value, ...rest } = obj;
  return { ...rest, [newKey]: value };
};

renameKey({ firstName: 'Alice', age: 30 }, 'firstName', 'name');
// { age: 30, name: 'Alice' }
```

### Default parameter patterns

```js
// Config object with defaults
function createServer({
  host = 'localhost',
  port = 3000,
  ssl = false,
  timeout = 5000,
  maxConnections = 100,
} = {}) {
  return { host, port, ssl, timeout, maxConnections };
}

createServer({ port: 8080 });
// { host: 'localhost', port: 8080, ssl: false, timeout: 5000, maxConnections: 100 }
```

### Clone and transform

```js
// Map object values
const mapValues = (obj, fn) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v)]));

mapValues({ a: 1, b: 2, c: 3 }, v => v * 2); // { a: 2, b: 4, c: 6 }

// Filter object entries
const filterObj = (obj, predicate) =>
  Object.fromEntries(Object.entries(obj).filter(([k, v]) => predicate(k, v)));

filterObj({ a: 1, b: null, c: 3 }, (k, v) => v != null); // { a: 1, c: 3 }
```

---

## Gotchas

```js
// ❌ Spread doesn't clone methods or prototype
class Point { constructor(x, y) { this.x = x; this.y = y; } distance() { /*...*/ } }
const p = new Point(1, 2);
const copy = { ...p }; // { x: 1, y: 2 } — no prototype, no methods!
copy instanceof Point; // false

// ❌ Rest must be last in destructuring
const { ...a, b } = obj; // SyntaxError — rest must come last

// ❌ Spread doesn't handle non-enumerable properties
const obj2 = Object.create({ inherited: 1 }, { own: { value: 2, enumerable: true } });
const copy2 = { ...obj2 };
copy2.inherited; // undefined — spread only copies own enumerable
copy2.own;       // 2

// ❌ Spread is O(n) — avoid in hot loops
for (let i = 0; i < 10000; i++) {
  arr = [...arr, item]; // 10000 array copies — use push or preallocate
}
```
