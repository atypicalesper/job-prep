# Big-O Cheat Sheet

---

## Growth Order (fastest to slowest)

```
O(1) < O(log n) < O(√n) < O(n) < O(n log n) < O(n²) < O(2ⁿ) < O(n!)

Practical limits (operations per second ≈ 10⁸):
  n = 10⁶  → O(n) or O(n log n) is fine
  n = 10⁴  → O(n²) is acceptable (~10⁸ ops)
  n = 20   → O(2ⁿ) is OK (~10⁶ ops)
  n = 12   → O(n!) is OK
```

---

## Data Structures

```
Structure           Access   Search   Insert   Delete   Space   Notes
──────────────────────────────────────────────────────────────────────
Array               O(1)     O(n)     O(n)     O(n)     O(n)    O(1) at end
Dynamic Array       O(1)     O(n)     O(1)*    O(n)     O(n)    *amortized; O(n) worst
Linked List         O(n)     O(n)     O(1)†    O(1)†    O(n)    †given pointer to node
Doubly Linked List  O(n)     O(n)     O(1)†    O(1)†    O(n)    needed for LRU cache
Stack               O(n)     O(n)     O(1)     O(1)     O(n)    push/pop at top
Queue               O(n)     O(n)     O(1)     O(1)     O(n)    enqueue/dequeue
Deque               O(n)     O(n)     O(1)     O(1)     O(n)    both ends O(1)
Hash Table          –        O(1)*    O(1)*    O(1)*    O(n)    *avg; O(n) worst case
Set (Hash)          –        O(1)*    O(1)*    O(1)*    O(n)    *avg
Min/Max Heap        O(1)‡    O(n)     O(log n) O(log n) O(n)    ‡peek only
Binary Search Tree  O(log n) O(log n) O(log n) O(log n) O(n)    balanced (AVL/RB)
BST unbalanced      O(n)     O(n)     O(n)     O(n)     O(n)    worst case sorted input
Trie                –        O(m)     O(m)     O(m)     O(n·m)  m = key length
```

---

## Sorting Algorithms

```
Algorithm       Best        Average     Worst       Space   Stable  Notes
────────────────────────────────────────────────────────────────────────────
Bubble Sort     O(n)        O(n²)       O(n²)       O(1)    ✓       Never use
Selection Sort  O(n²)       O(n²)       O(n²)       O(1)    ✗
Insertion Sort  O(n)        O(n²)       O(n²)       O(1)    ✓       Good for small/nearly sorted
Quick Sort      O(n log n)  O(n log n)  O(n²)       O(log n)✗       Worst: sorted input; use random pivot
Merge Sort      O(n log n)  O(n log n)  O(n log n)  O(n)    ✓       Stable, predictable
Heap Sort       O(n log n)  O(n log n)  O(n log n)  O(1)    ✗       In-place, no recursion
Counting Sort   O(n+k)      O(n+k)      O(n+k)      O(k)    ✓       k = range of values
Radix Sort      O(nk)       O(nk)       O(nk)       O(n+k)  ✓       k = number of digits
Tim Sort        O(n)        O(n log n)  O(n log n)  O(n)    ✓       Used by JS/Python built-in
```

---

## Graph Algorithms

```
Algorithm           Time            Space   Use case
────────────────────────────────────────────────────────────────────
BFS                 O(V + E)        O(V)    Shortest path (unweighted), level order
DFS                 O(V + E)        O(V)    Cycle detection, topological sort, paths
Dijkstra            O((V+E) log V)  O(V)    Shortest path (weighted, non-negative)
Bellman-Ford        O(V·E)          O(V)    Shortest path (negative weights)
Floyd-Warshall      O(V³)           O(V²)   All-pairs shortest path
Topological Sort    O(V + E)        O(V)    DAG ordering (Kahn's or DFS)
Union-Find (DSU)    O(α(n)) ≈ O(1)  O(V)    Connectivity, cycle detection in undirected
Kruskal's MST       O(E log E)      O(V)    Minimum spanning tree (sort edges)
Prim's MST          O((V+E) log V)  O(V)    Minimum spanning tree (dense graphs)
```

---

## Common Patterns and Their Complexity

```
Pattern                     Time        Space   When to use
────────────────────────────────────────────────────────────────────────────
Binary Search               O(log n)    O(1)    Sorted array, answer search
Two Pointers                O(n)        O(1)    Sorted array, subarray problems
Sliding Window (fixed)      O(n)        O(1)    Max/min/sum in window of size k
Sliding Window (variable)   O(n)        O(k)    Longest/shortest satisfying condition
Prefix Sum                  O(n) build  O(n)    Range sum queries
Monotonic Stack             O(n)        O(n)    Next greater/smaller element
BFS (shortest path)         O(V+E)      O(V)    Minimum steps/distance
DFS + Backtracking          O(2ⁿ)       O(n)    All combinations/permutations
Memoization (top-down DP)   O(states)   O(states) Overlapping subproblems
Tabulation (bottom-up DP)   O(states)   O(states) Same, iterative
Heap (top-K)                O(n log k)  O(k)    K largest/smallest elements
```

---

## Space Complexity Gotchas

```javascript
// Recursion depth counts as stack space:
function dfs(node) {
  if (!node) return;
  dfs(node.left);   // each call adds to call stack
  dfs(node.right);
}
// O(h) space where h = tree height
// Balanced tree: O(log n), skewed tree: O(n)

// String/array operations create new objects:
const s2 = s1.slice(1);          // O(n) space — new string
const arr2 = arr.filter(x => x); // O(n) space — new array
const arr3 = [...arr];            // O(n) space — copy

// Memoization cache:
const memo = new Map();           // O(n) space for n unique states

// In-place algorithms use O(1) extra space:
// Two pointers on sorted array, bit manipulation, swap-based reversal
```

---

## Recurrence Relations (for recursion analysis)

```
T(n) = T(n/2) + O(1)          → O(log n)    — binary search
T(n) = T(n/2) + O(n)          → O(n)        — partition with linear work
T(n) = 2T(n/2) + O(n)         → O(n log n)  — merge sort
T(n) = 2T(n/2) + O(1)         → O(n)        — tree traversal
T(n) = T(n-1) + O(1)          → O(n)        — linear recursion
T(n) = T(n-1) + O(n)          → O(n²)       — bubble sort
T(n) = 2T(n-1) + O(1)         → O(2ⁿ)       — naive fibonacci
```
