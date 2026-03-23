# CommonJS Module System

## How require() Works

When you call `require('./module')`, Node.js:

1. **Resolve** the file path (check extensions: .js, .json, .node)
2. **Check cache** — return cached version if already loaded
3. **Create module object** (`{ id, exports, parent, filename, loaded }`)
4. **Wrap** the file in the module wrapper function
5. **Execute** the wrapped code
6. **Cache** the module
7. **Return** `module.exports`

---

## The Module Wrapper Function

Every Node.js module is wrapped in this IIFE before execution:

```javascript
(function(exports, require, module, __filename, __dirname) {
  // Your module code here
});
```

This is why `__dirname`, `__filename`, `require`, `module`, `exports` are available everywhere — they're injected as parameters, not globals.

```javascript
// Proof:
console.log(arguments.length); // 5 — the wrapper params
typeof module;    // 'object' — the module wrapper
typeof exports;   // 'object' — shortcut for module.exports
typeof require;   // 'function' — the local require
```

---

## exports vs module.exports — THE Critical Difference

```javascript
// exports is a REFERENCE to module.exports
// They start pointing to the same object:
console.log(exports === module.exports); // true

// ✅ Adding to exports works — both point to same object:
exports.greet = function() { return 'hello'; };
module.exports.greet; // same function — works!

// ❌ REASSIGNING exports breaks the link:
exports = { greet: function() { return 'hello'; } };
// exports now points to a NEW object
// module.exports still points to the ORIGINAL {}
// require() returns module.exports → {} (empty!)

// ✅ Reassign module.exports directly:
module.exports = { greet: function() { return 'hello'; } };
// require() returns this new object → works!
```

**Rule:** To export a FUNCTION or CLASS as the whole module, use `module.exports =`. To export named properties, use `exports.name =`.

---

## require.cache — Module Caching

```javascript
const path = require('path');

// After requiring once, module is cached:
console.log(require.cache[require.resolve('./myModule')]);
// { id: '/path/to/myModule.js', exports: {...}, loaded: true, ... }

// Force reload (bust cache):
delete require.cache[require.resolve('./myModule')];
const fresh = require('./myModule'); // re-executes the module!

// Singleton behavior via cache:
// config.js
let config = { db: 'mongodb://localhost' };
module.exports = config;

// app.js
const config = require('./config'); // cached instance
// modifying config here modifies it for ALL files that required it!
```

---

## require Resolution Algorithm

```javascript
require('./local')     // relative path — ./ required
require('lodash')      // node_modules lookup
require('/absolute')   // absolute path

// Node_modules lookup order:
// 1. /current/dir/node_modules/lodash
// 2. /current/node_modules/lodash
// 3. /node_modules/lodash
// ... up to filesystem root

// File extension resolution (no extension given):
require('./foo')
// 1. foo.js
// 2. foo.json
// 3. foo.node (native addon)
// 4. foo/index.js
// 5. foo/package.json → main field
```

---

## Circular Dependencies in CJS

```javascript
// a.js
const b = require('./b');
console.log('a got b:', b);
module.exports = { name: 'A' };

// b.js
const a = require('./a'); // a is PARTIALLY LOADED at this point!
console.log('b got a:', a); // {} — empty! a hasn't finished yet
module.exports = { name: 'B' };

// main.js
require('./a');
// Output:
// b got a: {}        ← a.js not finished when b.js required it
// a got b: { name: 'B' }
```

**Circular deps in CJS return partially-loaded modules. Design to avoid them.**

---

## Interview Questions

**Q: What is the difference between exports and module.exports?**
A: `exports` is a shortcut reference to `module.exports`. Both start pointing to the same object. Adding properties to either works. But **reassigning** `exports = {...}` breaks the reference — `require()` returns `module.exports`, not the new `exports`. Always reassign `module.exports` directly when exporting a function/class as the whole module.

**Q: What is module caching and why does it matter?**
A: After the first `require()`, the module's `module.exports` is stored in `require.cache`. Subsequent `require()` calls return the cached value without re-executing the module. This means modules are effectively singletons — modifying exported objects affects all requirers. It also means circular deps get partially-loaded modules.

**Q: What is the module wrapper function?**
A: Every module is wrapped in `(function(exports, require, module, __filename, __dirname) { ... })` before execution. This injects 5 locals (not globals), provides module isolation, and enables `require()`, `module.exports`, `__dirname`, `__filename`.
