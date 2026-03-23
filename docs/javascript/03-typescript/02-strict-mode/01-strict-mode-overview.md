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

If you can't use full strict mode, enable flags progressively:

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
