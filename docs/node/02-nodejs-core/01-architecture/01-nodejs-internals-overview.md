# Node.js Architecture & Internals Overview

## What is Node.js?

Node.js is NOT just a JavaScript runtime. It's a **platform** built on top of multiple components:

```
┌─────────────────────────────────────────────────────────────┐
│                    Your Application                          │
├─────────────────────────────────────────────────────────────┤
│              Node.js Standard Library (JS)                   │
│        (fs, http, crypto, stream, path, os, etc.)           │
├─────────────────────────────────────────────────────────────┤
│              Node.js Bindings (C/C++)                        │
│         (bridges JS world to native libraries)               │
├──────────────────────┬──────────────────────────────────────┤
│     V8 Engine        │            libuv                      │
│  (JS execution,      │  (event loop, async I/O,             │
│   JIT, GC)           │   thread pool, OS abstraction)        │
├──────────────────────┼──────────────────────────────────────┤
│    c-ares            │  OpenSSL  │  zlib  │  http_parser     │
│  (async DNS)         │  (crypto) │ (gzip) │  (HTTP parsing)  │
└──────────────────────┴───────────┴────────┴─────────────────┘
```

### Components:

| Component | Language | Role |
|-----------|----------|------|
| V8 | C++ | JavaScript engine (parse, compile, execute JS, GC) |
| libuv | C | Event loop, async I/O, thread pool, OS abstraction |
| Node Bindings | C++ | Glue between V8 and libuv/OS libraries |
| c-ares | C | Async DNS resolution |
| OpenSSL | C | TLS/SSL, crypto |
| zlib | C | Compression |
| llhttp | C | HTTP parsing |

---

## The Event-Driven, Non-Blocking Model

Node.js handles I/O using an **event-driven, non-blocking** model:

```
Traditional (Thread-per-request):
Request → Thread → [wait for DB] → [wait for file] → Response
         Thread → [wait for DB] → [wait for file] → Response
         Thread → [wait for DB] → [wait for file] → Response
         (each thread blocks while waiting → need many threads)

Node.js (Single-threaded Event Loop):
Request → Initiate DB query → REGISTER CALLBACK → continue
Request → Initiate File read → REGISTER CALLBACK → continue
Request → Initiate Network → REGISTER CALLBACK → continue
          ↓ (non-blocking — returns immediately)
[DB responds] → callback runs → send response
[File read]   → callback runs → send response
[Network]     → callback runs → send response
```

This makes Node.js extremely efficient for I/O-bound work — one thread handles thousands of concurrent connections by never blocking.

---

## Node.js Startup Sequence

What happens when you run `node app.js`:

1. **Parse & compile** — V8 parses the JS, compiles to bytecode
2. **Initialize built-in modules** — `fs`, `http`, `path`, etc.
3. **Run your module** — execute `app.js` through module wrapper
4. **Enter event loop** — start libuv event loop
5. **Process events** — handle I/O, timers, callbacks
6. **Exit** — if event loop has nothing pending, process exits

```javascript
// Node.js wraps every module in this:
(function(exports, require, module, __filename, __dirname) {
  // Your module code here
});

// This is why:
console.log(arguments.length); // 5 — the 5 wrapper params
console.log(__dirname);        // works — it's a param, not a global!
console.log(module.exports);   // works — same
```

---

## Why Node.js is Great for I/O (and bad for CPU)

```javascript
// I/O bound — Node.js shines:
app.get('/users', async (req, res) => {
  const users = await db.query('SELECT * FROM users'); // non-blocking!
  // While waiting for DB, Node serves OTHER requests
  res.json(users);
});

// CPU bound — Node.js struggles:
app.get('/hash', (req, res) => {
  const hash = expensiveHashFunction(req.body.data); // BLOCKS event loop!
  // While hashing, NO OTHER requests are served
  res.json({ hash });
});
```

**I/O operations** (network, file, DNS) are handed to libuv which uses OS-level async APIs (epoll on Linux, kqueue on macOS, IOCP on Windows). The event loop is free.

**CPU operations** (hashing, sorting, image processing) run on the JS thread. The event loop is blocked.

---

## The Role of libuv

libuv is the secret sauce. It provides:

1. **Event Loop** — the core mechanism that drives Node.js
2. **Thread Pool** (default 4 threads) — for CPU-bound OS operations that don't have async APIs (fs, dns.lookup, crypto, zlib)
3. **I/O Watcher** — monitors file descriptors for events using OS APIs
4. **Timers** — setTimeout/setInterval management
5. **Cross-platform** — abstracts Windows/Linux/macOS differences

```
libuv thread pool handles:
├── fs operations (file I/O on some platforms)
├── dns.lookup() (getaddrinfo)
├── crypto (pbkdf2, scrypt, randomBytes)
├── zlib (compression)
└── Custom C++ addons that use threadpool

OS async handles:
├── TCP/UDP networking (sockets)
├── Pipes
├── TTY
└── Signal events
```

---

## Process vs Thread in Node.js

```javascript
// Node.js has ONE main JS thread
// But the process has several threads total:
// - Main JS thread (the event loop)
// - libuv thread pool (4 by default)
// - V8 helper threads (GC, compiler)

// Check:
console.log(process.pid);      // process ID
console.log(process.ppid);     // parent process ID
console.log(process.platform); // 'linux', 'darwin', 'win32'
console.log(process.arch);     // 'x64', 'arm64', etc.
console.log(process.version);  // Node.js version

// Environment:
console.log(process.env.NODE_ENV);  // environment variable
console.log(process.argv);          // command line arguments
console.log(process.cwd());         // current working directory
console.log(process.memoryUsage()); // memory stats
```

---

## Node.js is Ideal When:

✅ API servers with many concurrent connections
✅ Real-time applications (chat, gaming, live feeds)
✅ Streaming data (video, large files)
✅ Microservices with I/O coordination
✅ CLI tools
✅ Proxy / Gateway servers

## Node.js is NOT Ideal When:

❌ CPU-intensive computing (video encoding, ML inference)
❌ Heavy mathematical computations
❌ Applications needing true parallelism for compute

**Solutions for CPU work in Node.js:**
- Worker Threads (parallel JS execution)
- Child processes
- Native addons (N-API)
- Offload to specialized services

---

## Interview Questions

**Q: What are the main components of Node.js?**
A: V8 (JS execution, JIT, GC), libuv (event loop, async I/O, thread pool), Node.js Bindings (C++ glue), and built-in libraries. libuv provides cross-platform async I/O and the event loop.

**Q: Why is Node.js single-threaded but can handle many concurrent connections?**
A: Node.js JS execution is single-threaded, but I/O operations are non-blocking — they're delegated to libuv which uses OS async APIs (epoll/kqueue/IOCP). The event loop handles callbacks when operations complete. No thread is blocked waiting for I/O. libuv also has a 4-thread pool for operations that require blocking (like crypto and some fs operations).

**Q: What wraps every Node.js module?**
A: The module wrapper: `(function(exports, require, module, __filename, __dirname) { ... })`. This is why you can use `require`, `module.exports`, `__dirname` etc. in every module — they're injected as parameters.

**Q: When should you NOT use Node.js?**
A: CPU-intensive tasks (video encoding, complex calculations, ML) that block the event loop. For these, use Worker Threads, Child Processes, or delegate to specialized services. Node.js excels at I/O concurrency, not CPU parallelism.
