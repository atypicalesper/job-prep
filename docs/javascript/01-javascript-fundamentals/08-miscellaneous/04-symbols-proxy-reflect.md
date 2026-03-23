# Symbols, Proxy & Reflect

## Symbol

A `Symbol` is a guaranteed-unique primitive value. Useful as unique property keys, protocol hooks, and metadata.

```js
// Every Symbol() call creates a unique value
const s1 = Symbol('description');
const s2 = Symbol('description');
s1 === s2; // false — always unique

// As object property keys — won't collide with string keys
const id = Symbol('id');
const user = {
  name: 'Alice',
  [id]: 123,             // symbol key
};

user[id];                // 123
user.name;               // 'Alice'
Object.keys(user);       // ['name'] — symbol not included
JSON.stringify(user);    // '{"name":"Alice"}' — symbol not serialized
Object.getOwnPropertySymbols(user); // [Symbol(id)]

// Symbol.for — global registry, shared across modules
const sharedId = Symbol.for('app.userId');
Symbol.for('app.userId') === Symbol.for('app.userId'); // true
Symbol.keyFor(sharedId); // 'app.userId'
```

### Well-Known Symbols

Override built-in JavaScript protocols:

```js
// Symbol.iterator — make any object iterable
class Range {
  constructor(start, end) { this.start = start; this.end = end; }
  [Symbol.iterator]() {
    let current = this.start;
    return {
      next: () => current <= this.end
        ? { value: current++, done: false }
        : { value: undefined, done: true }
    };
  }
}
[...new Range(1, 5)]; // [1, 2, 3, 4, 5]

// Symbol.toPrimitive — control type coercion
class Temperature {
  constructor(celsius) { this.celsius = celsius; }
  [Symbol.toPrimitive](hint) {
    if (hint === 'number') return this.celsius;
    if (hint === 'string') return `${this.celsius}°C`;
    return this.celsius; // default
  }
}
const t = new Temperature(100);
+t;          // 100 (number hint)
`${t}`;      // '100°C' (string hint)
t + 0;       // 100 (default hint)

// Symbol.hasInstance — customize instanceof
class EvenNumber {
  static [Symbol.hasInstance](n) { return Number.isInteger(n) && n % 2 === 0; }
}
4 instanceof EvenNumber;  // true
3 instanceof EvenNumber;  // false
'a' instanceof EvenNumber; // false

// Symbol.toStringTag — customize Object.prototype.toString
class Queue {
  get [Symbol.toStringTag]() { return 'Queue'; }
}
Object.prototype.toString.call(new Queue()); // '[object Queue]'

// Symbol.species — control subclass creation in map/filter
class MyArray extends Array {
  static get [Symbol.species]() { return Array; } // map/filter return plain Array, not MyArray
}

// Symbol.asyncIterator
class DelayedRange {
  constructor(start, end, delayMs) { this.start = start; this.end = end; this.delayMs = delayMs; }
  [Symbol.asyncIterator]() {
    let current = this.start;
    return {
      next: async () => {
        await new Promise(r => setTimeout(r, this.delayMs));
        return current <= this.end
          ? { value: current++, done: false }
          : { value: undefined, done: true };
      }
    };
  }
}

for await (const n of new DelayedRange(1, 3, 100)) {
  console.log(n); // 1, 2, 3 (100ms apart)
}
```

---

## Proxy

Intercept and redefine fundamental object operations:

```js
const handler = {
  // Property access
  get(target, prop, receiver) {
    console.log(`GET ${prop}`);
    return Reflect.get(target, prop, receiver);
  },
  // Property assignment
  set(target, prop, value, receiver) {
    console.log(`SET ${prop} = ${value}`);
    return Reflect.set(target, prop, value, receiver);
  },
  // 'in' operator
  has(target, prop) {
    return prop in target;
  },
  // delete operator
  deleteProperty(target, prop) {
    console.log(`DELETE ${prop}`);
    return Reflect.deleteProperty(target, prop);
  },
  // Object.keys() / for...in
  ownKeys(target) { return Reflect.ownKeys(target); },
  // Object.getOwnPropertyDescriptor
  getOwnPropertyDescriptor(target, prop) {
    return Reflect.getOwnPropertyDescriptor(target, prop);
  },
  // new operator
  construct(target, args) { return Reflect.construct(target, args); },
  // Function call
  apply(target, thisArg, args) { return Reflect.apply(target, thisArg, args); },
};
```

### Practical Proxy Patterns

```js
// 1. Validation / schema enforcement
function createValidated(schema) {
  return new Proxy({}, {
    set(target, prop, value) {
      if (prop in schema) {
        const { type, required, min, max } = schema[prop];
        if (typeof value !== type)
          throw new TypeError(`${prop}: expected ${type}, got ${typeof value}`);
        if (min !== undefined && value < min)
          throw new RangeError(`${prop}: ${value} < min ${min}`);
        if (max !== undefined && value > max)
          throw new RangeError(`${prop}: ${value} > max ${max}`);
      }
      target[prop] = value;
      return true;
    }
  });
}

const user = createValidated({
  age: { type: 'number', min: 0, max: 150 },
  name: { type: 'string' },
});
user.age = 25;       // ok
user.age = 'old';    // TypeError

// 2. Default values
const withDefaults = (target, defaults) => new Proxy(target, {
  get: (obj, prop) => prop in obj ? obj[prop] : defaults[prop],
});

const config = withDefaults({}, { theme: 'dark', lang: 'en', timeout: 5000 });
config.theme;   // 'dark'
config.timeout; // 5000

// 3. Negative array indexing
function negativeIndex(arr) {
  return new Proxy(arr, {
    get(target, prop) {
      const i = Number(prop);
      if (i < 0) return target[target.length + i];
      return Reflect.get(target, prop);
    }
  });
}
const arr = negativeIndex([1, 2, 3, 4, 5]);
arr[-1]; // 5
arr[-2]; // 4

// 4. Read-only object
const readonly = (target) => new Proxy(target, {
  set() { throw new TypeError('Object is read-only'); },
  deleteProperty() { throw new TypeError('Object is read-only'); },
});

// 5. Lazy loading / virtual properties
const lazyLoad = (loaders) => new Proxy({}, {
  get(target, prop) {
    if (!(prop in target) && prop in loaders) {
      target[prop] = loaders[prop](); // load on first access
    }
    return target[prop];
  }
});

const services = lazyLoad({
  db: () => new DatabaseConnection(),
  cache: () => new RedisClient(),
});
services.db; // DB initialized only on first access

// 6. Tracing / logging (for debugging)
function createSpy(target, name = 'Object') {
  return new Proxy(target, {
    get(obj, prop) {
      const val = obj[prop];
      if (typeof val === 'function') {
        return function(...args) {
          console.log(`[${name}].${prop}(${args.map(a => JSON.stringify(a)).join(', ')})`);
          return val.apply(obj, args);
        };
      }
      return val;
    }
  });
}
```

---

## Reflect

`Reflect` is a built-in object providing methods that mirror the Proxy traps. Always use `Reflect` inside Proxy traps instead of direct operations — it handles edge cases correctly (e.g., `receiver` for inherited getters/setters).

```js
// Reflect mirrors Object operations but returns boolean instead of throwing
Reflect.get(target, prop, receiver)         // target[prop]
Reflect.set(target, prop, value, receiver)  // target[prop] = value → returns boolean
Reflect.has(target, prop)                   // prop in target
Reflect.deleteProperty(target, prop)        // delete target[prop] → returns boolean
Reflect.ownKeys(target)                     // Object.getOwnPropertyNames + Symbols
Reflect.defineProperty(target, prop, desc)  // Object.defineProperty → boolean (no throw)
Reflect.getPrototypeOf(target)              // Object.getPrototypeOf
Reflect.setPrototypeOf(target, proto)       // Object.setPrototypeOf → boolean
Reflect.apply(fn, thisArg, args)            // fn.apply(thisArg, args)
Reflect.construct(Target, args, newTarget)  // new Target(...args)

// Why Reflect instead of direct?
// ❌ Dangerous — bypasses receiver (breaks inherited setters)
set(target, prop, value) {
  target[prop] = value; // wrong!
  return true;
}
// ✅ Correct — passes receiver through
set(target, prop, value, receiver) {
  return Reflect.set(target, prop, value, receiver);
}

// Reflect.construct with new.target for proper prototype chain
class Base { constructor(x) { this.x = x; } }
class Derived extends Base {}

// Construct Derived but using Base's constructor
const obj = Reflect.construct(Base, [42], Derived);
obj instanceof Derived; // true
obj.x;                  // 42
```

### Reflect vs Object methods

| Operation | Object | Reflect |
|---|---|---|
| Define property | `Object.defineProperty` (throws) | `Reflect.defineProperty` (returns bool) |
| Delete property | `delete obj.prop` (returns bool) | `Reflect.deleteProperty` (returns bool) |
| Get prototype | `Object.getPrototypeOf` | `Reflect.getPrototypeOf` |
| Set prototype | `Object.setPrototypeOf` | `Reflect.setPrototypeOf` (returns bool) |
| Check own property | `Object.prototype.hasOwnProperty` | `Reflect.has` checks chain |
| Own keys | `Object.keys` (enumerable strings) | `Reflect.ownKeys` (all including symbols) |

---

## WeakMap and WeakSet

Hold **weak references** — objects they reference can be garbage collected.

```js
// WeakMap: keys must be objects, no iteration, no .size
const cache = new WeakMap();

function process(obj) {
  if (cache.has(obj)) return cache.get(obj); // cached
  const result = expensiveOperation(obj);
  cache.set(obj, result);
  return result;
}

// When obj is garbage collected → cache entry is automatically removed
// Perfect for: private data, memoization per object, DOM node metadata

// Private data pattern (pre-# fields)
const _private = new WeakMap();

class Person {
  constructor(name, age) {
    _private.set(this, { name, age });
  }
  getName() { return _private.get(this).name; }
  getAge() { return _private.get(this).age; }
}

// WeakSet: only objects, no iteration
const seen = new WeakSet();

function processOnce(obj) {
  if (seen.has(obj)) return;
  seen.add(obj);
  // process obj...
}

// WeakRef (ES2021) — hold a reference that doesn't prevent GC
class FinalizationTracker {
  #registry = new FinalizationRegistry((key) => {
    console.log(`Object with key ${key} was garbage collected`);
  });

  track(obj, key) {
    this.#registry.register(obj, key);
    return new WeakRef(obj);
  }
}
```

### Map vs WeakMap

| | Map | WeakMap |
|---|---|---|
| Key types | Any | Objects only |
| Iterable | Yes (`.keys()`, `.values()`) | No |
| `.size` | Yes | No |
| GC behavior | Holds strong reference | Allows GC of key |
| Use case | General key-value | Per-object metadata, caches |
