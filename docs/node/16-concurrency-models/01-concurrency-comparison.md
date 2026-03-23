# Concurrency Models — JS vs Go vs Python vs Java

## The Fundamental Problem

Concurrency = dealing with multiple things at once.
Parallelism = actually doing multiple things at once (requires multiple cores).

Every language has a different answer to: *"How do we handle I/O, CPU work, and coordination efficiently?"*

---

## JavaScript / Node.js — Event Loop + Single Thread

### Model
Single-threaded, non-blocking I/O via event loop + OS async syscalls (libuv).

```
┌─────────────────────────────────────────────────────┐
│                    Node.js Process                   │
│                                                      │
│  Main Thread                                         │
│  ┌─────────────────────────────────────────────┐    │
│  │  Event Loop (libuv)                         │    │
│  │                                             │    │
│  │  ┌─────┐ ┌─────────┐ ┌───────┐ ┌────────┐  │    │
│  │  │timers│ │I/O CBs  │ │ poll  │ │ check  │  │    │
│  │  │(set  │ │(fs,net) │ │(wait  │ │(setIm- │  │    │
│  │  │ Tout)│ │         │ │for I/O│ │mediate)│  │    │
│  │  └─────┘ └─────────┘ └───────┘ └────────┘  │    │
│  └──────────────────────┬──────────────────────┘    │
│                         │                            │
│  ┌──────────────────────▼──────────────────────┐    │
│  │           Thread Pool (libuv)               │    │
│  │   [worker][worker][worker][worker]          │    │
│  │   fs operations, crypto, DNS, zlib          │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### Strengths
- **Excellent I/O throughput** — 10k+ concurrent connections with one thread
- **No race conditions** on shared state (one thread, no shared memory between concurrent ops)
- **Simple mental model** — sequential code with callbacks/promises
- **Low memory** — no thread-per-connection overhead

### Weaknesses
- **CPU-bound work blocks everything** — one heavy computation starves all I/O
- **True parallelism requires** Worker Threads or cluster
- **Callback hell / inversion of control** (solved by async/await)

### CPU work solution: Worker Threads
```js
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';

if (isMainThread) {
  const worker = new Worker(import.meta.filename, {
    workerData: { array: [1,2,3,4,5] }
  });
  worker.on('message', result => console.log('Result:', result));
} else {
  // Runs in separate thread — has own V8 heap
  const sum = workerData.array.reduce((a, b) => a + b, 0);
  parentPort.postMessage(sum);
}
```

### I/O Concurrency — the N+1 trap
```js
// BAD — sequential, O(n) round trips
async function getUsers(ids) {
  const users = [];
  for (const id of ids) {
    users.push(await db.findUser(id)); // waits for each!
  }
  return users;
}

// GOOD — concurrent, O(1) round trips (limited by Promise.all)
async function getUsers(ids) {
  return Promise.all(ids.map(id => db.findUser(id)));
}

// BEST (with backpressure limit)
import pLimit from 'p-limit';
const limit = pLimit(10); // max 10 concurrent
const users = await Promise.all(ids.map(id => limit(() => db.findUser(id))));
```

---

## Go — Goroutines + Channels (CSP)

### Model
**CSP (Communicating Sequential Processes)** — goroutines communicate via channels. "Don't communicate by sharing memory; share memory by communicating."

```
┌─────────────────────────────────────────────────────┐
│                    Go Runtime                        │
│                                                      │
│  GOMAXPROCS = CPU cores (default)                   │
│                                                      │
│  OS Thread 1       OS Thread 2       OS Thread 3    │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐   │
│  │ P (proc) │      │ P (proc) │      │ P (proc) │   │
│  │          │      │          │      │          │   │
│  │ G G G G  │      │ G G G G  │      │ G G G G  │   │
│  │ (goroutines)    │ (goroutines)    │ (goroutines)  │
│  └──────────┘      └──────────┘      └──────────┘   │
│  Global run queue: [G] [G] [G]                      │
└─────────────────────────────────────────────────────┘
```

### Key Properties
- Goroutines are ~2KB stack (grow/shrink dynamically). Can have millions.
- M:N threading — N goroutines multiplexed onto M OS threads
- Preemptive scheduling (Go 1.14+) — goroutine can be interrupted at any point
- Channels = typed, synchronizable queues

```go
// Basic goroutine + channel
func fetchUser(id int, ch chan<- User) {
    user, _ := db.FindUser(id)
    ch <- user  // send to channel
}

func getUsers(ids []int) []User {
    ch := make(chan User, len(ids))  // buffered channel

    for _, id := range ids {
        go fetchUser(id, ch)  // launch goroutine
    }

    users := make([]User, len(ids))
    for i := range ids {
        users[i] = <-ch  // receive from channel
    }
    return users
}
```

### Select — multiplexing channels
```go
select {
case msg := <-ch1:
    fmt.Println("from ch1:", msg)
case msg := <-ch2:
    fmt.Println("from ch2:", msg)
case <-time.After(1 * time.Second):
    fmt.Println("timeout")
}
```

### Strengths
- **True parallelism** by default (GOMAXPROCS = cores)
- **Millions of goroutines** (very low overhead)
- **Backpressure** via channel buffer size
- **Simple concurrency** without callbacks/promises
- **Structured concurrency** via sync.WaitGroup / errgroup

### Weaknesses
- **Shared memory still possible** (use sync.Mutex) — can deadlock
- **No generics on channels until Go 1.18** (now better)
- **Manual error propagation** — no try/catch

---

## Python — GIL + asyncio + multiprocessing

### The GIL (Global Interpreter Lock)
CPython has a GIL — only one thread executes Python bytecode at a time, even on multi-core.

```
Thread 1: [Python bytecode]─┐
Thread 2:               [Python bytecode]
              ↑ GIL allows only one at a time
```

**Impact:**
- I/O-bound: threads still useful (GIL released during I/O syscalls)
- CPU-bound: threads give NO parallelism — use `multiprocessing` instead

### asyncio — cooperative multitasking
```python
import asyncio

async def fetch_user(session, id):
    async with session.get(f"/users/{id}") as resp:
        return await resp.json()

async def get_users(ids):
    async with aiohttp.ClientSession() as session:
        # concurrent I/O — no GIL issue
        return await asyncio.gather(
            *[fetch_user(session, id) for id in ids]
        )

asyncio.run(get_users([1, 2, 3]))
```

asyncio uses an **event loop** (similar to Node) — cooperative, not preemptive. `await` is the yield point.

### multiprocessing — true parallelism
```python
from multiprocessing import Pool

def cpu_work(x):
    return sum(i*i for i in range(x))  # CPU-bound

with Pool(processes=4) as pool:  # 4 separate processes
    results = pool.map(cpu_work, [10**6, 10**6, 10**6, 10**6])
```

### asyncio + ProcessPoolExecutor — best of both
```python
import asyncio
from concurrent.futures import ProcessPoolExecutor

async def main():
    loop = asyncio.get_event_loop()
    with ProcessPoolExecutor() as pool:
        # Run CPU work in subprocess, await result
        result = await loop.run_in_executor(pool, cpu_heavy_func, data)
```

### Strengths
- asyncio is elegant for I/O-heavy servers
- multiprocessing bypasses GIL for CPU work
- GIL simplifies memory model (no data races in pure Python)

### Weaknesses
- GIL = painful for CPU-bound concurrent code
- Three separate models (threads / asyncio / multiprocessing) = confusion
- Higher memory for multiprocessing (no shared memory)

---

## Java — Threads + CompletableFuture + Virtual Threads

### Traditional Threads
```java
// Platform thread — ~1MB stack, OS-level
Thread t = new Thread(() -> {
    System.out.println("Hello from thread");
});
t.start();

// ThreadPoolExecutor
ExecutorService pool = Executors.newFixedThreadPool(10);
Future<String> future = pool.submit(() -> fetchData());
String result = future.get(); // blocks calling thread
```

### CompletableFuture (Java 8+)
```java
CompletableFuture<User> userFuture = CompletableFuture
    .supplyAsync(() -> fetchUser(id))          // run async
    .thenApply(user -> enrichUser(user))       // transform
    .thenCompose(user -> fetchOrders(user.id)) // chain async
    .exceptionally(ex -> defaultUser());       // error handling

// Combining
CompletableFuture<Void> all = CompletableFuture.allOf(
    fetchUser(1), fetchUser(2), fetchUser(3)
);
all.join(); // wait for all
```

### Virtual Threads (Java 21 — Project Loom)
The game changer. Virtual threads are **lightweight threads managed by the JVM**, not the OS.

```java
// Old: platform thread per request (expensive, limits concurrency)
// 10k requests = 10k threads = ~10GB RAM

// New: virtual thread per request (cheap)
try (ExecutorService exec = Executors.newVirtualThreadPerTaskExecutor()) {
    for (int i = 0; i < 100_000; i++) {
        exec.submit(() -> {
            // Each has a virtual thread — JVM parks it during I/O
            String result = httpClient.get("/api/data"); // blocks (but cheap!)
            process(result);
        });
    }
}
```

Virtual threads mount onto carrier (platform) threads. During I/O (blocking syscall), they **unmount**, freeing the carrier thread for other work. This is structurally similar to Go goroutines.

### Synchronized vs Locks
```java
// synchronized — built-in, coarse-grained
synchronized (this) {
    counter++;
}

// ReentrantLock — explicit, tryLock, timeout
ReentrantLock lock = new ReentrantLock();
if (lock.tryLock(100, TimeUnit.MILLISECONDS)) {
    try { counter++; }
    finally { lock.unlock(); }
}

// Atomic — lock-free (CAS)
AtomicInteger counter = new AtomicInteger(0);
counter.incrementAndGet(); // CAS, no lock
```

### Strengths
- **Mature ecosystem** (thread pools, executors, futures)
- **Virtual threads** (Java 21) bring Go-like concurrency
- **Strong typing** helps reason about concurrent code
- **Structured concurrency** via StructuredTaskScope (preview)

### Weaknesses
- Verbose API
- `synchronized` overuse causes contention
- JVM startup overhead (mitigated by GraalVM native image)

---

## Side-by-Side Comparison

| Feature | Node.js | Go | Python | Java |
|---------|---------|----|----|------|
| Thread model | 1 main + thread pool | M:N goroutines | 1 (GIL) / multi-process | Platform threads / virtual threads |
| Concurrency unit | Promise / async-await | goroutine | coroutine / thread | Thread / CompletableFuture |
| Parallelism | Worker Threads | Yes (GOMAXPROCS) | multiprocessing only | Yes (thread pool / virtual) |
| I/O model | Non-blocking (libuv) | Blocking (goroutine parks) | asyncio / blocking | Blocking / NIO |
| Memory model | No shared state by default | Shared + channels | GIL protects | JMM + volatile/synchronized |
| Stack per unit | N/A | ~2KB (grows) | ~8MB (thread) | ~512KB-1MB / ~few KB (virtual) |
| 10k concurrent I/O | Easy | Easy | asyncio ok | Easy (virtual threads) |

---

## When to Use What

**Node.js:** API gateways, real-time apps (websockets), microservices with heavy I/O, BFF (backend for frontend). Not ideal for CPU-heavy work.

**Go:** High-performance services, CLI tools, systems programming, anything needing true parallelism with simple code. Great for microservices.

**Python asyncio:** Data pipelines, ML serving, web scrapers. Use multiprocessing for CPU-bound ML training.

**Java:** Enterprise applications, systems requiring rich ecosystem, anything benefiting from virtual threads (Java 21+).

---

## Interview Questions

**Q: What's the difference between concurrency and parallelism?**
Concurrency = dealing with multiple things (interleaving). Parallelism = doing multiple things simultaneously (multiple cores). Node.js is concurrent but not parallel (single thread). Go is both.

**Q: Why doesn't Python benefit from multi-threading for CPU work?**
The GIL allows only one thread to execute Python bytecode at a time. CPU-bound threads still contend on the GIL. Solution: `multiprocessing` (separate processes, no GIL) or C extensions that release the GIL.

**Q: How are Go goroutines different from OS threads?**
Goroutines have a tiny initial stack (~2KB vs ~1MB for OS threads), are multiplexed N:M onto OS threads by the Go scheduler, and are managed entirely in user space. You can have millions of goroutines. The scheduler parks goroutines on blocking I/O and resumes them when ready.

**Q: What are Java virtual threads and why do they matter?**
Virtual threads (Java 21) are lightweight threads managed by the JVM that unmount from their carrier (OS) thread during blocking I/O. This enables blocking-style code with the concurrency of async/non-blocking code — millions of concurrent requests without NIO complexity.

**Q: How does Node.js handle concurrent requests if it's single-threaded?**
The event loop processes one callback at a time, but I/O operations are delegated to the OS (epoll/kqueue) or libuv's thread pool. While waiting for I/O, the event loop processes other events. The single thread never blocks; it only executes ready callbacks.
