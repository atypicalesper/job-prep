# Strings and Arrays

The most common interview category. Techniques: hash maps for frequency/lookup, two pointers, sliding window, and clever index math.

---

## Problem 1: Longest Substring Without Repeating Characters

```ts
// Sliding window with a Map tracking last seen index.
// Time: O(n), Space: O(min(n, charset))

function lengthOfLongestSubstring(s: string): number {
  const seen = new Map<string, number>(); // char -> last index
  let left = 0;
  let maxLen = 0;

  for (let right = 0; right < s.length; right++) {
    const ch = s[right];
    if (seen.has(ch) && seen.get(ch)! >= left) {
      left = seen.get(ch)! + 1; // jump past the duplicate
    }
    seen.set(ch, right);
    maxLen = Math.max(maxLen, right - left + 1);
  }

  return maxLen;
}

console.log(lengthOfLongestSubstring('abcabcbb')); // 3 ("abc")
console.log(lengthOfLongestSubstring('bbbbb'));    // 1
console.log(lengthOfLongestSubstring('pwwkew'));   // 3 ("wke")
```

---

## Problem 2: Group Anagrams

```ts
// Key insight: sort each string to create a canonical form.
// All anagrams produce the same sorted key.
// Time: O(n * k log k) where k = max string length, Space: O(n * k)

function groupAnagrams(strs: string[]): string[][] {
  const map = new Map<string, string[]>();

  for (const s of strs) {
    const key = s.split('').sort().join('');
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }

  return Array.from(map.values());
}

console.log(groupAnagrams(['eat','tea','tan','ate','nat','bat']));
// [['eat','tea','ate'], ['tan','nat'], ['bat']]
```

---

## Problem 3: Longest Palindromic Substring

```ts
// Expand around center — try each index as center (odd and even length).
// Time: O(n^2), Space: O(1)

function longestPalindrome(s: string): string {
  let start = 0, maxLen = 0;

  function expand(l: number, r: number): void {
    while (l >= 0 && r < s.length && s[l] === s[r]) {
      if (r - l + 1 > maxLen) {
        start = l;
        maxLen = r - l + 1;
      }
      l--;
      r++;
    }
  }

  for (let i = 0; i < s.length; i++) {
    expand(i, i);     // odd length
    expand(i, i + 1); // even length
  }

  return s.slice(start, start + maxLen);
}

console.log(longestPalindrome('babad')); // 'bab' or 'aba'
console.log(longestPalindrome('cbbd'));  // 'bb'
```

---

## Problem 4: Minimum Window Substring

```ts
// Find smallest substring of s containing all characters of t.
// Variable sliding window with two maps + formed counter.
// Time: O(n + m), Space: O(n + m)

function minWindow(s: string, t: string): string {
  if (t.length > s.length) return '';

  const need = new Map<string, number>();
  for (const c of t) need.set(c, (need.get(c) ?? 0) + 1);

  const window = new Map<string, number>();
  let formed = 0;
  const required = need.size;

  let left = 0;
  let minLen = Infinity;
  let result = '';

  for (let right = 0; right < s.length; right++) {
    const c = s[right];
    window.set(c, (window.get(c) ?? 0) + 1);

    if (need.has(c) && window.get(c) === need.get(c)) formed++;

    while (formed === required) {
      if (right - left + 1 < minLen) {
        minLen = right - left + 1;
        result = s.slice(left, right + 1);
      }
      const leftChar = s[left];
      window.set(leftChar, window.get(leftChar)! - 1);
      if (need.has(leftChar) && window.get(leftChar)! < need.get(leftChar)!) {
        formed--;
      }
      left++;
    }
  }

  return result;
}

console.log(minWindow('ADOBECODEBANC', 'ABC')); // 'BANC'
console.log(minWindow('a', 'a'));               // 'a'
console.log(minWindow('a', 'aa'));              // ''
```

---

## Problem 5: Encode and Decode Strings

```ts
// Encode a list of strings into a single string and decode it back.
// Format: "length#string" for each entry. Handles any characters.
// Time: O(n), Space: O(n)

function encode(strs: string[]): string {
  return strs.map(s => `${s.length}#${s}`).join('');
}

function decode(s: string): string[] {
  const result: string[] = [];
  let i = 0;

  while (i < s.length) {
    const hashIdx = s.indexOf('#', i);
    const len = Number(s.slice(i, hashIdx));
    const str = s.slice(hashIdx + 1, hashIdx + 1 + len);
    result.push(str);
    i = hashIdx + 1 + len;
  }

  return result;
}

const encoded = encode(['hello', 'world', '', 'foo#bar']);
console.log(encoded);         // '5#hello5#world0#7#foo#bar'
console.log(decode(encoded)); // ['hello', 'world', '', 'foo#bar']
```

---

## Problem 6: String to Integer (atoi)

```ts
// Parse integer from string with whitespace, sign, and overflow handling.
// Time: O(n), Space: O(1)

function myAtoi(s: string): number {
  const INT_MAX = 2 ** 31 - 1;
  const INT_MIN = -(2 ** 31);
  let i = 0;

  // Skip whitespace
  while (i < s.length && s[i] === ' ') i++;

  // Handle sign
  let sign = 1;
  if (i < s.length && (s[i] === '+' || s[i] === '-')) {
    sign = s[i] === '-' ? -1 : 1;
    i++;
  }

  // Parse digits
  let result = 0;
  while (i < s.length && s[i] >= '0' && s[i] <= '9') {
    const digit = Number(s[i]);

    // Check for overflow before multiplying
    if (result > Math.floor((INT_MAX - digit) / 10)) {
      return sign === 1 ? INT_MAX : INT_MIN;
    }

    result = result * 10 + digit;
    i++;
  }

  return sign * result;
}

console.log(myAtoi('42'));           // 42
console.log(myAtoi('   -42'));       // -42
console.log(myAtoi('4193 with words')); // 4193
console.log(myAtoi('words and 987')); // 0
console.log(myAtoi('-91283472332')); // -2147483648 (INT_MIN)
```

---

## Problem 7: Zigzag Conversion

```ts
// Write string in zigzag across numRows, then read row by row.
// Simulate with an array of row strings and a direction flag.
// Time: O(n), Space: O(n)

function convert(s: string, numRows: number): string {
  if (numRows === 1 || numRows >= s.length) return s;

  const rows: string[] = new Array(numRows).fill('');
  let row = 0;
  let goingDown = false;

  for (const ch of s) {
    rows[row] += ch;
    // Reverse direction at top and bottom rows
    if (row === 0 || row === numRows - 1) goingDown = !goingDown;
    row += goingDown ? 1 : -1;
  }

  return rows.join('');
}

console.log(convert('PAYPALISHIRING', 3)); // 'PAHNAPLSIIGYIR'
console.log(convert('PAYPALISHIRING', 4)); // 'PINALSIGYAHRPI'
console.log(convert('A', 1));              // 'A'
```

---

## Problem 8: Product of Array Except Self

```ts
// For each index, product of all elements except self.
// Two passes: left products then right products.
// Time: O(n), Space: O(1) extra (output array doesn't count)

function productExceptSelf(nums: number[]): number[] {
  const n = nums.length;
  const result = new Array(n).fill(1);

  // Left pass: result[i] = product of all elements to the left
  let leftProduct = 1;
  for (let i = 0; i < n; i++) {
    result[i] = leftProduct;
    leftProduct *= nums[i];
  }

  // Right pass: multiply by product of all elements to the right
  let rightProduct = 1;
  for (let i = n - 1; i >= 0; i--) {
    result[i] *= rightProduct;
    rightProduct *= nums[i];
  }

  return result;
}

console.log(productExceptSelf([1, 2, 3, 4]));   // [24, 12, 8, 6]
console.log(productExceptSelf([-1, 1, 0, -3, 3])); // [0, 0, 9, 0, 0]
```

---

## Problem 9: Rotate Array

```ts
// Rotate array to the right by k steps.
// Approach: reverse entire array, reverse first k, reverse rest.
// Time: O(n), Space: O(1)

function rotate(nums: number[], k: number): void {
  k = k % nums.length;
  if (k === 0) return;

  function reverse(l: number, r: number): void {
    while (l < r) {
      [nums[l], nums[r]] = [nums[r], nums[l]];
      l++;
      r--;
    }
  }

  reverse(0, nums.length - 1); // reverse all
  reverse(0, k - 1);           // reverse first k
  reverse(k, nums.length - 1); // reverse rest
}

const arr1 = [1, 2, 3, 4, 5, 6, 7];
rotate(arr1, 3);
console.log(arr1); // [5, 6, 7, 1, 2, 3, 4]

const arr2 = [-1, -100, 3, 99];
rotate(arr2, 2);
console.log(arr2); // [3, 99, -1, -100]
```

---

## Problem 10: Next Permutation

```ts
// Find the next lexicographically greater permutation. Modify in-place.
// 1. Find largest i where nums[i] < nums[i+1] (rightmost ascent)
// 2. Find largest j where nums[j] > nums[i]
// 3. Swap i and j
// 4. Reverse everything after position i
// Time: O(n), Space: O(1)

function nextPermutation(nums: number[]): void {
  const n = nums.length;

  // Step 1: find rightmost ascent
  let i = n - 2;
  while (i >= 0 && nums[i] >= nums[i + 1]) i--;

  if (i >= 0) {
    // Step 2: find rightmost element greater than nums[i]
    let j = n - 1;
    while (nums[j] <= nums[i]) j--;

    // Step 3: swap
    [nums[i], nums[j]] = [nums[j], nums[i]];
  }

  // Step 4: reverse from i+1 to end
  let left = i + 1, right = n - 1;
  while (left < right) {
    [nums[left], nums[right]] = [nums[right], nums[left]];
    left++;
    right--;
  }
}

const p1 = [1, 2, 3];
nextPermutation(p1);
console.log(p1); // [1, 3, 2]

const p2 = [3, 2, 1];
nextPermutation(p2);
console.log(p2); // [1, 2, 3]

const p3 = [1, 1, 5];
nextPermutation(p3);
console.log(p3); // [1, 5, 1]
```

---

## String & Array Patterns

```
Problem                        Technique                 Time
--------------------------------------------------------------
Longest substring no repeat    Sliding window + Map      O(n)
Group anagrams                 Sort-as-key + HashMap     O(nk log k)
Longest palindromic substring  Expand around center      O(n^2)
Minimum window substring       Variable sliding window   O(n + m)
Encode/decode strings          Length-prefix format       O(n)
atoi                           Sequential parse + clamp  O(n)
Zigzag conversion              Row simulation            O(n)
Product except self            Left/right product pass   O(n)
Rotate array                   Triple reverse             O(n)
Next permutation               Find ascent + swap + rev  O(n)
```
