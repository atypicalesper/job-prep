# DSA Cheatsheet

## Big-O Reference

```
O(1)       Constant    Hash map lookup, array access by index
O(log n)   Logarithmic Binary search, BST operations
O(n)       Linear      Single loop, linear search
O(n log n) Linearithmic Merge sort, heap sort, most efficient sorting
O(n²)      Quadratic   Nested loops, bubble/insertion/selection sort
O(2ⁿ)      Exponential Recursive subsets, brute-force combinations
O(n!)      Factorial   All permutations
```

## Space Complexity Gotchas

```
Recursion depth = O(n) stack space
Hash map with n entries = O(n) space
Output array = O(n) — often not counted in "extra" space
```

---

## Arrays

```js
// Two pointers — O(n)
function twoSum(arr, target) {
  let l = 0, r = arr.length - 1
  while (l < r) {
    const sum = arr[l] + arr[r]
    if (sum === target) return [l, r]
    sum < target ? l++ : r--
  }
}

// Sliding window — fixed size, O(n)
function maxSumSubarray(arr, k) {
  let sum = arr.slice(0, k).reduce((a, b) => a + b, 0)
  let max = sum
  for (let i = k; i < arr.length; i++) {
    sum += arr[i] - arr[i - k]
    max = Math.max(max, sum)
  }
  return max
}

// Sliding window — variable size, O(n)
function longestUniqueSubstr(s) {
  const seen = new Map()
  let l = 0, max = 0
  for (let r = 0; r < s.length; r++) {
    if (seen.has(s[r])) l = Math.max(l, seen.get(s[r]) + 1)
    seen.set(s[r], r)
    max = Math.max(max, r - l + 1)
  }
  return max
}

// Prefix sum — O(n) precompute, O(1) range query
function buildPrefix(arr) {
  const pre = [0]
  for (const n of arr) pre.push(pre.at(-1) + n)
  return pre
}
// sum(l, r) = pre[r+1] - pre[l]
```

---

## Linked List

```js
class ListNode { constructor(val, next = null) { this.val = val; this.next = next } }

// Reverse — O(n)
function reverse(head) {
  let prev = null, curr = head
  while (curr) {
    const next = curr.next
    curr.next = prev
    prev = curr
    curr = next
  }
  return prev
}

// Detect cycle — Floyd's
function hasCycle(head) {
  let slow = head, fast = head
  while (fast?.next) {
    slow = slow.next
    fast = fast.next.next
    if (slow === fast) return true
  }
  return false
}

// Find middle — slow/fast
function middle(head) {
  let slow = head, fast = head
  while (fast?.next) { slow = slow.next; fast = fast.next.next }
  return slow
}

// Merge two sorted lists
function mergeSorted(l1, l2) {
  const dummy = new ListNode(0)
  let cur = dummy
  while (l1 && l2) {
    if (l1.val <= l2.val) { cur.next = l1; l1 = l1.next }
    else { cur.next = l2; l2 = l2.next }
    cur = cur.next
  }
  cur.next = l1 ?? l2
  return dummy.next
}
```

---

## Stack & Queue

```js
// Stack (LIFO) — use array
const stack = []
stack.push(x)
stack.pop()
stack.at(-1)  // peek

// Queue (FIFO) — use array (shift is O(n)); use deque for O(1))
const queue = []
queue.push(x)
queue.shift()

// Monotonic stack — next greater element, O(n)
function nextGreater(arr) {
  const result = new Array(arr.length).fill(-1)
  const stack = []  // indices
  for (let i = 0; i < arr.length; i++) {
    while (stack.length && arr[i] > arr[stack.at(-1)]) {
      result[stack.pop()] = arr[i]
    }
    stack.push(i)
  }
  return result
}

// Valid parentheses
function isValid(s) {
  const map = { ')': '(', ']': '[', '}': '{' }
  const stack = []
  for (const c of s) {
    if ('([{'.includes(c)) stack.push(c)
    else if (stack.pop() !== map[c]) return false
  }
  return stack.length === 0
}
```

---

## Binary Search

```js
// Standard O(log n)
function binarySearch(arr, target) {
  let l = 0, r = arr.length - 1
  while (l <= r) {
    const mid = (l + r) >> 1
    if (arr[mid] === target) return mid
    arr[mid] < target ? l = mid + 1 : r = mid - 1
  }
  return -1
}

// Lower bound — first index where arr[i] >= target
function lowerBound(arr, target) {
  let l = 0, r = arr.length
  while (l < r) {
    const mid = (l + r) >> 1
    arr[mid] < target ? l = mid + 1 : r = mid
  }
  return l
}

// Search on answer — binary search the result space
function minDays(blooms, m, k) {
  let l = 1, r = Math.max(...blooms), ans = -1
  while (l <= r) {
    const mid = (l + r) >> 1
    if (canBloom(blooms, mid, m, k)) { ans = mid; r = mid - 1 }
    else l = mid + 1
  }
  return ans
}
```

---

## Trees

```js
class TreeNode { constructor(val, left=null, right=null) { this.val=val; this.left=left; this.right=right } }

// DFS traversals (recursive)
function inorder(root, res = []) {
  if (!root) return res
  inorder(root.left, res); res.push(root.val); inorder(root.right, res)
  return res
}
// Preorder: push → left → right
// Postorder: left → right → push

// DFS iterative (preorder)
function preorderIter(root) {
  const stack = [root], res = []
  while (stack.length) {
    const node = stack.pop()
    if (!node) continue
    res.push(node.val)
    stack.push(node.right, node.left)  // right first (LIFO)
  }
  return res
}

// BFS — level order
function levelOrder(root) {
  if (!root) return []
  const queue = [root], res = []
  while (queue.length) {
    const level = []
    for (let i = queue.length; i > 0; i--) {
      const node = queue.shift()
      level.push(node.val)
      if (node.left) queue.push(node.left)
      if (node.right) queue.push(node.right)
    }
    res.push(level)
  }
  return res
}

// Max depth
const maxDepth = (root) => root ? 1 + Math.max(maxDepth(root.left), maxDepth(root.right)) : 0

// BST: left < node < right
// Validate BST
function isValidBST(node, min = -Infinity, max = Infinity) {
  if (!node) return true
  if (node.val <= min || node.val >= max) return false
  return isValidBST(node.left, min, node.val) && isValidBST(node.right, node.val, max)
}
```

---

## Graph

```js
// Build adjacency list
function buildGraph(edges) {
  const graph = {}
  for (const [u, v] of edges) {
    ;(graph[u] ??= []).push(v)
    ;(graph[v] ??= []).push(u)   // undirected
  }
  return graph
}

// DFS (iterative)
function dfs(graph, start) {
  const visited = new Set(), stack = [start]
  while (stack.length) {
    const node = stack.pop()
    if (visited.has(node)) continue
    visited.add(node)
    for (const neighbor of graph[node] ?? []) stack.push(neighbor)
  }
  return visited
}

// BFS — shortest path (unweighted)
function bfs(graph, start, end) {
  const queue = [[start, 0]], visited = new Set([start])
  while (queue.length) {
    const [node, dist] = queue.shift()
    if (node === end) return dist
    for (const neighbor of graph[node] ?? []) {
      if (!visited.has(neighbor)) { visited.add(neighbor); queue.push([neighbor, dist + 1]) }
    }
  }
  return -1
}

// Topological sort (Kahn's BFS)
function topoSort(numNodes, edges) {
  const inDegree = new Array(numNodes).fill(0)
  const graph = Array.from({ length: numNodes }, () => [])
  for (const [u, v] of edges) { graph[u].push(v); inDegree[v]++ }
  const queue = inDegree.map((d, i) => d === 0 ? i : -1).filter(i => i >= 0)
  const order = []
  while (queue.length) {
    const node = queue.shift()
    order.push(node)
    for (const next of graph[node]) { if (--inDegree[next] === 0) queue.push(next) }
  }
  return order.length === numNodes ? order : []  // [] = cycle
}
```

---

## Dynamic Programming

```js
// Fibonacci (bottom-up)
function fib(n) {
  if (n <= 1) return n
  let [a, b] = [0, 1]
  for (let i = 2; i <= n; i++) [a, b] = [b, a + b]
  return b
}

// 0/1 Knapsack
function knapsack(weights, values, capacity) {
  const dp = new Array(capacity + 1).fill(0)
  for (let i = 0; i < weights.length; i++) {
    for (let w = capacity; w >= weights[i]; w--) {
      dp[w] = Math.max(dp[w], dp[w - weights[i]] + values[i])
    }
  }
  return dp[capacity]
}

// Longest Common Subsequence
function lcs(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1])
  return dp[a.length][b.length]
}

// Coin change (min coins)
function coinChange(coins, amount) {
  const dp = new Array(amount + 1).fill(Infinity)
  dp[0] = 0
  for (let i = 1; i <= amount; i++)
    for (const c of coins)
      if (c <= i) dp[i] = Math.min(dp[i], dp[i - c] + 1)
  return dp[amount] === Infinity ? -1 : dp[amount]
}
```

---

## Heap (Priority Queue)

```js
// Min-heap using sorted array (JS has no built-in heap)
// Use a library like 'heap-js' or implement:
class MinHeap {
  #h = []
  push(v) { this.#h.push(v); this.#up(this.#h.length - 1) }
  pop() {
    const top = this.#h[0]
    const last = this.#h.pop()
    if (this.#h.length) { this.#h[0] = last; this.#down(0) }
    return top
  }
  peek() { return this.#h[0] }
  get size() { return this.#h.length }
  #up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.#h[p] <= this.#h[i]) break
      ;[this.#h[p], this.#h[i]] = [this.#h[i], this.#h[p]]; i = p
    }
  }
  #down(i) {
    while (true) {
      let min = i, l = 2*i+1, r = 2*i+2
      if (l < this.#h.length && this.#h[l] < this.#h[min]) min = l
      if (r < this.#h.length && this.#h[r] < this.#h[min]) min = r
      if (min === i) break
      ;[this.#h[i], this.#h[min]] = [this.#h[min], this.#h[i]]; i = min
    }
  }
}
// Use for: k closest, top-k, merge k sorted lists, Dijkstra
```

---

## Common Patterns Summary

```
Two pointers          → sorted arrays, palindrome, sum problems
Sliding window        → subarray/substring problems
Fast/slow pointers    → cycle detection, middle of list
Binary search         → sorted input, search-on-answer
BFS                   → shortest path, level order
DFS + backtracking    → permutations, combinations, subsets
Monotonic stack       → next greater/smaller element
Prefix sum            → range sum queries
DP (bottom-up)        → optimal substructure, overlapping subproblems
Topological sort      → dependency ordering, cycle detection
```
