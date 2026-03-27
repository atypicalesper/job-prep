# Source Maps

Source maps let browsers and error trackers map minified/compiled code back to its original source — enabling readable stack traces and debuggable production code.

---

## How Source Maps Work

A source map is a JSON file that encodes the mapping from generated (output) positions to original source positions.

```
dist/bundle.js  ──────────────►  src/utils/format.ts
  line 1, col 4823                 line 42, col 8
```

### The `.map` file format

```json
{
  "version": 3,
  "file": "bundle.js",
  "sourceRoot": "",
  "sources": ["../src/utils/format.ts", "../src/components/Button.tsx"],
  "sourcesContent": ["export function format(n) {...}", "export function Button(...)"],
  "names": ["format", "Button", "n"],
  "mappings": "AAAA,SAASA,OAAOC,GAAG..."
}
```

| Field | Purpose |
|---|---|
| `sources` | Original source file paths |
| `sourcesContent` | Inline original source code (optional) |
| `names` | Original symbol names (for minified identifiers) |
| `mappings` | VLQ-encoded position map |

### VLQ encoding

The `mappings` field is a series of Base64 VLQ (Variable-Length Quantity) encoded integers, separated by `,` (columns) and `;` (lines). Each group encodes up to 5 values:
1. Column in generated output
2. Index into `sources` array
3. Line in original source
4. Column in original source
5. Index into `names` array (optional)

This encoding is compact — a full source map for a large bundle is typically 2–5× the size of the minified output.

---

## Linking Source Maps

### External `.map` file (most common)

```js
// End of bundle.js:
//# sourceMappingURL=bundle.js.map
```

The browser fetches `bundle.js.map` only when DevTools is open — zero performance impact for regular users.

### Inline source map (base64)

```js
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjo...
```

Embeds the entire map in the JS file. Convenient for development (one file) but significantly increases bundle size — never do this in production.

### `X-SourceMap` HTTP header

```
X-SourceMap: /maps/bundle.js.map
```

Alternative to the comment, useful when you can't modify the output file. Less commonly supported.

---

## Source Map Types (webpack/Vite config)

| Type | Build speed | Rebuild speed | Quality | Notes |
|---|---|---|---|---|
| `false` | Fastest | Fastest | None | Production if maps not needed |
| `eval` | Fast | Fast | Transformed | No real .map, uses `eval()` |
| `eval-source-map` | Slow | Fast | Original | Good for dev |
| `cheap-module-source-map` | Faster | Faster | Original lines only | Good compromise for dev |
| `source-map` | Slowest | Slowest | Full | Production-grade |
| `hidden-source-map` | Slowest | Slowest | Full | Map not linked in JS (for Sentry) |
| `nosources-source-map` | Slow | Slow | No source code | Stack traces without source exposure |

**In Vite:**
```ts
// vite.config.ts
export default {
  build: {
    sourcemap: true,        // full external .map
    sourcemap: 'inline',    // inline base64
    sourcemap: 'hidden',    // .map without sourceMappingURL comment
  }
}
```

---

## Security Implications

### What source maps expose

- Original source code (if `sourcesContent` is populated)
- File structure and paths
- Comments, dead code, and developer notes stripped during build
- Business logic that was obfuscated by minification

### Should you deploy source maps to production?

**Option 1: Don't deploy maps publicly**
Remove or don't generate `sourceMappingURL`. Maps never reach users.
- Downside: browser DevTools can't map stack traces.

**Option 2: Deploy maps, but restrict access**
Serve `.map` files with authentication or IP allowlist.
- Maps work in DevTools for your team but not external users.

**Option 3: Hidden maps + error tracker upload (recommended)**
Generate `hidden-source-map` — files exist but aren't linked. Upload maps to Sentry/Datadog at deploy time. Delete maps from server after upload.
- Stack traces are remapped in your error tracker. Source never reaches users.

```bash
# Typical CI pipeline
npm run build
# Upload maps to Sentry
npx @sentry/cli releases files $VERSION upload-sourcemaps ./dist
# Delete maps so they're not served
rm dist/**/*.map
```

---

## Source Maps in Error Trackers

Sentry, Datadog, Bugsnag all accept source maps to remap production stack traces.

### Sentry setup

```js
// vite.config.ts
import { sentryVitePlugin } from '@sentry/vite-plugin';

export default {
  plugins: [
    sentryVitePlugin({
      org: 'my-org',
      project: 'my-project',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: {
        assets: './dist/**',
        deleteSourcemapsAfterUpload: true, // security
      },
    }),
  ],
  build: { sourcemap: true },
};
```

Sentry matches maps to bundles by a unique **release** ID and the filename. When an error occurs, Sentry fetches the uploaded map for that release and remaps the stack trace server-side — users never see or load the maps.

---

## TypeScript & Transpilers

### TypeScript source maps

```json
// tsconfig.json
{
  "compilerOptions": {
    "sourceMap": true,       // emit .js.map alongside .js
    "inlineSourceMap": false, // don't inline (use file instead)
    "inlineSources": true    // embed original .ts in the map's sourcesContent
  }
}
```

### Composed source maps

When multiple transforms are chained (TS → Babel → webpack), each step needs to consume the previous map and produce a new one that references the *original* source. If any step drops source maps, the chain is broken and the final map points to the intermediate (transpiled) output instead of the TypeScript source.

Tools like `source-map` (npm) and `@ampproject/remapping` handle merging maps from multiple transform stages.

---

## Debugging with Source Maps

### Browser DevTools

When DevTools is open and a `.map` reference is found, the Sources panel shows original files. Breakpoints set in original source files work despite the browser executing the minified bundle.

### `node --enable-source-maps`

Node.js 12.12+ can use source maps for stack traces natively:
```bash
node --enable-source-maps dist/server.js
# Stack trace shows original TypeScript line numbers
```

Or via the `source-map-support` package for older Node versions:
```js
import 'source-map-support/register';
```

---

## Interview Q&A

**Q: Do source maps affect page load performance?**
No. The browser fetches the `.map` file only when DevTools is open. Regular users never trigger the map request. An external `.map` file has zero impact on page load for end users.

**Q: What is the security risk of shipping `sourcesContent` in production maps?**
`sourcesContent` embeds the full original source code — including comments, unused code, and logic that minification would otherwise obscure. If maps are served publicly, competitors or attackers can read your business logic. The fix is `hidden-source-map` + error tracker upload, or removing `sourcesContent` from the map (at the cost of less useful stack traces without the source viewer).

**Q: A Sentry stack trace shows minified code even though you uploaded source maps. What went wrong?**
Common causes: (1) The release ID in the Sentry event doesn't match the release used during upload — maps uploaded against release `v1.2` won't remap events tagged `v1.3`. (2) The public URL path of the JS file in the stack trace doesn't match the artifact path in Sentry. (3) The `sourceMappingURL` was removed (`hidden-source-map`) but the map wasn't uploaded, or was uploaded to the wrong path. (4) Maps were deleted before Sentry could fetch them (Sentry can pull maps directly from your server if they're accessible).

**Q: What is `eval-source-map` and why is it used in development?**
Instead of generating `.map` files, `eval-source-map` wraps each module in an `eval()` call with an inline base64 source map appended. Rebuilds are fast because maps are per-module, not one combined file. The downside: `eval()` is blocked by strict CSP policies, so it can't be used in environments with `script-src 'unsafe-eval'` prohibited.

**Q: How does source mapping work across multiple transform steps (TS → Babel → minifier)?**
Each transform produces a source map from its output back to its input. To get a map from the final minified output back to original TypeScript, the maps must be composed: the minifier's map references Babel's output, Babel's map references TS's output, TS's map references the original `.ts`. Tools like `@ampproject/remapping` compose these chains. If any step omits its source map, the chain breaks and remapping stops at that intermediate output.
