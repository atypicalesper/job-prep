# DSA Big Tech Interview Roadmap

## What Big Tech Actually Tests

```
60–70%  →  Arrays + Trees + Graphs + DP
  20%   →  Stack / Heap / Hashing
  10%   →  Advanced math, Trie, Union-Find, Bit manipulation
```

Google, Meta, Amazon: 2 of 4 rounds are pure DSA. The bar is **not "did you know the algorithm"** — it's **"can you identify the pattern, explain trade-offs, and code it clean under 35 minutes"**.

---

## The 10 Core Topics (Priority Order)

### 🟢 1. Arrays & Strings — HIGHEST PRIORITY

Every interview starts here. Master these patterns cold.

| Pattern | Key Problems |
|---|---|
| Sliding Window | Longest substring without repeating chars, minimum window substring |
| Two Pointers | 3Sum, container with most water, trapping rain water |
| Prefix Sum | Subarray sum equals k, range sum query |
| Kadane's Algorithm | Maximum subarray, max product subarray |
| Interval Problems | Merge intervals, insert interval, meeting rooms II |

```python
# Sliding window template
def sliding_window(s):
    left = 0
    window = {}
    result = 0
    for right in range(len(s)):
        # expand window
        window[s[right]] = window.get(s[right], 0) + 1

        # shrink window when invalid
        while not valid(window):
            window[s[left]] -= 1
            if window[s[left]] == 0:
                del window[s[left]]
            left += 1

        result = max(result, right - left + 1)
    return result

# Prefix sum template
def prefix_sum(nums, target):
    prefix = {0: 1}
    total = count = 0
    for n in nums:
        total += n
        count += prefix.get(total - target, 0)
        prefix[total] = prefix.get(total, 0) + 1
    return count
```

**References:**
- [NeetCode Arrays & Hashing](https://neetcode.io/roadmap)
- [LeetCode Top Interview 150](https://leetcode.com/studyplan/top-interview-150/)

---

### 🟢 2. Hashing (HashMap / HashSet)

Critical for reducing O(n²) → O(n). Know the internals.

**HashMap internal:**
- Array of buckets, hash(key) % buckets determines slot
- Collision: chaining (linked list) or open addressing
- Load factor >0.75 → resize (double + rehash all keys)
- Java HashMap: amortized O(1) get/put, worst case O(n) with hash collisions

| Pattern | Problem |
|---|---|
| Frequency counting | Top K frequent elements, anagram detection |
| Two-sum pattern | Two sum, four sum |
| LRU Cache | HashMap + doubly linked list = O(1) get/put |
| Grouping | Group anagrams |

```python
# LRU Cache — the classic hashing interview problem
class LRUCache:
    def __init__(self, capacity):
        self.cap = capacity
        self.cache = {}  # key → node
        # Sentinel nodes (dummy head/tail)
        self.head = Node(0, 0)
        self.tail = Node(0, 0)
        self.head.next = self.tail
        self.tail.prev = self.head

    def get(self, key):
        if key in self.cache:
            self._remove(self.cache[key])
            self._insert(self.cache[key])
            return self.cache[key].val
        return -1

    def put(self, key, value):
        if key in self.cache:
            self._remove(self.cache[key])
        node = Node(key, value)
        self.cache[key] = node
        self._insert(node)
        if len(self.cache) > self.cap:
            lru = self.head.next
            self._remove(lru)
            del self.cache[lru.key]

    def _remove(self, node):
        node.prev.next = node.next
        node.next.prev = node.prev

    def _insert(self, node):  # insert before tail (MRU position)
        node.prev = self.tail.prev
        node.next = self.tail
        self.tail.prev.next = node
        self.tail.prev = node
```

---

### 🟢 3. Linked Lists — Pointer Manipulation

Big Tech loves these for testing pointer control.

| Pattern | Problem |
|---|---|
| Fast/slow pointer | Cycle detection, middle of list, nth from end |
| Reverse | Reverse entire list, reverse in k-groups |
| Merge | Merge two sorted lists, merge k sorted lists |
| Two pointer | Remove Nth node from end |

```python
# Floyd's cycle detection
def hasCycle(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow == fast:
            return True
    return False

# Reverse linked list — iterative (know this by heart)
def reverseList(head):
    prev = None
    curr = head
    while curr:
        nxt = curr.next
        curr.next = prev
        prev = curr
        curr = nxt
    return prev
```

---

### 🟡 4. Stack & Queue

```python
# Monotonic stack — next greater element pattern
def nextGreaterElement(nums):
    result = [-1] * len(nums)
    stack = []  # indices, maintain decreasing order
    for i, n in enumerate(nums):
        while stack and nums[stack[-1]] < n:
            result[stack.pop()] = n
        stack.append(i)
    return result

# Valid parentheses — most common
def isValid(s):
    stack = []
    mapping = {')': '(', '}': '{', ']': '['}
    for c in s:
        if c in mapping:
            if not stack or stack[-1] != mapping[c]:
                return False
            stack.pop()
        else:
            stack.append(c)
    return not stack
```

**Key problems:** Daily temperatures, largest rectangle in histogram, min stack, implement queue using stacks.

---

### 🟡 5. Trees — SUPER IMPORTANT

Tree questions decide FAANG selection.

```python
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val; self.left = left; self.right = right

# DFS templates — know all three traversals iteratively too
def inorder(root):    # left → root → right (BST: gives sorted order)
    return inorder(root.left) + [root.val] + inorder(root.right) if root else []

def preorder(root):   # root → left → right (copy tree, serialize)
    return [root.val] + preorder(root.left) + preorder(root.right) if root else []

def postorder(root):  # left → right → root (delete tree, evaluate expression)
    return postorder(root.left) + postorder(root.right) + [root.val] if root else []

# BFS — level order
from collections import deque
def levelOrder(root):
    if not root: return []
    q = deque([root])
    result = []
    while q:
        level = []
        for _ in range(len(q)):
            node = q.popleft()
            level.append(node.val)
            if node.left:  q.append(node.left)
            if node.right: q.append(node.right)
        result.append(level)
    return result

# Max depth
def maxDepth(root):
    if not root: return 0
    return 1 + max(maxDepth(root.left), maxDepth(root.right))

# Lowest Common Ancestor
def lowestCommonAncestor(root, p, q):
    if not root or root == p or root == q: return root
    left  = lowestCommonAncestor(root.left, p, q)
    right = lowestCommonAncestor(root.right, p, q)
    return root if left and right else left or right
```

**BST properties:**
```python
# Validate BST
def isValidBST(root, lo=float('-inf'), hi=float('inf')):
    if not root: return True
    if root.val <= lo or root.val >= hi: return False
    return (isValidBST(root.left, lo, root.val) and
            isValidBST(root.right, root.val, hi))
```

---

### 🟡 6. Heap / Priority Queue

```python
import heapq

# Python heapq is a MIN heap by default
# For max heap: negate values (-val)

# Top K frequent elements
from collections import Counter
def topKFrequent(nums, k):
    count = Counter(nums)
    return heapq.nlargest(k, count.keys(), key=count.get)

# Kth largest element
def findKthLargest(nums, k):
    heap = nums[:k]
    heapq.heapify(heap)  # min heap of size k
    for n in nums[k:]:
        if n > heap[0]:
            heapq.heapreplace(heap, n)
    return heap[0]

# Merge k sorted lists
def mergeKLists(lists):
    heap = []
    for i, node in enumerate(lists):
        if node: heapq.heappush(heap, (node.val, i, node))
    dummy = curr = TreeNode(0)
    while heap:
        val, i, node = heapq.heappop(heap)
        curr.next = node
        curr = curr.next
        if node.next: heapq.heappush(heap, (node.next.val, i, node.next))
    return dummy.next
```

---

### 🔴 7. Graphs

```python
from collections import deque

# BFS — shortest path in unweighted graph
def bfs(graph, start, end):
    visited = {start}
    queue = deque([(start, 0)])
    while queue:
        node, dist = queue.popleft()
        if node == end: return dist
        for neighbor in graph[node]:
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append((neighbor, dist + 1))
    return -1

# DFS — connected components, cycle detection
def dfs(graph, node, visited):
    visited.add(node)
    for neighbor in graph[node]:
        if neighbor not in visited:
            dfs(graph, neighbor, visited)

# Topological sort (Kahn's BFS)
def topologicalSort(numNodes, edges):
    graph = [[] for _ in range(numNodes)]
    in_degree = [0] * numNodes
    for u, v in edges:
        graph[u].append(v)
        in_degree[v] += 1
    queue = deque(i for i in range(numNodes) if in_degree[i] == 0)
    order = []
    while queue:
        node = queue.popleft()
        order.append(node)
        for neighbor in graph[node]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)
    return order if len(order) == numNodes else []  # empty = cycle exists

# Dijkstra's (shortest path, weighted)
def dijkstra(graph, start):
    dist = {start: 0}
    heap = [(0, start)]
    while heap:
        d, node = heapq.heappop(heap)
        if d > dist.get(node, float('inf')): continue
        for neighbor, weight in graph[node]:
            new_dist = d + weight
            if new_dist < dist.get(neighbor, float('inf')):
                dist[neighbor] = new_dist
                heapq.heappush(heap, (new_dist, neighbor))
    return dist
```

**Key problems:** Number of islands, word ladder, course schedule, Pacific Atlantic water flow, clone graph.

---

### 🔴 8. Dynamic Programming — The Hard Topic

Most candidates fail DP. Master these 5 patterns:

```python
# 1. Fibonacci / 1D DP
def climbStairs(n):
    if n <= 2: return n
    a, b = 1, 2
    for _ in range(3, n + 1):
        a, b = b, a + b
    return b

# 2. 0/1 Knapsack
def knapsack(weights, values, capacity):
    n = len(weights)
    dp = [[0] * (capacity + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        for w in range(capacity + 1):
            dp[i][w] = dp[i-1][w]
            if weights[i-1] <= w:
                dp[i][w] = max(dp[i][w], dp[i-1][w - weights[i-1]] + values[i-1])
    return dp[n][capacity]

# 3. LCS (Longest Common Subsequence)
def longestCommonSubsequence(s1, s2):
    m, n = len(s1), len(s2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if s1[i-1] == s2[j-1]:
                dp[i][j] = dp[i-1][j-1] + 1
            else:
                dp[i][j] = max(dp[i-1][j], dp[i][j-1])
    return dp[m][n]

# 4. Coin Change (unbounded knapsack)
def coinChange(coins, amount):
    dp = [float('inf')] * (amount + 1)
    dp[0] = 0
    for coin in coins:
        for i in range(coin, amount + 1):
            dp[i] = min(dp[i], dp[i - coin] + 1)
    return dp[amount] if dp[amount] != float('inf') else -1

# 5. Grid DP (unique paths)
def uniquePaths(m, n):
    dp = [[1] * n for _ in range(m)]
    for i in range(1, m):
        for j in range(1, n):
            dp[i][j] = dp[i-1][j] + dp[i][j-1]
    return dp[m-1][n-1]
```

**DP decision framework:**
1. Can the problem be broken into overlapping subproblems? → DP
2. Define state: `dp[i]` means what?
3. Write the recurrence relation
4. Base case
5. Optimize space if possible

---

### 🔴 9. Recursion & Backtracking

```python
# Subsets
def subsets(nums):
    result = [[]]
    for num in nums:
        result += [s + [num] for s in result]
    return result

# Permutations
def permute(nums):
    result = []
    def backtrack(path, remaining):
        if not remaining:
            result.append(path[:])
            return
        for i, num in enumerate(remaining):
            path.append(num)
            backtrack(path, remaining[:i] + remaining[i+1:])
            path.pop()
    backtrack([], nums)
    return result

# Combination Sum
def combinationSum(candidates, target):
    result = []
    def backtrack(start, path, remaining):
        if remaining == 0:
            result.append(path[:])
            return
        for i in range(start, len(candidates)):
            if candidates[i] > remaining: break
            path.append(candidates[i])
            backtrack(i, path, remaining - candidates[i])
            path.pop()
    candidates.sort()
    backtrack(0, [], target)
    return result

# N-Queens (classic)
def solveNQueens(n):
    result = []
    cols = set(); pos_diag = set(); neg_diag = set()
    board = [['.' ] * n for _ in range(n)]
    def backtrack(row):
        if row == n:
            result.append([''.join(r) for r in board])
            return
        for col in range(n):
            if col in cols or (row+col) in pos_diag or (row-col) in neg_diag:
                continue
            cols.add(col); pos_diag.add(row+col); neg_diag.add(row-col)
            board[row][col] = 'Q'
            backtrack(row + 1)
            cols.remove(col); pos_diag.remove(row+col); neg_diag.remove(row-col)
            board[row][col] = '.'
    backtrack(0)
    return result
```

---

### 🟣 10. Greedy & Binary Search

```python
# Binary search on answer — the high-ROI pattern
# "Minimum/maximum value that satisfies condition X"
def binarySearchOnAnswer(lo, hi, feasible):
    while lo < hi:
        mid = (lo + hi) // 2
        if feasible(mid):
            hi = mid        # or lo = mid + 1 for max problem
        else:
            lo = mid + 1
    return lo

# Example: Koko eating bananas
def minEatingSpeed(piles, h):
    def canFinish(speed):
        return sum(-(-p // speed) for p in piles) <= h  # ceiling division
    lo, hi = 1, max(piles)
    while lo < hi:
        mid = (lo + hi) // 2
        if canFinish(mid): hi = mid
        else: lo = mid + 1
    return lo

# Greedy: Activity selection / Interval scheduling
def eraseOverlapIntervals(intervals):
    intervals.sort(key=lambda x: x[1])  # sort by end time
    end = float('-inf')
    count = 0
    for start, finish in intervals:
        if start >= end:
            end = finish
        else:
            count += 1  # must remove this one
    return count
```

---

## The Golden Strategy: Pattern Recognition

Don't memorize problems — memorize patterns:

| Symptom | Pattern |
|---|---|
| "Find subarray / substring with condition" | Sliding window |
| "Two elements that sum to X" | Two pointers or hash map |
| "Optimize over sorted data" | Binary search |
| "Tree path problem" | DFS with return values |
| "Shortest path in graph" | BFS (unweighted) or Dijkstra (weighted) |
| "Dependency ordering" | Topological sort |
| "Overlapping subproblems" | DP |
| "All combinations / paths" | Backtracking |
| "Kth smallest/largest" | Heap |
| "Next greater/smaller element" | Monotonic stack |

---

## Minimal Winning Set (90% of Product Company Interviews)

Master these and you can clear **90%** of product company DSA rounds:

✅ Arrays & Strings (sliding window, two pointers, prefix sum)
✅ Hashing (freq count, two-sum pattern, LRU cache)
✅ Trees (DFS/BFS, LCA, diameter, validate BST)
✅ Graph (BFS/DFS, topological sort, cycle detection)
✅ DP (Fibonacci, knapsack, LCS, coin change)
✅ Binary Search (standard + binary search on answer)

---

## Study Plan

| Week | Focus | LeetCode Problems |
|---|---|---|
| 1 | Arrays, Hashing, Two Pointers | 20 |
| 2 | Sliding Window, Prefix Sum, Binary Search | 20 |
| 3 | Linked Lists, Stacks, Queues | 15 |
| 4 | Trees (BFS/DFS), Heaps | 20 |
| 5 | Graphs (BFS/DFS/Topological) | 15 |
| 6 | DP (1D → 2D → Knapsack) | 20 |
| 7 | Backtracking, Greedy | 15 |
| 8 | Mixed mock interviews | — |

---

## Links to Refer

- **NeetCode Roadmap** — [neetcode.io/roadmap](https://neetcode.io/roadmap) — Best structured path with video explanations
- **LeetCode Top Interview 150** — [leetcode.com/studyplan/top-interview-150](https://leetcode.com/studyplan/top-interview-150/)
- **LeetCode Blind 75** — [leetcode.com/discuss/general-discussion/460599](https://leetcode.com/discuss/general-discussion/460599/blind-75-leetcode-questions)
- **Tech Interview Handbook — Algorithm Cheatsheet** — [techinterviewhandbook.org/algorithms/study-cheatsheet](https://www.techinterviewhandbook.org/algorithms/study-cheatsheet/)
- **GeeksforGeeks Top 100 DSA** — [geeksforgeeks.org/top-100-data-structure-and-algorithms](https://www.geeksforgeeks.org/dsa/top-100-data-structure-and-algorithms-dsa-interview-questions-topic-wise/)
- **LeetCode Top 100 DSA Interview Questions (community)** — [leetcode.com/discuss/post/4258631](https://leetcode.com/discuss/post/4258631/Top-100-DSA-Interview-Questions/)
- **Reddit — Important DSA topics for product companies** — [reddit.com/r/developersIndia/comments/ws4y7t](https://www.reddit.com/r/developersIndia/comments/ws4y7t/what_are_the_important_topics_of_dsa_that/)
- **Pattern-based prep (LinkedIn)** — [Pattern-based DSA prep guide](https://www.linkedin.com/posts/riti2409_dsa-interviewpreparation-dsapatternssheet-activity-7373675568661319680-XplB)
- **Striver's A2Z Sheet** — [takeuforward.org/strivers-a2z-dsa-course](https://takeuforward.org/strivers-a2z-dsa-course/strivers-a2z-dsa-course-sheet-2/)
- **Codeforces (competitive practice)** — [codeforces.com](https://codeforces.com)
- **CSES Problem Set (Finland, very respected)** — [cses.fi/problemset](https://cses.fi/problemset/)
