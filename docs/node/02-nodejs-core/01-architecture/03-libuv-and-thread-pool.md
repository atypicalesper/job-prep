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

Default: **4 threads**. Configurable via `UV_THREADPOOL_SIZE` env var (max 1024).

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

If all pool threads are busy and more work arrives, it queues and waits:

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

On most platforms, file I/O goes through the thread pool because most OS file operations are blocking:

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
