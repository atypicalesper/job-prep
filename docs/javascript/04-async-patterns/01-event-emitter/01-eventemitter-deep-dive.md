# EventEmitter — Deep Dive

Node.js's `EventEmitter` is the backbone of the entire event-driven architecture. Almost every core module (streams, HTTP, child_process) extends it.

---

## How EventEmitter Works Internally

```
EventEmitter instance
  └── _events: Map<string, Function[]>
        ├── 'data'    → [listener1, listener2]
        ├── 'error'   → [errorHandler]
        └── 'end'     → [listener3]

emit('data', chunk)
  → synchronously calls each listener in order
  → NOT async, NOT on next tick
```

```typescript
import { EventEmitter } from 'events';

const ee = new EventEmitter();

// Register listener
ee.on('message', (data: string) => {
  console.log('received:', data);
});

// One-time listener (auto-removes after first call)
ee.once('connect', () => {
  console.log('connected!');
});

// Emit synchronously
ee.emit('message', 'hello'); // → "received: hello"
ee.emit('message', 'world'); // → "received: world"
ee.emit('connect');           // → "connected!" (listener removed)
ee.emit('connect');           // → nothing (already removed)
```

---

## Build EventEmitter from Scratch (Common Interview Question)

```typescript
type Listener = (...args: unknown[]) => void;

class MyEventEmitter {
  private events: Map<string, Listener[]> = new Map();
  private maxListeners = 10;

  on(event: string, listener: Listener): this {
    const listeners = this.events.get(event) ?? [];

    if (listeners.length >= this.maxListeners) {
      console.warn(
        `MaxListenersExceededWarning: ${listeners.length + 1} listeners added for event "${event}".`
      );
    }

    this.events.set(event, [...listeners, listener]);
    return this; // chainable
  }

  once(event: string, listener: Listener): this {
    // Wrap listener to self-remove after first call
    const wrapper: Listener = (...args) => {
      listener(...args);
      this.off(event, wrapper);
    };
    // Keep reference to original for removeListener matching:
    (wrapper as { _original?: Listener })._original = listener;
    return this.on(event, wrapper);
  }

  off(event: string, listener: Listener): this {
    const listeners = this.events.get(event) ?? [];
    this.events.set(
      event,
      listeners.filter(l => l !== listener && (l as { _original?: Listener })._original !== listener),
    );
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    // Special case: 'error' with no handler throws
    if (event === 'error' && !this.events.has('error')) {
      const err = args[0] instanceof Error ? args[0] : new Error(String(args[0]));
      throw err;
    }

    const listeners = this.events.get(event);
    if (!listeners || listeners.length === 0) return false;

    // Call synchronously (same as Node.js)
    listeners.forEach(l => l(...args));
    return true;
  }

  removeAllListeners(event?: string): this {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
    return this;
  }

  listenerCount(event: string): number {
    return this.events.get(event)?.length ?? 0;
  }

  listeners(event: string): Listener[] {
    return [...(this.events.get(event) ?? [])];
  }

  setMaxListeners(n: number): this {
    this.maxListeners = n;
    return this;
  }
}

// Usage:
const bus = new MyEventEmitter();
bus.on('data', (x) => console.log('A:', x));
bus.on('data', (x) => console.log('B:', x));
bus.emit('data', 42);
// → A: 42
// → B: 42
console.log(bus.listenerCount('data')); // → 2
```

---

## Common Memory Leak: Forgetting to Remove Listeners

```typescript
// ❌ Leak: a new listener added for every request
app.get('/stream', (req, res) => {
  process.on('SIGTERM', () => res.end()); // adds listener every request!
  // After 100 requests: 100 listeners on SIGTERM
});

// Node.js warning: "MaxListenersExceededWarning: Possible EventEmitter memory leak"

// ✅ Fix 1: use once()
app.get('/stream', (req, res) => {
  const onSigterm = () => res.end();
  process.once('SIGTERM', onSigterm);
  res.on('close', () => process.off('SIGTERM', onSigterm)); // cleanup
});

// ✅ Fix 2: AbortController pattern (modern)
app.get('/stream', (req, res) => {
  const ac = new AbortController();
  process.once('SIGTERM', () => ac.abort());

  someStream.pipe(res, { signal: ac.signal });
  res.on('close', () => ac.abort());
});
```

```typescript
// Detect leaks in tests:
afterEach(() => {
  const count = myEmitter.listenerCount('data');
  expect(count).toBe(0); // assert cleanup happened
});
```

---

## Typed EventEmitter (TypeScript)

Node's built-in `EventEmitter` accepts any string event name and any arguments, providing no compile-time safety. A typed wrapper constrains both the event names and their argument signatures using TypeScript generics, turning a typo in an event name or a wrong argument shape into a compile error rather than a silent runtime bug. This is especially valuable in larger codebases where the emitter and its listeners live in different files or modules. The pattern wraps the built-in `EventEmitter` rather than reimplementing it, so all the battle-tested runtime behavior is preserved.

```typescript
import { EventEmitter } from 'events';

// Type-safe EventEmitter — no more emitting the wrong shape
interface Events {
  data:    [chunk: Buffer];
  error:   [err: Error];
  end:     [];
  connect: [socket: string];
}

// Using declaration merging (TypeScript 4.x pattern):
class TypedEmitter<T extends Record<string, unknown[]>> {
  private ee = new EventEmitter();

  on<K extends keyof T>(event: K, listener: (...args: T[K]) => void): this {
    this.ee.on(event as string, listener as (...args: unknown[]) => void);
    return this;
  }

  emit<K extends keyof T>(event: K, ...args: T[K]): boolean {
    return this.ee.emit(event as string, ...args);
  }

  off<K extends keyof T>(event: K, listener: (...args: T[K]) => void): this {
    this.ee.off(event as string, listener as (...args: unknown[]) => void);
    return this;
  }
}

// Usage:
const stream = new TypedEmitter<Events>();
stream.on('data', (chunk) => console.log(chunk.length)); // chunk: Buffer ✓
stream.emit('data', Buffer.from('hello'));                // ✓
// stream.emit('data', 'wrong type');                    // ✗ TypeScript error
```

---

## EventEmitter as a Pub/Sub Bus

A singleton `EventEmitter` used as an application-wide event bus decouples modules entirely — the `UserService` that emits `user:created` has zero knowledge of the `EmailService` or `AnalyticsService` that react to it. This eliminates circular import chains that arise when services depend on each other directly. The trade-off is that the flow of events becomes implicit and harder to trace statically; disciplined event naming (namespaced like `user:created`, `order:fulfilled`) and a central events type definition help maintain discoverability. For complex, persisted event flows consider a proper message queue; for in-process coordination an event bus is lightweight and sufficient.

```typescript
// Application-wide event bus — decouple modules without direct imports
class EventBus extends EventEmitter {
  private static instance: EventBus;

  static getInstance(): EventBus {
    if (!EventBus.instance) EventBus.instance = new EventBus();
    return EventBus.instance;
  }
}

const bus = EventBus.getInstance();

// In UserService:
bus.emit('user:created', { id: '123', email: 'tarun@example.com' });

// In EmailService (completely separate file):
bus.on('user:created', async (user: { id: string; email: string }) => {
  await sendWelcomeEmail(user.email);
});

// In AnalyticsService:
bus.on('user:created', (user) => {
  analytics.track('signup', { userId: user.id });
});

// Both handlers fire — UserService knows nothing about them
```

---

## Promisifying EventEmitter (events.once)

`events.once()` bridges the callback-based `EventEmitter` model into the Promise/async-await world. It returns a Promise that resolves with the arguments of the first emission of the specified event and rejects if an `error` event fires first. This is invaluable for sequential async setup steps — waiting for a server to start listening, a connection to be established, or a stream to open — without adding a persistent listener. The optional `AbortSignal` support allows adding a timeout or cancellation to any event wait without wrapping manually.

```typescript
import { once } from 'events';

// Wait for a single event as a Promise:
const server = net.createServer();
server.listen(3000);

await once(server, 'listening'); // resolves when server is ready
console.log('Server ready');

// Async iteration over events (Node.js 12+):
async function processStream(readable: Readable) {
  for await (const chunk of readable) {
    process(chunk);
  }
  // Stream automatically closes when done
}

// With AbortController for cancellation:
const ac = new AbortController();
setTimeout(() => ac.abort(), 5000);

try {
  const [value] = await once(emitter, 'data', { signal: ac.signal });
  console.log('got data:', value);
} catch (err) {
  if ((err as Error).name === 'AbortError') console.log('timed out');
}
```

---

## Tricky Interview Questions

**Q: Is EventEmitter.emit() synchronous or asynchronous?**
Synchronous. All listeners run inline before `emit()` returns. This means a slow listener blocks the event loop.

```javascript
let order = [];
ee.on('x', () => order.push('listener'));
ee.emit('x');
order.push('after emit');
console.log(order); // ['listener', 'after emit'] ← listener ran first
```

**Q: What happens if you emit 'error' with no error listener?**
Node.js throws the error and crashes the process. Always handle 'error'.

```javascript
const ee = new EventEmitter();
ee.emit('error', new Error('boom')); // ← uncaught, process crashes
// Fix:
ee.on('error', (err) => console.error('handled:', err));
```

**Q: What's the difference between `on` and `addListener`?**
They're identical — `addListener` is an alias for `on`.

**Q: Can you emit an event inside a listener for the same event?**
Yes, it works but be careful of infinite loops. The new emission runs after the current one completes (listeners are copied before iteration).

**Q: How does `prependListener` differ from `on`?**
`on` adds to the end of the listener array; `prependListener` adds to the front, so it runs first.

```javascript
ee.on('x',             () => console.log('second'));
ee.prependListener('x', () => console.log('first'));
ee.emit('x');
// → "first"
// → "second"
```
