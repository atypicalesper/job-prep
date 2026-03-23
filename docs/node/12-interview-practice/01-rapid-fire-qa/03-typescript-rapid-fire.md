# TypeScript Rapid-Fire Q&A — 50 Questions

Answer each in 1-3 sentences. Time yourself: 30 seconds per question.

---

**Q1: What is structural typing?**
TypeScript checks compatibility based on shape (properties and types), not name. Two types with the same structure are assignable to each other even if they have different names.

---

**Q2: `type` vs `interface` — main difference?**
Both declare object shapes. `interface` is open (can be merged/extended via declaration merging); `type` is closed (no merging, but supports unions, intersections, mapped types, and conditional types that `interface` can't). Use `interface` for public API shapes, `type` for complex compositions.

---

**Q3: What is the TypeScript Temporal Dead Zone (TDZ)?**
TypeScript doesn't have a TDZ — that's a JavaScript runtime concept. TypeScript's type checking happens at compile time, not runtime. However, TypeScript will error if you use a variable before it's declared.

---

**Q4: What does `unknown` vs `any` do?**
`any` disables type checking entirely — you can do anything with it. `unknown` is type-safe — you must narrow it before using it. Prefer `unknown` for values whose type you don't know (e.g., API responses, `catch` clauses).

---

**Q5: What is a discriminated union?**
A union type where each member has a common literal property (discriminant) that TypeScript can use to narrow the type. E.g., `{ kind: 'circle', radius: number } | { kind: 'rect', width: number }` — checking `kind` narrows the type automatically.

---

**Q6: What is `never`?**
The bottom type — a type with no values. Represents values that never occur (e.g., function that always throws, exhaustive switch default). Useful for exhaustiveness checks: if you reach `never`, TypeScript tells you you've missed a case.

---

**Q7: What does `keyof` do?**
Produces a union of all keys of a type as string/symbol literals. `keyof { a: 1; b: 2 }` → `'a' | 'b'`. Used in generic constraints: `function get<T, K extends keyof T>(obj: T, key: K): T[K]`.

---

**Q8: What is `infer` used for?**
Extracts a type from within a conditional type. `type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never` — `infer R` captures whatever the return type is and binds it to `R`.

---

**Q9: What does `-?` do in a mapped type?**
Removes the optional modifier from all properties. `type Required<T> = { [K in keyof T]-?: T[K] }` — the `-?` makes every property required by removing the `?`.

---

**Q10: What is the difference between `Partial<T>` and `DeepPartial<T>`?**
`Partial<T>` makes only the top-level properties optional. `DeepPartial<T>` recursively makes all nested properties optional. TypeScript doesn't have built-in `DeepPartial` — you implement it with a recursive conditional type.

---

**Q11: What is excess property checking?**
TypeScript only performs extra property checking on fresh object literals assigned directly to a typed variable. If you pass through an intermediate variable, the check is bypassed. `const x: A = { a: 1, extra: 2 }` errors; `const temp = { a: 1, extra: 2 }; const x: A = temp` doesn't.

---

**Q12: What does `satisfies` do? How is it different from a type annotation?**
`satisfies` validates that a value matches a type but keeps the inferred literal/narrow type. A regular annotation widens to the annotation's type. `const p = { red: [255,0,0] } satisfies Record<string, number[]>` — TypeScript still knows `p.red` is `number[]`, not `number[] | string`.

---

**Q13: What is a type predicate?**
A return type annotation `param is Type` that tells TypeScript a function narrows the type of `param`. `function isString(val: unknown): val is string { return typeof val === 'string'; }` — after calling this, TypeScript knows `val` is a `string` in the truthy branch.

---

**Q14: What is `ReturnType<T>`?**
A built-in utility type that extracts the return type of a function type. `ReturnType<() => Promise<string>>` → `Promise<string>`. Implemented as `T extends (...args: any[]) => infer R ? R : never`.

---

**Q15: What is an assertion function?**
A function whose signature uses `asserts param is Type` that tells TypeScript a condition is true after the function returns (throws if not). `function assert(val: unknown): asserts val is string { if (typeof val !== 'string') throw new Error(); }` — after calling, TypeScript knows `val` is `string`.

---

**Q16: What is declaration merging?**
Multiple declarations with the same name are merged into one. Two `interface Foo` declarations merge their properties. A `namespace` can merge with a `class` or `function`. Useful for augmenting third-party types (`declare module 'express' { ... }`).

---

**Q17: What does `Omit<T, K>` do? How is it implemented?**
Creates a new type with keys K removed from T. `Omit<User, 'password'>` — removes `password` key. Implemented as `type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>`.

---

**Q18: What is a conditional type?**
A type that evaluates differently based on a condition: `T extends U ? X : Y`. If `T` is assignable to `U`, resolves to `X`, otherwise `Y`. Can be recursive. Used for `ReturnType`, `Awaited`, `NonNullable`, etc.

---

**Q19: What is distributive conditional type?**
When `T` in `T extends U ? X : Y` is a naked type parameter, TypeScript distributes over unions. `type IsString<T> = T extends string ? true : false; IsString<string | number>` → `true | false`. Wrap in tuple `[T] extends [U]` to prevent distribution.

---

**Q20: What are template literal types?**
Types built from string template literals: `` type EventName<T extends string> = `on${Capitalize<T>}` ``. Combines with unions: `` type Keys = `get${Capitalize<'user' | 'order'>}` `` → `'getUser' | 'getOrder'`.

---

**Q21: What is the `readonly` modifier and `-readonly`?**
`readonly` on a property prevents reassignment after initialization. In mapped types, `readonly [K in keyof T]: T[K]` adds readonly to all properties; `-readonly [K in keyof T]: T[K]` removes it (makes all mutable).

---

**Q22: What does `Extract<T, U>` do?**
From union `T`, keeps only the types assignable to `U`. `Extract<string | number | boolean, string | boolean>` → `string | boolean`. Implemented as `T extends U ? T : never`.

---

**Q23: What is `Record<K, V>`?**
Creates an object type with keys of type `K` and values of type `V`. `Record<string, number>` = `{ [key: string]: number }`. Useful for dictionaries. `Record<'a' | 'b', boolean>` = `{ a: boolean; b: boolean }`.

---

**Q24: What is `Awaited<T>`?**
Recursively unwraps a `Promise` type. `Awaited<Promise<Promise<string>>>` → `string`. TypeScript 4.5+ built-in. Implemented with recursive conditional type checking for `.then`.

---

**Q25: What is `const` type parameter (TypeScript 5.0)?**
Declares a generic type parameter that infers the most specific literal type, as if `as const` were applied. `function identity<const T>(val: T): T` — `identity(['a', 'b'])` infers `['a', 'b']` (readonly tuple) instead of `string[]`.

---

**Q26: When would you use a `namespace`?**
Namespaces are legacy — prefer ES modules (`import`/`export`). Valid use case: augmenting global types, organizing declaration files (`.d.ts`), grouping related type definitions without creating modules.

---

**Q27: What does `strictNullChecks` do?**
Makes `null` and `undefined` separate types — they're no longer assignable to every other type. Without it, `const x: string = null` is allowed. With it, you must explicitly handle `null`/`undefined` (optional chaining, nullish coalescing, type guards).

---

**Q28: What is `noUncheckedIndexedAccess`?**
Makes array/object indexed access return `T | undefined` instead of just `T`. `const arr: number[] = [1,2,3]; arr[0]` — type is `number | undefined` (could be out of bounds). Forces you to handle potential undefined.

---

**Q29: What is a generic constraint?**
`T extends Constraint` restricts what types can be passed as `T`. `function getLength<T extends { length: number }>(val: T): number` — only types with a `length` property are accepted. Without constraint, TypeScript doesn't know `T` has `.length`.

---

**Q30: What does `Parameters<F>` return?**
A tuple of the parameter types of function `F`. `Parameters<(a: string, b: number) => void>` → `[string, number]`. Useful for forwarding arguments: `function wrap<F extends (...args: any[]) => any>(fn: F, ...args: Parameters<F>): ReturnType<F>`.

---

**Q31: How do you type a class constructor vs an instance?**
`typeof MyClass` is the constructor type (includes static members). `InstanceType<typeof MyClass>` or `MyClass` (when used as a type) gives the instance type. `function create<T>(C: new () => T): T` accepts any class and returns its instance type.

---

**Q32: What is module augmentation?**
Extending existing module types by re-opening their declarations. `declare module 'express' { interface Request { user?: User; } }` — adds `user` to Express's `Request` interface everywhere in the project.

---

**Q33: What does `Exclude<T, U>` do?**
From union `T`, removes types assignable to `U`. `Exclude<string | number | null, null>` → `string | number`. `NonNullable<T>` is `Exclude<T, null | undefined>`.

---

**Q34: What is the difference between `interface extends` and intersection types?**
Both combine types. `interface C extends A, B` requires all properties of A and B; conflicting property types cause an error. Intersection `A & B` with conflicting types results in `never` for that property. Use `interface extends` for simple type composition, intersections for inline type composition.

---

**Q35: What is covariance and contravariance in TypeScript?**
Covariance: more-specific types flow in. `Array<Dog>` is assignable to `Array<Animal>` (in covariant position — return types). Contravariance: more-general types flow in. Function parameters are contravariant — `(a: Animal) => void` is assignable to `(a: Dog) => void`. TypeScript uses bivariant function parameters by default (with `strictFunctionTypes`, method parameters are bivariant, function-syntax parameters are contravariant).

---

**Q36: What is a mapped type?**
Creates a new type by iterating over the keys of an existing type. `type Readonly<T> = { readonly [K in keyof T]: T[K] }`. Can remap keys with `as` clause: `{ [K in keyof T as K extends 'id' ? never : K]: T[K] }` removes the `id` key.

---

**Q37: What is `emitDecoratorMetadata`?**
A TypeScript compiler option that emits type metadata at runtime using `Reflect.metadata`. Required for NestJS-style dependency injection — it lets the framework know the type of constructor parameters at runtime so it can inject dependencies automatically.

---

**Q38: What does `NonNullable<T>` do?**
Removes `null` and `undefined` from `T`. `NonNullable<string | null | undefined>` → `string`. Implemented as `T extends null | undefined ? never : T`.

---

**Q39: What is the `infer extends` pattern (TypeScript 4.7)?**
Adds a constraint to an `infer`-ed type. `` type StringReturnType<T> = T extends () => infer R extends string ? R : never `` — `R` is inferred AND constrained to be a `string`. Avoids a second conditional type to narrow the inferred value.

---

**Q40: What is `exactOptionalPropertyTypes`?**
Strict mode flag that distinguishes `{ a?: string }` (a can be `string` or absent) from `{ a?: string | undefined }` (a can be `string`, `undefined`, or absent). With this flag, `{ a: undefined }` doesn't satisfy `{ a?: string }` because setting `a` explicitly to `undefined` is different from omitting it.

---

**Q41: What does `useUnknownInCatchVariables` do?**
Makes `catch (e)` give `e` the type `unknown` instead of `any`. Requires you to narrow `e` before using it (e.g., `if (e instanceof Error)`). Safer than `any` — prevents accidental property access on unknown error types.

---

**Q42: What is a variadic tuple type?**
Tuples that can spread other tuples. `type Concat<T extends unknown[], U extends unknown[]> = [...T, ...U]`. `Concat<[1, 2], [3, 4]>` → `[1, 2, 3, 4]`. Enables type-safe function argument manipulation.

---

**Q43: `interface` vs `abstract class` — when to use each?**
`interface`: pure type contract, zero runtime cost, multiple can be implemented. `abstract class`: can have implementation (methods with body, constructor), single inheritance only, has runtime presence (appears in JS). Use abstract class when you want shared implementation; interface for pure contracts.

---

**Q44: What is `typeof` in type position vs value position?**
In value position: `typeof x` returns a string at runtime (`'string'`, `'object'`, etc.). In type position: `type T = typeof myVariable` captures the TypeScript type of `myVariable`. `const obj = { a: 1 }; type Obj = typeof obj` → `{ a: number }`.

---

**Q45: How do you create a type that represents all values of an object?**
`type Values<T> = T[keyof T]`. `Values<{ a: 1; b: 'hello' }>` → `1 | 'hello'`. Useful for creating union types from object shapes without manually listing each value type.

---

**Q46: What is `ConstructorParameters<T>`?**
Extracts the constructor parameters as a tuple. `ConstructorParameters<typeof Date>` → `[value?: string | number | Date]`. Useful when wrapping classes.

---

**Q47: What does `--isolatedModules` do?**
Requires each file to be a standalone module (no const enum, no `/// <reference>` without module). Required for Babel/esbuild transpilation (they process files independently without type info). Every file must have at least one `import` or `export`.

---

**Q48: What is a recursive type alias? Give an example.**
A type that refers to itself. `type JSON = string | number | boolean | null | JSON[] | { [key: string]: JSON }`. TypeScript 3.7+ supports recursive type aliases. Used for tree structures, nested data, and self-referential data.

---

**Q49: What does `NoInfer<T>` do (TypeScript 5.4)?**
Prevents TypeScript from using a parameter to infer a type parameter — forces inference to come from other parameters. `function createState<T>(initial: T, fallback: NoInfer<T>): T` — `T` is inferred from `initial`; `fallback` must be compatible with the inferred `T` but doesn't participate in inference.

---

**Q50: What is the difference between `as` type assertion and `satisfies`?**
`as T` forces TypeScript to treat a value as type `T` regardless of actual type — unsafe, can hide errors. `satisfies T` validates the value matches `T` but keeps the narrower inferred type — safe, preserves information. Never use `as` when `satisfies` works; only use `as` for type narrowing you know is safe (`x as string` when you've already checked it).

---

## Quick TypeScript Output Predictions

```typescript
// Q: What is the type of result?
const result = [1, 2, 3].map(x => x.toString());
// Answer: string[]

// Q: What is the type of T here?
function id<T>(x: T) { return x; }
const r = id(42);
// Answer: number (inferred as 42 with const, but id without const → number)

// Q: Does this compile?
interface A { x: number; }
interface A { y: string; }
const a: A = { x: 1, y: 'hi' };
// Answer: Yes — interfaces merge. a must have both x and y.

// Q: What does keyof (A | B) give?
type A = { a: 1; b: 2 };
type B = { b: 3; c: 4 };
type K = keyof (A | B);
// Answer: 'b' — only keys common to ALL members of the union

// Q: What does this evaluate to?
type IsNever<T> = [T] extends [never] ? true : false;
type R = IsNever<never>;
// Answer: true
// Without the tuple: (never extends never ? true : false) distributes over empty union → never
// With tuple: prevents distribution → correctly evaluates to true
```
