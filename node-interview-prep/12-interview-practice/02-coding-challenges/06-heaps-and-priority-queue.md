# Heaps & Priority Queue

A **heap** is a complete binary tree satisfying the heap property. Used whenever you need the min/max element repeatedly.

- **Min-heap**: parent ≤ children → `peek()` = global minimum
- **Max-heap**: parent ≥ children → `peek()` = global maximum

JavaScript has no built-in heap — you implement one or simulate with a sorted array (acceptable in interviews, note the trade-off).

---

## Min-Heap Implementation

```ts
class MinHeap {
  private data: number[] = [];

  get size() { return this.data.length; }
  peek(): number | undefined { return this.data[0]; }

  push(val: number): void {
    this.data.push(val);
    this._bubbleUp(this.data.length - 1);
  }

  pop(): number | undefined {
    if (this.size === 0) return undefined;
    const min = this.data[0];
    const last = this.data.pop()!;
    if (this.size > 0) {
      this.data[0] = last;
      this._sinkDown(0);
    }
    return min;
  }

  private _bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[parent] <= this.data[i]) break;
      [this.data[parent], this.data[i]] = [this.data[i], this.data[parent]];
      i = parent;
    }
  }

  private _sinkDown(i: number): void {
    const n = this.size;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this.data[l] < this.data[smallest]) smallest = l;
      if (r < n && this.data[r] < this.data[smallest]) smallest = r;
      if (smallest === i) break;
      [this.data[smallest], this.data[i]] = [this.data[i], this.data[smallest]];
      i = smallest;
    }
  }
}

// Usage:
const h = new MinHeap();
[5, 3, 8, 1, 4].forEach(n => h.push(n));
console.log(h.pop()); // 1
console.log(h.pop()); // 3
console.log(h.peek()); // 4
```

**Complexity:** push O(log n), pop O(log n), peek O(1), build-heap O(n)

---

## Generic Heap (with comparator)

```ts
class Heap<T> {
  private data: T[] = [];
  constructor(private cmp: (a: T, b: T) => number) {}

  get size() { return this.data.length; }
  peek(): T | undefined { return this.data[0]; }

  push(val: T): void {
    this.data.push(val);
    let i = this.data.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cmp(this.data[p], this.data[i]) <= 0) break;
      [this.data[p], this.data[i]] = [this.data[i], this.data[p]];
      i = p;
    }
  }

  pop(): T | undefined {
    if (!this.size) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.size) { this.data[0] = last; this._sink(0); }
    return top;
  }

  private _sink(i: number): void {
    const n = this.size;
    while (true) {
      let best = i;
      const l = 2*i+1, r = 2*i+2;
      if (l < n && this.cmp(this.data[l], this.data[best]) < 0) best = l;
      if (r < n && this.cmp(this.data[r], this.data[best]) < 0) best = r;
      if (best === i) break;
      [this.data[best], this.data[i]] = [this.data[i], this.data[best]];
      i = best;
    }
  }
}

// Min-heap of numbers:
const minH = new Heap<number>((a, b) => a - b);
// Max-heap of numbers:
const maxH = new Heap<number>((a, b) => b - a);
// Min-heap by object property:
const taskH = new Heap<{priority: number; name: string}>((a, b) => a.priority - b.priority);
```

---

## Problem 1: K Largest Elements

```ts
// Return k largest elements from array — O(n log k)
function kLargest(nums: number[], k: number): number[] {
  // Keep a min-heap of size k
  const heap = new Heap<number>((a, b) => a - b);

  for (const n of nums) {
    heap.push(n);
    if (heap.size > k) heap.pop(); // evict smallest
  }

  const result: number[] = [];
  while (heap.size) result.unshift(heap.pop()!);
  return result; // sorted ascending — last k elements are largest
}

console.log(kLargest([3, 1, 5, 12, 2, 11], 3)); // [5, 11, 12]
```

---

## Problem 2: K-th Largest Element in Stream

```ts
class KthLargest {
  private heap: Heap<number>;
  constructor(private k: number, nums: number[]) {
    this.heap = new Heap<number>((a, b) => a - b);
    for (const n of nums) this.add(n);
  }

  add(val: number): number {
    this.heap.push(val);
    while (this.heap.size > this.k) this.heap.pop();
    return this.heap.peek()!;
  }
}

const kth = new KthLargest(3, [4, 5, 8, 2]);
console.log(kth.add(3));  // 4
console.log(kth.add(5));  // 5
console.log(kth.add(10)); // 5
console.log(kth.add(9));  // 8
```

---

## Problem 3: Merge K Sorted Lists

```ts
interface ListNode { val: number; next: ListNode | null; }

function mergeKLists(lists: (ListNode | null)[]): ListNode | null {
  const heap = new Heap<ListNode>((a, b) => a.val - b.val);

  // Seed with heads
  for (const node of lists) {
    if (node) heap.push(node);
  }

  const dummy: ListNode = { val: 0, next: null };
  let cur = dummy;

  while (heap.size) {
    const node = heap.pop()!;
    cur.next = node;
    cur = node;
    if (node.next) heap.push(node.next);
  }

  return dummy.next;
}
// Time: O(n log k) where n = total nodes, k = number of lists
// Space: O(k) for the heap
```

---

## Problem 4: Top K Frequent Elements

```ts
function topKFrequent(nums: number[], k: number): number[] {
  const freq = new Map<number, number>();
  for (const n of nums) freq.set(n, (freq.get(n) ?? 0) + 1);

  // Min-heap by frequency — keep top k
  const heap = new Heap<[number, number]>((a, b) => a[1] - b[1]);

  for (const [num, count] of freq) {
    heap.push([num, count]);
    if (heap.size > k) heap.pop();
  }

  const result: number[] = [];
  while (heap.size) result.push(heap.pop()![0]);
  return result;
}

console.log(topKFrequent([1,1,1,2,2,3], 2)); // [2, 1] (order may vary)
```

---

## Problem 5: Find Median from Data Stream

```ts
// Classic two-heap trick: max-heap for lower half, min-heap for upper half
class MedianFinder {
  private lo = new Heap<number>((a, b) => b - a); // max-heap
  private hi = new Heap<number>((a, b) => a - b); // min-heap

  addNum(num: number): void {
    this.lo.push(num);
    // Balance: lo's max must be ≤ hi's min
    this.hi.push(this.lo.pop()!);
    // Keep lo size >= hi size
    if (this.lo.size < this.hi.size) this.lo.push(this.hi.pop()!);
  }

  findMedian(): number {
    if (this.lo.size > this.hi.size) return this.lo.peek()!;
    return (this.lo.peek()! + this.hi.peek()!) / 2;
  }
}

const mf = new MedianFinder();
mf.addNum(1); mf.addNum(2);
console.log(mf.findMedian()); // 1.5
mf.addNum(3);
console.log(mf.findMedian()); // 2
```

---

## Problem 6: Task Scheduler

```ts
// Given tasks (letters), cooldown n, find minimum intervals needed
function leastInterval(tasks: string[], n: number): number {
  const freq = new Array(26).fill(0);
  for (const t of tasks) freq[t.charCodeAt(0) - 65]++;

  const maxH = new Heap<number>((a, b) => b - a);
  for (const f of freq) if (f > 0) maxH.push(f);

  let time = 0;
  const queue: [number, number][] = []; // [remaining, availableAt]

  while (maxH.size || queue.length) {
    time++;

    if (maxH.size) {
      const remaining = maxH.pop()! - 1;
      if (remaining > 0) queue.push([remaining, time + n]);
    }

    if (queue.length && queue[0][1] === time) {
      maxH.push(queue.shift()![0]);
    }
  }

  return time;
}

console.log(leastInterval(['A','A','A','B','B','B'], 2)); // 8
```

---

## Problem 7: Dijkstra with Heap

```ts
function dijkstra(graph: Map<number, [number, number][]>, src: number): Map<number, number> {
  const dist = new Map<number, number>();
  const heap = new Heap<[number, number]>((a, b) => a[0] - b[0]); // [cost, node]

  heap.push([0, src]);
  dist.set(src, 0);

  while (heap.size) {
    const [cost, u] = heap.pop()!;
    if (cost > (dist.get(u) ?? Infinity)) continue; // stale entry

    for (const [v, w] of graph.get(u) ?? []) {
      const newCost = cost + w;
      if (newCost < (dist.get(v) ?? Infinity)) {
        dist.set(v, newCost);
        heap.push([newCost, v]);
      }
    }
  }
  return dist;
}
```

---

## Interview Cheatsheet

| Problem pattern | Heap type | Why |
|---|---|---|
| K largest | Min-heap size k | Pop when > k, root = kth largest |
| K smallest | Max-heap size k | Pop when > k, root = kth smallest |
| Merge k sorted | Min-heap of heads | Always extract global min |
| Median stream | Max + Min heap | Lower/upper halves balanced |
| Sliding window max | Monotonic deque | Heap works but deque is O(n) |
| Shortest path | Min-heap by cost | Dijkstra's algorithm |
| Task scheduling | Max-heap by freq | Greedy: always schedule most frequent |

## Complexity Summary

| Operation | Binary Heap |
|---|---|
| push | O(log n) |
| pop | O(log n) |
| peek | O(1) |
| build from array | O(n) |
| search | O(n) |

## Common Mistakes

1. **Forgetting to handle stale entries in Dijkstra** — check `cost > dist[u]` and skip
2. **Using max-heap for K largest** — you'd need to push all n elements first (O(n log n)); min-heap of size k is O(n log k)
3. **Off-by-one in two-heap median** — lo must always be >= hi in size
4. **Not re-seeding heap after pop in merge-k** — push `node.next` after extracting node
