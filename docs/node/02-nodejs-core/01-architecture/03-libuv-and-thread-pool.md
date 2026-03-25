# libuv and the Thread Pool

## What is libuv?

libuv is the C library that provides Node.js with:
- The **event loop** (core async mechanism)
- **Async I/O** using OS-level APIs
- A **thread pool** for operations without async OS support
- Cross-platform abstraction (Windows/Linux/macOS)
- Timers, signals, child processes, TCP/UDP/pipes

```
┌──────────────────────────────────────────┐
│              libuv                        │
│                                          │
│  ┌──────────────┐  ┌──────────────────┐  │
│  │  Event Loop  │  │   Thread Pool    │  │
│  │  (main thread│  │ (4 worker threads│  │
│  │   — single)  │  │  by default)     │  │
│  └──────────────┘  └──────────────────┘  │
│                                          │
│  OS Async APIs:                          │
│  epoll (Linux) / kqueue (macOS) / IOCP   │
└──────────────────────────────────────────┘
```

---

## Two Types of Async Operations

Not all async operations are created equal in libuv. Some OS primitives — primarily network sockets — expose a truly non-blocking API where the OS notifies the application when data is ready (via epoll/kqueue/IOCP). Others, particularly file system operations and some crypto primitives, only have blocking syscall interfaces on most platforms. libuv handles these two categories with entirely different mechanisms. Understanding which category an operation falls into explains why `http.get` is free while `crypto.pbkdf2` can saturate a thread pool.

### Type 1: OS-Level Async (no thread pool needed)

For I/O with proper OS async support, libuv registers file descriptors and gets notified via OS mechanisms:

```
Operation starts → libuv registers fd with epoll/kqueue
                → Event loop continues (no thread blocked)
                → OS notifies when data ready
                → Callback queued in event loop
```

Operations handled this way:
- **TCP/UDP networking** (the primary use case)
- **Pipes and IPC**
- **TTY (terminal) I/O**
- **DNS resolution** (via c-ares library)

```javascript
// This does NOT use thread pool — pure OS async:
const net = require('net');
const server = net.createServer(socket => {
  socket.on('data', data => {
    socket.write(data); // echo
  });
});
server.listen(3000);
// Can handle thousands of concurrent connections on ONE thread!
```

### Type 2: Thread Pool (for blocking operations)

Some operations don't have async OS APIs, so libuv runs them in a thread pool:

```
Operation starts → submitted to thread pool
                → worker thread executes blocking call
                → main thread (event loop) continues freely
                → when thread finishes → callback queued
```

Operations using the thread pool:
- **File I/O** (`fs.readFile`, `fs.writeFile`, etc.) — on some platforms
- **DNS lookup** (`dns.lookup`) — uses `getaddrinfo` which is blocking
- **Crypto** (`crypto.pbkdf2`, `crypto.scrypt`, `crypto.randomBytes`)
- **zlib** (compression/decompression)
- Custom C++ addons that use `uv_queue_work`

---

## Thread Pool Size

The thread pool has a default size of 4 because that was historically a reasonable match for the number of cores on a server. It is configurable up to 1024 via the `UV_THREADPOOL_SIZE` environment variable. The right size depends on your workload: if your server does many concurrent password hashes or file reads, a larger pool reduces queuing time; if threads spend most of their time blocked on I/O, more threads help; if they are CPU-bound, more threads than cores can hurt due to context switching overhead.

```javascript
// Check thread pool usage:
const crypto = require('crypto');
const { performance } = require('perf_hooks');

// Default pool size = 4
// 4 concurrent crypto operations use all threads:
const start = performance.now();

const promises = Array.from({ length: 8 }, () =>
  new Promise(resolve => {
    crypto.pbkdf2('password', 'salt', 100000, 64, 'sha256', (err, key) => {
      resolve(performance.now() - start);
    });
  })
);

// First 4 start immediately, next 4 wait for a free thread
const times = await Promise.all(promises);
// times: [~1000, ~1000, ~1000, ~1000, ~2000, ~2000, ~2000, ~2000]
// First batch: all finish around 1s (parallel)
// Second batch: wait for first, finish around 2s
```

### Increasing Thread Pool Size

The environment variable must be set before Node.js starts initializing libuv — setting it after the process has started (e.g., inside application code after the first async operation) has no effect. The safest approach is to set it at process launch via the shell environment.

```bash
UV_THREADPOOL_SIZE=8 node app.js
```

Or in code (must be set BEFORE any async operations):
```javascript
process.env.UV_THREADPOOL_SIZE = '8';
// Must be set at the very start of the program
```

**When to increase thread pool:**
- Heavy crypto operations (many concurrent password hashes)
- Heavy file I/O
- Many concurrent DNS lookups (dns.lookup)

---

## Thread Pool Exhaustion

Thread pool exhaustion is a silent performance killer. When all 4 (or however many) threads are busy, new thread-pool work queues behind them. Because the thread pool is shared across all categories of work — crypto, file I/O, and `dns.lookup` all compete for the same threads — a burst of password hashing can indirectly slow down file reads for other in-flight requests. This is different from event loop blocking: the event loop itself stays free, but thread-pool callbacks pile up and are delivered late.

```javascript
// Pool exhaustion example — blocks all threads with crypto:
const crypto = require('crypto');

function heavyCrypto() {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2('pwd', 'salt', 1000000, 64, 'sha256', (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

// With default pool size of 4:
// First 4 requests → immediately start (threads available)
// 5th request → QUEUED! Waits for a thread to free up
// This delays ALL other thread pool work (file reads, dns.lookup, etc.)!

// In an HTTP server, this means ALL incoming requests that need file I/O
// will be queued behind your heavy crypto operations
```

**Solutions:**
- Increase `UV_THREADPOOL_SIZE`
- Use dedicated worker threads for CPU-heavy crypto
- Use hardware-accelerated crypto where available

---

## What Uses (and Doesn't Use) Thread Pool

```javascript
// Uses thread pool:
const fs = require('fs');
fs.readFile('file.txt', callback);          // ✅ thread pool

const dns = require('dns');
dns.lookup('google.com', callback);         // ✅ thread pool (getaddrinfo)

const crypto = require('crypto');
crypto.pbkdf2('pwd', 'salt', 100k, 64, 'sha256', callback); // ✅ thread pool

const zlib = require('zlib');
zlib.gzip(data, callback);                  // ✅ thread pool

// Does NOT use thread pool (OS async):
const http = require('http');
http.get('http://example.com', callback);  // ❌ no thread pool — epoll/kqueue

const net = require('net');
const socket = net.createConnection(3000); // ❌ no thread pool

const dns = require('dns');
dns.resolve('google.com', callback);       // ❌ no thread pool (uses c-ares async)
// Note: dns.lookup vs dns.resolve:
// dns.lookup → thread pool (OS getaddrinfo — blocking)
// dns.resolve → c-ares async (no thread pool) — use this for servers!
```

---

## dns.lookup vs dns.resolve — Critical Difference!

`dns.lookup` and `dns.resolve` both resolve hostnames, but they use completely different internal mechanisms. `dns.lookup` delegates to the OS `getaddrinfo` syscall, which is blocking and therefore runs on a libuv thread pool worker. `dns.resolve*` uses c-ares, a fully async DNS library that operates without any thread pool threads. In a server that makes many concurrent outbound HTTP requests (each of which calls `dns.lookup` internally), the thread pool can become the bottleneck even though no file I/O is happening. Use `dns.resolve4` / `dns.resolve6` or force `http.request` to use a custom lookup based on c-ares for high-concurrency outbound request scenarios.

```javascript
const dns = require('dns');

// ❌ Uses thread pool (one thread per lookup!)
dns.lookup('google.com', (err, address) => {
  console.log(address);
});

// ✅ Uses c-ares async DNS (no thread pool)
dns.resolve4('google.com', (err, addresses) => {
  console.log(addresses);
});
```

If your server does many concurrent `dns.lookup()` calls (e.g., via `http.get()` which uses `dns.lookup` internally), you can exhaust the thread pool!

**Use `dns.resolve*()` variants for servers with many concurrent DNS lookups.**

---

## libuv File I/O Implementation

Despite what the name "async" suggests, most file system operations on Linux and macOS do not have a truly non-blocking kernel API the way network sockets do. POSIX `aio_read` exists but has severe limitations in practice. libuv therefore handles file I/O by running the blocking `open()`/`read()`/`close()` syscalls on thread pool workers. The main event loop thread stays free, but the work is genuinely blocking on the worker thread. On Windows, libuv uses the native IOCP (I/O Completion Ports) API which does provide true async file I/O at the OS level.

```
fs.readFile('file.txt', callback):

Main Thread (event loop):
1. Call fs.readFile → libuv queues read task
2. Continue processing other events
3. When thread completes → callback queued
4. Event loop picks up callback → runs it

Thread Pool (worker thread):
1. Receive read task
2. Execute blocking open() → read() → close() syscalls
3. When complete → signal main thread with result
```

---

## Interview Questions

**Q: What is the libuv thread pool and what does it do?**
A: libuv's thread pool (default 4 threads) handles I/O operations that don't have non-blocking OS APIs — primarily file system operations, `dns.lookup`, crypto (`pbkdf2`, `scrypt`), and zlib. The thread pool lets these blocking operations run without blocking Node.js's main event loop thread.

**Q: What is the difference between `dns.lookup` and `dns.resolve`?**
A: `dns.lookup` uses the OS `getaddrinfo()` function which is blocking and goes through libuv's thread pool. `dns.resolve` uses the c-ares library which provides truly async DNS without the thread pool. In servers with many concurrent DNS lookups, use `dns.resolve*()` variants to avoid thread pool exhaustion.

**Q: How does increasing UV_THREADPOOL_SIZE help and when would you do it?**
A: Increasing it allows more concurrent thread-pool operations. Do it when you have many concurrent: password hashing operations, file I/O, `dns.lookup` calls, or zlib operations. Set it before any I/O happens, or via the `UV_THREADPOOL_SIZE` environment variable.

**Q: Why do network requests not use the thread pool?**
A: TCP/UDP/HTTP network I/O uses OS-level async APIs (epoll on Linux, kqueue on macOS, IOCP on Windows). The OS notifies libuv when data arrives via file descriptor events. No thread needs to block waiting for network data.
