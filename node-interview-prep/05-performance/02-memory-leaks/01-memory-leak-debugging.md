# Memory Leak Debugging in Node.js

A memory leak is when allocated memory is never released. In Node.js, the GC handles most cleanup, but certain patterns keep references alive indefinitely — heap grows monotonically until OOM crash.

---

## Confirming a Leak

```
Not every high memory = leak.
- Spike that recovers after GC → normal
- Memory that grows and never drops → leak

Check:
  process.memoryUsage().heapUsed  ← grows monotonically over hours?
  pm2 monit                       ← heap trend over time
  Datadog/New Relic heap_used     ← alert if growing > 10MB/hr
```

```javascript
// Quick in-process memory monitor:
setInterval(() => {
  const { heapUsed, heapTotal, rss, external } = process.memoryUsage();
  console.log({
    heapUsedMB:  (heapUsed  / 1024 / 1024).toFixed(1),
    heapTotalMB: (heapTotal / 1024 / 1024).toFixed(1),
    rssMB:       (rss       / 1024 / 1024).toFixed(1),
  });
}, 10_000).unref();
```

---

## Taking Heap Snapshots

```bash
# Method 1: Send SIGUSR2 to running process
kill -USR2 <node-pid>
# Creates: heapdump-<pid>.<timestamp>.heapsnapshot

# Method 2: programmatically (in code):
import v8 from 'v8';
process.on('SIGUSR2', () => {
  const filename = v8.writeHeapSnapshot();
  console.log('Heap snapshot written to', filename);
});

# Method 3: clinic.js (best tool for automated leak detection)
npx clinic heapprofiler -- node dist/server.js
# Then send load with autocannon, clinic generates visual report
```

```javascript
// Analyze in Chrome DevTools:
// 1. Open Chrome → DevTools → Memory → Load snapshot
// 2. Sort by "Retained Size" (memory kept alive because of this object)
// 3. Compare two snapshots (before/after traffic) — look at delta
// 4. Follow "Retainers" tree to find why object can't be GC'd
```

---

## The 6 Most Common Leaks and Their Fixes

### 1. Global Accumulation

```javascript
// ❌ Leak: array/map growing unboundedly in global scope
const requestLogs = []; // globals live forever

app.use((req, res, next) => {
  requestLogs.push({ url: req.url, ts: Date.now() }); // grows forever!
  next();
});

// ✅ Fix: bounded structure
const requestLogs: Array<{ url: string; ts: number }> = [];
const MAX_LOGS = 1000;

app.use((req, res, next) => {
  requestLogs.push({ url: req.url, ts: Date.now() });
  if (requestLogs.length > MAX_LOGS) requestLogs.shift(); // cap size
  next();
});

// Or use a proper TTL cache (LRU-cache, node-cache):
import LRUCache from 'lru-cache';
const cache = new LRUCache<string, User>({ max: 500, ttl: 1000 * 60 * 5 });
```

### 2. EventEmitter Listener Accumulation

```javascript
// ❌ Leak: new listener added per request, never removed
app.get('/stream', (req, res) => {
  const handler = () => res.write('ping\n');
  emitter.on('tick', handler); // +1 listener per request, never cleaned up
});

// Node.js warns: "MaxListenersExceededWarning"
// listenerCount grows until OOM

// ✅ Fix: always remove listeners when the resource closes
app.get('/stream', (req, res) => {
  const handler = () => res.write('ping\n');
  emitter.on('tick', handler);

  res.on('close', () => {
    emitter.off('tick', handler); // cleanup when client disconnects
  });
});
```

### 3. Timer / Interval Not Cleared

```javascript
// ❌ Leak: interval created per request, never cleared
app.get('/monitor/:id', (req, res) => {
  const interval = setInterval(async () => {
    const status = await getStatus(req.params.id);
    res.write(JSON.stringify(status));
  }, 1000);
  // If client disconnects, interval keeps running! Memory + CPU leak
});

// ✅ Fix: clear on close
app.get('/monitor/:id', (req, res) => {
  const interval = setInterval(async () => {
    const status = await getStatus(req.params.id);
    res.write(JSON.stringify(status) + '\n');
  }, 1000);

  res.on('close', () => clearInterval(interval));
});
```

### 4. Closure Capturing Large Objects

```javascript
// ❌ Leak: closure keeps huge buffer alive
function processRequest(hugeBuffer: Buffer) {
  const result = compute(hugeBuffer);

  // This callback closes over `hugeBuffer` even though it only needs `result`
  setTimeout(() => {
    cache.set('result', result);
    // hugeBuffer (100MB) stays in memory until this callback runs!
  }, 5000);
}

// ✅ Fix: don't close over what you don't need
function processRequest(hugeBuffer: Buffer) {
  const result = compute(hugeBuffer);
  // hugeBuffer can now be GC'd — result is a small value

  setTimeout(() => {
    cache.set('result', result); // only result is closed over
  }, 5000);
}
```

### 5. Forgotten Cache / WeakMap vs Map

```javascript
// ❌ Leak: caching objects keyed by object reference with Map
const cache = new Map<object, ProcessedData>();

function process(request: Request) {
  if (cache.has(request)) return cache.get(request)!;
  const result = expensiveCompute(request);
  cache.set(request, result);
  return result;
  // Map holds strong reference to `request` → prevents GC forever
}

// ✅ Fix: use WeakMap — entries are GC'd when key object is GC'd
const cache = new WeakMap<object, ProcessedData>();

function process(request: Request) {
  if (cache.has(request)) return cache.get(request)!;
  const result = expensiveCompute(request);
  cache.set(request, result);
  return result;
  // When `request` goes out of scope, cache entry is automatically removed
}
```

### 6. Async Context Leak (AsyncLocalStorage)

```javascript
// ❌ Leak: storing large objects in AsyncLocalStorage
const store = new AsyncLocalStorage<{ req: Request; res: Response; db: Pool }>();

// If an async operation lingers after the request ends,
// the entire context (req, res, db) stays in memory

// ✅ Fix: store only what's needed
const store = new AsyncLocalStorage<{ requestId: string; userId?: string }>();
// Small primitive values, not the full request object
```

---

## Debugging Workflow (Step by Step)

```
1. Confirm leak exists
   - Monitor heapUsed for 30 minutes under normal load
   - Does it grow monotonically? → leak

2. Narrow it down
   - Does it leak on every request type, or specific endpoint?
   - Load test specific endpoints with autocannon
   - Identify which endpoint correlates with heap growth

3. Capture heap snapshots
   - Snapshot A: before load test (baseline)
   - Run load on suspicious endpoint for 5 minutes
   - Snapshot B: after load test
   - Compare in Chrome DevTools → Objects created between A and B

4. Identify the leaking object
   - Sort by "# New": highest count → likely the leaking type
   - Click object → Retainers panel → follow chain to root
   - Root is usually: global, closure, event listener, timer

5. Fix and verify
   - Fix the root cause
   - Repeat load test
   - Confirm heapUsed stabilizes
```

---

## Automated Leak Detection in CI

```javascript
// Jest test to catch listener leaks:
describe('event listener cleanup', () => {
  it('removes listeners after stream ends', async () => {
    const emitter = new EventEmitter();
    const stream  = new MyStream(emitter);

    const before = emitter.listenerCount('data');
    await stream.process();
    const after  = emitter.listenerCount('data');

    expect(after).toBe(before); // listeners cleaned up
  });
});

// Memory assertion in load test:
import autocannon from 'autocannon';

const { heapUsed: before } = process.memoryUsage();

await autocannon({ url: 'http://localhost:3000', duration: 30 });

// Force GC (requires --expose-gc flag):
if (global.gc) global.gc();

const { heapUsed: after } = process.memoryUsage();
const growthMB = (after - before) / 1024 / 1024;

expect(growthMB).toBeLessThan(10); // heap grew < 10MB over 30s of traffic
```

---

## Quick Diagnostic Commands

```bash
# See current heap per process:
node -e "console.log(process.memoryUsage())"

# Profile memory over time with clinic:
npx clinic doctor -- node server.js

# Watch heap in real-time:
node --inspect server.js
# Open chrome://inspect → Memory → Take snapshot

# Force GC (never in production):
node --expose-gc -e "global.gc(); console.log(process.memoryUsage())"

# List open handles (what's keeping process alive):
npx wtfnode  # shows unclosed timers, sockets, etc.
```

---

## Tricky Interview Questions

**Q: What's the difference between `rss`, `heapUsed`, and `heapTotal`?**
- `rss` (Resident Set Size): total memory process uses, including native, C++ objects, stack
- `heapTotal`: total V8 heap allocated (may have unused space)
- `heapUsed`: V8 heap actually in use by JS objects
- `external`: memory for C++ objects bound to JS (Buffers, etc.)

**Q: Can you force garbage collection in Node.js?**
Yes, with `node --expose-gc` then `global.gc()`. Never in production — GC pauses the event loop. Only useful for testing.

**Q: Why doesn't `delete globalObj.prop` free memory?**
`delete` removes the property from the object but if other references exist to the value, it won't be GC'd. GC only frees objects with zero references.

**Q: What is a "retainer" in a heap snapshot?**
An object that holds a reference to the leaking object, preventing GC. Following the retainer chain shows exactly why memory can't be freed.
