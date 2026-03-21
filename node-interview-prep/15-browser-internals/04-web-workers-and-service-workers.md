# Web Workers & Service Workers

## Web Workers

Run JavaScript in a **background thread** — no access to DOM, separate event loop. Communicates with main thread via `postMessage`.

```
Main Thread               Worker Thread
───────────               ─────────────
(DOM, UI, events)         (CPU-heavy work)
     │                          │
     │──── postMessage ─────────▶
     │                          │ (runs in parallel)
     ◀─── postMessage ──────────
```

### Basic usage

```js
// worker.js
self.onmessage = function(e) {
  const { data, type } = e.data;

  if (type === 'COMPUTE') {
    const result = expensiveCalculation(data);
    self.postMessage({ type: 'RESULT', result });
  }
};

function expensiveCalculation(input) {
  // long-running CPU work — won't freeze the UI
  let result = 0;
  for (let i = 0; i < 1e9; i++) result += i;
  return result;
}
```

```js
// main.js
const worker = new Worker('/worker.js');

worker.postMessage({ type: 'COMPUTE', data: [1, 2, 3] });

worker.onmessage = (e) => {
  console.log('Result:', e.data.result);
};

worker.onerror = (e) => {
  console.error('Worker error:', e.message);
};

// Terminate when done
worker.terminate();
```

### Transferable objects (zero-copy)

```js
// Transferring ownership — no memory copy (huge for large ArrayBuffers)
const buffer = new ArrayBuffer(1024 * 1024); // 1MB
worker.postMessage({ buffer }, [buffer]); // second arg = transferable list
// After transfer: buffer in main thread is neutered (can't be used)
```

### Shared memory (SharedArrayBuffer + Atomics)

```js
// REQUIRES: COOP + COEP headers on the server
// Cross-Origin-Opener-Policy: same-origin
// Cross-Origin-Embedder-Policy: require-corp

const shared = new SharedArrayBuffer(4);
const arr = new Int32Array(shared);

// Main thread
worker.postMessage({ shared });
Atomics.store(arr, 0, 42);

// Worker
self.onmessage = (e) => {
  const arr = new Int32Array(e.data.shared);
  Atomics.wait(arr, 0, 0); // wait until arr[0] !== 0
  console.log(Atomics.load(arr, 0)); // 42
};
```

### Module Worker (modern)

```js
const worker = new Worker('/worker.js', { type: 'module' });
// worker.js can now use import/export
```

### Worker Pool pattern

```js
class WorkerPool {
  constructor(script, size = navigator.hardwareConcurrency) {
    this.workers = Array.from({ length: size }, () => new Worker(script));
    this.queue = [];
    this.idle = [...this.workers];
    this.workers.forEach(w => {
      w.onmessage = (e) => {
        this.idle.push(w);
        this.drain();
        e.data._resolve(e.data.result);
      };
    });
  }

  run(data) {
    return new Promise((resolve) => {
      this.queue.push({ data: { ...data, _resolve: resolve } });
      this.drain();
    });
  }

  drain() {
    while (this.idle.length && this.queue.length) {
      const worker = this.idle.pop();
      const task = this.queue.shift();
      worker.postMessage(task.data);
    }
  }
}

const pool = new WorkerPool('/worker.js', 4);
const result = await pool.run({ type: 'COMPUTE', input: largeData });
```

---

## Service Workers

Runs as a **proxy between browser and network**. Interceptss fetch requests, caches resources, enables offline, handles push notifications.

```
Browser Request ──▶ Service Worker ──▶ Network
                           │
                      Cache API ◀──── (can respond from cache)
```

### Lifecycle

```
Download → Install → Waiting → Activate → Controlling pages
```

```js
// sw.js
const CACHE_NAME = 'v2';
const STATIC_ASSETS = ['/index.html', '/styles.css', '/app.js'];

// Install: cache static assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting(); // take control immediately (don't wait for old SW to die)
});

// Activate: clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim(); // take control of all open tabs
});
```

### Fetch strategies

```js
// 1. Cache First (good for static assets — fonts, images, JS)
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// 2. Network First (good for API data — fresh when online, fallback when offline)
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});

// 3. Stale While Revalidate (show cached immediately, update in background)
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(response => {
          cache.put(e.request, response.clone());
          return response;
        });
        return cached || fetchPromise;
      })
    )
  );
});
```

### Registration

```js
// main.js — register in app entry point
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('SW registered:', reg.scope);
    } catch (err) {
      console.error('SW failed:', err);
    }
  });
}
```

### Background Sync

```js
// SW — sync queued requests when connectivity restores
self.addEventListener('sync', (e) => {
  if (e.tag === 'post-messages') {
    e.waitUntil(syncPendingMessages());
  }
});

async function syncPendingMessages() {
  const pending = await getPendingFromIndexedDB();
  await Promise.all(pending.map(msg => fetch('/api/messages', { method: 'POST', body: JSON.stringify(msg) })));
}

// Main thread — queue sync
async function sendMessage(data) {
  await saveToIndexedDB(data);
  const reg = await navigator.serviceWorker.ready;
  await reg.sync.register('post-messages');
}
```

### Push Notifications

```js
// Main — subscribe
const reg = await navigator.serviceWorker.ready;
const sub = await reg.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
});
// Send sub to your server
await fetch('/subscribe', { method: 'POST', body: JSON.stringify(sub) });

// SW — handle push
self.addEventListener('push', (e) => {
  const data = e.data?.json() ?? { title: 'New message' };
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon.png',
      badge: '/badge.png',
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/'));
});
```

---

## Web Worker vs Service Worker

| | Web Worker | Service Worker |
|---|---|---|
| Purpose | Offload CPU-heavy computation | Network proxy, offline, push |
| DOM access | ❌ | ❌ |
| Lifetime | Lives as long as page | Can live after page closes |
| Scope | One page | All pages on the origin |
| Multiple instances | Multiple per page | One per scope |
| Fetch interception | ❌ | ✅ |
| IndexedDB | ✅ | ✅ |

---

## SharedWorker

A single worker **shared across all tabs** on the same origin:

```js
// shared-worker.js
const clients = new Set();
self.onconnect = (e) => {
  const port = e.ports[0];
  clients.add(port);
  port.onmessage = (e) => {
    // Broadcast to all tabs
    clients.forEach(p => p.postMessage(e.data));
  };
  port.start();
};

// main.js — any tab
const worker = new SharedWorker('/shared-worker.js');
worker.port.postMessage({ type: 'CHAT', text: 'Hello from tab 1' });
worker.port.onmessage = (e) => console.log('Broadcast:', e.data);
worker.port.start();
```

Use case: maintain a single SSE/WebSocket connection, broadcast to all tabs via SharedWorker instead of one connection per tab.

---

## Interview Q&A

**Q: When would you use a Web Worker?**

When you have CPU-bound work that would block the main thread and freeze the UI: image/video processing, large data transformations, cryptography, Wasm execution, heavy parsing (CSV, large JSON). Rule of thumb: anything that takes >16ms to compute should be moved to a worker.

**Q: What's the difference between a Web Worker and a Service Worker?**

Web Worker: computational background thread, lives while the page is open, scoped to one page. Service Worker: network proxy, can outlive the page, scoped to an entire origin, intercepts all fetch requests, enables offline mode and push notifications. Service Workers are about I/O; Web Workers are about CPU.

**Q: How do you update a Service Worker without breaking users on old caches?**

Increment the cache name (`v1` → `v2`). The new SW installs alongside the old one and waits. In the `activate` handler, delete old caches. Use `self.skipWaiting()` in install and `clients.claim()` in activate to take control immediately. Or show a "New version available — refresh" banner and call `reg.waiting.postMessage({ type: 'SKIP_WAITING' })` when user confirms.

**Q: What are the security requirements for SharedArrayBuffer?**

The page must be cross-origin isolated: `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers. This was added after Spectre — speculative execution attacks could read memory across origins without isolation. COOP/COEP ensure all resources on the page opt in to isolation.
