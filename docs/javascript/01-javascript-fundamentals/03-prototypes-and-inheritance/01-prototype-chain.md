# Prototype Chain

## What is a Prototype?

Every JavaScript object has an internal property called `[[Prototype]]` (accessible via `__proto__` or `Object.getPrototypeOf()`). This forms a **chain** — when you access a property that doesn't exist on an object, JS walks up the chain looking for it.

```javascript
const animal = {
  breathe() { return 'inhale...exhale'; }
};

const dog = {
  bark() { return 'woof!'; }
};

// Set animal as dog's prototype
Object.setPrototypeOf(dog, animal);

dog.bark();    // 'woof!' — found on dog itself
dog.breathe(); // 'inhale...exhale' — found on prototype (animal)
dog.toString();// '[object Object]' — found on Object.prototype
dog.notHere;   // undefined — not found anywhere in chain
```

Prototype chain for `dog`:
```
dog ──→ animal ──→ Object.prototype ──→ null
```

---

## __proto__ vs prototype

This is the most confused concept in JavaScript. They are DIFFERENT things:

### `__proto__` — The Actual Chain Link

`__proto__` is the **actual prototype of an object instance**. Every object has it.

```javascript
const obj = {};
obj.__proto__ === Object.prototype; // true
// obj's prototype IS Object.prototype
```

### `.prototype` — The Blueprint for Future Instances

`.prototype` exists only on **functions** (constructors). It becomes the `__proto__` of objects created with `new`.

```javascript
function Dog(name) {
  this.name = name;
}

Dog.prototype.bark = function() {
  return `${this.name} says woof!`;
};

const fido = new Dog('Fido');

// fido.__proto__ === Dog.prototype  → true
// Dog.prototype is the actual prototype of instances
// Dog.prototype is NOT Dog's own prototype (Dog.__proto__ is Function.prototype)
```

### The Relationship

```
Dog (function)
├── .prototype  → { bark: fn, constructor: Dog }
│                        ↑
│                        │ __proto__
fido (instance)  ────────┘
├── name: 'Fido'
└── __proto__  → Dog.prototype
                       │ __proto__
                       ↓
               Object.prototype
                       │ __proto__
                       ↓
                      null
```

---

## How Property Lookup Works

```javascript
function Animal(name) {
  this.name = name; // own property
}

Animal.prototype.speak = function() { // shared via prototype
  return `${this.name} makes a noise`;
};

Animal.prototype.type = 'animal'; // shared property

const cat = new Animal('Whiskers');
cat.color = 'orange'; // own property

// Property lookup order:
cat.color;  // 1. Own property: 'orange' ✓
cat.name;   // 1. Own property: 'Whiskers' ✓
cat.speak;  // 1. Own? No. 2. Animal.prototype? Yes: function ✓
cat.type;   // 1. Own? No. 2. Animal.prototype: 'animal' ✓
cat.valueOf;// 1. Own? No. 2. Animal.prototype? No. 3. Object.prototype? Yes ✓
cat.blah;   // Not found anywhere → undefined
```

---

## Object.getPrototypeOf vs __proto__

```javascript
const obj = {};

// ✅ Standard (use this)
Object.getPrototypeOf(obj) === Object.prototype; // true

// ⚠️ Non-standard (works but avoid in production)
obj.__proto__ === Object.prototype; // true

// ✅ Set prototype safely
const proto = { greet() { return 'hello'; } };
const child = Object.create(proto); // creates obj with proto as __proto__

// ✅ Also:
Object.setPrototypeOf(child, proto); // changes existing object's proto
```

---

## hasOwnProperty

Checks if a property is on the object ITSELF, not inherited:

```javascript
function Person(name) { this.name = name; }
Person.prototype.species = 'human';

const alice = new Person('Alice');

alice.hasOwnProperty('name');    // true — own property
alice.hasOwnProperty('species'); // false — inherited
alice.hasOwnProperty('hasOwnProperty'); // false — from Object.prototype

// In a for...in loop, hasOwnProperty filters inherited:
for (const key in alice) {
  if (alice.hasOwnProperty(key)) {
    console.log(key); // only 'name'
  }
}
// (without filter: 'name', 'species')

// Safer way (doesn't rely on hasOwnProperty not being overridden):
Object.prototype.hasOwnProperty.call(alice, 'name'); // true
// Or:
Object.hasOwn(alice, 'name'); // true (ES2022)
```

---

## Prototype Chain Performance

Property access performance degrades with chain length:

```javascript
const a = { x: 1 };
const b = Object.create(a);
const c = Object.create(b);
const d = Object.create(c);

// Finding d.x requires walking: d → c → b → a (4 lookups)
// Finding d.own_prop requires: d (1 lookup)

// For performance-critical code:
// 1. Keep chains short
// 2. Cache prototype method references if calling many times
const speak = Animal.prototype.speak;
speak.call(cat); // avoids prototype lookup on each call
```

---

## Prototype Pollution

A security vulnerability where an attacker modifies `Object.prototype`:

```javascript
// Prototype pollution attack
const maliciousInput = '{"__proto__": {"isAdmin": true}}';
const parsed = JSON.parse(maliciousInput);

// naive merge function
function merge(target, source) {
  for (const key in source) {
    target[key] = source[key]; // DANGER: sets __proto__!
  }
}

merge({}, parsed);

// Now ALL objects appear to have isAdmin: true!
const user = {};
console.log(user.isAdmin); // true — prototype pollution!
```

**Prevention:**
```javascript
// 1. Use Object.create(null) for dictionaries (no prototype!)
const safeDict = Object.create(null);

// 2. Check for dangerous keys
function safeMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue; // skip dangerous keys
    }
    target[key] = source[key];
  }
}

// 3. Use structuredClone for deep copying
const safe = structuredClone(parsed); // strips __proto__

// 4. Freeze Object.prototype
Object.freeze(Object.prototype);
```

---

## Walking the Full Chain

```javascript
function getFullChain(obj) {
  const chain = [];
  let current = obj;
  while (current !== null) {
    chain.push(current);
    current = Object.getPrototypeOf(current);
  }
  return chain;
}

function Dog() {}
const fido = new Dog();

getFullChain(fido);
// [fido, Dog.prototype, Object.prototype, null's terminator]

// For a function:
getFullChain(Dog);
// [Dog, Function.prototype, Object.prototype]
```

---

## Interview Questions

**Q: What is the difference between `__proto__` and `prototype`?**
A: `__proto__` is a property on every object that points to its actual prototype in the chain. `.prototype` is a property on constructor functions that becomes the `__proto__` of instances created with `new`. They're related but different: `new Dog().__proto__ === Dog.prototype`.

**Q: What sits at the top of the prototype chain?**
A: `Object.prototype`. Its `__proto__` is `null`, which terminates the chain. Every normal object ultimately inherits from `Object.prototype` (methods like `toString`, `hasOwnProperty`, `valueOf`).

**Q: What is prototype pollution and how do you prevent it?**
A: Prototype pollution is when user-controlled data is used to set properties on `Object.prototype`, affecting all objects. Prevention: validate keys (reject `__proto__`, `constructor`, `prototype`), use `Object.create(null)` for data stores, use `structuredClone` for deep copies, freeze `Object.prototype`.

**Q: Why is `for...in` dangerous for iterating objects?**
A: `for...in` iterates ALL enumerable properties including inherited ones. Use `for...of` with `Object.keys()`/`Object.entries()` for own properties only, or check with `hasOwnProperty`/`Object.hasOwn`.
