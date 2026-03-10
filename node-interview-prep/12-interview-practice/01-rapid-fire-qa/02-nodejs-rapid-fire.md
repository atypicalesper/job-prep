# Node.js — 50 Rapid-Fire Q&A

---

**Q1: What is Node.js?**
A JavaScript runtime built on Chrome's V8 engine with libuv for non-blocking I/O. Single-threaded event loop. Excellent for I/O-bound workloads (APIs, streaming), not CPU-bound work.

---

**Q2: What is the event loop in Node.js?**
A loop that processes events and executes callbacks. Phases: timers → pending callbacks → idle/prepare → poll → check (setImmediate) → close callbacks. Microtasks (nextTick, Promises) run between each phase.

---

**Q3: What is the difference between `process.nextTick` and `setImmediate`?**
`nextTick` runs before the next I/O event — at the end of the current operation, before any I/O. `setImmediate` runs in the check phase of the event loop — after I/O callbacks. `nextTick` has higher priority but can starve I/O if called recursively.

---

**Q4: What is libuv?**
C library that provides Node.js with asynchronous I/O, event loop, and thread pool. Handles file system operations, DNS lookups, timers. The thread pool (default 4 threads) handles operations that can't be done asynchronously by the OS.

---

**Q5: What is the Node.js thread pool?**
libuv's pool of worker threads (default 4, max 1024 via `UV_THREADPOOL_SIZE`) that handle blocking operations: `fs.*` methods, `dns.lookup`, `crypto` operations, `zlib`. Network I/O is handled by OS async APIs (not thread pool).

---

**Q6: What is `require.cache`?**
The cache of loaded modules. After the first `require('./module')`, the result is stored in `require.cache` keyed by filename. Subsequent requires return the cached export without re-executing the module. This is how Node.js singleton pattern works.

---

**Q7: How do you clear the module cache?**
`delete require.cache[require.resolve('./module')]` — forces re-execution on next require. Useful in tests for fresh module state. Not recommended in production.

---

**Q8: What is the difference between `exports` and `module.exports`?**
`exports` is an alias for `module.exports`. `require()` returns `module.exports`. If you reassign `exports = {}`, it breaks the alias — `module.exports` still points to the original. Always use `module.exports` when exporting a single value/function.

---

**Q9: What is a Buffer?**
Fixed-size chunk of raw binary data (bytes). Used for I/O operations (files, TCP streams). Like a `Uint8Array` with extra methods. Created with `Buffer.from('hello', 'utf8')`, `Buffer.alloc(size)`. Used when you need to work with binary data directly.

---

**Q10: What are the 4 types of streams?**
Readable (input), Writable (output), Duplex (both), Transform (read+write+transform data). Examples: `fs.createReadStream` (Readable), `process.stdout` (Writable), TCP socket (Duplex), `zlib.createGzip()` (Transform).

---

**Q11: What is backpressure?**
When a consumer (Writable) can't keep up with a producer (Readable). `writable.write()` returns `false` when internal buffer is full — the producer should stop sending until the `drain` event fires. `pipe()` and `pipeline()` handle backpressure automatically.

---

**Q12: What is the difference between `pipe` and `pipeline`?**
`pipe` forwards data but NOT errors — you need separate error handlers on each stream. If one stream errors, others may not be cleaned up (file handle leak). `pipeline` (Node.js 10+) properly handles errors and cleanup for all streams in the chain.

---

**Q13: What is a Worker Thread?**
Actual OS threads that can run JavaScript in parallel. Unlike child processes, worker threads share memory via `SharedArrayBuffer`. Use for CPU-intensive work (image processing, crypto, ML) to avoid blocking the main event loop.

---

**Q14: What is the difference between Worker Threads and Child Processes?**
Child processes: separate memory space, communicate via IPC/stdin/stdout, more isolation, more overhead. Worker threads: shared memory (SharedArrayBuffer), faster communication, same process. Use child processes for isolation/different runtimes; workers for parallel JS computation.

---

**Q15: What is the Cluster module?**
Allows creating multiple Node.js processes that all share the same port. The master process forks N worker processes (typically = CPU cores). OS distributes incoming connections. Each worker has its own memory. For horizontal scaling on a single machine.

---

**Q16: What is `process.exit()` and when should you use it?**
Terminates the Node.js process with an exit code (0 = success, 1 = error). Use only in CLI scripts or after graceful shutdown. Don't call it inside request handlers — it kills the server for all users. Better: throw errors and let the process manager restart.

---

**Q17: What is the difference between `SIGTERM` and `SIGKILL`?**
`SIGTERM` — graceful shutdown request. Process can catch it, close connections, flush buffers, then exit. `SIGKILL` — immediate kill by OS. Process cannot catch or ignore it. Kubernetes sends SIGTERM first, then SIGKILL after grace period.

---

**Q18: What is `AsyncLocalStorage`?**
Async context propagation — store and retrieve data throughout an async call chain without passing it as arguments. Used for request IDs, user context in logging. Like thread-local storage but for async operations.

---

**Q19: What does `--inspect` flag do?**
Enables V8 inspector protocol on port 9229. Allows connecting Chrome DevTools or VS Code for debugging (breakpoints, call stack, memory heap). `--inspect-brk` pauses before any code runs.

---

**Q20: What is the difference between ESM and CommonJS?**
CommonJS: `require()` (synchronous), `module.exports`, runs at module load time, no static analysis. ESM: `import`/`export` (static, async with dynamic `import()`), live bindings, top-level await, better tree-shaking. Node.js uses `.mjs`/`.cjs` or `"type": "module"` in package.json.

---

**Q21: What is `util.promisify`?**
Converts callback-style Node.js functions to Promise-returning functions. `const readFile = util.promisify(fs.readFile)`. Works with functions that follow the Node.js callback convention: `(err, result) => void`.

---

**Q22: What is the difference between `fs.readFile` and `fs.createReadStream`?**
`readFile` loads entire file into memory — bad for large files. `createReadStream` reads in chunks (default 64KB) — memory-efficient for large files. Use streams for files > 100MB or when piping to HTTP response.

---

**Q23: What is `process.env`?**
Object containing the user's environment variables. `process.env.NODE_ENV`, `process.env.PORT`. Always strings. Set via shell: `PORT=3000 node server.js`, `.env` file with dotenv, or container runtime.

---

**Q24: What is an uncaughtException?**
An error that propagates to the top of the call stack without being caught. `process.on('uncaughtException', handler)` catches it, but the process should exit after — it's in an unknown state. Use for cleanup and logging, then exit.

---

**Q25: What is unhandledRejection?**
A Promise rejection with no `.catch()` handler. Node.js v15+ terminates the process by default. `process.on('unhandledRejection', handler)` to catch. Best practice: always handle promise rejections and set up a global handler as a safety net.

---

**Q26: How do you prevent memory leaks in Node.js?**
Use WeakMap/WeakSet for temporary object associations. Remove event listeners when no longer needed (`emitter.removeListener`). Be careful with closures that capture large objects. Use streams instead of buffers for large data. Monitor with `--inspect` and heap snapshots.

---

**Q27: What is `stream.pipeline` doing under the hood?**
Chains streams, forwards data, handles errors on any stream (closes all streams if one errors), and calls the final callback when done. Wraps `pipe` with proper error handling and cleanup.

---

**Q28: What is the `os` module used for?**
System information: `os.cpus()` (CPU info + count), `os.totalmem()` / `os.freemem()`, `os.platform()`, `os.hostname()`, `os.homedir()`, `os.tmpdir()`. Useful for Cluster (fork CPU-count workers), health endpoints, platform-specific code.

---

**Q29: What is the difference between `path.join` and `path.resolve`?**
`path.join('a', 'b', 'c')` = `'a/b/c'` (concatenates with platform separator, normalizes slashes). `path.resolve('/a', 'b', '../c')` = `'/a/c'` — starts from cwd, resolves absolute path. Use `path.join(__dirname, 'file.txt')` for file paths relative to current file.

---

**Q30: What is `__dirname` vs `process.cwd()`?**
`__dirname` = absolute path to directory containing the CURRENT FILE (compile-time, doesn't change). `process.cwd()` = current working directory where the Node.js process was STARTED (can change with `process.chdir()`). Use `__dirname` for file paths relative to the source file.

---

**Q31: What is an EventEmitter and how many listeners is too many?**
Node's publish-subscribe mechanism. Default max listeners per event = 10. Exceeding it triggers a warning (possible memory leak). Set with `emitter.setMaxListeners(n)`. If you intentionally have many listeners, use `emitter.setMaxListeners(0)` to suppress.

---

**Q32: What does `Buffer.alloc` vs `Buffer.allocUnsafe` do?**
`alloc` fills memory with zeros (safe, slightly slower). `allocUnsafe` allocates without clearing — may contain old data from freed memory (unsafe but faster). Never use `allocUnsafe` for security-sensitive buffers unless you fill them immediately.

---

**Q33: What is `net.createServer` used for?**
Creates a low-level TCP server. Foundation that `http.createServer` is built on. Use for custom protocols, socket servers, proxy servers. `http` adds HTTP parsing on top.

---

**Q34: What is Node.js not suitable for?**
CPU-intensive tasks (blocks event loop): video encoding, complex math, image processing — use Worker Threads or offload. Also: multi-threaded shared memory patterns (use Cluster/Workers).

---

**Q35: What is `zlib` module used for?**
Compression: `zlib.createGzip()`, `zlib.createDeflate()`, `zlib.createBrotliCompress()`. Used to compress HTTP responses, compress files, decompress incoming data. Always use stream API for large data.

---

**Q36: What is the `vm` module?**
Sandboxed code execution. `vm.runInNewContext(code, sandbox)` runs code with a limited context. NOT fully secure — V8 escapes are possible. For actual sandboxing, use separate processes or Docker.

---

**Q37: What is `dns.lookup` vs `dns.resolve`?**
`dns.lookup` uses the OS's name resolution (same as browsers, supports `/etc/hosts`, uses thread pool). `dns.resolve` uses Node's built-in DNS client (async, doesn't use thread pool). `dns.lookup` is affected by libuv thread pool; `dns.resolve` is not.

---

**Q38: What is `--max-old-space-size` flag?**
Sets maximum heap size for V8 old generation in MB. Default ~1.5GB. `node --max-old-space-size=4096 server.js` for 4GB. Increase for memory-intensive applications (large datasets, image processing). V8 will GC more aggressively before hitting the limit.

---

**Q39: What is N-API?**
Node-API (formerly N-API) — stable ABI for native Node.js addons (C/C++). Addons compiled against N-API don't need to be recompiled when Node.js version changes. Better than older nan-based addons.

---

**Q40: What happens when you call `server.close()`?**
Stops accepting new connections. Existing connections are kept alive until they close. Callback fires when all connections have closed. For graceful shutdown, you also need to destroy existing connections or wait for them to complete.

---

**Q41: What is the purpose of `keepAlive` in HTTP?**
Reuses TCP connections for multiple HTTP requests (persistent connections). Reduces latency of subsequent requests (no TCP handshake). `http.Agent` pools connections. For outgoing requests, `http.globalAgent` uses keep-alive by default.

---

**Q42: What is `AbortController` in Node.js?**
Allows aborting async operations like `fetch` and `fs.promises.readFile`. `const ac = new AbortController(); setTimeout(() => ac.abort(), 5000); await fetch(url, { signal: ac.signal })`. Useful for timeouts and cancellable operations.

---

**Q43: What is a Transform stream?**
A Duplex stream that can modify data as it passes through. Read from writable side, transform in `_transform`, push to readable side. Examples: `zlib.createGzip()`, CSV parser, encryption stream.

---

**Q44: What does `stream.finished` do?**
Utility that fires a callback when a stream is done (ended, errored, or closed). Safer than listening to 'end', 'finish', 'close' events manually. Promises version: `const { finished } = require('stream/promises')`.

---

**Q45: What is the `inspector` module?**
Provides V8 inspector API programmatically. Can start CPU profiling, take heap snapshots, set breakpoints — all from code. Used by APM tools (New Relic, Datadog) to collect performance data without external agents.

---

**Q46: What is the difference between `require('path').sep` and `path.posix`?**
`path.sep` = OS-specific separator (`\` on Windows, `/` on Unix). `path.posix` = always Unix-style paths. `path.win32` = always Windows-style. Use `path.join` (OS-aware) for file system paths. Use `/` directly for URLs.

---

**Q47: What is `util.types.isNativeError`?**
Checks if a value is a native Error object (works across realms). More reliable than `instanceof Error` when errors cross module boundaries or sandboxed VMs (different Error constructors).

---

**Q48: What is Connection Pooling and why is it important?**
DB connections are expensive (TCP handshake, auth, memory). Pool maintains a set of ready connections (e.g., 10-20). Application borrows from pool, returns when done. Without pooling: new connection per request = major bottleneck. With pooling: reuse existing connections.

---

**Q49: What is `process.hrtime`?**
High-resolution time measurements in nanoseconds. `const [seconds, nanoseconds] = process.hrtime()`. `process.hrtime.bigint()` returns BigInt. Use for performance measurements. Unlike `Date.now()` (ms), not affected by system clock changes.

---

**Q50: What is the role of `package-lock.json`?**
Records the exact version tree of all installed dependencies (direct + transitive). Ensures reproducible installs across machines. `npm ci` installs exactly what's in lock file (no updates). Always commit `package-lock.json` to source control. Never commit `node_modules`.
