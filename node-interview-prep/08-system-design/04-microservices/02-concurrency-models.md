# Concurrency Models — Node.js vs WSGI vs Threads vs Go

Understanding how different server runtimes handle concurrent requests is a common senior interview topic.

---

## The Core Problem: Handling 10,000 Concurrent Connections

```
Each HTTP connection is a file descriptor (socket).
OS can handle millions of file descriptors.
Problem: how does your server handle 10k simultaneous requests?

Option 1: One thread per request   → 10k threads → memory explosion, context switching
Option 2: Thread pool              → bounded threads, requests queue
Option 3: Async I/O / Event Loop   → one thread, never blocks
Option 4: Lightweight coroutines   → green threads / goroutines
```

---

## Thread-Per-Request Model (Apache, Java Tomcat, Rails + Puma)

```
┌─────────┐  request  ┌─────────────┐  spawn/assign  ┌──────────────┐
│ Client  │ ─────────→│   Server    │ ──────────────→ │   Thread 1   │ ← handles req1
└─────────┘           └─────────────┘                 ├──────────────┤
                                                       │   Thread 2   │ ← handles req2
                                                       ├──────────────┤
                                                       │   Thread 3   │ ← handles req3
                                                       └──────────────┘

Each thread:
  - Stack: 512KB - 8MB per thread
  - Context switch: ~5µs of CPU time
  - 10,000 threads = ~5-40GB of RAM just for stacks

Thread pool (fixed size):
  Pool of N threads. Incoming requests queue. When thread finishes → picks next.
  JVM default: 200 threads
  Max concurrent = pool size
  Requests beyond pool size queue or get rejected (503)
```

```java
// Java/Spring Boot — thread-per-request by default:
@RestController
public class OrderController {
    @GetMapping("/orders/{id}")
    public Order getOrder(@PathVariable Long id) {
        // Each request runs in its own thread from the thread pool
        Order order = db.findById(id); // BLOCKS the thread while waiting for DB
        return order;
    }
}
// Thread is idle during DB wait — not using CPU, but still occupying stack memory
```

---

## WSGI — Python's Synchronous Server Interface

```
WSGI = Web Server Gateway Interface (PEP 3333)
Standard interface between Python web apps and web servers.

Request handling:
  1. Web server (Gunicorn/uWSGI) receives HTTP request
  2. Calls WSGI app as a callable: app(environ, start_response)
  3. App returns an iterable of response body chunks
  4. Everything is SYNCHRONOUS — no async/await in WSGI

def application(environ, start_response):
    status = '200 OK'
    headers = [('Content-Type', 'text/plain')]
    start_response(status, headers)
    return [b'Hello World']  # WSGI app

Gunicorn worker types:
  sync (default): one thread per worker, blocks on I/O
  gthread:        threads per worker (thread-per-request within each worker)
  gevent:         monkey-patches stdlib with greenlets (async via greenlets)
  eventlet:       similar to gevent

Typical production: gunicorn --workers 4 --worker-class sync
  4 workers = 4 simultaneous requests (per process)
  Each worker is a forked Python process
  Formula: workers = 2 × CPU_cores + 1
```

```
WSGI Concurrency Model:
┌──────────────┐   HTTP   ┌─────────────────────────────────┐
│  nginx       │ ────────→│   Gunicorn (pre-fork model)      │
│  (reverse    │          │                                  │
│   proxy)     │          │  Worker 1 (PID 1234): req 1      │
└──────────────┘          │  Worker 2 (PID 1235): req 2      │
                          │  Worker 3 (PID 1236): req 3      │
                          │  Worker 4 (PID 1237): idle       │
                          │  req 5: WAITING (all workers busy)│
                          └─────────────────────────────────┘

With sync workers:
  req doing: db query (10ms) + external API (200ms) + response (1ms)
  Worker is BLOCKED for 211ms — not usable by other requests
  4 workers → max ~4/0.211 ≈ 19 RPS per second efficiently
```

---

## ASGI — Python's Async Interface

```
ASGI = Asynchronous Server Gateway Interface
Supports async/await, WebSockets, and HTTP/2.
Frameworks: FastAPI, Django 3.1+ (async views), Starlette

async def application(scope, receive, send):
    if scope['type'] == 'http':
        body = await receive()
        await send({'type': 'http.response.start', 'status': 200, ...})
        await send({'type': 'http.response.body', 'body': b'Hello'})

Servers: uvicorn (uses uvloop), hypercorn, daphne

With async:
  Same 4 workers, but each worker can handle THOUSANDS of concurrent requests
  if they're I/O bound (DB, external APIs)
  Worker 1 running 500 async coroutines — all suspended waiting for I/O
  when one gets its I/O result, it runs briefly, suspends again
```

---

## Node.js — Single-Threaded Event Loop

```
┌──────────────────────────────────────────────────────────────┐
│                    Node.js Process                           │
│                                                              │
│   Single thread runs JS (your code)                          │
│                                                              │
│   Event Loop:  poll I/O completions → run callbacks          │
│                                                              │
│   libuv thread pool (4 threads): handles blocking I/O        │
│     fs.readFile, crypto, dns.lookup                          │
│                                                              │
│   OS async I/O: TCP, UDP → no threads needed                 │
└──────────────────────────────────────────────────────────────┘

10,000 HTTP connections:
  Each connection = a socket file descriptor (just an integer)
  OS monitors all 10k sockets via epoll/kqueue
  When data arrives → Node.js callback fires
  Your JS code runs briefly, suspends at next I/O → back to event loop
  Memory per connection: ~2KB (socket buffer) vs 512KB-8MB (thread stack)
```

```javascript
// Node.js HTTP server — handles 10k concurrent connections in one thread
import http from 'http';
import { Pool } from 'pg';

const pool = new Pool({ max: 20 }); // only 20 actual DB connections needed!

const server = http.createServer(async (req, res) => {
  // This callback runs in the single JS thread
  // But it SUSPENDS during await, letting other requests run

  const result = await pool.query('SELECT * FROM orders WHERE id = $1', [1]);
  // ↑ suspends here — event loop handles other requests
  // ↑ pool has only 20 connections for potentially 10,000 concurrent requests!
  // ↑ other requests await in queue — the pool manages this

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result.rows));
});

server.listen(3000);
// This single process handles 10k connections efficiently!
```

### What Blocks Node.js

```javascript
// ❌ This BLOCKS the event loop — ALL requests stall:
app.get('/compute', (req, res) => {
  // Synchronous CPU-intensive work — event loop cannot process other requests
  const result = fibonacci(45);  // takes 10+ seconds!
  res.json({ result });
});

// ✅ Offload to worker thread:
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';

app.get('/compute', (req, res) => {
  const worker = new Worker('./fibonacci-worker.js', {
    workerData: { n: 45 }
  });
  worker.on('message', result => res.json({ result }));
  worker.on('error', err => res.status(500).json({ error: err.message }));
});

// fibonacci-worker.js:
if (!isMainThread) {
  const result = fibonacci(workerData.n);
  parentPort?.postMessage(result);
}
```

---

## Go — Goroutines (M:N Threading)

```
Go uses goroutines: lightweight threads managed by the Go runtime.

OS threads (M): small number (1 per CPU core typically)
Goroutines (N): can have millions; only a few run at a time

Go runtime scheduler:
  Maps N goroutines onto M OS threads
  When goroutine blocks (I/O, channel, mutex):
    Runtime parks it, runs another goroutine on that OS thread
  Goroutine stack: starts at 8KB (dynamic, grows/shrinks)
  OS thread stack: 1-8MB fixed

10,000 concurrent connections in Go:
  10,000 goroutines, one per connection
  Total stack: 10k × 8KB = 80MB (vs 10k × 1MB threads = 10GB)
  Go scheduler runs them on 4-8 OS threads
  When goroutine does I/O → suspended → another goroutine runs
```

```go
// Go HTTP server — each request gets its own goroutine:
package main

import (
  "database/sql"
  "encoding/json"
  "net/http"
)

func handler(w http.ResponseWriter, r *http.Request) {
  // Runs in its own goroutine (lightweight thread)
  // Can use BLOCKING-style I/O — scheduler suspends goroutine automatically
  rows, err := db.QueryContext(r.Context(), "SELECT * FROM orders WHERE id = $1", 1)
  // ↑ looks synchronous but goroutine is suspended during DB wait
  if err != nil { http.Error(w, err.Error(), 500); return }
  // ...
  json.NewEncoder(w).Encode(rows)
}

func main() {
  http.HandleFunc("/orders", handler)
  http.ListenAndServe(":8080", nil)
  // Each connection → new goroutine → blocking I/O works naturally
}
```

---

## Comparison Table

```
Model              | Runtime          | Concurrency Unit | Memory/Unit | I/O Style
───────────────────┼──────────────────┼──────────────────┼─────────────┼──────────
Thread-per-request | Java/C#/Rails    | OS thread        | 1-8MB       | Blocking
WSGI (sync)        | Python+Gunicorn  | Process/Thread   | ~50-100MB   | Blocking
WSGI (gevent)      | Python+gevent    | Greenlet         | ~few KB     | Patched
ASGI               | Python+uvicorn   | Coroutine        | ~few KB     | async/await
Node.js            | V8 + libuv       | Callback/Promise | ~2KB/conn   | async/await
Go                 | Go runtime       | Goroutine        | 8KB+        | Blocking*
Erlang/Elixir      | BEAM VM          | Erlang process   | ~300 bytes  | Message-pass
Rust (tokio)       | tokio async rt   | Future/Task      | ~few KB     | async/await

* Looks blocking, scheduler suspends automatically
```

---

## When to Choose What

```
Node.js:
  ✓ I/O-bound workloads (REST APIs, BFF, proxies)
  ✓ Real-time (WebSockets, SSE)
  ✓ JSON-heavy APIs (V8 is fast at JSON)
  ✗ CPU-intensive computation (use worker threads or separate service)
  ✗ Heavy parallel computation (Go/Rust more efficient)

Python ASGI (FastAPI):
  ✓ ML/data science (Python ecosystem — numpy, pandas, torch)
  ✓ Rapid prototyping
  ✓ Data pipelines
  ✗ High-throughput APIs (Python interpreter overhead)

Go:
  ✓ High-throughput network services
  ✓ Systems programming (CLI tools, gRPC services)
  ✓ When you need true parallelism without threads complexity
  ✗ Rich ecosystem for web (JS/Python win here)

Java/JVM:
  ✓ Enterprise, complex business logic
  ✓ Reactive (Webflux) for async
  ✓ Strong ecosystem (Spring)
  ✗ Startup time (JVM warmup) — bad for serverless
  ✗ Memory (JVM overhead)

Serverless (Lambda):
  ✓ Sporadic traffic, extreme scaling
  ✓ No server management
  ✗ Cold starts
  ✗ Long-running tasks
  ✗ Stateful connections (WebSockets complicated)
```

---

## The C10K Problem and Modern Solutions

```
C10K (10,000 concurrent connections) — classic 1999 paper by Dan Kegel.

Old approach: one thread per connection.
  10k threads × 1MB stack = 10GB RAM. Plus context switch overhead.
  Falls apart at scale.

Modern solutions:
  1. Async I/O with event loop (Node.js, nginx, Redis)
     OS handles I/O multiplexing (epoll on Linux, kqueue on macOS)
     Single thread handles thousands of sockets

  2. Lightweight concurrency primitives (Go goroutines, Erlang processes)
     Thousands of "threads" with tiny stacks
     Runtime scheduler, not OS scheduler

  3. Reactor pattern (Java Netty, Vert.x)
     Non-blocking NIO, event-driven, callbacks

Today we talk about C10M (10 million connections):
  Needed by: live trading, game servers, IoT
  Requires: kernel bypass (DPDK), RDMA, custom network stack
  Normal backends don't need this
```

---

## Common Interview Questions

**Q: Why is Node.js good for I/O-bound but bad for CPU-bound?**
Node.js runs JavaScript on a single thread. For I/O (network, disk), the thread suspends while waiting and the event loop handles other requests. For CPU work (hashing, image processing, compression), the thread runs continuously — blocking all other requests. Solution: offload CPU work to worker threads, child processes, or a separate service.

**Q: What is WSGI? How is it different from ASGI?**
WSGI (PEP 333) is Python's synchronous web server interface — `app(environ, start_response)`. Each request blocks a worker thread/process until complete. ASGI is the async version — `async def app(scope, receive, send)`. ASGI supports async/await, WebSockets, and HTTP/2. FastAPI uses ASGI; Flask/Django (older versions) use WSGI.

**Q: How does Go handle 10k concurrent connections with only 4 OS threads?**
Go uses M:N threading. Goroutines are user-space lightweight threads (start at 8KB stack). The Go runtime scheduler maps N goroutines onto M OS threads. When a goroutine blocks on I/O, the scheduler parks it and runs another goroutine on that OS thread. You write blocking-style code but the scheduler makes it non-blocking.

**Q: What is the event loop and why can't you block it?**
The Node.js event loop is a single-threaded loop that processes I/O callbacks, timers, and promises. When you `await fetch(...)`, Node.js registers a callback and yields — the event loop processes other callbacks. If you run a CPU-heavy loop synchronously, the event loop thread is occupied — no other callbacks can run, so all concurrent requests stall until your loop finishes.

**Q: How many Node.js processes should you run on a 4-core machine?**
One per CPU core — so 4 processes. Use the `cluster` module or PM2 in cluster mode. Each process gets its own V8 instance and event loop. The OS distributes connections across processes. Alternatively, run 1 process with worker threads for CPU tasks.
