# LRU Cache — Complete Implementation

LRU (Least Recently Used) cache is one of the most common LLD interview questions. Must implement in O(1) for both get and put.

---

## The Approach: HashMap + Doubly Linked List

```
HashMap: key → node (O(1) lookup)
Doubly Linked List: order of access (most recent at head, least recent at tail)

On GET: find node via map, move it to head → O(1)
On PUT: find/create node, move to head, if capacity exceeded remove tail → O(1)
```

---

## Implementation

```typescript
class DoublyLinkedNode<K, V> {
  key: K;
  value: V;
  prev: DoublyLinkedNode<K, V> | null = null;
  next: DoublyLinkedNode<K, V> | null = null;

  constructor(key: K, value: V) {
    this.key = key;
    this.value = value;
  }
}

class LRUCache<K, V> {
  private capacity: number;
  private map: Map<K, DoublyLinkedNode<K, V>>;
  private head: DoublyLinkedNode<K, V>; // most recently used (sentinel)
  private tail: DoublyLinkedNode<K, V>; // least recently used (sentinel)

  constructor(capacity: number) {
    if (capacity <= 0) throw new Error('Capacity must be positive');
    this.capacity = capacity;
    this.map = new Map();

    // Sentinel nodes — simplify edge cases (no null checks needed)
    this.head = new DoublyLinkedNode<K, V>(null as any, null as any);
    this.tail = new DoublyLinkedNode<K, V>(null as any, null as any);
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  get(key: K): V | undefined {
    const node = this.map.get(key);
    if (!node) return undefined;

    // Move to front (most recently used):
    this.remove(node);
    this.insertFront(node);

    return node.value;
  }

  put(key: K, value: V): void {
    const existing = this.map.get(key);

    if (existing) {
      // Update value and move to front:
      existing.value = value;
      this.remove(existing);
      this.insertFront(existing);
    } else {
      // Create new node:
      const node = new DoublyLinkedNode(key, value);
      this.map.set(key, node);
      this.insertFront(node);

      // Evict LRU if over capacity:
      if (this.map.size > this.capacity) {
        const lruNode = this.tail.prev!; // node before tail sentinel
        this.remove(lruNode);
        this.map.delete(lruNode.key);
      }
    }
  }

  delete(key: K): boolean {
    const node = this.map.get(key);
    if (!node) return false;
    this.remove(node);
    this.map.delete(key);
    return true;
  }

  get size(): number {
    return this.map.size;
  }

  // Helper: remove node from its current position
  private remove(node: DoublyLinkedNode<K, V>): void {
    node.prev!.next = node.next;
    node.next!.prev = node.prev;
    node.prev = null;
    node.next = null;
  }

  // Helper: insert node right after head sentinel
  private insertFront(node: DoublyLinkedNode<K, V>): void {
    node.prev = this.head;
    node.next = this.head.next;
    this.head.next!.prev = node;
    this.head.next = node;
  }
}
```

---

## Test Cases

```typescript
const cache = new LRUCache<string, number>(3);

cache.put('a', 1);  // [a]
cache.put('b', 2);  // [b, a]
cache.put('c', 3);  // [c, b, a]

console.log(cache.get('a')); // 1 — moves a to front: [a, c, b]
cache.put('d', 4);           // capacity exceeded, evict b: [d, a, c]

console.log(cache.get('b')); // undefined — evicted!
console.log(cache.get('c')); // 3 — moves c to front: [c, d, a]
console.log(cache.size);     // 3
```

---

## TTL-Enhanced LRU Cache

```typescript
interface CacheEntry<V> {
  value: V;
  expiresAt: number; // 0 = never expires
}

class TTLLRUCache<K, V> {
  private inner: LRUCache<K, CacheEntry<V>>;

  constructor(capacity: number) {
    this.inner = new LRUCache(capacity);
  }

  get(key: K): V | undefined {
    const entry = this.inner.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt > 0 && entry.expiresAt < Date.now()) {
      this.inner.delete(key); // lazy eviction
      return undefined;
    }

    return entry.value;
  }

  set(key: K, value: V, ttlMs: number = 0): void {
    this.inner.put(key, {
      value,
      expiresAt: ttlMs > 0 ? Date.now() + ttlMs : 0
    });
  }
}
```

---

## Using Map (Insertion Order) — Simpler Implementation

```typescript
// JavaScript's Map preserves insertion order
// We can use this for a simpler LRU implementation:

class SimpleLRU<K, V> {
  private map: Map<K, V>;

  constructor(private capacity: number) {
    this.map = new Map();
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!;
    // Re-insert to move to end (most recently used):
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  put(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key); // remove to re-insert at end
    } else if (this.map.size >= this.capacity) {
      // Delete first (least recently used) entry:
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey);
    }
    this.map.set(key, value);
  }
}

// Note: Map.keys().next().value is O(1) for getting the first key
// All operations are O(1) amortized — simpler and works well in practice
```

---

## Interview Discussion Points

**Complexity:**
- get: O(1) — HashMap lookup + O(1) linked list operations
- put: O(1) — same
- Space: O(capacity)

**Why doubly linked list, not singly linked?**
To remove a node in O(1), you need access to the previous node. With a singly linked list, removal requires traversal from head — O(n).

**Why sentinel head/tail nodes?**
Eliminate edge cases for empty list and operations at boundaries. Without sentinels, you need special handling for when the list is empty, when removing the head, or when removing the tail. Sentinels simplify all node operations to the same code.

**What if you need thread-safety?**
JavaScript is single-threaded — no issue. In other languages: use mutex/rwlock. For high concurrency: use concurrent cache with striping (split into N independent LRU caches, hash key to determine which shard).

**Real-world: how does browser cache relate?**
Browser HTTP cache isn't pure LRU — it uses a combination of cache directives (max-age, ETag, no-cache), access frequency, and size. But conceptually it evicts "unimportant" entries when full.
