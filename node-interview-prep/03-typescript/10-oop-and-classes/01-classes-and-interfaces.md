# TypeScript OOP — Classes & Interfaces

## Interfaces

Define shapes — contracts that objects/classes must satisfy:

```ts
interface User {
  readonly id: number;
  name: string;
  email: string;
  age?: number;       // optional
  greet(): string;    // method signature
}

// Object literal must satisfy the interface
const user: User = {
  id: 1,
  name: 'Alice',
  email: 'alice@example.com',
  greet() { return `Hi, I'm ${this.name}`; },
};

// Extending interfaces
interface AdminUser extends User {
  role: 'admin' | 'superadmin';
  permissions: string[];
}

// Merging interfaces (declaration merging)
interface Window { myPlugin: () => void; }
interface Window { analytics: Analytics; }
// Both merged: Window now has myPlugin AND analytics

// Index signatures
interface StringMap {
  [key: string]: string;
}
interface NumberMap {
  [key: string]: number;
  length: number; // must also be number
}

// Callable interface
interface Formatter {
  (value: number, currency: string): string;
  locale: string;
}

// Constructable interface
interface Newable<T> {
  new(...args: unknown[]): T;
}
```

---

## Classes

```ts
class Animal {
  // Property declarations with access modifiers
  readonly species: string;
  protected name: string;
  private #age: number; // native private field

  // Static property
  static count = 0;

  constructor(species: string, name: string, age: number) {
    this.species = species;
    this.name = name;
    this.#age = age;
    Animal.count++;
  }

  // Getter / Setter
  get age(): number { return this.#age; }
  set age(value: number) {
    if (value < 0) throw new RangeError('Age cannot be negative');
    this.#age = value;
  }

  // Method
  describe(): string {
    return `${this.name} is a ${this.species}`;
  }

  // Static method
  static getCount(): number { return Animal.count; }

  // toString for template literals
  toString(): string { return this.describe(); }
}

// Shorthand constructor — declares + assigns in one line
class Point {
  constructor(
    public readonly x: number,
    public readonly y: number,
  ) {}

  distanceTo(other: Point): number {
    return Math.hypot(other.x - this.x, other.y - this.y);
  }
}
```

---

## Access Modifiers

| Modifier | Class | Subclass | Outside |
|---|---|---|---|
| `public` | ✅ | ✅ | ✅ |
| `protected` | ✅ | ✅ | ❌ |
| `private` | ✅ | ❌ | ❌ |
| `#` (native) | ✅ | ❌ | ❌ (truly private) |
| `readonly` | Read only after init | — | — |

```ts
class Base {
  public pub = 1;
  protected prot = 2;
  private priv = 3;
  #nativePriv = 4;
}

class Derived extends Base {
  test() {
    this.pub;    // ✅
    this.prot;   // ✅
    this.priv;   // ❌ TypeScript error
    this.#nativePriv; // ❌ SyntaxError (not in scope)
  }
}
```

**`private` vs `#`:**
- `private` — TypeScript-only, erased at runtime (accessible via JS)
- `#` — ECMAScript native, truly private at runtime

---

## Implementing Interfaces

```ts
interface Serializable {
  serialize(): string;
  toJSON(): object;
}

interface Validatable {
  validate(): ValidationError[];
}

// Class can implement multiple interfaces
class Order implements Serializable, Validatable {
  constructor(
    public id: string,
    public items: OrderItem[],
    public total: number,
  ) {}

  serialize(): string {
    return JSON.stringify(this.toJSON());
  }

  toJSON(): object {
    return { id: this.id, items: this.items, total: this.total };
  }

  validate(): ValidationError[] {
    const errors: ValidationError[] = [];
    if (!this.id) errors.push({ field: 'id', message: 'ID is required' });
    if (this.items.length === 0) errors.push({ field: 'items', message: 'Order must have items' });
    if (this.total < 0) errors.push({ field: 'total', message: 'Total cannot be negative' });
    return errors;
  }
}
```

---

## Abstract Classes

Can't be instantiated — define a template for subclasses:

```ts
abstract class Repository<T, ID> {
  // Concrete shared logic
  async findOrFail(id: ID): Promise<T> {
    const entity = await this.findById(id);
    if (!entity) throw new Error(`Entity ${id} not found`);
    return entity;
  }

  // Abstract — subclasses MUST implement
  abstract findById(id: ID): Promise<T | null>;
  abstract findAll(): Promise<T[]>;
  abstract save(entity: T): Promise<T>;
  abstract delete(id: ID): Promise<void>;
}

class UserRepository extends Repository<User, string> {
  async findById(id: string): Promise<User | null> {
    return db.users.findOne({ id });
  }
  async findAll(): Promise<User[]> { return db.users.find(); }
  async save(user: User): Promise<User> { return db.users.upsert(user); }
  async delete(id: string): Promise<void> { await db.users.deleteOne({ id }); }
}

// Abstract class vs Interface:
// - Abstract class: can have implementation, state, constructor
// - Interface: pure contract, no implementation, no state
// - Class can only extend one abstract class, but implement many interfaces
```

---

## Generic Classes

```ts
class Stack<T> {
  private items: T[] = [];

  push(item: T): this {
    this.items.push(item);
    return this; // enables chaining
  }

  pop(): T {
    if (this.isEmpty()) throw new Error('Stack is empty');
    return this.items.pop()!;
  }

  peek(): T {
    if (this.isEmpty()) throw new Error('Stack is empty');
    return this.items[this.items.length - 1];
  }

  isEmpty(): boolean { return this.items.length === 0; }
  get size(): number { return this.items.length; }
  [Symbol.iterator]() { return this.items[Symbol.iterator](); }
}

const numStack = new Stack<number>();
numStack.push(1).push(2).push(3);
console.log(numStack.pop()); // 3

// Constrained generic
class SortedList<T extends { compareTo(other: T): number }> {
  private items: T[] = [];

  add(item: T): void {
    this.items.push(item);
    this.items.sort((a, b) => a.compareTo(b));
  }
}
```

---

## Class Decorators (TypeScript experimental)

```ts
// tsconfig: "experimentalDecorators": true
// Method decorator
function log(target: any, key: string, descriptor: PropertyDescriptor) {
  const original = descriptor.value;
  descriptor.value = function(...args: unknown[]) {
    console.log(`Calling ${key} with`, args);
    const result = original.apply(this, args);
    console.log(`${key} returned`, result);
    return result;
  };
  return descriptor;
}

// Class decorator
function singleton<T extends new(...args: unknown[]) => object>(constructor: T) {
  let instance: InstanceType<T>;
  return class extends constructor {
    constructor(...args: unknown[]) {
      if (instance) return instance;
      super(...args);
      instance = this as unknown as InstanceType<T>;
    }
  };
}

// Property decorator
function validate(min: number, max: number) {
  return function(target: unknown, key: string) {
    let value: number;
    Object.defineProperty(target, key, {
      get: () => value,
      set: (v: number) => {
        if (v < min || v > max) throw new RangeError(`${key} must be between ${min} and ${max}`);
        value = v;
      },
    });
  };
}

class Temperature {
  @validate(-273, 1000)
  celsius!: number;

  @log
  toCelsius(fahrenheit: number): number {
    return (fahrenheit - 32) * 5 / 9;
  }
}
```

---

## Interface vs Type Alias for Objects

```ts
// Both define object shapes, but differ in key ways:

interface IUser {
  name: string;
  age: number;
}

type TUser = {
  name: string;
  age: number;
};

// interface: declaration merging (extend later)
interface IUser { email: string; } // merged — now has name, age, email

// type: cannot be re-opened
type TUser = { email: string; }; // ❌ Error: Duplicate identifier

// interface: better for object shapes (clearer error messages, OOP)
// type: better for unions, intersections, computed types
type StringOrNumber = string | number;           // union — type only
type UserOrAdmin = User & { isAdmin: boolean };  // intersection
type Keys = keyof User;                          // computed — type only

// Both: extend
interface Admin extends IUser { role: string; }
type Admin2 = TUser & { role: string; };

// Rule of thumb:
// Use interface for public API / class shapes
// Use type for unions, intersections, utility types
```

---

## Structural vs Nominal Typing

TypeScript uses **structural** typing — type compatibility is based on shape, not name:

```ts
interface Point2D { x: number; y: number; }
interface Vector2D { x: number; y: number; }

function move(p: Point2D): void {}

const v: Vector2D = { x: 1, y: 2 };
move(v); // ✅ — same shape, compatible (even though different "types")

// Duck typing in TS — if it has the right shape, it's compatible
class Dog { name: string = ''; bark() {} }
class Cat { name: string = ''; bark() {} }

const dog: Dog = new Cat(); // ✅ — same structure!

// Nominal-like typing with brand types
type USD = number & { readonly __brand: 'USD' };
type EUR = number & { readonly __brand: 'EUR' };

function toUSD(n: number): USD { return n as USD; }
function addUSD(a: USD, b: USD): USD { return (a + b) as USD; }

const usd = toUSD(100);
const eur = 100 as EUR;
addUSD(usd, eur); // ❌ TypeScript error — prevents mixing currencies
```
