# Core Web Vitals & Frontend Performance

## Core Web Vitals (2024)

Google's metrics for measuring real-world user experience:

| Metric | Full Name | Measures | Good | Needs Improvement | Poor |
|--------|-----------|----------|------|-------------------|------|
| **LCP** | Largest Contentful Paint | Loading | ≤2.5s | 2.5–4s | >4s |
| **INP** | Interaction to Next Paint | Interactivity | ≤200ms | 200–500ms | >500ms |
| **CLS** | Cumulative Layout Shift | Visual Stability | ≤0.1 | 0.1–0.25 | >0.25 |

> Note: INP replaced FID (First Input Delay) in March 2024.

### Supporting Metrics (also important)

| Metric | Description | Target |
|--------|-------------|--------|
| **TTFB** | Time to First Byte | <800ms |
| **FCP** | First Contentful Paint | <1.8s |
| **TBT** | Total Blocking Time | <200ms |
| **TTI** | Time to Interactive | <3.8s |

---

## LCP — Largest Contentful Paint

The render time of the largest image or text block visible in the viewport.

**LCP elements:** `<img>`, `<image>` in SVG, `<video>` poster, background-image via CSS, block-level text.

### What hurts LCP
1. Slow server response (high TTFB)
2. Render-blocking resources (CSS/JS)
3. Slow resource load times (unoptimized images)
4. Client-side rendering (React SSR vs CSR matters here)

### LCP Fixes

**1. Preload the LCP image:**
```html
<!-- Tell browser to fetch this early, before CSS/JS is processed -->
<link rel="preload" as="image" href="/hero.webp" fetchpriority="high">

<!-- For responsive images -->
<link rel="preload" as="image"
  imagesrcset="/hero-400.webp 400w, /hero-800.webp 800w"
  imagesizes="100vw">
```

**2. fetchpriority on the LCP image:**
```html
<img src="/hero.webp" fetchpriority="high" loading="eager" alt="Hero">
```

**3. Optimize image format & size:**
```html
<picture>
  <source srcset="/hero.avif" type="image/avif">
  <source srcset="/hero.webp" type="image/webp">
  <img src="/hero.jpg" alt="Hero" width="1200" height="600">
</picture>
```
- Always specify `width` and `height` (prevents CLS)
- Use WebP or AVIF (30-50% smaller than JPEG/PNG)
- Serve correctly sized images (don't serve 2000px image for 400px slot)

**4. Eliminate render-blocking CSS:**
```html
<!-- Inline critical CSS -->
<style>
  /* Only the above-the-fold styles */
  body { margin: 0; }
  .hero { width: 100%; height: 400px; }
</style>

<!-- Load rest async -->
<link rel="preload" href="/styles.css" as="style"
      onload="this.rel='stylesheet'">
```

**5. Use CDN for static assets and reduce TTFB:**
```js
// Next.js: use ISR or SSG for static pages
export async function getStaticProps() {
  return { props: { data }, revalidate: 60 };
}
```

---

## INP — Interaction to Next Paint

Measures the latency from user interaction (click, tap, key press) to the next frame painted. Replaces FID which only measured first interaction.

### What hurts INP
- Long JavaScript tasks on main thread
- Heavy event handlers
- Forced synchronous layouts
- Large component re-renders (React)

### Long Task Threshold
Any task >50ms is a "long task" and contributes to TBT/INP.

```
|--50ms--| ← threshold
[────────────────────────] ← 200ms task = 150ms blocking time
```

### INP Fixes

**1. Break up long tasks with `scheduler.yield()`:**
```js
// BAD — 500ms blocking task
function processItems(items) {
  for (const item of items) {
    heavyProcess(item);  // blocks main thread
  }
}

// GOOD — yield to browser between chunks
async function processItems(items) {
  for (let i = 0; i < items.length; i++) {
    heavyProcess(items[i]);

    // Yield every 50 items to let browser handle interactions
    if (i % 50 === 0) {
      await scheduler.yield(); // Chrome 115+
      // Fallback: await new Promise(r => setTimeout(r, 0));
    }
  }
}
```

**2. Move heavy work off main thread:**
```js
// Web Worker for CPU-intensive operations
const worker = new Worker('/workers/process.js');

button.addEventListener('click', () => {
  worker.postMessage({ items });  // non-blocking
  worker.onmessage = (e) => updateUI(e.data);
});
```

**3. Optimize React renders:**
```jsx
// Defer non-urgent state updates
import { useTransition, startTransition } from 'react';

function SearchResults() {
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  function handleSearch(e) {
    // Urgent: update input immediately
    setQuery(e.target.value);

    // Non-urgent: defer heavy list render
    startTransition(() => {
      setResults(filterData(e.target.value));
    });
  }

  return (
    <>
      <input value={query} onChange={handleSearch} />
      {isPending ? <Spinner /> : <ResultsList results={results} />}
    </>
  );
}
```

**4. Debounce event handlers:**
```js
// For continuous events (scroll, resize, input)
const handleInput = debounce((e) => {
  setResults(filter(e.target.value));
}, 150);
```

---

## CLS — Cumulative Layout Shift

Measures unexpected layout shifts. Score = sum of (impact fraction × distance fraction) for each unexpected shift.

**Impact fraction:** Area of viewport affected.
**Distance fraction:** Distance element moved / viewport height.

### What causes CLS
- Images without dimensions
- Ads/embeds without reserved space
- Dynamically injected content above existing content
- Web fonts causing FOIT/FOUT

### CLS Fixes

**1. Always set image dimensions:**
```html
<!-- Set width + height — browser reserves space before load -->
<img src="photo.jpg" width="800" height="600" alt="...">

/* CSS: maintain aspect ratio */
img {
  width: 100%;
  height: auto;
  aspect-ratio: 4/3; /* modern way */
}
```

**2. Reserve space for ads/embeds:**
```css
.ad-slot {
  min-height: 250px;  /* reserve space */
  background: #f5f5f5;
}
```

**3. font-display for web fonts:**
```css
@font-face {
  font-family: 'MyFont';
  src: url('/fonts/myfont.woff2');
  font-display: optional; /* don't show fallback if font loads quickly */
  /* or: swap — show fallback immediately, swap when loaded */
  /* or: fallback — 100ms block, 3s swap window */
}
```

**4. Avoid inserting content above existing content:**
```js
// BAD — inserts banner at top, pushes content down
document.body.insertBefore(banner, document.body.firstChild);

// GOOD — append at bottom, or use reserved space
document.getElementById('banner-slot').appendChild(banner);
```

---

## Bundle Optimization

### Code Splitting

**Route-based (React / Next.js):**
```js
// Next.js pages are auto-split per route
// pages/home.js → separate chunk
// pages/dashboard.js → separate chunk

// React lazy loading
const Dashboard = React.lazy(() => import('./Dashboard'));

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </Suspense>
  );
}
```

**Component-level splitting:**
```js
// Split heavy component loaded on interaction
const HeavyChart = React.lazy(() => import('./HeavyChart'));

function DataPage() {
  const [showChart, setShowChart] = useState(false);
  return (
    <>
      <button onClick={() => setShowChart(true)}>Show Chart</button>
      {showChart && (
        <Suspense fallback={<Spinner />}>
          <HeavyChart />
        </Suspense>
      )}
    </>
  );
}
```

### Tree Shaking

Eliminates unused exports. Requires ES modules (static imports).

```js
// BAD — imports entire lodash (70KB)
import _ from 'lodash';
const result = _.cloneDeep(obj);

// GOOD — only imports cloneDeep (few KB)
import cloneDeep from 'lodash/cloneDeep';
// or
import { cloneDeep } from 'lodash-es'; // ES module version
```

**Webpack tree shaking config:**
```js
// webpack.config.js
module.exports = {
  mode: 'production',  // enables tree shaking
  optimization: {
    usedExports: true,   // mark unused exports
    sideEffects: false,  // can remove side-effect-free modules
  }
};

// package.json
{ "sideEffects": ["*.css", "*.scss"] }  // only CSS has side effects
```

### Bundle Analysis

```bash
# Webpack Bundle Analyzer
npm install --save-dev webpack-bundle-analyzer

# In webpack.config.js
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
plugins: [new BundleAnalyzerPlugin()]

# Next.js
npm install @next/bundle-analyzer
```

### Compression

```js
// Vite config
import compression from 'vite-plugin-compression';

export default {
  plugins: [
    compression({ algorithm: 'brotliCompress' }), // ~20% better than gzip
    compression({ algorithm: 'gzip' }),            // fallback
  ]
};
```

**Target sizes (gzipped):**
- Initial JS bundle: <150KB
- CSS: <50KB
- Total page weight: <1MB

---

## Image Optimization

### Modern Formats
```
Format   | Compression | Browser Support | Use When
---------|-------------|-----------------|----------
AVIF     | Best        | 90%+            | Photos, gradients
WebP     | Very good   | 97%+            | General purpose
JPEG     | Good        | 100%            | Photos (fallback)
PNG      | Lossless    | 100%            | Transparency (fallback)
SVG      | Vector      | 100%            | Icons, logos
```

### Lazy Loading
```html
<!-- Native lazy loading -->
<img src="photo.jpg" loading="lazy" alt="...">

<!-- Below-the-fold images -->
<img
  src="placeholder.jpg"
  data-src="actual.jpg"
  loading="lazy"
  decoding="async"
  alt="..."
>
```

### Next.js Image Optimization
```jsx
import Image from 'next/image';

// Automatic: WebP conversion, lazy load, prevents CLS
<Image
  src="/hero.jpg"
  width={1200}
  height={600}
  priority  // for LCP image — eager load
  alt="Hero"
  sizes="(max-width: 768px) 100vw, 1200px"
/>
```

---

## Resource Hints

```html
<!-- dns-prefetch: resolve DNS early -->
<link rel="dns-prefetch" href="//api.example.com">

<!-- preconnect: DNS + TCP + TLS early -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

<!-- preload: must fetch soon (high priority) -->
<link rel="preload" as="font" href="/fonts/main.woff2" crossorigin>
<link rel="preload" as="script" href="/app.js">
<link rel="preload" as="image" href="/hero.webp">

<!-- prefetch: likely needed soon (low priority) -->
<link rel="prefetch" href="/next-page.js">

<!-- modulepreload: preload ES module + dependencies -->
<link rel="modulepreload" href="/app.js">
```

---

## Performance Measurement in Code

```js
// Performance API
const t0 = performance.now();
doWork();
const t1 = performance.now();
console.log(`Took ${t1 - t0}ms`);

// User Timing API — custom marks
performance.mark('start-render');
render();
performance.mark('end-render');
performance.measure('render-time', 'start-render', 'end-render');

const [entry] = performance.getEntriesByName('render-time');
console.log(entry.duration);

// Navigation Timing
const nav = performance.getEntriesByType('navigation')[0];
console.log({
  ttfb: nav.responseStart - nav.requestStart,
  domLoad: nav.domContentLoadedEventEnd - nav.startTime,
  fullLoad: nav.loadEventEnd - nav.startTime,
});

// PerformanceObserver — observe in real time
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.entryType === 'largest-contentful-paint') {
      console.log('LCP:', entry.startTime);
    }
  }
});
observer.observe({ entryTypes: ['largest-contentful-paint', 'layout-shift'] });
```

### Web Vitals Library (Google)
```js
import { onLCP, onINP, onCLS } from 'web-vitals';

onLCP(metric => sendToAnalytics({ name: 'LCP', value: metric.value }));
onINP(metric => sendToAnalytics({ name: 'INP', value: metric.value }));
onCLS(metric => sendToAnalytics({ name: 'CLS', value: metric.value }));
```

---

## Interview Questions

**Q: What is LCP and how do you improve it?**
LCP measures when the largest visible element loads. Improve it by: preloading the LCP image with `fetchpriority="high"`, using WebP/AVIF, reducing TTFB via CDN and caching, eliminating render-blocking resources, and using SSR instead of CSR.

**Q: INP replaced FID — why?**
FID only measured the delay for the first interaction. INP measures the latency of all interactions (click, tap, keyboard) throughout the page lifecycle and reports the worst-case percentile. More representative of real interactivity.

**Q: What is CLS and what are its most common causes?**
CLS measures unexpected layout shifts (elements moving without user input). Common causes: images without width/height, ads without reserved space, dynamically injected content, web fonts swapping.

**Q: How does tree shaking work?**
Tree shaking is dead code elimination based on ES module static analysis. Bundlers (webpack, Rollup) mark exports as "used" or "unused" based on imports. Unused exports are eliminated. Requires ES modules (CommonJS dynamic requires can't be statically analyzed).

**Q: What's the difference between preload and prefetch?**
`preload` = fetch this resource now, it will be needed very soon (high priority, same page). `prefetch` = fetch this resource in the background, may be needed for the next navigation (low priority). Using `preload` for resources not needed soon wastes bandwidth.
