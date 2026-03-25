# Node.js Event Loop — Tricky Interview Questions

Each question in this file targets a specific edge case of Node.js's event loop execution model. Before reading the answer, attempt to trace the output yourself using the priority chain: synchronous code → nextTick queue → Promise microtasks → setImmediate (check phase) → setTimeout (timers phase) → I/O callbacks. Predict the answer, then compare. The goal is to build intuition, not memorize outputs.

---

## Q1: What is the output?

```javascript
process.nextTick(() => console.log('A'));
setImmediate(() => console.log('B'));
setTimeout(() => console.log('C'), 0);
Promise.resolve().then(() => console.log('D'));
console.log('E');
```

**Output:** `E A D B C` (or `E A D C B` — setTimeout/setImmediate order can vary)

**Always:** `E` first (sync), then `A` (nextTick), then `D` (promise), then `B` and `C` in non-deterministic order.

---

## Q2: Inside I/O — What Runs First?

```javascript
const fs = require('fs');
fs.readFile(__filename, () => {
  process.nextTick(() => console.log('nextTick'));
  setImmediate(() => console.log('setImmediate'));
  setTimeout(() => console.log('setTimeout'), 0);
  Promise.resolve().then(() => console.log('promise'));
  console.log('sync in I/O');
});
```

**Output (always):**
```
sync in I/O
nextTick
promise
setImmediate
setTimeout
```

**Why:** Inside I/O callback → after sync → drain nextTick → drain promises → check phase (setImmediate) → timers phase (setTimeout).

---

## Q3: Recursive nextTick — Will This Starve?

```javascript
let count = 0;
function tick() {
  if (count < 3) {
    count++;
    process.nextTick(tick);
  }
}

tick();
setImmediate(() => console.log('immediate'));
setTimeout(() => console.log('timer'), 0);
```

**Output:**
```
immediate (or timer — non-deterministic)
timer (or immediate)
```

**Why:** `tick()` runs, adds nextTick, nextTick queue drains (3 iterations), then event loop proceeds. With count limit, nextTick queue DOES drain. setImmediate and setTimeout then run.

If we removed the count limit → `setImmediate` and `setTimeout` would NEVER run (starvation).

---

## Q4: Promise Inside nextTick

```javascript
process.nextTick(() => {
  console.log('nextTick');
  Promise.resolve().then(() => console.log('promise inside nextTick'));
});

Promise.resolve().then(() => console.log('outer promise'));
```

**Output:** `nextTick → promise inside nextTick → outer promise`

Wait — actually in Node.js, the nextTick queue drains first (ALL of it), then promises. But promise added during nextTick goes to promise queue...

In Node.js behavior:
- nextTick runs → `nextTick` logged → promise queued
- nextTick queue empty → drain promises: `promise inside nextTick` and `outer promise`

The order between the two promises depends on Node.js internals. In practice: `nextTick → outer promise → promise inside nextTick` OR `nextTick → promise inside nextTick → outer promise`

**Most likely output:** `nextTick → outer promise → promise inside nextTick`

Because `outer promise` was queued BEFORE the nextTick ran (both registered synchronously), and the promise from inside nextTick is queued AFTER.

---

## Q5: setImmediate Inside setImmediate

```javascript
setImmediate(() => {
  console.log('A');
  setImmediate(() => console.log('C'));
  setTimeout(() => console.log('D'), 0);
});

setImmediate(() => console.log('B'));
```

**Output:**
```
A
B
D (or C)
C (or D)
```

**Why:** First check phase runs A (adds C to next check) and B. After check phase → timers phase → D. Next check phase → C.

Actually:
- Check phase 1: runs A (schedules C for next check), runs B
- After check phase → timers: D
- Next loop check phase: C

**Output:** `A B D C`

---

## Q6: What Does This Print and Why?

```javascript
setTimeout(() => {
  process.nextTick(() => console.log('nextTick in timer'));
  console.log('timer');
}, 0);

setImmediate(() => {
  process.nextTick(() => console.log('nextTick in immediate'));
  console.log('immediate');
});
```

**Output (one possible order):**
```
timer (or immediate first)
nextTick in timer
immediate (or timer first)
nextTick in immediate
```

**Why:** After EACH callback, nextTick and promise queues drain. So after the timer callback runs and logs 'timer', nextTick drains (logs 'nextTick in timer') before the next phase/callback starts.

---

## Q7: The poll phase waiting

The poll phase is the "idle" state of the Node.js event loop. When there are no timers, no pending callbacks, and no check-phase work, the event loop blocks in the poll phase waiting for new I/O events. An active server socket is an "active handle" that keeps the event loop alive indefinitely in this state — it will only unblock when a new connection arrives or `server.close()` is called.

```javascript
const server = require('net').createServer();

server.listen(0, () => {
  console.log('server ready');
  // Nothing else happens — what does the event loop do?
});

// Process doesn't exit — stays alive in poll phase
// waiting for incoming connections
```

**Why:** The server has an active handle (listening socket). The event loop reaches the poll phase, sees there's work (the listening socket), and BLOCKS waiting for connections. Process stays alive indefinitely.

---

## Q8: clearImmediate vs clearTimeout

```javascript
const imm = setImmediate(() => console.log('immediate'));
const tim = setTimeout(() => console.log('timeout'), 0);

clearImmediate(imm);
// clearTimeout(tim);

// Output: 'timeout' only (immediate was cancelled)
```

---

## Q9: Multiple nextTick in the Same Phase

```javascript
process.nextTick(() => {
  console.log('tick 1');
  process.nextTick(() => console.log('tick 1.1'));
  process.nextTick(() => console.log('tick 1.2'));
});

process.nextTick(() => {
  console.log('tick 2');
  process.nextTick(() => console.log('tick 2.1'));
});
```

**Output:** `tick 1 tick 2 tick 1.1 tick 1.2 tick 2.1`

**Why:** Initial nextTick queue: [tick1, tick2]. Process tick1 → adds tick1.1, tick1.2. Process tick2 → adds tick2.1. Queue now: [tick1.1, tick1.2, tick2.1]. Process them in order.

---

## Q10: Timer Precision

`setTimeout` is not a real-time guarantee — it is a minimum delay. The callback will not run before the specified delay, but it may run significantly after if the event loop is busy. Blocking the event loop with synchronous code (a tight `while` loop, a slow `JSON.parse`, a synchronous file read) delays all callbacks that were waiting, including expired timers. This is the main reason synchronous blocking is so harmful in Node.js servers.

```javascript
const start = Date.now();
setTimeout(() => {
  console.log(`Delay: ${Date.now() - start}ms`);
}, 100);

// Blocking for 200ms:
const end = start + 200;
while (Date.now() < end) {}
```

**Output:** `Delay: ~200ms`

**Why:** The synchronous while loop blocks the event loop. The timer callback couldn't run at 100ms (event loop was blocked). It runs as soon as the loop finishes and the event loop checks timers.

---

## Q11: Multiple Timers — Same Delay

```javascript
setTimeout(() => console.log('A'), 100);
setTimeout(() => console.log('B'), 100);
setTimeout(() => console.log('C'), 100);
```

**Output:** `A B C` (all run in the same timers phase tick, in order)

Node.js processes all expired timers in a single timers phase iteration, in the order they were registered.

---

## Q12: I/O Blocking the Event Loop

```javascript
const fs = require('fs');

// ❌ SYNC — blocks event loop during entire file read
const data = fs.readFileSync('large-file.txt'); // blocks!

// ✅ ASYNC — non-blocking
fs.readFile('large-file.txt', (err, data) => {
  // processes when I/O completes
});
// Event loop continues serving other requests while file reads
```

---

## Q13: EventEmitter and the Event Loop

`EventEmitter` is often confused with being async because it is used alongside async patterns. In reality, `emit()` is entirely synchronous — it calls all registered listeners immediately in the current call stack, in the order they were registered. This is fundamentally different from `setTimeout`, `setImmediate`, or Promise callbacks. If you need a listener to run asynchronously after the current turn, wrap the emission in `process.nextTick` or `setImmediate`.

```javascript
const { EventEmitter } = require('events');
const ee = new EventEmitter();

ee.on('data', (msg) => console.log('received:', msg));

ee.emit('data', 'hello'); // synchronous!
console.log('after emit');
```

**Output:**
```
received: hello
after emit
```

**Why:** `EventEmitter.emit()` is SYNCHRONOUS. Listeners run immediately in the call stack. This is different from async patterns.

---

## Q14: process.exit vs natural exit

Node.js provides two ways to observe process termination: `'exit'` fires synchronously just before the process terminates and cannot schedule new async work (any timers or Promises added there will never run), and `'beforeExit'` fires when the event loop drains and gives you a chance to add more work. If you add async work in `'beforeExit'`, the loop keeps running and `'beforeExit'` will fire again when it drains — this continues until no work is added, at which point `'exit'` fires and the process ends.

```javascript
process.on('exit', (code) => {
  console.log('exit event, code:', code);
  // ❌ Cannot run async operations here!
  // This handler must be synchronous
  // setTimeout, setImmediate, promises WON'T run
});

process.on('beforeExit', (code) => {
  // This CAN schedule more async work
  // If you add work here, 'beforeExit' fires again
  // 'exit' fires when event loop is truly empty
});

process.exit(0);
// 'exit' fires synchronously, then process terminates
```

---

## Q15: What Keeps Node.js Alive?

```javascript
// These KEEP the process alive (ref'd handles):
const server = http.createServer().listen(3000);
const interval = setInterval(() => {}, 1000);
const socket = net.connect(3000);

// These DON'T keep the process alive (unref'd):
const timer = setTimeout(() => {}, 1000);
timer.unref();

const watcher = fs.watch('.', () => {});
watcher.unref();

// Explicitly exit:
process.exit(0);

// Or let everything close:
server.close();
clearInterval(interval);
socket.destroy();
// Process exits when all handles are closed
```

---

## Summary Table

| Operation | Queue/Phase | Priority |
|-----------|-------------|----------|
| Sync code | Call stack | 1st |
| `process.nextTick` | nextTick queue | 2nd |
| `Promise.then` | Microtask queue | 3rd |
| `setImmediate` | Check phase | 4th |
| `setTimeout(fn, 0)` | Timers phase | 5th |
| I/O callbacks | Poll phase | 6th |
| `socket.on('close')` | Close phase | Last |
