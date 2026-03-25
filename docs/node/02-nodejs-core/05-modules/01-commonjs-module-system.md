# CommonJS Module System

## How require() Works

`require()` is a synchronous, blocking function call — unlike ESM's asynchronous `import`, it resolves, reads, parses, and executes the target file before returning. Node.js adds several layers of behaviour on top of this basic file execution: path resolution (turning a bare name like `'lodash'` into an absolute filesystem path), a module cache (so a module's code runs at most once per process regardless of how many files require it), scope injection (wrapping the file in a function that provides `module`, `exports`, `require`, `__filename`, and `__dirname`), and circular dependency handling (returning a partially-built exports object to break cycles). Understanding each of these layers is essential for diagnosing CommonJS bugs.

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

Before Node.js executes any module file, it wraps the entire source code in a function. This is why `require`, `module`, `exports`, `__filename`, and `__dirname` are available in every file without being true globals — they are injected as function parameters. The wrapper also provides file-level scope isolation: variables declared at the top of a module are local to that function, not shared globally across the process. Knowing this explains quirks like why `this` at module top-level is `exports` (not `global`) and why `arguments.length` is 5 inside any module.

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

`exports` is simply a reference variable that starts pointing to the same object as `module.exports`. Adding properties to either one works because both names point to the same underlying object. The trap is *reassignment*: `exports = { ... }` makes `exports` point at a brand-new object, breaking the link to `module.exports`. Since `require()` always returns `module.exports` (not `exports`), the reassigned value is silently ignored and callers receive an empty `{}`. This is one of the most common beginner bugs in Node.js.

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

After a module is executed for the first time, Node.js stores its `module.exports` value in `require.cache` keyed by the resolved absolute file path. All subsequent `require()` calls for the same file return the cached value without re-executing the file. This makes CommonJS modules behave as *singletons* — every file in the process that requires a module gets the exact same object. This is useful for shared state (a single database pool, a config object) but dangerous when mutation is unintended. Deleting from `require.cache` forces a fresh execution on the next `require`, which is occasionally used in test setups or hot-reload tools but should not be done in production code.

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

When you call `require('something')`, Node.js follows a deterministic algorithm to turn that string into an absolute file path. Bare names (no `./` prefix) trigger a walk up the directory tree through `node_modules` folders, which is why two packages can each bundle their own version of a dependency without conflict. Relative paths skip the `node_modules` search and resolve directly. Knowing the resolution order is important when debugging phantom version mismatches, understanding monorepo hoisting, and reasoning about why deleting `node_modules` and reinstalling sometimes changes behavior.

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

A circular dependency occurs when module A requires module B, and module B (directly or transitively) requires module A. Node.js handles this without infinite looping by returning the *partially-loaded* `module.exports` of the module that is currently being executed. The caller receives whatever has been assigned to `module.exports` up to that point — often an empty object `{}`. This is the root cause of many subtle "undefined is not a function" bugs. The fix is to restructure to eliminate the cycle, or to defer the `require()` call inside a function (lazy loading) rather than at module top-level.

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
