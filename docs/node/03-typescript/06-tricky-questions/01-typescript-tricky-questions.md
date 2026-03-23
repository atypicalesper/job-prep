# TypeScript — Tricky Interview Questions

---

## Q1: What is the output type?

```typescript
type A = string extends any ? 1 : 0;
type B = any extends string ? 1 : 0;
```

**Answer:** `A = 1`, `B = 0 | 1` (i.e., `number`)

**Why:** `string extends any` is always true (`any` is everything). `any extends string` is special — `any` produces a union of both branches: `1 | 0`. TypeScript treats `any` as matching both sides of a conditional.

---

## Q2: Structural Typing Surprise

```typescript
interface Empty {}
interface HasName { name: string; }

function greet(obj: Empty): void {}

greet({ name: 'Alice', age: 30 }); // ❌ or ✅?
greet({} as HasName);              // ❌ or ✅?
```

**Answer:** Both ✅ work!

**Why:** Structural typing — `Empty` has no required properties, so ANY object satisfies it. `HasName` is a superset of `Empty` (it has all required properties + more). Fresh object literals with extra properties trigger "excess property checks" but passing a variable or cast avoids that.

---

## Q3: Function Parameter Variance

```typescript
type Logger = (msg: string) => void;

const l1: Logger = (msg: string | number) => {}; // ✅ or ❌?
const l2: Logger = (msg: 'hello') => {};          // ✅ or ❌?
```

**Answer:** `l1` ✅, `l2` ❌

**Why:** Function parameters are contravariant (with `strictFunctionTypes`). A Logger that accepts `string | number` is MORE capable than one that only accepts `string` — it can safely be used as a `Logger`. A Logger that only accepts the literal `'hello'` is LESS capable — it would break if called with `'world'`.

---

## Q4: Type Widening

```typescript
const a = 'hello';         // type?
let b = 'hello';           // type?
const c = { x: 1, y: 2 }; // type of c.x?

const arr1 = [1, 2, 3];           // type?
const arr2 = [1, 2, 3] as const;  // type?
```

**Answer:**
- `a`: `'hello'` (literal — const can't be reassigned)
- `b`: `string` (widened — let can be reassigned)
- `c.x`: `number` (object properties always widened even with const)
- `arr1`: `number[]`
- `arr2`: `readonly [1, 2, 3]` (literal tuple)

---

## Q5: never Propagation

```typescript
type T1 = string & number;       // ?
type T2 = never | string;        // ?
type T3 = never & string;        // ?
type T4 = Exclude<string, string>; // ?
```

**Answer:** `never`, `string`, `never`, `never`

**Why:** `string & number` = impossible intersection = `never`. `never | X` = `X` (never contributes nothing to a union). `never & X` = `never` (never absorbs intersections). `Exclude<string, string>` removes all matching types = `never`.

---

## Q6: Excess Property Checking

```typescript
interface Config { host: string; port: number; }

// Which ones error?
const c1: Config = { host: 'localhost', port: 3000, debug: true }; // ❌?
const obj = { host: 'localhost', port: 3000, debug: true };
const c2: Config = obj; // ❌?

function connect(config: Config) {}
connect({ host: 'localhost', port: 3000, debug: true }); // ❌?
```

**Answer:** `c1` ❌, `c2` ✅, `connect(...)` ❌

**Why:** Excess property checks only happen with "fresh" object literals assigned directly to a typed variable or passed directly to a function. Assigning via a variable (`obj`) bypasses the check — TypeScript uses structural typing for variables.

---

## Q7: Optional vs undefined

```typescript
interface A {
  x?: string;       // x is optional
}
interface B {
  x: string | undefined; // x is required but can be undefined
}

const a: A = {};                     // ✅
const b: B = {};                     // ❌
const b2: B = { x: undefined };     // ✅

// With exactOptionalPropertyTypes: true
const a2: A = { x: undefined };     // ❌ (with flag) or ✅ (without)
```

**Answer:** Depends on `exactOptionalPropertyTypes`. Without it, `x?: string` is `x?: string | undefined` — `{ x: undefined }` is OK. With the flag, optional means "may be absent" but if present must be `string`.

---

## Q8: keyof with Union vs Intersection

```typescript
type A = { a: string; shared: number; };
type B = { b: string; shared: boolean; };

type U = keyof (A | B);         // ?
type I = keyof (A & B);         // ?
```

**Answer:** `U = 'shared'`, `I = 'a' | 'b' | 'shared'`

**Why:** `keyof (A | B)` = keys that exist on ALL members = `'shared'` (only common key). `keyof (A & B)` = keys from either type = `'a' | 'b' | 'shared'`. This is counterintuitive — union of types → intersection of keys, intersection of types → union of keys.

---

## Q9: infer in Different Positions

```typescript
type Head<T extends any[]> = T extends [infer H, ...any[]] ? H : never;
type Tail<T extends any[]> = T extends [any, ...infer T] ? T : never;
type Last<T extends any[]> = T extends [...any[], infer L] ? L : never;

type H = Head<[1, 2, 3]>;  // ?
type T = Tail<[1, 2, 3]>;  // ?
type L = Last<[1, 2, 3]>;  // ?
```

**Answer:** `H = 1`, `T = [2, 3]`, `L = 3`

**Why:** `infer` captures the type at its position in the tuple. `[infer H, ...any[]]` captures the first element. `[any, ...infer T]` captures the rest (as a tuple). `[...any[], infer L]` captures the last element.

---

## Q10: Recursive Types

```typescript
type Json =
  | string | number | boolean | null
  | Json[]
  | { [key: string]: Json };

const valid: Json = {
  name: 'Alice',
  scores: [1, 2, { extra: true }],
  meta: null
};
```

**Q: Is this valid TypeScript?** ✅ Yes — recursive type aliases are supported since TS 3.7.

---

## Q11: typeof vs Type Annotations

```typescript
class UserService {
  findById(id: string): Promise<User> { ... }
}

const service = new UserService();

type A = typeof UserService;         // ?
type B = typeof service;             // ?
type C = InstanceType<typeof UserService>; // ?
```

**Answer:**
- `A = typeof UserService` — the constructor type (class itself, not instance)
- `B = UserService` — instance type (same as explicit annotation)
- `C = UserService` — explicit way to get instance type from constructor type

---

## Q12: Discriminated Union Exhaustiveness

```typescript
type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'square'; side: number };

function area(s: Shape): number {
  if (s.kind === 'circle') return Math.PI * s.radius ** 2;
  if (s.kind === 'square') return s.side ** 2;
  // ❌ TypeScript doesn't error here by default!
}
```

**Q: How do you make TypeScript enforce exhaustiveness?**

```typescript
// Solution 1: Add default with never assertion
function area(s: Shape): number {
  if (s.kind === 'circle') return Math.PI * s.radius ** 2;
  if (s.kind === 'square') return s.side ** 2;
  const _never: never = s; // ❌ Error if a case is missing
  return _never;
}

// Solution 2: switch with default
function area(s: Shape): number {
  switch (s.kind) {
    case 'circle': return Math.PI * s.radius ** 2;
    case 'square': return s.side ** 2;
    default:
      const _never: never = s;
      throw new Error(`Unknown shape: ${JSON.stringify(s)}`);
  }
}
```

---

## Q13: Declaration Merging

```typescript
interface Point { x: number; }
interface Point { y: number; }

const p: Point = { x: 1 }; // ❌ or ✅?
const p2: Point = { x: 1, y: 2 }; // ❌ or ✅?
```

**Answer:** `p` ❌, `p2` ✅ — interfaces with same name merge. The merged `Point` requires both `x` and `y`.

---

## Q14: Type Assertion Safety

```typescript
const x = 'hello' as unknown as number; // ❌ or ✅?
x.toFixed(2); // What happens?
```

**Answer:** ✅ compiles — no error. Runtime `TypeError` when `toFixed` is called on a string.

**Why:** Type assertions (`as`) are compile-time only. The double-assertion via `unknown` bypasses TypeScript's safety check (which normally requires the types to overlap). This is an escape hatch but completely unsafe.

---

## Q15: Function Overloads

```typescript
function process(x: string): string;
function process(x: number): number;
function process(x: string | number): string | number {
  return x;
}

const r1 = process('hello'); // type?
const r2 = process(42);      // type?
const r3 = process(true);    // ❌ or ✅?
```

**Answer:** `r1`: `string`, `r2`: `number`, `r3`: ❌ error (no overload matches `boolean`).

**Why:** Overloads let TypeScript return specific types based on input types. The implementation signature is NOT exposed to callers — only the overload signatures are. Only types that match an overload signature are accepted.
