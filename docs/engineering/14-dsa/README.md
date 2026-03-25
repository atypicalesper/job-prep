# DSA Interview Preparation

Patterns, implementations, and complexity references for coding interviews.
All code is TypeScript/JavaScript.

---

## Roadmap — 3 Phases

### Phase 1 — Foundation (Weeks 1–3)
Get these solid before anything else. Every harder problem builds on them.

| Topic | Goal |
|---|---|
| Big-O & complexity | Instantly classify any solution |
| Arrays & Strings | Two-pointer, prefix sum, sliding window |
| Hash Maps & Sets | Frequency count, anagram detection, grouping |
| Two Pointers | Sorted pairs, opposite ends, fast/slow |
| Stack & Queue | Monotonic stack, BFS queue, next greater |

**Done when:** You can solve Easy LeetCode problems in under 15 min without hints.

---

### Phase 2 — Core Patterns (Weeks 4–7)
The bulk of what interviewers actually test.

| Topic | Goal |
|---|---|
| Binary Search | Classic, rotated array, answer-space search |
| Linked Lists | Reverse, cycle, merge, nth from end |
| Trees & BST | DFS/BFS traversals, LCA, path sum, diameter |
| Heaps | K-largest, top-K, median stream |
| Backtracking | Permutations, combinations, subsets, N-Queens |
| Intervals | Merge, insert, non-overlapping, meeting rooms |
| Tries | Autocomplete, word search, prefix problems |

**Done when:** You can pattern-match Medium LeetCode in under 25 min.

---

### Phase 3 — Advanced (Weeks 8–12)
For competitive roles (FAANG / senior).

| Topic | Goal |
|---|---|
| Graphs | BFS/DFS, topological sort, union-find, Dijkstra |
| Dynamic Programming | 1D, 2D, knapsack, LCS, LIS, interval DP |
| Sorting & Searching | Merge sort variants, bucket sort, custom comparators |
| Bit Manipulation | Masks, XOR tricks, power of two |
| Math & Number Theory | GCD, modular arithmetic, prime sieve |

**Done when:** You can attempt Hard LeetCode and identify the approach within 5 min.

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
| 9 | Backtracking | Medium–Hard | `09-backtracking/` |
| 10 | Intervals | Medium | `10-intervals/` |
| 11 | Tries | Medium | `11-tries/` |
| 12 | Graphs | Medium–Hard | `12-graphs/` |
| 13 | Dynamic Programming | Hard | `13-dp/` |
| 14 | Sorting & Searching | Medium | `14-sorting/` |
| 15 | Bit Manipulation | Easy–Medium | `15-bit-manipulation/` |
| 16 | Math & Number Theory | Medium | `16-math/` |

---

## Must-Do Questions by Topic

★ = essential &nbsp; ★★ = very common &nbsp; ★★★ = classic, near-certain to appear

### Arrays & Strings
| Problem | Difficulty | Pattern |
|---|---|---|
| Two Sum | Easy ★★★ | Hash map |
| Best Time to Buy and Sell Stock | Easy ★★★ | Kadane variant |
| Contains Duplicate | Easy ★★ | Hash set |
| Product of Array Except Self | Medium ★★★ | Prefix / suffix |
| Maximum Subarray (Kadane's) | Medium ★★★ | DP / greedy |
| Maximum Product Subarray | Medium ★★ | DP |
| Find Minimum in Rotated Sorted Array | Medium ★★ | Binary search |
| Search in Rotated Sorted Array | Medium ★★ | Binary search |
| 3Sum | Medium ★★★ | Two pointers |
| Container With Most Water | Medium ★★★ | Two pointers |
| Rotate Array | Medium ★ | In-place |
| Longest Consecutive Sequence | Medium ★★ | Hash set |
| Trapping Rain Water | Hard ★★★ | Two pointers / prefix |

### Hash Maps & Sets
| Problem | Difficulty | Pattern |
|---|---|---|
| Valid Anagram | Easy ★★★ | Frequency map |
| Group Anagrams | Medium ★★★ | Sorted key grouping |
| Top K Frequent Elements | Medium ★★★ | Bucket sort / heap |
| Encode and Decode Strings | Medium ★★ | Custom delimiter |
| Longest Substring Without Repeating | Medium ★★★ | Sliding window |
| Subarray Sum Equals K | Medium ★★★ | Prefix sum + hash |
| LRU Cache | Medium ★★★ | HashMap + doubly linked list |

### Two Pointers & Sliding Window
| Problem | Difficulty | Pattern |
|---|---|---|
| Valid Palindrome | Easy ★★★ | Two pointers |
| Move Zeroes | Easy ★★ | Two pointers |
| Minimum Window Substring | Hard ★★★ | Sliding window |
| Longest Repeating Character Replacement | Medium ★★ | Sliding window |
| Permutation in String | Medium ★★ | Fixed sliding window |
| Fruit Into Baskets | Medium ★ | Variable sliding window |

### Stack & Queue
| Problem | Difficulty | Pattern |
|---|---|---|
| Valid Parentheses | Easy ★★★ | Stack |
| Min Stack | Medium ★★★ | Aux stack |
| Evaluate Reverse Polish Notation | Medium ★★ | Stack |
| Daily Temperatures | Medium ★★★ | Monotonic stack |
| Next Greater Element I | Easy ★★ | Monotonic stack |
| Largest Rectangle in Histogram | Hard ★★★ | Monotonic stack |
| Sliding Window Maximum | Hard ★★ | Monotonic deque |
| Implement Queue Using Stacks | Easy ★★ | Two stacks |

### Linked Lists
| Problem | Difficulty | Pattern |
|---|---|---|
| Reverse Linked List | Easy ★★★ | Iterative / recursive |
| Merge Two Sorted Lists | Easy ★★★ | Two pointer |
| Linked List Cycle | Easy ★★★ | Fast/slow pointer |
| Reorder List | Medium ★★★ | Find mid + reverse + merge |
| Remove Nth Node From End | Medium ★★★ | Two pointer gap |
| Copy List With Random Pointer | Medium ★★ | Hash map |
| Add Two Numbers | Medium ★★ | Carry |
| Find The Duplicate Number | Medium ★★ | Floyd's cycle detection |
| Merge K Sorted Lists | Hard ★★★ | Heap |
| Reverse Nodes in K-Group | Hard ★★ | Recursive |

### Binary Search
| Problem | Difficulty | Pattern |
|---|---|---|
| Binary Search | Easy ★★★ | Classic |
| Search a 2D Matrix | Medium ★★★ | Row + column binary search |
| Koko Eating Bananas | Medium ★★★ | Answer-space search |
| Find Minimum in Rotated Array | Medium ★★ | Binary search on condition |
| Time Based Key-Value Store | Medium ★★ | Binary search on sorted values |
| Median of Two Sorted Arrays | Hard ★★★ | Binary search on partition |

### Trees & BST
| Problem | Difficulty | Pattern |
|---|---|---|
| Invert Binary Tree | Easy ★★★ | DFS |
| Maximum Depth of Binary Tree | Easy ★★★ | DFS |
| Same Tree | Easy ★★ | DFS |
| Subtree of Another Tree | Easy ★★ | DFS |
| Symmetric Tree | Easy ★★ | DFS |
| Lowest Common Ancestor of BST | Medium ★★★ | BST property |
| Level Order Traversal | Medium ★★★ | BFS |
| Binary Tree Right Side View | Medium ★★ | BFS |
| Count Good Nodes | Medium ★★ | DFS + max tracking |
| Validate BST | Medium ★★★ | DFS with bounds |
| Kth Smallest in BST | Medium ★★ | Inorder |
| Construct Tree from Preorder + Inorder | Medium ★★★ | Recursion |
| Binary Tree Maximum Path Sum | Hard ★★★ | DFS |
| Serialize and Deserialize Binary Tree | Hard ★★★ | BFS / DFS |

### Heaps
| Problem | Difficulty | Pattern |
|---|---|---|
| Kth Largest Element in Array | Medium ★★★ | Min-heap of size K |
| K Closest Points to Origin | Medium ★★★ | Max-heap |
| Task Scheduler | Medium ★★ | Greedy + heap |
| Design Twitter | Medium ★★ | Heap + hash map |
| Find Median from Data Stream | Hard ★★★ | Two heaps (min + max) |

### Backtracking
| Problem | Difficulty | Pattern |
|---|---|---|
| Subsets | Medium ★★★ | Include / exclude |
| Subsets II (with duplicates) | Medium ★★ | Sort + skip |
| Permutations | Medium ★★★ | Swap / used[] |
| Combination Sum | Medium ★★★ | Include with repetition |
| Combination Sum II | Medium ★★ | Sort + skip duplicate |
| Word Search | Medium ★★★ | DFS on grid |
| Palindrome Partitioning | Medium ★★ | DFS + palindrome check |
| Letter Combinations of Phone Number | Medium ★★ | DFS |
| N-Queens | Hard ★★ | Row / col / diag tracking |

### Intervals
| Problem | Difficulty | Pattern |
|---|---|---|
| Meeting Rooms | Easy ★★★ | Sort by start |
| Merge Intervals | Medium ★★★ | Sort + greedy |
| Insert Interval | Medium ★★★ | Sweep |
| Non-Overlapping Intervals | Medium ★★★ | Greedy (min end) |
| Meeting Rooms II | Medium ★★★ | Heap / sweep line |
| Minimum Interval to Include Each Query | Hard ★★ | Sort + heap |

### Tries
| Problem | Difficulty | Pattern |
|---|---|---|
| Implement Trie (Prefix Tree) | Medium ★★★ | Node + children map |
| Design Add and Search Words | Medium ★★★ | Trie + DFS for wildcard |
| Word Search II | Hard ★★★ | Trie + DFS on board |
| Replace Words | Medium ★ | Trie lookup |
| Longest Word in Dictionary | Medium ★ | Trie traversal |

### Graphs
| Problem | Difficulty | Pattern |
|---|---|---|
| Number of Islands | Medium ★★★ | BFS / DFS grid |
| Clone Graph | Medium ★★★ | BFS + hash map |
| Pacific Atlantic Water Flow | Medium ★★ | Reverse DFS from edges |
| Course Schedule | Medium ★★★ | Topological sort (Kahn's) |
| Course Schedule II | Medium ★★★ | Topological sort with order |
| Number of Connected Components | Medium ★★ | Union-Find |
| Graph Valid Tree | Medium ★★ | Union-Find / DFS |
| Word Ladder | Hard ★★★ | BFS (shortest path) |
| Alien Dictionary | Hard ★★★ | Topological sort |
| Walls and Gates | Medium ★★ | Multi-source BFS |
| Rotting Oranges | Medium ★★ | Multi-source BFS |
| Redundant Connection | Medium ★★ | Union-Find |
| Network Delay Time | Medium ★★ | Dijkstra |
| Cheapest Flights K Stops | Medium ★★★ | Bellman-Ford / BFS |

### Dynamic Programming
| Problem | Difficulty | Pattern |
|---|---|---|
| Climbing Stairs | Easy ★★★ | 1D DP |
| House Robber | Medium ★★★ | 1D DP |
| House Robber II | Medium ★★ | Circular DP |
| Longest Palindromic Substring | Medium ★★★ | 2D DP / expand |
| Palindromic Substrings | Medium ★★ | Expand around center |
| Decode Ways | Medium ★★★ | 1D DP |
| Coin Change | Medium ★★★ | Unbounded knapsack |
| Maximum Product Subarray | Medium ★★ | DP with min/max |
| Word Break | Medium ★★★ | 1D DP + trie |
| Longest Increasing Subsequence | Medium ★★★ | DP / binary search |
| Unique Paths | Medium ★★★ | 2D grid DP |
| Jump Game | Medium ★★★ | Greedy |
| Jump Game II | Medium ★★ | Greedy |
| Partition Equal Subset Sum | Medium ★★★ | 0/1 Knapsack |
| Longest Common Subsequence | Medium ★★★ | 2D DP |
| Edit Distance | Hard ★★★ | 2D DP |
| Regular Expression Matching | Hard ★★ | 2D DP |
| Burst Balloons | Hard ★★ | Interval DP |
| Distinct Subsequences | Hard ★★ | 2D DP |

### Bit Manipulation
| Problem | Difficulty | Pattern |
|---|---|---|
| Number of 1 Bits | Easy ★★★ | n & (n-1) |
| Counting Bits | Easy ★★★ | DP with bit |
| Reverse Bits | Easy ★★ | Bit shifting |
| Missing Number | Easy ★★★ | XOR / Gauss |
| Single Number | Easy ★★★ | XOR |
| Sum of Two Integers | Medium ★★★ | Carry with AND/XOR |
| Reverse Integer | Medium ★★ | Overflow check |

---

## Directory Structure

```
dsa/
├── README.md                               ← this file (roadmap + must-do questions)
├── 00-complexity-reference/
│   └── 01-big-o-cheat-sheet.md
├── 01-arrays/
├── 02-hashmaps/
├── 03-two-pointers/
├── 04-stack-queue/
├── 05-linked-lists/
├── 06-binary-search/
├── 07-trees/
├── 08-heaps/
├── 09-backtracking/
├── 10-intervals/
├── 11-tries/
├── 12-graphs/
├── 13-dp/
├── 14-sorting/
├── 15-bit-manipulation/
└── 16-math/
```

---

## Complexity Reference

```
Structure           | Access | Search | Insert | Delete | Space
--------------------|--------|--------|--------|--------|------
Array               | O(1)   | O(n)   | O(n)   | O(n)   | O(n)
Dynamic Array       | O(1)   | O(n)   | O(1)*  | O(n)   | O(n)
Linked List         | O(n)   | O(n)   | O(1)   | O(1)   | O(n)
Hash Table          | -      | O(1)*  | O(1)*  | O(1)*  | O(n)
BST (balanced)      | O(logn)| O(logn)| O(logn)| O(logn)| O(n)
Heap (min/max)      | O(1)   | O(n)   | O(logn)| O(logn)| O(n)
Trie                | O(m)   | O(m)   | O(m)   | O(m)   | O(n·m)
Stack               | O(n)   | O(n)   | O(1)   | O(1)   | O(n)
Queue               | O(n)   | O(n)   | O(1)   | O(1)   | O(n)

* amortized / average case   m = key length

Algorithm           | Best      | Average     | Worst    | Space
--------------------|-----------|-------------|----------|-------
Quick Sort          | O(nlogn)  | O(nlogn)    | O(n²)    | O(logn)
Merge Sort          | O(nlogn)  | O(nlogn)    | O(nlogn) | O(n)
Heap Sort           | O(nlogn)  | O(nlogn)    | O(nlogn) | O(1)
Counting Sort       | O(n+k)    | O(n+k)      | O(n+k)   | O(k)
Binary Search       | O(1)      | O(logn)     | O(logn)  | O(1)
BFS / DFS           | O(V+E)    | O(V+E)      | O(V+E)   | O(V)
Dijkstra (min-heap) | -         | O((V+E)logV)| -        | O(V)
Bellman-Ford        | O(VE)     | O(VE)       | O(VE)    | O(V)
Topological Sort    | O(V+E)    | O(V+E)      | O(V+E)   | O(V)
```

---

## Pattern Recognition

```
Problem clue                          → Pattern to try
-----------------------------------------------------
Sorted array + target sum             → Two pointers
Subarray sum / length constraint      → Sliding window
Top K / K smallest / K largest        → Heap (priority queue)
Shortest path (unweighted)            → BFS
Shortest path (weighted)              → Dijkstra
All paths / connected components      → DFS / Union-Find
Overlapping subproblems               → DP (memoization first)
Balanced parentheses / next greater   → Monotonic stack
Level order / shortest in layers      → BFS with queue
Sorted + O(logn) required             → Binary search
Cycle in graph / linked list          → Fast/slow pointers (Floyd's)
Permutations / combinations / subsets → Backtracking
Prefix/suffix relationships           → Prefix sum array
Frequency counting                    → Hash map
Dependencies / ordering               → Topological sort
Word prefix / autocomplete            → Trie
Overlapping time intervals            → Sort by start + sweep
Matrix path problems                  → 2D DP or BFS
Interval DP (split sub-problems)      → dp[i][j] over ranges
```

---

## Interview Tips

1. **Talk before you type** — state your approach and complexity first
2. **Brute force first** — then optimize. Mention it even if you skip coding it.
3. **Test with small examples** — trace through `[1,2,3]` before edge cases
4. **Edge cases to always mention**: empty input, single element, all same, negative numbers, integer overflow
5. **If stuck**: try a specific example, look for the bottleneck operation, ask what data structure gives O(1) for it
6. **Time yourself**: Easy ≤15 min · Medium ≤25 min · Hard ≤40 min
7. **After solving**: state time/space complexity unprompted, then suggest possible optimizations

---

Good luck.
