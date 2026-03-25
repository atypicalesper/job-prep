# Bundle Optimization — Code Splitting, Tree Shaking, Lazy Loading

## The Problem

A single 2MB JS bundle means:
- Users download and parse everything on first load, even code for routes they never visit
- Any change invalidates the entire cached bundle

Goal: **send the minimum JS needed for the current page, as fast as possible**.

---

## Code Splitting

Break the bundle into smaller chunks loaded on demand.

### Dynamic import() — manual splitting

`import()` is a language feature (not a bundler convention) that creates a split point: the bundler emits the imported module and its dependencies as a separate chunk file that is only fetched when the `import()` call is executed at runtime. This is how you make loading conditional on user actions (clicking a button, navigating to a route) rather than guaranteed on page load. The returned Promise resolves to the module's namespace object.

```js
// Without splitting — entire charting lib in initial bundle
import { Chart } from 'chart.js';

// With splitting — chart.js loaded only when user navigates to /analytics
async function loadAnalytics() {
  const { Chart } = await import('chart.js');
  new Chart(canvas, config);
}
```

### Route-based splitting (React)

Route-based splitting is the highest-leverage form of code splitting: each page of the application becomes its own chunk, and users only download the code for pages they actually visit. `React.lazy` is the standard mechanism — it wraps a dynamic `import()` call and integrates with `<Suspense>` to show a fallback UI while the chunk loads. Next.js does route-based splitting automatically for every page; in Vite/CRA apps you wire it up manually as shown below.

```jsx
import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Settings  = lazy(() => import('./pages/Settings'));

function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/settings"  element={<Settings />} />
      </Routes>
    </Suspense>
  );
}
```

Each route becomes a separate chunk. User visiting `/dashboard` never downloads Settings code.

### Component-level splitting (heavy components)

Some components (rich text editors, chart libraries, PDF viewers) have large dependencies that most users never need. Component-level splitting defers loading these until the exact moment the user triggers the feature. The `isEditing` guard in the example below means the 300KB editor chunk is never downloaded for read-only users — a significant saving at zero cost to the experience.

```jsx
// Rich text editor — 300KB — only load when user clicks "Edit"
const RichEditor = lazy(() => import('./RichEditor'));

function PostEditor({ isEditing }) {
  return isEditing
    ? <Suspense fallback={<div>Loading editor…</div>}><RichEditor /></Suspense>
    : <ReadOnlyView />;
}
```

### Webpack magic comments

Webpack supports inline comments inside `import()` calls that control chunk naming and prefetch behavior. `webpackChunkName` gives the output chunk a human-readable name (visible in bundle analysis and network tab). `webpackPrefetch` and `webpackPreload` map to the browser's `<link rel="prefetch">` and `<link rel="preload">` resource hints respectively, letting you tell the browser to fetch a chunk before it's explicitly needed.

```js
import(
  /* webpackChunkName: "analytics" */
  /* webpackPrefetch: true */          // load after browser is idle
  './Analytics'
);

import(
  /* webpackPreload: true */           // load in parallel with parent chunk
  './CriticalWidget'
);
```

`prefetch` — fetched after current navigation is complete, cached for future routes
`preload` — fetched in parallel, needed for current navigation

---

## Tree Shaking

Dead code elimination — remove exports that are imported nowhere.

**Requires ES modules** (`import`/`export`) — CommonJS (`require`) is not statically analyzable.

```js
// math.js — exports three functions
export function add(a, b) { return a + b; }
export function subtract(a, b) { return a - b; }
export function multiply(a, b) { return a * b; } // ← never imported anywhere

// app.js
import { add } from './math';  // only add is used
```

After tree shaking: `subtract` and `multiply` are removed from the bundle.

### Common tree-shaking killers

Tree shaking works by proving at build time that an export is unreachable. Anything that makes reachability analysis impossible — side effects, dynamic property access, CommonJS — defeats it. These patterns are common in older packages and are the most frequent reason a bundle analyzer shows unexpectedly large dependencies.

```js
// 1. Side-effect imports — bundler can't know if removing them is safe
import 'some-library';  // might mutate globals — hard to shake

// 2. Re-exporting everything
export * from 'lodash';  // pulls in ALL of lodash, even unused parts

// 3. CommonJS
const _ = require('lodash');       // bundler can't statically analyze
const { debounce } = require('lodash'); // still imports all of lodash

// 4. Dynamic access
const method = 'debounce';
library[method]();  // bundler can't know which method at build time
```

### Fix: use ES module builds / subpath imports

Modern packages ship an `"exports"` field in `package.json` that maps import paths to ES module files, enabling full tree shaking. Older packages like lodash pre-date this and require either subpath imports (`lodash/debounce`) or switching to the `lodash-es` package which re-publishes the same functions as ES modules. When evaluating any large utility library, check whether it provides an ES module build before adding it as a dependency.

```js
// BAD — imports entire lodash
import { debounce } from 'lodash';

// GOOD — imports only debounce
import debounce from 'lodash/debounce';

// GOOD — modern packages with ES module exports (package.json "exports" field)
import { debounce } from 'lodash-es';
```

### Mark package as side-effect free (library authors)

When a bundler imports a module, it conservatively assumes the module may have side effects (mutating globals, registering polyfills) and will include it in the bundle even if none of its exports are used. Setting `"sideEffects": false` in your package tells bundlers they can safely remove any module that is imported but whose exports are unused. As a library author this is essential to enable downstream tree shaking; as an app developer, add it only after verifying your code truly has no side effects.

```json
// package.json
{ "sideEffects": false }

// Or list files that DO have side effects
{ "sideEffects": ["./src/polyfills.js", "*.css"] }
```

---

## Lazy Loading Images

Images below the fold are downloaded eagerly by default, wasting bandwidth on resources the user may never scroll to. Native lazy loading (`loading="lazy"`) defers fetching until the image approaches the viewport, based on a browser-managed threshold. It requires no JavaScript and has near-universal browser support — it should be applied to every non-critical image by default. The `loading="eager"` plus `fetchpriority="high"` combination does the opposite for LCP images: it tells the browser to fetch them as early as possible.

```html
<!-- Native — supported in all modern browsers -->
<img src="photo.jpg" loading="lazy" alt="…" width="800" height="600">

<!-- Critical above-the-fold images — never lazy load these -->
<img src="hero.jpg" loading="eager" fetchpriority="high" alt="…">
```

### Intersection Observer (custom lazy loading)

`IntersectionObserver` is the API underlying native lazy loading. It fires a callback when an element enters or exits the viewport (with optional margin). The `rootMargin: '200px'` setting pre-loads images 200px before they enter view, eliminating the brief moment where the image slot is visible but blank. Use this pattern when you need more control than `loading="lazy"` provides — for example, custom animation triggers, lazy-loaded video, or placeholder swaps.

```js
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target;
      img.src = img.dataset.src;  // swap in the real src
      observer.unobserve(img);
    }
  });
}, { rootMargin: '200px' }); // start loading 200px before visible

document.querySelectorAll('img[data-src]').forEach(img => observer.observe(img));
```

---

## Image Optimization

The `<picture>` element and `srcset`/`sizes` attributes let you serve different image files to different browsers and screen sizes without JavaScript. `<picture>` with `<source>` elements enables format negotiation: the browser picks the first `<source>` whose `type` it supports, falling back to the `<img>` element. The `srcset` width descriptors on `<img>` combined with `sizes` let the browser calculate the optimal image size for the current viewport and device pixel ratio before fetching anything.

```html
<!-- WebP with JPEG fallback -->
<picture>
  <source srcset="hero.webp" type="image/webp">
  <img src="hero.jpg" alt="…" width="1200" height="630">
</picture>

<!-- Responsive images — browser picks the right size -->
<img
  srcset="img-400.webp 400w, img-800.webp 800w, img-1200.webp 1200w"
  sizes="(max-width: 600px) 100vw, (max-width: 1200px) 50vw, 800px"
  src="img-800.webp"
  alt="…"
>
```

**Format sizes** (same 1200×630 photo):
| Format | Size |
|---|---|
| PNG | ~1.2 MB |
| JPEG 80% | ~180 KB |
| WebP | ~120 KB |
| AVIF | ~80 KB |

---

## Preloading Critical Resources

The browser's default resource discovery order is: HTML parsed → CSS fetched → CSS parsed → fonts and images referenced in CSS discovered. Fonts in particular are discovered late because the browser must parse the CSS, then match selectors, before knowing which fonts to fetch. A `<link rel="preload">` in `<head>` moves font and LCP image fetches to the very start of the page load, before the main CSS even begins downloading. This is one of the highest-impact single changes for both LCP and CLS (by eliminating FOUT).

```html
<head>
  <!-- Preload critical font — prevents FOUT -->
  <link rel="preload" href="/fonts/Inter.woff2" as="font" type="font/woff2" crossorigin>

  <!-- Preload hero image -->
  <link rel="preload" href="/hero.webp" as="image" fetchpriority="high">

  <!-- Preconnect to third-party origins (analytics, fonts CDN) -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="dns-prefetch" href="https://analytics.example.com">
</head>
```

---

## Bundle Analysis

Bundle analysis gives you a visual, interactive treemap of everything inside your production bundle — showing each module's size, its position in the dependency graph, and which chunks it ends up in. It is the essential diagnostic tool for answering "why is my bundle so large?" before applying any optimization. Run it after any significant dependency addition or change to catch unexpectedly large imports early.

```bash
# Webpack Bundle Analyzer
npm install --save-dev webpack-bundle-analyzer

# In webpack config:
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
plugins: [new BundleAnalyzerPlugin()]

# Next.js
npm install --save-dev @next/bundle-analyzer
# next.config.js:
const withBundleAnalyzer = require('@next/bundle-analyzer')({ enabled: true });
module.exports = withBundleAnalyzer({});
```

Look for:
- Duplicate dependencies (two versions of the same lib)
- Unexpectedly large modules (moment.js → use date-fns or dayjs)
- Modules that should have been shaken but weren't

---

## Critical CSS / CSS-in-JS

CSS is render-blocking: the browser will not paint anything until the full CSSOM is built from all loaded stylesheets. For large CSS files, this can significantly delay First Contentful Paint. The critical CSS technique extracts only the above-the-fold styles, inlines them in a `<style>` tag (fast — no extra network round trip), and loads the full stylesheet non-blocking via `preload`. The `onload` attribute swaps `rel` from `preload` to `stylesheet` once the file is downloaded. The `<noscript>` tag provides a fallback for browsers with JavaScript disabled.

```html
<!-- Inline critical CSS in <head> — blocks render but small -->
<style>
  /* above-the-fold styles only */
  body { margin: 0; font-family: system-ui; }
  .hero { height: 100vh; background: #000; }
</style>

<!-- Load rest of CSS non-blocking -->
<link rel="preload" href="/styles.css" as="style" onload="this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="/styles.css"></noscript>
```

---

## Real Numbers to Know

| Technique | Typical Saving |
|---|---|
| Route splitting | 50–80% reduction in initial JS |
| Tree shaking lodash → lodash-es | 400KB → 8KB for one method |
| WebP over JPEG | 25–35% smaller |
| AVIF over WebP | 20–30% smaller |
| Image lazy loading | Cuts initial page weight by 40–60% on image-heavy pages |
| Preloading critical font | Eliminates FOUT (~200–500ms) |

---

## Interview Q&A

**Q: What's the difference between code splitting and tree shaking?**

Tree shaking removes dead code at build time — modules that are imported but unused are stripped from the output. Code splitting breaks the bundle into multiple chunks loaded on demand at runtime. They complement each other: tree shaking reduces the size of each chunk; code splitting ensures you only load the chunks needed for the current page.

**Q: Why doesn't tree shaking work with CommonJS?**

Tree shaking requires static analysis — the bundler must know at build time which exports are used. CommonJS uses dynamic `require()` calls that can be conditional, computed, or in callbacks. ES modules are statically analyzable because `import`/`export` must be at the top level and cannot be conditional.

**Q: How does `React.lazy` affect bundle size?**

Each `lazy(() => import('./Component'))` call creates a separate chunk. Webpack/Vite splits the component and all its unique dependencies into that chunk. The chunk is only downloaded when React renders the lazy component for the first time. Combined with route-based splitting, this can reduce initial bundle size by 50%+.

**Q: What's the difference between `prefetch` and `preload`?**

`preload` (`<link rel="preload">`) — tells the browser to download this resource immediately, in parallel with current page load. Use for resources critical to current navigation (hero image, font, main JS chunk).

`prefetch` (`<link rel="prefetch">`) — hints the browser to download this resource during idle time for future navigations. Use for next-page resources. Low priority, doesn't compete with current page.
