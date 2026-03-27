# Web Performance & Core Web Vitals

---

## Core Web Vitals (2024+)

Google's user-centric performance metrics used in search ranking:

| Metric | What it measures | Good | Needs improvement | Poor |
|---|---|---|---|---|
| **LCP** | Largest Contentful Paint | ≤ 2.5s | 2.5–4s | > 4s |
| **CLS** | Cumulative Layout Shift | ≤ 0.1 | 0.1–0.25 | > 0.25 |
| **INP** | Interaction to Next Paint | ≤ 200ms | 200–500ms | > 500ms |

INP replaced FID (First Input Delay) in March 2024. FID only measured the first interaction's delay; INP measures the worst interaction across the entire page lifetime.

---

## LCP — Largest Contentful Paint

**What triggers it:** The render time of the largest image or text block visible in the viewport.

LCP candidates (in order of priority):
- `<img>` elements
- `<image>` inside SVG
- `<video>` poster image
- Elements with `background-image: url(...)`
- Block-level elements containing text

### LCP optimizations

**1. Preload the LCP image**
```html
<link rel="preload" as="image" href="/hero.webp"
      imagesrcset="/hero-400.webp 400w, /hero-800.webp 800w"
      imagesizes="100vw">
```

**2. No lazy-loading on above-the-fold images**
```html
<!-- BAD: above the fold hero image -->
<img src="/hero.jpg" loading="lazy">

<!-- GOOD -->
<img src="/hero.jpg" loading="eager" fetchpriority="high">
```

**3. Use modern image formats**
WebP saves ~25–35% vs JPEG. AVIF saves ~50% vs JPEG. Always provide fallback:
```html
<picture>
  <source srcset="/hero.avif" type="image/avif">
  <source srcset="/hero.webp" type="image/webp">
  <img src="/hero.jpg" alt="Hero" width="800" height="600">
</picture>
```

**4. Size images correctly** — `width`/`height` attributes prevent layout shift and let the browser calculate aspect ratio before the image loads.

**5. Eliminate render-blocking resources** — CSS and sync scripts in `<head>` block the render tree. Inline critical CSS, defer non-critical.

**6. TTFB** — LCP is gated on TTFB. Slow server response directly delays LCP. Fix: CDN, edge rendering, caching.

---

## CLS — Cumulative Layout Shift

**Formula:** `CLS = Σ (impact fraction × distance fraction)` for each unexpected layout shift.

A shift is unexpected if it occurs without user interaction within 500ms.

### Common CLS causes and fixes

| Cause | Fix |
|---|---|
| Images without dimensions | Always set `width` and `height` attributes |
| Ads / embeds | Reserve space with min-height or aspect-ratio |
| Fonts causing FOUT | `font-display: optional` or preload fonts |
| Dynamically injected content | Insert above fold only via user action; inject below existing content |
| Animations using `top`/`left` | Use `transform: translate()` instead |

**`content-visibility: auto`** can cause CLS if the browser initially skips measuring off-screen elements — set explicit `contain-intrinsic-size` as a hint.

---

## INP — Interaction to Next Paint

INP measures the time from user interaction (click, key, tap) to when the browser paints the next frame reflecting that interaction.

**Formula:** 75th percentile of all interaction latencies during the page session.

### INP breakdown

```
[User input] → [Input delay] → [Processing time] → [Presentation delay] → [Frame painted]
```

- **Input delay**: time before the event callback fires (main thread busy with long tasks).
- **Processing time**: time to run all event listeners.
- **Presentation delay**: time for browser to render and paint after the callback.

### INP optimizations

**1. Break up long tasks** (> 50ms blocks the main thread)
```js
// BAD: synchronous loop blocking the thread
function processItems(items) {
  items.forEach(item => expensiveWork(item));
}

// GOOD: yield between chunks
async function processItems(items) {
  for (let i = 0; i < items.length; i++) {
    expensiveWork(items[i]);
    if (i % 50 === 0) await scheduler.yield(); // or setTimeout(0)
  }
}
```

**2. Use `scheduler.yield()`** (Chrome 115+) — yields to the browser for higher-priority tasks, then resumes:
```js
async function handleClick() {
  doSomeSyncWork();
  await scheduler.yield(); // let input events and rendering in
  doMoreSyncWork();
}
```

**3. Debounce/throttle high-frequency handlers** (scroll, resize, input).

**4. Avoid forced synchronous layouts** in event handlers (layout thrashing).

**5. Use `startTransition`** for non-urgent React state updates — keeps the page responsive to input while re-rendering.

---

## Other Important Metrics

| Metric | Definition | Key optimization |
|---|---|---|
| **TTFB** | Time to First Byte — server response | CDN, caching, edge SSR |
| **FCP** | First Contentful Paint — first text/image | Eliminate render-blocking, inline critical CSS |
| **TTI** | Time to Interactive — fully interactive | Reduce JS parse/execute, code split |
| **TBT** | Total Blocking Time — FCP to TTI blocking | Break long tasks |
| **Speed Index** | How quickly page visually fills | Same as FCP |

---

## The Critical Rendering Path

```
HTML → DOM
CSS  → CSSOM
        ↓
     Render Tree
        ↓
      Layout
        ↓
      Paint
        ↓
    Composite
```

**Render-blocking resources**: CSS stylesheets and synchronous `<script>` tags in `<head>` block the browser from building the render tree.

**Parser-blocking resources**: Sync scripts block HTML parsing entirely. `defer` runs after parse; `async` runs when downloaded.

### Critical CSS

Inline the styles needed for above-the-fold content; load the rest asynchronously:
```html
<style>/* critical CSS inline */</style>
<link rel="preload" href="/styles.css" as="style"
      onload="this.onload=null;this.rel='stylesheet'">
```

---

## Resource Hints

```html
<!-- DNS resolution early for third-party origins -->
<link rel="dns-prefetch" href="//fonts.googleapis.com">

<!-- TCP + TLS handshake early (use sparingly, wastes if not used) -->
<link rel="preconnect" href="https://fonts.googleapis.com">

<!-- Fetch and cache resource (doesn't execute) — for LCP images -->
<link rel="preload" as="image" href="/hero.webp">

<!-- Fetch and execute in background for likely next navigation -->
<link rel="prefetch" href="/next-page.js">
```

---

## Performance APIs

```js
// Long Task observer — tasks > 50ms
const observer = new PerformanceObserver(list => {
  list.getEntries().forEach(entry => {
    console.log('Long task:', entry.duration, entry.attribution);
  });
});
observer.observe({ entryTypes: ['longtask'] });

// Layout shift observer
const clsObserver = new PerformanceObserver(list => {
  list.getEntries().forEach(entry => {
    if (!entry.hadRecentInput) {
      clsScore += entry.value;
    }
  });
});
clsObserver.observe({ entryTypes: ['layout-shift'] });

// LCP observer
const lcpObserver = new PerformanceObserver(list => {
  const entries = list.getEntries();
  const lcp = entries[entries.length - 1];
  console.log('LCP:', lcp.startTime, lcp.element);
});
lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
```

### Navigation Timing

```js
const nav = performance.getEntriesByType('navigation')[0];
const ttfb = nav.responseStart - nav.requestStart;
const domContentLoaded = nav.domContentLoadedEventEnd - nav.startTime;
const load = nav.loadEventEnd - nav.startTime;
```

---

## Lighthouse Scoring

Lighthouse (and PageSpeed Insights) weights metrics:

| Metric | Weight |
|---|---|
| LCP | 25% |
| TBT | 30% |
| CLS | 25% |
| FCP | 10% |
| Speed Index | 10% |

Note: **INP is not in Lighthouse scoring** — it requires real-user data (RUM / CrUX).

**Lab vs field data:**
- Lab (Lighthouse, WebPageTest): controlled, reproducible, synthetic — no real users.
- Field (CrUX, RUM): actual user data, varies by device/network — what Google uses for ranking.

---

## Interview Q&A

**Q: What is the difference between FID and INP?**
FID measured only the input delay of the first interaction on a page — it ignored processing time and all subsequent interactions. INP measures the total latency (input delay + processing + presentation) of the worst interaction across the whole session. INP catches pages that feel responsive initially but degrade over time.

**Q: An image has good LCP in Lighthouse but poor in field data. Why?**
Lighthouse runs on a fast desktop; real users are on slow mobile networks or low-end CPUs. LCP is also affected by render-blocking resources earlier in the waterfall that vary by network speed. Field data reflects the 75th percentile across all user devices/connections.

**Q: Why does `transform` animate better than `top`/`left`?**
`top`/`left` changes trigger layout (reflow) → paint → composite. `transform` skips layout and paint entirely — it's applied by the compositor thread on the GPU using a separate layer. This means no main thread involvement during animation, resulting in consistent 60fps even when the main thread is busy.

**Q: How does CLS happen with web fonts?**
When a web font loads after initial render, the browser swaps the fallback font for the web font. If the metrics differ (character width, line height), text reflows — causing layout shift. Fix: `font-display: optional` (don't swap if not cached on first visit), size-adjust descriptor to match fallback metrics, or preload the font.

**Q: What is the biggest INP killer in React apps?**
Long synchronous re-renders blocking the main thread. A state update that triggers a large tree re-render (e.g., filtering a 10,000-item list) creates a long task. Fix: `startTransition` to mark the re-render as interruptible, `useDeferredValue` to debounce expensive renders, or virtualization (only render visible rows).

**Q: What does `fetchpriority="high"` do on an image?**
Hints to the browser's preload scanner that this resource should be fetched at high priority, bumping it ahead of other images and some scripts. Critical for LCP images that would otherwise be discovered late in parsing. Different from `preload` — `preload` fetches proactively, `fetchpriority` just adjusts queue priority for normally-discovered resources.
