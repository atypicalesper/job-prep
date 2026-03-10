# EventEmitter — Deep Dive

Node.js EventEmitter is the foundation of Node's event-driven architecture. HTTP servers, streams, file watchers — all extend EventEmitter.

---

## Core API

```javascript
const { EventEmitter } = require('events');

const emitter = new EventEmitter();

// Listen:
emitter.on('data', (chunk) => console.log('got:', chunk));          // stays
emitter.once('connect', () => console.log('connected!'));           // fires once, removes itself
emitter.addListener('data', handler);                               // alias for .on

// Emit:
emitter.emit('data', Buffer.from('hello'));   // synchronous! listeners run immediately
emitter.emit('connect');
emitter.emit('error', new Error('oops'));    // special: throws if no 'error' listener

// Remove:
emitter.removeListener('data', handler);    // remove specific
emitter.off('data', handler);              // alias
emitter.removeAllListeners('data');        // remove all for event
emitter.removeAllListeners();              // remove everything

// Inspect:
emitter.listenerCount('data');    // number of listeners
emitter.eventNames();             // array of event names with listeners
emitter.listeners('data');        // array of listener functions (copy)
emitter.rawListeners('data');     // includes once wrappers
```

---

## The `error` Event Is Special

```javascript
const emitter = new EventEmitter();

// ❌ No error listener — throws and crashes:
emitter.emit('error', new Error('unhandled'));
// Error: unhandled
//   at ...
// throws and crashes Node process!

// ✅ Always add error listener:
emitter.on('error', (err) => {
  console.error('Caught:', err.message);
});
emitter.emit('error', new Error('handled')); // caught, doesn't crash

// Best practice for custom classes:
class MyServer extends EventEmitter {
  constructor() {
    super();
    // Add a default error handler to prevent crashes:
    this.on('error', (err) => {
      console.error(`[${this.constructor.name}] Unhandled error:`, err);
    });
  }
}
```

---

## Memory Leak Warning — Max Listeners

```javascript
// Default max: 10 listeners per event
// Exceeding it prints a warning (NOT an error):
// MaxListenersExceededWarning: Possible EventEmitter memory leak detected.
// 11 data listeners added to [EventEmitter]. Use emitter.setMaxListeners() to increase limit

emitter.setMaxListeners(20);      // increase for this emitter
emitter.setMaxListeners(0);       // disable warning (unlimited)
EventEmitter.defaultMaxListeners; // global default (10)
EventEmitter.defaultMaxListeners = 20; // change global default

// WARNING: The default warning is a GOOD thing!
// If you have 100 listeners on one event, you likely have a bug.
// Fix the root cause (remove listeners properly) before silencing the warning.

// Pattern for transient listeners — always clean up:
class Connection extends EventEmitter {
  destroy() {
    this.removeAllListeners(); // crucial for GC
  }
}
```

---

## Synchronous vs Asynchronous Emission

```javascript
const emitter = new EventEmitter();

// CRITICAL: emit() is synchronous — listeners run immediately before emit() returns
console.log('before emit');
emitter.on('test', () => console.log('in listener'));
emitter.emit('test');
console.log('after emit');
// Output: before emit → in listener → after emit

// This means:
// 1. Listener throws → emit() throws (crashes if uncaught)
// 2. Listener modifies shared state → state changes before emit() returns
// 3. Listener calls emit() → nested emission happens immediately

// If you need async listeners, handle it yourself:
emitter.on('data', async (data) => {
  // async listener — errors are silently swallowed if not handled!
  try {
    await processData(data);
  } catch (err) {
    emitter.emit('error', err); // propagate to error handler
  }
});
```

---

## Custom EventEmitter Class

```javascript
const { EventEmitter } = require('events');

class FileWatcher extends EventEmitter {
  constructor(path, interval = 1000) {
    super();
    this.path = path;
    this.interval = interval;
    this._timer = null;
    this._lastSize = null;
  }

  start() {
    if (this._timer) return this; // already watching

    this._timer = setInterval(async () => {
      try {
        const stat = await fs.promises.stat(this.path);

        if (this._lastSize === null) {
          this._lastSize = stat.size;
          this.emit('ready', { path: this.path });
          return;
        }

        if (stat.size !== this._lastSize) {
          const prev = this._lastSize;
          this._lastSize = stat.size;
          this.emit('change', { path: this.path, previousSize: prev, newSize: stat.size });
        }
      } catch (err) {
        this.emit('error', err);
      }
    }, this.interval);

    this._timer.unref(); // don't prevent Node.js from exiting
    return this;
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
      this.emit('close');
    }
    return this;
  }
}

// Usage:
const watcher = new FileWatcher('./config.json');
watcher
  .on('ready', ({ path }) => console.log(`Watching ${path}`))
  .on('change', ({ newSize }) => console.log(`File changed, new size: ${newSize}`))
  .on('error', (err) => console.error('Watch error:', err))
  .on('close', () => console.log('Stopped watching'))
  .start();

// Cleanup on shutdown:
process.on('SIGTERM', () => watcher.stop());
```

---

## EventEmitter Patterns

### Once with Timeout

```javascript
function waitForEvent(emitter, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      emitter.removeListener(event, onEvent);
      reject(new Error(`Timeout waiting for '${event}' after ${timeoutMs}ms`));
    }, timeoutMs);

    function onEvent(...args) {
      clearTimeout(timer);
      resolve(args.length === 1 ? args[0] : args);
    }

    emitter.once(event, onEvent);
  });
}

// Usage:
const data = await waitForEvent(socket, 'data', 3000);
```

### Async Iteration over Events

```javascript
const { on } = require('events');

// Convert event stream to async iterator:
async function processEvents(emitter) {
  for await (const [data] of on(emitter, 'data')) {
    console.log('Processing:', data);
    // If emitter emits 'error', it propagates as thrown exception
  }
}
```

### Prepend Listener (Fire First)

```javascript
// prependListener runs before other listeners:
emitter.prependListener('data', (chunk) => {
  console.log('I run first!');
});
emitter.prependOnceListener('connect', handler); // prepend + once
```

---

## EventEmitter vs Streams vs Pub/Sub

```
EventEmitter:
- In-process only
- Synchronous delivery
- No buffering
- Direct listener reference

Streams (extend EventEmitter):
- Data flow with backpressure
- Buffering (highWaterMark)
- Pipeline support
- Good for: file I/O, HTTP bodies, transformations

Pub/Sub (Redis, RabbitMQ):
- Cross-process
- Durable (can persist messages)
- Multiple consumers
- Good for: microservices, distributed systems
```

---

## Interview Questions

**Q: Why is `emit()` synchronous and what problems does that cause?**
A: Listeners run synchronously within `emit()` — it's a direct function call. Problems: (1) If a listener throws, `emit()` throws — uncaught it crashes the process. (2) Slow listeners block the event loop — `emit('data', bigPayload)` blocks until all listeners finish. (3) Re-entrant emissions (emit inside listener) execute immediately, which can cause hard-to-debug ordering issues. For async listeners, errors are silently swallowed unless you wrap in try/catch and re-emit.

**Q: What happens if you call `emitter.emit('error', err)` with no error listener?**
A: Node.js throws the error as an uncaught exception — the process crashes. This is a special behavior only for the `'error'` event. For all other events, emitting with no listeners is a no-op. Always add an `'error'` listener to EventEmitters.

**Q: How do you prevent EventEmitter memory leaks?**
A: (1) Remove listeners when done (`removeListener`/`off`). (2) Use `once` for one-time handlers (auto-removes after firing). (3) Call `removeAllListeners()` when destroying objects. (4) Don't ignore the MaxListenersExceededWarning — investigate the root cause. (5) Use `emitter.listenerCount(event)` to monitor in tests.

**Q: What is the difference between `listeners()` and `rawListeners()`?**
A: `listeners()` returns copies of the actual listener functions. `rawListeners()` returns the raw listeners including `once` wrappers — so a `once` listener appears as the wrapper function (which has a `.listener` property pointing to the original). Useful when you need to check if a specific function was registered via `once`.
