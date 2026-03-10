# Coding Challenges — Common Patterns

---

## 1. Two Sum

```typescript
// Given array of numbers and target, return indices of two numbers that sum to target

// Approach: HashMap — O(n) time, O(n) space
function twoSum(nums: number[], target: number): [number, number] | null {
  const seen = new Map<number, number>(); // value → index

  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (seen.has(complement)) {
      return [seen.get(complement)!, i];
    }
    seen.set(nums[i], i);
  }
  return null;
}

// Tests:
console.log(twoSum([2, 7, 11, 15], 9)); // [0, 1]
console.log(twoSum([3, 2, 4], 6));      // [1, 2]
```

---

## 2. Valid Parentheses

```typescript
// Determine if string of brackets is valid

function isValid(s: string): boolean {
  const stack: string[] = [];
  const matching: Record<string, string> = {
    ')': '(',
    ']': '[',
    '}': '{'
  };

  for (const char of s) {
    if ('([{'.includes(char)) {
      stack.push(char);
    } else {
      if (stack.pop() !== matching[char]) return false;
    }
  }

  return stack.length === 0;
}

// Tests:
console.log(isValid('()[]{}'));  // true
console.log(isValid('(]'));      // false
console.log(isValid('{[]}'));    // true
```

---

## 3. Fibonacci with Memoization

```typescript
// O(n) time and space with memoization
function fibonacci(n: number, memo = new Map<number, number>()): number {
  if (n <= 1) return n;
  if (memo.has(n)) return memo.get(n)!;

  const result = fibonacci(n - 1, memo) + fibonacci(n - 2, memo);
  memo.set(n, result);
  return result;
}

// Iterative O(n) time, O(1) space:
function fibIterative(n: number): number {
  if (n <= 1) return n;
  let [prev, curr] = [0, 1];
  for (let i = 2; i <= n; i++) {
    [prev, curr] = [curr, prev + curr];
  }
  return curr;
}
```

---

## 4. Flatten Nested Array

```typescript
// Flatten arbitrarily nested array

function flatten<T>(arr: (T | T[])[]): T[] {
  const result: T[] = [];

  for (const item of arr) {
    if (Array.isArray(item)) {
      result.push(...flatten(item));
    } else {
      result.push(item);
    }
  }

  return result;
}

// Iterative with stack (avoids call stack overflow for deep nesting):
function flattenIterative<T>(arr: (T | T[])[]): T[] {
  const result: T[] = [];
  const stack: (T | T[])[] = [...arr];

  while (stack.length > 0) {
    const item = stack.pop()!;
    if (Array.isArray(item)) {
      stack.push(...item); // spread array back onto stack
    } else {
      result.unshift(item); // prepend to maintain order (or reverse at end)
    }
  }

  return result;
}

// Tests:
console.log(flatten([1, [2, [3, [4]]]])); // [1, 2, 3, 4]
```

---

## 5. Debounce

```typescript
// Return a debounced function that delays execution until after `delay` ms of inactivity

function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return function(...args: Parameters<T>) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
      timer = null;
    }, delay);
  };
}

// Throttle — execute at most once per interval:
function throttle<T extends (...args: any[]) => any>(
  fn: T,
  interval: number
): (...args: Parameters<T>) => void {
  let lastCallTime = 0;

  return function(...args: Parameters<T>) {
    const now = Date.now();
    if (now - lastCallTime >= interval) {
      lastCallTime = now;
      fn(...args);
    }
  };
}
```

---

## 6. Deep Clone

```typescript
function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;

  if (value instanceof Date) return new Date(value.getTime()) as unknown as T;
  if (value instanceof RegExp) return new RegExp(value.source, value.flags) as unknown as T;
  if (Array.isArray(value)) return value.map(deepClone) as unknown as T;

  const cloned = {} as T;
  for (const key of Object.keys(value as object)) {
    (cloned as any)[key] = deepClone((value as any)[key]);
  }
  return cloned;
}

// Modern: structuredClone() handles most cases natively
```

---

## 7. Implement Promise.all

```typescript
function promiseAll<T>(promises: Promise<T>[]): Promise<T[]> {
  return new Promise((resolve, reject) => {
    if (promises.length === 0) return resolve([]);

    const results: T[] = new Array(promises.length);
    let completed = 0;

    promises.forEach((promise, index) => {
      Promise.resolve(promise).then(
        (value) => {
          results[index] = value;
          completed++;
          if (completed === promises.length) resolve(results);
        },
        reject // reject as soon as any rejects
      );
    });
  });
}

// Promise.allSettled:
function promiseAllSettled<T>(promises: Promise<T>[]) {
  return Promise.all(promises.map(p =>
    Promise.resolve(p).then(
      value => ({ status: 'fulfilled' as const, value }),
      reason => ({ status: 'rejected' as const, reason })
    )
  ));
}
```

---

## 8. Group By (Array of Objects)

```typescript
function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((groups, item) => {
    const groupKey = String(item[key]);
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(item);
    return groups;
  }, {} as Record<string, T[]>);
}

// Test:
const users = [
  { name: 'Alice', dept: 'eng' },
  { name: 'Bob',   dept: 'design' },
  { name: 'Carol', dept: 'eng' }
];
console.log(groupBy(users, 'dept'));
// { eng: [{Alice}, {Carol}], design: [{Bob}] }
```

---

## 9. Rate Limiter (Token Bucket)

```typescript
class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillRate: number // tokens per second
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // seconds
    this.tokens = Math.min(
      this.capacity,
      this.tokens + elapsed * this.refillRate
    );
    this.lastRefill = now;
  }

  consume(tokens: number = 1): boolean {
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true; // allowed
    }
    return false; // rate limited
  }
}

const bucket = new TokenBucket(10, 2); // capacity 10, refill 2/sec
console.log(bucket.consume()); // true (9 tokens left)
```

---

## 10. Binary Search

```typescript
// O(log n) search in sorted array
function binarySearch(arr: number[], target: number): number {
  let left = 0;
  let right = arr.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) left = mid + 1;
    else right = mid - 1;
  }

  return -1; // not found
}

// First occurrence:
function binarySearchFirst(arr: number[], target: number): number {
  let left = 0, right = arr.length - 1, result = -1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (arr[mid] === target) { result = mid; right = mid - 1; } // keep searching left
    else if (arr[mid] < target) left = mid + 1;
    else right = mid - 1;
  }
  return result;
}
```

---

## 11. Async Queue with Concurrency Limit

```typescript
// Process tasks with maximum N concurrent executions
async function asyncQueue<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let taskIndex = 0;

  async function worker() {
    while (taskIndex < tasks.length) {
      const index = taskIndex++;
      results[index] = await tasks[index]();
    }
  }

  // Start N workers:
  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, worker)
  );

  return results;
}

// Usage:
const tasks = urls.map(url => () => fetch(url).then(r => r.json()));
const results = await asyncQueue(tasks, 3); // max 3 concurrent requests
```

---

## 12. Event Emitter Implementation

```typescript
class EventEmitter {
  private listeners = new Map<string, Set<Function>>();

  on(event: string, listener: Function): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
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
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    const handlers = this.listeners.get(event);
    if (!handlers?.size) return false;
    handlers.forEach(h => h(...args));
    return true;
  }

  removeAllListeners(event?: string): this {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }
}
```

---

## 13. Retry with Exponential Backoff

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    retries?: number;
    initialDelay?: number;
    factor?: number;
    maxDelay?: number;
    retryOn?: (error: Error) => boolean;
  } = {}
): Promise<T> {
  const {
    retries = 3,
    initialDelay = 100,
    factor = 2,
    maxDelay = 5000,
    retryOn = () => true
  } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt === retries || !retryOn(lastError)) throw lastError;

      const delay = Math.min(initialDelay * factor ** attempt, maxDelay);
      const jitter = delay * 0.2 * Math.random(); // ±20% jitter
      await new Promise(r => setTimeout(r, delay + jitter));
    }
  }

  throw lastError!;
}

// Usage:
const data = await withRetry(
  () => fetch('https://api.example.com/data').then(r => r.json()),
  { retries: 3, initialDelay: 200, retryOn: (err) => err.message !== '404' }
);
```

---

## Interview Tips

**Common patterns to recognize:**
- Two pointers (sorted arrays, palindromes)
- Sliding window (subarray problems)
- HashMap for O(1) lookups (two sum, grouping)
- Stack for matching problems (parentheses, undo)
- Recursion + memoization (tree traversal, Fibonacci)
- BFS for shortest path, DFS for exhaustive search

**Always mention:**
- Time complexity
- Space complexity
- Edge cases (empty array, single element, duplicates, overflow)
- Alternative approaches

**Talk while coding:**
- "I'm thinking of using a HashMap to get O(1) lookup..."
- "Edge case: what if the array is empty?"
- "I could optimize this further by..."
