# CommonJS vs ES Modules (ESM)

## Key Differences

CommonJS (CJS) and ES Modules (ESM) are two completely distinct module systems that coexist in the Node.js ecosystem but cannot be used interchangeably without understanding their incompatibilities. CJS was Node.js's original module system, designed before the JavaScript language had a module standard; it is runtime-dynamic, synchronous, and uses function-scoped module wrappers. ESM is the TC39-standardised JavaScript module system; it is statically analysed at parse time, asynchronously loaded, and uses live bindings rather than value copies. The practical consequence of static analysis is that bundlers (webpack, Rollup, esbuild) can perform tree-shaking on ESM modules — dead code elimination that CJS's dynamic nature makes impossible. Choose ESM for new projects; understand CJS because the existing npm ecosystem is still heavily CJS.

| Feature | CommonJS (CJS) | ES Modules (ESM) |
|---------|---------------|------------------|
| Syntax | `require()` / `module.exports` | `import` / `export` |
| Loading | Synchronous | Asynchronous |
| Structure | Dynamic (runtime) | Static (parse-time) |
| Bindings | Copies values | Live bindings |
| Top-level await | ❌ No | ✅ Yes |
| File extension | `.js` (default in Node) | `.mjs` or `"type":"module"` |
| `__dirname` | ✅ Available | ❌ Not available (use `import.meta`) |
| Tree shaking | ❌ Hard | ✅ Bundlers can tree-shake |
| Circular deps | Partially loaded | Live bindings, works better |

---

## Static vs Dynamic Loading

CJS loads modules synchronously at runtime — `require()` is a regular function call that blocks until the file is read, parsed, and executed. ESM's `import` statements are resolved statically before any code runs, which allows bundlers and runtimes to build a complete dependency graph at parse time. This static analysis enables tree-shaking (dead code elimination) and top-level `await`. Use dynamic `import()` (which returns a Promise) when you genuinely need conditional or on-demand loading in ESM — it works in both ESM and CJS contexts and is the correct replacement for the CJS pattern of calling `require()` inside an `if` block.

```javascript
// CJS — require() can be used anywhere, dynamically:
const module = require(condition ? './a' : './b'); // runtime decision
if (needsLodash) { const _ = require('lodash'); }

// ESM — import must be at top level, statically analyzable:
import { foo } from './a'; // MUST be at top level
// Cannot import conditionally... unless using dynamic import:
const module = await import(condition ? './a' : './b'); // dynamic import()
```

---

## Live Bindings (ESM) vs Copied Values (CJS)

In ESM, exported names are *live bindings* — they are read-only views into the exporting module's variable, not snapshots of its value at import time. When the exporting module updates the variable, all importers automatically see the new value on next access. CJS destructuring (`const { count } = require(...)`) copies the value at that moment, so later mutations in the exporter are invisible to the importer. This distinction matters when sharing counters, flags, or any mutable state across modules, and it changes how circular dependencies are resolved (ESM live bindings can tolerate some cycles that CJS partially-loaded exports cannot).

```javascript
// counter.mjs (ESM)
export let count = 0;
export function increment() { count++; }

// main.mjs
import { count, increment } from './counter.mjs';
console.log(count); // 0
increment();
console.log(count); // 1 ← live binding! reflects the change

// counter.js (CJS)
let count = 0;
module.exports = {
  count,
  increment() { count++; }
};

// main.js
const { count, increment } = require('./counter');
console.log(count); // 0
increment();
console.log(count); // 0 ← STILL 0! count was COPIED, not live
```

---

## Enabling ESM in Node.js

Node.js uses file extensions and the nearest `package.json` `"type"` field to decide whether to treat a `.js` file as CJS or ESM. Without any configuration, `.js` files are CJS. The three ways to opt in to ESM each suit different scenarios: `.mjs` is explicit and file-level (good for mixing in a CJS project), `"type":"module"` in `package.json` flips the whole package to ESM (recommended for new pure-ESM projects), and `.cjs` forces CJS in an otherwise ESM package. Pick one strategy and be consistent — mixing them without understanding the rules leads to confusing interop errors.

```javascript
// Option 1: .mjs extension
// myModule.mjs — automatically ESM

// Option 2: package.json "type": "module"
// package.json:
{ "type": "module" }
// Now all .js files in this package are ESM

// Option 3: .cjs for explicit CommonJS
// myModule.cjs — always CJS
```

---

## Interop — Using CJS in ESM and Vice Versa

ESM and CJS are not fully symmetric in how they interoperate. ESM can import a CJS module because Node.js wraps the CJS `module.exports` as the default export, making it accessible via `import defaultExport from 'cjs-module'`. The reverse is not true: `require()` is synchronous, but ESM modules may use top-level `await` and are always loaded asynchronously — there is no way to `require()` an ESM module. The practical consequence is that if you publish a library as ESM-only, any CJS caller must use dynamic `import()`, which is an async operation and cannot be used at module top-level without refactoring.

```javascript
// ✅ ESM can import CJS (CJS becomes default export):
import lodash from 'lodash'; // CJS module as default export
import { cloneDeep } from 'lodash'; // named imports MAY work

// ❌ CJS cannot require() ESM modules:
const esm = require('./esm-module.mjs');
// Error: require() of ES Module not supported
// Must use dynamic import():
const esm = await import('./esm-module.mjs');
```

---

## import.meta — ESM Equivalent of __dirname

ESM modules do not inject `__dirname` or `__filename` because those are CJS-specific variables provided by the module wrapper function. In ESM, `import.meta.url` is the standard way to get the current module's URL (a `file://` URL string). To reconstruct the `__dirname` / `__filename` pattern you must convert the URL to a path using `fileURLToPath` and `dirname`. Node.js v21.2+ added `import.meta.dirname` and `import.meta.filename` as direct equivalents, eliminating the boilerplate in modern codebases.

```javascript
// In CJS:
console.log(__dirname);
console.log(__filename);

// In ESM:
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Or import.meta.resolve() (Node 20.6+):
const resolved = import.meta.resolve('./data.json');
```

---

## Interview Questions

**Q: What is the main difference between CJS and ESM loading?**
A: CJS loads synchronously at runtime — `require()` blocks until the module is loaded. ESM loads asynchronously and is analyzed statically at parse time (import/export structure is known before execution). This allows ESM to be tree-shaken and enables top-level await.

**Q: What are live bindings in ESM?**
A: ESM exports are live bindings — if the exporting module changes an exported variable, importers see the updated value. CJS exports copy values — the importer gets a snapshot at the time of require(). This matters for circular dependencies and exported counters/state.

**Q: Can you use require() to load an ESM module?**
A: No. `require()` cannot load ESM (`.mjs` or `type:module` packages). You must use dynamic `import()` instead. ESM can import CJS using `import defaultExport from 'cjs-module'`.
