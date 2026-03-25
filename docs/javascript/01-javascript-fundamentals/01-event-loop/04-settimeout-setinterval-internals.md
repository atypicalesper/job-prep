# setTimeout and setInterval Internals

## setTimeout — It's NOT Exactly Timed

`setTimeout(fn, delay)` is a host-provided API (not part of the JS engine itself) that registers a callback to be placed in the macrotask queue after at least `delay` milliseconds. It does NOT guarantee fn runs exactly after `delay` ms. It guarantees fn runs **no sooner** than `delay` ms. The actual delay can be much longer.

The minimum-delay guarantee exists because `setTimeout` only enqueues the callback — it cannot run until the call stack is empty and all pending microtasks have drained. If the event loop is busy with a long synchronous operation or a large microtask batch when the timer expires, the callback waits in the macrotask queue until the loop is free.

```javascript
const start = Date.now();
setTimeout(() => {
  console.log(`Ran after ${Date.now() - start}ms`);
}, 100);

// Typical output: "Ran after 101ms" or "Ran after 105ms"
// Can be much longer if event loop is busy
```

### Why the Delay is Not Exact

The delay is a minimum, not a target. The timer mechanism and the event loop are two separate systems: libuv (or the browser) tracks the expiry time and enqueues the callback when it passes, but the event loop must finish whatever it is currently doing before picking up that callback.

1. The timer fires, putting callback in macrotask queue
2. The event loop must finish current task first
3. All microtasks must drain
4. Only THEN does the callback run

```javascript
const start = Date.now();
setTimeout(() => {
  console.log(`Actual delay: ${Date.now() - start}ms`);
}, 100);

// Sync code that takes 500ms
const end = start + 500;
while (Date.now() < end) {} // busy wait — blocks event loop

// Output: "Actual delay: ~500ms" — timer was ready at 100ms
// but the event loop was blocked until 500ms
```

---

## Minimum Delay

Platform specifications impose a floor on how small the effective delay can be, regardless of what you pass. This exists partly for historical reasons (throttling nested timers to avoid runaway scripts) and partly because the OS timer resolution imposes a practical minimum. Passing `0` does not mean "immediately" — it means "as soon as the event loop is next free, after at least the platform minimum."

The HTML spec (browsers) specifies a minimum delay of **4ms** for nested timers (timers inside timers after 5 levels deep). Node.js has a minimum of **1ms**.

```javascript
// setTimeout(fn, 0) is actually setTimeout(fn, 1) in Node.js
setTimeout(() => console.log('setTimeout 0'), 0);
setTimeout(() => console.log('setTimeout 1'), 1);

// Both fire at the same time (within the same timer phase)
// Order between them is non-deterministic
```

---

## How Timers Work Internally

Understanding the data structure Node.js uses for timers explains why timer ordering can be non-deterministic and why multiple timers with the same expiry can fire in the same event loop tick. libuv maintains a min-heap — a binary tree sorted by expiry time so the soonest-to-expire timer is always at the root. During the "timers" phase of the Node.js event loop, libuv walks the heap from the top, running any timer whose expiry has passed, and stops when it finds one that hasn't expired yet.

Node.js (via libuv) uses a **min-heap** (priority queue) for timers, sorted by expiry time:

```
When you call setTimeout(fn, 100):
1. libuv records: (fn, now + 100ms)
2. Adds to min-heap sorted by expiry time

In event loop timers phase:
1. Peek at min-heap top (soonest expiry)
2. If expired: pop it, run callback, check next
3. If not expired: stop checking timers
```

This is why multiple timers with the same delay may run in the same tick, but order is not strictly guaranteed.

---

## setInterval — The Drift Problem

`setInterval` schedules recurring execution, but it has a fundamental design flaw: the interval is measured from when the *previous callback was scheduled*, not from when it finished executing. If the callback itself takes significant time, or if the event loop is busy, the actual gap between the end of one invocation and the start of the next shrinks — or disappears entirely. Over many iterations this compounds into noticeable drift.

`setInterval(fn, interval)` is supposed to run fn every `interval` ms. But in practice, it **drifts** because:
- The callback itself takes time
- The event loop may be busy

```javascript
// Problem: if fn takes 50ms and interval is 100ms,
// the actual interval between starts grows over time

setInterval(() => {
  const heavy = expensiveOperation(); // takes 50ms
}, 100);

// Timeline:
// t=0:   callback starts, takes 50ms
// t=100: callback starts again (100ms after SCHEDULING, not end)
// If callback takes 110ms: next fires IMMEDIATELY after (0ms gap)
```

### Self-Correcting Timer Pattern

The self-correcting approach replaces `setInterval` with a recursive `setTimeout` that subtracts the time already elapsed from the next scheduled delay. This way, if a callback runs slightly late, the next invocation compensates by scheduling itself sooner, keeping the long-term average close to the intended interval. Use this pattern whenever timing accuracy matters — polling, animation tick counters, or synchronization with external clocks.

```javascript
// Better approach: use recursive setTimeout
function scheduleNext(fn, interval) {
  const start = Date.now();
  fn();
  const elapsed = Date.now() - start;
  setTimeout(() => scheduleNext(fn, interval), Math.max(0, interval - elapsed));
}

scheduleNext(() => {
  console.log('drift-corrected tick');
}, 1000);
```

---

## clearTimeout and clearInterval

Both `setTimeout` and `setInterval` return an opaque timer ID that you can pass to the corresponding `clear*` function to cancel the pending callback. Failing to cancel intervals when they are no longer needed is a common source of memory leaks — the timer holds a reference to its callback, which may in turn hold references to large objects through a closure.

```javascript
const timerId = setTimeout(() => console.log('never runs'), 5000);
clearTimeout(timerId); // cancels it

const intervalId = setInterval(() => {
  console.log('tick');
}, 1000);

setTimeout(() => {
  clearInterval(intervalId); // stops after 3 ticks
}, 3500);
```

### Common Mistake: Not Storing the ID

```javascript
// ❌ Memory leak — can never cancel these
function startPolling() {
  setInterval(fetchData, 5000); // ID not stored
}

// ✅ Store the ID so you can cancel
class Poller {
  #intervalId;
  start() { this.#intervalId = setInterval(fetchData, 5000); }
  stop()  { clearInterval(this.#intervalId); }
}
```

---

## setInterval vs Recursive setTimeout

The choice between these two patterns comes down to whether you want a fixed schedule from the start time (setInterval) or a fixed gap between the end of one call and the start of the next (recursive setTimeout). For lightweight callbacks that complete in microseconds, the difference is negligible. For callbacks that do real work, recursive setTimeout prevents callbacks from stacking up and is generally the safer choice.

```javascript
// setInterval — fixed schedule from start time
setInterval(() => work(), 1000);

// Recursive setTimeout — gap between completions
function repeat() {
  work();
  setTimeout(repeat, 1000);
}
repeat();
```

| | setInterval | Recursive setTimeout |
|---|---|---|
| Gap behavior | Fixed from start | Fixed from end |
| Drift | Can overlap if slow | Accumulates gap |
| Use when | Fixed schedule needed | Avoid overlap, rate limit |
| Cancellation | clearInterval | clearTimeout each time |

---

## setTimeout(fn, 0) — Common Uses

### Yielding to the Event Loop

`setTimeout(fn, 0)` is the standard idiom for deliberately breaking a long synchronous operation into chunks that don't starve the event loop. Each `setTimeout(chunk, 0)` call allows the event loop to process any pending I/O callbacks, microtasks, and (in browsers) render frames between chunks. This keeps servers responsive and UIs interactive during CPU-intensive work without spawning Worker Threads.

```javascript
// ❌ Blocks UI/other requests while processing huge array
function processAll(items) {
  items.forEach(item => heavyProcess(item));
}

// ✅ Yield after each chunk — let other tasks breathe
function processInChunks(items, chunkSize = 100) {
  let index = 0;
  function processChunk() {
    const end = Math.min(index + chunkSize, items.length);
    for (; index < end; index++) {
      heavyProcess(items[index]);
    }
    if (index < items.length) {
      setTimeout(processChunk, 0); // yield, then continue
    }
  }
  processChunk();
}
```

### Deferring to After Current Render (Browser)

In browsers, `setTimeout(fn, 0)` also places the callback after the next render opportunity. This is useful when you need to trigger a CSS transition on an element that was just inserted into the DOM — the browser needs a chance to paint the initial state before the transition can animate from it to the new state.

```javascript
// Run after DOM has been updated
element.style.display = 'block';
setTimeout(() => {
  // Browser has had a chance to render the change
  element.classList.add('animate');
}, 0);
```

---

## Timer Ordering Pitfalls

Timer ordering is a frequent source of flaky tests and subtle bugs. Even timers with the same specified delay can fire in different orders across runs because the operating system's timer resolution and the event loop's current phase introduce non-determinism at the sub-millisecond level. Relying on the relative ordering of two `setTimeout(fn, 0)` calls is technically valid within a single Node.js run (FIFO for same-delay timers in the same phase) but should never be used as a correctness constraint in production code.

```javascript
// Which fires first?
setTimeout(() => console.log('A'), 0);
setTimeout(() => console.log('B'), 0);

// In Node.js: A then B (FIFO for same delay)
// But this is NOT guaranteed by spec
```

```javascript
// setTimeout 0 vs setImmediate — non-deterministic!
setTimeout(() => console.log('timeout'), 0);
setImmediate(() => console.log('immediate'));

// Output: either order! Depends on event loop timing
// EXCEPT inside an I/O callback — setImmediate is always first
```

---

## requestAnimationFrame (Browser Comparison)

`requestAnimationFrame` is the browser's purpose-built API for animation callbacks. Unlike `setTimeout`, it aligns with the display's actual refresh cycle, guarantees consistent 60fps scheduling when the tab is visible, and automatically pauses when the tab is hidden — saving battery and CPU. Use it for any visual animation work instead of `setTimeout(fn, 16)`, which is less accurate and wastes resources in background tabs.

In browsers, `requestAnimationFrame(fn)` is similar to `setTimeout(fn, 16)` but:
- Tied to display refresh rate (60fps = 16.67ms)
- Paused when tab is hidden (saves battery)
- More precise timing for animations
- Not available in Node.js

```javascript
// Browser animation loop
function animate() {
  draw();
  requestAnimationFrame(animate); // schedule next frame
}
requestAnimationFrame(animate);
```

---

## Interview Questions

**Q: If I call setTimeout(fn, 0), when does fn run?**
A: Not at 0ms. It runs after the current synchronous code AND all microtasks complete, then after at least 1ms (Node.js) or 4ms (nested in browsers). It's the next available macrotask opportunity.

**Q: Why does setInterval drift?**
A: setInterval schedules callbacks relative to when it was SET, not when the last callback finished. If callbacks are slow or the event loop is busy, the actual interval between callback completions grows. Use recursive setTimeout for consistent gaps.

**Q: How do you implement a timer that doesn't drift?**
A: Track the expected fire time, calculate drift, and subtract it from the next setTimeout delay:
```javascript
let expected = Date.now() + interval;
function step() {
  fn();
  expected += interval;
  setTimeout(step, Math.max(0, expected - Date.now()));
}
setTimeout(step, interval);
```

**Q: Can setTimeout be paused?**
A: Not natively. You'd have to clearTimeout and record remaining time, then re-schedule. Libraries like `clearTimeout` + Date tracking are common patterns.
