# OOP in JavaScript

JavaScript uses **prototype-based** OOP, not class-based. ES6 `class` syntax is syntactic sugar over the prototype chain.

---

## The Four Pillars

### 1. Encapsulation — hide implementation details

```js
class BankAccount {
  #balance = 0;          // private field (ES2022)
  #transactionHistory = [];

  constructor(initialBalance) {
    this.#balance = initialBalance;
  }

  deposit(amount) {
    if (amount <= 0) throw new Error('Amount must be positive');
    this.#balance += amount;
    this.#transactionHistory.push({ type: 'deposit', amount });
    return this;
  }

  withdraw(amount) {
    if (amount > this.#balance) throw new Error('Insufficient funds');
    this.#balance -= amount;
    this.#transactionHistory.push({ type: 'withdrawal', amount });
    return this;
  }

  get balance() { return this.#balance; }
  get history() { return [...this.#transactionHistory]; } // copy, not reference
}

const acc = new BankAccount(100);
acc.deposit(50).withdraw(30); // method chaining
console.log(acc.balance);     // 120
acc.#balance;                 // SyntaxError — truly private
```

### 2. Inheritance — reuse and extend

```js
class Animal {
  constructor(name, sound) {
    this.name = name;
    this.sound = sound;
  }

  speak() {
    return `${this.name} says ${this.sound}`;
  }

  toString() {
    return `[Animal: ${this.name}]`;
  }
}

class Dog extends Animal {
  #tricks = [];

  constructor(name) {
    super(name, 'woof');  // must call super before using this
  }

  learn(trick) {
    this.#tricks.push(trick);
    return this;
  }

  perform() {
    return this.#tricks.map(t => `${this.name} performs ${t}`);
  }

  // Override parent method
  speak() {
    return super.speak() + '!';  // extend parent behavior with super
  }
}

const rex = new Dog('Rex');
rex.learn('sit').learn('shake');
console.log(rex.speak());    // Rex says woof!
console.log(rex.perform());  // ['Rex performs sit', 'Rex performs shake']
console.log(rex instanceof Animal); // true — prototype chain
```

### 3. Polymorphism — same interface, different behavior

```js
class Shape {
  area() { throw new Error('area() must be implemented'); }
  toString() { return `${this.constructor.name}(area=${this.area().toFixed(2)})`; }
}

class Circle extends Shape {
  constructor(r) { super(); this.r = r; }
  area() { return Math.PI * this.r ** 2; }
}

class Rectangle extends Shape {
  constructor(w, h) { super(); this.w = w; this.h = h; }
  area() { return this.w * this.h; }
}

class Triangle extends Shape {
  constructor(b, h) { super(); this.b = b; this.h = h; }
  area() { return 0.5 * this.b * this.h; }
}

const shapes = [new Circle(5), new Rectangle(4, 6), new Triangle(3, 8)];

// Polymorphic — same call, different implementations
const totalArea = shapes.reduce((sum, s) => sum + s.area(), 0);
console.log(shapes.map(String));
// ['Circle(area=78.54)', 'Rectangle(area=24.00)', 'Triangle(area=12.00)']
```

### 4. Abstraction — expose essential, hide details

```js
// Abstract base class pattern (no abstract keyword in JS)
class AbstractRepository {
  constructor() {
    if (new.target === AbstractRepository) {
      throw new Error('AbstractRepository cannot be instantiated directly');
    }
  }

  // Abstract methods — subclasses MUST implement these
  async findById(id) { throw new Error('findById must be implemented'); }
  async findAll() { throw new Error('findAll must be implemented'); }
  async save(entity) { throw new Error('save must be implemented'); }
  async delete(id) { throw new Error('delete must be implemented'); }
}

class UserRepository extends AbstractRepository {
  #db;
  constructor(db) { super(); this.#db = db; }
  async findById(id) { return this.#db.query('SELECT * FROM users WHERE id = ?', [id]); }
  async findAll() { return this.#db.query('SELECT * FROM users'); }
  async save(user) { /* ... */ }
  async delete(id) { /* ... */ }
}
```

---

## Static Methods and Properties

Static methods and properties belong to the class constructor itself, not to any instance. They are useful for utility functions that operate on the class's domain but don't require access to instance state, and for factory methods that provide named, semantically clear constructors as an alternative to multiple constructor signatures. Static private fields (`static #count`) are the correct way to maintain class-level state such as instance counters or caches without exposing them globally. Use static methods when the operation is conceptually about the class rather than about a specific instance.

```js
class MathUtils {
  static PI = 3.14159;

  static add(a, b) { return a + b; }
  static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
}

MathUtils.add(2, 3);    // 5 — no instance needed
new MathUtils().add();  // TypeError — can't call static on instance (well, you can but it's bad practice)

// Static for factory methods
class User {
  static #count = 0;

  constructor(name, role) {
    this.id = ++User.#count;
    this.name = name;
    this.role = role;
  }

  static createAdmin(name) { return new User(name, 'admin'); }
  static createGuest() { return new User('Guest', 'guest'); }
  static getCount() { return User.#count; }
}

const admin = User.createAdmin('Alice');
const guest = User.createGuest();
console.log(User.getCount()); // 2
```

---

## Mixins

JavaScript doesn't support multiple inheritance, but mixins let you compose behavior:

```js
// Mixin: a function that takes a base class and extends it
const Serializable = (Base) => class extends Base {
  serialize() {
    return JSON.stringify(this);
  }

  static deserialize(json) {
    return Object.assign(new this(), JSON.parse(json));
  }
};

const Timestamped = (Base) => class extends Base {
  constructor(...args) {
    super(...args);
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  touch() {
    this.updatedAt = new Date();
    return this;
  }
};

const Validatable = (Base) => class extends Base {
  validate() {
    const errors = [];
    for (const [key, rule] of Object.entries(this.constructor.rules ?? {})) {
      if (!rule(this[key])) errors.push(`${key} is invalid`);
    }
    return errors;
  }
};

// Compose mixins
class Post extends Serializable(Timestamped(Validatable(class {}))) {
  static rules = {
    title: (v) => v && v.length > 0,
    body: (v) => v && v.length >= 10,
  };

  constructor(title, body) {
    super();
    this.title = title;
    this.body = body;
  }
}

const post = new Post('Hello', 'This is a post body...');
post.validate(); // []
post.touch();    // updates updatedAt
post.serialize(); // JSON string
```

---

## Composition Over Inheritance

Deep inheritance hierarchies become brittle because every subclass is tightly coupled to every ancestor — a change in the base class ripples down to all children. Composition avoids this by building objects from small, independent behavior objects rather than from a parent class. The mental model is "has-a" instead of "is-a": a duck has flying behavior and quacking behavior, rather than being a `FlyingQuackingAnimal`. Use inheritance when there is a genuine "is-a" relationship and the subclass truly conforms to the full contract of the parent (Liskov substitution). Prefer composition when you want to mix multiple behaviors, when the hierarchy would grow wide, or when behaviors need to vary independently.

```js
// Inheritance: rigid hierarchy
class FlyingFishingDuck extends Duck {} // Duck → FlyingDuck → FlyingFishingDuck

// Composition: pick behaviors à la carte
const canFly = {
  fly() { return `${this.name} is flying`; }
};

const canFish = {
  fish() { return `${this.name} is fishing`; }
};

const canQuack = {
  quack() { return `${this.name} says quack`; }
};

function createDuck(name, ...behaviors) {
  return Object.assign({ name }, ...behaviors);
}

const duck = createDuck('Donald', canFly, canQuack);       // flies + quacks
const fishingDuck = createDuck('Daffy', canFly, canFish, canQuack); // all three

console.log(duck.fly());         // Donald is flying
console.log(fishingDuck.fish()); // Daffy is fishing
```

---

## SOLID Principles (JS Examples)

### S — Single Responsibility

```js
// ❌ One class does too much
class UserManager {
  saveUser(user) { /* DB logic */ }
  sendEmail(user) { /* Email logic */ }
  generateReport(users) { /* Report logic */ }
}

// ✅ Each class has one reason to change
class UserRepository { save(user) { /* DB only */ } }
class EmailService { sendWelcome(user) { /* Email only */ } }
class UserReporter { generate(users) { /* Report only */ } }
```

### O — Open/Closed

```js
// ❌ Must modify class to add new discount type
class OrderCalculator {
  calculateTotal(order) {
    if (order.type === 'vip') return order.total * 0.9;
    if (order.type === 'student') return order.total * 0.8;
    return order.total;
  }
}

// ✅ Open for extension, closed for modification
class PercentageDiscount {
  constructor(percent) { this.factor = 1 - percent / 100; }
  apply(total) { return total * this.factor; }
}

class OrderCalculator {
  constructor(discount = null) { this.discount = discount; }
  total(order) {
    return this.discount ? this.discount.apply(order.total) : order.total;
  }
}

const vipCalc = new OrderCalculator(new PercentageDiscount(10));
const studentCalc = new OrderCalculator(new PercentageDiscount(20));
```

### L — Liskov Substitution

```js
// ❌ Square breaking Rectangle behavior
class Rectangle {
  setWidth(w) { this.width = w; }
  setHeight(h) { this.height = h; }
  area() { return this.width * this.height; }
}

class Square extends Rectangle {
  setWidth(w) { this.width = this.height = w; }   // breaks parent contract
  setHeight(h) { this.width = this.height = h; }
}

// ✅ Prefer composition or separate hierarchy
class Shape { area() { throw new Error(); } }
class Rectangle extends Shape { constructor(w,h){super();this.w=w;this.h=h;} area(){return this.w*this.h;} }
class Square extends Shape { constructor(s){super();this.s=s;} area(){return this.s**2;} }
```

### I — Interface Segregation

```js
// ❌ Fat interface — not all printers print AND scan AND fax
class MultifunctionPrinter {
  print(doc) {}
  scan(doc) {}
  fax(doc) {}
}

// ✅ Composable small interfaces (via mixins)
const Printable = (Base) => class extends Base { print(doc) {} };
const Scannable = (Base) => class extends Base { scan(doc) {} };
const Faxable  = (Base) => class extends Base { fax(doc) {} };

class SimplePrinter extends Printable(class{}) {}                    // only print
class AllInOne extends Faxable(Scannable(Printable(class{}))) {}     // all three
```

### D — Dependency Inversion

```js
// ❌ High-level module depends on concrete implementation
class OrderService {
  constructor() {
    this.db = new MySQLDatabase(); // concrete dependency
  }
}

// ✅ Depend on abstractions (inject dependencies)
class OrderService {
  constructor(db, emailService, logger) {
    this.db = db;                 // interface, not concrete
    this.emailService = emailService;
    this.logger = logger;
  }

  async createOrder(orderData) {
    const order = await this.db.save(orderData);
    await this.emailService.sendConfirmation(order);
    this.logger.info('Order created', { orderId: order.id });
    return order;
  }
}

// Easy to test with mocks
const orderService = new OrderService(
  mockDb, mockEmailService, mockLogger
);
```

---

## Private Fields vs Closure-based Privacy

JavaScript has two mechanisms for true data hiding. Closure-based privacy predates classes: a factory function returns an object whose methods close over private variables in the enclosing scope — those variables are inaccessible from outside. The modern approach is class private fields using `#` syntax, which are hard-private: they cannot be accessed via `obj['#field']`, property enumeration, or devtools property inspection (though devtools may show them with special privilege). Private fields are preferred in new code because they work with `instanceof`, inheritance via `super`, and class syntax. Closure-based patterns remain useful for module-level state or when factory functions are preferred over `new`.

```js
// Old pattern: closure-based (before # fields)
function createCounter(initial = 0) {
  let count = initial; // private via closure
  return {
    increment() { count++; },
    get() { return count; },
  };
}

// Modern: class with # fields
class Counter {
  #count;
  constructor(initial = 0) { this.#count = initial; }
  increment() { this.#count++; }
  get() { return this.#count; }
}

// # fields are truly private — not in prototype, not in JSON.stringify
// Closure-based: count is accessible in devtools via closure inspection
```

---

## instanceof and Type Checking

`instanceof` walks the prototype chain to determine whether a constructor's `prototype` appears anywhere in an object's chain — it is not a simple type tag check. This means it correctly returns `true` for subclass instances, but can give false negatives across realm boundaries (e.g., an `Array` created in an iframe fails `instanceof Array` in the parent frame). For primitives, `typeof` is the right tool, except for `null` which requires an explicit `=== null` check due to the historic `typeof null === 'object'` bug. `Array.isArray()` and `Object.prototype.toString.call()` are more reliable than `instanceof` when cross-realm correctness matters.

```js
class Animal {}
class Dog extends Animal {}

const d = new Dog();
d instanceof Dog;    // true
d instanceof Animal; // true — checks entire prototype chain
d instanceof Object; // true — everything is

// Better type check for primitives
typeof 'hello'    // 'string'
typeof 42         // 'number'
typeof null       // 'object' — famous bug!
typeof undefined  // 'undefined'
typeof {}         // 'object'
typeof []         // 'object' — use Array.isArray()
typeof function(){} // 'function'

Array.isArray([]);                 // true
Object.prototype.toString.call(null);   // '[object Null]'
Object.prototype.toString.call([]);     // '[object Array]'
Object.prototype.toString.call(/re/);   // '[object RegExp]'
```
