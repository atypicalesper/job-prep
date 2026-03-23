# Debounce & Throttle

Both patterns control how often a function executes in response to high-frequency events. They're among the most commonly asked JavaScript interview topics.

---

## The Problem They Solve

Some events fire dozens or hundreds of times per second:

```js
window.addEventListener('scroll', handler);   // fires on every pixel
window.addEventListener('resize', handler);   // fires continuously while dragging
input.addEventListener('input', handler);     // fires on every keystroke
```

Running expensive logic (API calls, DOM updates, heavy computation) on every event is wasteful and can crash the browser. Debounce and throttle are the two standard solutions.

---

## Debounce

**Concept:** Wait until the user _stops_ doing something, then fire once.

The timer resets on every call. The function only executes after the caller has been quiet for `delay` ms.

```
Calls:    --|--|--|--|--|-------------|-->
Fires:                               ^
                             (300ms after last call)
```

### Basic Implementation

```js
function debounce(fn, delay) {
  let timerId;

  return function debounced(...args) {
    clearTimeout(timerId);           // cancel any pending execution
    timerId = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

// Usage
const handleSearch = debounce((query) => {
  fetchResults(query);              // only fires 300ms after typing stops
}, 300);

input.addEventListener('input', (e) => handleSearch(e.target.value));
```

### Leading-Edge Debounce

Fire _immediately_ on the first call, then ignore calls during the quiet period.

```js
function debounceLeading(fn, delay) {
  let timerId;

  return function debounced(...args) {
    if (!timerId) {
      fn.apply(this, args);         // fire immediately on the first call
    }
    clearTimeout(timerId);
    timerId = setTimeout(() => {
      timerId = null;               // reset so next call fires immediately again
    }, delay);
  };
}
```

### Full Implementation — Leading, Trailing, Cancel, Flush

Matching Lodash's `_.debounce` API:

```js
function debounce(fn, delay, { leading = false, trailing = true } = {}) {
  let timerId = null;
  let lastArgs = null;
  let lastThis = null;

  function invoke() {
    fn.apply(lastThis, lastArgs);
    lastArgs = lastThis = null;
  }

  function debounced(...args) {
    lastArgs = args;
    lastThis = this;

    const isFirstCall = !timerId && leading;

    clearTimeout(timerId);
    timerId = setTimeout(() => {
      timerId = null;
      if (trailing && lastArgs) invoke();
    }, delay);

    if (isFirstCall) invoke();
  }

  // Cancel a pending invocation
  debounced.cancel = function() {
    clearTimeout(timerId);
    timerId = lastArgs = lastThis = null;
  };

  // Immediately invoke if one is pending
  debounced.flush = function() {
    if (timerId && lastArgs) {
      clearTimeout(timerId);
      invoke();
      timerId = null;
    }
  };

  return debounced;
}
```

### Use Cases for Debounce

| Use Case | Why Debounce |
|---|---|
| Search-as-you-type | Wait until typing stops before hitting the API |
| Window resize handler | Recalculate layout only after resize ends |
| Form field validation | Don't show errors while user is mid-type |
| Auto-save | Save draft only after editing pauses |
| Button that triggers expensive ops | Prevent accidental double-clicks from double-firing |

---

## Throttle

**Concept:** Fire at most once every `interval` ms, regardless of how many times it's called.

The function is guaranteed to run during a burst of calls — just at a controlled rate.

```
Calls:    --|--|--|--|--|--|--|--|--|-->
Fires:    ^           ^           ^
          (every 300ms)
```

### Timer-Based Implementation

```js
function throttle(fn, interval) {
  let inThrottle = false;

  return function throttled(...args) {
    if (inThrottle) return;         // drop the call if still within interval

    fn.apply(this, args);           // fire immediately
    inThrottle = true;

    setTimeout(() => {
      inThrottle = false;
    }, interval);
  };
}
```

### Timestamp-Based Implementation (More Accurate)

The timer approach can drift. Timestamps are precise:

```js
function throttle(fn, interval) {
  let lastTime = 0;

  return function throttled(...args) {
    const now = Date.now();

    if (now - lastTime >= interval) {
      lastTime = now;
      fn.apply(this, args);
    }
  };
}

// Usage
const handleScroll = throttle(() => {
  updateScrollBar();
}, 100);

window.addEventListener('scroll', handleScroll);
```

### Leading + Trailing Throttle

The timestamp version fires on the _leading_ edge (first call). To also fire on the _trailing_ edge (after the last call):

```js
function throttle(fn, interval) {
  let lastTime = 0;
  let trailingTimer = null;

  return function throttled(...args) {
    const now = Date.now();
    const remaining = interval - (now - lastTime);

    clearTimeout(trailingTimer);

    if (remaining <= 0) {
      // Leading edge: enough time has passed, fire now
      lastTime = now;
      fn.apply(this, args);
    } else {
      // Trailing edge: schedule for when interval expires
      trailingTimer = setTimeout(() => {
        lastTime = Date.now();
        fn.apply(this, args);
      }, remaining);
    }
  };
}
```

### requestAnimationFrame Throttle

For visual updates, sync to the browser's repaint cycle (~60fps = 16.6ms) instead of using a fixed interval:

```js
function rafThrottle(fn) {
  let rafId = null;

  return function throttled(...args) {
    if (rafId) return;              // already scheduled for next frame

    rafId = requestAnimationFrame(() => {
      fn.apply(this, args);
      rafId = null;
    });
  };
}

// Perfect for scroll/mousemove that drives visual updates
const handleMouseMove = rafThrottle((e) => {
  updateTooltipPosition(e.clientX, e.clientY);
});

document.addEventListener('mousemove', handleMouseMove);
```

### `{ passive: true }` — Tell the Browser You Won't Block Scroll

Always pair scroll/touch throttling with `{ passive: true }`. It signals to the browser that your handler won't call `preventDefault()`, allowing it to start scrolling immediately without waiting for your JS to run:

```js
// Without passive: browser waits for handler to finish before scrolling → jank
window.addEventListener('scroll', throttle(handler, 100));

// With passive: browser scrolls immediately, handler runs in parallel → smooth
window.addEventListener('scroll', throttle(handler, 100), { passive: true });
```

If you genuinely need `preventDefault()` (e.g., custom scroll hijacking), omit `passive`. Otherwise, always include it.

### `requestIdleCallback` — Defer Non-Urgent Work

`requestAnimationFrame` syncs to the paint cycle (urgent visual work). `requestIdleCallback` is the opposite — it fires during browser idle periods, with a deadline for how long you have:

```js
function scheduleIdleWork(fn) {
  if ('requestIdleCallback' in window) {
    requestIdleCallback((deadline) => {
      // deadline.timeRemaining() tells you how many ms you have before the browser needs the thread back
      while (deadline.timeRemaining() > 0) {
        fn();
      }
    }, { timeout: 2000 }); // force run after 2s even if never idle
  } else {
    // Safari fallback: setTimeout(fn, 1) approximates idle scheduling
    setTimeout(fn, 1);
  }
}

// Pattern: passive listener → rAF for visual → requestIdleCallback for background
window.addEventListener('scroll', throttle(() => {
  updateVisuals();                              // rAF-throttled, time-sensitive
  scheduleIdleWork(() => logAnalytics());       // idle, non-urgent
}, 100), { passive: true });
```

**When to use each:**

| | `setTimeout` | `rAF` | `requestIdleCallback` |
|---|---|---|---|
| **Timing** | Fixed delay | Every frame (~16ms) | Whenever browser is idle |
| **Priority** | Low | High (before paint) | Lowest |
| **Use for** | Debounce, general delay | Visual updates, animations | Analytics, prefetch, low-priority compute |
| **Safari** | ✅ | ✅ | ❌ (needs polyfill/fallback) |

### Use Cases for Throttle

| Use Case | Why Throttle |
|---|---|
| Scroll event handler | Update progress bars / sticky headers at a capped rate |
| Mouse tracking / drag | Visual feedback without flooding the call stack |
| Window resize (ongoing) | Update layout continuously but at a controlled rate |
| API rate limiting | Ensure you don't exceed N calls per second |
| Game loop input | Process key/mouse at fixed tick rate |
| Analytics events | Emit metrics at controlled rate, not on every pixel |

---

## Debounce vs Throttle — Side by Side

| | Debounce | Throttle |
|---|---|---|
| **Fires when** | After quiet period ends | At most once per interval |
| **Guaranteed fire?** | No (if calls never stop, never fires) | Yes (at least once per interval during bursts) |
| **Best for** | "User stopped doing X" | "While X is happening, do Y at rate Z" |
| **Examples** | Search input, auto-save | Scroll handler, mousemove |
| **Leading edge** | Optional (fire on first call) | Default (fires immediately) |
| **Trailing edge** | Default (fire after quiet period) | Optional |

### Visual Comparison

```
Event stream:  --|--|--|--|--|--|--|--|--|---|---|-->
                (user is scrolling, then stops)

Debounce(300): ---------------------------------->^
               (fires ONCE, 300ms after last event)

Throttle(300): ^-----------^-----------^-------->
               (fires at most once per 300ms)
```

---

## React Hooks

### useDebounce (value-based)

Debounce a value change — useful when you don't control the handler:

```js
import { useState, useEffect } from 'react';

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);  // cleanup on value change or unmount
  }, [value, delay]);

  return debouncedValue;
}

// Usage
function SearchBar() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (debouncedQuery) fetchResults(debouncedQuery);
  }, [debouncedQuery]);

  return <input value={query} onChange={e => setQuery(e.target.value)} />;
}
```

### useDebounce (callback-based)

Debounce the function itself with stable identity across renders:

```js
import { useCallback, useRef } from 'react';

function useDebounceCallback(fn, delay) {
  const timerRef = useRef(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;             // always call latest fn without re-creating debounced

  return useCallback((...args) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      fnRef.current(...args);
    }, delay);
  }, [delay]);
}
```

### useThrottle (callback-based)

```js
import { useCallback, useRef } from 'react';

function useThrottleCallback(fn, interval) {
  const lastTimeRef = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  return useCallback((...args) => {
    const now = Date.now();
    if (now - lastTimeRef.current >= interval) {
      lastTimeRef.current = now;
      fnRef.current(...args);
    }
  }, [interval]);
}

// Usage
function InfiniteList() {
  const handleScroll = useThrottleCallback(() => {
    if (isNearBottom()) loadMoreItems();
  }, 200);

  return <div onScroll={handleScroll}>...</div>;
}
```

---

## Common Mistakes

### Mistake 1 — Creating a new debounced function on every render

```js
// BAD: new function created on every render — debounce state is lost
function Search() {
  const handleInput = debounce((val) => fetchResults(val), 300);
  return <input onInput={e => handleInput(e.target.value)} />;
}

// GOOD: create once, outside the component or with useMemo/useCallback
const handleInput = debounce((val) => fetchResults(val), 300); // module level
// or use useDebounceCallback hook above
```

### Mistake 2 — Not cleaning up on unmount

```js
// BAD: timer can fire after component unmounts → setState on unmounted component
useEffect(() => {
  const timer = setTimeout(() => setData(result), 300);
  // no cleanup!
}, [query]);

// GOOD: return cleanup function
useEffect(() => {
  const timer = setTimeout(() => setData(result), 300);
  return () => clearTimeout(timer);
}, [query]);
```

### Mistake 3 — Throttle vs debounce for scroll-to-load

```js
// Debounce: only fires AFTER user stops scrolling — misses the trigger window
window.addEventListener('scroll', debounce(checkIfNearBottom, 200)); // BAD for infinite scroll

// Throttle: fires regularly WHILE scrolling — correctly detects the threshold
window.addEventListener('scroll', throttle(checkIfNearBottom, 200)); // GOOD
```

### Mistake 4 — Background Tab Timer Clamping

Browsers aggressively throttle `setTimeout`/`setInterval` in background tabs. Chrome clamps the minimum interval to **1000ms** when a tab is hidden (`document.visibilityState === 'hidden'`). A 300ms debounce becomes a 1000ms debounce when the user switches tabs:

```js
// This debounce "works" but silently breaks in background tabs
const saveProgress = debounce(() => sendToServer(), 300);

// If the user switches tabs mid-typing, the 300ms timer becomes 1000ms+
// This is usually fine — but matters for:
// - real-time collaborative editors
// - games that need precise timing in the background
// - anything where the delay being 3x larger changes behaviour
```

Handle it explicitly if it matters:

```js
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    // Tab going to background — flush any pending debounced saves
    saveProgress.flush();
  }
});
```

**`setTimeout(fn, 0)` is also clamped to 4ms minimum** in foreground tabs (per the HTML spec). So `setTimeout(fn, 0)` ≠ "run synchronously next tick" — use `queueMicrotask(fn)` or `Promise.resolve().then(fn)` for that.

### Mistake 5 — Ignoring `this` context

```js
// Arrow function loses the dynamic `this` needed for event handlers
function debounce(fn, delay) {
  let timerId;
  return (...args) => {            // arrow function: `this` is from outer scope
    clearTimeout(timerId);
    timerId = setTimeout(() => fn(...args), delay); // `this` wrong for DOM handlers
  };
}

// Use regular function + .apply(this, args) to preserve caller's `this`
return function debounced(...args) {
  clearTimeout(timerId);
  timerId = setTimeout(() => fn.apply(this, args), delay);
};
```

---

## Advanced: Debounce with maxWait

Lodash's `_.debounce` has a `maxWait` option — forces a fire even if calls never stop. This is actually a throttle-within-debounce hybrid:

```js
function debounceWithMaxWait(fn, delay, maxWait) {
  let timerId = null;
  let lastInvokeTime = 0;

  return function debounced(...args) {
    const now = Date.now();
    const timeSinceLastInvoke = now - lastInvokeTime;

    clearTimeout(timerId);

    if (timeSinceLastInvoke >= maxWait) {
      // maxWait exceeded — force invocation even though calls keep coming
      lastInvokeTime = now;
      fn.apply(this, args);
      return;
    }

    timerId = setTimeout(() => {
      lastInvokeTime = Date.now();
      fn.apply(this, args);
    }, delay);
  };
}

// Useful for: continuous typing but must send analytics at least every 2s
const track = debounceWithMaxWait(sendAnalytics, 300, 2000);
```

### `useDeferredValue` — React's Built-in Concurrent Debounce

React 18's `useDeferredValue` defers a value to a lower-priority render. It's not a direct debounce replacement — it has no fixed delay and is interruptible:

```js
import { useState, useDeferredValue, useMemo } from 'react';

function FilteredList({ items }) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);  // lags behind query when rendering is slow

  // This expensive filter only re-runs when deferredQuery changes
  const filtered = useMemo(
    () => items.filter(i => i.name.includes(deferredQuery)),
    [items, deferredQuery]
  );

  return (
    <>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      {/* Show stale indicator while deferred value is catching up */}
      <ul style={{ opacity: query !== deferredQuery ? 0.5 : 1 }}>
        {filtered.map(item => <li key={item.id}>{item.name}</li>)}
      </ul>
    </>
  );
}
```

**`useDeferredValue` vs `useDebounce`:**

| | `useDebounce` | `useDeferredValue` |
|---|---|---|
| **Delay type** | Fixed (e.g. 300ms always) | Adaptive — only delays if rendering is slow |
| **Fast device** | Still waits 300ms | Renders immediately, no lag |
| **Interruptible** | No | Yes — React can abandon and restart |
| **Network requests** | ✅ Use this to debounce API calls | ❌ Only defers rendering, not side effects |
| **Expensive renders** | Works but adds artificial lag | ✅ Ideal — zero lag on fast machines |

**Rule:** Use `useDeferredValue` for expensive renders (big lists, charts). Use `useDebounce` for network requests and side effects.

---

## Async Debounce & Race Conditions

A plain debounce doesn't help if the async function itself takes time — an earlier request can resolve _after_ a later one, showing stale results.

### The Problem

```js
const handleSearch = debounce(async (query) => {
  const results = await fetchResults(query);
  setResults(results); // BUG: could be stale if a newer query already resolved first
}, 300);
```

### Solution 1 — AbortController (cancel in-flight requests)

```js
function debounceAsync(fn, delay) {
  let timerId;
  let controller;            // track the in-flight AbortController

  return function debounced(...args) {
    clearTimeout(timerId);
    controller?.abort();     // cancel the previous in-flight request
    controller = new AbortController();

    const currentController = controller;

    timerId = setTimeout(async () => {
      try {
        await fn.call(this, ...args, currentController.signal);
      } catch (err) {
        if (err.name !== 'AbortError') throw err; // ignore expected cancellations
      }
    }, delay);
  };
}

// Usage — signal is passed through to fetch
const handleSearch = debounceAsync(async (query, signal) => {
  const res = await fetch(`/api/search?q=${query}`, { signal });
  const data = await res.json();
  setResults(data);
}, 300);
```

### Solution 2 — Ignore Stale Results (if fetch can't be aborted)

Use a sequence counter. Only apply results if they came from the most recent call:

```js
function debounceAsync(fn, delay) {
  let timerId;
  let callId = 0;

  return function debounced(...args) {
    clearTimeout(timerId);
    const id = ++callId;           // capture this call's id

    timerId = setTimeout(async () => {
      const result = await fn.apply(this, args);
      if (id === callId) {         // only apply if still the latest call
        return result;
      }
    }, delay);
  };
}
```

### React — useEffect cleanup pattern

React's cleanup function is the idiomatic way to cancel stale async work:

```js
function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${query}`, { signal: controller.signal });
        const data = await res.json();
        setResults(data);
      } catch (err) {
        if (err.name !== 'AbortError') console.error(err);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();          // cancel both the timer and any in-flight fetch
    };
  }, [query]);

  return <input value={query} onChange={e => setQuery(e.target.value)} />;
}
```

---

## When Debounce/Throttle Are the Wrong Tool

Both patterns **drop calls** — debounce drops all-but-last in a burst, throttle drops calls within each interval. That's their purpose. But sometimes dropping is wrong.

### Idempotency assumption

Debounce and throttle assume calls are **idempotent or skippable** — running the function once or five times produces the same result. If every call carries unique data that must be processed, use neither:

```js
// BAD: keystrokes are dropped — audit log is incomplete
const logKeystroke = debounce((char) => sendAuditLog(char), 300);
input.addEventListener('keydown', e => logKeystroke(e.key)); // drops intermediate keys

// GOOD: every keystroke queued and sent in order
input.addEventListener('keydown', e => queue.push(e.key));
```

### Queue pattern — rate-limited but lossless

When every call must eventually execute (just at a controlled rate), use a draining queue:

```js
function createQueue(fn, interval) {
  const pending = [];
  let drainTimer = null;

  function drain() {
    if (!pending.length) { drainTimer = null; return; }
    const args = pending.shift();
    fn(...args);
    drainTimer = setTimeout(drain, interval);
  }

  return {
    push(...args) {
      pending.push(args);
      if (!drainTimer) drain();         // start draining if idle
    },
    flush() {
      clearTimeout(drainTimer);
      while (pending.length) fn(...pending.shift());
    },
    clear() {
      clearTimeout(drainTimer);
      pending.length = 0;
      drainTimer = null;
    }
  };
}

// API rate limiter: sends every request, at most one per 200ms
const apiQueue = createQueue((payload) => fetch('/log', {
  method: 'POST',
  body: JSON.stringify(payload)
}), 200);

// Every event is preserved and sent in order:
element.addEventListener('click', e => apiQueue.push({ x: e.clientX, y: e.clientY }));
```

**Pattern comparison:**

| | Debounce | Throttle | Queue |
|---|---|---|---|
| **Drops calls?** | Yes — keeps only last | Yes — keeps periodic | No — processes all |
| **Ordering** | N/A | N/A | FIFO, preserved |
| **Backpressure** | Resets on each call | Discards mid-interval | Builds up in memory |
| **Use when** | "Wait until quiet" | "Cap the rate" | "Process every call, just slowly" |

---

## Event Loop Placement

`setTimeout` is a **macro-task**. Debounce timers sit in the macro-task queue — they run after the current call stack and all micro-tasks have cleared.

```
Call stack → Micro-tasks (Promises, queueMicrotask) → Render → Macro-tasks (setTimeout, setInterval)
```

Common mistake — thinking `Promise.resolve().then()` debounces:

```js
// WRONG: this doesn't debounce — it just defers to next microtask (~0ms delay)
// All queued microtasks flush before the next render, defeating the purpose
function badDebounce(fn) {
  return function(...args) {
    Promise.resolve().then(() => fn(...args)); // fires almost immediately, every time
  };
}

// CORRECT: setTimeout puts it in the macro-task queue, after rendering
function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay); // macro-task
  };
}
```

When you want "run after the current synchronous work, as soon as possible":

```js
// Next microtask (fastest, before render):
queueMicrotask(() => fn());

// Next macro-task, after render:
setTimeout(fn, 0);   // clamped to 4ms minimum

// Next animation frame (before paint):
requestAnimationFrame(fn);

// During idle time:
requestIdleCallback(fn);
```

None of these are debounce — they're one-shot deferrals. Debounce requires resetting on repeated calls.

---

## TypeScript

Generic signatures that preserve argument and return types:

```ts
// Debounce — return type is void (async via timer)
function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): ((...args: Parameters<T>) => void) & { cancel: () => void; flush: () => void } {
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastThis: unknown = null;

  function invoke() {
    fn.apply(lastThis, lastArgs!);
    lastArgs = lastThis = null;
  }

  function debounced(this: unknown, ...args: Parameters<T>) {
    lastArgs = args;
    lastThis = this;
    clearTimeout(timerId!);
    timerId = setTimeout(() => {
      timerId = null;
      if (lastArgs) invoke();
    }, delay);
  }

  debounced.cancel = () => {
    clearTimeout(timerId!);
    timerId = lastArgs = lastThis = null;
  };

  debounced.flush = () => {
    if (timerId && lastArgs) {
      clearTimeout(timerId);
      invoke();
      timerId = null;
    }
  };

  return debounced;
}

// Throttle — timestamp-based, typed
function throttle<T extends (...args: any[]) => any>(
  fn: T,
  interval: number
): (...args: Parameters<T>) => void {
  let lastTime = 0;

  return function throttled(this: unknown, ...args: Parameters<T>) {
    const now = Date.now();
    if (now - lastTime >= interval) {
      lastTime = now;
      fn.apply(this, args);
    }
  };
}
```

Usage with inference — no manual type annotation needed:

```ts
const handleSearch = debounce((query: string) => fetchResults(query), 300);
//    ^ (...args: [query: string]) => void & { cancel, flush }

const handleScroll = throttle((e: Event) => updateScrollBar(e), 100);
//    ^ (...args: [e: Event]) => void
```

---

## Testing with Fake Timers

`setTimeout`/`Date.now` make these functions hard to test in real time. Both Jest and Vitest expose fake timer APIs:

### Jest / Vitest

```js
import { debounce } from './debounce';

describe('debounce', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('does not fire immediately', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 300);

    debounced();
    expect(fn).not.toHaveBeenCalled();
  });

  test('fires after the delay', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 300);

    debounced('hello');
    jest.advanceTimersByTime(300);

    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('hello');
  });

  test('resets timer on repeated calls', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 300);

    debounced('a');
    jest.advanceTimersByTime(200);  // not yet
    debounced('b');
    jest.advanceTimersByTime(200);  // still not (timer reset)
    expect(fn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(100);  // now 300ms since last call
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('b');  // last args win
  });

  test('cancel prevents invocation', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 300);

    debounced();
    debounced.cancel();
    jest.runAllTimers();

    expect(fn).not.toHaveBeenCalled();
  });
});
```

### Testing throttle with fake timers

```js
describe('throttle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);         // start Date.now() at 0
  });
  afterEach(() => jest.useRealTimers());

  test('fires on the first call', () => {
    const fn = jest.fn();
    const throttled = throttle(fn, 300);

    throttled();
    expect(fn).toHaveBeenCalledOnce();
  });

  test('blocks calls within the interval', () => {
    const fn = jest.fn();
    const throttled = throttle(fn, 300);

    throttled();
    jest.advanceTimersByTime(100);
    throttled();                   // within 300ms — should be dropped
    expect(fn).toHaveBeenCalledOnce();
  });

  test('allows call after interval', () => {
    const fn = jest.fn();
    const throttled = throttle(fn, 300);

    throttled();
    jest.advanceTimersByTime(300);
    throttled();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
```

---

## Interview Q&A

**Q: What's the difference between debounce and throttle?**

Debounce fires _after_ a quiet period — the timer resets on every call. Throttle fires _at most once per interval_ regardless of how many calls happen. Debounce: search input (wait till done typing). Throttle: scroll handler (cap update rate while scrolling).

**Q: Implement debounce from scratch.**

```js
function debounce(fn, delay) {
  let timerId;
  return function(...args) {
    clearTimeout(timerId);
    timerId = setTimeout(() => fn.apply(this, args), delay);
  };
}
```

Key points: `timerId` lives in the closure, `clearTimeout` cancels previous timer, `apply(this, args)` preserves context.

**Q: Implement throttle from scratch.**

```js
function throttle(fn, interval) {
  let lastTime = 0;
  return function(...args) {
    const now = Date.now();
    if (now - lastTime >= interval) {
      lastTime = now;
      fn.apply(this, args);
    }
  };
}
```

Timestamp approach is better than a boolean flag because it doesn't drift and naturally handles the leading edge.

**Q: What happens if you debounce a function with `leading: true`?**

It fires _immediately_ on the first call (leading edge) then ignores subsequent calls until the quiet period has elapsed. Good for cases where the first action should be instant but you want to prevent rapid re-triggers (e.g., button that sends a request — fire right away, ignore spam clicks).

**Q: How would you implement `_.debounce`'s `cancel` and `flush` methods?**

`cancel` clears the pending timer and nulls out saved args. `flush` clears the timer and immediately invokes the function with the last saved args (if any). Both work because `timerId`, `lastArgs`, and `lastThis` are all in the closure.

**Q: Why shouldn't you create a debounced function inside a React render?**

Each render creates a new function, which resets the internal timer state. The debounce effect is never actually observed because every keystroke re-creates the function. Solution: create outside the component, use `useCallback` with a stable dependency array, or use a `useRef` to hold the debounced function.

**Q: When would you use `requestAnimationFrame` instead of `setTimeout` for throttling?**

For anything that drives visual output — scroll-synced animations, drag-and-drop, canvas drawing, tooltip positioning. `rAF` syncs to the browser's repaint cycle (~60fps), so updates are always timed right before the browser paints. `setTimeout(fn, 16)` approximates this but can desync from the paint cycle and cause visual jank.

**Q: Debouncing an async search function — what can go wrong and how do you fix it?**

Race condition: if the user types fast, multiple debounced calls can overlap. Response B (slower query) can resolve after response A (faster, newer query), setting stale results. Two fixes: (1) Pass an `AbortController` signal to `fetch` and abort it on the next call — the network request is cancelled. (2) Use a call-id counter — increment on each call and ignore any response whose id doesn't match the latest. In React, the cleanest pattern is `useEffect` + cleanup that clears both the `setTimeout` and calls `controller.abort()`.

**Q: How do you test debounce without actually waiting 300ms?**

Use `jest.useFakeTimers()` / `vi.useFakeTimers()`. This replaces `setTimeout` with a synchronous fake you control. After calling the debounced function, call `jest.advanceTimersByTime(300)` to fast-forward the clock. For timestamp-based throttle, also call `jest.setSystemTime(n)` to control `Date.now()`.
