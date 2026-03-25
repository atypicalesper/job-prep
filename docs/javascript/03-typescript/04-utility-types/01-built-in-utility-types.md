# Built-in TypeScript Utility Types

TypeScript ships with a library of generic utility types that transform existing types. Every senior TypeScript dev should know these cold.

---

## Object Transformation

TypeScript's object transformation utilities let you derive new types from existing ones without repeating property definitions. They all operate on an existing interface or type alias and produce a new type — so when your base type changes, all derived types update automatically. This is the key advantage over manually rewriting similar types: a single source of truth. The most common pattern is deriving `Create`, `Update`, and `Read` payload types from a single canonical entity type.

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  age: number;
}

// Partial<T> — all properties optional
type PartialUser = Partial<User>;
// { id?: string; name?: string; email?: string; age?: number }
// Use case: update payloads, form state

// Required<T> — all properties required (removes ?)
interface Config {
  host?: string;
  port?: number;
  debug?: boolean;
}
type FullConfig = Required<Config>;
// { host: string; port: number; debug: boolean }

// Readonly<T> — all properties readonly
type FrozenUser = Readonly<User>;
// { readonly id: string; readonly name: string; ... }
// Use case: immutable data, Redux state

// Pick<T, K> — select specific properties
type UserPreview = Pick<User, 'id' | 'name'>;
// { id: string; name: string }
// Use case: API responses with only needed fields

// Omit<T, K> — exclude specific properties
type UserWithoutId = Omit<User, 'id'>;
// { name: string; email: string; age: number }
// Use case: create payloads (DB generates ID)

// Record<K, V> — object with specific key/value types
type UserMap = Record<string, User>;
// { [key: string]: User }
type DayCount = Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri', number>;
// { mon: number; tue: number; ... }
```

---

## Union Manipulation

These utilities operate on union types rather than object types. They let you surgically remove or extract members from a union, which is essential when you need to derive a restricted union from a larger one. `Exclude` and `Extract` are opposites and are themselves implemented as distributive conditional types — understanding that they work member-by-member helps explain their behavior with complex unions.

```typescript
type A = 'a' | 'b' | 'c';
type B = 'b' | 'c' | 'd';

// Exclude<T, U> — remove types from union that match U
type OnlyA = Exclude<A, B>; // 'a'
type NoStrings = Exclude<string | number | boolean, string>; // number | boolean

// Extract<T, U> — keep only types that match U (intersection)
type Common = Extract<A, B>; // 'b' | 'c'
type OnlyStrings = Extract<string | number | boolean, string>; // string

// NonNullable<T> — removes null and undefined
type T1 = NonNullable<string | null | undefined>; // string
type T2 = NonNullable<number | null>;              // number
// Use case: after validation you know value exists
```

---

## Function Types

These utilities let you extract type information from functions and classes without duplicating their signatures. The practical benefit is keeping type definitions in sync automatically: if you change the function's signature, any type derived with `Parameters` or `ReturnType` updates for free. `Awaited` is especially important for async functions — it unwraps nested Promise chains so you get the final resolved value type rather than the intermediate `Promise<T>`.

```typescript
function fetchUser(id: string, include: 'posts' | 'comments'): Promise<User> {
  return db.findUser(id);
}

// Parameters<T> — get function parameters as tuple
type FetchParams = Parameters<typeof fetchUser>;
// [id: string, include: 'posts' | 'comments']

// ReturnType<T> — get function return type
type FetchReturn = ReturnType<typeof fetchUser>;
// Promise<User>

// Awaited<T> — unwrap Promise (works recursively)
type Resolved = Awaited<Promise<Promise<string>>>;
// string (not Promise<string>!)

// InstanceType<T> — get instance type of constructor
class UserService {
  findById(id: string) { return {} as User; }
}
type ServiceInstance = InstanceType<typeof UserService>;
// UserService

// ConstructorParameters<T> — get constructor params
class Database {
  constructor(host: string, port: number) {}
}
type DBParams = ConstructorParameters<typeof Database>;
// [host: string, port: number]
```

---

## String Utilities (TS 4.1+)

TypeScript 4.1 introduced intrinsic string manipulation types that operate on string literal types at the type level — the same transformations as JavaScript's `String.prototype` methods, but applied to type-level strings. Their primary purpose is to transform property name keys in mapped types, enabling patterns like automatically generating camelCase getter names from a set of lowercase property names. They only operate on string literal types; applying them to `string` (the widened type) just returns `string`.

```typescript
type Name = 'hello world';

// Uppercase<S>
type Upper = Uppercase<Name>; // 'HELLO WORLD'

// Lowercase<S>
type Lower = Lowercase<'HELLO WORLD'>; // 'hello world'

// Capitalize<S> — first letter uppercase
type Cap = Capitalize<'hello'>; // 'Hello'

// Uncapitalize<S> — first letter lowercase
type Uncap = Uncapitalize<'Hello'>; // 'hello'

// Real-world use — event handler types:
type Events = 'click' | 'focus' | 'blur';
type EventHandlers = {
  [K in Events as `on${Capitalize<K>}`]: (e: Event) => void;
};
// { onClick: ...; onFocus: ...; onBlur: ... }

// Getter/setter types from interface:
interface State {
  count: number;
  name: string;
}
type Getters = {
  [K in keyof State as `get${Capitalize<string & K>}`]: () => State[K];
};
// { getCount: () => number; getName: () => string }
```

---

## Combining Utility Types

Utility types compose naturally — the output of one is a valid input for another. This allows you to express complex type transformations concisely by chaining utilities rather than writing a mapped type from scratch. The key to reading composed types is to work from the inside out: resolve the innermost utility first, then apply each outer wrapper in turn. When built-in utilities do not compose deeply enough (e.g., `Partial` is only one level deep), you can implement a recursive custom utility that mirrors the pattern.

```typescript
// Real-world patterns:

// UpdatePayload — can update anything except id, and all fields optional
type UpdateUserPayload = Partial<Omit<User, 'id'>>;
// { name?: string; email?: string; age?: number }

// Required subset — must provide these fields
type CreateUserPayload = Required<Pick<User, 'name' | 'email'>> & Partial<Pick<User, 'age'>>;
// { name: string; email: string; age?: number }

// Deep partial (built-in Partial is only one level):
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

interface Config {
  db: { host: string; port: number; };
  cache: { ttl: number; };
}

type PartialConfig = DeepPartial<Config>;
// { db?: { host?: string; port?: number }; cache?: { ttl?: number } }

// Mutable<T> — remove readonly:
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

type MutableUser = Mutable<Readonly<User>>;
// Back to: { id: string; name: string; ... }
```

---

## Interview Questions

**Q: What is the difference between `Omit` and `Exclude`?**
A: `Omit<T, K>` works on object types — it removes properties from an interface/object type. `Exclude<T, U>` works on union types — it removes members of a union. `Omit<User, 'id'>` removes the `id` property. `Exclude<'a' | 'b' | 'c', 'b'>` gives `'a' | 'c'`.

**Q: What does `Awaited<T>` do differently from `ReturnType<T>`?**
A: `ReturnType` extracts what a function returns — if it returns `Promise<string>`, you get `Promise<string>`. `Awaited` unwraps Promise chains recursively — `Awaited<Promise<Promise<string>>>` gives `string`. Use `Awaited<ReturnType<typeof fn>>` to get the resolved type of an async function.

**Q: How do you make a type deeply readonly?**
A: The built-in `Readonly<T>` is only one level deep. For deep readonly: `type DeepReadonly<T> = { readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K] }`. This recursively makes all nested properties readonly.

**Q: When would you use `Record<string, unknown>` vs `object` vs `{}`?**
A: `{}` is everything except null/undefined (even primitives). `object` is non-primitive types. `Record<string, unknown>` is specifically an object with string keys and unknown values — the safest way to type a dictionary/hash. For "any object that might have these keys," use `Record<string, unknown>` then narrow.
