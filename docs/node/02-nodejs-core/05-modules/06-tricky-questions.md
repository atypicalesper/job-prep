# Modules — Tricky Interview Questions

---

## Q1: exports vs module.exports

```javascript
// module.js
exports.a = 1;
exports = { b: 2 }; // reassignment
exports.c = 3;

// What does require('./module') return?
```

**Answer:** `{ a: 1 }`

**Why:** `exports.a = 1` adds to the shared object (fine). `exports = { b: 2 }` breaks the reference — `exports` now points to a new object, `module.exports` still points to the original. `exports.c = 3` adds to the new object (not `module.exports`). `require()` returns `module.exports` → `{ a: 1 }`.

---

## Q2: Singleton Behavior

```javascript
// counter.js
let count = 0;
module.exports = {
  increment: () => ++count,
  value: () => count
};

// a.js
const counter = require('./counter');
counter.increment();
counter.increment();

// b.js
const counter = require('./counter');
console.log(counter.value()); // ?
```

**Answer:** `2`

**Why:** Module is cached. `a.js` and `b.js` get the SAME object. Changes in `a.js` are visible in `b.js`.

---

## Q3: Circular Dependency

```javascript
// a.js
const b = require('./b');
module.exports = { name: 'A', b };

// b.js
const a = require('./a'); // what is 'a' here?
module.exports = { name: 'B', a };

// index.js
const a = require('./a');
console.log(a.name); // ?
console.log(a.b.name); // ?
console.log(a.b.a); // ?
```

**Answer:** `'A'`, `'B'`, `{}` (empty object — partial export of a.js when b.js loaded it)

---

## Q4: Dynamic require()

```javascript
const modules = ['fs', 'path', 'os'];
const loaded = modules.map(m => require(m));
console.log(loaded.map(m => typeof m)); // ?
```

**Answer:** `['object', 'object', 'object']`

`require()` can be called dynamically with a variable. All three Node.js built-in modules are loaded and their types are 'object'.

---

## Q5: ESM Live Binding

```javascript
// counter.mjs
export let count = 0;
export const increment = () => { count++; };

// main.mjs
import { count, increment } from './counter.mjs';
console.log(count); // 0
increment();
increment();
console.log(count); // ?
```

**Answer:** `2` — ESM exports are live bindings. When `increment()` modifies `count` in `counter.mjs`, the imported `count` in `main.mjs` reflects that change.

---

## Q6: require() Caching

```javascript
// config.js
const config = { env: process.env.NODE_ENV || 'development' };
console.log('config loaded');
module.exports = config;

// app.js
const c1 = require('./config'); // ?
const c2 = require('./config'); // ?
console.log(c1 === c2); // ?
```

**Answer:** 'config loaded' prints ONCE. `c1 === c2` → `true`. Module is cached after first require. Second require returns cached `module.exports` (same reference) without re-executing.

---

## Q7: What Does __dirname Give You?

```javascript
// /Users/alice/project/src/utils/helper.js
console.log(__dirname);
console.log(__filename);
console.log(process.cwd());
```

**Answer:**
- `__dirname`: `/Users/alice/project/src/utils` (directory of THIS file)
- `__filename`: `/Users/alice/project/src/utils/helper.js` (path of THIS file)
- `process.cwd()`: `/Users/alice/project` (where you ran `node` from — can differ!)

---

## Q8: Top-Level await in ESM

```javascript
// data.mjs
export const users = await fetch('https://api.example.com/users').then(r => r.json());
// This works in ESM! Top-level await is valid.

// main.mjs
import { users } from './data.mjs';
// main.mjs waits for data.mjs to fully load (including the await)
```

**In CJS — must wrap in async function:**
```javascript
// data.js
let users;
async function init() {
  users = await fetch('...').then(r => r.json());
}
await init(); // SyntaxError! Top-level await not allowed in CJS
```

---

## Q9: require() vs import() Performance

```javascript
// CJS require() — synchronous, blocks
const big = require('./large-module'); // blocks until loaded

// ESM dynamic import() — asynchronous, non-blocking
const big = await import('./large-module'); // non-blocking
```

For lazy loading or conditional imports, dynamic `import()` is better as it doesn't block.

---

## Q10: Module Resolution for node_modules

```javascript
// What's the lookup order for: require('express') ?
// (from /Users/alice/project/src/app.js)

// 1. /Users/alice/project/src/node_modules/express
// 2. /Users/alice/project/node_modules/express    ← usually here
// 3. /Users/alice/node_modules/express
// 4. /Users/node_modules/express
// 5. /node_modules/express
// 6. Error: Cannot find module 'express'
```
