# Module Systems, Bundling & Tree Shaking

---

## ESM vs CommonJS

| | ESM (`import`/`export`) | CommonJS (`require`/`module.exports`) |
|---|---|---|
| **Parsing** | Static — imports resolved at parse time | Dynamic — `require()` runs at runtime |
| **Bindings** | Live bindings — value updates propagate | Snapshot — copy of the value at call time |
| **Top-level `await`** | Supported | Not supported |
| **Tree shaking** | Enabled (static graph) | Largely impossible (dynamic) |
| **Circular deps** | Live binding handles cycles gracefully | Partially evaluated module returned |
| **Browser native** | Yes (`<script type="module">`) | No |
| **Node.js** | `.mjs` / `"type":"module"` in package.json | `.cjs` / default |

### Live bindings vs snapshot

```js
// counter.mjs (ESM)
export let count = 0;
export function increment() { count++; }

// main.mjs
import { count, increment } from './counter.mjs';
console.log(count); // 0
increment();
console.log(count); // 1  ← live binding: sees the updated value
```

```js
// counter.js (CJS)
let count = 0;
module.exports = { count, increment: () => count++ };

// main.js
const { count, increment } = require('./counter');
increment();
console.log(count); // 0  ← snapshot: copied at require() time
```

### Interop gotchas

- CJS `module.exports` becomes the ESM **default export** when imported from ESM.
- Named CJS exports only work if the bundler does static analysis on `exports.foo = ...`.
- `__esModule: true` flag on a CJS export signals "treat default as the real default".
- `require()` cannot import ESM in Node.js — use dynamic `import()` instead.

---

## Module Resolution

### Node resolution algorithm (CJS)

1. Exact file match (`./utils` → `./utils.js` → `./utils/index.js`).
2. `node_modules` lookup: walk up directory tree until root.
3. Check `package.json` `main` field for packages.

### ESM / bundler resolution

Bundlers also respect:
- `exports` field in `package.json` (supercedes `main` — conditional exports per environment).
- `imports` field — package-internal aliases.
- `browser` field — browser-specific entry point.

```json
{
  "exports": {
    ".": {
      "import": "./dist/index.esm.js",
      "require": "./dist/index.cjs.js",
      "types": "./dist/index.d.ts"
    }
  }
}
```

### TypeScript `moduleResolution` modes

| Mode | Follows |
|---|---|
| `node` | Classic Node CJS algorithm |
| `node16` / `nodenext` | Node ESM algorithm — requires explicit `.js` extensions |
| `bundler` | Bundler-style (no extensions required, respects `exports`) |

---

## Tree Shaking

Tree shaking = dead code elimination based on static import analysis. The bundler builds a module graph, marks exported symbols as "used" or "unused", and drops unused ones.

**Requirements:**
1. ESM syntax (static `import`/`export`).
2. No side effects on unused imports (or `"sideEffects": false` in `package.json`).
3. Bundler in production mode (Rollup, esbuild, Vite, webpack with `optimization.usedExports: true`).

```js
// utils.js — exporting three functions
export function used() { return 1; }
export function alsoUsed() { return 2; }
export function neverImported() { return 3; }

// main.js
import { used, alsoUsed } from './utils';
// After tree shaking: neverImported is dropped from the bundle
```

### `sideEffects` flag

```json
// package.json
{
  "sideEffects": false          // entire package is side-effect free
}
{
  "sideEffects": ["*.css", "./src/polyfills.js"]  // only these have side effects
}
```

Without this, bundlers assume `import './styles.css'` has side effects and keep it even if nothing from it is used.

### What breaks tree shaking

- **Dynamic access**: `obj[key]` — bundler can't know which key at build time.
- **Re-exports via CJS**: `module.exports = { ...require('./a'), ...require('./b') }`.
- **Object spread of module**: `const all = { ...moduleExports }` — forces all exports in.
- **Side-effectful imports**: `import 'reflect-metadata'` (Angular) must not be tree-shaken.
- **Class methods**: bundlers can't remove individual methods from a class (they're on the prototype, technically a side effect).

---

## Code Splitting

### Entry-point splitting

Each entry point becomes a separate chunk. Shared code is automatically extracted into shared chunks (splitChunks in webpack, manualChunks in Rollup/Vite).

### Dynamic `import()`

```js
// The module is split into a separate chunk, loaded on demand
const { heavyCalc } = await import('./heavy');
```

Bundlers emit a separate JS file and a runtime that fetches it via `<script>` injection when `import()` is called.

### Route-based splitting (Next.js / React Router)

```jsx
const Dashboard = React.lazy(() => import('./Dashboard'));
// Next.js App Router splits automatically per page/layout
```

### Preloading & prefetching

```js
import(/* webpackPrefetch: true */ './LargeModal');
// Emits: <link rel="prefetch" href="large-modal.chunk.js">

import(/* webpackPreload: true */ './CriticalChunk');
// Emits: <link rel="preload" href="critical.chunk.js">
```

`prefetch`: downloaded during idle time, for future navigation.
`preload`: downloaded in parallel with current chunk, for current navigation.

---

## Chunk Hashing & Long-term Caching

Bundlers append a content hash to filenames (`main.[hash].js`). The hash changes only when the file's content changes.

**Strategy:**
- HTML: no-cache (`Cache-Control: no-store`)
- JS/CSS chunks with hash: immutable (`Cache-Control: max-age=31536000, immutable`)
- Runtime chunk: separate file, short cache (changes when chunk graph changes)

**Splitting for better cache hits:**
```
app.[hash].js       ← changes on every code change
vendor.[hash].js    ← only changes when dependencies update (rare)
runtime.[hash].js   ← tiny, changes when chunk manifest changes
```

If `vendor` and `app` are bundled together, a one-line bug fix busts the entire cache including lodash/react.

---

## Interview Q&A

**Q: Why can't CJS be tree-shaken?**
`require()` executes at runtime — the bundler doesn't know at build time which exports will be accessed (e.g., `const key = getKey(); module[key]()`). ESM's static `import` declarations are analyzable at parse time, giving the bundler a complete, known dependency graph.

**Q: What is a live binding and why does it matter for HMR?**
An ESM live binding means the imported name is a reference to the exporting module's slot, not a copy. When the exporter updates the value, importers see the change immediately. HMR exploits this: replacing a module updates the live binding, so consumers automatically get the new value without re-importing.

**Q: What does `"type": "module"` in package.json do?**
Tells Node.js to treat all `.js` files in that package as ESM. Without it, `.js` is CJS. You can override per-file with `.mjs` (always ESM) or `.cjs` (always CJS).

**Q: A library author says "just import the function you need". Why doesn't that always reduce bundle size?**
Tree shaking only works if: (1) the library uses ESM, (2) the library's package.json has `"sideEffects": false`, and (3) there are no dynamic accesses inside the library. Many older libraries ship CJS only, or have barrel files that import everything, defeating tree shaking.

**Q: What is a barrel file and why is it a problem?**
A barrel file re-exports everything from a directory: `export * from './ComponentA'; export * from './ComponentB'; ...`. Even if you only use `ComponentA`, a bundler without perfect tree shaking may include all re-exported modules. Solution: import directly (`import { X } from './lib/X'`) or use a bundler plugin that handles barrels (e.g., `babel-plugin-transform-imports`).

**Q: How does `import()` affect the initial bundle?**
`import()` creates a split point — the dynamically imported module and its unique dependencies are emitted as a separate chunk file. The initial bundle only includes the bootstrap code to fetch that chunk. This reduces the initial JS parse/execute cost at the cost of a network round-trip when the dynamic import fires.
