# TypeScript Strict Mode

## What is `"strict": true`?

Enabling `"strict": true` in `tsconfig.json` turns on a set of type-checking flags that catch many more bugs. It's the recommended setting for all new TypeScript projects.

```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

`"strict": true` enables ALL of these:

| Flag | What it does |
|------|-------------|
| `strictNullChecks` | `null` and `undefined` are their own types |
| `strictFunctionTypes` | Function parameter types are checked contravariantly |
| `strictBindCallApply` | `call`/`apply`/`bind` are properly typed |
| `strictPropertyInitialization` | Class props must be initialized in constructor |
| `noImplicitAny` | Error when type is implicitly `any` |
| `noImplicitThis` | Error when `this` has implicit `any` type |
| `alwaysStrict` | Emits `"use strict"` in every output file |
| `useUnknownInCatchVariables` | Catch variables are `unknown` (not `any`) |

---

## strictNullChecks — The Most Important Flag

Without it, `null` and `undefined` are assignable to every type. With it, they're their own distinct types.

```typescript
// Without strictNullChecks:
let name: string = null; // OK
let age: number = undefined; // OK
// Bugs like calling .toLowerCase() on null go undetected

// With strictNullChecks:
let name: string = null;        // ❌ Error!
let name: string | null = null; // ✅
let name: string | null | undefined = undefined; // ✅

// Functions:
function greet(name: string) {
  console.log(name.toUpperCase()); // safe — name can't be null
}

function greetMaybe(name: string | null) {
  console.log(name.toUpperCase()); // ❌ name might be null!
  console.log(name?.toUpperCase()); // ✅ optional chaining
  if (name !== null) {
    console.log(name.toUpperCase()); // ✅ narrowed
  }
}
```

---

## noImplicitAny — Require Explicit Types

Without this flag, TypeScript silently infers `any` when it cannot determine a type — most commonly on unannotated function parameters. This defeats the purpose of TypeScript for those values. `noImplicitAny` requires you to be explicit: either annotate the parameter with a real type, or deliberately write `any` to opt out. The explicit `any` is a signal that you are consciously bypassing the type checker, rather than doing it accidentally.

```typescript
// Without noImplicitAny:
function process(data) { // 'data' implicitly has 'any' type
  return data.value; // no type checking at all
}

// With noImplicitAny:
function process(data) { // ❌ Error: Parameter 'data' implicitly has an 'any' type
  return data.value;
}

// Fix — add explicit type:
function process(data: UserData) { // ✅
  return data.value;
}
// Or explicitly say any (opt-out):
function process(data: any) { // ✅ explicit — you accept the risk
  return data.value;
}
// Or use unknown (safer):
function process(data: unknown) {
  if (isUserData(data)) return data.value; // must narrow first
}
```

---

## strictPropertyInitialization — Class Properties

This flag enforces that every class property declared with a type must either be initialized in its declaration or definitely assigned in the constructor. The problem it solves is common: a property is declared but only assigned asynchronously (in `init()` or a lifecycle hook), causing runtime errors when code tries to use it before setup completes. If you genuinely need to defer initialization, the definite assignment assertion (`!`) lets you signal this intent explicitly rather than silently allowing the unsafe pattern.

```typescript
class UserService {
  // ❌ Error: Property 'db' has no initializer and is not
  // definitely assigned in the constructor.
  private db: Database;

  // ✅ Option 1: Initialize in declaration
  private db: Database = new Database();

  // ✅ Option 2: Initialize in constructor
  constructor(db: Database) {
    this.db = db;
  }

  // ✅ Option 3: Definite assignment assertion (use carefully!)
  private db!: Database; // "trust me, I'll assign this"
  // Useful when assigned in an init() method called from constructor
}
```

---

## strictFunctionTypes — Contravariant Parameters

Function type compatibility is counterintuitive: a function that accepts a wider (more general) input type is actually more capable — it can safely substitute anywhere a more specific function is expected. This is called contravariance. Without `strictFunctionTypes`, TypeScript was bivariant for method parameters (allowing both directions), which was unsound and could let you call a `DogHandler` with a `Cat` at runtime. With this flag, parameter types are checked contravariantly for function-type properties, catching real bugs in callback types and event handler assignments.

```typescript
// Function parameters are contravariant in strict mode
type Handler = (event: MouseEvent) => void;

// ❌ More specific parameter type — not assignable
const clickHandler: Handler = (event: UIEvent) => { }; // UIEvent is LESS specific than MouseEvent

// Correct understanding:
// If Handler expects MouseEvent, a handler that accepts UIEvent is SAFER
// (UIEvent is broader than MouseEvent — it accepts more)
// So actually assigning (event: UIEvent) => void to Handler is... complex

// The key rule: Parameter types are contravariant
// A function that accepts a WIDER type is a subtype of a function with a NARROWER type

type AnimalHandler = (animal: Animal) => void;
type DogHandler = (dog: Dog) => void; // Dog extends Animal

// ❌ DogHandler is NOT assignable to AnimalHandler (strict mode)
// because a function that only handles Dogs can't handle any Animal

// ✅ AnimalHandler IS assignable to DogHandler
// because a function that handles any Animal can handle a Dog
const handleAnimal: AnimalHandler = (a: Animal) => {};
const handleDog: DogHandler = handleAnimal; // ✅ safe!
```

---

## noImplicitThis — Typed `this`

In JavaScript, `this` inside a regular function depends on how the function is called, not where it's defined. TypeScript normally cannot infer a meaningful type for `this` in standalone functions, so it defaults to `any` — disabling all type checks on `this` access. `noImplicitThis` flags these cases, requiring you to declare an explicit `this` parameter (a TypeScript-only annotation that disappears at compile time) so the type checker can verify that your `this` access is safe. Class methods are already fine because `this` is always the class instance.

```typescript
// Without noImplicitThis:
function greet() {
  return this.name; // this: any — no checking
}

// With noImplicitThis:
function greet() {
  return this.name; // ❌ Error: 'this' implicitly has type 'any'
}

// Fix — add 'this' parameter (not a real param, just a type hint):
function greet(this: { name: string }) {
  return this.name; // ✅ TypeScript knows 'this' type
}

// In classes — always fine (this is typed):
class User {
  name = 'Alice';
  greet() {
    return this.name; // ✅ this is User
  }
}
```

---

## useUnknownInCatchVariables

Before TypeScript 4.4, caught errors in `catch` blocks were typed as `any` — meaning you could write `err.message` with no type checking and it would compile fine even if `err` was a string or number. This flag (enabled by default in strict mode) types catch variables as `unknown` instead, forcing you to narrow before use. This is safer because anything can be thrown in JavaScript — not just `Error` objects.

```typescript
// Before TS 4.4 (without flag):
try {
  riskyOperation();
} catch (err) {
  console.log(err.message); // err is 'any' — no checking
}

// With useUnknownInCatchVariables (default in strict TS 4.4+):
try {
  riskyOperation();
} catch (err) {
  // err is 'unknown' — must narrow before use
  console.log(err.message); // ❌ Error: err is unknown

  if (err instanceof Error) {
    console.log(err.message); // ✅ narrowed to Error
  }

  // Type predicate approach:
  const message = err instanceof Error ? err.message : String(err);
}
```

---

## Enabling Flags Individually

If you can't use full strict mode — for instance, when migrating a large JavaScript codebase to TypeScript incrementally — you can enable flags one at a time. The recommended order is by impact: `noImplicitAny` catches the most issues first, followed by `strictNullChecks` which eliminates the most common runtime errors. Each flag can be turned on independently without requiring the others, letting you tighten safety gradually.

```json
{
  "compilerOptions": {
    "noImplicitAny": true,      // Start here — biggest impact
    "strictNullChecks": true,   // Second — catches most runtime errors
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true
  }
}
```

---

## Additional Strict-Adjacent Flags (Not in `strict`)

These flags go beyond the `"strict"` bundle and provide even tighter guarantees. They are not enabled by `"strict": true` — you opt into them explicitly. They are particularly useful for safety-critical codebases and are worth enabling on new projects where backward compatibility is not a concern.

```json
{
  "compilerOptions": {
    "noUncheckedIndexedAccess": true,  // obj[key] returns T | undefined
    "exactOptionalPropertyTypes": true, // exact difference between ? and | undefined
    "noImplicitReturns": true,         // all code paths must return
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

### noUncheckedIndexedAccess — Very Useful

By default, TypeScript trusts that array access and object index access always return a value of the declared element type. This is optimistic — an out-of-bounds array access returns `undefined` at runtime, not a string. With `noUncheckedIndexedAccess`, TypeScript widens the type of indexed access to `T | undefined`, forcing you to handle the possibility of a missing element. This is especially valuable when iterating over arrays in ways that could go out of bounds, or when reading from a `Record` with an uncontrolled key.

```typescript
// Without flag:
const arr: string[] = ['a', 'b', 'c'];
const item = arr[0]; // type: string (could be undefined!)

// With noUncheckedIndexedAccess:
const item = arr[0]; // type: string | undefined
item.toUpperCase();   // ❌ might be undefined
item?.toUpperCase();  // ✅ safe
```

---

## Interview Questions

**Q: What flags does `"strict": true` enable?**
A: `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitAny`, `noImplicitThis`, `alwaysStrict`, `useUnknownInCatchVariables`.

**Q: What is the most impactful strict flag?**
A: `strictNullChecks` — it makes `null` and `undefined` explicit in the type system, catching the most common runtime error (`Cannot read properties of null`).

**Q: What does `noUncheckedIndexedAccess` do?**
A: Array indexing (`arr[i]`) and object indexing (`obj[key]`) return `T | undefined` instead of just `T`, forcing you to handle the case where the index doesn't exist.

**Q: What is the definite assignment assertion (`!`) and when should you use it?**
A: `private db!: Database` tells TypeScript "I guarantee this will be assigned before it's used." Use sparingly — when you initialize in an init method, when using dependency injection frameworks, or when TypeScript can't infer the assignment (e.g., in lifecycle hooks). Overuse defeats the purpose of `strictPropertyInitialization`.
