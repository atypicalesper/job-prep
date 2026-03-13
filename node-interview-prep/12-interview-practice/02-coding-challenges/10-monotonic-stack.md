# Monotonic Stack & Deque

A **monotonic stack** maintains elements in either increasing or decreasing order. Elements are pushed/popped such that the invariant is preserved. Used to find the next/previous greater/smaller element in O(n).

**Key insight:** when you pop an element because the new element violates the order, you've found a relationship between the popped element and the new one.

---

## Pattern: Next Greater Element

```ts
// For each element, find the next element to its right that is greater
function nextGreaterElement(nums: number[]): number[] {
  const result = new Array(nums.length).fill(-1);
  const stack: number[] = []; // stores indices

  for (let i = 0; i < nums.length; i++) {
    // Pop all elements smaller than nums[i] — nums[i] is their next greater
    while (stack.length && nums[stack[stack.length - 1]] < nums[i]) {
      const idx = stack.pop()!;
      result[idx] = nums[i];
    }
    stack.push(i);
  }
  // Remaining elements in stack have no next greater → -1 (default)
  return result;
}

console.log(nextGreaterElement([2, 1, 2, 4, 3])); // [4, 2, 4, -1, -1]
```

**Template:**
- Decreasing stack → finds **next greater**
- Increasing stack → finds **next smaller**
- Traverse right-to-left → finds **previous** greater/smaller

---

## Problem 1: Daily Temperatures

```ts
// Return array where result[i] = days until warmer temperature (0 if none)
function dailyTemperatures(temps: number[]): number[] {
  const result = new Array(temps.length).fill(0);
  const stack: number[] = []; // indices, decreasing by temperature

  for (let i = 0; i < temps.length; i++) {
    while (stack.length && temps[stack[stack.length - 1]] < temps[i]) {
      const j = stack.pop()!;
      result[j] = i - j; // days until warmer
    }
    stack.push(i);
  }
  return result;
}

console.log(dailyTemperatures([73,74,75,71,69,72,76,73])); // [1,1,4,2,1,1,0,0]
```

---

## Problem 2: Largest Rectangle in Histogram

```ts
// Find the largest rectangle area in a histogram
function largestRectangleArea(heights: number[]): number {
  const stack: number[] = []; // strictly increasing stack of indices
  let maxArea = 0;
  const n = heights.length;

  for (let i = 0; i <= n; i++) {
    const h = i === n ? 0 : heights[i]; // sentinel 0 flushes stack at end

    while (stack.length && heights[stack[stack.length - 1]] > h) {
      const height = heights[stack.pop()!];
      const width = stack.length === 0 ? i : i - stack[stack.length - 1] - 1;
      maxArea = Math.max(maxArea, height * width);
    }
    stack.push(i);
  }
  return maxArea;
}

console.log(largestRectangleArea([2,1,5,6,2,3])); // 10
console.log(largestRectangleArea([2,4]));          // 4
```

---

## Problem 3: Trapping Rain Water

```ts
// Monotonic stack approach — O(n) time, O(n) space
function trap(height: number[]): number {
  const stack: number[] = [];
  let water = 0;

  for (let i = 0; i < height.length; i++) {
    while (stack.length && height[stack[stack.length - 1]] < height[i]) {
      const bottom = stack.pop()!;
      if (!stack.length) break;
      const left = stack[stack.length - 1];
      const boundedHeight = Math.min(height[left], height[i]) - height[bottom];
      const width = i - left - 1;
      water += boundedHeight * width;
    }
    stack.push(i);
  }
  return water;
}

// Two-pointer approach — O(n) time, O(1) space
function trapTwoPointers(height: number[]): number {
  let left = 0, right = height.length - 1;
  let leftMax = 0, rightMax = 0, water = 0;

  while (left < right) {
    if (height[left] < height[right]) {
      leftMax = Math.max(leftMax, height[left]);
      water += leftMax - height[left];
      left++;
    } else {
      rightMax = Math.max(rightMax, height[right]);
      water += rightMax - height[right];
      right--;
    }
  }
  return water;
}

console.log(trap([0,1,0,2,1,0,1,3,2,1,2,1])); // 6
```

---

## Problem 4: Sliding Window Maximum (Monotonic Deque)

```ts
// Max of each window of size k — O(n)
function maxSlidingWindow(nums: number[], k: number): number[] {
  const deque: number[] = []; // indices, decreasing by value (monotonic decreasing)
  const result: number[] = [];

  for (let i = 0; i < nums.length; i++) {
    // Remove indices outside current window
    while (deque.length && deque[0] < i - k + 1) deque.shift();

    // Remove indices whose values are smaller than current (they're useless)
    while (deque.length && nums[deque[deque.length - 1]] < nums[i]) deque.pop();

    deque.push(i);

    // Window is fully formed
    if (i >= k - 1) result.push(nums[deque[0]]);
  }

  return result;
}

console.log(maxSlidingWindow([1,3,-1,-3,5,3,6,7], 3)); // [3,3,5,5,6,7]
```

---

## Problem 5: Remove K Digits (lexicographically smallest)

```ts
// Remove k digits to make the number string lexicographically smallest
function removeKdigits(num: string, k: number): string {
  const stack: string[] = []; // monotonically increasing

  for (const d of num) {
    while (k > 0 && stack.length && stack[stack.length - 1] > d) {
      stack.pop();
      k--;
    }
    stack.push(d);
  }

  // If k > 0, remove from the end (already increasing)
  while (k-- > 0) stack.pop();

  // Remove leading zeros
  const result = stack.join('').replace(/^0+/, '') || '0';
  return result;
}

console.log(removeKdigits('1432219', 3)); // "1219"
console.log(removeKdigits('10200', 1));   // "200" → "200"
console.log(removeKdigits('10', 2));      // "0"
```

---

## Problem 6: Sum of Subarray Minimums

```ts
// Sum of min(subarray) for all subarrays — O(n)
function sumSubarrayMins(arr: number[]): number {
  const MOD = 1e9 + 7;
  const n = arr.length;
  const stack: number[] = [];
  let sum = 0;

  for (let i = 0; i <= n; i++) {
    while (stack.length && (i === n || arr[stack[stack.length - 1]] >= arr[i])) {
      const mid = stack.pop()!;
      const left = stack.length ? stack[stack.length - 1] : -1;
      // arr[mid] is the minimum for subarrays spanning (left, mid] on left and [mid, i) on right
      const count = (mid - left) * (i - mid);
      sum = (sum + arr[mid] * count) % MOD;
    }
    stack.push(i);
  }

  return sum;
}

console.log(sumSubarrayMins([3,1,2,4])); // 17
// Subarrays: [3]=3, [1]=1, [2]=2, [4]=4, [3,1]=1, [1,2]=1, [2,4]=2, [3,1,2]=1, [1,2,4]=1, [3,1,2,4]=1
// Sum = 17
```

---

## Problem 7: 132 Pattern

```ts
// Check if any i < j < k with nums[i] < nums[k] < nums[j]
function find132pattern(nums: number[]): boolean {
  let third = -Infinity; // nums[k] — the "2" in 132
  const stack: number[] = []; // potential nums[j] values (decreasing)

  for (let i = nums.length - 1; i >= 0; i--) {
    if (nums[i] < third) return true; // found nums[i] < third
    while (stack.length && stack[stack.length - 1] < nums[i]) {
      third = stack.pop()!; // best candidate for nums[k]
    }
    stack.push(nums[i]);
  }
  return false;
}

console.log(find132pattern([1,2,3,4]));   // false
console.log(find132pattern([3,1,4,2]));   // true
console.log(find132pattern([-1,3,2,0]));  // true
```

---

## Summary Table

| Problem | Stack type | What triggers a pop |
|---|---|---|
| Next greater element | Decreasing | Current > top |
| Next smaller element | Increasing | Current < top |
| Largest rectangle | Increasing | Current < top (found right boundary) |
| Trapping rain water | Decreasing | Current > top (found right wall) |
| Remove k digits | Increasing | Current < top and k > 0 |
| Sum subarray mins | Increasing | Current <= top |
| 132 pattern | Decreasing (R→L) | Current > top → update third |

## Deque vs Stack

Use a **deque** (double-ended queue) when:
- You need to remove from both front and back (sliding window)
- Front holds the current answer, back is used for maintenance

Use a **stack** when:
- You only need LIFO behavior (next greater, histogram, etc.)

## Common Mistakes

1. **Storing values instead of indices** — you almost always need the index (for width, distance, etc.)
2. **Forgetting the sentinel** — appending `0` or `-Infinity` at the end forces the stack to flush cleanly
3. **Off-by-one in width calculation** — `width = i - stack[top] - 1` when stack is non-empty, `width = i` when empty
4. **Using `shift()` on large arrays** — `shift()` is O(n); for real sliding window use a proper deque or circular buffer
