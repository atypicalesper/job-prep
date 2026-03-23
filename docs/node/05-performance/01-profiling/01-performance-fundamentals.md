# Node.js Performance Fundamentals

---

## Identifying Performance Issues

```
Three main types of bottlenecks:
1. CPU-bound  — heavy computation blocks event loop
2. Memory     — leaks, excessive allocation, GC pressure
3. I/O-bound  — slow DB queries, N+1 queries, unoptimized network calls
```

---

## Profiling with --prof

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
