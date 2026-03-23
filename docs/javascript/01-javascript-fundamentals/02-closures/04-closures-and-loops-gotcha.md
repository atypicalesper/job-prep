# Closures and Loops — The Classic Gotcha

## The Problem

This is one of the most famous JavaScript interview questions. What does this log?

```javascript
for (var i = 0; i < 3; i++) {
  setTimeout(function() {
    console.log(i);
  }, 1000);
}
```

**Expected by most beginners:** `0 1 2`

**Actual output:** `3 3 3`

---

## Why This Happens — Deep Explanation

### Step 1: var is function-scoped (not block-scoped)

There is only **one** `i` variable. All three iterations of the loop share the same `i`.

```
Memory after loop runs:
┌─────────────────┐
│  i = 3          │  ← single i, shared by all closures
└─────────────────┘
       ↑   ↑   ↑
       │   │   │
   fn1 fn2 fn3    (three closures all reference the SAME i)
```

### Step 2: Closures capture references, not values

The three callbacks each close over a **reference** to `i` — not the value of `i` at the time the closure was created.

### Step 3: Loop finishes before callbacks run

`setTimeout(fn, 1000)` — the loop runs 3 times SYNCHRONOUSLY, scheduling 3 callbacks. The loop finishes (i becomes 3) BEFORE any callbacks run.

```
Timeline:
t=0ms: i=0, setTimeout queued
t=0ms: i=1, setTimeout queued
t=0ms: i=2, setTimeout queued
t=0ms: loop ends, i=3
t=1000ms: callback 1 runs → logs i → logs 3
t=1000ms: callback 2 runs → logs i → logs 3
t=1000ms: callback 3 runs → logs i → logs 3
```

---

## Fix 1: Use `let` (Block-Scoped)

`let` creates a **new binding per iteration** of the for loop. Each closure captures its own copy.

```javascript
for (let i = 0; i < 3; i++) {
  setTimeout(function() {
    console.log(i);
  }, 1000);
}
// Output: 0 1 2 ✅

// How JS handles let in for loops internally:
// Iteration 0: new scope { i: 0 }, callback closes over this scope's i
// Iteration 1: new scope { i: 1 }, callback closes over this scope's i
// Iteration 2: new scope { i: 2 }, callback closes over this scope's i
```

This is the simplest and most idiomatic fix. **Always prefer `let` over `var` in loops.**

---

## Fix 2: IIFE (Immediately Invoked Function Expression)

Before `let` existed (ES5 era), the standard fix was an IIFE to create a new scope:

```javascript
for (var i = 0; i < 3; i++) {
  (function(j) {          // j is a NEW variable per iteration
    setTimeout(function() {
      console.log(j);     // closes over j, not i
    }, 1000);
  })(i);                  // pass current value of i as argument
}
// Output: 0 1 2 ✅

// Why it works:
// Each IIFE call creates a new function scope with its own 'j'
// The value of i at each iteration is PASSED BY VALUE into j
```

---

## Fix 3: .bind() to Pass Value

```javascript
function logValue(val) {
  console.log(val);
}

for (var i = 0; i < 3; i++) {
  setTimeout(logValue.bind(null, i), 1000);
  // bind creates a new function with i's current value baked in
}
// Output: 0 1 2 ✅
```

---

## Fix 4: Array + forEach

```javascript
[0, 1, 2].forEach(function(i) {
  setTimeout(function() {
    console.log(i); // i is a parameter — new per call
  }, 1000);
});
// Output: 0 1 2 ✅
```

---

## Async Closures in Loops

The problem isn't limited to `setTimeout`. Any async operation in a loop with `var` has this issue:

```javascript
// ❌ All callbacks see i = 3
for (var i = 0; i < 3; i++) {
  fetch(`/api/items/${i}`)
    .then(res => console.log(`Response for: ${i}`)); // always 3
}

// ✅ Each iteration captures its own i
for (let i = 0; i < 3; i++) {
  fetch(`/api/items/${i}`)
    .then(res => console.log(`Response for: ${i}`)); // 0, 1, 2
}
```

---

## The async/await in Loop Pattern

A common modern pitfall — using `await` in forEach:

```javascript
// ❌ forEach does NOT await — all run concurrently (or in wrong order)
const ids = [1, 2, 3];

ids.forEach(async (id) => {
  const data = await fetchUser(id);
  console.log(data); // order not guaranteed
});
console.log('done'); // logs BEFORE any fetch completes!
```

```javascript
// ✅ Sequential with for...of
for (const id of ids) {
  const data = await fetchUser(id); // actually awaited
  console.log(data);
}
console.log('done'); // logs AFTER all fetches complete

// ✅ Parallel with Promise.all
const results = await Promise.all(ids.map(id => fetchUser(id)));
results.forEach(data => console.log(data));
```

---

## Closure Over Mutable Object

Closures capture variable references — including object references:

```javascript
function makeProcessor() {
  const config = { multiplier: 2 };

  return {
    process(x) { return x * config.multiplier; },
    update(m)  { config.multiplier = m; }  // mutates shared object
  };
}

const proc = makeProcessor();
proc.process(5);  // 10
proc.update(3);
proc.process(5);  // 15 — config was mutated!
```

This is powerful but can be surprising. Both `process` and `update` share the SAME `config` object.

---

## The setTimeout 0 with var — Variations

```javascript
// Variation 1: What's the output?
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), i * 100);
}
// Output: 3 3 3 (still! even with different delays)
// All callbacks run after loop finishes

// Variation 2: with let
for (let i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), i * 100);
}
// Output: 0 (at 0ms), 1 (at 100ms), 2 (at 200ms)

// Variation 3: mixed
for (var i = 0; i < 3; i++) {
  const captured = i; // new const per iteration block
  setTimeout(() => console.log(captured), 1000);
}
// Output: 0 1 2 ✅ (const is block-scoped!)
```

---

## Event Listeners in Loops

```javascript
const buttons = document.querySelectorAll('button');

// ❌ All buttons log the same final i
for (var i = 0; i < buttons.length; i++) {
  buttons[i].addEventListener('click', function() {
    console.log('Button', i); // i = buttons.length
  });
}

// ✅ Each listener captures its own i
for (let i = 0; i < buttons.length; i++) {
  buttons[i].addEventListener('click', function() {
    console.log('Button', i);
  });
}

// ✅ Or store on element
for (var i = 0; i < buttons.length; i++) {
  buttons[i].dataset.index = i;
  buttons[i].addEventListener('click', function() {
    console.log('Button', this.dataset.index);
  });
}
```

---

## Interview Questions

**Q: What does the following output and why?**
```javascript
for (var i = 0; i < 5; i++) {
  setTimeout(() => console.log(i), 0);
}
```
A: `5 5 5 5 5`. `var` is function-scoped, all closures reference the same `i`, and by the time callbacks run, the loop has set `i = 5`.

**Q: Name three ways to fix the loop closure bug.**
A: 1) Use `let` instead of `var`, 2) Use IIFE to create new scope per iteration, 3) Use `.bind()` to pass value at call time.

**Q: Does this happen with const too?**
A: `const` can't be used in a for loop's update clause (`i++`), so it's not a typical pattern. But `const` in a block IS re-created per iteration, just like `let`.

**Q: Why does let fix this?**
A: For-loop with `let` creates a NEW binding for `i` on each iteration. Each closure captures a different binding, so mutations in later iterations don't affect earlier closures.
