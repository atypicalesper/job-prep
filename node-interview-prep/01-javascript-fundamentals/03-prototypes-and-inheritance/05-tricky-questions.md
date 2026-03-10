# Prototypes & Inheritance — Tricky Interview Questions

---

## Q1: Function.prototype vs Object.prototype

```javascript
Function.prototype.__proto__ === Object.prototype; // ?
Object.prototype.__proto__ === null; // ?
Function.__proto__ === Function.prototype; // ?
```

**Answers:** `true`, `true`, `true`

**The chain:**
```
Function ──→ Function.prototype ──→ Object.prototype ──→ null
Object   ──→ Function.prototype ──→ Object.prototype ──→ null
```

`Function` is itself a function, so `Function.__proto__ === Function.prototype`. This is the one circular-looking part of the chain (Function is an instance of itself).

---

## Q2: What Does new Return?

```javascript
function Foo() {
  this.x = 1;
  return { y: 2 }; // explicit object return
}

function Bar() {
  this.x = 1;
  return 42; // primitive return — ignored!
}

const foo = new Foo();
const bar = new Bar();

console.log(foo.x); // ?
console.log(foo.y); // ?
console.log(bar.x); // ?
```

**Answers:** `undefined`, `2`, `1`

**Why:** When a constructor explicitly returns an **object**, `new` returns THAT object instead of `this`. When it returns a **primitive**, the return is ignored and `this` is returned.

---

## Q3: instanceof with Modified Prototype

```javascript
function Car() {}
const myCar = new Car();

// Now change Car's prototype
Car.prototype = {};

console.log(myCar instanceof Car); // ?
```

**Answer:** `false`

**Why:** `instanceof` checks if `Car.prototype` (the current value) is in `myCar`'s chain. After reassigning, `Car.prototype` is a new object. `myCar.__proto__` still points to the OLD prototype. So the check fails.

---

## Q4: Object.create(null) vs {}

```javascript
const obj1 = {};
const obj2 = Object.create(null);

console.log(obj1.toString);    // ?
console.log(obj2.toString);    // ?
console.log(obj2.__proto__);   // ?
obj2.hasOwnProperty('x');      // ?
```

**Answers:**
- `obj1.toString` → `[Function: toString]` (inherited from Object.prototype)
- `obj2.toString` → `undefined` (no prototype!)
- `obj2.__proto__` → `undefined` (no prototype!)
- `obj2.hasOwnProperty('x')` → **TypeError** — no prototype means no `hasOwnProperty`!

**Why it matters:** `Object.create(null)` creates a truly empty object with NO prototype chain. Used for safe dictionaries (no prototype pollution risk, no inherited property conflicts).

---

## Q5: Property Shadowing

```javascript
function Animal() {}
Animal.prototype.name = 'animal';

const dog = new Animal();

console.log(dog.name);    // ?

dog.name = 'dog';          // own property created
console.log(dog.name);    // ?

delete dog.name;
console.log(dog.name);    // ?
```

**Answers:** `'animal'` → `'dog'` → `'animal'`

**Why:** Setting `dog.name` creates an OWN property on `dog` that shadows the prototype property. Deleting it removes only the own property, revealing the prototype property again.

---

## Q6: Prototype Chain Modification at Runtime

```javascript
function Vehicle() {}
function Car() {}
function Truck() {}

Car.prototype = Object.create(Vehicle.prototype);

const car = new Car();

// Now add method to Vehicle prototype
Vehicle.prototype.start = function() { return 'vroom'; };

console.log(car.start()); // ?
```

**Answer:** `'vroom'`

**Why:** Prototype chains are live. Adding to `Vehicle.prototype` AFTER creating `car` still works because `car` holds a REFERENCE to the chain, not a copy. The new method is immediately visible through the chain.

---

## Q7: Class vs Function Constructor

```javascript
// What's the difference between these?
class Foo {
  bar() {}
}

function Baz() {}
Baz.prototype.bar = function() {};

// What does this print?
console.log(typeof Foo);  // ?
console.log(typeof Baz);  // ?

// Can you call class without new?
Foo(); // ?
Baz(); // ?
```

**Answers:**
- `typeof Foo` → `'function'` (classes are functions!)
- `typeof Baz` → `'function'`
- `Foo()` → **TypeError: Class constructor Foo cannot be invoked without 'new'**
- `Baz()` → Works (but `this` would be global/undefined in strict mode)

**Key difference:** Classes are stricter — they REQUIRE `new`. They're also non-enumerable by default and always in strict mode.

---

## Q8: What Does super Do?

```javascript
class A {
  constructor() {
    this.type = 'A';
  }
  greet() { return `Hello from A (${this.type})`; }
}

class B extends A {
  constructor() {
    super();
    this.type = 'B'; // overrides A's setting
  }
  greet() { return super.greet(); } // calls A's greet
}

const b = new B();
console.log(b.greet()); // ?
console.log(b.type);    // ?
```

**Answers:** `'Hello from A (B)'` and `'B'`

**Why:** `super.greet()` calls A's greet method, but `this` is still `b` (the B instance). Since B sets `this.type = 'B'` after `super()`, the `this.type` in A's `greet` reads B's value.

---

## Q9: Prototype Pollution Check

```javascript
const user = {};

// Simulating JSON input from attacker:
const input = JSON.parse('{"__proto__": {"admin": true}}');
Object.assign(user, input);

console.log(user.admin);        // ?
console.log({}.admin);          // ?
console.log(user.__proto__.admin); // ?
```

**Answers:** `true`, `true`, `true` (all objects affected!)

**Why:** `Object.assign` copies properties including `__proto__`. Setting `user.__proto__.admin = true` modifies `Object.prototype`, making ALL plain objects appear to have `admin: true`.

---

## Q10: Mixin Pattern

```javascript
const Flyable = {
  fly() { return `${this.name} is flying`; }
};

const Swimmable = {
  swim() { return `${this.name} is swimming`; }
};

class Duck {
  constructor(name) {
    this.name = name;
  }
}

Object.assign(Duck.prototype, Flyable, Swimmable);

const donald = new Duck('Donald');
donald.fly();  // ?
donald.swim(); // ?
donald instanceof Flyable; // ?
```

**Answers:** `'Donald is flying'`, `'Donald is swimming'`, **TypeError** (Flyable is not a constructor)

**Why:** Mixins via `Object.assign` add methods to the prototype. `instanceof` doesn't work because `Flyable` is a plain object, not a constructor with `.prototype`.

---

## Q11: Weird prototype Behaviors

```javascript
function Foo() {}

const a = new Foo();

Foo.prototype = { newMethod() {} }; // reassign prototype

const b = new Foo();

console.log(a instanceof Foo); // ?
console.log(b instanceof Foo); // ?
console.log(Object.getPrototypeOf(a) === Object.getPrototypeOf(b)); // ?
```

**Answers:** `false`, `true`, `false`

- `a` was created before reassignment — its `__proto__` points to old prototype
- `b` was created after — its `__proto__` points to new prototype
- They have DIFFERENT prototypes

---

## Q12: hasOwnProperty Edge Case

```javascript
const obj = {
  hasOwnProperty: function() { return false; } // override!
};

obj.hasOwnProperty('hasOwnProperty'); // ?
```

**Answer:** `false` — because `obj.hasOwnProperty` is now overridden to always return false!

**Safe alternative:**
```javascript
Object.prototype.hasOwnProperty.call(obj, 'hasOwnProperty'); // true
// Or:
Object.hasOwn(obj, 'hasOwnProperty'); // true (ES2022)
```

---

## Q13: for...in and Prototype

```javascript
function Animal(name) {
  this.name = name;
}
Animal.prototype.type = 'animal';

const dog = new Animal('Rex');
dog.breed = 'Lab';

const ownKeys = [];
const allKeys = [];

for (const key in dog) {
  allKeys.push(key);
  if (dog.hasOwnProperty(key)) {
    ownKeys.push(key);
  }
}

console.log(ownKeys); // ?
console.log(allKeys); // ?
```

**Answers:**
- `ownKeys` → `['name', 'breed']`
- `allKeys` → `['name', 'breed', 'type']` (includes inherited)

**Lesson:** `for...in` iterates ALL enumerable properties in the chain. Use `Object.keys()` for own properties only.

---

## Q14: Class Inheriting from Regular Function

```javascript
function OldStyle(val) {
  this.val = val;
}
OldStyle.prototype.getVal = function() { return this.val; };

class Modern extends OldStyle {
  constructor(val) {
    super(val);
    this.doubled = val * 2;
  }
}

const m = new Modern(5);
console.log(m.val);     // ?
console.log(m.doubled); // ?
console.log(m.getVal()); // ?
```

**Answers:** `5`, `10`, `5`

**Why:** ES6 classes can extend old-style constructor functions. `super(val)` calls `OldStyle` constructor. The prototype chain is set up correctly.

---

## Q15: Object.create for Inheritance

```javascript
function Shape(color) {
  this.color = color;
}
Shape.prototype.describe = function() {
  return `A ${this.color} shape`;
};

function Circle(color, radius) {
  Shape.call(this, color); // inherit own properties
  this.radius = radius;
}

// WRONG: Circle.prototype = Shape.prototype
// (Circle and Shape share exact prototype — changes affect both)

// RIGHT:
Circle.prototype = Object.create(Shape.prototype);
Circle.prototype.constructor = Circle; // fix constructor reference

Circle.prototype.area = function() {
  return Math.PI * this.radius ** 2;
};

const c = new Circle('red', 5);
c.describe(); // ?
c.area();     // ?
c instanceof Shape;  // ?
c instanceof Circle; // ?
```

**Answers:**
- `'A red shape'`
- `~78.54`
- `true`
- `true`

**Why `constructor = Circle` matters:**
```javascript
// Without fixing constructor:
new Circle().__proto__.constructor; // Shape (wrong!)
// With fix:
new Circle().__proto__.constructor; // Circle (correct)
```

---

## Quick Reference: Type Checking Table

| Value | typeof | instanceof Array | Array.isArray | toString |
|-------|--------|----------|----------|--------|
| `42` | 'number' | false | false | [object Number] |
| `'str'` | 'string' | false | false | [object String] |
| `null` | **'object'** | **Error** | false | [object Null] |
| `[]` | 'object' | true | true | [object Array] |
| `{}` | 'object' | false | false | [object Object] |
| `function(){}` | **'function'** | false | false | [object Function] |
| `NaN` | **'number'** | false | false | [object Number] |
| `undefined` | 'undefined' | **Error** | false | [object Undefined] |
