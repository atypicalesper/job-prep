# Call Stack, Heap, and Task Queues

## The Three Core Memory Areas

JavaScript runtime uses three main memory areas:

```
┌──────────────────┐  ┌──────────────────┐  ┌───────────────────┐
│    Call Stack    │  │      Heap         │  │   Task Queues     │
│                  │  │                   │  │                   │
│ function frames  │  │ objects, arrays   │  │ microtask queue   │
│ (LIFO — ordered) │  │ (dynamic memory)  │  │ macrotask queue   │
│ primitives       │  │ closures          │  │                   │
└──────────────────┘  └──────────────────┘  └───────────────────┘
```

---

## The Call Stack

The call stack is a **Last In, First Out (LIFO)** data structure that tracks function execution.

### How it works

```javascript
function greet(name) {
  return `Hello, ${name}`;       // 3. runs, returns
}

function welcome(user) {
  const msg = greet(user.name);  // 2. calls greet → greet pushed
  console.log(msg);              // 4. greet popped, this runs
}

welcome({ name: 'Alice' });      // 1. pushed onto stack
```

Stack frames:
```
STEP 1:           STEP 2:           STEP 3:         STEP 4:
┌─────────┐       ┌─────────┐       ┌─────────┐     ┌─────────┐
│ welcome │       │  greet  │       │  greet  │     │         │
├─────────┤       ├─────────┤       ├─────────┤     │ (empty) │
│ (empty) │  →   │ welcome │  →   │ welcome │  →  │         │
└─────────┘       └─────────┘       └─────────┘     └─────────┘
```

Each frame stores:
- Local variables
- Arguments
- Return address (where to go when function returns)

### Stack Overflow

```javascript
function countDown(n) {
  console.log(n);
  countDown(n - 1); // no base case! infinite recursion
}

countDown(1000);
// RangeError: Maximum call stack size exceeded
// Node.js limit: ~15,000 frames
```

Fix with tail call (or iteration):
```javascript
function countDown(n) {
  if (n <= 0) return;    // base case
  console.log(n);
  countDown(n - 1);
}
```

---

## The Heap

The **heap** is where objects, arrays, and closures live — dynamically allocated memory managed by V8's garbage collector.

```javascript
// Primitives: stored in stack (by value)
let x = 42;
let y = x;   // y gets a COPY of 42
y = 99;
console.log(x); // 42 — unaffected

// Objects: stored in heap (by reference)
let obj1 = { count: 0 };
let obj2 = obj1;   // obj2 points to SAME heap object
obj2.count = 99;
console.log(obj1.count); // 99 — same object!
```

### Stack vs Heap

| | Stack | Heap |
|---|---|---|
| Stores | Primitives, references, frames | Objects, arrays, functions |
| Size | Fixed (~1-8MB) | Dynamic (limited by RAM) |
| Speed | Very fast (CPU register access) | Slower (pointer dereference) |
| Management | Automatic (push/pop) | Garbage collected |
| Lifetime | Duration of function call | Until GC collects it |

```javascript
function example() {
  let num = 42;            // stack: num = 42
  let str = "hello";      // stack: str = ptr → heap: "hello"
  let arr = [1, 2, 3];    // stack: arr = ptr → heap: [1,2,3]
  let obj = { x: 1 };     // stack: obj = ptr → heap: {x:1}

  // When function returns:
  // stack frames cleared
  // heap objects eligible for GC (if no other references)
}
```

---

## Task Queues

There are TWO queues, with different priorities:

### Microtask Queue (High Priority)

Sources:
- `Promise.then()` / `.catch()` / `.finally()`
- `queueMicrotask()`
- `MutationObserver` (browser)
- `process.nextTick()` (Node.js — even higher priority!)

**Rule:** The entire microtask queue drains BEFORE the event loop picks the next macrotask.

### Macrotask Queue (Lower Priority)

Sources:
- `setTimeout()` callback
- `setInterval()` callback
- `setImmediate()` (Node.js)
- I/O callbacks (fs, net)
- UI rendering (browser)

**Rule:** One macrotask runs, then ALL microtasks drain, then next macrotask.

---

## Queue Interaction Example

```javascript
console.log('A');  // sync

setTimeout(() => console.log('B'), 0);  // macrotask queue

Promise.resolve()
  .then(() => {
    console.log('C');  // microtask
    return 'chained';
  })
  .then(() => console.log('D'));  // microtask (queued after C runs)

queueMicrotask(() => console.log('E'));  // microtask

console.log('F');  // sync

// Output: A, F, C, E, D, B
//
// Why?
// 1. Sync: A, F
// 2. Microtask queue: C (then D is added), E
//    D runs next (microtask queue still draining), then E
// 3. Macrotask: B
```

Wait — order of C, E, D? Let's trace:
- After sync: microtask queue = [C_callback, E_callback]
- Run C_callback → logs 'C', queues D_callback → microtask queue = [E_callback, D_callback]
- Run E_callback → logs 'E' → microtask queue = [D_callback]
- Run D_callback → logs 'D' → microtask queue = []
- Pick macrotask: B_callback → logs 'B'

**Output: A F C E D B**

---

## Visualizing Queue Processing

```
Timeline:
═══════════════════════════════════════════════════════
Sync Code      │ A │ F │
               └───┴───┘
                         ↓ stack empty → process microtasks
Microtask Queue│ C │ E │ D │  (D was added when C ran)
               └───┴───┴───┘
                               ↓ microtasks empty → next macrotask
Macrotask Queue│ B │
               └───┘
═══════════════════════════════════════════════════════
```

---

## Common Gotcha: Microtasks Created by Microtasks

```javascript
// Infinite microtask loop — STARVES the event loop!
function infiniteMicrotask() {
  Promise.resolve().then(infiniteMicrotask);
}
infiniteMicrotask();

// setTimeout never fires because microtask queue never empties!
setTimeout(() => console.log('This never runs'), 0);
```

This is called **starvation** — the macrotask queue is never reached because microtasks keep adding more microtasks.

---

## Interview Questions

**Q: What is the difference between the call stack and the task queue?**
A: Call stack = synchronous execution context (LIFO). Task queue = pending async callbacks waiting for the stack to be empty. The event loop moves tasks from the queue to the stack only when the stack is empty.

**Q: Can you add something directly to the call stack?**
A: No. Code enters the call stack only by being called (function invocation). You can't manually push to the stack.

**Q: Why are microtasks prioritized over macrotasks?**
A: Promise resolution should complete atomically — you don't want a timer callback interrupting the middle of a promise chain. Microtasks represent work that needs to happen "before yielding back to the event loop."

**Q: What happens if you throw inside a Promise.then()?**
A: The error doesn't go to the call stack — it rejects the returned promise. It won't trigger `uncaughtException`, but will trigger `unhandledRejection` if not caught.
