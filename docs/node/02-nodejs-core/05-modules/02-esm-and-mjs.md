# ES Modules & .mjs

## What .mjs Is and Why It Exists

`.mjs` is a file extension that tells Node.js (and bundlers) to treat the file as an ES Module unconditionally — regardless of what the nearest `package.json` says. Before Node.js 12, there was no official ESM support and the entire ecosystem was CommonJS. When ESM was added, Node.js needed a way to distinguish CJS `.js` files from ESM `.js` files without breaking existing code. The solution: new extensions. `.mjs` forces ESM, `.cjs` forces CommonJS. The `"type": "module"` field in `package.json` is the other approach — it flips all `.js` files in the package to ESM. `.mjs` is the file-level escape hatch: useful for adding a single ESM file to an otherwise CJS project without changing `package.json`.

```
.js   → CJS by default (unless package.json has "type":"module")
.mjs  → always ESM, no matter what
.cjs  → always CJS, no matter what
```

---

## Three Ways to Enable ESM

Node.js resolves whether a file is ESM or CJS by looking at the file extension and the nearest ancestor `package.json`. Understanding the priority order prevents confusing interop errors — the wrong mental model leads to files being silently treated as CJS when you expect ESM.

```javascript
// Option 1: .mjs extension (file-level, highest priority)
// check-updates.mjs  →  always ESM
// Use when: adding one ESM file to a CJS project

// Option 2: "type": "module" in package.json (package-level)
// package.json:
{ "type": "module" }
// Now every .js file in this package tree is ESM
// Use when: building a new pure-ESM package

// Option 3: .cjs extension (opt out of ESM in a "type":"module" package)
// server.cjs  →  always CJS even in an ESM package
// Use when: a specific file MUST be CJS (e.g., a config file consumed by a tool that can't handle ESM)
```

**Priority:** extension (`.mjs`/`.cjs`) beats `package.json` `"type"` field.

---

## import.meta — The ESM Context Object

ESM modules do not have `__dirname`, `__filename`, or `require` — those are injected by the CJS module wrapper function, which doesn't exist in ESM. Instead, ESM provides `import.meta`, a live object that gives each module access to its own context. `import.meta.url` is always available and is a `file://` URL string pointing to the current file. Node.js v21.2+ added `import.meta.dirname` and `import.meta.filename` as direct equivalents to the CJS globals, eliminating the `fileURLToPath` boilerplate in modern codebases.

```javascript
// import.meta.url — always available, it's a file:// URL
console.log(import.meta.url);
// file:///Users/you/project/scripts/check-updates.mjs

// Reconstruct __dirname / __filename (pre-Node 21.2)
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// Node.js v21.2+ — direct equivalents, no boilerplate
console.log(import.meta.dirname);   // /Users/you/project/scripts
console.log(import.meta.filename);  // /Users/you/project/scripts/check-updates.mjs

// import.meta.resolve() — resolve a module specifier relative to this file
const path = import.meta.resolve('./config.json');
// file:///Users/you/project/scripts/config.json

// import.meta.env — available in bundlers (Vite, etc.), NOT in bare Node.js
// console.log(import.meta.env.MODE); // only in Vite/bundler context
```

---

## Top-Level Await

One of the most practical benefits of `.mjs` / ESM is top-level `await` — you can `await` a Promise at the module's root scope without wrapping it in an `async` function. This is only possible because ESM modules are loaded asynchronously; the module system can pause evaluation of the current module while awaiting, then resume. CJS cannot do this because `require()` is synchronous — there is no mechanism to pause it mid-execution.

```javascript
// check-updates.mjs — top-level await just works
const config = await loadConfig();        // no async wrapper needed
const repos  = await collectActivity();   // sequential, reads cleanly

// CJS equivalent — must wrap everything in an async IIFE:
(async () => {
  const config = await loadConfig();
  const repos  = await collectActivity();
})();

// Practical use: load JSON config at startup
import { readFile } from 'fs/promises';
const pkg = JSON.parse(await readFile('./package.json', 'utf8'));
console.log(pkg.version); // available immediately at module scope
```

---

## Named vs Default Exports

ESM exports are static declarations, not property assignments. A `default` export is a single unnamed value from the module. Named exports are explicitly named bindings. You can mix both in one module. Unlike CJS where `module.exports` is one thing (either an object, function, or class), ESM lets consumers cherry-pick exactly what they need — enabling bundlers to tree-shake unused exports.

```javascript
// math.mjs
export const PI = 3.14159;                      // named export
export function add(a, b) { return a + b; }     // named export
export default class Calculator { ... }          // default export

// consumer.mjs
import Calculator, { PI, add } from './math.mjs';
// Calculator = default export
// PI, add    = named exports

// Rename on import:
import { add as sum } from './math.mjs';

// Import everything as a namespace object:
import * as math from './math.mjs';
math.PI;   // 3.14159
math.add;  // function
// math.default — the Calculator class
```

---

## Dynamic import()

`import()` is a function that asynchronously loads a module at runtime and returns a Promise. It works in both ESM and CJS contexts and is the correct replacement for conditional or lazy `require()` calls. Use it when you need to load a module based on runtime conditions, defer loading for performance, or consume an ESM module from CJS code (where static `import` is unavailable).

```javascript
// Conditional loading at runtime
const locale = getUserLocale(); // 'en' | 'fr' | 'de'
const { messages } = await import(`./locales/${locale}.mjs`);

// Lazy loading for performance — only load when needed
async function runHeavyTask() {
  const { processData } = await import('./heavy-processor.mjs');
  return processData(input);
}

// CJS file consuming an ESM module (can't use static import in .cjs)
async function loadEsmModule() {
  const { default: chalk } = await import('chalk'); // ESM-only package
  console.log(chalk.green('loaded!'));
}

// import() returns the full module namespace object:
const mod = await import('./utils.mjs');
mod.default;   // default export
mod.helperFn;  // named export
```

---

## Package Exports — Dual CJS/ESM Packages

Modern npm packages use the `exports` field in `package.json` to ship both a CJS and ESM version of the same package. This is called a "dual package". The `exports` map lets the runtime (or bundler) pick the right format automatically. Without this, ESM users would get CJS code without tree-shaking, and CJS users would break on ESM-only packages.

```json
// package.json of a dual-mode library
{
  "name": "my-lib",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",   // ESM consumers get this
      "require": "./dist/index.cjs",  // CJS consumers get this
      "types": "./dist/index.d.ts"    // TypeScript
    },
    "./utils": {
      "import": "./dist/utils.mjs",
      "require": "./dist/utils.cjs"
    }
  }
}
```

```javascript
// ESM consumer — gets index.mjs automatically
import { foo } from 'my-lib';

// CJS consumer — gets index.cjs automatically
const { foo } = require('my-lib');
```

---

## Interview Questions

**Q: What does the `.mjs` extension tell Node.js?**
A: It unconditionally treats the file as an ES Module, regardless of the `package.json` `"type"` field. It's the file-level way to use ESM in a CJS project without changing the package config.

**Q: Why doesn't `__dirname` work in `.mjs` files?**
A: `__dirname` is injected by the CJS module wrapper function, which doesn't exist in ESM. The ESM equivalent is `import.meta.url` (a `file://` URL), converted with `fileURLToPath` + `dirname`. Node.js v21.2+ added `import.meta.dirname` directly.

**Q: What is top-level await and why is it ESM-only?**
A: Top-level `await` lets you use `await` at the root scope of a module without an `async` wrapper. It's ESM-only because ESM modules are loaded asynchronously — the runtime can pause and resume module evaluation. CJS `require()` is synchronous and has no mechanism to pause mid-execution.

**Q: How do you load an ESM module from a CJS file?**
A: You can't use static `import` in CJS. You must use dynamic `import()`, which returns a Promise: `const { default: mod } = await import('./esm-module.mjs')`. This forces the consuming function to be async.

**Q: What is a dual-mode package?**
A: A package that ships both a CJS and ESM build and uses the `exports` field in `package.json` to serve the right one automatically. `"import"` condition for ESM consumers, `"require"` for CJS consumers.
