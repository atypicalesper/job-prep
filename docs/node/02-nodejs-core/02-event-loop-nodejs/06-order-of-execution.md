# Node.js — Complete Order of Execution

## The Complete Priority Chain

```
Priority (highest → lowest):
1. Synchronous code (call stack)
2. process.nextTick callbacks        ← Node.js nextTick queue
3. Promise microtasks                ← Promise.then/catch/finally, async/await
4. setImmediate callbacks            ← Check phase
5. setTimeout / setInterval          ← Timers phase
6. I/O callbacks                     ← Pending callbacks / Poll phase
7. close callbacks                   ← Close phase
```

**Critical rule:** Steps 2 and 3 run between EVERY event loop phase, draining completely each time.

---

## Code Tracing Examples

### Example 1: Basic Order

```javascript
console.log('1-sync');

setTimeout(() => console.log('2-setTimeout'), 0);

Promise.resolve().then(() => console.log('3-promise'));

process.nextTick(() => console.log('4-nextTick'));

setImmediate(() => console.log('5-setImmediate'));

console.log('6-sync');

// Output:
// 1-sync
// 6-sync
// 4-nextTick
// 3-promise
// 5-setImmediate (or 2-setTimeout — non-deterministic outside I/O)
// 2-setTimeout   (or 5-setImmediate)
```

### Example 2: Inside I/O — Deterministic

```javascript
const fs = require('fs');

fs.readFile(__filename, () => {
  console.log('A-io-callback');

  process.nextTick(() => console.log('B-nextTick'));
  Promise.resolve().then(() => console.log('C-promise'));
  setImmediate(() => console.log('D-setImmediate'));
  setTimeout(() => console.log('E-setTimeout'), 0);
});

// Output (always, inside I/O):
// A-io-callback
// B-nextTick
// C-promise
// D-setImmediate   ← check phase is NEXT after poll
// E-setTimeout     ← timers phase is AFTER check
```

### Example 3: Nested nextTick and Promises

```javascript
process.nextTick(() => {
  console.log('A');
  process.nextTick(() => console.log('B')); // adds to current nextTick queue
  Promise.resolve().then(() => console.log('C'));
});

Promise.resolve().then(() => {
  console.log('D');
  process.nextTick(() => console.log('E')); // nextTick queue for after THIS microtask
  Promise.resolve().then(() => console.log('F'));
});

// Output: A B D E C F
// Why:
// - nextTick drains: A (adds B to queue, C to promise queue)
// - Continue draining nextTick: B
// - nextTick empty → drain promises: D (adds E to nextTick, F to promise)
// - Promise queue → process nextTick before more promises: E
// - Back to promise queue: C, F
```

Wait — actually process.nextTick added during promise execution goes to... let me think:

In Node.js, after each microtask (each individual promise resolution), the nextTick queue is checked again BEFORE continuing with remaining promise microtasks.

**Corrected output:** `A B D E C F`

### Example 4: setImmediate Recursion vs I/O

```javascript
const fs = require('fs');

setImmediate(() => console.log('outer setImmediate'));

fs.readFile(__filename, () => {
  console.log('file read');
  setImmediate(() => console.log('inner setImmediate')); // added during poll phase
});

// Output:
// outer setImmediate  ← runs in check phase (first loop)
// file read           ← I/O callback
// inner setImmediate  ← check phase (second loop)
```

---

## The Full Sequence Diagram

```
START:
  Run synchronous code (script.js or REPL input)

LOOP BEGIN:
  ├── Drain process.nextTick queue (ALL)
  ├── Drain Promise microtask queue (ALL)
  │
  ├─ TIMERS PHASE:
  │   Run setTimeout/setInterval callbacks whose time has come
  │   After each callback: drain nextTick + Promise queues
  │
  ├─ PENDING CALLBACKS PHASE:
  │   Run deferred I/O callbacks
  │   After each callback: drain nextTick + Promise queues
  │
  ├─ (IDLE/PREPARE — internal)
  │
  ├─ POLL PHASE:
  │   Execute I/O callbacks in poll queue (drain it)
  │   If empty and setImmediate exists → go to CHECK
  │   If empty and no setImmediate → wait for I/O (up to timer threshold)
  │   After each callback: drain nextTick + Promise queues
  │
  ├─ CHECK PHASE:
  │   Run all setImmediate callbacks
  │   After each callback: drain nextTick + Promise queues
  │
  ├─ CLOSE CALLBACKS PHASE:
  │   Run close event handlers
  │
  └─ If any pending work → LOOP AGAIN
     If nothing pending → EXIT
```

---

## Key Interview Scenarios

### Scenario 1: Which fires first — setTimeout(0) or setImmediate?

```javascript
// Outside I/O → NON-DETERMINISTIC
setTimeout(() => console.log('timeout'), 0);
setImmediate(() => console.log('immediate'));
// Could be either order!

// Inside I/O → ALWAYS setImmediate first
fs.readFile('file', () => {
  setTimeout(() => console.log('timeout'), 0);    // timers phase (later)
  setImmediate(() => console.log('immediate'));   // check phase (next!)
});
// Always: immediate → timeout
```

### Scenario 2: process.nextTick vs Promise

```javascript
Promise.resolve().then(() => console.log('promise'));
process.nextTick(() => console.log('nextTick'));
// Always: nextTick → promise
// nextTick queue drains BEFORE Promise microtask queue
```

### Scenario 3: Nested Timers

```javascript
setTimeout(() => {
  console.log('outer timeout');
  setTimeout(() => console.log('inner timeout'), 0);
  setImmediate(() => console.log('inner immediate'));
}, 0);

// Output:
// outer timeout
// inner immediate  ← check phase (comes after current poll phase)
// inner timeout    ← timers phase (next loop iteration)
```

---

## Interview Questions

**Q: What is the complete order of async operations in Node.js?**
A: Synchronous code → nextTick queue → Promise microtasks → (repeat between phases) → Timers (setTimeout/setInterval) → Pending callbacks → Poll (I/O) → Check (setImmediate) → Close callbacks → back to top.

**Q: Does nextTick run before or after Promise microtasks?**
A: `process.nextTick` runs BEFORE Promise microtasks. Node.js has two queues: the nextTick queue (higher priority) and the Promise microtask queue. Both drain before moving to the next event loop phase.

**Q: Why is the setTimeout vs setImmediate order non-deterministic outside I/O?**
A: It depends on how quickly the event loop reaches the timers phase vs when `setTimeout(fn, 0)` threshold is considered passed. The Node.js event loop starts, enters timers phase — if the 1ms minimum hasn't elapsed yet, no timer fires; it moves to poll → check → setImmediate fires. If it has elapsed, timer fires first. This is timing-dependent.
