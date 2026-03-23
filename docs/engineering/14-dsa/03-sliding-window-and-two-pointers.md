# Sliding Window and Two Pointers — Interview Patterns

These two patterns solve a huge class of array/string problems. Recognize the pattern first.

---

## When to Use Each

```
Sliding Window:
  - "subarray/substring of length K" → fixed window
  - "longest/shortest subarray satisfying condition" → variable window
  - "maximum sum/count in any window of size K"
  Keywords: contiguous, subarray, substring, window, consecutive

Two Pointers:
  - Sorted array → pairs/triplets that sum to X
  - Remove duplicates in place
  - Reverse / palindrome check
  - Merge two sorted arrays
  Keywords: sorted, pair, in-place, two ends
```

---

## Fixed Window — Maximum Sum of K Elements

```typescript
// O(n) — sliding average, max sum, count in window of fixed size

function maxSumSubarray(nums: number[], k: number): number {
  if (nums.length < k) return -Infinity;

  // Build first window:
  let windowSum = nums.slice(0, k).reduce((a, b) => a + b, 0);
  let maxSum = windowSum;

  // Slide: add right element, remove left element:
  for (let i = k; i < nums.length; i++) {
    windowSum += nums[i] - nums[i - k];
    maxSum = Math.max(maxSum, windowSum);
  }

  return maxSum;
}

// Test: [2,1,5,1,3,2], k=3 → 9 (subarray [5,1,3])
console.log(maxSumSubarray([2, 1, 5, 1, 3, 2], 3)); // 9
```

---

## Variable Window — Longest Substring Without Repeating Characters

```typescript
// Classic: expand right, shrink left when condition violated
// O(n) time, O(min(n,charset)) space

function lengthOfLongestSubstring(s: string): number {
  const seen = new Map<string, number>(); // char → last index
  let left = 0;
  let maxLen = 0;

  for (let right = 0; right < s.length; right++) {
    const char = s[right];

    // If char was seen WITHIN current window, move left past it:
    if (seen.has(char) && seen.get(char)! >= left) {
      left = seen.get(char)! + 1;
    }

    seen.set(char, right);
    maxLen = Math.max(maxLen, right - left + 1);
  }

  return maxLen;
}

console.log(lengthOfLongestSubstring('abcabcbb')); // 3 ("abc")
console.log(lengthOfLongestSubstring('bbbbb'));    // 1 ("b")
console.log(lengthOfLongestSubstring('pwwkew'));   // 3 ("wke")
```

---

## Variable Window — Minimum Window Substring

```typescript
// Find smallest window in s containing all chars of t
// O(n + m), classic hard sliding window

function minWindow(s: string, t: string): string {
  if (t.length > s.length) return '';

  // Count chars needed:
  const need = new Map<string, number>();
  for (const c of t) need.set(c, (need.get(c) ?? 0) + 1);

  let formed = 0;           // how many chars from t are satisfied
  const required = need.size; // distinct chars in t that must be in window
  const window = new Map<string, number>();

  let left = 0;
  let minLen = Infinity;
  let result = '';

  for (let right = 0; right < s.length; right++) {
    // Expand right:
    const c = s[right];
    window.set(c, (window.get(c) ?? 0) + 1);

    // Check if this char's requirement is met:
    if (need.has(c) && window.get(c) === need.get(c)) {
      formed++;
    }

    // Shrink left while window is valid:
    while (formed === required) {
      if (right - left + 1 < minLen) {
        minLen = right - left + 1;
        result = s.slice(left, right + 1);
      }

      const leftChar = s[left];
      window.set(leftChar, window.get(leftChar)! - 1);
      if (need.has(leftChar) && window.get(leftChar)! < need.get(leftChar)!) {
        formed--;
      }
      left++;
    }
  }

  return result;
}

console.log(minWindow('ADOBECODEBANC', 'ABC')); // 'BANC'
console.log(minWindow('a', 'a'));               // 'a'
console.log(minWindow('a', 'aa'));              // ''
```

---

## Variable Window — Longest Subarray with At Most K Distinct Characters

```typescript
function lengthOfLongestSubstringKDistinct(s: string, k: number): number {
  const window = new Map<string, number>();
  let left = 0;
  let maxLen = 0;

  for (let right = 0; right < s.length; right++) {
    const c = s[right];
    window.set(c, (window.get(c) ?? 0) + 1);

    // Shrink until at most k distinct chars:
    while (window.size > k) {
      const leftChar = s[left];
      window.set(leftChar, window.get(leftChar)! - 1);
      if (window.get(leftChar) === 0) window.delete(leftChar);
      left++;
    }

    maxLen = Math.max(maxLen, right - left + 1);
  }

  return maxLen;
}

console.log(lengthOfLongestSubstringKDistinct('eceba', 2)); // 3 ("ece")
```

---

## Two Pointers — Two Sum in Sorted Array

```typescript
// Works only on SORTED arrays. O(n) time, O(1) space.
function twoSumSorted(nums: number[], target: number): [number, number] | null {
  let left = 0;
  let right = nums.length - 1;

  while (left < right) {
    const sum = nums[left] + nums[right];
    if (sum === target) return [left, right];
    if (sum < target) left++;   // need bigger sum
    else right--;               // need smaller sum
  }

  return null;
}

console.log(twoSumSorted([2, 7, 11, 15], 9)); // [0, 1]
```

---

## Two Pointers — Three Sum

```typescript
// Find all unique triplets that sum to 0. O(n²) time.
function threeSum(nums: number[]): number[][] {
  nums.sort((a, b) => a - b);
  const result: number[][] = [];

  for (let i = 0; i < nums.length - 2; i++) {
    // Skip duplicates for the first element:
    if (i > 0 && nums[i] === nums[i - 1]) continue;

    let left = i + 1;
    let right = nums.length - 1;

    while (left < right) {
      const sum = nums[i] + nums[left] + nums[right];

      if (sum === 0) {
        result.push([nums[i], nums[left], nums[right]]);
        // Skip duplicates:
        while (left < right && nums[left] === nums[left + 1]) left++;
        while (left < right && nums[right] === nums[right - 1]) right--;
        left++;
        right--;
      } else if (sum < 0) {
        left++;
      } else {
        right--;
      }
    }
  }

  return result;
}

console.log(threeSum([-1, 0, 1, 2, -1, -4])); // [[-1,-1,2],[-1,0,1]]
```

---

## Two Pointers — Container With Most Water

```typescript
// Given heights, find two lines that contain the most water.
// O(n) — classic greedy two pointer.
function maxArea(heights: number[]): number {
  let left = 0;
  let right = heights.length - 1;
  let max = 0;

  while (left < right) {
    const water = Math.min(heights[left], heights[right]) * (right - left);
    max = Math.max(max, water);

    // Move the shorter side — moving the taller can only make it worse:
    if (heights[left] < heights[right]) left++;
    else right--;
  }

  return max;
}

console.log(maxArea([1, 8, 6, 2, 5, 4, 8, 3, 7])); // 49
```

---

## Two Pointers — Remove Duplicates In-Place

```typescript
// Modify array in-place, return new length. O(n), O(1) space.
function removeDuplicates(nums: number[]): number {
  if (nums.length === 0) return 0;

  let slow = 0; // points to last unique element

  for (let fast = 1; fast < nums.length; fast++) {
    if (nums[fast] !== nums[slow]) {
      slow++;
      nums[slow] = nums[fast];
    }
  }

  return slow + 1; // new length
}

const arr = [1, 1, 2, 2, 3];
const len = removeDuplicates(arr);
console.log(arr.slice(0, len)); // [1, 2, 3]
```

---

## Two Pointers — Trapping Rain Water

```typescript
// O(n) — track max height from both sides as you go.
function trap(heights: number[]): number {
  let left = 0;
  let right = heights.length - 1;
  let leftMax = 0;
  let rightMax = 0;
  let water = 0;

  while (left < right) {
    if (heights[left] < heights[right]) {
      // Right side is guaranteed taller — water at left depends only on leftMax
      if (heights[left] >= leftMax) {
        leftMax = heights[left];
      } else {
        water += leftMax - heights[left];
      }
      left++;
    } else {
      if (heights[right] >= rightMax) {
        rightMax = heights[right];
      } else {
        water += rightMax - heights[right];
      }
      right--;
    }
  }

  return water;
}

console.log(trap([0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1])); // 6
```

---

## Sliding Window — Maximum Sliding Window (Monotonic Deque)

```typescript
// Return max in each window of size k. O(n).
// Use a deque that stores indices in decreasing order of value.
function maxSlidingWindow(nums: number[], k: number): number[] {
  const result: number[] = [];
  const deque: number[] = []; // stores indices, values are decreasing

  for (let i = 0; i < nums.length; i++) {
    // Remove indices outside current window:
    while (deque.length > 0 && deque[0] < i - k + 1) {
      deque.shift();
    }

    // Remove indices with smaller values — they'll never be the max:
    while (deque.length > 0 && nums[deque[deque.length - 1]] < nums[i]) {
      deque.pop();
    }

    deque.push(i);

    // Window is full starting from index k-1:
    if (i >= k - 1) {
      result.push(nums[deque[0]]); // deque[0] is index of current max
    }
  }

  return result;
}

console.log(maxSlidingWindow([1, 3, -1, -3, 5, 3, 6, 7], 3)); // [3,3,5,5,6,7]
```

---

## Pattern Recognition Quick Guide

```
Problem type                          → Pattern

Max/min sum of subarray length K      → Fixed window
Longest substring with constraint     → Variable window (expand right, shrink left)
Minimum window containing all of t    → Variable window (two Maps + formed counter)
Two numbers sum to target (sorted)    → Two pointers (left + right)
Three numbers sum to target           → Sort + two pointers in inner loop
Remove duplicates in-place            → Slow/fast pointers
Container with most water             → Two pointers (move shorter side)
Trapping rain water                   → Two pointers with running max
Max in each window of size K          → Monotonic deque
Count subarrays with exactly K        → Sliding window: atMost(K) - atMost(K-1)
```
