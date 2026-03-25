# TypeScript Type Narrowing

Narrowing = TypeScript refining a broad type (e.g., `string | number`) to a specific type based on runtime checks.

---

## typeof Guard

`typeof` is a JavaScript runtime operator that returns a string describing a value's primitive type. TypeScript understands `typeof` checks inside conditionals and uses them to narrow the type within that branch — this is one of the most common narrowing mechanisms. It works reliably for the seven primitive types but has a well-known quirk: `typeof null === 'object'`, so a null check must be handled separately when narrowing nullable types.

```typescript
function process(val: string | number | boolean) {
  if (typeof val === 'string') {
    return val.toUpperCase(); // string
  } else if (typeof val === 'number') {
    return val.toFixed(2); // number
  } else {
    return val ? 'yes' : 'no'; // boolean
  }
}

// typeof narrowing works for:
// 'string' | 'number' | 'boolean' | 'bigint' | 'symbol' | 'undefined' | 'function' | 'object'
// Note: typeof null === 'object' — gotcha!
```

---

## instanceof Guard

`instanceof` checks whether an object was created by a specific constructor function by walking the prototype chain. TypeScript narrows the type to that class in the truthy branch, giving you access to all of its methods and properties. It is the idiomatic way to distinguish between class instances in a union — use it when your union members are actual class instances rather than plain objects.

```typescript
function formatDate(val: Date | string): string {
  if (val instanceof Date) {
    return val.toISOString(); // Date
  }
  return val; // string
}

// Works with custom classes:
class Dog { bark() {} }
class Cat { meow() {} }

function makeSound(animal: Dog | Cat) {
  if (animal instanceof Dog) {
    animal.bark(); // Dog
  } else {
    animal.meow(); // Cat
  }
}
```

---

## in Operator Guard

The `in` operator checks whether a property exists on an object. TypeScript uses this to narrow union types by treating the presence of a unique property as a discriminator. It is most useful when your union is composed of plain object types (not class instances) that each have a distinctive property — for example, `'radius' in shape` tells TypeScript the shape must be a `Circle`. Use `in` when you cannot add a literal discriminant tag and want structural discrimination instead.

```typescript
interface Circle { kind: 'circle'; radius: number; }
interface Square { kind: 'square'; side: number; }
interface Triangle { kind: 'triangle'; base: number; height: number; }

type Shape = Circle | Square | Triangle;

// Using 'in' to check for property existence:
function area(shape: Shape): number {
  if ('radius' in shape) {
    return Math.PI * shape.radius ** 2; // Circle
  } else if ('side' in shape) {
    return shape.side ** 2; // Square
  } else {
    return 0.5 * shape.base * shape.height; // Triangle
  }
}
```

---

## Discriminated Unions (Tagged Unions) — Most Powerful Pattern

A discriminated union is a union of object types that all share a common property with distinct literal types — the "tag" or "discriminant". TypeScript narrows the entire union to the correct member just by checking the tag, making `switch`/`case` statements fully type-safe and exhaustive. This is the preferred pattern for modeling state machines, async states, action types (Redux), and API responses. The key benefit over plain unions is that adding a new variant automatically causes compile errors in every switch that does not handle it — the compiler enforces completeness.

```typescript
type Result<T> =
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error }
  | { status: 'loading' };

function handleResult<T>(result: Result<T>) {
  switch (result.status) {
    case 'success':
      console.log(result.data); // T — narrowed
      break;
    case 'error':
      console.error(result.error.message); // Error — narrowed
      break;
    case 'loading':
      console.log('Loading...'); // only status field
      break;
  }
}

// Real-world example — Redux actions:
type Action =
  | { type: 'INCREMENT'; by: number }
  | { type: 'DECREMENT'; by: number }
  | { type: 'RESET' };

function reducer(state: number, action: Action): number {
  switch (action.type) {
    case 'INCREMENT': return state + action.by; // action.by: number ✅
    case 'DECREMENT': return state - action.by; // action.by: number ✅
    case 'RESET':     return 0;                 // action has no .by ✅
    default:
      const _never: never = action; // exhaustiveness check
      return state;
  }
}
```

---

## Type Predicates (User-Defined Type Guards)

When narrowing logic is too complex to express inline (e.g., checking a deeply nested property or calling external validation), you can encapsulate it in a function with a return type of `paramName is Type`. This is called a type predicate. TypeScript trusts the predicate and narrows the type in the `if` block where the function returns `true`. Without a predicate, a function that returns `boolean` carries no narrowing information — TypeScript sees only `boolean`, not what the boolean means about the argument's type.

```typescript
// Syntax: paramName is Type
function isString(val: unknown): val is string {
  return typeof val === 'string';
}

function isDate(val: unknown): val is Date {
  return val instanceof Date;
}

// Without predicate — TypeScript doesn't narrow:
function badGuard(val: unknown): boolean {
  return typeof val === 'string';
}
const x: unknown = 'hello';
if (badGuard(x)) {
  x.toUpperCase(); // ❌ Still unknown — boolean doesn't narrow!
}

// With predicate — TypeScript narrows:
if (isString(x)) {
  x.toUpperCase(); // ✅ Narrowed to string
}

// Complex predicates:
interface Admin { role: 'admin'; permissions: string[] }
interface User  { role: 'user';  name: string }

function isAdmin(user: Admin | User): user is Admin {
  return user.role === 'admin';
}

// Array filtering with type predicates:
const maybeUsers = [{ name: 'Alice' }, null, { name: 'Bob' }, undefined];

// Without predicate — type is (User | null | undefined)[]
const badFiltered = maybeUsers.filter(u => u !== null && u !== undefined);
// badFiltered type is still (User | null | undefined)[] — TypeScript doesn't know!

// With predicate — type is User[]
function isUser(u: typeof maybeUsers[number]): u is { name: string } {
  return u !== null && u !== undefined;
}
const goodFiltered = maybeUsers.filter(isUser); // { name: string }[] ✅
```

---

## Assertion Functions

An assertion function has a return type of `asserts val is Type` — it never returns normally if the condition is false (it throws instead). Unlike a type predicate which narrows inside an `if` block, an assertion function narrows the type for all code after the call site. This makes them ideal for fail-fast validation at the start of a function or module boundary: call the assertion once, and the entire rest of the function benefits from the narrowed type without any branching.

```typescript
// assert functions never return normally (throw if assertion fails)
function assertIsString(val: unknown): asserts val is string {
  if (typeof val !== 'string') {
    throw new Error(`Expected string, got ${typeof val}`);
  }
}

function assertIsDefined<T>(val: T): asserts val is NonNullable<T> {
  if (val === undefined || val === null) {
    throw new Error(`Expected defined value, got ${val}`);
  }
}

// Usage — TypeScript narrows after the assert:
const config: unknown = JSON.parse('{"port": 3000}');
assertIsString((config as any).host); // throws if not string
// After assertion — TypeScript trusts it's a string
```

---

## Truthiness Narrowing

JavaScript's truthy/falsy coercion also serves as a narrowing mechanism. When you write `if (val)`, TypeScript removes `null`, `undefined`, `false`, `0`, `NaN`, and `''` from the type inside the block. This is a common shorthand for null/undefined guards but introduces a subtle hazard: `0` and `''` are valid, meaningful values that get falsely excluded. Prefer `!== null` and `!== undefined` (or the nullish coalescing `?? `) over truthiness checks when dealing with numbers or strings that may legitimately be zero or empty.

```typescript
// Truthy/falsy narrows away null | undefined | 0 | '' | false | NaN
function process(val: string | null | undefined) {
  if (val) {
    // val is string (not null, undefined, or '')
    return val.toUpperCase();
  }
  return 'default';
}

// Watch out — 0 and '' are falsy!
function badProcess(val: number | null) {
  if (val) {
    // ❌ Excludes 0! 0 is a valid number but falsy
    return val.toFixed(2);
  }
  return '0.00';
}

// Better — use explicit null check:
function goodProcess(val: number | null) {
  if (val !== null) {
    return val.toFixed(2); // includes 0 ✅
  }
  return '0.00';
}
```

---

## Equality Narrowing

Strict equality (`===`) narrows both operands to the literal value they're compared against. Loose equality (`==`) has an additional useful property: `null == undefined` is `true`, so `x == null` is a concise way to check for both `null` and `undefined` simultaneously. TypeScript understands both forms and applies the appropriate narrowing in each branch.

```typescript
// == checks (null == undefined → true):
function process(a: string | null, b: string | undefined) {
  if (a == b) {
    // Both null == undefined OR a === b (both same string)
    // Here: a is string | null, b is string | undefined
    // If a == null → a is null, b is undefined (they're == but not ===)
  }
}

// Strict equality narrows both sides:
function strictNarrow(val: string | number) {
  if (val === 'hello') {
    val; // type: 'hello' (literal)
  }
}
```

---

## Control Flow Analysis

TypeScript tracks type through control flow automatically:

```typescript
function example(val: string | number | null) {
  // val: string | number | null

  if (val === null) return;
  // val: string | number (null eliminated)

  if (typeof val === 'string') {
    return val.toUpperCase(); // string
  }
  // val: number (string eliminated by return above)

  return val.toFixed(2); // number
}

// Early return pattern — very readable:
function processUser(user: User | null) {
  if (!user) return null;
  // user: User guaranteed below

  if (!user.email) return { error: 'no email' };
  // user.email: string guaranteed below

  return { email: user.email.toLowerCase() };
}
```

---

## Interview Questions

**Q: What is a discriminated union and why is it better than a regular union?**
A: A discriminated union has a common "tag" property (e.g., `kind`, `type`, `status`) with literal types. TypeScript can narrow to the exact member based on the tag. Better than regular unions because narrowing is clean with `switch/case`, TypeScript can detect exhaustiveness (via `never`), and adding a new member causes compile errors everywhere it's not handled.

**Q: What's the difference between a type predicate and an assertion function?**
A: Type predicates (`val is Type`) narrow types in the `if` branch — they're normal functions that return `boolean`. Assertion functions (`asserts val is Type`) narrow types after the call site — they throw instead of returning false. Use predicates for filtering, use assertions for fail-fast validation.

**Q: Why doesn't `Array.filter(x => x !== null)` give you a non-nullable array type?**
A: `filter`'s generic signature doesn't know what the predicate means — it only infers `T[]` → `T[]`. You need a type predicate: `filter((x): x is NonNullable<typeof x> => x !== null)` to get the narrowed type.

**Q: What is control flow analysis in TypeScript?**
A: TypeScript tracks the type of a variable through code paths — after a null check, it knows the variable can't be null. After an early return, subsequent code has the narrowed type. Loops and assignments can widen types back. This is done statically at compile time, without runtime cost.
