# TypeScript Type System Basics

## Structural Typing

TypeScript uses **structural typing** (duck typing) — types are compatible if they have the same shape, regardless of their name.

```typescript
interface Point2D { x: number; y: number; }
interface Coordinate { x: number; y: number; }

// These are identical structurally — fully compatible!
function plot(point: Point2D): void { }
const coord: Coordinate = { x: 1, y: 2 };
plot(coord); // ✅ works! Same structure

// Extra properties are fine (object is a superset):
const point3D = { x: 1, y: 2, z: 3 };
plot(point3D); // ✅ works! Extra property z is allowed
```

---

## type vs interface — Key Differences

Both `type` and `interface` can describe the shape of an object, but they differ in capabilities and intent. `interface` is open — it can be extended by other interfaces and merged by re-declaration, making it well-suited for public APIs and library types. `type` is a true alias — it can represent any type expression including unions, intersections, tuples, and primitives, not just object shapes. In practice, choose `interface` for object types that represent entities (especially when others may extend them), and `type` for computed or composed types. When in doubt, `interface` is the conventional default for object shapes in most codebases.

```typescript
// interface:
interface User {
  name: string;
  age: number;
}

// type alias:
type User = {
  name: string;
  age: number;
};
```

| Feature | interface | type |
|---------|-----------|------|
| Declaration merging | ✅ Yes | ❌ No |
| Extends syntax | ✅ `extends` | Intersection `&` |
| Implement in class | ✅ Yes | ✅ Yes |
| Primitives/tuples/unions | ❌ No | ✅ Yes |
| Computed properties | Limited | ✅ Yes |
| `typeof` in definition | ❌ No | ✅ Yes |

```typescript
// Declaration merging (interface only):
interface Window { myApp: string; }
interface Window { theme: string; }
// Result: Window has both myApp and theme

// Union types (type only):
type StringOrNumber = string | number;
type Nullable<T> = T | null;

// Extending:
interface Admin extends User { role: 'admin'; }
type AdminUser = User & { role: 'admin' };

// Computed properties (type):
type EventHandlers = {
  [K in 'click' | 'hover' | 'focus' as `on${Capitalize<K>}`]: () => void;
};
// { onClick: () => void; onHover: () => void; onFocus: () => void }
```

**Guideline:** Use `interface` for object shapes that might be extended. Use `type` for unions, tuples, computed types, or when you need aliases.

---

## any vs unknown vs never

These three special types occupy opposite ends of TypeScript's type hierarchy. `any` is an escape hatch that disables the type checker entirely — useful when migrating JavaScript, but it silently spreads through code and eliminates safety. `unknown` is the type-safe counterpart: it accepts any value but forces you to narrow the type before using it, keeping the type checker engaged. `never` is the "bottom type" — it represents a value that can never exist, which TypeScript uses to flag unreachable code paths and to enforce exhaustive checks over unions.

```typescript
// any — opt out of type checking completely
let x: any = 5;
x.nonExistent.method(); // No error! TypeScript gives up
x = 'string';
x = { deeply: { nested: true } };

// unknown — safe alternative to any (must narrow before use)
let y: unknown = 5;
y.nonExistent; // ❌ Error — must narrow first
if (typeof y === 'number') {
  y.toFixed(2); // ✅ narrowed to number
}
if (y instanceof Date) {
  y.toISOString(); // ✅ narrowed to Date
}

// never — represents impossible state (bottom type)
// A function that NEVER returns:
function throwError(msg: string): never {
  throw new Error(msg);
}

// Exhaustive check — must handle all cases:
type Shape = 'circle' | 'square' | 'triangle';
function area(shape: Shape): number {
  switch (shape) {
    case 'circle': return Math.PI;
    case 'square': return 1;
    case 'triangle': return 0.5;
    default:
      const _exhaustive: never = shape; // If you add a shape, this errors!
      throw new Error(`Unknown shape: ${shape}`);
  }
}
```

---

## Union and Intersection Types

A union type (`A | B`) means a value is one of several possible types — it expands the set of accepted values. An intersection type (`A & B`) means a value must satisfy all types simultaneously — it narrows by combining requirements. Think of unions as "OR" and intersections as "AND". Unions are most useful for modeling values that can be in different states (e.g., a result that is either a success or an error). Intersections are most useful for composition — building a richer type by merging two existing ones.

```typescript
// Union — one OR the other
type StringOrNumber = string | number;
type Success = { ok: true; data: User };
type Failure = { ok: false; error: string };
type Result = Success | Failure;

// Intersection — both at once
type Admin = User & { role: 'admin'; permissions: string[] };

// Usage:
function process(result: Result) {
  if (result.ok) {
    console.log(result.data); // narrowed to Success
  } else {
    console.log(result.error); // narrowed to Failure
  }
}
```

---

## Literal Types

A literal type is an exact, specific value promoted to a type — `'north'` is a type that only accepts the string `'north'`, not any string. Literal types are the foundation of discriminated unions and give TypeScript the ability to exhaustively check switch statements. They arise naturally from `const` declarations (since a `const` can never be reassigned, its type is the literal value) and can be explicitly written in union form to define a fixed vocabulary of allowed values. Template literal types (TS 4.1+) extend this to generate string types by combining patterns.

```typescript
// String literals:
type Direction = 'north' | 'south' | 'east' | 'west';
type Status = 'active' | 'inactive' | 'pending';

// Number literals:
type DiceRoll = 1 | 2 | 3 | 4 | 5 | 6;
type TwoOrFour = 2 | 4;

// Boolean:
type AlwaysTrue = true;

// Template literal types (TS 4.1+):
type EventName = `on${Capitalize<string>}`;
type CSSProperty = `margin-${'top' | 'right' | 'bottom' | 'left'}`;
// 'margin-top' | 'margin-right' | 'margin-bottom' | 'margin-left'
```

---

## Type Widening

TypeScript widens types by default when you don't explicitly annotate:

```typescript
// Variable declarations without annotation → widened
let x = 'hello'; // type: string (not 'hello')
let y = 42;      // type: number (not 42)

// const → narrowed to literal (can't be reassigned)
const x = 'hello'; // type: 'hello' (literal!)
const y = 42;      // type: 42 (literal!)

// Object properties are widened even with const:
const obj = { x: 1, y: 2 }; // type: { x: number; y: number }
// Not: { x: 1; y: 2 }

// Use 'as const' to prevent widening:
const obj = { x: 1, y: 2 } as const; // type: { readonly x: 1; readonly y: 2 }
const arr = [1, 2, 3] as const;       // type: readonly [1, 2, 3]
```

---

## Interview Questions

**Q: What is structural typing and how does TypeScript use it?**
A: TypeScript's type system is structural — two types are compatible if they have the same structure/shape, regardless of their names. An object with extra properties is assignable to a type with fewer properties (it's a subtype). This contrasts with nominal typing (Java/C#) where you need explicit declarations.

**Q: What is the difference between any and unknown?**
A: `any` disables type checking completely — you can do anything with it. `unknown` is the type-safe alternative — you must narrow the type before using it. Use `unknown` for values from external sources (JSON.parse, API responses, catch clauses).

**Q: When does TypeScript use type widening?**
A: When you declare a `let` variable without annotation, TypeScript infers a wide type (e.g., `string` not `'hello'`). `const` declarations get literal types since they can't be reassigned. Use `as const` to prevent widening on object/array literals.

**Q: What is the `never` type used for?**
A: Functions that never return (`throw` or infinite loops), union types after narrowing eliminates all options (`string & number = never`), and exhaustive checks in switch statements. A variable typed `never` can never have a value — assigning to it catches unhandled cases.
