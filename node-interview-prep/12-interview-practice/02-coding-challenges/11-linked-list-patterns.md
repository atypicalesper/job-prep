# Linked List Patterns

Linked list problems almost always reduce to a handful of techniques: **fast/slow pointers**, **reversal**, **dummy head**, and **merge**.

```ts
class ListNode {
  constructor(public val: number, public next: ListNode | null = null) {}
}

// Helper to build a list from an array
function buildList(arr: number[]): ListNode | null {
  const dummy = new ListNode(0);
  let cur = dummy;
  for (const v of arr) { cur.next = new ListNode(v); cur = cur.next; }
  return dummy.next;
}

// Helper to read a list into an array
function toArray(head: ListNode | null): number[] {
  const result: number[] = [];
  while (head) { result.push(head.val); head = head.next; }
  return result;
}
```

---

## Pattern 1: Fast/Slow Pointers (Floyd's)

### Detect Cycle

```ts
function hasCycle(head: ListNode | null): boolean {
  let slow = head, fast = head;
  while (fast && fast.next) {
    slow = slow!.next;
    fast = fast.next.next;
    if (slow === fast) return true;
  }
  return false;
}
```

### Find Cycle Start

```ts
function detectCycle(head: ListNode | null): ListNode | null {
  let slow = head, fast = head;

  while (fast && fast.next) {
    slow = slow!.next;
    fast = fast.next.next;
    if (slow === fast) {
      // Reset one pointer to head; advance both by 1 until they meet
      slow = head;
      while (slow !== fast) { slow = slow!.next; fast = fast!.next; }
      return slow; // cycle start
    }
  }
  return null;
}
```

### Middle of Linked List

```ts
function middleNode(head: ListNode): ListNode {
  let slow: ListNode | null = head, fast: ListNode | null = head;
  while (fast && fast.next) { slow = slow!.next; fast = fast.next.next; }
  return slow!; // for even length, returns second middle
}
```

---

## Pattern 2: Reversal

### Reverse Entire List

```ts
function reverseList(head: ListNode | null): ListNode | null {
  let prev: ListNode | null = null;
  let cur = head;
  while (cur) {
    const next = cur.next;
    cur.next = prev;
    prev = cur;
    cur = next;
  }
  return prev;
}
```

### Reverse a Sublist (positions left to right, 1-indexed)

```ts
function reverseBetween(head: ListNode | null, left: number, right: number): ListNode | null {
  const dummy = new ListNode(0, head);
  let pre: ListNode = dummy;

  // Advance pre to the node just before position `left`
  for (let i = 1; i < left; i++) pre = pre.next!;

  let cur: ListNode | null = pre.next;
  for (let i = 0; i < right - left; i++) {
    const next = cur!.next!;
    cur!.next = next.next;
    next.next = pre.next;
    pre.next = next;
  }
  return dummy.next;
}

console.log(toArray(reverseBetween(buildList([1,2,3,4,5]), 2, 4))); // [1,4,3,2,5]
```

### Reverse in K-Groups

```ts
function reverseKGroup(head: ListNode | null, k: number): ListNode | null {
  // Check if k nodes remain
  let check: ListNode | null = head;
  for (let i = 0; i < k; i++) {
    if (!check) return head; // fewer than k nodes remaining — leave as-is
    check = check.next;
  }

  // Reverse k nodes
  let prev: ListNode | null = null, cur: ListNode | null = head;
  for (let i = 0; i < k; i++) {
    const next = cur!.next;
    cur!.next = prev;
    prev = cur!;
    cur = next;
  }

  // head is now the tail of the reversed group; connect to next group
  head!.next = reverseKGroup(cur, k);
  return prev;
}

console.log(toArray(reverseKGroup(buildList([1,2,3,4,5]), 2))); // [2,1,4,3,5]
```

---

## Pattern 3: Dummy Head

Use a dummy node to simplify edge cases involving the head.

### Remove N-th Node from End

```ts
function removeNthFromEnd(head: ListNode | null, n: number): ListNode | null {
  const dummy = new ListNode(0, head);
  let fast: ListNode | null = dummy, slow: ListNode | null = dummy;

  // Advance fast by n+1 steps
  for (let i = 0; i <= n; i++) fast = fast!.next;

  // Move both until fast reaches end
  while (fast) { fast = fast.next; slow = slow!.next; }

  // slow is just before the node to remove
  slow!.next = slow!.next!.next;
  return dummy.next;
}

console.log(toArray(removeNthFromEnd(buildList([1,2,3,4,5]), 2))); // [1,2,3,5]
```

### Delete Node Without Head Reference

```ts
// Copy next node's value into current, then skip next
function deleteNode(node: ListNode): void {
  node.val = node.next!.val;
  node.next = node.next!.next;
}
```

---

## Pattern 4: Merge / Partition

### Merge Two Sorted Lists

```ts
function mergeTwoLists(l1: ListNode | null, l2: ListNode | null): ListNode | null {
  const dummy = new ListNode(0);
  let cur = dummy;

  while (l1 && l2) {
    if (l1.val <= l2.val) { cur.next = l1; l1 = l1.next; }
    else                  { cur.next = l2; l2 = l2.next; }
    cur = cur.next;
  }
  cur.next = l1 ?? l2;
  return dummy.next;
}
```

### Sort List (Merge Sort — O(n log n), O(log n) space)

```ts
function sortList(head: ListNode | null): ListNode | null {
  if (!head || !head.next) return head;

  // Split in half
  let slow: ListNode | null = head, fast: ListNode | null = head.next;
  while (fast && fast.next) { slow = slow!.next; fast = fast.next.next; }
  const mid = slow!.next;
  slow!.next = null;

  return mergeTwoLists(sortList(head), sortList(mid));
}
```

### Partition List (all < x before all >= x)

```ts
function partition(head: ListNode | null, x: number): ListNode | null {
  const lessHead = new ListNode(0);
  const greaterHead = new ListNode(0);
  let less = lessHead, greater = greaterHead;

  while (head) {
    if (head.val < x) { less.next = head; less = less.next; }
    else              { greater.next = head; greater = greater.next; }
    head = head.next;
  }
  greater.next = null;    // terminate greater list
  less.next = greaterHead.next;
  return lessHead.next;
}
```

---

## Problem: Palindrome Linked List

```ts
// O(n) time, O(1) space
function isPalindrome(head: ListNode | null): boolean {
  if (!head || !head.next) return true;

  // Find middle
  let slow: ListNode | null = head, fast: ListNode | null = head;
  while (fast && fast.next) { slow = slow!.next; fast = fast.next.next; }

  // Reverse second half
  let prev: ListNode | null = null, cur: ListNode | null = slow;
  while (cur) { const next = cur.next; cur.next = prev; prev = cur; cur = next; }

  // Compare both halves
  let left: ListNode | null = head, right: ListNode | null = prev;
  while (right) {
    if (left!.val !== right.val) return false;
    left = left!.next; right = right.next;
  }
  return true;
}
```

---

## Problem: LRU Cache (Doubly Linked List + HashMap)

```ts
class LRUCache {
  private map = new Map<number, DNode>();
  private head: DNode; // dummy head (MRU side)
  private tail: DNode; // dummy tail (LRU side)

  constructor(private capacity: number) {
    this.head = new DNode(0, 0);
    this.tail = new DNode(0, 0);
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  get(key: number): number {
    const node = this.map.get(key);
    if (!node) return -1;
    this._moveToFront(node);
    return node.val;
  }

  put(key: number, value: number): void {
    if (this.map.has(key)) {
      const node = this.map.get(key)!;
      node.val = value;
      this._moveToFront(node);
    } else {
      if (this.map.size === this.capacity) {
        const lru = this.tail.prev!;
        this._remove(lru);
        this.map.delete(lru.key);
      }
      const node = new DNode(key, value);
      this._addFront(node);
      this.map.set(key, node);
    }
  }

  private _remove(node: DNode): void {
    node.prev!.next = node.next;
    node.next!.prev = node.prev;
  }
  private _addFront(node: DNode): void {
    node.next = this.head.next;
    node.prev = this.head;
    this.head.next!.prev = node;
    this.head.next = node;
  }
  private _moveToFront(node: DNode): void { this._remove(node); this._addFront(node); }
}

class DNode {
  prev: DNode | null = null;
  next: DNode | null = null;
  constructor(public key: number, public val: number) {}
}
```

---

## Patterns Summary

| Technique | Problems |
|---|---|
| Fast/slow pointers | Cycle detection, middle node, palindrome |
| Reversal (iterative) | Reverse list, reverse sublist, reverse k-groups |
| Dummy head | Remove nth, merge, partition |
| Merge | Merge sorted lists, sort list |
| HashMap + DLL | LRU/LFU cache |

## Common Mistakes

1. **Losing the next pointer before reassigning** — always `const next = cur.next` before `cur.next = prev`
2. **Off-by-one in fast/slow for finding middle** — `fast = head.next` vs `fast = head` determines which middle for even-length lists
3. **Not terminating the merged list** — `greater.next = null` prevents cycles in partition
4. **Forgetting to update both `prev` and `next` in DLL** — doubly linked list requires updating 4 pointers per operation
5. **Returning `dummy.next` not `dummy`** — the dummy is a placeholder; always return `dummy.next`
