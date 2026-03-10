# Node.js Event Loop — Phases Overview

## The Event Loop is NOT the Browser Event Loop

Node.js has its own event loop implementation via libuv, with more phases than the browser event loop.

```
   ┌───────────────────────────┐
┌─>│           timers          │  → setTimeout, setInterval callbacks
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │     pending callbacks     │  → I/O errors, TCP errors
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │       idle, prepare       │  → internal use only
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │           poll            │  → retrieve new I/O events, execute callbacks
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │           check           │  → setImmediate callbacks
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
└──│      close callbacks      │  → socket.on('close', ...) etc.
   └───────────────────────────┘
```

Between EVERY phase transition, Node.js drains:
1. `process.nextTick` queue
2. Promise microtask queue

---

## Phase Descriptions

### 1. Timers Phase
- Executes `setTimeout` and `setInterval` callbacks whose threshold has passed
- Checks the min-heap of timers and runs any that are ready
- Does NOT guarantee exact timing — runs callbacks AS SOON AS threshold is passed

### 2. Pending Callbacks Phase
- Executes I/O callbacks **deferred to the next loop iteration**
- Mostly TCP error callbacks (e.g., `ECONNREFUSED`)
- Not commonly hit in typical application code

### 3. Idle, Prepare Phase
- **Internal use only** — libuv internals
- Node.js user code never runs here

### 4. Poll Phase
- The most important phase — retrieves new I/O events
- If the poll queue has callbacks: execute them in order
- If the poll queue is empty:
  - If there are `setImmediate` callbacks: move to check phase
  - Otherwise: wait for I/O events (blocks until timeout or event arrives)
- This is where Node.js "sleeps" when idle

### 5. Check Phase
- `setImmediate` callbacks run here
- Always runs AFTER the poll phase

### 6. Close Callbacks Phase
- Runs `close` event callbacks
- e.g., `socket.destroy()` → `socket.on('close', ...)`

---

## The Two Special Queues (Between All Phases)

These run between EVERY phase, not as part of any phase:

### process.nextTick Queue
- Runs BEFORE any other async (including Promise microtasks)
- Drains completely before moving to next
- Can starve event loop if recursive

### Promise Microtask Queue
- Runs after nextTick queue
- Promise.then(), async/await continuations
- Also drains completely

```
PHASE COMPLETION → drain nextTick → drain Promise microtasks → NEXT PHASE
```

---

## Complete Execution Order

```javascript
// Let's trace this:
setImmediate(() => console.log('setImmediate'));
setTimeout(() => console.log('setTimeout'), 0);
Promise.resolve().then(() => console.log('Promise'));
process.nextTick(() => console.log('nextTick'));
console.log('sync');

// Output:
// sync          ← synchronous code first
// nextTick      ← nextTick queue (between end of sync and first phase)
// Promise       ← microtask queue
// setTimeout    ← timers phase (OR setImmediate first — non-deterministic outside I/O!)
// setImmediate  ← check phase
```

### Inside an I/O Callback — Deterministic Order

```javascript
const fs = require('fs');
fs.readFile(__filename, () => {
  // We are IN the poll phase now
  setImmediate(() => console.log('setImmediate'));
  setTimeout(() => console.log('setTimeout'), 0);
  process.nextTick(() => console.log('nextTick'));
  Promise.resolve().then(() => console.log('Promise'));
});

// Output (always):
// nextTick      ← immediately after I/O callback (between phases)
// Promise       ← microtask
// setImmediate  ← check phase comes NEXT after poll
// setTimeout    ← timers phase comes AFTER check
```

---

## Why setImmediate is Preferred for Recursive Operations

```javascript
// ❌ Recursive nextTick — starves event loop COMPLETELY
function badRecursion() {
  process.nextTick(badRecursion); // fills nextTick queue forever
}
badRecursion();
// setTimeout, setImmediate, and ALL I/O callbacks are blocked!

// ✅ Recursive setImmediate — yields between iterations
function goodRecursion() {
  setImmediate(goodRecursion); // runs in check phase, one per loop
}
goodRecursion();
// I/O, timers, etc. can still run between iterations
```

---

## Process Lifecycle

```javascript
// Node.js keeps running as long as there's work in the event loop:
// - Pending timers (setTimeout/setInterval)
// - Active I/O operations (server listening, open connections)
// - setImmediate callbacks
// - close events pending

const server = require('http').createServer();
server.listen(3000);
// Process stays alive (active network connection)

server.close();
// Process may exit now (if no other work pending)

// Force exit:
process.exit(0); // 0 = success, non-zero = error

// ref/unref — control whether handles keep process alive:
const timer = setInterval(() => {}, 1000);
timer.unref(); // won't prevent process exit
timer.ref();   // will prevent process exit (default)
```

---

## Interview Questions

**Q: What are the 6 phases of the Node.js event loop?**
A: 1) Timers (setTimeout/setInterval), 2) Pending callbacks (deferred I/O errors), 3) Idle/Prepare (internal), 4) Poll (new I/O events — main waiting phase), 5) Check (setImmediate), 6) Close callbacks. Between every phase, nextTick and Promise microtasks drain.

**Q: What happens in the poll phase when it's empty?**
A: If there are pending setImmediate callbacks, move to check phase. Otherwise, block and wait for I/O events with a calculated timeout (next timer expiry). This is how Node.js "sleeps" without busy-waiting.

**Q: Why is process.nextTick dangerous for recursive operations?**
A: `nextTick` runs between every phase and drains the entire queue before moving on. Recursive `nextTick` continuously adds to the queue, meaning the event loop NEVER moves to the next phase. I/O, timers, and setImmediate callbacks are all starved.

**Q: What is the difference between setImmediate and setTimeout(fn, 0)?**
A: Both run "soon" but in different phases. `setImmediate` runs in the check phase (after poll). `setTimeout(fn, 0)` runs in the timers phase. Inside an I/O callback, `setImmediate` ALWAYS runs before `setTimeout(fn, 0)`. Outside I/O callbacks, the order is non-deterministic (depends on OS timer resolution).
