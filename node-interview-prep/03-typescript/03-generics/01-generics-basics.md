# TypeScript Generics

Generics let you write reusable code that works with any type while preserving type information. They're like type-level functions — you pass types as arguments.

---

## Basic Generics

```typescript
// Without generics — loses type info:
function identity(val: any): any {
  return val;
}
const result = identity('hello'); // type: any — useless!

// With generics — type is preserved:
function identity<T>(val: T): T {
  return val;
}
const result1 = identity('hello'); // type: string ✅
const result2 = identity(42);      // type: number ✅
const result3 = identity<boolean>(true); // explicit type param

// Multiple type parameters:
function pair<A, B>(first: A, second: B): [A, B] {
  return [first, second];
}
const p = pair('hello', 42); // type: [string, number]
```

---

## Generic Constraints

```typescript
// Constraint with 'extends':
function getLength<T extends { length: number }>(val: T): number {
  return val.length;
}
getLength('hello');      // ✅ string has .length
getLength([1, 2, 3]);    // ✅ array has .length
getLength({ length: 5 }); // ✅ object with .length
getLength(42);            // ❌ number has no .length

// Extending specific type:
function firstElement<T extends any[]>(arr: T): T[0] {
  return arr[0];
}
const first = firstElement([1, 2, 3]); // type: number

// keyof constraint — ensures key exists on object:
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}
const user = { name: 'Alice', age: 30 };
const name = getProperty(user, 'name'); // type: string ✅
const age  = getProperty(user, 'age');  // type: number ✅
getProperty(user, 'email');              // ❌ 'email' not in type
```

---

## Generic Interfaces and Classes

```typescript
// Generic interface:
interface Repository<T> {
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  save(entity: T): Promise<T>;
  delete(id: string): Promise<void>;
}

interface User { id: string; name: string; email: string; }

class UserRepository implements Repository<User> {
  async findById(id: string): Promise<User | null> {
    return db.query(`SELECT * FROM users WHERE id = $1`, [id]);
  }
  async findAll(): Promise<User[]> {
    return db.query(`SELECT * FROM users`);
  }
  async save(user: User): Promise<User> {
    return db.query(`INSERT INTO users...`);
  }
  async delete(id: string): Promise<void> {
    await db.query(`DELETE FROM users WHERE id = $1`, [id]);
  }
}

// Generic class:
class Stack<T> {
  private items: T[] = [];

  push(item: T): void {
    this.items.push(item);
  }

  pop(): T | undefined {
    return this.items.pop();
  }

  peek(): T | undefined {
    return this.items[this.items.length - 1];
  }

  get size(): number {
    return this.items.length;
  }
}

const numStack = new Stack<number>();
numStack.push(1);
numStack.push(2);
const top = numStack.pop(); // type: number | undefined
```

---

## Default Type Parameters

```typescript
interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  message: string;
}

// With default — no need to specify T:
const response: ApiResponse = { data: {}, status: 200, message: 'OK' };
// data type: unknown

// With explicit T:
const userResponse: ApiResponse<User> = {
  data: { id: '1', name: 'Alice', email: 'a@b.com' },
  status: 200,
  message: 'OK'
};
// data type: User
```

---

## Generic Functions vs Generic Types

```typescript
// Generic function — T inferred from arguments:
const wrap = <T>(val: T): { value: T } => ({ value: val });
const wrapped = wrap('hello'); // { value: string }

// Generic type alias — T must be specified:
type Wrapped<T> = { value: T };
const w: Wrapped<string> = { value: 'hello' };

// Generic arrow function in TSX files — need trailing comma to avoid JSX parsing:
const identity = <T,>(val: T): T => val;
// OR use function declaration instead:
function identity<T>(val: T): T { return val; }
```

---

## Conditional Types with Generics

```typescript
// T extends U ? X : Y
type IsString<T> = T extends string ? true : false;
type A = IsString<string>; // true
type B = IsString<number>; // false

// Inferring types inside conditions:
type ReturnType<T extends (...args: any) => any> =
  T extends (...args: any) => infer R ? R : never;

type MyFunc = () => { name: string; age: number };
type Result = ReturnType<MyFunc>; // { name: string; age: number }

// Unpacking arrays:
type Unpack<T> = T extends (infer U)[] ? U : T;
type StringFromArray = Unpack<string[]>; // string
type NumAsIs       = Unpack<number>;    // number

// Deep readonly:
type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K]
};
```

---

## Generic Utility Patterns

```typescript
// Builder pattern with generics:
class QueryBuilder<T extends Record<string, any>> {
  private conditions: string[] = [];
  private entity: T | null = null;

  where(key: keyof T, value: T[typeof key]): this {
    this.conditions.push(`${String(key)} = '${value}'`);
    return this;
  }

  build(): string {
    return `SELECT * FROM table WHERE ${this.conditions.join(' AND ')}`;
  }
}

const query = new QueryBuilder<{ name: string; age: number }>()
  .where('name', 'Alice') // ✅ string value for string key
  .where('age', 30)       // ✅ number value for number key
  // .where('age', 'old') // ❌ wrong type for key!
  .build();

// Pipeline / compose with generics:
type Transformer<T, U> = (val: T) => U;

function pipe<A, B, C>(
  f: Transformer<A, B>,
  g: Transformer<B, C>
): Transformer<A, C> {
  return (a: A) => g(f(a));
}

const toNumber = (s: string) => parseInt(s, 10);
const double   = (n: number) => n * 2;

const parseAndDouble = pipe(toNumber, double);
const result = parseAndDouble('21'); // 42 — typed as (s: string) => number
```

---

## Interview Questions

**Q: What is the difference between `T extends U` as a constraint vs in a conditional type?**
A: As a constraint (`function f<T extends string>()`), it restricts what types can be passed — it's like a where clause. In a conditional type (`T extends string ? A : B`), it distributes over union types and can include `infer`. They look similar but behave differently.

**Q: What does `infer` do in TypeScript?**
A: `infer` creates a type variable inside a conditional type's extends clause that TypeScript infers from context. E.g., `T extends Promise<infer U>` extracts the resolved type of a Promise. It's how utility types like `ReturnType`, `Parameters`, `Awaited` work internally.

**Q: What is a generic constraint and why do you need it?**
A: Without constraints, TypeScript can't know what operations are valid on `T`. `T extends { length: number }` tells TypeScript that T must have a `length` property, so `val.length` is safe. Without it, accessing any property on `T` would be an error.

**Q: Can you have a generic class that extends a non-generic class?**
A: Yes — `class Repo<T> extends BaseRepo`. The generic parameter `T` belongs to `Repo` not `BaseRepo`. The base class methods have no access to `T` unless you pass it up.
