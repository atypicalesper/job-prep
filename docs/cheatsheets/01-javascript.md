# JavaScript Cheatsheet

## Types & Coercion

```js
// Primitives
typeof undefined  // 'undefined'
typeof null       // 'object' (historical bug)
typeof 42         // 'number'
typeof 'hi'       // 'string'
typeof true       // 'boolean'
typeof Symbol()   // 'symbol'
typeof 42n        // 'bigint'
typeof {}         // 'object'
typeof []         // 'object'
typeof function(){} // 'function'

// Check null
value === null
// Check array
Array.isArray(value)
// Check NaN
Number.isNaN(value)  // strict — not Number.isNaN('a') → false
isNaN('a')           // loose — coerces first → true (unreliable)

// Falsy values
false, 0, -0, 0n, '', null, undefined, NaN

// Nullish coalescing (only null/undefined, not 0/'')
const x = value ?? 'default'
// Optional chaining
const city = user?.address?.city
```

---

## Variables & Scope

```js
var   // function-scoped, hoisted, re-declarable
let   // block-scoped, TDZ, not re-declarable
const // block-scoped, TDZ, not re-assignable (objects still mutable)

// Hoisting
console.log(x) // undefined (var hoisted, not initialized)
var x = 5

console.log(y) // ReferenceError — TDZ (let/const)
let y = 5

// Closure
function counter() {
  let count = 0
  return () => ++count
}
const inc = counter()
inc() // 1, inc() // 2
```

---

## Functions

```js
// Declaration (hoisted)
function add(a, b) { return a + b }

// Expression (not hoisted)
const add = function(a, b) { return a + b }

// Arrow (no own this, arguments, cannot be constructor)
const add = (a, b) => a + b
const square = n => n * n

// Default params
function greet(name = 'World') { return `Hello, ${name}` }

// Rest & spread
function sum(...nums) { return nums.reduce((a, b) => a + b, 0) }
Math.max(...[1,2,3])

// Destructuring
const { name, age = 0 } = user
const { name: userName } = user          // rename
const [first, , third] = arr
const { address: { city } } = user       // nested
```

---

## Async / Promises

```js
// Promise states: pending → fulfilled | rejected

// Create
new Promise((resolve, reject) => {
  setTimeout(() => resolve('done'), 1000)
})

// Chain
fetch('/api')
  .then(r => r.json())
  .then(data => console.log(data))
  .catch(err => console.error(err))
  .finally(() => setLoading(false))

// async/await
async function load() {
  try {
    const res = await fetch('/api')
    const data = await res.json()
    return data
  } catch (e) {
    console.error(e)
  }
}

// Parallel
const [a, b] = await Promise.all([fetchA(), fetchB()])

// First to resolve
const result = await Promise.race([fast(), slow()])

// All settle (no short-circuit on rejection)
const results = await Promise.allSettled([...])
results.forEach(r => r.status === 'fulfilled' ? r.value : r.reason)

// First fulfilled
const first = await Promise.any([p1, p2, p3])  // throws AggregateError if all reject
```

---

## Array Methods

```js
// Immutable (return new array)
arr.map(x => x * 2)
arr.filter(x => x > 0)
arr.reduce((acc, x) => acc + x, 0)
arr.flatMap(x => [x, x * 2])       // map + flatten one level
arr.slice(1, 3)                     // [1,3) — non-destructive

// Find
arr.find(x => x.id === id)
arr.findIndex(x => x.id === id)
arr.indexOf(val)
arr.includes(val)
arr.some(x => x > 0)
arr.every(x => x > 0)

// Mutating
arr.push(...items)    // end
arr.pop()             // remove end
arr.unshift(x)        // start
arr.shift()           // remove start
arr.splice(i, n, ...items)   // remove n at i, insert items
arr.sort((a, b) => a - b)   // in-place, returns same array

// Create
Array.from({ length: 5 }, (_, i) => i)   // [0,1,2,3,4]
Array.from(new Set(arr))                  // deduplicate
[...arr1, ...arr2]                        // concat

// Flatten
arr.flat()          // 1 level
arr.flat(Infinity)  // all levels
```

---

## Object Methods

```js
Object.keys(obj)       // ['a','b']
Object.values(obj)     // [1,2]
Object.entries(obj)    // [['a',1],['b',2]]
Object.fromEntries(entries)

Object.assign({}, defaults, overrides)   // shallow merge
{ ...defaults, ...overrides }            // spread (same)
Object.freeze(obj)     // immutable (shallow)

// Check own property (not prototype)
Object.hasOwn(obj, 'key')  // preferred
obj.hasOwnProperty('key')  // older

// Destructure with rename + default
const { a: x = 0, b: y = 0 } = point
```

---

## Classes

```js
class Animal {
  #name            // private field

  constructor(name) {
    this.#name = name
  }

  get name() { return this.#name }

  speak() {
    return `${this.#name} makes a sound`
  }

  static create(name) { return new Animal(name) }
}

class Dog extends Animal {
  #breed

  constructor(name, breed) {
    super(name)
    this.#breed = breed
  }

  speak() {
    return `${super.speak()} — woof!`
  }
}
```

---

## Iterators & Generators

```js
// Custom iterable
const range = {
  [Symbol.iterator]() {
    let i = 0
    return {
      next() {
        return i < 5 ? { value: i++, done: false } : { done: true }
      }
    }
  }
}
for (const n of range) console.log(n)  // 0 1 2 3 4

// Generator
function* gen() {
  yield 1
  yield 2
  yield 3
}
const it = gen()
it.next()  // { value: 1, done: false }

// Infinite sequence
function* naturals() {
  let n = 0
  while (true) yield n++
}
```

---

## Proxy & Reflect

```js
const handler = {
  get(target, prop) {
    return prop in target ? target[prop] : `Property ${prop} not found`
  },
  set(target, prop, value) {
    if (typeof value !== 'number') throw new TypeError('Numbers only')
    target[prop] = value
    return true
  }
}
const p = new Proxy({}, handler)

// Reflect mirrors Object operations — useful in Proxy traps
Reflect.get(target, prop)
Reflect.set(target, prop, value)
```

---

## Error Handling

```js
// Custom errors
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
  }
}

try {
  throw new AppError('Not found', 404)
} catch (e) {
  if (e instanceof AppError) console.log(e.statusCode)
  else throw e  // re-throw unknown errors
} finally {
  cleanup()
}

// Unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason)
  process.exit(1)
})
```

---

## Map, Set, WeakMap, WeakRef

```js
// Map — any key type, ordered
const m = new Map()
m.set(obj, 'value')
m.get(obj)
m.has(obj)
m.delete(obj)
m.size
for (const [k, v] of m) {}

// Set — unique values
const s = new Set([1, 2, 2, 3])  // {1, 2, 3}
s.add(4); s.has(4); s.delete(4)
[...new Set(arr)]                 // deduplicate array

// WeakMap — keys are weakly held (GC can collect)
const cache = new WeakMap()
cache.set(domNode, computedData)  // auto-collected when node removed

// WeakRef
const ref = new WeakRef(heavyObject)
const obj = ref.deref()           // undefined if GC collected
```
