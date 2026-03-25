# Microtasks vs Macrotasks

## The Two Queues

JavaScript has two types of asynchronous task queues with different priorities:

```
┌────────────────────────────────────────────────────────────────┐
│                     Event Loop Tick                            │
│                                                                │
│  1. Run sync code (call stack)                                │
│  2. ┌─────────────────────────────────┐                       │
│     │     MICROTASK QUEUE (drain ALL)  │  ← HIGH PRIORITY     │
│     │  Promise.then / queueMicrotask   │                       │
│     │  process.nextTick (Node.js)      │                       │
│     └─────────────────────────────────┘                       │
│  3. ┌─────────────────────────────────┐                       │
│     │  MACROTASK QUEUE (take ONE)      │  ← LOWER PRIORITY    │
│     │  setTimeout / setInterval        │                       │
│     │  setImmediate / I/O callbacks    │                       │
│     └─────────────────────────────────┘                       │
│  4. Go back to step 2                                          │
└────────────────────────────────────────────────────────────────┘
```

---

## Microtasks

Microtasks are processed **immediately after the current synchronous code** finishes, before any macrotask runs. The entire microtask queue drains before moving on.

A microtask is any unit of work that the engine is required to complete before yielding control back to the event loop. The concept exists because Promise resolution must be atomic — if a `.then()` handler could be interrupted by a timer callback, promise chains would have inconsistent interleaving behavior. Microtasks are the mechanism that prevents that: they run to completion (including any new microtasks they schedule) before the next macrotask ever starts.

### Sources of Microtasks

| Source | Notes |
|--------|-------|
| `Promise.then()` | Most common source |
| `Promise.catch()` | Same as .then(undefined, handler) |
| `Promise.finally()` | Runs on both resolve and reject |
| `queueMicrotask(fn)` | Explicit microtask scheduling |
| `MutationObserver` | Browser only |
| `process.nextTick()` | Node.js only — runs BEFORE promise microtasks |

```javascript
// All microtask sources

// 1. Promise.then
Promise.resolve('hello').then(v => console.log('promise:', v));

// 2. queueMicrotask
queueMicrotask(() => console.log('queueMicrotask'));

// 3. process.nextTick (Node.js) — runs FIRST
process.nextTick(() => console.log('nextTick'));

console.log('sync');

// Output (Node.js):
// sync
// nextTick           ← process.nextTick runs before promises
// promise: hello
// queueMicrotask
```

---

## Macrotasks

Macrotasks (also called "tasks") are processed one at a time. After each macrotask, the microtask queue fully drains before the next macrotask runs.

A macrotask represents a discrete unit of work delivered by the host environment — typically a timer expiry, an I/O completion, or a UI event. The event loop picks exactly one macrotask per iteration, runs it to completion, then fully drains the microtask queue before picking the next one. This one-at-a-time design gives each task an uninterrupted execution window and ensures predictable interleaving with microtasks.

### Sources of Macrotasks

| Source | Notes |
|--------|-------|
| `setTimeout(fn, delay)` | After minimum delay |
| `setInterval(fn, delay)` | Recurring |
| `setImmediate(fn)` | Node.js only, after I/O |
| I/O callbacks | fs, net, etc. |
| UI events | click, keypress (browser) |
| `MessageChannel` | Browser/Node |

```javascript
setTimeout(() => console.log('macrotask 1'), 0);
setTimeout(() => console.log('macrotask 2'), 0);

Promise.resolve().then(() => console.log('microtask 1'));
Promise.resolve().then(() => console.log('microtask 2'));

// Output:
// microtask 1   ← both microtasks drain first
// microtask 2
// macrotask 1   ← then macrotasks run one at a time
// macrotask 2
```

---

## The Critical Rule: Microtasks Drain Completely

This is the most important rule. After EVERY macrotask (and after sync code), ALL pending microtasks run before anything else.

This rule applies recursively: if a microtask schedules another microtask, that new microtask also runs before any macrotask. The queue continues draining until it is completely empty. This property is what makes Promise chains behave as a single uninterrupted logical unit, but it also means a badly-written microtask loop can starve all macrotasks indefinitely.

```javascript
setTimeout(() => {
  console.log('macrotask');
  // Adding a microtask INSIDE a macrotask
  Promise.resolve().then(() => console.log('microtask inside macrotask'));
}, 0);

setTimeout(() => {
  console.log('macrotask 2');
}, 0);

// Output:
// macrotask
// microtask inside macrotask   ← drains before macrotask 2 runs
// macrotask 2
```

Even though the Promise was created after both setTimeouts were queued, it runs before the second setTimeout.

---

## Execution Order: Complete Priority Chain

Node.js adds an extra layer of scheduling on top of the standard browser model. `process.nextTick` callbacks have their own dedicated queue that runs even before the standard Promise microtask queue. Understanding this full ordering matters when mixing `nextTick`, Promises, `setImmediate`, and `setTimeout` in the same code path, as the output ordering can differ significantly from browser behavior.

From highest to lowest priority in Node.js:

```
1. Synchronous code (call stack)
2. process.nextTick callbacks        ← Node.js specific
3. Promise microtasks                ← Promise.then/catch/finally
4. queueMicrotask callbacks
5. setImmediate callbacks            ← Node.js check phase
6. setTimeout / setInterval          ← timers phase
7. I/O callbacks                     ← pending callbacks phase
```

```javascript
// Complex order test
setImmediate(() => console.log('setImmediate'));
setTimeout(() => console.log('setTimeout'), 0);
Promise.resolve().then(() => console.log('Promise'));
process.nextTick(() => console.log('nextTick'));
queueMicrotask(() => console.log('queueMicrotask'));
console.log('sync');

// Output (Node.js):
// sync
// nextTick
// Promise
// queueMicrotask
// setTimeout     (or setImmediate — order not guaranteed outside I/O)
// setImmediate   (or setTimeout)
```

---

## Nested Microtasks — Starvation Risk

Because the microtask queue drains completely before any macrotask runs, microtasks that continuously schedule new microtasks will prevent macrotasks — including `setTimeout`, `setInterval`, and I/O callbacks — from ever executing. This is called event loop starvation. A bounded microtask chain (one that terminates) is fine; an unbounded chain that self-perpetuates is a runtime deadlock for all macrotask-based work.

Microtasks can queue more microtasks:

```javascript
function step(i) {
  console.log(`step ${i}`);
  if (i < 5) {
    Promise.resolve().then(() => step(i + 1));
  }
}

step(1);
setTimeout(() => console.log('timeout'), 0);

// Output:
// step 1
// step 2
// step 3
// step 4
// step 5
// timeout   ← only runs after ALL microtasks complete
```

This is fine for a bounded chain. But infinite microtask loops are dangerous:

```javascript
// ❌ DANGEROUS — setTimeout never fires
function loop() {
  Promise.resolve().then(loop);
}
loop();
setTimeout(() => console.log('never runs'), 0);
```

---

## Practical Implications

### 1. Promise resolution is always async

Even when a Promise is already resolved at the time you call `.then()`, the handler is never invoked synchronously. It is always scheduled as a microtask and runs in a future microtask checkpoint. This guarantee means you can reason about the code after a `.then()` registration without worrying about the handler having already mutated state.

```javascript
let resolved = false;

Promise.resolve().then(() => {
  resolved = true;
});

console.log(resolved); // false — .then hasn't run yet
// resolved becomes true AFTER current sync code
```

### 2. Multiple awaits accumulate microtask delays

Each `await` in an async function introduces at minimum one microtask checkpoint — a point at which the async function suspends and other pending microtasks get a chance to run before the function resumes. In performance-sensitive code, a chain of many `await`s on already-resolved promises adds measurable scheduling overhead compared to synchronous code, even though no real I/O is involved.

```javascript
async function delay() {
  await Promise.resolve(); // queues microtask
  await Promise.resolve(); // queues another microtask
  return 'done';
}
```

Each `await` is a microtask checkpoint.

### 3. Use queueMicrotask for fine-grained control

`queueMicrotask` lets you explicitly schedule a callback in the microtask queue without the overhead of creating a Promise. It is useful when you need work to happen after the current synchronous operation but before any I/O or timer callback fires — for example, batching DOM updates or flushing a change buffer. Prefer it over `Promise.resolve().then(fn)` when you don't need the Promise object itself.

```javascript
// Schedule work to happen after sync code but before I/O
queueMicrotask(() => {
  // Runs before any setTimeout/setImmediate
  // But after current synchronous code
  batchUpdate();
});
```

---

## Interview Questions

**Q: What is the difference between a microtask and a macrotask?**
A: Microtasks (Promise.then, queueMicrotask) have higher priority and ALL drain before the next macrotask runs. Macrotasks (setTimeout, setInterval, I/O) run one at a time with a full microtask drain between each.

**Q: Can a microtask delay a setTimeout?**
A: Yes. If microtasks keep adding new microtasks, they can prevent setTimeout callbacks from ever running — called event loop starvation.

**Q: Is async/await microtask or macrotask based?**
A: Microtask. Each `await` suspends the current async function and schedules resumption as a microtask. This is why code after `await` always runs async, even if the awaited value is already resolved.

**Q: What's the output of:**
```javascript
async function test() {
  console.log('A');
  await null;
  console.log('B');
}
test();
console.log('C');
```
A: A, C, B — `await null` converts to `Promise.resolve(null)` and schedules the rest as a microtask, so 'C' (sync) runs first.
