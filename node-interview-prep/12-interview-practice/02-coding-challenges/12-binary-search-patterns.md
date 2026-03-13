# Binary Search Patterns

Binary search runs in O(log n) by halving the search space each step. The trick is correctly defining:
1. **What are you searching for?** (a value, a boundary, a minimum that satisfies a condition)
2. **What does the invariant look like?** (`lo` is always a valid candidate or `hi` is always a valid candidate)

---

## Template A: Find Exact Value

```ts
function binarySearch(arr: number[], target: number): number {
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) {
    const mid = lo + ((hi - lo) >> 1); // avoids overflow
    if (arr[mid] === target) return mid;
    if (arr[mid] < target)  lo = mid + 1;
    else                    hi = mid - 1;
  }
  return -1; // not found
}
```

---

## Template B: Find Left Boundary (first occurrence / lower bound)

```ts
// Returns the leftmost index where arr[i] >= target
function lowerBound(arr: number[], target: number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (arr[mid] < target) lo = mid + 1;
    else                   hi = mid;   // mid could be the answer
  }
  return lo; // lo === hi, first position >= target
}
```

---

## Template C: Find Right Boundary (last occurrence / upper bound)

```ts
// Returns the first index where arr[i] > target (exclusive upper bound)
function upperBound(arr: number[], target: number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (arr[mid] <= target) lo = mid + 1;
    else                    hi = mid;
  }
  return lo; // first position > target
}

// Count occurrences of target:
function countOccurrences(arr: number[], target: number): number {
  return upperBound(arr, target) - lowerBound(arr, target);
}
```

---

## Template D: Binary Search on Answer (Predicate)

When the answer space forms a monotonic boolean pattern `[F,F,F,T,T,T]`, binary search on the answer:

```ts
// Find minimum value x such that predicate(x) is true
function binarySearchOnAnswer(lo: number, hi: number, predicate: (x: number) => boolean): number {
  while (lo < hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (predicate(mid)) hi = mid;  // mid satisfies — try smaller
    else                lo = mid + 1; // mid doesn't satisfy — try larger
  }
  return lo; // minimum x where predicate is true
}
```

---

## Problem 1: Search in Rotated Sorted Array

```ts
function searchRotated(nums: number[], target: number): number {
  let lo = 0, hi = nums.length - 1;

  while (lo <= hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (nums[mid] === target) return mid;

    if (nums[lo] <= nums[mid]) {
      // Left half is sorted
      if (nums[lo] <= target && target < nums[mid]) hi = mid - 1;
      else lo = mid + 1;
    } else {
      // Right half is sorted
      if (nums[mid] < target && target <= nums[hi]) lo = mid + 1;
      else hi = mid - 1;
    }
  }
  return -1;
}

console.log(searchRotated([4,5,6,7,0,1,2], 0)); // 4
console.log(searchRotated([4,5,6,7,0,1,2], 3)); // -1
```

---

## Problem 2: Find Minimum in Rotated Sorted Array

```ts
function findMin(nums: number[]): number {
  let lo = 0, hi = nums.length - 1;

  while (lo < hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (nums[mid] > nums[hi]) lo = mid + 1; // min is in right half
    else                      hi = mid;     // mid could be the min
  }
  return nums[lo];
}

console.log(findMin([3,4,5,1,2])); // 1
console.log(findMin([4,5,6,7,0,1,2])); // 0
```

---

## Problem 3: Koko Eating Bananas (binary search on answer)

```ts
// Minimum eating speed k such that all piles eaten in h hours
function minEatingSpeed(piles: number[], h: number): number {
  const canFinish = (speed: number): boolean => {
    return piles.reduce((hours, pile) => hours + Math.ceil(pile / speed), 0) <= h;
  };

  let lo = 1, hi = Math.max(...piles);
  while (lo < hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (canFinish(mid)) hi = mid;
    else                lo = mid + 1;
  }
  return lo;
}

console.log(minEatingSpeed([3,6,7,11], 8)); // 4
console.log(minEatingSpeed([30,11,23,4,20], 5)); // 30
```

---

## Problem 4: Capacity to Ship Packages Within D Days

```ts
function shipWithinDays(weights: number[], days: number): number {
  const canShip = (capacity: number): boolean => {
    let d = 1, load = 0;
    for (const w of weights) {
      if (load + w > capacity) { d++; load = 0; }
      load += w;
    }
    return d <= days;
  };

  let lo = Math.max(...weights); // min capacity = heaviest package
  let hi = weights.reduce((a, b) => a + b, 0); // max capacity = all at once

  while (lo < hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (canShip(mid)) hi = mid;
    else              lo = mid + 1;
  }
  return lo;
}

console.log(shipWithinDays([1,2,3,4,5,6,7,8,9,10], 5)); // 15
```

---

## Problem 5: Find Peak Element

```ts
// Peak: nums[i] > nums[i-1] and nums[i] > nums[i+1] (edges are -Infinity)
function findPeakElement(nums: number[]): number {
  let lo = 0, hi = nums.length - 1;
  while (lo < hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (nums[mid] > nums[mid + 1]) hi = mid;  // peak is on left side (or mid)
    else                           lo = mid + 1; // peak is on right side
  }
  return lo;
}

console.log(findPeakElement([1,2,3,1])); // 2
console.log(findPeakElement([1,2,1,3,5,6,4])); // 5 or 1
```

---

## Problem 6: Median of Two Sorted Arrays

```ts
// O(log(min(m,n))) — binary search on the partition point
function findMedianSortedArrays(nums1: number[], nums2: number[]): number {
  if (nums1.length > nums2.length) return findMedianSortedArrays(nums2, nums1);
  const m = nums1.length, n = nums2.length;
  let lo = 0, hi = m;

  while (lo <= hi) {
    const partA = lo + ((hi - lo) >> 1);
    const partB = (m + n + 1) / 2 - partA | 0;

    const maxLeftA  = partA === 0 ? -Infinity : nums1[partA - 1];
    const minRightA = partA === m ?  Infinity : nums1[partA];
    const maxLeftB  = partB === 0 ? -Infinity : nums2[partB - 1];
    const minRightB = partB === n ?  Infinity : nums2[partB];

    if (maxLeftA <= minRightB && maxLeftB <= minRightA) {
      // Correct partition
      if ((m + n) % 2 === 1) return Math.max(maxLeftA, maxLeftB);
      return (Math.max(maxLeftA, maxLeftB) + Math.min(minRightA, minRightB)) / 2;
    } else if (maxLeftA > minRightB) {
      hi = partA - 1;
    } else {
      lo = partA + 1;
    }
  }
  throw new Error('Input arrays are not sorted');
}

console.log(findMedianSortedArrays([1,3], [2]));     // 2.0
console.log(findMedianSortedArrays([1,2], [3,4]));   // 2.5
```

---

## Problem 7: Search a 2D Matrix

```ts
// Matrix where each row is sorted and first element of each row > last of previous
function searchMatrix(matrix: number[][], target: number): boolean {
  const rows = matrix.length, cols = matrix[0].length;
  let lo = 0, hi = rows * cols - 1;

  while (lo <= hi) {
    const mid = lo + ((hi - lo) >> 1);
    const val = matrix[Math.floor(mid / cols)][mid % cols];
    if (val === target) return true;
    if (val < target) lo = mid + 1;
    else              hi = mid - 1;
  }
  return false;
}
```

---

## Choosing the Right Template

| Situation | Template | Condition |
|---|---|---|
| Exact match | A (lo <= hi) | `arr[mid] === target` |
| First position ≥ target | B (lo < hi) | `arr[mid] < target → lo = mid+1` |
| Last position ≤ target | C (lo < hi) | `arr[mid] <= target → lo = mid+1` |
| Min satisfying predicate | D (lo < hi) | `pred(mid) → hi = mid` |
| Max satisfying predicate | D reversed | `pred(mid) → lo = mid` |

## Common Mistakes

1. **Integer overflow** — use `mid = lo + ((hi - lo) >> 1)` not `(lo + hi) / 2`
2. **Infinite loop** — happens when `lo < hi` but neither `lo` nor `hi` moves; ensure one branch always changes
3. **Wrong loop condition** — `lo <= hi` for exact match, `lo < hi` for boundary search
4. **Wrong hi initialisation** — for "binary search on answer", `hi` must be a valid upper bound that definitely satisfies (or doesn't) the predicate
5. **Forgetting to handle empty arrays** — check `nums.length === 0` before entering the loop
