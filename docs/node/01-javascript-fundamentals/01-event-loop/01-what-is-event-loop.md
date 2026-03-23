# What is the Event Loop?

## The Core Problem: Why Does JS Need an Event Loop?

JavaScript is **single-threaded** — it can only do one thing at a time. But browsers and Node.js need to handle:
- Network requests (could take seconds)
- File reads (disk I/O)
- Timers (setTimeout)
- User events (clicks, keypresses)

Without the event loop, JavaScript would freeze while waiting for any of these. The event loop is the mechanism that lets JS appear to do multiple things concurrently while staying single-threaded.

---

## The JavaScript Runtime Model

```
┌─────────────────────────────────────────────────────────────────┐
│                      JS Engine (V8)                              │
│  ┌─────────────────┐       ┌──────────────────────────────────┐ │
│  │   Call Stack     │       │           Heap                   │ │
│  │                  │       │  (memory allocation for objects) │ │
│  │  [main()]        │       │                                  │ │
│  │  [setTimeout()]  │       │  { user: { name: "Alice" } }    │ │
│  │  [doWork()]      │       │                                  │ │
│  └─────────────────┘       └──────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────-─┘
           │
           │ when stack is empty
           ▼
┌──────────────────────────────────────────────────────────────────┐
│                       Event Loop                                  │
│                                                                   │
│   ┌──────────────────┐      ┌────────────────────────────────┐  │
│   │  Microtask Queue │  ◄── │ Promise.then / queueMicrotask  │  │
│   │  (high priority) │      └────────────────────────────────┘  │
│   └──────────────────┘                                           │
│                                                                   │
│   ┌──────────────────┐      ┌────────────────────────────────┐  │
│   │  Macrotask Queue │  ◄── │ setTimeout / setInterval / I/O │  │
│   │  (lower priority)│      └────────────────────────────────┘  │
│   └──────────────────┘                                           │
└──────────────────────────────────────────────────────────────────┘
           │
           │ Web APIs / Node APIs handle async work
           │ (Browser: DOM, fetch | Node: fs, net, crypto)
           ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Web/Node APIs                                   │
│   setTimeout timer  |  fetch/http request  |  fs.readFile        │
└──────────────────────────────────────────────────────────────────┘
```

---

## How the Event Loop Works — Step by Step

1. **Execute synchronous code** — Everything in the call stack runs to completion first
2. **Drain the microtask queue** — Process ALL microtasks (Promise callbacks, queueMicrotask)
3. **Take ONE task from macrotask queue** — Run it fully (setTimeout callback, I/O callback)
4. **Drain the microtask queue again** — After every macrotask
5. **Repeat** — Keep looping until both queues are empty

This is why it's called a "loop" — it continuously checks and processes tasks.

---

## A Simple Mental Model

```javascript
// Pseudocode of what the event loop does:
while (true) {
  // 1. Run all sync code in call stack
  runCallStack();

  // 2. Drain ALL microtasks
  while (microtaskQueue.length > 0) {
    const task = microtaskQueue.shift();
    task();
  }

  // 3. Take ONE macrotask (if any)
  if (macrotaskQueue.length > 0) {
    const task = macrotaskQueue.shift();
    task();
    // Go back and drain microtasks again
  }

  // 4. If nothing left, idle (wait for new events)
}
```

---

## Concrete Example

```javascript
console.log('1 - sync');                           // sync → runs immediately

setTimeout(() => console.log('2 - timeout'), 0);  // macrotask → queued

Promise.resolve()
  .then(() => console.log('3 - promise'));         // microtask → queued

console.log('4 - sync');                           // sync → runs immediately

// Output:
// 1 - sync
// 4 - sync
// 3 - promise    ← microtask runs before macrotask!
// 2 - timeout    ← macrotask runs last
```

**Why this order?**
1. Sync: `console.log('1')` → stack
2. `setTimeout` → handed to timer API, callback queued in macrotask queue
3. `Promise.resolve().then(...)` → callback queued in microtask queue
4. Sync: `console.log('4')` → stack
5. Stack empty → drain microtask queue → `console.log('3')`
6. Pick macrotask → `console.log('2')`

---

## What Happens When the Call Stack Is Full?

```javascript
function infinite() {
  return infinite(); // Each call adds a frame to the stack
}

infinite(); // RangeError: Maximum call stack size exceeded
```

Node.js has a finite call stack (~15,000 frames). If it overflows, you get a `RangeError`. This is why recursive functions need base cases.

---

## Why the Event Loop Matters for Node.js Specifically

In Node.js, the event loop is what enables handling thousands of concurrent connections with a single thread:

```javascript
// This server can handle many concurrent connections
// because I/O is async — each readFile doesn't block
const http = require('http');
const fs = require('fs');

const server = http.createServer((req, res) => {
  // This does NOT block — it hands off to libuv thread pool
  fs.readFile('./data.json', (err, data) => {
    res.end(data); // This runs when file is ready
  });
  // Execution continues immediately — can handle next request
});

server.listen(3000);
```

While one request is waiting for a file, the event loop picks up other incoming connections. That's the power of non-blocking I/O.

---

## Blocking the Event Loop — The Biggest Mistake

```javascript
// ❌ BAD — blocks the event loop for entire duration
const http = require('http');
http.createServer((req, res) => {
  // Synchronous heavy computation — blocks ALL requests
  const result = computePrimesSync(10_000_000);
  res.end(result.toString());
}).listen(3000);

// ✅ GOOD — offload to worker thread
const { Worker } = require('worker_threads');
http.createServer((req, res) => {
  const worker = new Worker('./compute-primes.js');
  worker.on('message', result => res.end(result.toString()));
}).listen(3000);
```

If you run sync CPU-heavy code on the main thread, **no other requests can be processed** until it finishes. Always offload CPU-bound work to Worker Threads or child processes.

---

## Key Takeaways

| Concept | Detail |
|--------|--------|
| Single thread | One JS thread executes code |
| Non-blocking | Async I/O doesn't block the thread |
| Microtasks | Run before next macrotask (higher priority) |
| Macrotasks | Run one at a time, then microtasks drain again |
| Call stack | Tracks currently executing functions |
| Blocking danger | CPU-heavy sync code blocks all async operations |

---

## Interview Questions on This Topic

**Q: Why is JavaScript single-threaded?**
A: Historical design decision for simplicity — originally designed for browser scripting where concurrency would make DOM manipulation complex. The event loop compensates by enabling async non-blocking patterns.

**Q: Can Node.js run code in parallel?**
A: The JS code itself runs on one thread, but I/O operations run in the OS/libuv thread pool. Worker Threads allow true JS parallelism for CPU-bound tasks.

**Q: What "blocks the event loop" means?**
A: Any synchronous operation that takes a long time — CPU computation, synchronous file reads (`fs.readFileSync`), blocking loops — prevents the event loop from processing other callbacks, effectively freezing the server.
