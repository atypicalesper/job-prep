# How Browsers Work — Deep Dive

## Browser Architecture

```
┌─────────────────────────────────────────────────┐
│                  Browser Process                 │
│  ┌─────────────┐  ┌─────────────┐               │
│  │  UI Process │  │ GPU Process │               │
│  └─────────────┘  └─────────────┘               │
│  ┌──────────────────────────────────────────┐   │
│  │            Renderer Process              │   │
│  │  ┌────────┐ ┌────────┐ ┌─────────────┐  │   │
│  │  │  Blink │ │   V8   │ │ Compositor  │  │   │
│  │  │(layout)│ │  (JS)  │ │  Thread     │  │   │
│  │  └────────┘ └────────┘ └─────────────┘  │   │
│  └──────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────┐    │
│  │         Network Process                 │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

Chrome uses a **multi-process architecture** — each tab gets its own Renderer Process (site isolation). This means one tab crashing doesn't crash others and malicious sites can't read another tab's memory.

---

## Critical Rendering Path

From URL to pixels:

```
DNS → TCP → TLS → HTTP request
         ↓
      HTML bytes
         ↓
   1. Parse HTML → DOM
   2. Parse CSS  → CSSOM
         ↓
   3. DOM + CSSOM → Render Tree (only visible nodes)
         ↓
   4. Layout (Reflow) — compute geometry
         ↓
   5. Paint — fill pixels per layer
         ↓
   6. Composite — combine layers, send to GPU
```

### What blocks what?

Not all resources are equal in their impact on rendering. The browser can parse HTML incrementally as bytes arrive, but CSS is render-blocking because the browser refuses to paint anything until it has a complete CSSOM (painting with incomplete styles would cause a visible flash). Synchronous scripts block both parsing and rendering because they may call `document.write()` and modify the DOM. `defer` and `async` break this blocking behavior in different ways — `defer` always executes in order after parsing completes, while `async` executes as soon as the script downloads, potentially interrupting parsing.

| Resource | Blocks HTML Parsing | Blocks Rendering |
|----------|--------------------|--------------------|
| CSS `<link>` | No | **Yes** (render-blocking) |
| `<script>` (sync) | **Yes** | **Yes** |
| `<script defer>` | No | No |
| `<script async>` | No (downloads async) | Blocks when executes |
| Images | No | No |

```html
<!-- Render-blocking — bad for perf -->
<link rel="stylesheet" href="styles.css">
<script src="app.js"></script>

<!-- Optimized -->
<link rel="stylesheet" href="critical.css">
<link rel="preload" href="styles.css" as="style" onload="this.rel='stylesheet'">
<script src="app.js" defer></script>
```

---

## V8 Engine — JavaScript Execution

### Ignition + TurboFan Pipeline

```
Source code
    ↓
[Parser] → AST (Abstract Syntax Tree)
    ↓
[Ignition] → Bytecode (interpreted, fast startup)
    ↓  (hot functions detected)
[TurboFan] → Optimized Machine Code
    ↓  (deoptimization if assumption breaks)
[Ignition] → back to bytecode
```

### V8 Optimizations — What Helps

**1. Hidden Classes (Shapes)**
```js
// BAD — different hidden classes per object
function Point(x, y) {
  this.x = x;
  if (y) this.y = y; // conditional property = different shape
}

// GOOD — same hidden class for all instances
function Point(x, y) {
  this.x = x;
  this.y = y; // always assign, even if undefined
}
```

**2. Monomorphic vs Polymorphic calls**
```js
// Monomorphic — V8 can inline and optimize
function add(a, b) { return a + b; }
add(1, 2);   // always numbers → fast
add(3, 4);

// Polymorphic — harder to optimize
add(1, 2);       // number
add('a', 'b');   // string
add({}, {});     // object — V8 gives up optimizing
```

**3. Inline Caches (ICs)**
V8 caches the type of property access at each call site. First call = uninitialized, same type = monomorphic (fast), multiple types = megamorphic (slow).

### V8 Memory

```
V8 Heap
├── New Space (Young Gen) — 1-8 MB, minor GC (Scavenge)
│   ├── Nursery (from-space)
│   └── Intermediate (to-space)
└── Old Space (Old Gen) — larger, major GC (Mark-Sweep-Compact)
    ├── Old object space — survived 2+ minor GCs
    ├── Code space — compiled code
    ├── Map space — hidden classes
    └── Large object space — >512KB, not moved
```

**Scavenge GC (Minor):**
Copy live objects from nursery → to-space. O(live objects). Happens frequently (~1ms).

**Mark-Sweep-Compact (Major):**
1. Mark — traverse all roots, mark reachable
2. Sweep — reclaim unmarked
3. Compact — move objects to reduce fragmentation
Incremental + concurrent to avoid long pauses.

---

## DOM & CSSOM

### DOM Construction

The DOM is a live, tree-structured in-memory representation of the HTML document that JavaScript can query and mutate. Building it is a multi-step tokenization and parsing process — raw bytes from the network are decoded into characters, tokenized into HTML tags and text nodes, then assembled into a tree of `Node` objects. Because HTML parsing is incremental, the browser can begin displaying content before the entire document has arrived, which is why placing scripts at the bottom of `<body>` used to be the primary performance technique.

```
Bytes → Characters → Tokens → Nodes → DOM tree
```
The parser is **incremental** — browser renders partial HTML as it arrives.

**Tokenizer states:** Data → Tag open → Tag name → Before attribute name → ...

### CSSOM
```css
/* Specificity: (inline, id, class, tag) */
#header .nav a { }        /* (0,1,1,1) */
.nav a { }                /* (0,0,1,1) */
a { }                     /* (0,0,0,1) */
```

CSSOM is **not** incremental — browser waits for the full CSS before constructing CSSOM (to avoid re-rendering with wrong styles).

---

## Layout (Reflow)

Layout computes exact position/size of every element.

**What triggers reflow:**
- DOM insertions/removals
- `width`, `height`, `margin`, `padding`, `border` changes
- Font size changes
- Window resize
- `scrollTop`, `offsetHeight`, `getBoundingClientRect()` reads (forces sync layout)

**Layout thrashing — the classic perf killer:**
```js
// BAD — forces multiple synchronous layouts
const boxes = document.querySelectorAll('.box');
boxes.forEach(box => {
  const width = box.offsetWidth;  // READ → forces layout
  box.style.width = width * 2 + 'px'; // WRITE → invalidates layout
  // Next read in loop forces layout again!
});

// GOOD — batch reads then writes
const widths = Array.from(boxes).map(box => box.offsetWidth); // all READs
boxes.forEach((box, i) => {
  box.style.width = widths[i] * 2 + 'px'; // all WRITEs
});

// BETTER — use requestAnimationFrame
requestAnimationFrame(() => {
  const widths = Array.from(boxes).map(b => b.offsetWidth);
  requestAnimationFrame(() => {
    boxes.forEach((b, i) => b.style.width = widths[i] * 2 + 'px');
  });
});
```

---

## Paint & Composite

### Painting
After layout, the browser converts the computed geometry and styles into actual pixels in a series of 2D draw calls — this process is called painting. Each layer is painted independently into an off-screen bitmap. Paint is expensive for:
- `background-color` changes
- `color`, `text-shadow`
- `visibility`
- `border-radius` (partially)

### Compositing
Compositor thread combines layers and sends to GPU. **GPU-accelerated properties (no repaint):**
- `transform` (translate, rotate, scale)
- `opacity`
- `filter`
- `will-change: transform`

```css
/* BAD — triggers paint every frame */
.animate {
  animation: slide 1s;
}
@keyframes slide {
  from { left: 0; }    /* triggers layout + paint */
  to   { left: 100px; }
}

/* GOOD — compositor-only */
.animate {
  animation: slide 1s;
}
@keyframes slide {
  from { transform: translateX(0); }    /* GPU only */
  to   { transform: translateX(100px); }
}
```

**`will-change` — promote to own layer:**

`will-change` is a hint to the browser that an element will be animated. The browser responds by promoting the element to its own compositor layer ahead of time, so when the animation begins the compositor thread can handle it entirely without involving the main thread. This eliminates jank caused by main-thread JavaScript running during an animation. Use it sparingly — each promoted layer consumes GPU memory, and over-promotion causes more harm than good.

```css
.heavy-animation {
  will-change: transform; /* hint browser to promote */
}
/* Don't overuse — each layer uses GPU memory */
```

---

## Web APIs and the Event Loop

```
┌────────────────────────────────────────┐
│           Call Stack                   │
│  fn3()                                 │
│  fn2()                                 │
│  fn1()                                 │
└──────────────────┬─────────────────────┘
                   │ empty?
┌──────────────────▼─────────────────────┐
│           Event Loop                   │
└──────────┬─────────────┬───────────────┘
           │             │
┌──────────▼──┐    ┌─────▼────────────┐
│ Microtask   │    │   Task Queue     │
│ Queue       │    │  (macrotasks)    │
│ - Promises  │    │  - setTimeout    │
│ - queueMicro│    │  - setInterval   │
│ - MutationObs│   │  - I/O           │
│             │    │  - requestAnim.. │
└─────────────┘    └──────────────────┘
```

**rAF timing:**
```js
// requestAnimationFrame fires BEFORE paint, after JS
// runs at display refresh rate (60fps = ~16.67ms)

function gameLoop(timestamp) {
  update(timestamp);
  draw();
  requestAnimationFrame(gameLoop); // schedule next frame
}
requestAnimationFrame(gameLoop);
```

**`requestIdleCallback` — low-priority work:**
```js
requestIdleCallback((deadline) => {
  while (deadline.timeRemaining() > 0 && tasks.length) {
    doTask(tasks.shift());
  }
}, { timeout: 2000 }); // forced after 2s even if not idle
```

---

## Browser Storage

| Storage | Capacity | Persistence | Scope | Notes |
|---------|----------|-------------|-------|-------|
| Cookie | ~4KB | Configurable | Origin + path | Sent with requests |
| localStorage | 5-10MB | Forever | Origin | Sync API, blocks main thread |
| sessionStorage | 5-10MB | Tab session | Origin + tab | |
| IndexedDB | Hundreds MB | Forever | Origin | Async, transactional |
| Cache API | Browser-controlled | Service worker | Origin | HTTP cache |
| Origin Private FS | GB | Forever | Origin | File system access |

---

## Web Workers vs Service Workers vs Shared Workers

```
                    ┌─────────────────────────┐
                    │      Main Thread         │
                    │  (DOM, CSSOM, JS, etc.)  │
                    └──────┬──────┬────────────┘
                           │      │
              postMessage  │      │ postMessage
                    ┌──────▼──┐  ┌▼──────────────────┐
                    │  Web    │  │  Service Worker    │
                    │ Worker  │  │  (proxy for fetch) │
                    │(no DOM) │  │  survives tab close│
                    └─────────┘  └────────────────────┘
```

**Web Worker:**
```js
// main.js
const worker = new Worker('worker.js');
worker.postMessage({ data: largeArray });
worker.onmessage = (e) => console.log(e.data);

// worker.js
self.onmessage = (e) => {
  const result = heavyComputation(e.data.data);
  self.postMessage(result);
};
```

**Service Worker — offline & caching:**
```js
// sw.js
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('v1').then(cache => cache.addAll([
      '/', '/app.js', '/styles.css'
    ]))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached ?? fetch(e.request).then(response => {
        const clone = response.clone();
        caches.open('v1').then(cache => cache.put(e.request, clone));
        return response;
      });
    })
  );
});
```

---

## Common Interview Questions

**Q: What's the difference between reflow and repaint?**
Reflow = layout recalculation (geometry changed). Repaint = visual update (color changed, no geometry change). Reflow always triggers repaint; repaint doesn't trigger reflow.

**Q: How does browser parse HTML with a script tag mid-page?**
Parser hits `<script>`, halts HTML parsing, downloads (if external), executes JS, then resumes parsing. `defer` delays execution to after parsing. `async` downloads in parallel but executes immediately when ready (may interrupt parsing).

**Q: What is the compositor thread and why does it matter?**
Compositor runs on a separate thread from main. CSS `transform`/`opacity` animations can be handled entirely by compositor without touching main thread — no jank even if JS is busy.

**Q: Why is `document.write()` bad?**
Synchronously writes to the document mid-parse, blocking parsing. After load, it wipes the page. V8/Blink actively warns against it.

**Q: What is the "flash of unstyled content" (FOUC)?**
Happens when HTML renders before CSS loads. Solution: put CSS in `<head>`. FOUC is less common now but still relevant for async CSS loading patterns.

**Q: Explain the difference between `DOMContentLoaded` and `load`.**
`DOMContentLoaded` fires when HTML is parsed and DOM is ready (CSS/images may still be loading). `load` fires when everything including images/CSS/iframes is loaded.
