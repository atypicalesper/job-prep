# Mapped Types and Conditional Types

The two most powerful TypeScript features for type-level programming. Mastering these separates strong TS developers from average ones.

---

## Mapped Types Deep Dive

A mapped type creates a new type by systematically transforming every property of an existing type. Beyond the basics of making properties optional or readonly, the `as` clause (TS 4.1+) enables key remapping — you can rename keys, add prefixes or suffixes, or filter keys out entirely by mapping to `never`. This opens the door to generating entire API surfaces from a data shape: if you have an interface describing your data, you can derive a matching set of getter methods, finder functions, or validation schemas without any manual duplication.

```typescript
// Basic syntax:
type Mapped<T> = {
  [K in keyof T]: T[K];  // iterate keys, preserve types
};

// Mapped type = Mapped<T> creates a new type by
// transforming each property of T

// Key remapping with 'as' clause (TS 4.1+):
type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

// Filtering properties with 'as never':
type OnlyStrings<T> = {
  [K in keyof T as T[K] extends string ? K : never]: T[K];
};

interface User {
  id: string;
  name: string;
  age: number;
  email: string;
  active: boolean;
}

type StringUser = OnlyStrings<User>;
// { id: string; name: string; email: string }

// Creating an API from a data shape:
type CRUD<T, IdKey extends keyof T = 'id'> = {
  [K in keyof T as `findBy${Capitalize<string & K>}`]: (val: T[K]) => Promise<T[]>;
} & {
  create(data: Omit<T, IdKey>): Promise<T>;
  update(id: T[IdKey], data: Partial<Omit<T, IdKey>>): Promise<T>;
  delete(id: T[IdKey]): Promise<void>;
};

type UserAPI = CRUD<User>;
// {
//   findById(val: string): Promise<User[]>;
//   findByName(val: string): Promise<User[]>;
//   findByAge(val: number): Promise<User[]>;
//   ...
//   create(data: Omit<User, 'id'>): Promise<User>;
//   update(id: string, data: Partial<Omit<User, 'id'>>): Promise<User>;
//   delete(id: string): Promise<void>;
// }
```

---

## Conditional Types Deep Dive

A conditional type is a type-level ternary: `T extends U ? X : Y`. The critical behavior to understand is distribution: when the type being tested (`T`) is a naked generic type parameter, TypeScript distributes the condition across each member of a union separately. This is what lets `Exclude<'a' | 'b' | 'c', 'b'>` work — it applies the condition to `'a'`, `'b'`, and `'c'` individually. To suppress distribution and treat the union as a whole, wrap both sides in a one-element tuple: `[T] extends [U]`. The `infer` keyword lets you capture a type that appears in a structural position and bind it to a variable for use in the result.

```typescript
// T extends U ? X : Y
// Read as: "if T is assignable to U, then X, else Y"

// Distributive conditional types (bare type parameter):
type IsArray<T> = T extends any[] ? true : false;
type A = IsArray<string[]>; // true
type B = IsArray<string>;   // false

// Distribution over unions:
type ToArray<T> = T extends any ? T[] : never;
type C = ToArray<string | number>; // string[] | number[]
// (string extends any ? string[] : never) | (number extends any ? number[] : never)
// = string[] | number[]

// Preventing distribution with tuple wrapper:
type ToArrayNoDistribute<T> = [T] extends [any] ? T[] : never;
type D = ToArrayNoDistribute<string | number>; // (string | number)[]
// [string | number] extends [any] — checked as a whole, not distributed

// 'infer' keyword — capture type in position:
type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;
type E = UnwrapPromise<Promise<string>>; // string
type F = UnwrapPromise<number>;          // number (not a Promise, returned as-is)

// Nested infer:
type FirstArg<T> = T extends (first: infer F, ...rest: any[]) => any ? F : never;
type G = FirstArg<(x: string, y: number) => void>; // string

// Extract last element of tuple:
type Last<T extends any[]> = T extends [...any[], infer L] ? L : never;
type H = Last<[1, 2, 3, string]>; // string

// Recursive conditional types (TS 4.1+):
type Flatten<T> = T extends Array<infer U> ? Flatten<U> : T;
type I = Flatten<number[][][]>; // number
```

---

## Template Literal Types

Template literal types bring JavaScript's template string syntax to the type level. They combine string literal types using the same `` `prefix-${Union}` `` syntax, and TypeScript automatically distributes over union members to produce all combinations. The result is a way to define precisely constrained string vocabularies — event names, CSS property names, route paths — that the compiler can check. Combined with `infer`, template literal types can also parse and extract parts of a string literal type at compile time, enabling type-safe routing and event systems.

```typescript
// Combine string literals:
type Direction = 'top' | 'right' | 'bottom' | 'left';
type CSSMargin = `margin-${Direction}`;
// 'margin-top' | 'margin-right' | 'margin-bottom' | 'margin-left'

type Padding = `padding-${Direction}`;
// 'padding-top' | 'padding-right' | ...

// Nested combinations:
type Color = 'red' | 'green' | 'blue';
type Shade = 'light' | 'dark';
type ColorTheme = `${Shade}-${Color}`;
// 'light-red' | 'light-green' | 'light-blue' | 'dark-red' | ...

// Event system:
type Entity = 'user' | 'post' | 'comment';
type Action = 'created' | 'updated' | 'deleted';
type Event = `${Entity}:${Action}`;
// 'user:created' | 'user:updated' | 'user:deleted' | 'post:created' | ...

// Extracting parts of a string type:
type ExtractEntity<T extends string> =
  T extends `${infer E}:${string}` ? E : never;

type Entity2 = ExtractEntity<'user:created' | 'post:deleted'>;
// 'user' | 'post'

// URL route typing:
type Route = '/users' | '/users/:id' | '/posts' | '/posts/:id';
type DynamicRoute = Extract<Route, `${string}:${string}`>;
// '/users/:id' | '/posts/:id'

// Strongly typed CSS-in-JS:
type CSSValue = string | number;
type StyleProp =
  | 'color' | 'background' | 'margin' | 'padding'
  | `margin-${Direction}` | `padding-${Direction}`;

type Styles = Partial<Record<StyleProp, CSSValue>>;
```

---

## Real-World Patterns

These patterns demonstrate how advanced type features solve real design problems rather than just being type gymnastics. A type-safe form schema uses a mapped type over the form's shape so every field's validation function is parameterized by the correct field type — passing a string validator for a boolean field is a compile error. A typed API client maps route strings and HTTP methods to their exact request/response shapes, making incorrect arguments impossible. A type-safe state machine uses indexed access types to constrain which transitions are valid from each state.

```typescript
// Type-safe form validation schema:
type ValidationRule<T> = {
  required?: boolean;
  validate?: (val: T) => string | null;
};

type Schema<T> = {
  [K in keyof T]: ValidationRule<T[K]>;
};

interface LoginForm {
  email: string;
  password: string;
  rememberMe: boolean;
}

const loginSchema: Schema<LoginForm> = {
  email: {
    required: true,
    validate: (val) => val.includes('@') ? null : 'Invalid email'
  },
  password: {
    required: true,
    validate: (val) => val.length >= 8 ? null : 'Too short'
  },
  rememberMe: {} // optional, no validation
};

// Type-safe API client with response types:
type Routes = {
  '/users': { GET: { response: User[] }; POST: { body: Omit<User, 'id'>; response: User } };
  '/users/:id': { GET: { response: User }; DELETE: { response: void } };
};

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
type RouteConfig<R extends keyof Routes, M extends keyof Routes[R]> =
  Routes[R][M];

// Usage would allow:
// apiClient('/users', 'GET') → Promise<User[]>
// apiClient('/users', 'POST', { body: {...} }) → Promise<User>

// State machine types:
type TrafficLight = {
  green:  { next: 'yellow' };
  yellow: { next: 'red' };
  red:    { next: 'green' };
};

type Transition<State extends keyof TrafficLight> =
  TrafficLight[State]['next'];

function transition<S extends keyof TrafficLight>(
  state: S
): Transition<S> {
  const map: TrafficLight = {
    green:  { next: 'yellow' },
    yellow: { next: 'red' },
    red:    { next: 'green' }
  };
  return map[state].next as Transition<S>;
}

const next = transition('green'); // type: 'yellow' ✅
```

---

## Interview Questions

**Q: What is the difference between `keyof` and `in keyof`?**
A: `keyof T` produces a union of all keys of T: `keyof { a: 1, b: 2 }` = `'a' | 'b'`. `[K in keyof T]` is used inside a mapped type to iterate over those keys one by one to produce a new type. You can't use `in keyof` outside a mapped type `{}`.

**Q: When does a conditional type distribute and when doesn't it?**
A: It distributes when `T` is a "naked" (unwrapped) type parameter on the left side of `extends`. `T extends string ? true : false` distributes over unions of T. To prevent distribution, wrap in a tuple or object: `[T] extends [string]` doesn't distribute. This matters when you want the union type itself to be checked, not each member separately.

**Q: What does `infer` do and what are some creative uses?**
A: `infer` creates a local type variable inside a conditional type's `extends` clause, capturing whatever type appears in that position. Creative uses: extract element type from arrays (`T extends (infer U)[]`), extract promise return type (`T extends Promise<infer U>`), extract first/last tuple elements (`T extends [infer Head, ...any[]]`), extract function return type.

**Q: How do template literal types interact with unions?**
A: Template literal types distribute over union members automatically. `` `${A}-${B}` `` where A = `'a' | 'b'` and B = `'x' | 'y'` produces all combinations: `'a-x' | 'a-y' | 'b-x' | 'b-y'`. This is very powerful for generating event names, CSS properties, API routes, etc.
