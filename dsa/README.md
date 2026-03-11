# DSA Interview Preparation

Patterns, implementations, and complexity references for coding interviews.
All code is TypeScript/JavaScript.

---

## Study Order

Work topics in this order — each builds on the previous.

| # | Topic | Difficulty | Files |
|---|-------|-----------|-------|
| 1 | Arrays & Strings | Easy–Medium | `01-arrays/` |
| 2 | Hash Maps & Sets | Easy–Medium | `02-hashmaps/` |
| 3 | Two Pointers & Sliding Window | Medium | `03-two-pointers/` |
| 4 | Stack & Queue | Medium | `04-stack-queue/` |
| 5 | Linked Lists | Medium | `05-linked-lists/` |
| 6 | Binary Search | Medium | `06-binary-search/` |
| 7 | Trees & BST | Medium–Hard | `07-trees/` |
| 8 | Heaps & Priority Queue | Medium | `08-heaps/` |
| 9 | Graphs | Medium–Hard | `09-graphs/` |
| 10 | Dynamic Programming | Hard | `10-dp/` |
| 11 | Sorting & Searching | Medium | `11-sorting/` |
| 12 | Bit Manipulation | Easy–Medium | `12-bit-manipulation/` |

---

## Directory Structure

```
dsa/
├── README.md                          ← this file
├── 00-complexity-reference/
│   └── 01-big-o-cheat-sheet.md        (time/space for all structures + patterns)
├── 01-arrays/
│   └── 01-array-patterns.md           (rotation, prefix sum, kadane's algorithm)
├── 02-hashmaps/
│   └── 01-hashmap-patterns.md         (frequency count, anagrams, grouping)
├── 03-two-pointers/
│   └── 01-two-pointers-patterns.md    (sorted pairs, sliding window, fast/slow)
├── 04-stack-queue/
│   └── 01-stack-queue-patterns.md     (monotonic stack, next greater, BFS queue)
├── 05-linked-lists/
│   └── 01-linked-list-patterns.md     (reverse, cycle detection, merge, nth from end)
├── 06-binary-search/
│   └── 01-binary-search-patterns.md  (classic, rotated, answer search)
├── 07-trees/
│   ├── 01-tree-traversals.md          (DFS: inorder/preorder/postorder, BFS level order)
│   └── 02-tree-problems.md            (LCA, diameter, path sum, serialize)
├── 08-heaps/
│   └── 01-heap-patterns.md            (K largest, merge K lists, median stream)
├── 09-graphs/
│   ├── 01-graph-traversals.md         (BFS, DFS, topological sort, cycle detection)
│   └── 02-graph-algorithms.md         (Dijkstra, union-find, Kruskal, Prim)
├── 10-dp/
│   ├── 01-dp-fundamentals.md          (memoization vs tabulation, state design)
│   ├── 02-classic-dp.md               (coin change, knapsack, LCS, LIS)
│   └── 03-2d-dp.md                    (grid paths, edit distance, matrix chain)
├── 11-sorting/
│   └── 01-sorting-algorithms.md       (quicksort, mergesort, heapsort, counting sort)
└── 12-bit-manipulation/
    └── 01-bit-patterns.md             (AND/OR/XOR tricks, power of 2, Brian Kernighan)
```

---

## Complexity Quick Reference

```
Data Structure      | Access | Search | Insert | Delete | Space
--------------------|--------|--------|--------|--------|------
Array               | O(1)   | O(n)   | O(n)   | O(n)   | O(n)
Dynamic Array       | O(1)   | O(n)   | O(1)*  | O(n)   | O(n)
Linked List         | O(n)   | O(n)   | O(1)   | O(1)   | O(n)
Hash Table          | -      | O(1)*  | O(1)*  | O(1)*  | O(n)
BST (balanced)      | O(logn)| O(logn)| O(logn)| O(logn)| O(n)
Heap (min/max)      | O(1)   | O(n)   | O(logn)| O(logn)| O(n)
Stack               | O(n)   | O(n)   | O(1)   | O(1)   | O(n)
Queue               | O(n)   | O(n)   | O(1)   | O(1)   | O(n)

* amortized / average case

Algorithm           | Best   | Average | Worst  | Space
--------------------|--------|---------|--------|------
Quick Sort          | O(nlogn)| O(nlogn)| O(n²) | O(logn)
Merge Sort          | O(nlogn)| O(nlogn)| O(nlogn)| O(n)
Heap Sort           | O(nlogn)| O(nlogn)| O(nlogn)| O(1)
Counting Sort       | O(n+k) | O(n+k)  | O(n+k) | O(k)
Binary Search       | O(1)   | O(logn) | O(logn)| O(1)
BFS / DFS           | O(V+E) | O(V+E)  | O(V+E) | O(V)
Dijkstra (min-heap) | -      | O((V+E)logV)|-    | O(V)
```

---

## Pattern Recognition

```
Problem clue                          → Pattern to try
-----------------------------------------------------
Sorted array + target sum             → Two pointers
Subarray sum / length constraint      → Sliding window
Top K / K smallest / K largest        → Heap (priority queue)
Shortest path unweighted              → BFS
Shortest path weighted                → Dijkstra
All paths / connectivity              → DFS / Union-Find
Overlapping subproblems               → DP (memoization first)
Balanced parentheses / next greater   → Stack
Level order / by layer                → BFS with queue
Sorted + O(logn) required             → Binary search
Cycle in graph/linked list            → Fast/slow pointers (Floyd's)
Permutations / combinations           → Backtracking
Prefix/suffix relationships           → Prefix sum array
Frequency counting                    → Hash map
Dependencies / ordering               → Topological sort
```

---

## Interview Tips for Coding Rounds

1. **Talk before you type** — state your approach and complexity first
2. **Brute force first** — then optimize. Mention the brute force even if you skip it.
3. **Test with small examples** — trace through `[1,2,3]` before edge cases
4. **Edge cases to always mention**: empty input, single element, all same, negative numbers, overflow
5. **If stuck**: try a specific example, look for patterns, consider what data structure gives O(1) for the bottleneck operation
6. **Time yourself**: easy ≤15min, medium ≤25min, hard ≤40min

---

Good luck!
