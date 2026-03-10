# Generators

## What is a Generator?

A generator function returns a **generator object** — an iterator that can pause and resume execution. The `yield` keyword pauses the function and returns a value.

```javascript
function* counter() {  // function* syntax
  console.log('start');
  yield 1;             // pause, return { value: 1, done: false }
  console.log('middle');
  yield 2;             // pause, return { value: 2, done: false }
  console.log('end');
  return 3;            // { value: 3, done: true } — function complete
}

const gen = counter(); // creates generator object (doesn't run yet!)
gen.next(); // 'start' → { value: 1, done: false }
gen.next(); // 'middle' → { value: 2, done: false }
gen.next(); // 'end' → { value: 3, done: true }
gen.next(); // { value: undefined, done: true } — already done
```

The generator is **lazy** — code runs only when `.next()` is called.

---

## yield* — Delegating to Another Iterable

```javascript
function* inner() {
  yield 'a';
  yield 'b';
}

function* outer() {
  yield 1;
  yield* inner(); // delegate to inner — 'a', 'b' are yielded
  yield* [3, 4]; // yield* works with any iterable
  yield 5;
}

[...outer()]; // [1, 'a', 'b', 3, 4, 5]
```

---

## Generators are Iterators AND Iterables

```javascript
function* range(start, end, step = 1) {
  for (let i = start; i <= end; i += step) {
    yield i;
  }
}

const r = range(1, 10, 2);

// As iterator:
r.next(); // { value: 1, done: false }
r.next(); // { value: 3, done: false }

// As iterable (has [Symbol.iterator] that returns itself):
for (const n of range(1, 5)) console.log(n); // 1 2 3 4 5
[...range(1, 5)]; // [1, 2, 3, 4, 5]
```

---

## Infinite Sequences

Generators are perfect for infinite sequences:

```javascript
function* fibonacci() {
  let [a, b] = [0, 1];
  while (true) { // infinite!
    yield a;
    [a, b] = [b, a + b];
  }
}

function* naturals() {
  let n = 1;
  while (true) yield n++;
}

// Take first N from infinite sequence:
function take(n, iter) {
  const result = [];
  for (const val of iter) {
    result.push(val);
    if (result.length >= n) break;
  }
  return result;
}

take(8, fibonacci()); // [0, 1, 1, 2, 3, 5, 8, 13]
take(5, naturals());  // [1, 2, 3, 4, 5]
```

---

## Two-Way Communication: next(value)

You can pass values INTO a generator via `next(value)`:

```javascript
function* calculator() {
  let total = 0;
  while (true) {
    const input = yield total; // pauses AND receives the next value
    if (input === null) break;
    total += input;
  }
  return total;
}

const calc = calculator();
calc.next();     // { value: 0, done: false } — initialize (first next has no effect on yield)
calc.next(10);   // { value: 10, done: false } — added 10
calc.next(20);   // { value: 30, done: false } — added 20
calc.next(5);    // { value: 35, done: false } — added 5
calc.next(null); // { value: 35, done: true }  — done
```

**Note:** The first `next()` call cannot pass a value (there's no `yield` waiting to receive it yet).

---

## return() and throw()

```javascript
function* gen() {
  try {
    yield 1;
    yield 2;
    yield 3;
  } finally {
    console.log('cleanup'); // always runs
  }
}

const g = gen();
g.next();     // { value: 1, done: false }

// Forcefully terminate:
g.return(99); // logs 'cleanup' → { value: 99, done: true }
g.next();     // { value: undefined, done: true }

// Throw an error into the generator:
const g2 = gen();
g2.next();   // { value: 1, done: false }
g2.throw(new Error('oops')); // logs 'cleanup', throws if not caught inside
```

---

## Practical Use Cases

### Lazy Data Transformation Pipeline

```javascript
function* map(iter, fn) {
  for (const val of iter) yield fn(val);
}

function* filter(iter, pred) {
  for (const val of iter) {
    if (pred(val)) yield val;
  }
}

function* take(n, iter) {
  let count = 0;
  for (const val of iter) {
    yield val;
    if (++count >= n) return;
  }
}

// Lazy pipeline — only computes what's needed:
const result = take(3,
  filter(
    map(naturals(), x => x * x),  // square of naturals: 1,4,9,16,...
    x => x % 2 === 0              // even squares: 4,16,36,...
  )
);

[...result]; // [4, 16, 36] — only computed 6 naturals!
```

### Unique ID Generator

```javascript
function* idGenerator(prefix = '') {
  let id = 1;
  while (true) {
    yield `${prefix}${id++}`;
  }
}

const userIds  = idGenerator('USR-');
const orderIds = idGenerator('ORD-');

userIds.next().value;  // 'USR-1'
userIds.next().value;  // 'USR-2'
orderIds.next().value; // 'ORD-1'
userIds.next().value;  // 'USR-3'
```

### State Machine

```javascript
function* trafficLight() {
  while (true) {
    yield 'green';
    yield 'yellow';
    yield 'red';
  }
}

const light = trafficLight();
light.next().value; // 'green'
light.next().value; // 'yellow'
light.next().value; // 'red'
light.next().value; // 'green' (repeats)
```

---

## Generator vs Regular Function

| | Regular Function | Generator |
|--|-----------------|-----------|
| Return type | Single value | Multiple values (lazy) |
| Execution | Run to completion | Pauseable |
| State | No internal state between calls | Maintains state between `yield` |
| Used for | Computation | Sequences, state machines, co-routines |

---

## Interview Questions

**Q: What does `yield` do?**
A: `yield` pauses the generator function and returns a value to the caller as `{ value, done: false }`. Execution resumes on the next `next()` call, optionally receiving a value passed to `next(value)`.

**Q: What is the difference between return and yield in a generator?**
A: `yield` pauses and produces a value while `done` remains `false`. `return` ends the generator and produces a final value with `done: true`. After `return`, further `next()` calls return `{ value: undefined, done: true }`.

**Q: Why are generators useful for infinite sequences?**
A: Generators are lazy — they compute values on demand. An infinite `while(true)` loop with `yield` only runs as far as the consumer requests. No memory is wasted pre-computing all values.
