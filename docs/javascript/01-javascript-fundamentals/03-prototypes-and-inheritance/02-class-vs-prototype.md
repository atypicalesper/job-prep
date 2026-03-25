# Classes vs Prototypes

## ES6 Classes Are Syntactic Sugar

ES6 `class` is NOT a new object-oriented model. It's syntactic sugar over JavaScript's prototype-based system. Under the hood, everything still uses prototypes.

```javascript
// ES6 Class syntax
class Animal {
  constructor(name) {
    this.name = name;
  }

  speak() {
    return `${this.name} makes a sound`;
  }

  static create(name) {
    return new Animal(name);
  }
}

// EXACTLY equivalent prototype code:
function Animal(name) {
  this.name = name;
}

Animal.prototype.speak = function() {
  return `${this.name} makes a sound`;
};

Animal.create = function(name) {
  return new Animal(name);
};
```

Both produce identical behavior. The class syntax is just more readable and provides some additional features.

---

## What class Actually Does

`class` syntax with `extends` does two distinct things: it sets up the instance prototype chain so instances of the subclass inherit instance methods from the parent, and it sets up the constructor function chain so the subclass also inherits static methods from the parent. Both are accomplished by manipulating prototypes under the hood, and you can verify this directly by inspecting `Dog.prototype.__proto__` and `Dog.__proto__` after a class declaration.

```javascript
class Dog extends Animal {
  constructor(name, breed) {
    super(name);      // calls Animal constructor
    this.breed = breed;
  }

  bark() {
    return `${this.name} barks!`;
  }
}

// After class Dog declaration, here's what exists:
// Dog.prototype = {
//   bark: function() { ... },
//   constructor: Dog,
//   __proto__: Animal.prototype    ← extends sets this up
// }
// Dog.__proto__ = Animal           ← for static method inheritance

const fido = new Dog('Fido', 'Labrador');
// fido.__proto__ === Dog.prototype           (true)
// Dog.prototype.__proto__ === Animal.prototype (true)
```

Chain: `fido → Dog.prototype → Animal.prototype → Object.prototype → null`

---

## The `new` Keyword — 4 Steps

Understanding `new` is critical. When you call `new Constructor(args)`:

1. **Create** a new empty object `{}`
2. **Set** its `[[Prototype]]` to `Constructor.prototype`
3. **Call** `Constructor` with `this` bound to the new object
4. **Return** the new object (unless constructor explicitly returns an object)

```javascript
// Manual implementation of new:
function myNew(Constructor, ...args) {
  // Step 1: create empty object
  const obj = {};

  // Step 2: set prototype
  Object.setPrototypeOf(obj, Constructor.prototype);

  // Step 3: call constructor with this = obj
  const result = Constructor.apply(obj, args);

  // Step 4: return obj (or result if constructor returned an object)
  return (typeof result === 'object' && result !== null) ? result : obj;
}

function Person(name) {
  this.name = name;
}

const alice = myNew(Person, 'Alice');
alice.name; // 'Alice'
alice instanceof Person; // true
```

---

## extends and super — How Inheritance Works

`extends` wires up the prototype chain so the subclass inherits from the parent. `super` provides two capabilities: calling the parent class constructor (`super(args)`) and calling a specific parent class method (`super.methodName()`). In a derived class constructor, `this` does not exist until after `super()` is called — the parent constructor is responsible for allocating and initializing `this`. Forgetting `super()` in a subclass constructor throws a `ReferenceError: Must call super constructor in derived class before accessing 'this'`.

```javascript
class Vehicle {
  constructor(make, model) {
    this.make = make;
    this.model = model;
  }

  describe() {
    return `${this.make} ${this.model}`;
  }
}

class Car extends Vehicle {
  constructor(make, model, doors) {
    super(make, model); // MUST call super before using this
    this.doors = doors;
  }

  describe() {
    // super.describe() calls parent's describe method
    return `${super.describe()} with ${this.doors} doors`;
  }
}

const tesla = new Car('Tesla', 'Model 3', 4);
tesla.describe(); // 'Tesla Model 3 with 4 doors'
```

**Why `super()` must come first:** Before `super()` is called, `this` doesn't exist in the derived class constructor. The parent constructor is responsible for setting up `this`.

---

## Class Features

### Private Fields (ES2022)

Private class fields (`#field`) are a language-level privacy mechanism that makes properties completely inaccessible outside the class body — not even through `obj['#field']` or DevTools object inspection can bypass them (DevTools shows them in a separate "Private properties" section). They are enforced by the parser and are fundamentally different from the naming convention `_private` or WeakMap-based approaches. Private fields are stored as part of the instance's internal slot structure, not on the prototype chain, so they have no inheritance and no `hasOwnProperty` visibility.

```javascript
class BankAccount {
  #balance; // truly private — not accessible outside class
  #id;

  constructor(initialBalance) {
    this.#balance = initialBalance;
    this.#id = Math.random().toString(36);
  }

  deposit(amount) {
    if (amount <= 0) throw new Error('Positive amounts only');
    this.#balance += amount;
    return this;
  }

  get balance() { return this.#balance; }

  // Private method
  #validateAmount(amount) {
    return amount > 0 && amount <= this.#balance;
  }

  withdraw(amount) {
    if (!this.#validateAmount(amount)) throw new Error('Invalid amount');
    this.#balance -= amount;
    return this;
  }
}

const acc = new BankAccount(1000);
acc.deposit(500).withdraw(200);
acc.balance;   // 1300
acc.#balance;  // SyntaxError — truly private!
```

### Static Methods and Properties

Static members belong to the class constructor itself, not to instances. They are not accessible via `instance.method()` — only via `ClassName.method()`. Static methods are useful for factory functions, utility helpers, and managing class-level state (like an instance counter). They are inherited by subclasses: `SubClass.staticMethod()` works because `SubClass.__proto__ === ParentClass` (another prototype chain, this time for the constructor functions themselves).

```javascript
class MathUtils {
  static PI = 3.14159;

  static circleArea(r) {
    return MathUtils.PI * r * r;
  }

  static #instances = 0; // private static

  constructor() {
    MathUtils.#instances++;
  }

  static getInstanceCount() {
    return MathUtils.#instances;
  }
}

MathUtils.circleArea(5); // 78.54
MathUtils.PI;            // 3.14159
new MathUtils();
MathUtils.getInstanceCount(); // 1
```

### Getters and Setters

Getters and setters define computed or validated properties that appear as plain property accesses to the caller. A getter is invoked when you read `obj.property`; a setter is invoked when you write `obj.property = value`. They are defined on the prototype (not on instances), so they are shared and incur no per-instance memory overhead. Use them when a property value should be derived from other state, or when assignment needs validation logic, rather than exposing the raw underlying field.

```javascript
class Temperature {
  #celsius;

  constructor(celsius) {
    this.#celsius = celsius;
  }

  get fahrenheit() {
    return this.#celsius * 9/5 + 32;
  }

  set fahrenheit(f) {
    this.#celsius = (f - 32) * 5/9;
  }

  get celsius() { return this.#celsius; }
  set celsius(c) { this.#celsius = c; }
}

const temp = new Temperature(0);
temp.fahrenheit;       // 32
temp.fahrenheit = 212; // setter
temp.celsius;          // 100
```

---

## Class vs Factory Function — The Debate

### Class

```javascript
class UserClass {
  #name;
  #email;

  constructor(name, email) {
    this.#name = name;
    this.#email = email;
  }

  greet() { return `Hi, I'm ${this.#name}`; }
}
```

### Factory Function

```javascript
function createUser(name, email) {
  // name and email are private via closure
  return {
    greet() { return `Hi, I'm ${name}`; }
    // no prototype — each instance has own copy of methods
  };
}
```

| | Class | Factory Function |
|---|---|---|
| Memory | Methods shared via prototype | Each instance has own method copies |
| Private state | `#privateFields` | Closure |
| `instanceof` | Works | Doesn't work |
| `this` binding | Can be lost | N/A (methods use closure, no this) |
| Inheritance | `extends` keyword | Manual composition |
| Use case | Many instances sharing behavior | Flexibility, functional patterns |

---

## Mixins — Multiple Inheritance Workaround

JavaScript's prototype chain is linear — a class can only extend one parent — so true multiple inheritance is not available. Mixins are a composition pattern that works around this by defining behavior as functions that take a superclass and return a new subclass that extends it. By chaining mixin calls, you layer multiple behaviors onto a base class. Each mixin forms a new anonymous class in the prototype chain, which is why deep mixin stacks have a slight prototype lookup overhead.

JavaScript doesn't support multiple inheritance, but you can compose functionality with mixins:

```javascript
// Mixin functions
const Serializable = (superclass) => class extends superclass {
  serialize() {
    return JSON.stringify(this);
  }

  static deserialize(json) {
    return Object.assign(new this(), JSON.parse(json));
  }
};

const Validatable = (superclass) => class extends superclass {
  validate() {
    // check required fields
    return Object.keys(this).every(key => this[key] !== null);
  }
};

// Base class
class Entity {
  constructor(id) {
    this.id = id;
  }
}

// Combine mixins
class User extends Serializable(Validatable(Entity)) {
  constructor(id, name, email) {
    super(id);
    this.name = name;
    this.email = email;
  }
}

const user = new User(1, 'Alice', 'alice@example.com');
user.serialize();  // '{"id":1,"name":"Alice","email":"alice@example.com"}'
user.validate();   // true
```

---

## Interview Questions

**Q: What does the class keyword actually compile to?**
A: It compiles to a function (constructor) with methods on `.prototype`. `class Foo extends Bar` sets up the prototype chain so instances of Foo have Bar.prototype in their chain, and Foo itself inherits static methods from Bar.

**Q: What does `super()` do?**
A: In a derived class constructor, `super()` calls the parent class constructor with `this` bound to the new instance being created. Must be called before accessing `this`. `super.method()` calls parent's method.

**Q: What are the 4 steps of the `new` keyword?**
A: 1. Create empty object. 2. Set its `[[Prototype]]` to `Constructor.prototype`. 3. Call constructor with `this = new object`. 4. Return the object (or the explicit object return value if constructor returns one).

**Q: How are private class fields different from closure-based privacy?**
A: `#privateFields` are truly private — inaccessible outside the class even with creative hacks, and they show up as private in DevTools. Closure-based privacy is "privacy by convention" — technically accessible via DevTools, and requires factory function pattern (no prototype sharing).
