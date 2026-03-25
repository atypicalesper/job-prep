# Web APIs

The browser's built-in APIs beyond DOM manipulation — Observers, Workers, storage, streams, and more.

---

## Intersection Observer

Efficiently detect when elements enter/exit the viewport — no scroll event listeners.

```javascript
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      // Element is visible
      entry.target.classList.add('visible');
      observer.unobserve(entry.target); // stop observing once visible
    }
  });
}, {
  root: null,          // viewport
  rootMargin: '0px 0px -100px 0px',  // trigger 100px before bottom of viewport
  threshold: 0.1,      // 10% of element visible
});

// Observe all lazy images
document.querySelectorAll('img[data-src]').forEach(img => observer.observe(img));

// Lazy load image
const lazyLoad = new IntersectionObserver((entries) => {
  entries.forEach(({ isIntersecting, target }) => {
    if (isIntersecting) {
      target.src = target.dataset.src;
      lazyLoad.unobserve(target);
    }
  });
});
```

**Use cases**: lazy loading images/components, infinite scroll, read progress tracking, analytics (track visible ads/content), animate-on-scroll.

---

## ResizeObserver

React to element size changes — not window resize.

```javascript
const ro = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const { width, height } = entry.contentRect;
    console.log(`Element is now ${width}×${height}`);

    // Adjust chart, canvas, responsive component
    if (width < 400) entry.target.classList.add('compact');
    else entry.target.classList.remove('compact');
  }
});

ro.observe(document.querySelector('.chart-container'));
ro.unobserve(element);
ro.disconnect(); // stop all observations
```

**vs window resize**: ResizeObserver fires per element, not globally. Catches: CSS class changes, flex/grid reflow, sidebar collapse, dynamic content insertion.

---

## MutationObserver

Watch for DOM changes — attributes, children, text content.

```javascript
const mo = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach(node => console.log('Added:', node));
      mutation.removedNodes.forEach(node => console.log('Removed:', node));
    }
    if (mutation.type === 'attributes') {
      console.log(`${mutation.attributeName} changed to ${mutation.target.getAttribute(mutation.attributeName)}`);
    }
  }
});

mo.observe(document.getElementById('root'), {
  childList: true,      // watch for added/removed children
  subtree: true,        // watch all descendants
  attributes: true,     // watch attribute changes
  attributeFilter: ['class', 'data-state'],  // only these attributes
  characterData: true,  // watch text node changes
});

mo.disconnect();
```

**Use cases**: analytics (track DOM changes by third-party scripts), custom elements reacting to attribute changes, virtual scroll implementations, detecting when a framework renders content.

---

## Web Workers

Run JavaScript on a separate thread — no access to DOM, but no blocking the main thread.

```javascript
// main.js
const worker = new Worker('/worker.js');

worker.postMessage({ data: largeArray, operation: 'sort' });

worker.onmessage = ({ data }) => {
  console.log('Result:', data.result);
};

worker.onerror = (e) => console.error(e.message);
worker.terminate(); // when done
```

```javascript
// worker.js
self.onmessage = ({ data }) => {
  const { data: arr, operation } = data;

  let result;
  if (operation === 'sort') result = arr.sort((a, b) => a - b);

  self.postMessage({ result });
};
```

### Inline Workers (no separate file)

When a separate worker file is inconvenient — such as in bundler-free environments, quick scripts, or testing contexts — a worker can be created by constructing a `Blob` from an inline string and generating a temporary object URL. This avoids the need for a dedicated file but loses the benefits of static analysis, TypeScript checking, and bundler code-splitting for the worker code. Use inline workers for simple, short-lived operations; use file-based workers for anything that benefits from normal tooling.

```javascript
const workerCode = `
  self.onmessage = ({ data }) => {
    const result = data.reduce((sum, n) => sum + n, 0);
    self.postMessage(result);
  };
`;

const blob = new Blob([workerCode], { type: 'application/javascript' });
const worker = new Worker(URL.createObjectURL(blob));
```

### SharedArrayBuffer + Atomics (shared memory)

`SharedArrayBuffer` is the only mechanism for true shared memory between the main thread and workers in the browser — all other `postMessage` communication copies data. It allocates a fixed-size memory buffer that multiple threads can read and write simultaneously. Because concurrent writes to the same memory location produce data races, `Atomics` provides a set of lock-free, thread-safe operations (load, store, add, compareExchange, wait, notify) that guarantee visibility and ordering across threads. `SharedArrayBuffer` requires cross-origin isolation headers because it was temporarily disabled after Spectre vulnerabilities.

```javascript
// main.js
const sab = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 1000);
const shared = new Int32Array(sab);

const worker = new Worker('/worker.js');
worker.postMessage({ buffer: sab });

// Atomic operations — thread-safe
Atomics.store(shared, 0, 42);
const val = Atomics.load(shared, 0);
Atomics.add(shared, 1, 1); // atomic increment
```

Requires cross-origin isolation headers: `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`.

**Use cases**: image/video processing, encryption/hashing, CSV/JSON parsing, physics simulations, WebAssembly execution, ML inference.

---

## Service Workers

Proxy between browser and network — enables offline, caching, push notifications, background sync.

```javascript
// Register (main thread)
if ('serviceWorker' in navigator) {
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  console.log('SW registered:', reg.scope);
}
```

```javascript
// sw.js — lifecycle
const CACHE = 'v1';
const PRECACHE = ['/', '/index.html', '/app.js', '/styles.css'];

// Install — precache assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE))
  );
  self.skipWaiting(); // activate immediately
});

// Activate — clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — intercept requests
self.addEventListener('fetch', (e) => {
  e.respondWith(
    // Cache-first strategy
    caches.match(e.request).then(cached => {
      if (cached) return cached;

      return fetch(e.request).then(response => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      });
    })
  );
});
```

### Caching Strategies

The caching strategy you choose for a given request type determines the trade-off between freshness and speed. **Cache-first** serves from cache immediately and is ideal for static assets that change infrequently — it minimizes network usage but risks staleness. **Network-first** always tries the network and falls back to cache on failure — right for API calls where freshness matters more than speed. **Stale-while-revalidate** returns a cached response instantly for responsiveness while simultaneously fetching an update in the background — the best option when you want fast loads and eventual consistency without waiting for the network.

```javascript
// Network-first (API calls — fresh data, fallback to cache)
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
    return response;
  } catch {
    return caches.match(request);
  }
}

// Stale-while-revalidate (fast response + background update)
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    cache.put(request, response.clone());
    return response;
  });

  return cached ?? fetchPromise;
}
```

### Push Notifications

Browser push notifications work through a three-party flow: the browser generates a push subscription (containing a public endpoint and encryption keys), your app sends that subscription to your server, and your server uses it to push messages via the Web Push Protocol — even when the user's tab is closed. The service worker wakes up to receive the push event and display the notification. VAPID keys authenticate your server to the push service and prevent unauthorized parties from sending notifications through your subscription endpoint.

```javascript
// Get push subscription
const sub = await reg.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
});

// Send sub to your server
await fetch('/subscribe', { method: 'POST', body: JSON.stringify(sub) });

// sw.js — receive push
self.addEventListener('push', (e) => {
  const data = e.data?.json() ?? {};
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon.png',
      data: { url: data.url },
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data.url));
});
```

---

## IndexedDB

Client-side database for large structured data. Async, transactional, supports indexes.

```javascript
// Open / upgrade
const request = indexedDB.open('mydb', 2);

request.onupgradeneeded = ({ target: { result: db }, oldVersion }) => {
  if (oldVersion < 1) {
    const store = db.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
    store.createIndex('by_email', 'email', { unique: true });
  }
  if (oldVersion < 2) {
    db.createObjectStore('settings', { keyPath: 'key' });
  }
};

const db = await new Promise((res, rej) => {
  request.onsuccess = e => res(e.target.result);
  request.onerror = e => rej(e.target.error);
});

// Write
const tx = db.transaction('users', 'readwrite');
await new Promise((res, rej) => {
  const req = tx.objectStore('users').add({ email: 'user@example.com', name: 'Tarun' });
  req.onsuccess = () => res(req.result);
  req.onerror = () => rej(req.error);
});

// Read by index
const emailTx = db.transaction('users', 'readonly');
const user = await new Promise((res, rej) => {
  const req = emailTx.objectStore('users').index('by_email').get('user@example.com');
  req.onsuccess = () => res(req.result);
  req.onerror = () => rej(req.error);
});
```

**idb library** (wrapper):
```javascript
import { openDB } from 'idb';

const db = await openDB('mydb', 2, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      const store = db.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
      store.createIndex('email', 'email', { unique: true });
    }
  }
});

await db.add('users', { email: 'user@example.com' });
const user = await db.getFromIndex('users', 'email', 'user@example.com');
```

---

## Other Useful APIs

### Clipboard API

The Clipboard API provides asynchronous read/write access to the system clipboard. Write access (`writeText`, `write`) is permitted in user-gesture event handlers without a permission prompt. Read access (`readText`, `read`) requires the user to grant the `clipboard-read` permission. Use this API instead of the deprecated `document.execCommand('copy')` pattern — it is Promise-based, doesn't require a selected DOM node, and handles both text and rich content.

```javascript
await navigator.clipboard.writeText('copied!');
const text = await navigator.clipboard.readText(); // requires permission
```

### File System Access API

The File System Access API lets web apps read and write files on the user's local filesystem through a permission-gated picker dialog — no server round-trip required. Unlike the older `<input type="file">` approach, it provides writable file handles so you can save changes back to the original file. This makes it suitable for local-first web apps (code editors, image tools, document editors). It is currently supported in Chromium-based browsers only; for cross-browser needs, fall back to download-link patterns for writes and `<input>` for reads.

```javascript
// Pick a file
const [handle] = await window.showOpenFilePicker({ types: [{ accept: { 'text/*': ['.txt', '.md'] } }] });
const file = await handle.getFile();
const text = await file.text();

// Save to file
const saveHandle = await window.showSaveFilePicker({ suggestedName: 'output.txt' });
const writable = await saveHandle.createWritable();
await writable.write('Hello file!');
await writable.close();
```

### Web Streams API

The Web Streams API provides a standardized, browser-native way to process data incrementally — reading, transforming, and writing chunks without loading the entire payload into memory. `ReadableStream` models a source (a `fetch` response body is one), `WritableStream` models a sink, and `TransformStream` sits in between to modify chunks as they flow through. Streams are composable via `.pipeThrough()` and `.pipeTo()` which handle backpressure automatically: if the sink is slower than the source, the pipeline pauses the source rather than buffering unboundedly.

```javascript
// ReadableStream — process large file without loading into memory
const response = await fetch('/large-file.csv');
const reader = response.body.getReader();

while (true) {
  const { done, value } = await reader.read(); // Uint8Array chunk
  if (done) break;
  processChunk(new TextDecoder().decode(value));
}

// Transform stream — pipe through transformation
const { readable, writable } = new TransformStream({
  transform(chunk, controller) {
    controller.enqueue(chunk.toUpperCase());
  }
});
```

### Broadcast Channel

`BroadcastChannel` enables message passing between any browsing contexts (tabs, iframes, workers) on the same origin, without needing a shared service worker or localStorage polling. It is a simple publish-subscribe bus scoped to a named channel: any context that creates a `BroadcastChannel` with the same name can post and receive messages. Use it for cross-tab state synchronization — logout propagation, theme changes, shopping cart updates — where you want all tabs to reflect the same state instantly.

```javascript
// Communicate between tabs/workers on same origin
const bc = new BroadcastChannel('app-updates');
bc.postMessage({ type: 'logout' });
bc.onmessage = ({ data }) => {
  if (data.type === 'logout') window.location.href = '/login';
};
```

### Performance API

The Performance API provides high-resolution timing and structured measurement primitives that are far more accurate and ergonomic than `Date.now()` differences. `performance.mark()` stamps a named point in time; `performance.measure()` records the duration between two marks as a named entry in the performance timeline. `PerformanceObserver` lets you subscribe to categories of entries (long tasks, navigation timing, resource timing, layout shifts) asynchronously without polling. Long task monitoring — any task over 50ms — is essential for diagnosing main-thread jank that hurts interactivity scores.

```javascript
performance.mark('start-operation');
await doSomething();
performance.mark('end-operation');
performance.measure('operation', 'start-operation', 'end-operation');

const [measure] = performance.getEntriesByName('operation');
console.log(`Took ${measure.duration}ms`);

// Observe long tasks (> 50ms)
const observer = new PerformanceObserver((list) => {
  list.getEntries().forEach(entry => {
    if (entry.duration > 50) console.warn('Long task:', entry.duration);
  });
});
observer.observe({ entryTypes: ['longtask', 'measure', 'navigation'] });
```

---

## Interview Questions

**Q: When would you use a Web Worker vs a Service Worker?**

Web Workers: CPU-heavy computations on a background thread (sorting, encryption, parsing) without blocking the UI. They live as long as the page. Service Workers: intercept network requests, cache responses, enable offline, push notifications. They're persistent (survive page close), act as a proxy. You can have both — a Service Worker for caching/offline, a Web Worker for heavy computation.

**Q: Explain the Service Worker lifecycle.**

Install → Activate → Fetch. On first load: `install` event fires (precache assets). The new SW waits for old SW to release control (or `skipWaiting()` to force). Then `activate` fires (clean old caches). After activation, SW intercepts all `fetch` events via `clients.claim()`. On update: new SW installs alongside old, waits until all tabs close (or `skipWaiting()`). This ensures no two versions run simultaneously.

**Q: IndexedDB vs localStorage — when do you use each?**

`localStorage`: synchronous, ~5MB, strings only. Use for small config, user preferences, theme. `IndexedDB`: asynchronous, 50MB+ (browser-dependent), any JS value, transactional, indexes. Use for offline data, large datasets, structured app data (drafts, cache). `sessionStorage`: like localStorage but cleared on tab close. For sensitive session data that shouldn't persist.

**Q: How does the Intersection Observer improve performance vs scroll listeners?**

Scroll listeners fire on every scroll event (60fps = 16ms per frame), require `getBoundingClientRect()` which forces layout reflow, and can cause jank. Intersection Observer is asynchronous, runs off the main thread, batches observations, and notifies only on actual intersection changes — browser-native, no layout thrashing.
