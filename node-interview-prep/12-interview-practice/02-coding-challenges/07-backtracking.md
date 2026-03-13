# Backtracking

Backtracking = DFS + undo. Build candidates incrementally, abandon ("backtrack") as soon as you determine the path can't lead to a valid solution.

**Template:**
```
function backtrack(state, choices):
  if state is a solution → record/return it
  for each choice in choices:
    if choice is valid:
      apply choice
      backtrack(new state, remaining choices)
      undo choice           ← the "backtrack" step
```

---

## Problem 1: Subsets (Power Set)

```ts
function subsets(nums: number[]): number[][] {
  const result: number[][] = [];

  function backtrack(start: number, current: number[]): void {
    result.push([...current]); // every node is a valid subset

    for (let i = start; i < nums.length; i++) {
      current.push(nums[i]);
      backtrack(i + 1, current);
      current.pop(); // undo
    }
  }

  backtrack(0, []);
  return result;
}

console.log(subsets([1, 2, 3]));
// [[], [1], [1,2], [1,2,3], [1,3], [2], [2,3], [3]]
// Time: O(n * 2^n)  Space: O(n)
```

---

## Problem 2: Subsets II (with duplicates)

```ts
function subsetsWithDup(nums: number[]): number[][] {
  nums.sort((a, b) => a - b); // sort first to group duplicates
  const result: number[][] = [];

  function backtrack(start: number, current: number[]): void {
    result.push([...current]);

    for (let i = start; i < nums.length; i++) {
      // Skip duplicate choices at the same tree level
      if (i > start && nums[i] === nums[i - 1]) continue;
      current.push(nums[i]);
      backtrack(i + 1, current);
      current.pop();
    }
  }

  backtrack(0, []);
  return result;
}

console.log(subsetsWithDup([1, 2, 2]));
// [[], [1], [1,2], [1,2,2], [2], [2,2]]
```

---

## Problem 3: Permutations

```ts
function permute(nums: number[]): number[][] {
  const result: number[][] = [];

  function backtrack(current: number[], used: boolean[]): void {
    if (current.length === nums.length) {
      result.push([...current]);
      return;
    }
    for (let i = 0; i < nums.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      current.push(nums[i]);
      backtrack(current, used);
      current.pop();
      used[i] = false;
    }
  }

  backtrack([], new Array(nums.length).fill(false));
  return result;
}

console.log(permute([1, 2, 3]));
// [[1,2,3],[1,3,2],[2,1,3],[2,3,1],[3,1,2],[3,2,1]]
// Time: O(n * n!)
```

---

## Problem 4: Permutations II (with duplicates)

```ts
function permuteUnique(nums: number[]): number[][] {
  nums.sort((a, b) => a - b);
  const result: number[][] = [];

  function backtrack(current: number[], used: boolean[]): void {
    if (current.length === nums.length) { result.push([...current]); return; }

    for (let i = 0; i < nums.length; i++) {
      if (used[i]) continue;
      // If same value as previous and previous wasn't used in this call → skip
      if (i > 0 && nums[i] === nums[i - 1] && !used[i - 1]) continue;
      used[i] = true;
      current.push(nums[i]);
      backtrack(current, used);
      current.pop();
      used[i] = false;
    }
  }

  backtrack([], new Array(nums.length).fill(false));
  return result;
}
```

---

## Problem 5: Combination Sum

```ts
// Candidates can be reused unlimited times
function combinationSum(candidates: number[], target: number): number[][] {
  const result: number[][] = [];

  function backtrack(start: number, current: number[], remaining: number): void {
    if (remaining === 0) { result.push([...current]); return; }
    if (remaining < 0) return; // pruning

    for (let i = start; i < candidates.length; i++) {
      current.push(candidates[i]);
      backtrack(i, current, remaining - candidates[i]); // i not i+1 (reuse allowed)
      current.pop();
    }
  }

  backtrack(0, [], target);
  return result;
}

console.log(combinationSum([2, 3, 6, 7], 7)); // [[2,2,3],[7]]
```

---

## Problem 6: Letter Combinations of a Phone Number

```ts
function letterCombinations(digits: string): string[] {
  if (!digits) return [];
  const map: Record<string, string> = {
    '2': 'abc', '3': 'def', '4': 'ghi', '5': 'jkl',
    '6': 'mno', '7': 'pqrs', '8': 'tuv', '9': 'wxyz'
  };
  const result: string[] = [];

  function backtrack(i: number, current: string): void {
    if (i === digits.length) { result.push(current); return; }
    for (const ch of map[digits[i]]) {
      backtrack(i + 1, current + ch);
    }
  }

  backtrack(0, '');
  return result;
}

console.log(letterCombinations('23')); // ["ad","ae","af","bd","be","bf","cd","ce","cf"]
```

---

## Problem 7: N-Queens

```ts
function solveNQueens(n: number): string[][] {
  const result: string[][] = [];
  const cols = new Set<number>();
  const diag1 = new Set<number>(); // row - col
  const diag2 = new Set<number>(); // row + col

  function backtrack(row: number, board: string[][]): void {
    if (row === n) {
      result.push(board.map(r => r.join('')));
      return;
    }
    for (let col = 0; col < n; col++) {
      if (cols.has(col) || diag1.has(row - col) || diag2.has(row + col)) continue;
      cols.add(col); diag1.add(row - col); diag2.add(row + col);
      board[row][col] = 'Q';
      backtrack(row + 1, board);
      board[row][col] = '.';
      cols.delete(col); diag1.delete(row - col); diag2.delete(row + col);
    }
  }

  const empty = () => Array.from({length: n}, () => new Array(n).fill('.'));
  backtrack(0, empty());
  return result;
}

console.log(solveNQueens(4).length); // 2
```

---

## Problem 8: Sudoku Solver

```ts
function solveSudoku(board: string[][]): void {
  function isValid(r: number, c: number, ch: string): boolean {
    for (let i = 0; i < 9; i++) {
      if (board[r][i] === ch) return false;
      if (board[i][c] === ch) return false;
      const br = 3 * Math.floor(r / 3) + Math.floor(i / 3);
      const bc = 3 * Math.floor(c / 3) + (i % 3);
      if (board[br][bc] === ch) return false;
    }
    return true;
  }

  function solve(): boolean {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] !== '.') continue;
        for (let d = 1; d <= 9; d++) {
          const ch = String(d);
          if (isValid(r, c, ch)) {
            board[r][c] = ch;
            if (solve()) return true;
            board[r][c] = '.'; // backtrack
          }
        }
        return false; // no digit worked
      }
    }
    return true; // all cells filled
  }

  solve();
}
```

---

## Problem 9: Word Search in Grid

```ts
function exist(board: string[][], word: string): boolean {
  const rows = board.length, cols = board[0].length;

  function dfs(r: number, c: number, i: number): boolean {
    if (i === word.length) return true;
    if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
    if (board[r][c] !== word[i]) return false;

    const tmp = board[r][c];
    board[r][c] = '#'; // mark visited

    const found = dfs(r+1,c,i+1) || dfs(r-1,c,i+1) || dfs(r,c+1,i+1) || dfs(r,c-1,i+1);

    board[r][c] = tmp; // restore
    return found;
  }

  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (dfs(r, c, 0)) return true;

  return false;
}
```

---

## Backtracking Patterns

| Problem | Key decision | Pruning |
|---|---|---|
| Subsets | Include or skip each element | `start` index prevents re-use |
| Permutations | Which unused element to place | `used[]` array |
| Combination Sum | Pick from `start`, can reuse | Remaining < 0 → stop |
| N-Queens | Which column for this row | Set-based O(1) conflict check |
| Sudoku | Which digit for this cell | Row/col/box validity |
| Word Search | Which direction to go | Visited mark in-place |

## Time Complexity

| Problem | Time |
|---|---|
| Subsets | O(n · 2ⁿ) |
| Permutations | O(n · n!) |
| Combination Sum | O(2^(T/M)) where T=target, M=min candidate |
| N-Queens | O(n!) |
| Sudoku | O(9^m) where m = empty cells |

## Common Mistakes

1. **Forgetting to undo** — every `push`/`mark` needs a corresponding `pop`/`unmark`
2. **Copying at wrong time** — push `[...current]` not `current` (reference issue)
3. **Wrong dedup condition** — for dups: `i > start && nums[i] === nums[i-1]` (not `i > 0`)
4. **Not sorting before dedup** — duplicates must be adjacent to skip correctly
5. **Missing base case** — always check termination before recursing
