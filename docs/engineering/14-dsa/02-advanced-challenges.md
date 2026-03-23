# Advanced Coding Challenges

---

## 1. Implement `Promise.race` from Scratch

```typescript
function promiseRace<T>(promises: Promise<T>[]): Promise<T> {
  return new Promise((resolve, reject) => {
    if (promises.length === 0) return; // never resolves (same as native)

    for (const promise of promises) {
      Promise.resolve(promise).then(resolve, reject);
      // First resolve/reject wins; subsequent ones are ignored
      // (Promise can only be settled once)
    }
  });
}

// Test:
const fast = new Promise(r => setTimeout(() => r('fast'), 100));
const slow = new Promise(r => setTimeout(() => r('slow'), 500));
console.log(await promiseRace([fast, slow])); // 'fast'
```

---

## 2. Implement `setTimeout` using `setInterval`

```typescript
function mySetTimeout(callback: () => void, delay: number): () => void {
  const start = Date.now();

  const interval = setInterval(() => {
    if (Date.now() - start >= delay) {
      clearInterval(interval);
      callback();
    }
  }, 1); // check every 1ms

  // Return cancel function:
  return () => clearInterval(interval);
}

// Better approach (accurate):
function mySetTimeout2(callback: () => void, delay: number) {
  let handle: ReturnType<typeof setInterval>;
  handle = setInterval(() => {
    clearInterval(handle);
    callback();
  }, delay);
  return () => clearInterval(handle);
}
```

---

## 3. Deep Equal

```typescript
function deepEqual(a: unknown, b: unknown): boolean {
  // Same reference or primitive equality:
  if (a === b) return true;

  // One is null/undefined:
  if (a == null || b == null) return false;

  // Different types:
  if (typeof a !== typeof b) return false;

  // Arrays:
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  // One is array, other isn't:
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  // Objects:
  if (typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a as object);
    const bKeys = Object.keys(b as object);

    if (aKeys.length !== bKeys.length) return false;

    return aKeys.every(key =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      deepEqual((a as any)[key], (b as any)[key])
    );
  }

  return false;
}

// Tests:
console.log(deepEqual({ a: 1, b: [2, 3] }, { a: 1, b: [2, 3] })); // true
console.log(deepEqual({ a: 1 }, { a: 1, b: 2 }));                  // false
console.log(deepEqual(null, null));                                  // true
console.log(deepEqual(null, undefined));                             // false
```

---

## 4. Implement `Array.prototype.flat`

```typescript
function myFlat<T>(arr: (T | T[])[], depth = 1): T[] {
  if (depth === 0) return arr as T[];

  return arr.reduce<T[]>((acc, item) => {
    if (Array.isArray(item) && depth > 0) {
      acc.push(...myFlat(item, depth - 1));
    } else {
      acc.push(item as T);
    }
    return acc;
  }, []);
}

// Test:
console.log(myFlat([1, [2, [3, [4]]]], 1));        // [1, 2, [3, [4]]]
console.log(myFlat([1, [2, [3, [4]]]], Infinity));  // [1, 2, 3, 4]
```

---

## 5. Observable / Reactive Stream

```typescript
// Mini-RxJS: Observable that supports map, filter, subscribe
type Observer<T> = {
  next: (value: T) => void;
  error?: (err: Error) => void;
  complete?: () => void;
};

class Observable<T> {
  constructor(private producer: (observer: Observer<T>) => (() => void) | void) {}

  subscribe(observer: Observer<T>) {
    let completed = false;

    const safeObserver: Observer<T> = {
      next: (value) => { if (!completed) observer.next(value); },
      error: (err) => { if (!completed) { completed = true; observer.error?.(err); } },
      complete: () => { if (!completed) { completed = true; observer.complete?.(); } },
    };

    const cleanup = this.producer(safeObserver);
    return { unsubscribe: () => { completed = true; cleanup?.(); } };
  }

  map<R>(fn: (value: T) => R): Observable<R> {
    return new Observable<R>(observer =>
      this.subscribe({
        next: (value) => observer.next(fn(value)),
        error: observer.error,
        complete: observer.complete,
      }).unsubscribe
    );
  }

  filter(predicate: (value: T) => boolean): Observable<T> {
    return new Observable<T>(observer =>
      this.subscribe({
        next: (value) => { if (predicate(value)) observer.next(value); },
        error: observer.error,
        complete: observer.complete,
      }).unsubscribe
    );
  }
}

// Usage:
const source = new Observable<number>(observer => {
  [1, 2, 3, 4, 5].forEach(n => observer.next(n));
  observer.complete?.();
});

source
  .filter(n => n % 2 === 0)
  .map(n => n * 10)
  .subscribe({ next: console.log }); // 20, 40
```

---

## 6. Implement `Object.assign` (Deep Merge)

```typescript
function deepMerge<T extends Record<string, any>>(
  target: T,
  ...sources: Partial<T>[]
): T {
  for (const source of sources) {
    if (!source) continue;

    for (const key of Object.keys(source)) {
      // Skip prototype pollution keys:
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;

      const sourceVal = (source as any)[key];
      const targetVal = (target as any)[key];

      if (
        sourceVal !== null &&
        typeof sourceVal === 'object' &&
        !Array.isArray(sourceVal) &&
        typeof targetVal === 'object' &&
        targetVal !== null &&
        !Array.isArray(targetVal)
      ) {
        // Both are plain objects — recurse:
        (target as any)[key] = deepMerge({ ...targetVal }, sourceVal);
      } else {
        (target as any)[key] = sourceVal;
      }
    }
  }
  return target;
}

// Test:
const result = deepMerge(
  { a: 1, b: { x: 1, y: 2 }, c: [1, 2] },
  { b: { y: 10, z: 3 }, d: 4 }
);
// { a: 1, b: { x: 1, y: 10, z: 3 }, c: [1, 2], d: 4 }
```

---

## 7. Sliding Window Maximum

```typescript
// Given an array and window size k, find max in each window
// Input: [1, 3, -1, -3, 5, 3, 6, 7], k=3
// Output: [3, 3, 5, 5, 6, 7]

function maxSlidingWindow(nums: number[], k: number): number[] {
  const result: number[] = [];
  const deque: number[] = []; // stores indices, front is max

  for (let i = 0; i < nums.length; i++) {
    // Remove elements outside window:
    if (deque.length && deque[0] < i - k + 1) {
      deque.shift();
    }

    // Remove smaller elements from back (they'll never be the max):
    while (deque.length && nums[deque[deque.length - 1]] < nums[i]) {
      deque.pop();
    }

    deque.push(i);

    // Add to result once we have a full window:
    if (i >= k - 1) {
      result.push(nums[deque[0]]);
    }
  }

  return result;
}

// O(n) time — each element added/removed from deque at most once
```

---

## 8. Implement `JSON.stringify`

```typescript
function myStringify(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined'; // actual JSON.stringify returns undefined

  switch (typeof value) {
    case 'boolean': return String(value);
    case 'number':
      if (isNaN(value) || !isFinite(value)) return 'null';
      return String(value);
    case 'string': return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
    case 'function': return 'undefined'; // functions are skipped
    case 'object':
      if (Array.isArray(value)) {
        const items = value.map(item =>
          item === undefined ? 'null' : myStringify(item)
        );
        return `[${items.join(',')}]`;
      } else {
        const pairs = Object.entries(value as Record<string, unknown>)
          .filter(([, v]) => v !== undefined && typeof v !== 'function')
          .map(([k, v]) => `${myStringify(k)}:${myStringify(v)}`);
        return `{${pairs.join(',')}}`;
      }
    default:
      return 'undefined';
  }
}

// Test:
console.log(myStringify({ a: 1, b: [2, null, true], c: 'hello' }));
// '{"a":1,"b":[2,null,true],"c":"hello"}'
```

---

## 9. Implement `pipe` and `compose`

```typescript
// pipe: left to right (data flows through functions in order)
function pipe<T>(...fns: ((val: T) => T)[]): (val: T) => T {
  return (val: T) => fns.reduce((acc, fn) => fn(acc), val);
}

// compose: right to left (mathematical composition)
function compose<T>(...fns: ((val: T) => T)[]): (val: T) => T {
  return (val: T) => fns.reduceRight((acc, fn) => fn(acc), val);
}

// Async pipe:
function pipeAsync<T>(...fns: ((val: T) => Promise<T>)[]): (val: T) => Promise<T> {
  return async (val: T) => {
    let result = val;
    for (const fn of fns) {
      result = await fn(result);
    }
    return result;
  };
}

// Test:
const process = pipe(
  (n: number) => n + 1,
  (n) => n * 2,
  (n) => n - 3
);
console.log(process(5)); // ((5+1)*2)-3 = 9
```

---

## 10. Async Parallel with Timeout

```typescript
// Run tasks in parallel, return results + handle timeouts per task
async function parallelWithTimeout<T>(
  tasks: Array<() => Promise<T>>,
  timeoutMs: number
): Promise<Array<{ status: 'fulfilled'; value: T } | { status: 'rejected'; reason: Error }>> {
  const withTimeout = (task: () => Promise<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Task timed out after ${timeoutMs}ms`)),
        timeoutMs
      );
      task().then(
        (val) => { clearTimeout(timer); resolve(val); },
        (err) => { clearTimeout(timer); reject(err); }
      );
    });
  };

  return Promise.allSettled(tasks.map(withTimeout));
}

// Usage:
const results = await parallelWithTimeout([
  () => fetch('/api/fast').then(r => r.json()),
  () => fetch('/api/slow').then(r => r.json()), // times out
  () => fetch('/api/medium').then(r => r.json()),
], 2000);
```

---

## 11. Implement `EventEmitter` (Minimal)

```typescript
class MiniEventEmitter {
  private events: Map<string, Function[]> = new Map();

  on(event: string, listener: Function): this {
    const listeners = this.events.get(event) ?? [];
    this.events.set(event, [...listeners, listener]);
    return this;
  }

  once(event: string, listener: Function): this {
    const wrapper = (...args: any[]) => {
      listener(...args);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }

  off(event: string, listener: Function): this {
    const listeners = this.events.get(event) ?? [];
    this.events.set(event, listeners.filter(l => l !== listener));
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    const listeners = this.events.get(event);
    if (!listeners?.length) return false;
    // Copy before iteration (listener may remove itself):
    [...listeners].forEach(l => l(...args));
    return true;
  }
}
```

---

## 12. Find All Paths in a Graph (DFS)

```typescript
// Given adjacency list, find all paths from start to end
function findAllPaths(
  graph: Record<string, string[]>,
  start: string,
  end: string
): string[][] {
  const paths: string[][] = [];

  function dfs(node: string, path: string[], visited: Set<string>) {
    if (node === end) {
      paths.push([...path]);
      return;
    }

    for (const neighbor of graph[node] ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        path.push(neighbor);
        dfs(neighbor, path, visited);
        path.pop();        // backtrack
        visited.delete(neighbor);
      }
    }
  }

  dfs(start, [start], new Set([start]));
  return paths;
}

// Test:
const graph = {
  'A': ['B', 'C'],
  'B': ['D'],
  'C': ['D', 'E'],
  'D': ['E'],
  'E': []
};
console.log(findAllPaths(graph, 'A', 'E'));
// [['A','B','D','E'], ['A','C','D','E'], ['A','C','E']]
```

---

## 13. Middleware Pattern Implementation

```typescript
// How Express-style middleware works internally
type Middleware<T> = (ctx: T, next: () => Promise<void>) => Promise<void>;

function compose<T>(middlewares: Middleware<T>[]): (ctx: T) => Promise<void> {
  return function(ctx: T) {
    let index = -1;

    function dispatch(i: number): Promise<void> {
      if (i <= index) return Promise.reject(new Error('next() called multiple times'));
      index = i;

      const middleware = middlewares[i];
      if (!middleware) return Promise.resolve(); // end of chain

      return Promise.resolve(middleware(ctx, () => dispatch(i + 1)));
    }

    return dispatch(0);
  };
}

// Usage (Koa-style):
interface Ctx { method: string; path: string; body?: any; user?: any; }

const app = compose<Ctx>([
  async (ctx, next) => {
    console.log(`→ ${ctx.method} ${ctx.path}`);
    await next();
    console.log(`← ${ctx.method} ${ctx.path}`);
  },
  async (ctx, next) => {
    if (!ctx.user) throw new Error('Unauthorized');
    await next();
  },
  async (ctx) => {
    ctx.body = { data: 'Hello!' };
  }
]);

await app({ method: 'GET', path: '/api/data', user: { id: 1 } });
```
