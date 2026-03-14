# Sorting and Searching

Know your sorts cold: merge sort (stable, O(n log n) guaranteed), quicksort (in-place, O(n log n) average), and special-purpose sorts (counting, bucket). Binary search variations come up constantly.

---

## Merge Sort

```ts
// Stable, O(n log n) time, O(n) space.
// Divide array in half, sort each, merge.

function mergeSort(arr: number[]): number[] {
  if (arr.length <= 1) return arr;

  const mid = Math.floor(arr.length / 2);
  const left = mergeSort(arr.slice(0, mid));
  const right = mergeSort(arr.slice(mid));

  return merge(left, right);
}

function merge(a: number[], b: number[]): number[] {
  const result: number[] = [];
  let i = 0, j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] <= b[j]) result.push(a[i++]); // <= makes it stable
    else result.push(b[j++]);
  }

  while (i < a.length) result.push(a[i++]);
  while (j < b.length) result.push(b[j++]);
  return result;
}

console.log(mergeSort([38, 27, 43, 3, 9, 82, 10]));
// [3, 9, 10, 27, 38, 43, 82]
```

---

## Quicksort

```ts
// In-place, O(n log n) average, O(n^2) worst case.
// Lomuto partition scheme. Pick last element as pivot.

function quickSort(arr: number[], lo = 0, hi = arr.length - 1): number[] {
  if (lo < hi) {
    const pivot = partition(arr, lo, hi);
    quickSort(arr, lo, pivot - 1);
    quickSort(arr, pivot + 1, hi);
  }
  return arr;
}

function partition(arr: number[], lo: number, hi: number): number {
  const pivot = arr[hi];
  let i = lo; // i tracks the boundary of "less than pivot"

  for (let j = lo; j < hi; j++) {
    if (arr[j] < pivot) {
      [arr[i], arr[j]] = [arr[j], arr[i]];
      i++;
    }
  }

  [arr[i], arr[hi]] = [arr[hi], arr[i]]; // place pivot
  return i;
}

console.log(quickSort([10, 7, 8, 9, 1, 5]));
// [1, 5, 7, 8, 9, 10]
```

---

## Binary Search — First Occurrence

```ts
// Find the FIRST index where target appears. Returns -1 if not found.
// Key: when found, don't return — shrink right boundary to find earlier occurrence.
// Time: O(log n)

function firstOccurrence(nums: number[], target: number): number {
  let lo = 0, hi = nums.length - 1;
  let result = -1;

  while (lo <= hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (nums[mid] === target) {
      result = mid;
      hi = mid - 1; // keep searching left
    } else if (nums[mid] < target) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return result;
}

console.log(firstOccurrence([1, 2, 2, 2, 3, 4], 2)); // 1
console.log(firstOccurrence([1, 3, 5, 7], 5));        // 2
console.log(firstOccurrence([1, 3, 5, 7], 4));        // -1
```

---

## Binary Search — Last Occurrence

```ts
function lastOccurrence(nums: number[], target: number): number {
  let lo = 0, hi = nums.length - 1;
  let result = -1;

  while (lo <= hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (nums[mid] === target) {
      result = mid;
      lo = mid + 1; // keep searching right
    } else if (nums[mid] < target) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return result;
}

console.log(lastOccurrence([1, 2, 2, 2, 3, 4], 2)); // 3
```

---

## Binary Search — Search in Rotated Sorted Array

```ts
// [4,5,6,7,0,1,2] — one half is always sorted.
// Determine which half is sorted, check if target is in that half.
// Time: O(log n)

function searchRotated(nums: number[], target: number): number {
  let lo = 0, hi = nums.length - 1;

  while (lo <= hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (nums[mid] === target) return mid;

    // Left half is sorted
    if (nums[lo] <= nums[mid]) {
      if (target >= nums[lo] && target < nums[mid]) {
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    // Right half is sorted
    else {
      if (target > nums[mid] && target <= nums[hi]) {
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
  }

  return -1;
}

console.log(searchRotated([4, 5, 6, 7, 0, 1, 2], 0)); // 4
console.log(searchRotated([4, 5, 6, 7, 0, 1, 2], 3)); // -1
console.log(searchRotated([1], 0));                     // -1
```

---

## Binary Search — Find Peak Element

```ts
// A peak is strictly greater than its neighbors.
// Binary search: if mid < mid+1, peak is to the right.
// Time: O(log n)

function findPeakElement(nums: number[]): number {
  let lo = 0, hi = nums.length - 1;

  while (lo < hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (nums[mid] < nums[mid + 1]) {
      lo = mid + 1; // peak is to the right
    } else {
      hi = mid; // mid could be the peak
    }
  }

  return lo;
}

console.log(findPeakElement([1, 2, 3, 1]));       // 2
console.log(findPeakElement([1, 2, 1, 3, 5, 6, 4])); // 5 (or 1)
```

---

## Counting Sort

```ts
// Non-comparison sort. O(n + k) where k = range of values.
// Only works for integers in a known range.

function countingSort(arr: number[]): number[] {
  if (arr.length === 0) return [];

  const max = Math.max(...arr);
  const min = Math.min(...arr);
  const range = max - min + 1;

  const count = new Array(range).fill(0);
  const output = new Array(arr.length);

  // Count occurrences
  for (const val of arr) count[val - min]++;

  // Prefix sum for stable positioning
  for (let i = 1; i < range; i++) count[i] += count[i - 1];

  // Build output (traverse backwards for stability)
  for (let i = arr.length - 1; i >= 0; i--) {
    const idx = --count[arr[i] - min];
    output[idx] = arr[i];
  }

  return output;
}

console.log(countingSort([4, 2, 2, 8, 3, 3, 1])); // [1, 2, 2, 3, 3, 4, 8]
```

---

## Bucket Sort

```ts
// Distribute into buckets, sort each bucket, concatenate.
// O(n + k) average for uniformly distributed data.

function bucketSort(arr: number[], bucketCount = 5): number[] {
  if (arr.length === 0) return [];

  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const range = max - min + 1;

  const buckets: number[][] = Array.from({ length: bucketCount }, () => []);

  // Distribute elements into buckets
  for (const val of arr) {
    const idx = Math.min(
      Math.floor(((val - min) / range) * bucketCount),
      bucketCount - 1
    );
    buckets[idx].push(val);
  }

  // Sort each bucket (insertion sort is fine for small buckets)
  const result: number[] = [];
  for (const bucket of buckets) {
    bucket.sort((a, b) => a - b);
    result.push(...bucket);
  }

  return result;
}

console.log(bucketSort([0.42, 0.32, 0.23, 0.52, 0.25, 0.47, 0.51]));
// [0.23, 0.25, 0.32, 0.42, 0.47, 0.51, 0.52]
```

---

## Median of Two Sorted Arrays

```ts
// Binary search on the shorter array.
// Partition both arrays so left side has (n+m+1)/2 elements.
// Time: O(log(min(m,n))), Space: O(1)

function findMedianSortedArrays(nums1: number[], nums2: number[]): number {
  // Ensure nums1 is shorter
  if (nums1.length > nums2.length) return findMedianSortedArrays(nums2, nums1);

  const m = nums1.length, n = nums2.length;
  let lo = 0, hi = m;

  while (lo <= hi) {
    const i = lo + ((hi - lo) >> 1);        // partition index in nums1
    const j = ((m + n + 1) >> 1) - i;       // partition index in nums2

    const left1 = i === 0 ? -Infinity : nums1[i - 1];
    const right1 = i === m ? Infinity : nums1[i];
    const left2 = j === 0 ? -Infinity : nums2[j - 1];
    const right2 = j === n ? Infinity : nums2[j];

    if (left1 <= right2 && left2 <= right1) {
      // Found correct partition
      if ((m + n) % 2 === 1) return Math.max(left1, left2);
      return (Math.max(left1, left2) + Math.min(right1, right2)) / 2;
    } else if (left1 > right2) {
      hi = i - 1; // move left in nums1
    } else {
      lo = i + 1; // move right in nums1
    }
  }

  throw new Error('Input arrays not sorted');
}

console.log(findMedianSortedArrays([1, 3], [2]));       // 2
console.log(findMedianSortedArrays([1, 2], [3, 4]));    // 2.5
console.log(findMedianSortedArrays([0, 0], [0, 0]));    // 0
```

---

## Search a 2D Matrix

```ts
// Matrix: rows sorted, first element of each row > last of previous.
// Treat as a flat sorted array. Binary search with index mapping.
// Time: O(log(m*n))

function searchMatrix(matrix: number[][], target: number): boolean {
  const m = matrix.length, n = matrix[0].length;
  let lo = 0, hi = m * n - 1;

  while (lo <= hi) {
    const mid = lo + ((hi - lo) >> 1);
    const val = matrix[Math.floor(mid / n)][mid % n];

    if (val === target) return true;
    if (val < target) lo = mid + 1;
    else hi = mid - 1;
  }

  return false;
}

console.log(searchMatrix([[1,3,5,7],[10,11,16,20],[23,30,34,60]], 3));  // true
console.log(searchMatrix([[1,3,5,7],[10,11,16,20],[23,30,34,60]], 13)); // false
```

---

## Find Minimum in Rotated Sorted Array

```ts
// The minimum is the only element where arr[i] < arr[i-1].
// Binary search: if mid > right, min is in right half.
// Time: O(log n)

function findMin(nums: number[]): number {
  let lo = 0, hi = nums.length - 1;

  while (lo < hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (nums[mid] > nums[hi]) {
      lo = mid + 1; // min is in right half
    } else {
      hi = mid; // mid could be the min
    }
  }

  return nums[lo];
}

console.log(findMin([3, 4, 5, 1, 2]));    // 1
console.log(findMin([4, 5, 6, 7, 0, 1, 2])); // 0
console.log(findMin([11, 13, 15, 17]));    // 11
```

---

## Sort & Search Complexity Cheatsheet

```
Algorithm        Time (avg)    Time (worst)   Space    Stable?
--------------------------------------------------------------
Merge sort       O(n log n)    O(n log n)     O(n)     Yes
Quicksort        O(n log n)    O(n^2)         O(log n) No
Counting sort    O(n + k)      O(n + k)       O(k)     Yes
Bucket sort      O(n + k)      O(n^2)         O(n)     Yes*
Binary search    O(log n)      O(log n)       O(1)     N/A

Binary Search Variants:
  First occurrence    → when found, hi = mid - 1
  Last occurrence     → when found, lo = mid + 1
  Rotated array       → check which half is sorted
  Peak element        → compare mid with mid+1
  2D matrix           → flatten index: row = mid/n, col = mid%n
```
