# Sorting Algorithms — Cheatsheet

Quick-reference for every sort you need to know, with complexities, stability, and when to use each.

---

## Complexity Summary

```
Algorithm       Best        Average     Worst       Space   Stable?
─────────────────────────────────────────────────────────────────────
Bubble Sort     O(n)        O(n²)       O(n²)       O(1)    Yes
Selection Sort  O(n²)       O(n²)       O(n²)       O(1)    No
Insertion Sort  O(n)        O(n²)       O(n²)       O(1)    Yes
Merge Sort      O(n log n)  O(n log n)  O(n log n)  O(n)    Yes
Quick Sort      O(n log n)  O(n log n)  O(n²)       O(log n) No
Heap Sort       O(n log n)  O(n log n)  O(n log n)  O(1)    No
Counting Sort   O(n + k)    O(n + k)    O(n + k)    O(k)    Yes
Radix Sort      O(nk)       O(nk)       O(nk)       O(n+k)  Yes
Bucket Sort     O(n + k)    O(n + k)    O(n²)       O(n)    Yes
Tim Sort        O(n)        O(n log n)  O(n log n)  O(n)    Yes
```

`k` = range of values (Counting/Radix/Bucket), `n` = input size.

---

## When to Use What

```
Situation                              Best Choice
──────────────────────────────────────────────────────────────────────
General purpose, built-in              Array.sort / TimSort
Guaranteed O(n log n), stable          Merge Sort
In-place, fast average case            Quick Sort
In-place, O(n log n) guaranteed        Heap Sort
Nearly sorted data                     Insertion Sort (adaptive)
Small arrays (< ~20 elements)          Insertion Sort
Integer keys in known range            Counting Sort
Multi-digit integers / strings         Radix Sort
Uniformly distributed floats [0, 1)   Bucket Sort
```

---

## Merge Sort

**Stable · O(n log n) all cases · O(n) space · Preferred for linked lists**

```js
function mergeSort(arr) {
  if (arr.length <= 1) return arr;
  const mid = Math.floor(arr.length / 2);
  return merge(mergeSort(arr.slice(0, mid)), mergeSort(arr.slice(mid)));
}

function merge(a, b) {
  const out = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length)
    out.push(a[i] <= b[j] ? a[i++] : b[j++]);  // <= keeps stability
  return out.concat(a.slice(i), b.slice(j));
}
```

---

## Quick Sort

**Not stable · O(n log n) avg · O(n²) worst (bad pivot) · In-place**

```js
function quickSort(arr, lo = 0, hi = arr.length - 1) {
  if (lo >= hi) return;
  const p = partition(arr, lo, hi);
  quickSort(arr, lo, p - 1);
  quickSort(arr, p + 1, hi);
}

function partition(arr, lo, hi) {
  const pivot = arr[hi];
  let i = lo;
  for (let j = lo; j < hi; j++)
    if (arr[j] <= pivot) [arr[i], arr[j]] = [arr[j], arr[i++]];
  [arr[i], arr[hi]] = [arr[hi], arr[i]];
  return i;
}
// Avoid O(n²) worst case: use median-of-3 pivot or random pivot
```

---

## Heap Sort

**Not stable · O(n log n) guaranteed · O(1) space**

```js
function heapSort(arr) {
  const n = arr.length;
  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) heapify(arr, n, i);
  for (let i = n - 1; i > 0; i--) {
    [arr[0], arr[i]] = [arr[i], arr[0]];
    heapify(arr, i, 0);
  }
}

function heapify(arr, n, i) {
  let largest = i, l = 2*i+1, r = 2*i+2;
  if (l < n && arr[l] > arr[largest]) largest = l;
  if (r < n && arr[r] > arr[largest]) largest = r;
  if (largest !== i) {
    [arr[i], arr[largest]] = [arr[largest], arr[i]];
    heapify(arr, n, largest);
  }
}
```

---

## Insertion Sort

**Stable · O(n) best · O(n²) worst · O(1) space · Great for small/nearly-sorted**

```js
function insertionSort(arr) {
  for (let i = 1; i < arr.length; i++) {
    const key = arr[i];
    let j = i - 1;
    while (j >= 0 && arr[j] > key) { arr[j + 1] = arr[j]; j--; }
    arr[j + 1] = key;
  }
  return arr;
}
```

---

## Counting Sort

**Stable · O(n + k) · O(k) space · Only for integers in known range [0, k)**

```js
function countingSort(arr, maxVal) {
  const count = new Array(maxVal + 1).fill(0);
  for (const x of arr) count[x]++;
  for (let i = 1; i <= maxVal; i++) count[i] += count[i - 1]; // prefix sum
  const out = new Array(arr.length);
  for (let i = arr.length - 1; i >= 0; i--)
    out[--count[arr[i]]] = arr[i];  // reverse for stability
  return out;
}
```

---

## Frequently Asked Algorithm Complexities

```
Operation / Algorithm                   Time            Space
────────────────────────────────────────────────────────────────
Binary Search (sorted array)            O(log n)        O(1)
BFS (V vertices, E edges)               O(V + E)        O(V)
DFS (V vertices, E edges)               O(V + E)        O(V)
Dijkstra (binary heap)                  O((V+E) log V)  O(V)
Dijkstra (Fibonacci heap)               O(E + V log V)  O(V)
Bellman-Ford                            O(VE)           O(V)
Floyd-Warshall (all-pairs shortest)     O(V³)           O(V²)
Kruskal MST (E edges)                   O(E log E)      O(V)
Prim MST (binary heap)                  O((V+E) log V)  O(V)
Topological Sort (Kahn / DFS)           O(V + E)        O(V)
Union-Find find / union (amortized)     O(α(n)) ≈ O(1)  O(n)
Knapsack 0/1 DP (n items, W capacity)  O(nW)           O(nW)
LCS (two strings m, n)                  O(mn)           O(mn)
LIS (patience sort)                     O(n log n)      O(n)
Edit Distance                           O(mn)           O(mn)
Matrix Chain Multiplication             O(n³)           O(n²)
Sieve of Eratosthenes (primes to n)     O(n log log n)  O(n)
GCD (Euclidean)                         O(log min(a,b)) O(1)
Power (fast exponentiation)             O(log n)        O(log n)
```

---

## Stability Matters When…

Two objects with equal keys must stay in their original relative order — e.g. sorting employees first by department (stable sort), then by name. An unstable sort would break the first sort.

```
Stable sorts:   Merge Sort, Insertion Sort, Bubble Sort, Counting Sort, Radix Sort, TimSort
Unstable sorts: Quick Sort, Heap Sort, Selection Sort
```

JavaScript's `Array.prototype.sort` is **guaranteed stable** since ES2019.

---

## Quick Interview Tips

```
"What's the best sorting algorithm?"
→ Depends. TimSort for general use. Merge Sort when stability + O(n log n) guaranteed.
  Quick Sort when in-place matters. Counting Sort when key range is small.

"Can we do better than O(n log n)?"
→ For comparison-based sorts: No. Lower bound is Ω(n log n).
  For integer keys with bounded range: Yes — Counting/Radix Sort bypass the bound.

"Quicksort vs Mergesort in practice?"
→ Quicksort wins on cache locality (in-place). Mergesort wins on stability and worst-case.
  Most standard libraries use TimSort (hybrid merge + insertion).
```
