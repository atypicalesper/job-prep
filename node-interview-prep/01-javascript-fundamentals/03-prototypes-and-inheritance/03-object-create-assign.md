# Object.create, Object.assign, and Copying Objects

## Object.create(proto)

Creates a new object with a specified prototype. The most explicit way to set up prototype chains.

```javascript
const animal = {
  breathe() { return `${this.name} breathes`; },
  type: 'animal'
};

const dog = Object.create(animal); // dog's proto = animal
dog.name = 'Rex';
dog.bark = function() { return 'Woof!'; };

dog.breathe(); // 'Rex breathes' — inherited
dog.bark();    // 'Woof!'        — own method
dog.type;      // 'animal'       — inherited

Object.getPrototypeOf(dog) === animal; // true
```

### Object.create(null) — Prototype-less Object

```javascript
const dict = Object.create(null); // NO prototype at all!

dict.name = 'Alice';
dict.age = 30;

dict.hasOwnProperty; // undefined — no inherited methods!
dict.toString;       // undefined
dict.__proto__;      // undefined

// Useful as a pure hash map — no prototype pollution risk
// No accidental property conflicts with Object.prototype methods
for (const key in dict) {
  // Safe — no inherited properties to filter out
  console.log(key, dict[key]);
}
```

### Inheritance with Object.create

```javascript
// Pre-ES6 inheritance pattern:
function Animal(name) {
  this.name = name;
}
Animal.prototype.speak = function() {
  return `${this.name} makes a noise`;
};

function Dog(name, breed) {
  Animal.call(this, name); // own properties
  this.breed = breed;
}

// Set up prototype chain:
Dog.prototype = Object.create(Animal.prototype); // NOT = Animal.prototype!
Dog.prototype.constructor = Dog; // restore constructor reference

Dog.prototype.bark = function() {
  return `${this.name} barks!`;
};

const rex = new Dog('Rex', 'Lab');
rex.speak(); // 'Rex makes a noise' — from Animal.prototype
rex.bark();  // 'Rex barks!'        — from Dog.prototype
rex instanceof Animal; // true
rex instanceof Dog;    // true
```

---

## Object.assign(target, ...sources)

Copies **own enumerable** properties from one or more source objects into a target. **Shallow copy only.**

```javascript
const defaults = { theme: 'light', lang: 'en', debug: false };
const userPrefs = { theme: 'dark', fontSize: 14 };

const config = Object.assign({}, defaults, userPrefs);
// {} — new object (target)
// copies defaults: theme='light', lang='en', debug=false
// copies userPrefs: theme='dark' (overrides), fontSize=14

config; // { theme: 'dark', lang: 'en', debug: false, fontSize: 14 }
// Original objects unmodified
```

### Shallow Copy Problem

```javascript
const original = {
  name: 'Alice',
  scores: [90, 85, 92],     // nested array
  address: { city: 'NYC' }  // nested object
};

const copy = Object.assign({}, original);

copy.name = 'Bob';          // safe — primitive, doesn't affect original
copy.scores.push(88);       // MUTATES original.scores! (same reference)
copy.address.city = 'LA';   // MUTATES original.address! (same reference)

original.name;   // 'Alice' — unaffected
original.scores; // [90, 85, 92, 88] — MUTATED!
original.address.city; // 'LA' — MUTATED!
```

### Object.assign Gotchas

```javascript
// 1. Only copies OWN ENUMERABLE properties
const proto = { inherited: 'yes' };
const obj = Object.create(proto);
obj.own = 'yes';

const copy = Object.assign({}, obj);
copy.own;       // 'yes' — copied
copy.inherited; // undefined — NOT copied (inherited, not own)

// 2. Overwrites existing target properties
const target = { a: 1, b: 2 };
Object.assign(target, { b: 99, c: 3 }); // b is overwritten!
target; // { a: 1, b: 99, c: 3 }

// 3. Returns the target (mutated!)
const result = Object.assign(target, { d: 4 });
result === target; // true — same reference!

// 4. Does NOT copy non-enumerable properties
const src = {};
Object.defineProperty(src, 'hidden', {
  value: 'secret',
  enumerable: false
});
const copy2 = Object.assign({}, src);
copy2.hidden; // undefined — non-enumerable not copied
```

---

## Spread Operator — Shallow Copy

The spread operator `{...obj}` is equivalent to `Object.assign({}, obj)`:

```javascript
const a = { x: 1, y: 2 };
const b = { ...a, z: 3 };   // { x: 1, y: 2, z: 3 }
const c = { z: 0, ...a };   // { z: 2, x: 1, y: 2 } — spread overwrites z? No:

// Order matters:
const c2 = { z: 0, ...a };  // z=0 then a's properties: { z: 0, x: 1, y: 2 }
// Wait — a doesn't have z, so z stays 0: { z: 0, x: 1, y: 2 }
const c3 = { ...a, z: 0 };  // a's props then z: { x: 1, y: 2, z: 0 }
```

---

## Deep Copy Strategies

### 1. structuredClone (Modern — ES2022, Node.js 17+)

```javascript
const original = {
  name: 'Alice',
  scores: [90, 85],
  address: { city: 'NYC' },
  date: new Date(),          // ✅ handles Date
  map: new Map([['a', 1]]), // ✅ handles Map
  set: new Set([1, 2, 3]),  // ✅ handles Set
};

const deep = structuredClone(original);

deep.scores.push(100);
deep.address.city = 'LA';

original.scores; // [90, 85] — unaffected!
original.address.city; // 'NYC' — unaffected!

// ❌ Limitations:
// - Cannot clone functions
// - Cannot clone class instances (loses prototype)
// - Cannot clone circular references in some cases
```

### 2. JSON Round-trip (Common but Limited)

```javascript
const deep = JSON.parse(JSON.stringify(original));

// ❌ Loses:
// - undefined values (dropped)
// - Functions (dropped)
// - Date (converted to string!)
// - Map, Set (converted to {} or [])
// - RegExp (converted to {})
// - Circular references (throws!)
// - NaN/Infinity (converted to null)

// ✅ Works for plain data with no special types
const config = { host: 'localhost', port: 5432, debug: true };
const configCopy = JSON.parse(JSON.stringify(config)); // fine
```

### 3. Manual Deep Clone

```javascript
function deepClone(obj, seen = new WeakMap()) {
  if (obj === null || typeof obj !== 'object') return obj; // primitive
  if (seen.has(obj)) return seen.get(obj);     // circular reference

  if (obj instanceof Date)   return new Date(obj);
  if (obj instanceof RegExp) return new RegExp(obj.source, obj.flags);
  if (obj instanceof Map) {
    const map = new Map();
    seen.set(obj, map);
    obj.forEach((v, k) => map.set(deepClone(k, seen), deepClone(v, seen)));
    return map;
  }
  if (obj instanceof Set) {
    const set = new Set();
    seen.set(obj, set);
    obj.forEach(v => set.add(deepClone(v, seen)));
    return set;
  }

  const clone = Array.isArray(obj) ? [] : Object.create(Object.getPrototypeOf(obj));
  seen.set(obj, clone);

  for (const key of Reflect.ownKeys(obj)) { // includes Symbols!
    clone[key] = deepClone(obj[key], seen);
  }

  return clone;
}
```

---

## Object.keys / values / entries / fromEntries

```javascript
const person = { name: 'Alice', age: 30, city: 'NYC' };

Object.keys(person);    // ['name', 'age', 'city']
Object.values(person);  // ['Alice', 30, 'NYC']
Object.entries(person); // [['name','Alice'], ['age',30], ['city','NYC']]

// Transform object values:
const doubled = Object.fromEntries(
  Object.entries({ a: 1, b: 2, c: 3 })
    .map(([k, v]) => [k, v * 2])
);
// { a: 2, b: 4, c: 6 }

// Filter object properties:
const filtered = Object.fromEntries(
  Object.entries(person).filter(([k, v]) => typeof v === 'string')
);
// { name: 'Alice', city: 'NYC' }
```

---

## Interview Questions

**Q: What is the difference between Object.assign and spread?**
A: They're functionally equivalent for plain objects — both do shallow copies of own enumerable properties. Spread `{...obj}` is syntactic sugar. One difference: `Object.assign` can merge into an existing object (mutating it), while spread always creates a new object.

**Q: When should you use Object.create(null)?**
A: When creating a pure dictionary/hash map that should have no prototype methods — no `toString`, `hasOwnProperty`, etc. This prevents prototype pollution and unexpected property conflicts when using the object to store arbitrary string keys.

**Q: What are the limitations of JSON.parse(JSON.stringify())?**
A: Drops `undefined`, functions, Symbols. Converts Dates to strings, Map/Set to {} or []. Throws on circular references. Loses prototype chain. Use `structuredClone()` instead for most cases.

**Q: How do you deep merge two objects?**
```javascript
function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] instanceof Object && !Array.isArray(source[key])) {
      target[key] = deepMerge(target[key] ?? {}, source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}
```
