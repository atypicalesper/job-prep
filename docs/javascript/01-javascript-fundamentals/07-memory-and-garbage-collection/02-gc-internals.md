# V8 Garbage Collection Internals

---

## How V8 Manages Memory

V8 partitions its heap into distinct regions — called "spaces" — each optimized for a different object lifetime and access pattern. Rather than treating all allocations identically, the heap layout reflects the empirical observation that most objects either die very quickly or live for a very long time. Separating these populations allows V8 to apply fast, cheap collection to short-lived objects and slower, more thorough collection to long-lived ones. Understanding this layout is essential for diagnosing allocation pressure and tuning Node.js memory usage.

```
V8 Heap is divided into spaces:

New Space (Young Generation):
  ├─ From-space (active)     ~1-8 MB
  └─ To-space (copy target)  ~1-8 MB
  Scavenge GC — very fast, runs frequently

Old Space (Old Generation):
  ├─ Old Pointer Space        Objects with pointers to other objects
  ├─ Old Data Space           Objects with only data (strings, numbers)
  ├─ Code Space               JIT-compiled code
  ├─ Map Space                Hidden classes (shapes)
  └─ Large Object Space       Objects > 512KB (directly allocated, never moved)
  Mark-Compact GC — slow, runs infrequently
```

---

## Generational Hypothesis and Scavenge GC

```
Generational hypothesis:
  Most objects die young — they're created for one task and discarded.
  → Optimize for collecting short-lived objects quickly.

Scavenge (Minor GC) — runs every few MB of allocation:
  1. Start from GC roots (stack, globals, built-in objects)
  2. Trace all reachable objects in From-space
  3. COPY live objects to To-space (compacting — no fragmentation)
  4. Swap From-space and To-space
  5. Dead objects in old From-space are gone (no cleanup needed)

Objects that survive 2 scavenges → promoted to Old Space

Cost: proportional to LIVE objects (not dead ones!)
  → Creating and discarding many short-lived objects is CHEAP
  → Having many long-lived objects in New Space is expensive (they get copied)
```

```javascript
// Scavenge-friendly: short-lived objects
function processRequest(data) {
  const result = transform(data); // short-lived intermediates → GC'd quickly
  return result;
}

// Scavenge-unfriendly: objects that outlive their usefulness but stay in scope
const cache = {};  // lives in Old Space
function badCache(key, fn) {
  if (!cache[key]) cache[key] = fn(); // grows indefinitely
  return cache[key];
}
```

---

## Mark-and-Sweep (Major GC)

```
Triggered when Old Space is nearly full.

Three phases:

1. MARK (stop-the-world or incremental):
   - Start from GC roots (global object, stack variables, built-in objects)
   - Traverse the object graph, mark every reachable object
   - Tri-color marking: WHITE (unvisited), GRAY (visited, refs not processed), BLACK (done)
   - Incremental marking: spread marking over multiple small pauses

2. SWEEP:
   - Scan heap, add all WHITE (unmarked) objects to free lists
   - Memory is not zeroed — just marked as available

3. COMPACT (optional, expensive):
   - Moves live objects together to reduce fragmentation
   - Updates all pointers to new locations
   - Not done every cycle — only when fragmentation is high

Stop-the-world pause during final phase:
  - V8 uses incremental marking + concurrent sweeping to minimize pauses
  - Idle-time GC: V8 uses Chrome/Node.js idle periods for GC
```

---

## GC Roots

GC roots are the fixed set of starting points from which the garbage collector traces the live object graph. Any object reachable by following references from a root is considered "live" and will not be collected; everything else is eligible for reclamation. Roots include the global object, the currently executing call stack, closures that have been returned and are still referenced, and native C++ handles held by Node.js internals. The practical implication is that a single unintentional root reference — a lingering closure, a global variable, an uncleaned event listener — can anchor an entire object subgraph and prevent it from being collected.

```javascript
// GC roots — objects the GC always considers reachable:
// 1. Global object (globalThis)
// 2. Currently executing function's local variables (stack)
// 3. Closures capturing variables
// 4. Native C++ references (libuv handles, built-in objects)

// Everything else reachable from roots is kept. Everything else is GC'd.

let globalRef = { data: 'kept alive by global scope' };

function example() {
  let localRef = { data: 'kept alive during function execution' };

  let closure = () => localRef; // localRef is a root as long as closure exists
  return closure;
}

const fn = example();
// localRef is still alive — captured by fn (closure)
// fn is in global scope → fn is a root → localRef is reachable

fn = null;
// Now localRef is unreachable → GC'd on next cycle
```

---

## Hidden Classes (Shapes)

```javascript
// V8 creates "hidden classes" (shapes/maps) to track object structure.
// Objects with the same shape share a class → JIT optimization.

// ✅ Same hidden class — properties added in same order:
function Point(x, y) {
  this.x = x;  // C0 → C1 (adds x)
  this.y = y;  // C1 → C2 (adds y)
}
const p1 = new Point(1, 2); // uses C2
const p2 = new Point(3, 4); // uses C2 (same shape → fast)

// ❌ Different hidden classes — different property insertion order:
const obj1 = {};
obj1.x = 1;  // C0 → C1
obj1.y = 2;  // C1 → C2

const obj2 = {};
obj2.y = 1;  // C0 → C3 (different transition!)
obj2.x = 2;  // C3 → C4

// obj1 and obj2 have different hidden classes despite same properties
// → JIT can't optimize them together, slower property access

// ❌ Adding properties outside constructor:
const p3 = new Point(1, 2); // C2
p3.z = 3;  // deoptimizes — new hidden class C5, different from all others

// ❌ Deleting properties (makes object use "dictionary mode" — very slow):
delete p3.z; // don't do this in hot paths

// ✅ Best practices:
// - Always add all properties in constructor
// - Don't add/delete properties after construction
// - Keep objects consistently shaped
```

---

## Memory Limits and Tuning

Node.js inherits V8's default heap size limits, which were originally sized for browser tabs and can be insufficient for long-running server processes dealing with large datasets. The old-space limit (roughly 1.5 GB on 64-bit systems) is a hard ceiling — exceeding it triggers an OOM crash with no recovery. These limits can be raised via command-line flags before the process starts, and V8 exposes runtime statistics via the `v8` module so you can monitor heap pressure without external tooling. The `--expose-gc` flag is useful in tests and debugging but should never be used in production as it allows application code to trigger GC at arbitrary points.

```bash
# Node.js default heap sizes:
# 64-bit: ~1.5GB Old Space, ~16MB New Space

# Increase for memory-intensive workloads:
node --max-old-space-size=4096 server.js   # 4GB old space
node --max-semi-space-size=128 server.js   # 128MB semi-space (new space is 2x this)

# GC logging:
node --trace-gc server.js
# Output: [gc] ... Scavenge/MarkCompact ms → rest ms cause=...

# Expose GC to control it (dev/testing only!):
node --expose-gc server.js
# Then: global.gc() forces a GC cycle

# V8 flags for profiling:
node --prof server.js                    # generate v8.log
node --prof-process isolate-*.log        # process log

# Heap statistics at runtime:
const v8 = require('v8');
const stats = v8.getHeapStatistics();
/*
{
  total_heap_size: 8110080,
  total_heap_size_executable: 262144,
  total_physical_size: 8110080,
  total_available_size: 1518792024,  // how much more we can allocate
  used_heap_size: 4643736,
  heap_size_limit: 1526909922,       // --max-old-space-size
  malloced_memory: 8192,
  peak_malloced_memory: 139264,
  does_zap_garbage: 0,
  number_of_native_contexts: 2,
  number_of_detached_contexts: 0,    // should be 0 — non-zero = leak
}
*/
```

---

## WeakRef and FinalizationRegistry

`WeakRef` and `FinalizationRegistry` expose GC-aware reference semantics that were previously unavailable in JavaScript. A `WeakRef` holds a reference to an object without preventing the GC from collecting it — you must call `.deref()` to access the value and check whether it is still alive. `FinalizationRegistry` schedules a callback to run some time after the target object has been collected, which is useful for cleaning up associated external resources or stale cache keys. The critical caveat is that neither provides any timing guarantee — GC may run soon, much later, or not at all (in short processes) — so these APIs must not be used in code paths that require deterministic cleanup or correctness guarantees.

```javascript
// WeakRef: reference an object without preventing GC
// FinalizationRegistry: callback when object is GC'd (not guaranteed timing!)

// Cache that doesn't prevent GC:
class WeakCache<K extends object, V> {
  private cache = new Map<K, WeakRef<V>>();
  private registry = new FinalizationRegistry<K>((key) => {
    // Called sometime after value is GC'd (best effort):
    this.cache.delete(key);
    console.log(`Cache entry for ${String(key)} was GC'd`);
  });

  set(key: K, value: V) {
    this.cache.set(key, new WeakRef(value));
    this.registry.register(value, key); // register for cleanup notification
  }

  get(key: K): V | undefined {
    const ref = this.cache.get(key);
    if (!ref) return undefined;

    const value = ref.deref(); // undefined if GC'd
    if (!value) {
      this.cache.delete(key); // clean up stale ref
      return undefined;
    }
    return value;
  }
}

// ⚠️ Don't use WeakRef to implement critical logic:
// GC timing is non-deterministic — value may disappear at any point
// Use WeakMap for "object metadata" — WeakRef for optional caching only
```

---

## Interview Questions

**Q: What is the generational GC hypothesis and how does it apply to JavaScript?**
A: Most objects die young — created for a request/function and never referenced again. V8 exploits this by splitting the heap into Young (New Space, ~8MB) and Old Space. Young space uses Scavenge GC: copy live objects to a fresh space (fast, proportional to live objects). Short-lived objects never leave New Space — very cheap. Objects surviving 2+ scavenges promote to Old Space. Old Space uses Mark-Compact (slower, less frequent). Creating many short-lived objects is therefore NOT expensive in V8.

**Q: What are hidden classes and why do they matter for performance?**
A: V8 tracks object shape (which properties exist, in what order) with hidden classes. Objects sharing a shape share a hidden class → V8 can JIT-compile property access as a fixed offset (like C struct fields). If you add properties in different orders, delete properties, or add properties after construction, you create different hidden classes → V8 falls back to dictionary-mode hash lookup. Always initialize all properties in the constructor, in the same order, for maximum JIT optimization.

**Q: What is the difference between WeakMap and WeakRef?**
A: WeakMap holds weak references to its KEYS — when a key object has no other references, it's GC'd and the entry is automatically removed. Good for associating metadata with objects without leaking them. WeakRef holds a weak reference to any object — you explicitly call `.deref()` and check for `undefined`. Useful for optional caching. FinalizationRegistry gets notified after GC but with no timing guarantee. Neither should be used for critical application logic — only for memory-optional caching patterns.

**Q: How does incremental marking work in V8?**
A: Full stop-the-world GC causes noticeable pauses. V8's incremental marking spreads the marking phase across multiple small pauses (1-5ms) interleaved with JavaScript execution. A write barrier ensures that if JS modifies object references during marking (creating new pointers to white objects from black ones), those are re-queued for marking. The final "re-mark" phase is still stop-the-world but brief. Sweeping happens concurrently on background threads. This reduces max pause from hundreds of ms to under 10ms in most cases.
