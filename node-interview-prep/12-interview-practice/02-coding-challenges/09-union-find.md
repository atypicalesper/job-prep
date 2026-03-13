# Union-Find (Disjoint Set Union)

Union-Find tracks a partition of elements into disjoint sets. Supports two operations in near-O(1) amortized time:
- **find(x)** — which set does x belong to? (returns the root/representative)
- **union(x, y)** — merge the sets containing x and y

Two optimizations make it nearly O(1):
1. **Path compression** — flatten the tree during `find`
2. **Union by rank/size** — always attach smaller tree under larger

---

## Implementation

```ts
class UnionFind {
  private parent: number[];
  private rank: number[];
  public components: number;

  constructor(n: number) {
    this.parent = Array.from({length: n}, (_, i) => i); // each node is its own parent
    this.rank = new Array(n).fill(0);
    this.components = n;
  }

  find(x: number): number {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]); // path compression
    }
    return this.parent[x];
  }

  union(x: number, y: number): boolean {
    const px = this.find(x), py = this.find(y);
    if (px === py) return false; // already connected

    // Union by rank: attach smaller tree under larger
    if (this.rank[px] < this.rank[py]) {
      this.parent[px] = py;
    } else if (this.rank[px] > this.rank[py]) {
      this.parent[py] = px;
    } else {
      this.parent[py] = px;
      this.rank[px]++;
    }
    this.components--;
    return true;
  }

  connected(x: number, y: number): boolean {
    return this.find(x) === this.find(y);
  }
}

const uf = new UnionFind(5); // 0..4
uf.union(0, 1);
uf.union(1, 2);
console.log(uf.connected(0, 2)); // true
console.log(uf.connected(0, 3)); // false
console.log(uf.components);      // 3 (groups: {0,1,2}, {3}, {4})
```

**Complexity:** O(α(n)) per operation — α is the inverse Ackermann function, effectively constant.

---

## Problem 1: Number of Connected Components

```ts
function countComponents(n: number, edges: number[][]): number {
  const uf = new UnionFind(n);
  for (const [a, b] of edges) uf.union(a, b);
  return uf.components;
}

console.log(countComponents(5, [[0,1],[1,2],[3,4]])); // 2
console.log(countComponents(5, [[0,1],[1,2],[2,3],[3,4]])); // 1
```

---

## Problem 2: Redundant Connection (detect cycle)

```ts
// Given a tree + 1 extra edge, return the edge that causes a cycle
function findRedundantConnection(edges: number[][]): number[] {
  const n = edges.length;
  const uf = new UnionFind(n + 1); // nodes are 1-indexed

  for (const [a, b] of edges) {
    if (!uf.union(a, b)) return [a, b]; // already connected → this edge is redundant
  }
  return [];
}

console.log(findRedundantConnection([[1,2],[1,3],[2,3]])); // [2,3]
console.log(findRedundantConnection([[1,2],[2,3],[3,4],[1,4],[1,5]])); // [1,4]
```

---

## Problem 3: Number of Islands (DSU approach)

```ts
function numIslands(grid: string[][]): number {
  const rows = grid.length, cols = grid[0].length;
  let water = 0;

  // Count water cells upfront (they don't participate)
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (grid[r][c] === '0') water++;

  const uf = new UnionFind(rows * cols);
  const idx = (r: number, c: number) => r * cols + c;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] === '0') continue;
      // Connect with right and down neighbours (avoids double-processing)
      if (r + 1 < rows && grid[r+1][c] === '1') uf.union(idx(r,c), idx(r+1,c));
      if (c + 1 < cols && grid[r][c+1] === '1') uf.union(idx(r,c), idx(r,c+1));
    }
  }

  return uf.components - water;
}
```

---

## Problem 4: Accounts Merge

```ts
// Each account is [name, email1, email2, ...]. Merge accounts sharing an email.
function accountsMerge(accounts: string[][]): string[][] {
  const emailToId = new Map<string, number>();
  const emailToName = new Map<string, string>();
  let id = 0;

  for (const account of accounts) {
    const name = account[0];
    for (let i = 1; i < account.length; i++) {
      const email = account[i];
      if (!emailToId.has(email)) {
        emailToId.set(email, id++);
        emailToName.set(email, name);
      }
    }
  }

  const uf = new UnionFind(id);

  // Union all emails within the same account
  for (const account of accounts) {
    const firstId = emailToId.get(account[1])!;
    for (let i = 2; i < account.length; i++) {
      uf.union(firstId, emailToId.get(account[i])!);
    }
  }

  // Group emails by their root representative
  const groups = new Map<number, string[]>();
  for (const [email, eid] of emailToId) {
    const root = uf.find(eid);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(email);
  }

  return [...groups.values()].map(emails => {
    emails.sort();
    return [emailToName.get(emails[0])!, ...emails];
  });
}
```

---

## Problem 5: Minimum Spanning Tree (Kruskal's)

```ts
// Kruskal's: sort edges by weight, greedily add if no cycle
function kruskalMST(n: number, edges: [number, number, number][]): number {
  // edges: [u, v, weight]
  edges.sort((a, b) => a[2] - b[2]); // sort by weight ascending
  const uf = new UnionFind(n);
  let totalWeight = 0;
  let edgesUsed = 0;

  for (const [u, v, w] of edges) {
    if (uf.union(u, v)) { // no cycle formed
      totalWeight += w;
      edgesUsed++;
      if (edgesUsed === n - 1) break; // MST has n-1 edges
    }
  }

  return edgesUsed === n - 1 ? totalWeight : -1; // -1 if disconnected graph
}

console.log(kruskalMST(4, [[0,1,1],[0,2,4],[1,2,2],[1,3,5],[2,3,1]])); // 4
```

---

## Problem 6: Satisfiability of Equality Equations

```ts
// a==b and a!=b constraints — are they satisfiable?
function equationsPossible(equations: string[]): boolean {
  const uf = new UnionFind(26);
  const idx = (ch: string) => ch.charCodeAt(0) - 97;

  // First pass: process all == equations
  for (const eq of equations) {
    if (eq[1] === '=') {
      uf.union(idx(eq[0]), idx(eq[3]));
    }
  }

  // Second pass: check != equations don't contradict
  for (const eq of equations) {
    if (eq[1] === '!') {
      if (uf.connected(idx(eq[0]), idx(eq[3]))) return false;
    }
  }
  return true;
}

console.log(equationsPossible(['a==b','b!=c','b==c'])); // false
console.log(equationsPossible(['c==c','b==d','x!=z'])); // true
```

---

## Problem 7: Swim in Rising Water

```ts
// Grid where grid[i][j] = elevation. Find min time to swim from (0,0) to (n-1,n-1).
// Time t: can swim through any cell with elevation <= t.
function swimInWater(grid: number[][]): number {
  const n = grid.length;
  const uf = new UnionFind(n * n);
  const idx = (r: number, c: number) => r * n + c;
  const dirs = [[0,1],[0,-1],[1,0],[-1,0]];

  // Create (elevation, row, col) triples sorted by elevation
  const cells: [number, number, number][] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      cells.push([grid[r][c], r, c]);
  cells.sort((a, b) => a[0] - b[0]);

  const visited = new Array(n * n).fill(false);

  for (const [elev, r, c] of cells) {
    visited[idx(r, c)] = true;
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < n && nc >= 0 && nc < n && visited[idx(nr, nc)]) {
        uf.union(idx(r, c), idx(nr, nc));
      }
    }
    if (uf.connected(0, n * n - 1)) return elev;
  }
  return -1;
}
```

---

## When to Use DSU vs BFS/DFS

| Scenario | Prefer |
|---|---|
| One-time connectivity query | BFS/DFS |
| Dynamic connectivity (edges added over time) | DSU |
| Cycle detection in undirected graph | DSU |
| MST (Kruskal's) | DSU |
| Merging groups/accounts | DSU |
| Detecting back-edges in directed graph | DFS with colors |

## Common Mistakes

1. **Not initializing parent[i] = i** — self-referential parent is the base case
2. **Forgetting path compression** — without it, chains degrade to O(n)
3. **Decrementing components too eagerly** — only decrement when roots differ
4. **0 vs 1-indexed nodes** — LeetCode problems are often 1-indexed; use `UnionFind(n+1)`
5. **Using DSU on directed graphs** — DSU only works for undirected connectivity
