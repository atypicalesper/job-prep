# Worker Threads in Node.js

---

## Why Worker Threads?

Node.js runs all JavaScript on a single thread, which means a CPU-intensive operation — sorting a million records, generating a PDF, running inference — blocks the event loop and delays every other request for its entire duration. Worker Threads solve this by giving each piece of CPU-intensive work its own OS thread and V8 instance, allowing it to run in parallel with the main event loop. Unlike child processes, Worker Threads share the same process memory and have much lower startup cost (~5ms vs ~50ms). The communication model is message passing by default (structured-clone copy), with an opt-in `SharedArrayBuffer` path for zero-copy sharing of large binary data.

```
Node.js is single-threaded — one CPU core for JS execution.
CPU-intensive tasks block the event loop for all requests.

Worker Threads:
- Actual OS threads running Node.js (V8 instances)
- Each worker has its own event loop, V8 heap, module system
- Communicate via message passing (or SharedArrayBuffer for shared memory)
- Use for: image processing, video encoding, crypto, compression, ML inference
```

---

## Basic Worker Thread

A Worker Thread is an OS thread that runs its own V8 instance and event loop within the same Node.js process. Unlike child processes, workers share the same process memory space (enabling zero-copy data transfer via `SharedArrayBuffer`) and have lower startup overhead. The main thread and workers communicate by posting structured-cloned messages — the data is deep-copied unless you explicitly transfer ownership of an `ArrayBuffer`. `workerData` is the one-time payload passed at construction; subsequent communication uses `parentPort.postMessage` / `worker.postMessage`. Always listen for the `'error'` and `'exit'` events on the worker or unhandled rejections in the worker file will silently kill the thread.

```javascript
// worker.js — runs in a separate thread
const { parentPort, workerData } = require('worker_threads');

// Receive data via workerData (passed at creation):
const { numbers } = workerData;

// CPU-intensive work:
function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

const result = sum(numbers);

// Send result back:
parentPort.postMessage({ result });

// ---

// main.js — spawns worker
const { Worker } = require('worker_threads');
const path = require('path');

function runWorker(data) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'worker.js'), {
      workerData: data // automatically structured-cloned
    });

    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
    });
  });
}

const { result } = await runWorker({ numbers: [1, 2, 3, 4, 5] });
console.log(result); // 15
```

---

## Worker Thread Pool

Spawning a new worker for every task defeats the purpose of using threads — thread creation has significant overhead (~50–100ms per worker). A pool pre-creates a fixed number of workers and queues tasks to idle ones. When a worker finishes a task it immediately picks up the next item from the queue. This pattern keeps CPU cores saturated without the latency of thread startup. For production use, consider the `piscina` library which implements a battle-tested pool with backpressure, transfer lists, and resource limits. Roll your own pool only when you need fine-grained control over scheduling or worker lifecycle.

```typescript
// Reuse workers instead of creating new ones per task (expensive!)
import { Worker } from 'worker_threads';
import { EventEmitter } from 'events';

class WorkerPool {
  private workers: Worker[] = [];
  private queue: Array<{
    task: any;
    resolve: (val: any) => void;
    reject: (err: Error) => void;
  }> = [];
  private idleWorkers: Worker[] = [];

  constructor(private workerScript: string, private poolSize: number) {
    for (let i = 0; i < poolSize; i++) {
      this.addWorker();
    }
  }

  private addWorker() {
    const worker = new Worker(this.workerScript);
    worker.on('message', (result) => {
      const { currentTask } = worker as any;
      if (currentTask) {
        currentTask.resolve(result);
        (worker as any).currentTask = null;
      }
      this.assignTaskOrIdle(worker);
    });
    worker.on('error', (err) => {
      const { currentTask } = worker as any;
      if (currentTask) {
        currentTask.reject(err);
        (worker as any).currentTask = null;
      }
      // Replace dead worker:
      this.workers = this.workers.filter(w => w !== worker);
      this.addWorker();
    });

    this.workers.push(worker);
    this.idleWorkers.push(worker);
    this.processQueue();
  }

  private assignTaskOrIdle(worker: Worker) {
    if (this.queue.length > 0) {
      const task = this.queue.shift()!;
      (worker as any).currentTask = task;
      worker.postMessage(task.task);
    } else {
      this.idleWorkers.push(worker);
    }
  }

  private processQueue() {
    while (this.queue.length > 0 && this.idleWorkers.length > 0) {
      const worker = this.idleWorkers.shift()!;
      const task = this.queue.shift()!;
      (worker as any).currentTask = task;
      worker.postMessage(task.task);
    }
  }

  run<T>(task: any): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processQueue();
    });
  }

  async destroy() {
    await Promise.all(this.workers.map(w => w.terminate()));
  }
}

// Usage:
const pool = new WorkerPool('./image-processor.js', os.cpus().length);

// Multiple tasks run concurrently across workers:
const results = await Promise.all(
  images.map(img => pool.run({ action: 'resize', data: img, width: 800 }))
);
```

---

## SharedArrayBuffer — Zero-Copy Communication

Structured-clone copying (the default for `postMessage`) is safe but expensive for large data — a 100MB image buffer takes tens of milliseconds to copy. `SharedArrayBuffer` avoids this by giving multiple threads access to the exact same memory region. The trade-off is that concurrent reads and writes are now possible, introducing data races. The `Atomics` API provides hardware-guaranteed atomic operations (compare-and-swap, atomic add, etc.) that prevent races on integer values in a `TypedArray`. Use `SharedArrayBuffer` when throughput matters more than simplicity; for most tasks, structured-clone messaging is safe and fast enough.

```javascript
// For high-performance scenarios where copying is too expensive

// main.js:
const { Worker } = require('worker_threads');

const sharedBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 4);
const shared = new Int32Array(sharedBuffer);

shared[0] = 0; // initial counter

const worker = new Worker('./shared-worker.js', {
  workerData: { sharedBuffer }
});

// Poll from main thread:
setInterval(() => {
  console.log(`Counter: ${Atomics.load(shared, 0)}`);
}, 100);

// ---

// shared-worker.js:
const { workerData } = require('worker_threads');
const shared = new Int32Array(workerData.sharedBuffer);

// Atomically increment (thread-safe):
while (true) {
  Atomics.add(shared, 0, 1); // atomic increment
  // Busy work...
}

// Atomics API — for thread-safe operations:
Atomics.load(array, index)          // read atomically
Atomics.store(array, index, value)  // write atomically
Atomics.add(array, index, value)    // add and return old value
Atomics.compareExchange(array, index, expected, replacement) // CAS
Atomics.wait(array, index, value)   // sleep until value changes
Atomics.notify(array, index, count) // wake waiting threads
```

---

## When to Use Workers vs Child Processes

```
Worker Threads:
✅ Shared memory (SharedArrayBuffer)
✅ Faster startup (same process)
✅ Cheaper IPC (no serialization for SharedArrayBuffer)
✅ Same Node.js features
❌ A crash can affect the main process

Child Processes:
✅ Full isolation (crash doesn't affect parent)
✅ Can run any executable (Python, shell, etc.)
✅ Independent memory — no accidental sharing
❌ Higher overhead (new process, new memory space)
❌ All communication serialized (JSON/buffer)

Use Workers when:
- Pure JavaScript/Node.js computation
- High-throughput data processing with shared memory
- You want lower overhead

Use Child Processes when:
- Running non-JS code (Python ML model, shell commands)
- Need strong isolation (untrusted code)
- Separate deployment/scaling concerns
```

---

## Practical: Image Processing Worker

Image processing is the canonical use case for Worker Threads: it is CPU-bound, produces a discrete result, and benefits from being parallelised across all available cores. Libraries like `sharp` call native C++ code that blocks its thread for the duration of the resize or encode operation. Running that in a worker thread means the main event loop continues serving HTTP requests while images are processed concurrently. The `buffer.buffer` transferable pattern (passing the underlying `ArrayBuffer` instead of a copy) eliminates the serialization overhead for large binary payloads.

```javascript
// image-worker.js:
const { parentPort } = require('worker_threads');
const sharp = require('sharp'); // CPU-intensive library

parentPort.on('message', async ({ id, imageBuffer, width, height }) => {
  try {
    const processed = await sharp(Buffer.from(imageBuffer))
      .resize(width, height, { fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer();

    parentPort.postMessage({
      id,
      success: true,
      buffer: processed.buffer
    }, [processed.buffer]); // transfer ownership (zero-copy!)
  } catch (error) {
    parentPort.postMessage({ id, success: false, error: error.message });
  }
});

// main.js:
const pool = new WorkerPool('./image-worker.js', os.cpus().length);

app.post('/resize', upload.single('image'), async (req, res) => {
  const result = await pool.run({
    id: Date.now(),
    imageBuffer: req.file.buffer.buffer, // ArrayBuffer (transferable)
    width: 800,
    height: 600
  });

  res.set('Content-Type', 'image/webp').send(Buffer.from(result.buffer));
});
```

---

## Interview Questions

**Q: What are Atomics and why do you need them with SharedArrayBuffer?**
A: When multiple threads access shared memory, normal operations aren't atomic — a read-modify-write can be interrupted between steps by another thread. `Atomics.add`, `Atomics.compareExchange` etc. are hardware-guaranteed atomic operations. Without Atomics, two threads incrementing the same counter can both read 0, both compute 1, both write 1 — resulting in 1 instead of 2. With `Atomics.add`, the increment is guaranteed to be indivisible.

**Q: What is a transferable object?**
A: Objects (like `ArrayBuffer`) that can be transferred to another worker with zero-copy — the original thread loses access, the worker gains it. `worker.postMessage(data, [data.buffer])` — the second argument lists transferables. Without transfer, the buffer would be copied (expensive for large data). After transfer, `data.buffer.byteLength === 0` in the sender.

**Q: How many workers should you use in a pool?**
A: For CPU-bound work: `os.cpus().length` (number of logical CPU cores). More workers than CPUs won't improve throughput — they'll compete for cores. For I/O-bound work in workers: more workers can help since they block waiting for I/O. The libuv thread pool default of 4 is often too small — set `UV_THREADPOOL_SIZE=cpu_count` for I/O-heavy thread pool operations.
