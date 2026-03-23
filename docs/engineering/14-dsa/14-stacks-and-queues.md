# Stacks and Queues

Stacks (LIFO) and queues (FIFO) are the backbone of parsing, monotonic patterns, and BFS. Recognize when "the most recent unmatched element" matters -- that is a stack.

---

## Problem 1: Min Stack

```ts
// Design a stack that supports push, pop, top, and getMin in O(1).
// Trick: store [value, currentMin] pairs.
// Time: O(1) all ops, Space: O(n)

class MinStack {
  private stack: [number, number][] = []; // [val, min at this level]

  push(val: number): void {
    const curMin = this.stack.length
      ? Math.min(val, this.stack[this.stack.length - 1][1])
      : val;
    this.stack.push([val, curMin]);
  }

  pop(): void { this.stack.pop(); }

  top(): number { return this.stack[this.stack.length - 1][0]; }

  getMin(): number { return this.stack[this.stack.length - 1][1]; }
}

const ms = new MinStack();
ms.push(-2); ms.push(0); ms.push(-3);
console.log(ms.getMin()); // -3
ms.pop();
console.log(ms.top());    // 0
console.log(ms.getMin()); // -2
```

---

## Problem 2: Daily Temperatures

```ts
// Given daily temps, return how many days until a warmer temp.
// Monotonic decreasing stack of indices.
// Time: O(n), Space: O(n)

function dailyTemperatures(temperatures: number[]): number[] {
  const n = temperatures.length;
  const result = new Array(n).fill(0);
  const stack: number[] = []; // indices of unresolved days

  for (let i = 0; i < n; i++) {
    // Pop all days that are cooler than today
    while (stack.length && temperatures[stack[stack.length - 1]] < temperatures[i]) {
      const j = stack.pop()!;
      result[j] = i - j;
    }
    stack.push(i);
  }

  return result;
}

console.log(dailyTemperatures([73,74,75,71,69,72,76,73]));
// [1, 1, 4, 2, 1, 1, 0, 0]
```

---

## Problem 3: Largest Rectangle in Histogram

```ts
// For each bar, find how far left and right it can extend.
// Monotonic increasing stack of indices.
// Time: O(n), Space: O(n)

function largestRectangleArea(heights: number[]): number {
  const stack: number[] = []; // indices, heights are increasing
  let maxArea = 0;

  for (let i = 0; i <= heights.length; i++) {
    const h = i === heights.length ? 0 : heights[i]; // sentinel

    while (stack.length && heights[stack[stack.length - 1]] > h) {
      const height = heights[stack.pop()!];
      const width = stack.length ? i - stack[stack.length - 1] - 1 : i;
      maxArea = Math.max(maxArea, height * width);
    }

    stack.push(i);
  }

  return maxArea;
}

console.log(largestRectangleArea([2, 1, 5, 6, 2, 3])); // 10
console.log(largestRectangleArea([2, 4]));               // 4
```

---

## Problem 4: Basic Calculator

```ts
// Evaluate expression with +, -, (, ). No * or /.
// Use a stack to save state when entering parentheses.
// Time: O(n), Space: O(n)

function calculate(s: string): number {
  const stack: number[] = [];
  let result = 0;
  let num = 0;
  let sign = 1;

  for (const ch of s) {
    if (ch >= '0' && ch <= '9') {
      num = num * 10 + Number(ch);
    } else if (ch === '+') {
      result += sign * num;
      num = 0;
      sign = 1;
    } else if (ch === '-') {
      result += sign * num;
      num = 0;
      sign = -1;
    } else if (ch === '(') {
      // Save current result and sign, reset
      stack.push(result);
      stack.push(sign);
      result = 0;
      sign = 1;
    } else if (ch === ')') {
      result += sign * num;
      num = 0;
      const prevSign = stack.pop()!;
      const prevResult = stack.pop()!;
      result = prevResult + prevSign * result;
    }
    // skip spaces
  }

  return result + sign * num;
}

console.log(calculate('1 + 1'));           // 2
console.log(calculate(' 2-1 + 2 '));       // 3
console.log(calculate('(1+(4+5+2)-3)+(6+8)')); // 23
```

---

## Problem 5: Implement Queue Using Stacks

```ts
// Two stacks: push to inStack, pop from outStack.
// Amortized O(1) per operation.

class MyQueue {
  private inStack: number[] = [];
  private outStack: number[] = [];

  push(x: number): void {
    this.inStack.push(x);
  }

  pop(): number {
    this._transfer();
    return this.outStack.pop()!;
  }

  peek(): number {
    this._transfer();
    return this.outStack[this.outStack.length - 1];
  }

  empty(): boolean {
    return this.inStack.length === 0 && this.outStack.length === 0;
  }

  private _transfer(): void {
    if (this.outStack.length === 0) {
      while (this.inStack.length) {
        this.outStack.push(this.inStack.pop()!);
      }
    }
  }
}

const q = new MyQueue();
q.push(1); q.push(2);
console.log(q.peek());  // 1
console.log(q.pop());   // 1
console.log(q.empty()); // false
```

---

## Problem 6: Next Greater Element

```ts
// For each element in nums1, find next greater element in nums2.
// Process nums2 right-to-left with monotonic stack.
// Time: O(n + m), Space: O(n)

function nextGreaterElement(nums1: number[], nums2: number[]): number[] {
  const map = new Map<number, number>(); // num -> next greater
  const stack: number[] = [];

  // Process nums2: for each element, pop all smaller from stack
  for (let i = nums2.length - 1; i >= 0; i--) {
    while (stack.length && stack[stack.length - 1] <= nums2[i]) {
      stack.pop();
    }
    map.set(nums2[i], stack.length ? stack[stack.length - 1] : -1);
    stack.push(nums2[i]);
  }

  return nums1.map(n => map.get(n)!);
}

console.log(nextGreaterElement([4, 1, 2], [1, 3, 4, 2])); // [-1, 3, -1]
console.log(nextGreaterElement([2, 4], [1, 2, 3, 4]));     // [3, -1]
```

---

## Problem 7: Trapping Rain Water (Stack Approach)

```ts
// Stack-based approach: maintain a decreasing stack of indices.
// When we find a taller bar, pop and compute trapped water layer by layer.
// Time: O(n), Space: O(n)

function trap(height: number[]): number {
  const stack: number[] = []; // indices
  let water = 0;

  for (let i = 0; i < height.length; i++) {
    while (stack.length && height[i] > height[stack[stack.length - 1]]) {
      const bottom = stack.pop()!;
      if (!stack.length) break; // no left boundary

      const left = stack[stack.length - 1];
      const width = i - left - 1;
      const bounded = Math.min(height[left], height[i]) - height[bottom];
      water += width * bounded;
    }
    stack.push(i);
  }

  return water;
}

console.log(trap([0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1])); // 6
console.log(trap([4, 2, 0, 3, 2, 5]));                     // 9
```

---

## Problem 8: Asteroid Collision

```ts
// Positive = moving right, negative = moving left.
// Stack: push right-movers. On left-mover, resolve collisions.
// Time: O(n), Space: O(n)

function asteroidCollision(asteroids: number[]): number[] {
  const stack: number[] = [];

  for (const ast of asteroids) {
    let alive = true;

    while (alive && ast < 0 && stack.length && stack[stack.length - 1] > 0) {
      const top = stack[stack.length - 1];
      if (top < -ast) {
        stack.pop(); // top is destroyed, asteroid survives
      } else if (top === -ast) {
        stack.pop(); // both destroyed
        alive = false;
      } else {
        alive = false; // asteroid destroyed
      }
    }

    if (alive) stack.push(ast);
  }

  return stack;
}

console.log(asteroidCollision([5, 10, -5]));   // [5, 10]
console.log(asteroidCollision([8, -8]));       // []
console.log(asteroidCollision([10, 2, -5]));   // [10]
console.log(asteroidCollision([-2, -1, 1, 2])); // [-2, -1, 1, 2]
```

---

## Problem 9: Decode String

```ts
// "3[a2[c]]" -> "accaccacc"
// Stack of [currentString, repeatCount]. Push state on '[', pop on ']'.
// Time: O(n * maxK), Space: O(n)

function decodeString(s: string): string {
  const strStack: string[] = [];
  const numStack: number[] = [];
  let cur = '';
  let num = 0;

  for (const ch of s) {
    if (ch >= '0' && ch <= '9') {
      num = num * 10 + Number(ch);
    } else if (ch === '[') {
      strStack.push(cur);
      numStack.push(num);
      cur = '';
      num = 0;
    } else if (ch === ']') {
      const repeat = numStack.pop()!;
      const prev = strStack.pop()!;
      cur = prev + cur.repeat(repeat);
    } else {
      cur += ch;
    }
  }

  return cur;
}

console.log(decodeString('3[a]2[bc]'));   // 'aaabcbc'
console.log(decodeString('3[a2[c]]'));    // 'accaccacc'
console.log(decodeString('2[abc]3[cd]ef')); // 'abcabccdcdcdef'
```

---

## Problem 10: Sliding Window Maximum

```ts
// Return max in each window of size k.
// Monotonic decreasing deque of indices.
// Time: O(n), Space: O(k)

function maxSlidingWindow(nums: number[], k: number): number[] {
  const result: number[] = [];
  const deque: number[] = []; // indices, values are decreasing

  for (let i = 0; i < nums.length; i++) {
    // Remove indices outside the window
    while (deque.length && deque[0] < i - k + 1) {
      deque.shift();
    }

    // Remove indices with smaller values (they will never be the max)
    while (deque.length && nums[deque[deque.length - 1]] < nums[i]) {
      deque.pop();
    }

    deque.push(i);

    // Window is full starting at index k-1
    if (i >= k - 1) {
      result.push(nums[deque[0]]);
    }
  }

  return result;
}

console.log(maxSlidingWindow([1, 3, -1, -3, 5, 3, 6, 7], 3));
// [3, 3, 5, 5, 6, 7]
console.log(maxSlidingWindow([1], 1)); // [1]
```

---

## Pattern Quick Reference

```
Problem                       Data structure      Key insight
------------------------------------------------------------------
Min stack                     Stack of pairs      Track min at each level
Daily temperatures            Mono decreasing stk  Pop cooler days on warmer day
Largest rectangle             Mono increasing stk  Pop taller bars, compute width
Basic calculator              Stack for parens     Save/restore result on ( and )
Queue using stacks            Two stacks           Amortized transfer
Next greater element          Mono decreasing stk  Process right-to-left
Trapping rain water (stack)   Mono decreasing stk  Pop bottom, compute bounded water
Asteroid collision            Stack                Resolve right-meets-left collisions
Decode string                 Two stacks           Push state on [, pop on ]
Sliding window max            Mono decreasing deq  Deque front = window max
```
