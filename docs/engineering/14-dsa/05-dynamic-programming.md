# Dynamic Programming — Interview Coding Challenges

## The DP Framework

1. **Define the subproblem** — what does `dp[i]` or `dp[i][j]` represent?
2. **Recurrence relation** — how does `dp[i]` depend on smaller subproblems?
3. **Base cases** — what are the trivial answers?
4. **Build order** — which direction do you fill the table?

**Top-down (memoization):** recursion + cache. Easier to think about.
**Bottom-up (tabulation):** iterative. Usually faster, no stack overflow risk.

---

## Pattern 1: Linear DP — Fibonacci Variants

### Climbing Stairs (Easy)
How many ways to climb `n` stairs, 1 or 2 steps at a time?

```js
// Top-down
function climbStairs(n, memo = {}) {
  if (n <= 1) return 1;
  if (memo[n]) return memo[n];
  return (memo[n] = climbStairs(n - 1, memo) + climbStairs(n - 2, memo));
}

// Bottom-up O(n) space
function climbStairs(n) {
  if (n <= 1) return 1;
  const dp = new Array(n + 1);
  dp[0] = 1; dp[1] = 1;
  for (let i = 2; i <= n; i++) dp[i] = dp[i - 1] + dp[i - 2];
  return dp[n];
}

// O(1) space
function climbStairs(n) {
  let [prev, curr] = [1, 1];
  for (let i = 2; i <= n; i++) [prev, curr] = [curr, prev + curr];
  return curr;
}
```

### House Robber (Medium)
Can't rob adjacent houses. Max money from array.

```js
// dp[i] = max money from houses 0..i
// dp[i] = max(dp[i-1], dp[i-2] + nums[i])
function rob(nums) {
  let prev2 = 0, prev1 = 0;
  for (const num of nums) {
    [prev2, prev1] = [prev1, Math.max(prev1, prev2 + num)];
  }
  return prev1;
}

// House Robber II — circular array (first and last can't both be robbed)
function robII(nums) {
  const rob1 = (arr) => {
    let [p2, p1] = [0, 0];
    for (const n of arr) [p2, p1] = [p1, Math.max(p1, p2 + n)];
    return p1;
  };
  if (nums.length === 1) return nums[0];
  return Math.max(rob1(nums.slice(0, -1)), rob1(nums.slice(1)));
}
```

---

## Pattern 2: 0/1 Knapsack

Items with weight and value. Max value in capacity W.

```js
// dp[i][w] = max value using first i items with capacity w
function knapsack(weights, values, capacity) {
  const n = weights.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(capacity + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let w = 0; w <= capacity; w++) {
      dp[i][w] = dp[i - 1][w]; // don't take item i
      if (weights[i - 1] <= w) {
        dp[i][w] = Math.max(dp[i][w], dp[i - 1][w - weights[i - 1]] + values[i - 1]);
      }
    }
  }
  return dp[n][capacity];
}
// Time: O(n*W), Space: O(n*W) — optimizable to O(W)

// Space-optimized (1D array, iterate capacity backwards!)
function knapsack(weights, values, capacity) {
  const dp = new Array(capacity + 1).fill(0);
  for (let i = 0; i < weights.length; i++) {
    for (let w = capacity; w >= weights[i]; w--) { // BACKWARDS to avoid reuse
      dp[w] = Math.max(dp[w], dp[w - weights[i]] + values[i]);
    }
  }
  return dp[capacity];
}
```

### Subset Sum (variant)

```js
function canPartition(nums) {
  const sum = nums.reduce((a, b) => a + b, 0);
  if (sum % 2 !== 0) return false;
  const target = sum / 2;

  const dp = new Array(target + 1).fill(false);
  dp[0] = true;

  for (const num of nums) {
    for (let j = target; j >= num; j--) {
      dp[j] = dp[j] || dp[j - num];
    }
  }
  return dp[target];
}
```

---

## Pattern 3: String DP

### Longest Common Subsequence (Medium)

```
LCS("abcde", "ace") = 3 ("ace")

dp[i][j] = LCS of s1[0..i-1] and s2[0..j-1]

if s1[i-1] == s2[j-1]:  dp[i][j] = dp[i-1][j-1] + 1
else:                    dp[i][j] = max(dp[i-1][j], dp[i][j-1])
```

```js
function longestCommonSubsequence(s1, s2) {
  const m = s1.length, n = s2.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}
```

### Edit Distance (Hard)

Min operations (insert, delete, replace) to transform s1 into s2.

```js
function minDistance(s1, s2) {
  const m = s1.length, n = s2.length;
  // dp[i][j] = min edits for s1[0..i-1] → s2[0..j-1]
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]; // no op
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],     // delete from s1
          dp[i][j - 1],     // insert into s1
          dp[i - 1][j - 1]  // replace
        );
      }
    }
  }
  return dp[m][n];
}
```

### Palindrome Subsequences

```js
// Longest Palindromic Subsequence
function longestPalindromeSubseq(s) {
  return longestCommonSubsequence(s, s.split('').reverse().join(''));
}

// Minimum insertions to make palindrome = n - LPS(s)
function minInsertions(s) {
  return s.length - longestPalindromeSubseq(s);
}
```

---

## Pattern 4: Interval DP

### Burst Balloons (Hard)

```js
// dp[i][j] = max coins from bursting all balloons between i and j
// Key insight: think about which balloon is burst LAST in interval [i,j]
function maxCoins(nums) {
  nums = [1, ...nums, 1]; // add boundary balloons
  const n = nums.length;
  const dp = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let len = 2; len < n; len++) {
    for (let i = 0; i < n - len; i++) {
      const j = i + len;
      for (let k = i + 1; k < j; k++) {
        dp[i][j] = Math.max(
          dp[i][j],
          dp[i][k] + nums[i] * nums[k] * nums[j] + dp[k][j]
        );
      }
    }
  }
  return dp[0][n - 1];
}
```

---

## Pattern 5: State Machine DP

### Best Time to Buy/Sell Stock with Cooldown (Medium)

```
States: held, sold, rest
held[i]  = max profit on day i while holding stock
sold[i]  = max profit on day i just after selling
rest[i]  = max profit on day i while resting (cooldown)
```

```js
function maxProfitWithCooldown(prices) {
  let held = -Infinity, sold = 0, rest = 0;

  for (const price of prices) {
    const prevHeld = held;
    held = Math.max(held, rest - price); // buy (can only buy after rest)
    rest = Math.max(rest, sold);         // extend rest or stay
    sold = prevHeld + price;             // sell today
  }
  return Math.max(sold, rest);
}
```

### Buy/Sell Stock with Transaction Fee

```js
function maxProfitWithFee(prices, fee) {
  let cash = 0, hold = -prices[0];
  for (let i = 1; i < prices.length; i++) {
    cash = Math.max(cash, hold + prices[i] - fee); // sell
    hold = Math.max(hold, cash - prices[i]);        // buy
  }
  return cash;
}
```

---

## Pattern 6: 2D Grid DP

### Unique Paths (Medium)

```js
function uniquePaths(m, n) {
  const dp = Array.from({ length: m }, () => new Array(n).fill(1));
  for (let i = 1; i < m; i++) {
    for (let j = 1; j < n; j++) {
      dp[i][j] = dp[i - 1][j] + dp[i][j - 1];
    }
  }
  return dp[m - 1][n - 1];
}
```

### Minimum Path Sum (Medium)

```js
function minPathSum(grid) {
  const m = grid.length, n = grid[0].length;
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (i === 0 && j === 0) continue;
      const top  = i > 0 ? grid[i - 1][j] : Infinity;
      const left = j > 0 ? grid[i][j - 1] : Infinity;
      grid[i][j] += Math.min(top, left);
    }
  }
  return grid[m - 1][n - 1];
}
```

---

## Pattern 7: Longest Increasing Subsequence

```js
// O(n^2) DP
function lengthOfLIS(nums) {
  const dp = new Array(nums.length).fill(1);
  let max = 1;
  for (let i = 1; i < nums.length; i++) {
    for (let j = 0; j < i; j++) {
      if (nums[j] < nums[i]) {
        dp[i] = Math.max(dp[i], dp[j] + 1);
      }
    }
    max = Math.max(max, dp[i]);
  }
  return max;
}

// O(n log n) with patience sorting / binary search
function lengthOfLIS(nums) {
  const tails = []; // tails[i] = smallest tail of IS of length i+1

  for (const num of nums) {
    let lo = 0, hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < num) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = num;
  }
  return tails.length;
}
```

---

## Pattern 8: Coin Change

### Min coins (unbounded knapsack)

```js
// dp[i] = min coins to make amount i
function coinChange(coins, amount) {
  const dp = new Array(amount + 1).fill(Infinity);
  dp[0] = 0;

  for (let i = 1; i <= amount; i++) {
    for (const coin of coins) {
      if (coin <= i) dp[i] = Math.min(dp[i], dp[i - coin] + 1);
    }
  }
  return dp[amount] === Infinity ? -1 : dp[amount];
}

// Count combinations (order doesn't matter)
function change(amount, coins) {
  const dp = new Array(amount + 1).fill(0);
  dp[0] = 1;
  for (const coin of coins) {
    for (let i = coin; i <= amount; i++) {
      dp[i] += dp[i - coin];
    }
  }
  return dp[amount];
}
```

---

## DP Complexity Cheatsheet

| Problem | Recurrence | Time | Space |
|---|---|---|---|
| Fibonacci | dp[i] = dp[i-1] + dp[i-2] | O(n) | O(1) |
| 0/1 Knapsack | dp[i][w] = max(skip, take) | O(nW) | O(W) |
| LCS | dp[i][j] from dp[i-1][j-1] | O(mn) | O(mn) |
| Edit distance | dp[i][j] from 3 neighbors | O(mn) | O(mn) |
| LIS (fast) | binary search on tails | O(n log n) | O(n) |
| Coin change | dp[i] = min(dp[i-coin]+1) | O(n*k) | O(n) |
| Unique paths | dp[i][j] = dp[i-1]+dp[j-1] | O(mn) | O(n) |

## Common Mistakes

1. **Off-by-one in base cases** — always trace through manually with a small example
2. **Mutating input** — if you modify the grid in-place, mention it in the interview
3. **Forgetting to handle empty input** — `nums = []` should return 0/null
4. **Top-down stack overflow** — mention iterative as optimization if n is large
5. **Not recognizing DP** — look for: "max/min", "count ways", "can you achieve X", overlapping subproblems
