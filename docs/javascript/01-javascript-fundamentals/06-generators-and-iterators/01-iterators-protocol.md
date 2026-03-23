# Iterators and the Iterator Protocol

## What is an Iterator?

An **iterator** is any object that implements the **iterator protocol** — it has a `next()` method that returns `{ value, done }` objects.

```javascript
// Manual iterator:
function createRangeIterator(start, end) {
  let current = start;
  return {
    next() {
      if (current <= end) {
        return { value: current++, done: false };
      }
      return { value: undefined, done: true };
    }
  };
}

const iter = createRangeIterator(1, 3);
iter.next(); // { value: 1, done: false }
iter.next(); // { value: 2, done: false }
iter.next(); // { value: 3, done: false }
iter.next(); // { value: undefined, done: true }
iter.next(); // { value: undefined, done: true } — stays done
```

---

## The Iterable Protocol

An **iterable** is an object that implements `[Symbol.iterator]()` — a method that returns an iterator.

```javascript
const range = {
  from: 1,
  to: 5,
  [Symbol.iterator]() {  // Makes this object iterable
    let current = this.from;
    const last = this.to;
    return {
      next() {
        return current <= last
          ? { value: current++, done: false }
          : { value: undefined, done: true };
      }
    };
  }
};

// Now range is iterable:
for (const n of range) {
  console.log(n); // 1, 2, 3, 4, 5
}

[...range];          // [1, 2, 3, 4, 5]
Array.from(range);   // [1, 2, 3, 4, 5]
const [a, b] = range; // a=1, b=2
```

---

## Built-in Iterables

Many built-in types implement the iterable protocol:

```javascript
// Strings — iterates characters (Unicode code points, not bytes):
for (const char of 'hello') console.log(char); // h e l l o
[...'hello']; // ['h', 'e', 'l', 'l', 'o']

// Arrays:
for (const n of [1, 2, 3]) console.log(n);

// Map — iterates [key, value] pairs:
const map = new Map([['a', 1], ['b', 2]]);
for (const [key, val] of map) console.log(key, val);

// Set — iterates unique values:
const set = new Set([1, 2, 2, 3]);
for (const n of set) console.log(n); // 1, 2, 3

// Array entries, keys, values:
for (const [i, v] of ['a', 'b', 'c'].entries()) console.log(i, v);
```

---

## for...of vs for...in

```javascript
const arr = ['a', 'b', 'c'];
arr.custom = 'added'; // non-index property

// for...of — uses iterator protocol — values only
for (const v of arr) console.log(v); // 'a', 'b', 'c'

// for...in — enumerates keys (including inherited!) — avoid for arrays!
for (const k in arr) console.log(k); // '0', '1', '2', 'custom'
```

**Rule:** Always use `for...of` for arrays and other iterables. Use `for...in` only for plain objects (and with `hasOwnProperty` check).

---

## Making Objects Iterable — Practical Example

```javascript
class LinkedList {
  constructor() {
    this.head = null;
    this.size = 0;
  }

  append(value) {
    if (!this.head) {
      this.head = { value, next: null };
    } else {
      let current = this.head;
      while (current.next) current = current.next;
      current.next = { value, next: null };
    }
    this.size++;
    return this;
  }

  // Makes LinkedList iterable:
  [Symbol.iterator]() {
    let current = this.head;
    return {
      next() {
        if (current) {
          const value = current.value;
          current = current.next;
          return { value, done: false };
        }
        return { value: undefined, done: true };
      }
    };
  }
}

const list = new LinkedList();
list.append(1).append(2).append(3);

for (const n of list) console.log(n); // 1, 2, 3
[...list]; // [1, 2, 3]
```

---

## Return and Throw in Iterators

```javascript
// Full iterator protocol includes optional return() and throw():
function createIterator() {
  return {
    next()   { return { value: 1, done: false }; },
    return() {
      console.log('Iterator closed early');
      return { value: undefined, done: true };
    },
    throw(err) {
      console.error('Error thrown into iterator:', err);
      return { value: undefined, done: true };
    }
  };
}

// return() is called when for...of exits early (break, throw, return):
const obj = { [Symbol.iterator]: createIterator };
for (const v of obj) {
  if (v === 1) break; // triggers return()
}
// 'Iterator closed early'
```

---

## Spread, Destructuring, and Iterables

```javascript
// All of these use the iterator protocol:

// Spread operator:
const arr = [...someIterable];

// Destructuring:
const [first, second, ...rest] = someIterable;

// Array.from:
const arr2 = Array.from(someIterable);

// Promise.all, Promise.race etc. accept iterables:
await Promise.all(iterable);

// Map and Set constructors:
new Map(iterable); // iterable of [key, value] pairs
new Set(iterable);

// String.fromCodePoint, Math.max, etc. with spread
```

---

## Interview Questions

**Q: What is the difference between an iterable and an iterator?**
A: An **iterable** is an object with `[Symbol.iterator]()` method that returns an iterator. An **iterator** is an object with a `next()` method that returns `{ value, done }`. An iterable can produce iterators. A thing can be both (self-referential iterators common in generators).

**Q: What constructs use the iterator protocol?**
A: `for...of`, spread `[...]`, destructuring, `Array.from()`, `Promise.all()`, `new Map()`, `new Set()`, and any function/method that accepts iterables.

**Q: How do you make a custom class iterable?**
A: Implement `[Symbol.iterator]()` that returns an object with a `next()` method. The `next()` method returns `{ value: ..., done: false }` for each element and `{ value: undefined, done: true }` when complete.
