# Node.js Performance Fundamentals

---

## Identifying Performance Issues

Performance problems in Node.js fall into three distinct categories that require different diagnostic tools and fixes. CPU-bound issues are caused by synchronous computation (regex backtracking, large JSON parsing, crypto on the main thread) that holds the event loop and blocks all other requests. Memory issues arise from objects accumulating without bound, causing the heap to grow until the process runs out of memory or GC pauses become so frequent that throughput collapses. I/O-bound issues are the most common: slow database queries, missing indexes, N+1 query patterns, or chatty microservice calls that chain latency. Misidentifying the category wastes diagnostic effort — always measure before optimising.

```
Three main types of bottlenecks:
1. CPU-bound  — heavy computation blocks event loop
2. Memory     — leaks, excessive allocation, GC pressure
3. I/O-bound  — slow DB queries, N+1 queries, unoptimized network calls
```

---

## Profiling with --prof

V8's built-in sampling profiler records which functions are on the call stack at regular intervals, producing a statistical picture of where CPU time goes. The `--prof` flag enables it and writes a binary log file. `--prof-process` converts that log into a human-readable text report grouped by function. The key section is "Bottom up (heavy) profile" — functions listed at the top are responsible for the most CPU time. This approach requires no code changes, has low overhead, and works in production (with caution), making it the right first tool when you have a CPU problem but no idea where to look.

```bash
# Generate V8 profiling data:
node --prof server.js

# Run a load test (or your workload):
# wrk -t4 -c100 -d30s http://localhost:3000/api/users

# Convert to readable format:
node --prof-process isolate-*.log > profile.txt
cat profile.txt | head -100

# Look for:
# [Summary] section: % time in JS, native, GC
# [Bottom up (heavy) profile]: which functions consume most CPU
```

---

## Clinic.js — Comprehensive Profiling

Clinic.js is a suite of Node.js performance diagnostic tools that go beyond raw profiling data by providing visual, annotated reports. `clinic doctor` automatically detects the type of bottleneck (CPU saturation, I/O delays, memory growth, event loop blocking) and suggests causes. `clinic flame` generates an interactive flame graph for CPU profiling. `clinic bubbleprof` visualises async I/O delays and shows where time is spent waiting. Run your normal load test while clinic instruments the process, then open the generated HTML report. It is the fastest path from "something is slow" to "here is the specific function or async gap responsible".

```bash
npm install -g clinic

# Doctor — diagnoses problems (CPU, I/O, memory):
clinic doctor -- node server.js

# Flame graph — find hot functions (CPU profiling):
clinic flame -- node server.js

# BubbleProf — visualizes async operations and delays:
clinic bubbleprof -- node server.js

# HeapProfiler — memory allocation over time:
clinic heapprofiler -- node server.js
```

---

## Blocking the Event Loop — Detection

You cannot fix event loop blocking you cannot measure. The lag detection pattern works by scheduling a `setInterval` and measuring the gap between when it was scheduled and when it actually fires — any excess over the nominal interval is lag caused by synchronous work. `performance.eventLoopUtilization()` (Node.js 14+) provides a 0–1 ratio of how much of the event loop's time is spent actively executing JavaScript versus waiting for I/O: 0% means fully idle, 100% means permanently blocked. Expose these metrics to your APM system to catch regressions before they affect users.

```javascript
// Event loop lag monitoring:
function measureEventLoopLag() {
  let lastCheck = process.hrtime.bigint();

  setInterval(() => {
    const now = process.hrtime.bigint();
    const lag = Number(now - lastCheck) / 1e6 - 1000; // ms of lag
    if (lag > 100) {
      console.warn(`Event loop lag: ${lag.toFixed(2)}ms`);
    }
    lastCheck = now;
  }, 1000).unref();
}

// perf_hooks EventLoopUtilization (Node.js 14+):
const { performance } = require('perf_hooks');

// Measure over time:
const start = performance.eventLoopUtilization();
setTimeout(() => {
  const end = performance.eventLoopUtilization(start);
  console.log(`Event loop utilization: ${(end.utilization * 100).toFixed(2)}%`);
  // 0% = idle, 100% = fully busy (blocking!)
}, 5000);
```

---

## Common CPU Bottlenecks

Certain patterns reliably appear at the top of Node.js CPU profiles. Synchronous file reads block the event loop for the entire disk latency. `bcrypt` and `argon2` are intentionally slow (that is their purpose) and must be run in Worker Threads. `JSON.parse` on large payloads is synchronous and can block for hundreds of milliseconds on a 50MB payload. ReDoS (Regular expression Denial of Service) happens when a pattern with nested quantifiers is given crafted input that causes exponential backtracking — one request can freeze the server for minutes. Recognising these patterns in a flame graph is the core skill of Node.js performance debugging.

```javascript
// 1. Synchronous file reads (blocks event loop):
// ❌ Bad:
const data = fs.readFileSync('large-file.json');

// ✅ Good:
const data = await fs.promises.readFile('large-file.json');

// 2. Synchronous crypto (short operations OK, long operations block):
// ❌ Bad for large keys:
const hash = crypto.createHash('sha256').update(data).digest('hex'); // OK for small
// ✅ Use worker for expensive crypto:
// bcrypt, argon2 — run in worker threads

// 3. JSON parsing of large payloads:
// Large JSON.parse blocks event loop
// Consider: streaming JSON parser (stream-json), or limit payload size

// 4. regex catastrophic backtracking (ReDoS):
// ❌ Vulnerable pattern:
const vulnerable = /^(a+)+$/; // exponential backtracking
vulnerable.test('aaaaaaaaaaaab'); // BLOCKS for a long time!

// ✅ Use non-backtracking alternatives or limit input length
```

---

## Memory Profiling

`process.memoryUsage()` provides a breakdown of the process's memory consumption that should be monitored over time, not just sampled once. `heapUsed` is the most actionable number: a monotonically growing `heapUsed` under constant load is the signature of a memory leak. RSS (Resident Set Size) includes native memory, C++ addon memory, and shared libraries on top of the V8 heap. Heap snapshots (via `--inspect` or `v8.writeHeapSnapshot()`) capture the object graph at a point in time so you can compare two snapshots and identify which objects are accumulating. The SIGUSR2 signal handler pattern lets you trigger a snapshot in a running production process without restarting.

```javascript
// Log memory usage periodically:
function logMemory() {
  const mem = process.memoryUsage();
  console.log({
    heapUsed:  `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
    rss:       `${Math.round(mem.rss / 1024 / 1024)}MB`,       // Resident Set Size
    external:  `${Math.round(mem.external / 1024 / 1024)}MB`,  // C++ objects
  });
}
setInterval(logMemory, 5000);

// Heap snapshot via --inspect:
// 1. Start with --inspect
// 2. Open Chrome DevTools → Memory tab
// 3. Take heap snapshot
// 4. Compare before/after suspected leak

// Programmatic heap snapshot:
const { writeHeapSnapshot } = require('v8');
process.on('SIGUSR2', () => {
  const filename = writeHeapSnapshot();
  console.log(`Heap snapshot written to ${filename}`);
});
// $ kill -USR2 <pid> to trigger
```

---

## Common Memory Leaks

Most Node.js memory leaks fall into a small number of recognisable patterns. Understanding them lets you fix leaks quickly and write code that does not introduce them in the first place. The unifying principle is that the JavaScript garbage collector can only free objects with zero live references — any data structure that grows without bound and holds references to user data will eventually exhaust memory. The most common culprits are: unbounded Maps/arrays used as caches, event listeners added without corresponding removal, closures that accidentally capture large objects, and timers that reference expensive data and are never cleared.

```javascript
// 1. Forgotten event listeners:
const emitter = new EventEmitter();
for (let i = 0; i < 10000; i++) {
  emitter.on('data', () => {}); // never removed!
}
// Fix: removeListener or maxListeners

// 2. Growing caches:
const cache = new Map(); // unbounded!
setInterval(() => {
  cache.set(Math.random(), largeObject()); // grows forever
}, 1);
// Fix: LRU cache, TTL-based expiry

// 3. Closures holding large objects:
function setup() {
  const largeData = loadGigabyteFile();
  return function process() {
    // Only uses largeData.header, but holds reference to all of largeData!
    return largeData.header;
  };
}
// Fix: extract only what's needed
const { header } = loadGigabyteFile();
return () => header;

// 4. setTimeout/setInterval not cleared:
const intervals = [];
function start() {
  intervals.push(setInterval(doWork, 1000)); // never cleared!
}
// Fix: store reference and clearInterval on cleanup

// 5. Circular references (less common with modern GC):
// V8 handles most circular references, but WeakRef helps with observer patterns
```

---

## Caching Strategies in Practice

In-process caching (keeping computed results or database records in a `Map` or LRU cache) eliminates network round trips entirely and is the fastest possible cache hit — sub-millisecond. The trade-off is that each process instance has its own cache, so in a clustered or multi-instance deployment the cache hit rate per instance is lower and stale data can persist until the TTL expires. Use a bounded LRU cache with a short TTL for hot data, and pair it with HTTP caching headers (`ETag`, `Cache-Control`) to push caching further up the stack to CDNs and browsers for public data.

```javascript
// Node-cache for in-process caching:
import NodeCache from 'node-cache';
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

async function getUser(id: string) {
  const cached = cache.get<User>(`user:${id}`);
  if (cached) return cached;

  const user = await db.users.findById(id);
  if (user) cache.set(`user:${id}`, user);
  return user;
}

// HTTP response caching with ETags:
app.get('/products', async (req, res) => {
  const products = await getProducts();
  const etag = createHash('md5').update(JSON.stringify(products)).digest('hex');

  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end(); // not modified
  }

  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'public, max-age=60'); // CDN caches for 60s
  res.json(products);
});
```

---

## Interview Questions

**Q: How do you find what's blocking the event loop?**
A: Use `--prof` to generate V8 profile and `--prof-process` to analyze it. Look for high-percentage functions in the bottom-up profile. Clinic.js Flame is more user-friendly. Instrument with `EventLoopUtilization` to measure overall load. Common culprits: synchronous file reads, JSON.parse of large payloads, ReDoS-vulnerable regexes, bcrypt without workers.

**Q: What is the difference between heap and RSS?**
A: RSS (Resident Set Size) = total memory the OS has allocated to the Node.js process (includes V8 heap, C++ objects, shared libraries, stack). Heap = V8's managed memory for JavaScript objects. Heap is a subset of RSS. Monitor both — if RSS grows faster than heap, you may have a C++ addon leak.

**Q: How do you handle CPU-intensive tasks without blocking?**
A: (1) Worker Threads — run CPU work in parallel threads. (2) Child process — offload to separate process (more isolation). (3) Cluster — multiple processes for multiple CPUs. (4) Queue — put work in a job queue (Bull, BullMQ), process with separate worker service. (5) Offload to a different service (Python/Go microservice for heavy computation).
