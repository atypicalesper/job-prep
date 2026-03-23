# Tries (Prefix Trees)

A **trie** is a tree where each path from root to a node represents a prefix. Every node stores children (one per possible character) and an `isEnd` flag.

**When to reach for a trie:**
- Prefix search / autocomplete
- Word existence with shared prefixes
- XOR maximum (binary trie)
- IP routing tables

---

## Basic Trie Implementation

```ts
class TrieNode {
  children: Map<string, TrieNode> = new Map();
  isEnd = false;
  // Optional: store frequency, word, or other metadata here
}

class Trie {
  private root = new TrieNode();

  /** O(m) — m = word length */
  insert(word: string): void {
    let node = this.root;
    for (const ch of word) {
      if (!node.children.has(ch)) {
        node.children.set(ch, new TrieNode());
      }
      node = node.children.get(ch)!;
    }
    node.isEnd = true;
  }

  /** O(m) */
  search(word: string): boolean {
    let node = this.root;
    for (const ch of word) {
      if (!node.children.has(ch)) return false;
      node = node.children.get(ch)!;
    }
    return node.isEnd;
  }

  /** O(m) — true if any word starts with prefix */
  startsWith(prefix: string): boolean {
    let node = this.root;
    for (const ch of prefix) {
      if (!node.children.has(ch)) return false;
      node = node.children.get(ch)!;
    }
    return true;
  }

  /** O(m) — delete word (mark isEnd = false, prune if leaf) */
  delete(word: string): boolean {
    return this._delete(this.root, word, 0);
  }

  private _delete(node: TrieNode, word: string, i: number): boolean {
    if (i === word.length) {
      if (!node.isEnd) return false;
      node.isEnd = false;
      return node.children.size === 0; // prune if leaf
    }
    const ch = word[i];
    const child = node.children.get(ch);
    if (!child) return false;
    const shouldDelete = this._delete(child, word, i + 1);
    if (shouldDelete) node.children.delete(ch);
    return !node.isEnd && node.children.size === 0;
  }
}

const trie = new Trie();
['apple', 'app', 'application'].forEach(w => trie.insert(w));
console.log(trie.search('app'));        // true
console.log(trie.search('ap'));         // false
console.log(trie.startsWith('appl'));   // true
```

**Space:** O(ALPHABET_SIZE × n × m) worst case, but Map makes it sparse.

---

## Array-based Trie (faster in practice for a–z)

```ts
class TrieNodeArr {
  children: (TrieNodeArr | null)[] = new Array(26).fill(null);
  isEnd = false;
}

class TrieArr {
  private root = new TrieNodeArr();
  private idx(ch: string) { return ch.charCodeAt(0) - 97; }

  insert(word: string): void {
    let node = this.root;
    for (const ch of word) {
      const i = this.idx(ch);
      if (!node.children[i]) node.children[i] = new TrieNodeArr();
      node = node.children[i]!;
    }
    node.isEnd = true;
  }

  search(word: string): boolean {
    let node = this.root;
    for (const ch of word) {
      const i = this.idx(ch);
      if (!node.children[i]) return false;
      node = node.children[i]!;
    }
    return node.isEnd;
  }
}
```

---

## Problem 1: Word Search II (find all words in grid)

```ts
// Given grid of letters and list of words, find all words present
function findWords(board: string[][], words: string[]): string[] {
  const trie = new Trie();
  for (const w of words) trie.insert(w); // build trie from word list

  // Expose internal root for DFS (or use a method)
  // Here we inline a simpler trie for clarity:
  interface Node { children: Map<string, Node>; word: string | null; }
  const root: Node = { children: new Map(), word: null };

  for (const w of words) {
    let n = root;
    for (const ch of w) {
      if (!n.children.has(ch)) n.children.set(ch, { children: new Map(), word: null });
      n = n.children.get(ch)!;
    }
    n.word = w;
  }

  const rows = board.length, cols = board[0].length;
  const found = new Set<string>();

  function dfs(r: number, c: number, node: Node): void {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return;
    const ch = board[r][c];
    if (ch === '#' || !node.children.has(ch)) return;

    const next = node.children.get(ch)!;
    if (next.word) found.add(next.word);

    board[r][c] = '#';
    dfs(r+1,c,next); dfs(r-1,c,next); dfs(r,c+1,next); dfs(r,c-1,next);
    board[r][c] = ch;
  }

  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      dfs(r, c, root);

  return [...found];
}
// Time: O(M * 4 * 3^(L-1)) where M=cells, L=word length
// Trie prunes paths not matching any word
```

---

## Problem 2: Autocomplete System

```ts
class AutocompleteSystem {
  private root: { children: Map<string, any>; sentences: Map<string, number> } = {
    children: new Map(), sentences: new Map()
  };
  private input = '';

  constructor(sentences: string[], times: number[]) {
    for (let i = 0; i < sentences.length; i++) {
      this._addSentence(sentences[i], times[i]);
    }
  }

  private _addSentence(sentence: string, count: number): void {
    let node = this.root;
    for (const ch of sentence) {
      if (!node.children.has(ch)) {
        node.children.set(ch, { children: new Map(), sentences: new Map() });
      }
      node = node.children.get(ch)!;
      node.sentences.set(sentence, (node.sentences.get(sentence) ?? 0) + count);
    }
  }

  input_char(c: string): string[] {
    if (c === '#') {
      this._addSentence(this.input, 1);
      this.input = '';
      return [];
    }
    this.input += c;
    let node = this.root;
    for (const ch of this.input) {
      if (!node.children.has(ch)) return [];
      node = node.children.get(ch)!;
    }
    // Top 3 by frequency, then lexicographic
    return [...node.sentences.entries()]
      .sort(([a, ca], [b, cb]) => cb - ca || a.localeCompare(b))
      .slice(0, 3)
      .map(([s]) => s);
  }
}
```

---

## Problem 3: Maximum XOR of Two Numbers (Binary Trie)

```ts
// Find pair (a, b) in nums where a XOR b is maximized — O(n * 32)
function findMaximumXOR(nums: number[]): number {
  interface BNode { children: (BNode | null)[] }
  const root: BNode = { children: [null, null] };

  // Insert number bit by bit (MSB first)
  function insert(num: number): void {
    let node = root;
    for (let i = 31; i >= 0; i--) {
      const bit = (num >> i) & 1;
      if (!node.children[bit]) node.children[bit] = { children: [null, null] };
      node = node.children[bit]!;
    }
  }

  // Query: greedily pick opposite bit at each level
  function query(num: number): number {
    let node = root, xor = 0;
    for (let i = 31; i >= 0; i--) {
      const bit = (num >> i) & 1;
      const want = 1 - bit; // try to flip each bit
      if (node.children[want]) {
        xor |= (1 << i);
        node = node.children[want]!;
      } else {
        node = node.children[bit]!;
      }
    }
    return xor;
  }

  for (const n of nums) insert(n);
  return Math.max(...nums.map(n => query(n)));
}

console.log(findMaximumXOR([3, 10, 5, 25, 2, 8])); // 28 (5 XOR 25)
```

---

## Problem 4: Replace Words (prefix replacement)

```ts
function replaceWords(dictionary: string[], sentence: string): string {
  const trie = new Trie();
  for (const root of dictionary) trie.insert(root);

  // Find shortest prefix in trie for a word
  function shortestPrefix(word: string): string {
    // Walk trie manually here for efficiency
    // (using the Trie class from above)
    return word; // simplified — real impl walks trie
  }

  // Inline trie walk:
  interface N { c: Map<string, N>; end: boolean }
  const r: N = { c: new Map(), end: false };
  for (const w of dictionary) {
    let n = r;
    for (const ch of w) {
      if (!n.c.has(ch)) n.c.set(ch, { c: new Map(), end: false });
      n = n.c.get(ch)!;
    }
    n.end = true;
  }

  return sentence.split(' ').map(word => {
    let n = r;
    for (let i = 0; i < word.length; i++) {
      const ch = word[i];
      if (!n.c.has(ch)) break;
      n = n.c.get(ch)!;
      if (n.end) return word.slice(0, i + 1); // found root prefix
    }
    return word;
  }).join(' ');
}

console.log(replaceWords(['cat','bat','rat'], 'the cattle was rattled by the battery'));
// "the cat was rat by the bat"
```

---

## Trie vs HashMap Tradeoff

| | Trie | HashMap |
|---|---|---|
| Exact match | O(m) | O(m) avg |
| Prefix search | O(m + results) | O(n·m) — must scan all |
| Space | O(total chars) | O(total chars) |
| Autocomplete | Natural | Awkward |
| Sorted output | Natural (DFS) | Requires sort |

**Use trie when:** prefix queries, common-prefix compression, autocomplete, IP routing.
**Use hashmap when:** only exact lookups needed.

---

## Common Mistakes

1. **isEnd check at wrong level** — `search` must return `node.isEnd`, not just reaching the last node
2. **Sharing node references** — each insert path must create its own nodes
3. **Not handling empty string** — `insert('')` sets `root.isEnd = true`
4. **Forgetting to restore in word-search DFS** — mark cell visited, restore after backtrack
5. **Binary trie bit order** — go MSB first (bit 31 down to 0) for XOR max
