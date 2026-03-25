# Memory Leaks in JavaScript

## What is a Memory Leak?

A memory leak occurs when the program **allocates memory but never releases it**, causing memory to grow unboundedly over time. In JavaScript, GC handles memory automatically — but it can only collect memory that is **unreachable** (no references). A leak means you're holding references to objects longer than needed.

```
Signs of a memory leak:
- Node.js process memory grows continuously (watch with process.memoryUsage())
- Eventual out-of-memory crash
- Increasing heap size in profiling tools
- Degrading performance over time
```

---

## 1. Global Variable Accumulation

```javascript
// ❌ Global variables never get collected (exist for app lifetime)
function handleRequest(data) {
  cache = {}; // forgot 'let/const' — creates global!
  cache[data.id] = data; // grows forever
}

// ❌ Explicit global accumulation
global.requestLog = [];
app.use((req) => {
  global.requestLog.push(req.url); // unbounded growth!
});

// ✅ Use LRU cache or bounded structure
const LRU = require('lru-cache');
const cache = new LRU({ max: 500, ttl: 1000 * 60 * 5 });
```

---

## 2. Event Listeners Not Removed

```javascript
// ❌ Listener added but never removed
class MyComponent {
  constructor() {
    // Every time MyComponent is created, a new listener is added to the global emitter
    globalEmitter.on('data', this.handleData.bind(this));
    // When component is "destroyed", listener remains! Holds reference to component.
  }

  handleData(data) { /* ... */ }
}

// ✅ Remove listener when done
class MyComponent {
  constructor() {
    this._handleData = this.handleData.bind(this);
    globalEmitter.on('data', this._handleData);
  }

  destroy() {
    globalEmitter.off('data', this._handleData); // clean up!
  }

  handleData(data) { /* ... */ }
}

// ✅ Or use once() for single-use listeners
emitter.once('data', handler); // auto-removes after firing
```

### Node.js Warning About Max Listeners

Node.js tracks the number of listeners registered per event per emitter and emits a process warning when the count exceeds a threshold (default 10). This threshold exists specifically as an early warning for listener leaks — if you legitimately need more than 10 listeners for a single event you should raise it explicitly, but the warning is almost always a signal that a new listener is being added on each request, render cycle, or iteration without a corresponding removal.

```javascript
const emitter = new EventEmitter();
// Default max: 10 listeners per event before warning
emitter.setMaxListeners(20); // increase limit
emitter.getMaxListeners(); // check current limit

// Getting this warning? You probably have a listener leak:
// "MaxListenersExceededWarning: Possible EventEmitter memory leak detected"
```

---

## 3. Closures Holding References

```javascript
// ❌ Closure holds reference to large object unnecessarily
function setupHandler() {
  const largeData = new Array(1_000_000).fill('data'); // ~8MB

  return function handler() {
    // handler only needs largeData.length, but closes over ALL of largeData
    return largeData.length;
  };
}

const handler = setupHandler();
// largeData lives as long as handler is referenced!

// ✅ Extract only what you need before creating closure
function setupHandler() {
  const largeData = new Array(1_000_000).fill('data');
  const length = largeData.length; // extract
  // largeData can now be GC'd after this function returns

  return function handler() {
    return length; // only references 'length', not largeData
  };
}
```

---

## 4. Timers Not Cleared

```javascript
// ❌ Interval keeps running after component is gone
function startPolling(callback) {
  setInterval(callback, 1000); // no return value — can't cancel!
}

// The callback closure keeps references to whatever it closes over
// Even after you "remove" the component, the timer holds it alive

// ✅ Always store and clear intervals
class Poller {
  #intervalId = null;

  start(callback) {
    this.#intervalId = setInterval(callback, 1000);
  }

  stop() {
    if (this.#intervalId) {
      clearInterval(this.#intervalId);
      this.#intervalId = null;
    }
  }
}
```

---

## 5. Cache Without Eviction

```javascript
// ❌ Cache grows forever — classic leak
const cache = new Map();

function expensiveCompute(key) {
  if (cache.has(key)) return cache.get(key);
  const result = compute(key);
  cache.set(key, result); // never removed!
  return result;
}

// In a long-running server, cache can grow to gigabytes

// ✅ LRU Cache with max size
const { LRUCache } = require('lru-cache');
const cache = new LRUCache({ max: 1000, ttl: 1000 * 60 * 10 }); // 1000 items, 10min TTL

// ✅ Or manual TTL:
const timedCache = new Map();

function cacheSet(key, value, ttlMs) {
  timedCache.set(key, {
    value,
    expires: Date.now() + ttlMs
  });
}

function cacheGet(key) {
  const entry = timedCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    timedCache.delete(key); // expired
    return null;
  }
  return entry.value;
}
```

---

## 6. Promises That Never Resolve

```javascript
// ❌ Pending promise holds all its closure references
function leakyOperation() {
  return new Promise(resolve => {
    const hugeBuffer = Buffer.alloc(50_000_000); // 50MB

    // resolve is never called in some code paths!
    someAsyncThing.on('done', () => resolve(hugeBuffer));
    // If 'done' never fires, hugeBuffer stays in memory forever
  });
}

// ✅ Always have a timeout/cleanup for promises
function safeOperation(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout')), timeoutMs);

    someAsyncThing.on('done', (result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}
```

---

## 7. Detached DOM Nodes (Browser)

```javascript
// ❌ Detached node still referenced — never GC'd
let savedRef;
const container = document.getElementById('container');
const bigDiv = document.createElement('div');
bigDiv.innerHTML = '<table>...</table>'; // huge DOM

savedRef = bigDiv; // saved reference!
container.removeChild(bigDiv); // removed from DOM

// bigDiv is detached but savedRef still holds it — LEAK

// ✅ Null out references when done
container.removeChild(bigDiv);
savedRef = null; // allow GC
```

---

## Detecting Memory Leaks in Node.js

### 1. process.memoryUsage()

`process.memoryUsage()` returns a breakdown of the process's memory footprint sampled at the moment of the call. `heapUsed` is the most actionable metric — it reflects how much of the V8 heap is currently occupied by live objects. A monotonically increasing `heapUsed` over time (after GC cycles have had a chance to run) is the clearest programmatic signal of a leak. `rss` (Resident Set Size) includes the heap, native code, and stack; it can grow independently of `heapUsed` if native addons or Buffers are leaking.

```javascript
setInterval(() => {
  const { heapUsed, heapTotal, rss } = process.memoryUsage();
  console.log({
    heapUsed: `${(heapUsed / 1024 / 1024).toFixed(2)}MB`,
    heapTotal: `${(heapTotal / 1024 / 1024).toFixed(2)}MB`,
    rss: `${(rss / 1024 / 1024).toFixed(2)}MB`
  });
}, 5000);
// If heapUsed grows consistently → memory leak
```

### 2. Heap Snapshot with --inspect

A heap snapshot captures the entire object graph at a moment in time — every object, its type, its size, and what references it. The most effective leak-detection workflow is to take two snapshots (one before a suspected leak scenario, one after) and compare them using Chrome DevTools' "Objects allocated between snapshots" filter. The objects that appear in the second snapshot but not the first, and are still retained (not garbage-collected), are the leak candidates. Look at their retaining paths to find what is holding them alive.

```bash
node --inspect app.js
# Open Chrome → chrome://inspect
# Take heap snapshot → wait → take another snapshot
# Compare: filter by "Objects allocated between snapshots"
```

### 3. Programmatic Heap Snapshot

The `v8.writeHeapSnapshot()` API allows snapshots to be triggered from within the application itself — useful for automating leak detection in CI pipelines, capturing state on a specific signal (`SIGUSR2`), or snapshotting from a health-check endpoint in a staging environment. The resulting `.heapsnapshot` file uses the same format as Chrome DevTools and can be loaded and compared in the Memory tab.

```javascript
const v8 = require('v8');
const fs = require('fs');

function takeSnapshot(filename) {
  const snapshot = v8.writeHeapSnapshot(filename);
  console.log('Snapshot written:', snapshot);
}

// Take snapshots before and after suspected leak
takeSnapshot('snapshot1.heapsnapshot');
// ... do operations ...
takeSnapshot('snapshot2.heapsnapshot');
// Load both in Chrome DevTools Memory tab and compare
```

---

## WeakMap and WeakRef — Solutions

### WeakMap for Private Data (No Leak)

`WeakMap` solves the pattern of attaching per-object metadata without leaking memory when those objects are discarded. The keys are held weakly — when the key object becomes unreachable from everywhere else, the GC collects it and the `WeakMap` entry disappears automatically. This is the correct tool when the metadata lifetime should be tied to the object's lifetime, not managed manually. Before ES2022 private class fields (`#`), `WeakMap` was the standard pattern for truly private instance state.

```javascript
// WeakMap keys are weakly held — if key object is GC'd, entry is removed
const privateData = new WeakMap();

class Component {
  constructor() {
    privateData.set(this, {
      heavyCache: new Map(),
      listeners: []
    });
  }

  doWork() {
    const data = privateData.get(this);
    // use data...
  }
}

// When component is GC'd, privateData entry is automatically removed!
// No need to manually clean up
```

### WeakRef for Optional References

`WeakRef` is appropriate when you want to cache something for performance but are willing to recompute it if memory pressure causes the GC to collect it. Unlike `WeakMap` (where the key drives lifetime), `WeakRef` wraps any value and lets you check whether it is still alive on each access. The cache gracefully degrades under memory pressure rather than holding data in memory indefinitely. Always handle the `undefined` case from `.deref()` — treating it as guaranteed non-null is a common mistake.

```javascript
// WeakRef allows GC to collect the object even while referenced
class Cache {
  #store = new Map();

  set(key, value) {
    this.#store.set(key, new WeakRef(value));
  }

  get(key) {
    const ref = this.#store.get(key);
    if (!ref) return null;
    const value = ref.deref(); // returns undefined if GC'd
    if (value === undefined) {
      this.#store.delete(key); // clean up stale entry
      return null;
    }
    return value;
  }
}
```

---

## Interview Questions

**Q: What are the 6 most common JavaScript memory leak patterns?**
A: 1) Global variables, 2) Event listeners not removed, 3) Closures holding large objects, 4) Timers (setInterval) not cleared, 5) Cache without eviction/TTL, 6) Pending Promises that never resolve.

**Q: How do you detect a memory leak in a Node.js application?**
A: Monitor `process.memoryUsage().heapUsed` over time — consistent growth indicates a leak. Use `--inspect` flag + Chrome DevTools to take heap snapshots, then compare snapshots to find retained objects. Use clinic.js for production profiling.

**Q: What is the difference between WeakMap and Map for preventing leaks?**
A: WeakMap holds its keys weakly — when the key object is garbage collected (no other references), the WeakMap entry is automatically removed. Regular Map holds strong references — an entry exists until manually deleted. Use WeakMap when the entry lifetime should be tied to the key object's lifetime.
