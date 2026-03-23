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

```javascript
let resolved = false;

Promise.resolve().then(() => {
  resolved = true;
});

console.log(resolved); // false — .then hasn't run yet
// resolved becomes true AFTER current sync code
```

### 2. Multiple awaits accumulate microtask delays

```javascript
async function delay() {
  await Promise.resolve(); // queues microtask
  await Promise.resolve(); // queues another microtask
  return 'done';
}
```

Each `await` is a microtask checkpoint.

### 3. Use queueMicrotask for fine-grained control

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
