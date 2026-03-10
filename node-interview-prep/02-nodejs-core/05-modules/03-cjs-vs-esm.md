# CommonJS vs ES Modules (ESM)

## Key Differences

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
