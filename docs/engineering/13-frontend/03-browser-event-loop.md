# Browser Event Loop & Async Execution

---

## The Event Loop Model

The browser (and Node.js) are single-threaded — one call stack, one thread. The event loop continuously checks: "Is the call stack empty? If yes, pull the next task from the queue."

```
┌─────────────────────────────────────────────────┐
│                   Call Stack                     │
│   [ currently executing synchronous code ]       │
└───────────────────────┬─────────────────────────┘
                        │ (when empty)
          ┌─────────────▼──────────────┐
          │   Microtask Queue          │ ← Promises, queueMicrotask,
          │   (drained completely)     │   MutationObserver
          └─────────────┬──────────────┘
                        │ (when empty)
          ┌─────────────▼──────────────┐
          │   Render step (if due)     │ ← rAF callbacks, style/layout/paint
          └─────────────┬──────────────┘
                        │
          ┌─────────────▼──────────────┐
          │   Task Queue (macrotasks)  │ ← setTimeout, setInterval,
          │   (one task per iteration) │   I/O callbacks, MessageChannel
          └────────────────────────────┘
```

**Key rule**: after every **task**, the entire microtask queue is drained before the next task (or render step) begins.

---

## Tasks vs Microtasks

### Tasks (macrotasks)

One task per event loop iteration. Sources:
- `setTimeout(fn, delay)` — minimum delay (clamped to 1ms minimum, 4ms after 5 nested timers)
- `setInterval(fn, delay)`
- `<script>` execution (initial parse)
- I/O callbacks (XHR, fetch network events)
- `MessageChannel.port.postMessage()`
- UI events (click, input, keydown)

### Microtasks

Entire queue drained after every task and after every microtask. Sources:
- `Promise.then()` / `.catch()` / `.finally()`
- `async/await` (every `await` resumes as a microtask)
- `queueMicrotask(fn)`
- `MutationObserver` callbacks

### Execution order example

```js
console.log('1');                           // sync

setTimeout(() => console.log('2'), 0);     // task queue

Promise.resolve().then(() => {
  console.log('3');                         // microtask
  Promise.resolve().then(() => console.log('4')); // nested microtask
});

console.log('5');                           // sync

// Output: 1, 5, 3, 4, 2
```

**Why 3 before 2?** After the script task finishes, microtasks drain (3, then 4) before the next task (setTimeout) runs.

---

## The Rendering Step

The browser targets 60fps = one frame every ~16.67ms. The render step happens **between tasks** (not between microtasks), and only when the browser decides it's time to render.

```
Task → Microtasks → [Render if needed: rAF → Style → Layout → Paint → Composite]
     → Task → Microtasks → [Render if needed] → ...
```

### `requestAnimationFrame` (rAF)

rAF callbacks run **just before** the browser paints, inside the render step:

```js
requestAnimationFrame(() => {
  // Runs before paint, after the current task+microtasks
  element.style.transform = `translateX(${x}px)`;
});
```

**Critical**: rAF is not a task — it's part of the render step. This means:
- Microtasks queued during rAF run before paint.
- A rAF callback will never run faster than once per frame.
- Multiple rAF calls in one frame are batched (only fires once per frame per registration).

### Why avoid long microtask chains before rendering

```js
function infiniteMicrotasks() {
  Promise.resolve().then(infiniteMicrotasks); // starves rendering
}
```

Microtasks drain completely before rendering. An infinite microtask chain blocks painting and input handling entirely — the page freezes.

---

## `setTimeout(fn, 0)` in Depth

`setTimeout(fn, 0)` does NOT execute "immediately after the current code". It schedules a **task** (macrotask). All pending microtasks and a potential render step happen first.

**Minimum delay clamping:**
- Spec: 0ms minimum, browsers clamp to 1ms minimum.
- Nested timers (5+ levels deep): clamped to 4ms minimum (prevents CPU-burning tight loops).
- Background tabs: clamped to 1000ms to save CPU.

**Practical use:** break up a long synchronous task so the browser can render between chunks:
```js
function processBatch(items, offset = 0) {
  const CHUNK = 100;
  items.slice(offset, offset + CHUNK).forEach(process);
  if (offset + CHUNK < items.length) {
    setTimeout(() => processBatch(items, offset + CHUNK), 0);
  }
}
```

---

## `async`/`await` and the Event Loop

`await` suspends the async function and schedules the continuation as a microtask.

```js
async function example() {
  console.log('A');
  await Promise.resolve();
  console.log('B'); // microtask continuation
  await someFetch();
  console.log('C'); // microtask continuation (after fetch resolves)
}

example();
console.log('D');

// Output: A, D, B, (... fetch ...), C
```

**`await` with a non-Promise value**: `await 42` is equivalent to `await Promise.resolve(42)` — still suspends and resumes as a microtask (even though no actual async operation occurs). This can cause subtle ordering bugs.

### Promise chaining vs async/await

Both compile to the same microtask scheduling. But each `.then()` or each `await` introduces **at least one microtask hop**:

```js
// These are equivalent in scheduling:
Promise.resolve(1).then(v => v + 1).then(console.log);

async function f() {
  const v = await Promise.resolve(1);
  console.log(v + 1);
}
```

---

## Web Workers

Web Workers run on a separate thread — they have their own event loop and call stack.

```
Main thread:                   Worker thread:
  Call Stack                     Call Stack
  Microtask Queue                Microtask Queue
  Task Queue                     Task Queue
        |                               |
        └──── postMessage() ───────────►|
        |◄─── postMessage() ────────────┘
```

Communication via `postMessage` is task-based (arrives in the task queue). Shared state via `SharedArrayBuffer` + `Atomics` for lock-free, synchronous access.

**Workers cannot access the DOM.** They're used for CPU-intensive work (image processing, encryption, compression) that would block the main thread.

---

## Node.js Event Loop (differences)

Node's event loop has distinct phases (libuv-driven):

```
   ┌─────────────────────────────┐
┌─►│         timers              │  setTimeout, setInterval callbacks
│  └─────────────┬───────────────┘
│  ┌─────────────▼───────────────┐
│  │   pending callbacks         │  I/O errors from previous iteration
│  └─────────────┬───────────────┘
│  ┌─────────────▼───────────────┐
│  │       idle, prepare         │  internal use
│  └─────────────┬───────────────┘
│  ┌─────────────▼───────────────┐
│  │           poll              │  retrieve new I/O events; execute I/O callbacks
│  └─────────────┬───────────────┘
│  ┌─────────────▼───────────────┐
│  │           check             │  setImmediate callbacks
│  └─────────────┬───────────────┘
│  ┌─────────────▼───────────────┐
└──┤       close callbacks       │  socket.on('close', ...)
   └─────────────────────────────┘
```

Microtasks (`process.nextTick`, Promises) run **between each phase** (and between each callback within a phase in newer Node.js).

**`process.nextTick` vs `Promise.then`**: `nextTick` queue drains before Promise microtasks. Both run before the next I/O phase.

**`setImmediate` vs `setTimeout(fn, 0)`**: `setImmediate` runs in the check phase; `setTimeout(0)` in the timers phase. In the poll phase, `setImmediate` fires before `setTimeout(0)` — in the main module their order is non-deterministic.

---

## Interview Q&A

**Q: What is the difference between a task and a microtask?**
A task is a unit of work in the macrotask queue — one is processed per event loop iteration. A microtask is a smaller unit queued during a task; the entire microtask queue drains completely after every task (and after every microtask that queues more microtasks) before any rendering or the next task begins.

**Q: Why do Promise callbacks run before setTimeout callbacks?**
Promise `.then` callbacks are microtasks. Microtasks drain after the current task completes, before the next macrotask runs. `setTimeout` schedules a macrotask — it runs only after all microtasks from the current task are exhausted.

**Q: Can you starve the rendering pipeline with Promises?**
Yes. Since microtasks drain completely before any render step, an infinite Promise chain (e.g., `Promise.resolve().then(() => Promise.resolve().then(...))`) prevents the browser from rendering or processing user input — the page freezes. Yielding with `setTimeout(0)` or `scheduler.yield()` breaks the microtask starvation.

**Q: Why does `requestAnimationFrame` produce smooth animations but `setInterval` doesn't?**
`setInterval` fires on a fixed timer regardless of when the browser is about to paint. If the interval misaligns with the 16.67ms render cycle, frames are skipped or doubled. `rAF` fires exactly once per render frame, synchronized with the display refresh rate — never skips, never doubles.

**Q: What happens when you `await` inside a loop?**
Each `await` suspends the function and yields control. In a `for` loop, each iteration waits for the previous to complete — iterations run sequentially. If you need parallel execution, collect Promises and use `Promise.all`:
```js
// Sequential (slow):
for (const url of urls) await fetch(url);

// Parallel (fast):
await Promise.all(urls.map(url => fetch(url)));
```

**Q: Why is `process.nextTick` considered dangerous?**
`nextTick` callbacks run before Promises and before any I/O phase. Recursive `process.nextTick` (scheduling a new `nextTick` inside a `nextTick` callback) starves I/O entirely — the event loop never advances past the nextTick phase. Node.js docs recommend `setImmediate` for recursive scheduling.
