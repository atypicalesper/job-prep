# Trees & Graphs — Interview Coding Challenges

## Core Tree Concepts

```
       1          ← root
      / \
     2   3
    / \   \
   4   5   6    ← leaves: 4, 5, 6
```

```js
class TreeNode {
  constructor(val, left = null, right = null) {
    this.val = val;
    this.left = left;
    this.right = right;
  }
}
```

---

## DFS Traversals (must know cold)

```js
// Inorder: Left → Root → Right (gives BST values in sorted order)
function inorder(node, result = []) {
  if (!node) return result;
  inorder(node.left, result);
  result.push(node.val);
  inorder(node.right, result);
  return result;
}

// Preorder: Root → Left → Right (serialize/clone tree)
function preorder(node, result = []) {
  if (!node) return result;
  result.push(node.val);
  preorder(node.left, result);
  preorder(node.right, result);
  return result;
}

// Postorder: Left → Right → Root (delete tree, evaluate expressions)
function postorder(node, result = []) {
  if (!node) return result;
  postorder(node.left, result);
  postorder(node.right, result);
  result.push(node.val);
  return result;
}

// Iterative inorder (avoids stack overflow on large trees)
function inorderIterative(root) {
  const result = [];
  const stack = [];
  let curr = root;

  while (curr || stack.length) {
    while (curr) { stack.push(curr); curr = curr.left; }
    curr = stack.pop();
    result.push(curr.val);
    curr = curr.right;
  }
  return result;
}
```

## BFS / Level-order

```js
function levelOrder(root) {
  if (!root) return [];
  const result = [];
  const queue = [root];

  while (queue.length) {
    const levelSize = queue.length;
    const level = [];
    for (let i = 0; i < levelSize; i++) {
      const node = queue.shift();
      level.push(node.val);
      if (node.left) queue.push(node.left);
      if (node.right) queue.push(node.right);
    }
    result.push(level);
  }
  return result;
}
// [[1],[2,3],[4,5,6]]
```

---

## Problem 1: Maximum Depth of Binary Tree (Easy)

```
Input: [3,9,20,null,null,15,7]
Output: 3
```

```js
function maxDepth(root) {
  if (!root) return 0;
  return 1 + Math.max(maxDepth(root.left), maxDepth(root.right));
}
// Time: O(n), Space: O(h) where h = height
```

---

## Problem 2: Validate BST (Medium)

A BST where every left node < root < every right node — not just direct children.

```js
// Wrong approach: just compare node.left.val < node.val
// Fails for:    5
//             /
//            6   ← 6 > 5 but it's in the left subtree!

// Correct: pass min/max bounds down
function isValidBST(root, min = -Infinity, max = Infinity) {
  if (!root) return true;
  if (root.val <= min || root.val >= max) return false;
  return (
    isValidBST(root.left, min, root.val) &&
    isValidBST(root.right, root.val, max)
  );
}
```

---

## Problem 3: Lowest Common Ancestor (Medium)

```
       6
      / \
     2   8
    / \ / \
   0  4 7  9
     / \
    3   5

LCA(2, 8) = 6
LCA(2, 4) = 2
```

```js
function lowestCommonAncestor(root, p, q) {
  if (!root || root === p || root === q) return root;

  const left = lowestCommonAncestor(root.left, p, q);
  const right = lowestCommonAncestor(root.right, p, q);

  // If both sides found something, current node is LCA
  if (left && right) return root;
  return left || right;
}
// Time: O(n), Space: O(h)
```

---

## Problem 4: Binary Tree Right Side View (Medium)

```
Input: [1,2,3,null,5,null,4]
Output: [1, 3, 4]  ← rightmost node at each level
```

```js
function rightSideView(root) {
  if (!root) return [];
  const result = [];
  const queue = [root];

  while (queue.length) {
    const size = queue.length;
    for (let i = 0; i < size; i++) {
      const node = queue.shift();
      if (i === size - 1) result.push(node.val); // last in level
      if (node.left) queue.push(node.left);
      if (node.right) queue.push(node.right);
    }
  }
  return result;
}
```

---

## Problem 5: Serialize / Deserialize Binary Tree (Hard)

```js
// Preorder with null markers
function serialize(root) {
  if (!root) return 'null';
  return `${root.val},${serialize(root.left)},${serialize(root.right)}`;
}

function deserialize(data) {
  const nodes = data.split(',');
  let i = 0;

  function build() {
    if (nodes[i] === 'null') { i++; return null; }
    const node = new TreeNode(parseInt(nodes[i++]));
    node.left = build();
    node.right = build();
    return node;
  }

  return build();
}
```

---

## Problem 6: Path Sum II (Medium)

Find all root-to-leaf paths that sum to target.

```js
function pathSum(root, target) {
  const result = [];

  function dfs(node, remaining, path) {
    if (!node) return;
    path.push(node.val);
    if (!node.left && !node.right && remaining === node.val) {
      result.push([...path]);  // copy — don't push reference
    }
    dfs(node.left, remaining - node.val, path);
    dfs(node.right, remaining - node.val, path);
    path.pop(); // backtrack
  }

  dfs(root, target, []);
  return result;
}
```

---

## Graphs

### Representations

```js
// Adjacency list (most common in interviews)
const graph = {
  A: ['B', 'C'],
  B: ['A', 'D'],
  C: ['A', 'D'],
  D: ['B', 'C'],
};

// For weighted graphs
const weighted = {
  A: [{ node: 'B', weight: 4 }, { node: 'C', weight: 2 }],
};

// Edge list → adjacency list
function buildGraph(edges) {
  const g = new Map();
  for (const [u, v] of edges) {
    if (!g.has(u)) g.set(u, []);
    if (!g.has(v)) g.set(v, []);
    g.get(u).push(v);
    g.get(v).push(u); // omit for directed graph
  }
  return g;
}
```

### Graph DFS

```js
function dfs(graph, start) {
  const visited = new Set();
  const result = [];

  function visit(node) {
    if (visited.has(node)) return;
    visited.add(node);
    result.push(node);
    for (const neighbor of graph[node] || []) {
      visit(neighbor);
    }
  }

  visit(start);
  return result;
}
```

### Graph BFS

```js
function bfs(graph, start) {
  const visited = new Set([start]);
  const queue = [start];
  const result = [];

  while (queue.length) {
    const node = queue.shift();
    result.push(node);
    for (const neighbor of graph[node] || []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return result;
}
```

---

## Problem 7: Number of Islands (Medium)

```
Input:
11110
11010
11000
00000
Output: 1
```

```js
function numIslands(grid) {
  let count = 0;

  function sink(r, c) {
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return;
    if (grid[r][c] !== '1') return;
    grid[r][c] = '0'; // mark visited by sinking
    sink(r + 1, c);
    sink(r - 1, c);
    sink(r, c + 1);
    sink(r, c - 1);
  }

  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[0].length; c++) {
      if (grid[r][c] === '1') {
        count++;
        sink(r, c); // flood fill
      }
    }
  }
  return count;
}
// Time: O(m*n), Space: O(m*n) recursion stack
```

---

## Problem 8: Course Schedule — Cycle Detection (Medium)

Can you finish all courses? (directed graph cycle detection)

```js
function canFinish(numCourses, prerequisites) {
  const graph = Array.from({ length: numCourses }, () => []);
  for (const [course, pre] of prerequisites) {
    graph[pre].push(course);
  }

  // 0 = unvisited, 1 = in progress (cycle!), 2 = done
  const state = new Array(numCourses).fill(0);

  function hasCycle(node) {
    if (state[node] === 1) return true;  // back edge = cycle
    if (state[node] === 2) return false; // already processed

    state[node] = 1;
    for (const neighbor of graph[node]) {
      if (hasCycle(neighbor)) return true;
    }
    state[node] = 2;
    return false;
  }

  for (let i = 0; i < numCourses; i++) {
    if (hasCycle(i)) return false;
  }
  return true;
}
```

---

## Problem 9: Shortest Path — BFS (unweighted)

```js
function shortestPath(graph, start, end) {
  if (start === end) return 0;
  const visited = new Set([start]);
  const queue = [[start, 0]]; // [node, distance]

  while (queue.length) {
    const [node, dist] = queue.shift();
    for (const neighbor of graph[node] || []) {
      if (neighbor === end) return dist + 1;
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([neighbor, dist + 1]);
      }
    }
  }
  return -1; // unreachable
}
```

---

## Problem 10: Word Ladder (Hard)

Transform "hit" → "cog" changing one letter at a time, using wordList.

```js
function ladderLength(beginWord, endWord, wordList) {
  const wordSet = new Set(wordList);
  if (!wordSet.has(endWord)) return 0;

  const queue = [[beginWord, 1]];
  const visited = new Set([beginWord]);

  while (queue.length) {
    const [word, steps] = queue.shift();

    for (let i = 0; i < word.length; i++) {
      for (let c = 97; c <= 122; c++) { // 'a' to 'z'
        const next = word.slice(0, i) + String.fromCharCode(c) + word.slice(i + 1);
        if (next === endWord) return steps + 1;
        if (wordSet.has(next) && !visited.has(next)) {
          visited.add(next);
          queue.push([next, steps + 1]);
        }
      }
    }
  }
  return 0;
}
// Time: O(M^2 * N) where M = word length, N = word list size
```

---

## Problem 11: Clone Graph (Medium)

```js
function cloneGraph(node) {
  if (!node) return null;
  const visited = new Map(); // original → clone

  function clone(n) {
    if (visited.has(n)) return visited.get(n);
    const copy = { val: n.val, neighbors: [] };
    visited.set(n, copy);
    for (const neighbor of n.neighbors) {
      copy.neighbors.push(clone(neighbor));
    }
    return copy;
  }

  return clone(node);
}
```

---

## Union-Find (Disjoint Set Union)

Essential for connectivity problems.

```js
class UnionFind {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
    this.components = n;
  }

  find(x) {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]); // path compression
    }
    return this.parent[x];
  }

  union(x, y) {
    const px = this.find(x);
    const py = this.find(y);
    if (px === py) return false; // already same component
    // union by rank
    if (this.rank[px] < this.rank[py]) this.parent[px] = py;
    else if (this.rank[px] > this.rank[py]) this.parent[py] = px;
    else { this.parent[py] = px; this.rank[px]++; }
    this.components--;
    return true;
  }

  connected(x, y) { return this.find(x) === this.find(y); }
}

// Usage: count connected components
function countComponents(n, edges) {
  const uf = new UnionFind(n);
  for (const [u, v] of edges) uf.union(u, v);
  return uf.components;
}
```

---

## Problem 12: Dijkstra's Shortest Path (Weighted Graph)

```js
function dijkstra(graph, start) {
  // graph: Map<node, [{node, weight}]>
  const dist = new Map();
  const visited = new Set();

  for (const node of graph.keys()) dist.set(node, Infinity);
  dist.set(start, 0);

  // Min-heap simulation with sorted array (interview simplification)
  // In production use a proper heap library
  const pq = [[0, start]]; // [distance, node]

  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0]); // O(n log n) — use real heap for O(log n)
    const [d, node] = pq.shift();

    if (visited.has(node)) continue;
    visited.add(node);

    for (const { node: neighbor, weight } of graph.get(node) || []) {
      const newDist = d + weight;
      if (newDist < dist.get(neighbor)) {
        dist.set(neighbor, newDist);
        pq.push([newDist, neighbor]);
      }
    }
  }

  return dist;
}
```

---

## Quick Reference

| Problem type | Algorithm | Time |
|---|---|---|
| Shortest path (unweighted) | BFS | O(V+E) |
| Shortest path (weighted) | Dijkstra | O((V+E) log V) |
| Detect cycle (undirected) | DFS / Union-Find | O(V+E) |
| Detect cycle (directed) | DFS with color | O(V+E) |
| Topological sort | DFS postorder / Kahn's BFS | O(V+E) |
| Connected components | BFS/DFS or Union-Find | O(V+E) |
| BST operations | DFS with bounds | O(h) |
| Level order | BFS | O(n) |
