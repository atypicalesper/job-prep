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

## Q16: __proto__ vs prototype vs Object.getPrototypeOf

```javascript
function Dog() {}
const d = new Dog();

console.log(d.__proto__ === Dog.prototype);           // ?
console.log(Object.getPrototypeOf(d) === Dog.prototype); // ?
console.log(d.prototype);                             // ?
console.log(Dog.__proto__ === Function.prototype);     // ?
```

**Answers:** `true`, `true`, `undefined`, `true`

**Why:**
- `__proto__` is the internal link to the prototype (deprecated accessor on `Object.prototype`)
- `.prototype` only exists on **functions** — it's the object that becomes `__proto__` of instances created with `new`
- `Object.getPrototypeOf()` is the proper API to read `__proto__`
- Instances don't have `.prototype` — only constructors do

---

## Q17: Setting __proto__ as a Plain Property

```javascript
const obj = Object.create(null);
obj.__proto__ = { x: 42 };

console.log(obj.x);                    // ?
console.log(obj.__proto__.x);          // ?
console.log(Object.getPrototypeOf(obj)); // ?
```

**Answers:** `undefined`, `42`, `null`

**Why:** `Object.create(null)` has no prototype, which means no `Object.prototype.__proto__` setter. So `obj.__proto__` is stored as a plain data property — it does NOT change the prototype chain. `Object.getPrototypeOf(obj)` is still `null`.

---

## Q18: Constructor Property After Prototype Reassignment

```javascript
function Foo() {}
const a = new Foo();
console.log(a.constructor === Foo); // ?

Foo.prototype = {};
const b = new Foo();
console.log(b.constructor === Foo);    // ?
console.log(b.constructor === Object); // ?
```

**Answers:** `true`, `false`, `true`

**Why:** The default `Foo.prototype` has a `constructor` property pointing back to `Foo`. When you reassign `Foo.prototype = {}`, the new object inherits `constructor` from `Object.prototype`, which is `Object`. Always fix it: `Foo.prototype.constructor = Foo`.

---

## Q19: Constructor Property is Writable

```javascript
function A() {}
function B() {}

const a = new A();
a.constructor = B;

console.log(a instanceof A); // ?
console.log(a instanceof B); // ?
console.log(a.constructor);  // ?
```

**Answers:** `true`, `false`, `[Function: B]`

**Why:** `constructor` is just a regular writable property. Changing it does NOT change the prototype chain or affect `instanceof`. `instanceof` walks `__proto__` links, not `constructor`.

---

## Q20: hasOwnProperty on Prototype Chain

```javascript
function Person(name) {
  this.name = name;
}
Person.prototype.species = 'human';

const p = new Person('Alice');

console.log(p.hasOwnProperty('name'));    // ?
console.log(p.hasOwnProperty('species')); // ?
console.log('species' in p);             // ?
console.log(Object.hasOwn(p, 'species')); // ?
```

**Answers:** `true`, `false`, `true`, `false`

**Why:** `hasOwnProperty` and `Object.hasOwn` (ES2022) check only the object's own properties. The `in` operator checks the entire prototype chain. `species` is on the prototype, so it's found by `in` but not `hasOwnProperty`.

---

## Q21: hasOwnProperty with Object.create(null) — Safe Pattern

```javascript
const dict = Object.create(null);
dict.key = 'value';

// This throws:
try {
  dict.hasOwnProperty('key');
} catch (e) {
  console.log(e.constructor.name); // ?
}

// These work:
console.log(Object.hasOwn(dict, 'key'));                          // ?
console.log(Object.prototype.hasOwnProperty.call(dict, 'key'));   // ?
```

**Answers:** `'TypeError'`, `true`, `true`

**Why:** `Object.create(null)` has no prototype, so `hasOwnProperty` doesn't exist on `dict`. Use `Object.hasOwn()` (ES2022) or `Object.prototype.hasOwnProperty.call()` for null-prototype objects.

---

## Q22: Object.create(null) and JSON.stringify

```javascript
const obj = Object.create(null);
obj.name = 'test';
obj.toString = undefined;

console.log(JSON.stringify(obj));      // ?
console.log(obj + '');                 // ?
```

**Answers:** `'{"name":"test"}'`, **TypeError**

**Why:** `JSON.stringify` works fine — it doesn't rely on prototype methods. But `obj + ''` triggers type coercion which calls `toString()`. Since `obj.toString` is explicitly `undefined` (and there's no prototype to fall back to), it throws.

---

## Q23: Object.create(null) in Map-like Usage

```javascript
const regular = {};
const safe = Object.create(null);

console.log('constructor' in regular); // ?
console.log('constructor' in safe);    // ?
console.log('toString' in regular);    // ?
console.log('toString' in safe);       // ?
```

**Answers:** `true`, `false`, `true`, `false`

**Why:** Regular objects inherit from `Object.prototype`, so they see `constructor`, `toString`, `valueOf`, etc. `Object.create(null)` is truly empty — safe to use as a dictionary without worrying about key collisions with built-in names.

---

## Q24: Prototype Pollution via Nested Merge

```javascript
function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (typeof source[key] === 'object' && source[key] !== null) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

const payload = JSON.parse('{"__proto__": {"polluted": true}}');

// Note: Object.keys does NOT return __proto__
// But what about this?
const payload2 = { constructor: { prototype: { polluted: true } } };
deepMerge({}, payload2);

console.log(({}).polluted); // ?
```

**Answer:** `true`

**Why:** Even though `__proto__` is filtered by `Object.keys`, attackers use `constructor.prototype` as an alternative path. `target.constructor` is `Object`, so `target.constructor.prototype` is `Object.prototype`. The merge writes `polluted: true` onto `Object.prototype`, affecting all objects.

---

## Q25: Prototype Pollution Prevention

```javascript
const safeObj = Object.create(null);
safeObj.data = 'hello';

// Method 1: Object.freeze
Object.freeze(Object.prototype);

// After freezing:
try {
  Object.prototype.hacked = true;
} catch (e) {
  console.log(e.constructor.name); // ?
}
console.log(({}).hacked); // ?
```

**Answers:** `'TypeError'` (in strict mode), `undefined`

**Why:** `Object.freeze(Object.prototype)` prevents any modification to `Object.prototype`. This is a nuclear option — it can break libraries that extend built-in prototypes. In practice, prefer input validation and `Object.create(null)`.

---

## Q26: instanceof Across Realms (iframes/VMs)

```javascript
const vm = require('vm');
const ctx = vm.createContext({});

const result = vm.runInContext('[]', ctx);

console.log(result instanceof Array);  // ?
console.log(Array.isArray(result));    // ?
```

**Answers:** `false`, `true`

**Why:** Each realm (iframe, VM context) has its own set of global built-ins. `result` is an Array from the VM's realm — its `__proto__` is the VM's `Array.prototype`, not the current realm's `Array.prototype`. `instanceof` fails, but `Array.isArray` is realm-safe.

---

## Q27: instanceof with Primitive Wrappers

```javascript
const str1 = 'hello';
const str2 = new String('hello');

console.log(str1 instanceof String); // ?
console.log(str2 instanceof String); // ?
console.log(typeof str1);           // ?
console.log(typeof str2);           // ?
```

**Answers:** `false`, `true`, `'string'`, `'object'`

**Why:** Primitives are not objects. `instanceof` checks the prototype chain, but `str1` is a primitive — it has no prototype chain (autoboxing only happens for property access, not for `instanceof`).

---

## Q28: Symbol.hasInstance Override

```javascript
class EvenNumber {
  static [Symbol.hasInstance](value) {
    return typeof value === 'number' && value % 2 === 0;
  }
}

console.log(2 instanceof EvenNumber);   // ?
console.log(3 instanceof EvenNumber);   // ?
console.log('4' instanceof EvenNumber); // ?
```

**Answers:** `true`, `false`, `false`

**Why:** `Symbol.hasInstance` lets you completely customize `instanceof` behavior. Here it doesn't check prototype chains at all — it checks if the value is an even number. The string `'4'` fails because `typeof '4'` is `'string'`.

---

## Q29: Symbol.hasInstance with Inheritance

```javascript
class Validator {
  static [Symbol.hasInstance](value) {
    return value && typeof value.validate === 'function';
  }
}

class FormValidator {
  validate() { return true; }
}

const fv = new FormValidator();

console.log(fv instanceof Validator);      // ?
console.log(fv instanceof FormValidator);  // ?
console.log({} instanceof Validator);      // ?
console.log({ validate: () => {} } instanceof Validator); // ?
```

**Answers:** `true`, `true`, `false`, `true`

**Why:** `Validator` uses duck-typing via `Symbol.hasInstance` — anything with a `validate` method is considered an instance. This is structural typing via `instanceof`.

---

## Q30: Prototype Methods vs Instance Methods

```javascript
class Counter {
  count = 0;

  // Instance method (created per instance via class field arrow)
  increment = () => {
    this.count++;
  };

  // Prototype method (shared)
  decrement() {
    this.count--;
  }
}

const a = new Counter();
const b = new Counter();

console.log(a.increment === b.increment); // ?
console.log(a.decrement === b.decrement); // ?
console.log(a.hasOwnProperty('increment')); // ?
console.log(a.hasOwnProperty('decrement')); // ?
```

**Answers:** `false`, `true`, `true`, `false`

**Why:** Arrow class fields create a NEW function per instance (own property). Regular methods live on the prototype and are shared. Arrow fields use more memory but preserve `this` binding.

---

## Q31: Prototype Method Extraction Problem

```javascript
class Timer {
  name = 'Timer';
  start() {
    return `${this.name} started`;
  }
  stop = () => {
    return `${this.name} stopped`;
  };
}

const t = new Timer();
const { start, stop } = t;

console.log(start()); // ?
console.log(stop());  // ?
```

**Answers:** `TypeError: Cannot read properties of undefined (reading 'name')` (or `'undefined started'` in sloppy mode), `'Timer stopped'`

**Why:** Destructuring extracts methods without `this` binding. `start()` is a prototype method — when called standalone, `this` is `undefined` (strict mode). `stop()` is an arrow function — `this` is lexically bound to the instance forever.

---

## Q32: Static vs Prototype Methods

```javascript
class MathUtils {
  static add(a, b) { return a + b; }
  multiply(a, b) { return a * b; }
}

const m = new MathUtils();

console.log(MathUtils.add(1, 2));      // ?
console.log(m.add);                    // ?
console.log(m.multiply(3, 4));         // ?
console.log(MathUtils.multiply);       // ?
console.log(MathUtils.prototype.multiply === m.multiply); // ?
```

**Answers:** `3`, `undefined`, `12`, `undefined`, `true`

**Why:** Static methods live on the constructor function itself, NOT on `.prototype`. Instance methods live on `.prototype`. They exist in completely separate namespaces.

---

## Q33: Static Method Inheritance

```javascript
class Base {
  static create() {
    return new this(); // 'this' in static = the class itself
  }
}

class Child extends Base {}

const obj = Child.create();

console.log(obj instanceof Child); // ?
console.log(obj instanceof Base);  // ?
console.log(Child.__proto__ === Base); // ?
```

**Answers:** `true`, `true`, `true`

**Why:** Static methods are inherited via the constructor chain (`Child.__proto__ === Base`). Inside `Base.create()`, when called as `Child.create()`, `this` is `Child`, so `new this()` creates a `Child` instance.

---

## Q34: extends with Custom Constructor Return

```javascript
class Base {
  constructor() {
    return { custom: true }; // returns a different object!
  }
}

class Child extends Base {
  constructor() {
    super();
    this.childProp = 'hello';
  }
}

const c = new Child();

console.log(c.custom);     // ?
console.log(c.childProp);  // ?
console.log(c instanceof Child); // ?
console.log(c instanceof Base);  // ?
```

**Answers:** `true`, `'hello'`, `false`, `false`

**Why:** `super()` calls Base's constructor which returns a plain object `{ custom: true }`. That object becomes `this` in Child's constructor. `this.childProp = 'hello'` is set on that plain object. Since it's a plain object (not created by `new`), `instanceof` checks fail for both classes.

---

## Q35: extends null

```javascript
class NullProto extends null {
  constructor() {
    // super() would throw — cannot call null as constructor
    return Object.create(new.target.prototype);
  }
}

const n = new NullProto();

console.log(Object.getPrototypeOf(n) === NullProto.prototype); // ?
console.log(n instanceof NullProto);     // ?
console.log(n.toString);                 // ?
console.log(n.hasOwnProperty);           // ?
```

**Answers:** `true`, `true`, `undefined`, `undefined`

**Why:** `extends null` sets `NullProto.prototype.__proto__` to `null`, creating a class whose instances have no `Object.prototype` in their chain. You must manually return an object from the constructor since `super()` can't call `null`.

---

## Q36: new.target Usage

```javascript
function Foo() {
  console.log(new.target?.name);
}

class Bar extends Foo {
  constructor() {
    super();
  }
}

new Foo();  // prints ?
Foo();      // prints ?
new Bar();  // prints ?
```

**Answers:** `'Foo'`, `undefined`, `'Bar'`

**Why:** `new.target` refers to the constructor that `new` was directly called on. When called without `new`, it's `undefined`. When `Bar` calls `super()`, `new.target` inside `Foo` is still `Bar` — it tracks the original `new` target through the chain.

---

## Q37: Abstract Class Pattern with new.target

```javascript
class Shape {
  constructor() {
    if (new.target === Shape) {
      throw new Error('Shape is abstract — cannot instantiate directly');
    }
    this.type = new.target.name;
  }
}

class Circle extends Shape {}

try { new Shape(); } catch(e) { console.log(e.message); } // ?
const c = new Circle();
console.log(c.type); // ?
```

**Answers:** `'Shape is abstract — cannot instantiate directly'`, `'Circle'`

**Why:** `new.target` lets you enforce abstract class behavior. Direct `new Shape()` is blocked, but `new Circle()` passes because `new.target` is `Circle`, not `Shape`.

---

## Q38: Mixin Conflicts — Last One Wins

```javascript
const LoggerA = {
  log() { return 'Logger A'; }
};

const LoggerB = {
  log() { return 'Logger B'; }
};

class App {}
Object.assign(App.prototype, LoggerA, LoggerB);

const app = new App();
console.log(app.log()); // ?
```

**Answer:** `'Logger B'`

**Why:** `Object.assign` copies properties in order. When both mixins have `log()`, the last one wins — `LoggerB.log` overwrites `LoggerA.log`. There's no error or warning. This is why mixin conflicts are dangerous.

---

## Q39: Mixin with Class Expression Pattern

```javascript
const Serializable = (Base) => class extends Base {
  serialize() {
    return JSON.stringify(this);
  }
};

const Validatable = (Base) => class extends Base {
  validate() {
    return Object.keys(this).length > 0;
  }
};

class User extends Serializable(Validatable(Object)) {
  constructor(name) {
    super();
    this.name = name;
  }
}

const u = new User('Alice');
console.log(u.serialize());  // ?
console.log(u.validate());   // ?
console.log(u instanceof User); // ?
```

**Answers:** `'{"name":"Alice"}'`, `true`, `true`

**Why:** This is the "class expression mixin" pattern — each mixin is a function that takes a base class and returns an extended class. This creates a real prototype chain: `User → Serializable(…) → Validatable(…) → Object`. Unlike `Object.assign`, methods don't conflict — they live at different levels.

---

## Q40: Property Shadowing with Setters

```javascript
const parent = {
  set value(v) {
    console.log('setter called');
    this._value = v;
  },
  get value() {
    return this._value;
  }
};

const child = Object.create(parent);
child.value = 42;

console.log(child.value);                        // ?
console.log(child.hasOwnProperty('value'));       // ?
console.log(child.hasOwnProperty('_value'));      // ?
```

**Output:**
```
setter called
42
```
**Answers:** `42`, `false`, `true`

**Why:** When a property on the prototype has a **setter**, assigning on the child calls the setter instead of creating an own property. The setter creates `_value` on `child` (because `this` is `child`), but `value` itself is never an own property — it's always the accessor on `parent`.

---

## Q41: Property Shadowing with Frozen Prototype Property

```javascript
const proto = { x: 10 };
Object.defineProperty(proto, 'y', {
  value: 20,
  writable: false
});

const child = Object.create(proto);

child.x = 99;
try {
  child.y = 99; // strict mode
} catch (e) {
  console.log(e.constructor.name); // ?
}

console.log(child.x); // ?
console.log(child.y); // ?
console.log(child.hasOwnProperty('x')); // ?
console.log(child.hasOwnProperty('y')); // ?
```

**Answers:** `'TypeError'`, `99`, `20`, `true`, `false`

**Why:** If a prototype property is **non-writable**, you cannot create a shadowing own property on the child via simple assignment. You'd need `Object.defineProperty(child, 'y', { value: 99 })` to bypass this. The `x` assignment works because `x` on proto is writable.

---

## Q42: Non-Enumerable Prototype Properties

```javascript
class Foo {
  bar() { return 1; }
}

Foo.prototype.baz = function() { return 2; };

const f = new Foo();

console.log(Object.keys(f));                           // ?
console.log(Object.getOwnPropertyNames(Foo.prototype)); // ?

for (const key in f) {
  console.log(key);
}
// prints?
```

**Answers:**
- `Object.keys(f)` → `[]` (own enumerable only)
- `Object.getOwnPropertyNames(Foo.prototype)` → `['constructor', 'bar', 'baz']`
- `for...in` prints: `'baz'`

**Why:** Class methods (`bar`) are non-enumerable by default. Manually assigned `baz` IS enumerable. `for...in` only shows enumerable properties (own + inherited), so it shows `baz` but not `bar` or `constructor`.

---

## Q43: Object.keys vs for...in vs Object.getOwnPropertyNames

```javascript
function Parent() { this.a = 1; }
Parent.prototype.b = 2;
Object.defineProperty(Parent.prototype, 'c', {
  value: 3,
  enumerable: false
});

const obj = new Parent();
obj.d = 4;

console.log(Object.keys(obj));                  // ?
console.log(Object.getOwnPropertyNames(obj));   // ?

const forInKeys = [];
for (const k in obj) forInKeys.push(k);
console.log(forInKeys);                         // ?
```

**Answers:**
- `Object.keys` → `['a', 'd']` (own + enumerable)
- `Object.getOwnPropertyNames` → `['a', 'd']` (own, enumerable or not)
- `for...in` → `['a', 'd', 'b']` (own + inherited, enumerable only; `c` is non-enumerable)

---

## Q44: toString Override — Type Coercion

```javascript
class Money {
  constructor(amount, currency) {
    this.amount = amount;
    this.currency = currency;
  }
  toString() {
    return `${this.amount} ${this.currency}`;
  }
  valueOf() {
    return this.amount;
  }
}

const price = new Money(100, 'USD');

console.log(`Price: ${price}`);  // ?
console.log(price + 50);        // ?
console.log(price > 99);        // ?
console.log(String(price));     // ?
```

**Answers:** `'Price: 100 USD'`, `150`, `true`, `'100 USD'`

**Why:** Template literals call `toString()`. Arithmetic operators (`+` with a number, `>`) call `valueOf()`. `String()` calls `toString()`. If only `valueOf` were defined, template literals would also use it. When both exist, JS picks based on the "hint".

---

## Q45: valueOf Without toString

```javascript
const obj = {
  valueOf() { return 42; }
};

console.log(obj + 0);   // ?
console.log(`${obj}`);  // ?
console.log(String(obj)); // ?
```

**Answers:** `42`, `'42'`, `'42'`

**Why:** When there's no custom `toString`, template literals and `String()` fall back to `valueOf()` if it returns a primitive. The result `42` is then converted to the string `'42'`.

---

## Q46: Symbol.toPrimitive Override

```javascript
class Temperature {
  constructor(celsius) {
    this.celsius = celsius;
  }
  [Symbol.toPrimitive](hint) {
    if (hint === 'number') return this.celsius;
    if (hint === 'string') return `${this.celsius}°C`;
    return this.celsius; // default
  }
}

const t = new Temperature(36.6);

console.log(+t);       // ?
console.log(`${t}`);   // ?
console.log(t + 0);    // ?
console.log(t == 36.6); // ?
```

**Answers:** `36.6`, `'36.6°C'`, `36.6`, `true`

**Why:** `Symbol.toPrimitive` takes priority over `valueOf` and `toString`. The `hint` parameter tells you the context: `'number'` for arithmetic, `'string'` for templates, `'default'` for `==` and `+`.

---

## Q47: Proxy Intercepting Prototype Lookup

```javascript
const handler = {
  get(target, prop, receiver) {
    if (prop === 'secret') return 'intercepted!';
    return Reflect.get(target, prop, receiver);
  }
};

const proto = new Proxy({ secret: 'original' }, handler);
const child = Object.create(proto);

console.log(child.secret);                    // ?
console.log(Object.getOwnPropertyNames(child)); // ?
console.log('secret' in child);               // ?
```

**Answers:** `'intercepted!'`, `[]`, `true`

**Why:** When `child` doesn't have an own property `secret`, the engine walks up to the prototype — the Proxy. The Proxy's `get` trap fires, returning `'intercepted!'`. The `in` operator also triggers the prototype chain lookup (and would trigger a `has` trap if defined).

---

## Q48: Proxy get Trap vs hasOwnProperty

```javascript
const proxy = new Proxy({}, {
  get(target, prop) {
    return `proxy: ${String(prop)}`;
  },
  has(target, prop) {
    return true;
  }
});

console.log(proxy.anything);                 // ?
console.log('anything' in proxy);            // ?
console.log(proxy.hasOwnProperty('anything')); // ?
console.log(Object.hasOwn(proxy, 'anything')); // ?
```

**Answers:** `'proxy: anything'`, `true`, `'proxy: hasOwnProperty'` (it's a string, truthy), `false`

**Why:** The `get` trap intercepts ALL property access — including `hasOwnProperty` itself, so `proxy.hasOwnProperty` returns a string, and calling it as a function would throw. `Object.hasOwn` bypasses the proxy's `get` trap for the method lookup and checks own properties directly.

---

## Q49: WeakMap for Private Data vs # Private Fields

```javascript
const _data = new WeakMap();

class OldPrivate {
  constructor(secret) {
    _data.set(this, { secret });
  }
  getSecret() {
    return _data.get(this).secret;
  }
}

class NewPrivate {
  #secret;
  constructor(secret) {
    this.#secret = secret;
  }
  getSecret() {
    return this.#secret;
  }
}

const o = new OldPrivate('old');
const n = new NewPrivate('new');

console.log(o.getSecret());  // ?
console.log(n.getSecret());  // ?
console.log(Object.keys(o)); // ?
console.log(Object.keys(n)); // ?
console.log('#secret' in n); // ?
```

**Answers:** `'old'`, `'new'`, `[]`, `[]`, `false`

**Why:** Both patterns hide data from outside access. WeakMap keys are the instances (garbage-collected when instance dies). `#secret` is a true private field — not visible via any reflection API. The `in` check for `'#secret'` as a string doesn't find it; you'd need `#secret in n` (brand check syntax).

---

## Q50: # Private Fields and Inheritance

```javascript
class Base {
  #value = 10;
  getValue() { return this.#value; }
}

class Child extends Base {
  #value = 20; // different private field!
  getChildValue() { return this.#value; }
}

const c = new Child();
console.log(c.getValue());      // ?
console.log(c.getChildValue()); // ?
```

**Answers:** `10`, `20`

**Why:** Private fields are scoped to the class that declares them. `Base.#value` and `Child.#value` are completely separate fields — they don't shadow each other. `getValue()` (defined in Base) accesses `Base.#value`, while `getChildValue()` accesses `Child.#value`.

---

## Q51: super Keyword in Object Literals

```javascript
const parent = {
  greet() { return 'parent'; }
};

const child = {
  __proto__: parent,
  greet() {
    return `child + ${super.greet()}`;
  }
};

const grandchild = {
  __proto__: child,
  greet() {
    return `grandchild + ${super.greet()}`;
  }
};

console.log(grandchild.greet()); // ?
```

**Answer:** `'grandchild + child + parent'`

**Why:** `super` works in object literal methods (concise method syntax). It's resolved based on the object where the method is **defined**, not the `this` value. Each `super.greet()` calls the next one up the chain.

---

## Q52: super is Statically Bound

```javascript
const a = {
  who() { return 'a'; }
};

const b = {
  __proto__: a,
  who() { return `b -> ${super.who()}`; }
};

const c = {
  __proto__: a,
  who() { return 'c'; }
};

// "Borrow" b's method:
c.borrowed = b.who;

console.log(c.borrowed()); // ?
```

**Answer:** `'b -> a'`

**Why:** `super` is resolved based on the **home object** where the method was originally defined (which is `b`), NOT based on the current `this` (which is `c`). So `super.who()` inside `b.who` always calls `a.who`, regardless of where you copy the method.

---

## Q53: super() Must Be Called Before this in Derived Constructors

```javascript
class Base {
  constructor() {
    this.x = 1;
  }
}

class Bad extends Base {
  constructor() {
    try {
      this.y = 2; // before super()!
    } catch (e) {
      console.log(e.constructor.name); // ?
    }
    super();
    this.y = 2;
    console.log(this.x, this.y); // ?
  }
}

new Bad();
```

**Answers:** `'ReferenceError'`, `1 2`

**Why:** In derived class constructors, `this` is uninitialized until `super()` is called. Accessing `this` before `super()` throws a `ReferenceError`. This ensures the parent constructor runs first.

---

## Q54: Class Fields Are Set After super()

```javascript
class Base {
  constructor() {
    console.log('Base sees x:', this.x);
  }
}

class Child extends Base {
  x = 42; // class field
  constructor() {
    super(); // Base constructor runs before x = 42
    console.log('Child sees x:', this.x);
  }
}

new Child();
```

**Output:**
```
Base sees x: undefined
Child sees x: 42
```

**Why:** Class fields are initialized AFTER `super()` returns but BEFORE the rest of the child constructor body. So during `super()` (Base constructor), `x` hasn't been set yet. By the time the Child constructor continues, `x` is `42`.

---

## Q55: Class Fields Shadow Prototype Methods

```javascript
class Base {
  greet() { return 'Base greet'; }
}

class Child extends Base {
  greet = () => 'Child greet'; // class field — own property
}

const c = new Child();

console.log(c.greet());                    // ?
console.log(c.hasOwnProperty('greet'));    // ?
console.log('greet' in Child.prototype);   // ?
console.log(Object.getPrototypeOf(c).greet); // ?
```

**Answers:** `'Child greet'`, `true`, `false`, `[Function: greet]` (Base's greet)

**Why:** Class field `greet = ...` creates an **own property** on the instance, not a prototype method. It shadows `Base.prototype.greet`. `Child.prototype` doesn't have `greet` at all — only Base's prototype does.

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
