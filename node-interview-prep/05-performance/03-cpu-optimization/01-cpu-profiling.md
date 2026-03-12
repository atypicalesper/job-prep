# CPU Profiling & Optimization in Node.js

High CPU in Node.js is serious — the event loop is single-threaded. One hot function blocks all requests. This guide walks from detection → profiling → fixing.

---

## Symptoms of CPU Issues

```
Signs you have a CPU problem:
- Event loop lag > 100ms (responses slow even for simple requests)
- Node process pegged at 100% on one core
- p99 latency spikes but p50 is fine (suggests occasional blocking operation)
- clinic.js doctor shows "Event loop is blocked"

Distinguish from I/O wait:
  CPU-bound: process.cpuUsage() shows high user time
  I/O-bound: process.cpuUsage() shows low user time, but responses still slow
```

---

## Measuring Event Loop Lag

```javascript
// Event loop lag = time between scheduling setImmediate and it actually running
// > 10ms: notice it; > 100ms: significant; > 500ms: serious problem

function measureEventLoopLag(): Promise<number> {
  const start = process.hrtime.bigint();
  return new Promise(resolve =>
    setImmediate(() => {
      const lagNs = Number(process.hrtime.bigint() - start);
      resolve(lagNs / 1_000_000); // return ms
    })
  );
}

// Continuous monitoring:
setInterval(async () => {
  const lagMs = await measureEventLoopLag();
  metrics.histogram('event_loop.lag_ms', lagMs);

  if (lagMs > 200) {
    logger.warn({ lagMs }, 'Event loop blocked');
  }
}, 1000).unref();

// In Express: track per-request event loop lag
app.use(async (req, res, next) => {
  const before = await measureEventLoopLag();
  res.on('finish', async () => {
    const after = await measureEventLoopLag();
    if (after > 100) logger.warn({ path: req.path, lagMs: after }, 'Possible CPU spike');
  });
  next();
});
```

---

## CPU Profiling with clinic.js

```bash
# Install:
npm install -g clinic

# Flame graph — shows where CPU time is spent:
npx clinic flame -- node dist/server.js

# Then send traffic:
npx autocannon -c 100 -d 30 http://localhost:3000/api/endpoint

# Open generated report in browser
# Wide bars = hot functions (lots of CPU time)
# Look for YOUR code near the top of wide stacks
```

---

## Flame Graph Reading

```
How to read a flame graph:
  - X axis: CPU time (wider = more CPU)
  - Y axis: call stack (bottom = entry, top = where time is spent)
  - Color: irrelevant in clinic.js (just visual grouping)

What to look for:
  1. Find a wide bar near the top that's your code (not Node internals)
  2. That function is your hot path
  3. V8 internals (wide bars at bottom): usually JSON, RegExp, or GC

Common culprits:
  ╔═══════════════════════════════════╗
  ║ JSON.parse / JSON.stringify       ║  large payloads
  ║ Regex with backtracking           ║  user input
  ║ Synchronous crypto                ║  md5, sha256 sync
  ║ bcrypt on main thread             ║  should use worker
  ║ Deep object cloning               ║  JSON roundtrip or lodash.cloneDeep
  ║ Array.sort on large arrays        ║  repeated sorting
  ║ ORM hydration                     ║  converting 10k rows to objects
  ╚═══════════════════════════════════╝
```

---

## V8 CPU Profiler (Programmatic)

```javascript
import v8Profiler from 'v8-profiler-next';

// Profile a specific code section:
v8Profiler.startProfiling('myProfile', true);

// ... run the code you want to profile ...
await expensiveOperation();

const profile = v8Profiler.stopProfiling('myProfile');
profile.export((error, result) => {
  fs.writeFileSync('profile.cpuprofile', result);
  profile.delete();
});

// Open profile.cpuprofile in Chrome DevTools → Performance → Load profile
```

---

## Fix 1: Move CPU Work Off the Main Thread

```javascript
// ❌ bcrypt on main thread blocks all requests during hash:
app.post('/login', async (req, res) => {
  const isValid = await bcrypt.compare(req.body.password, user.hash);
  // bcrypt with 12 rounds takes ~200ms — BLOCKS the event loop!
  res.json({ isValid });
});

// ✅ Move to worker thread:
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { promisify } from 'util';

// worker.ts:
if (!isMainThread) {
  const { password, hash } = workerData;
  bcrypt.compare(password, hash).then(result => parentPort!.postMessage(result));
}

// main.ts:
function bcryptInWorker(password: string, hash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: { password, hash } });
    worker.once('message', resolve);
    worker.once('error',   reject);
  });
}

// ✅ Even better: worker pool (avoid spawning a new thread per request):
import Piscina from 'piscina';

const pool = new Piscina({ filename: './workers/bcrypt.worker.js', maxThreads: 4 });

app.post('/login', async (req, res) => {
  const isValid = await pool.run({ password: req.body.password, hash: user.hash });
  res.json({ isValid });
});
```

---

## Fix 2: Avoid ReDoS (Regex Denial of Service)

```javascript
// Catastrophic backtracking — user input can freeze Node.js for seconds:
const EVIL = /^(a+)+$/;
EVIL.test('aaaaaaaaaaaaaaaaaaaab'); // O(2^n) — hangs!

// ✅ Fix 1: rewrite without nested quantifiers
const SAFE = /^a+$/; // no backtracking possible

// ✅ Fix 2: use RE2 (Google's regex engine — guaranteed linear time)
import RE2 from 're2';
const safe = new RE2('^(a+)+$');
safe.test(userInput); // always O(n)

// ✅ Fix 3: validate input length before regex
if (input.length > 1000) return res.status(400).json({ error: 'Too long' });
const result = /^[a-z]+$/.test(input);

// Tools to detect ReDoS in your codebase:
// npx safe-regex "^(a+)+$"  ← checks if regex is vulnerable
// npx vuln-regex-detector
```

---

## Fix 3: Streaming JSON Instead of JSON.parse on Large Payloads

```javascript
// ❌ Blocks event loop parsing a 50MB JSON response:
const response = await fetch('https://api.example.com/big-dataset');
const data = await response.json(); // JSON.parse on 50MB = blocks for ~500ms

// ✅ Stream parse with JSONStream:
import JSONStream from 'JSONStream';
import { pipeline } from 'stream/promises';

const response = await fetch('https://api.example.com/big-dataset');
await pipeline(
  response.body,              // readable stream
  JSONStream.parse('items.*'), // stream parse individual items
  new Writable({
    objectMode: true,
    write(item, _, cb) {
      processItem(item);       // process one item at a time
      cb();
    },
  }),
);
// Parses incrementally — event loop never blocked
```

---

## Fix 4: Memoize / Cache Expensive Computations

```javascript
// Recomputing the same value repeatedly:
app.get('/stats', async (req, res) => {
  // This aggregation takes 2 seconds of CPU every request
  const stats = computeHeavyStats(rawData);
  res.json(stats);
});

// ✅ Cache the result, recompute only when data changes:
let statsCache: { data: Stats; expiry: number } | null = null;

app.get('/stats', async (req, res) => {
  if (statsCache && statsCache.expiry > Date.now()) {
    return res.json(statsCache.data);
  }

  const data = computeHeavyStats(rawData);
  statsCache = { data, expiry: Date.now() + 30_000 }; // 30s TTL
  res.json(data);
});

// For pure functions: memoize with a cache key:
import memoize from 'memoizee';

const expensiveFn = memoize(
  (input: string) => heavyCompute(input),
  { maxAge: 60_000, max: 1000 } // 1 min TTL, max 1000 entries
);
```

---

## Fix 5: Optimize Serialization

```javascript
// JSON.stringify on large objects is slow (~150MB/s)
// For hot paths, consider faster alternatives:

// fast-json-stringify: 2-4x faster with schema:
import fastJson from 'fast-json-stringify';

const stringify = fastJson({
  type: 'object',
  properties: {
    id:    { type: 'integer' },
    name:  { type: 'string' },
    score: { type: 'number' },
  },
});

app.get('/user/:id', async (req, res) => {
  const user = await getUser(req.params.id);
  res.setHeader('Content-Type', 'application/json');
  res.end(stringify(user)); // 2-4x faster than JSON.stringify
});

// For internal service communication, consider MessagePack (binary, smaller):
import msgpack from '@msgpack/msgpack';
const encoded = msgpack.encode(data);   // ~30% smaller than JSON
const decoded = msgpack.decode(encoded);
```

---

## Benchmark: Find the Bottleneck

```javascript
// Use performance.now() for micro-benchmarks:
const { performance } = require('perf_hooks');

function benchmark(name: string, fn: () => void, iterations = 10_000) {
  // Warmup:
  for (let i = 0; i < 100; i++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const end = performance.now();

  const opsPerSec = (iterations / ((end - start) / 1000)).toFixed(0);
  console.log(`${name}: ${opsPerSec} ops/sec`);
}

benchmark('JSON.stringify', () => JSON.stringify(largeObj));
benchmark('fast-json-stringify', () => fastStringify(largeObj));
// JSON.stringify:       45,000 ops/sec
// fast-json-stringify: 180,000 ops/sec  ← 4x faster
```

---

## Tricky Interview Questions

**Q: Node.js is single-threaded. How does it handle high CPU tasks?**
Three options:
1. Worker threads — CPU work in parallel threads, results back via message
2. Child process — `child_process.fork()` separate V8 instance
3. Cluster — multiple processes on same port (load balanced by OS)

Never do blocking CPU work on the main thread.

**Q: What is "JIT warm-up" and how does it affect performance?**
V8 first interprets code, then JIT-compiles hot functions to native machine code. A freshly started Node.js process is slower for the first few seconds. Solutions: `v8-compile-cache` for startup, synthetic warm-up requests after deploy.

**Q: When is `setTimeout(fn, 0)` useful for CPU-heavy tasks?**
It yields the event loop, allowing other callbacks (I/O, incoming requests) to run between chunks of a long computation:

```javascript
function processLargeArrayAsync(items: Item[]) {
  return new Promise<void>(resolve => {
    let i = 0;
    function chunk() {
      const end = Math.min(i + 1000, items.length);
      for (; i < end; i++) process(items[i]);
      if (i < items.length) setTimeout(chunk, 0); // yield
      else resolve();
    }
    chunk();
  });
}
```

**Q: What's the difference between `--max-old-space-size` and `--max-semi-space-size`?**
- `--max-old-space-size`: Max size of the old generation (long-lived objects). Default ~1.5GB.
- `--max-semi-space-size`: Size of new-generation semi-spaces (short-lived objects). Larger = fewer minor GCs but more memory.
