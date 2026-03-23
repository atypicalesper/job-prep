# Bit Manipulation

Bit manipulation operates directly on binary representations. Often produces O(1) or O(log n) solutions to problems that otherwise need O(n).

---

## Fundamentals

```ts
// Common bitwise operators:
// &   AND
// |   OR
// ^   XOR (exclusive or)
// ~   NOT (bitwise complement)
// <<  left shift  (multiply by 2)
// >>  right shift (divide by 2, sign-preserving)
// >>> unsigned right shift (fills with 0)

// Key identities:
// x & (x-1)   → clears the lowest set bit
// x & (-x)    → isolates the lowest set bit
// x | (x-1)   → sets all bits below the lowest set bit
// x ^ x       → 0
// x ^ 0       → x
// ~x          → -(x+1) in two's complement

const n = 0b1101; // 13

console.log(n & 1);         // 1 — check if odd
console.log(n >> 1);        // 6 — divide by 2
console.log(n << 1);        // 26 — multiply by 2
console.log(n & (n - 1));   // 12 (0b1100) — clear lowest set bit
console.log(n & (-n));      // 1 (0b0001) — isolate lowest set bit
console.log(n ^ n);         // 0
```

---

## Bit Operations Cheatsheet

| Operation | Expression | Example (n=6=0b110) |
|---|---|---|
| Get bit i | `(n >> i) & 1` | i=1: 1 |
| Set bit i | `n \| (1 << i)` | i=0: 7 |
| Clear bit i | `n & ~(1 << i)` | i=1: 4 |
| Toggle bit i | `n ^ (1 << i)` | i=0: 7 |
| Clear lowest set bit | `n & (n-1)` | 4 |
| Isolate lowest set bit | `n & (-n)` | 2 |
| Count set bits | `popcount` | 2 |
| Is power of 2? | `n > 0 && (n & (n-1)) === 0` | false |
| Swap without temp | `a ^= b; b ^= a; a ^= b` | — |

---

## Problem 1: Count Set Bits (Hamming Weight / popcount)

```ts
// Brian Kernighan's algorithm — O(number of set bits)
function hammingWeight(n: number): number {
  let count = 0;
  while (n) {
    n &= n - 1; // clear lowest set bit
    count++;
  }
  return count;
}

// DP approach — build table for all numbers 0..n in O(n)
function countBits(n: number): number[] {
  const dp = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    dp[i] = dp[i >> 1] + (i & 1); // dp[i] = dp[i/2] + (last bit)
  }
  return dp;
}

console.log(hammingWeight(11));   // 3 (0b1011 has 3 ones)
console.log(countBits(5));        // [0,1,1,2,1,2]
```

---

## Problem 2: Single Number (XOR)

```ts
// Every element appears twice except one — find the single element
function singleNumber(nums: number[]): number {
  return nums.reduce((xor, n) => xor ^ n, 0);
  // XOR of a pair cancels: a ^ a = 0
  // XOR with 0 gives back: 0 ^ a = a
}

console.log(singleNumber([4,1,2,1,2])); // 4
```

### Single Number III (two unique elements)

```ts
// Two elements appear once, rest appear twice
function singleNumberIII(nums: number[]): number[] {
  const xor = nums.reduce((a, b) => a ^ b, 0); // xor of the two unique numbers
  const bit = xor & (-xor); // any differing bit between the two numbers

  let a = 0;
  for (const n of nums) {
    if (n & bit) a ^= n; // partition into two groups by this bit
  }
  return [a, xor ^ a];
}

console.log(singleNumberIII([1,2,1,3,2,5])); // [3,5] (order may vary)
```

---

## Problem 3: Reverse Bits

```ts
function reverseBits(n: number): number {
  let result = 0;
  for (let i = 0; i < 32; i++) {
    result = (result * 2) + (n & 1); // shift result left and add LSB of n
    n >>= 1;
  }
  return result >>> 0; // convert to unsigned 32-bit
}

console.log(reverseBits(0b00000010100101000001111010011100)); // 964176192
```

---

## Problem 4: Number of 1 Bits Differences (Hamming Distance)

```ts
function hammingDistance(x: number, y: number): number {
  let xor = x ^ y; // bits that differ
  let count = 0;
  while (xor) { xor &= xor - 1; count++; }
  return count;
}

console.log(hammingDistance(1, 4)); // 2 (001 vs 100 — 2 bits differ)
```

---

## Problem 5: Missing Number

```ts
// Array contains n distinct numbers in [0,n] — find the missing one
function missingNumber(nums: number[]): number {
  // XOR approach: xor all indices and all values
  let xor = nums.length; // start with n
  for (let i = 0; i < nums.length; i++) {
    xor ^= i ^ nums[i];
  }
  return xor;
  // Math alternative: return n*(n+1)/2 - nums.reduce((a,b)=>a+b,0)
}

console.log(missingNumber([3,0,1])); // 2
console.log(missingNumber([9,6,4,2,3,5,7,0,1])); // 8
```

---

## Problem 6: Power of Two / Three / Four

```ts
function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

function isPowerOfFour(n: number): boolean {
  // Power of 4: power of 2 AND the single bit is at an even position
  // 0x55555555 = ...0101 0101 — masks even bit positions
  return n > 0 && (n & (n - 1)) === 0 && (n & 0x55555555) !== 0;
}

console.log(isPowerOfTwo(16));  // true
console.log(isPowerOfTwo(18));  // false
console.log(isPowerOfFour(16)); // true
console.log(isPowerOfFour(8));  // false
```

---

## Problem 7: Subsets via Bitmask

```ts
// Generate all subsets of nums using bitmask enumeration
function subsetsViaBitmask(nums: number[]): number[][] {
  const n = nums.length;
  const result: number[][] = [];

  for (let mask = 0; mask < (1 << n); mask++) {
    const subset: number[] = [];
    for (let i = 0; i < n; i++) {
      if ((mask >> i) & 1) subset.push(nums[i]);
    }
    result.push(subset);
  }
  return result;
}

console.log(subsetsViaBitmask([1,2,3]).length); // 8 (2^3)
```

---

## Problem 8: Maximum XOR (Greedy with prefix)

```ts
// Maximum XOR of any two numbers in the array — O(32n)
function findMaximumXOR(nums: number[]): number {
  let max = 0, mask = 0;

  for (let i = 31; i >= 0; i--) {
    mask |= (1 << i);
    const prefixes = new Set(nums.map(n => n & mask));

    const candidate = max | (1 << i); // greedily try to set this bit
    for (const prefix of prefixes) {
      if (prefixes.has(prefix ^ candidate)) {
        max = candidate; // two numbers exist whose XOR has this bit set
        break;
      }
    }
  }
  return max;
}

console.log(findMaximumXOR([3, 10, 5, 25, 2, 8])); // 28
```

---

## Problem 9: Sum of Two Integers Without + or -

```ts
function getSum(a: number, b: number): number {
  while (b !== 0) {
    const carry = (a & b) << 1; // carry bits
    a = a ^ b;                   // sum without carry
    b = carry;
  }
  return a;
}

console.log(getSum(1, 2)); // 3
console.log(getSum(-1, 1)); // 0
```

---

## Bit Tricks Quick Reference

```ts
// All powers of 2 up to 2^30
Array.from({length: 31}, (_, i) => 1 << i);

// Iterate over all set bits in n
let tmp = n;
while (tmp) {
  const bit = tmp & (-tmp); // lowest set bit
  // process bit...
  tmp &= tmp - 1;           // clear it
}

// Check if bit i is set
const isSet = (n: number, i: number) => ((n >> i) & 1) === 1;

// Set bit i
const setBit = (n: number, i: number) => n | (1 << i);

// Clear bit i
const clearBit = (n: number, i: number) => n & ~(1 << i);

// Toggle bit i
const toggleBit = (n: number, i: number) => n ^ (1 << i);

// Extract lowest k bits
const lowKBits = (n: number, k: number) => n & ((1 << k) - 1);
```

---

## Common Mistakes

1. **JavaScript integers are 32-bit signed** — bit ops work on 32-bit signed integers; use `>>> 0` to treat as unsigned
2. **Shift overflow** — `1 << 31` is negative in JS (sign bit); use `2 ** 31` or `1n << 31n` for BigInt
3. **XOR confusion** — `^` in JS is XOR, not exponentiation (`**` is power)
4. **Forgetting `n > 0` in power-of-two check** — `isPowerOfTwo(0)` would return true without the guard
5. **Mutating during bitmask iteration** — use a copy `tmp = n` when iterating over set bits
