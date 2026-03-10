# Implementing TypeScript Utility Types from Scratch

A classic interview question: "Can you implement `Partial`, `Required`, `Readonly`, `Pick`, `Omit`, `ReturnType`?" Shows deep understanding of mapped types, conditional types, and `infer`.

---

## Mapped Types — The Foundation

```typescript
// Syntax: { [K in keyof T]: ... }
// K iterates over keys of T
// T[K] is the type of each property

// Read-only version:
type MyReadonly<T> = {
  readonly [K in keyof T]: T[K];
};

// Optional version:
type MyPartial<T> = {
  [K in keyof T]?: T[K];
};

// Remove optional:
type MyRequired<T> = {
  [K in keyof T]-?: T[K]; // - removes the ?
};

// Remove readonly:
type MyMutable<T> = {
  -readonly [K in keyof T]: T[K]; // - removes readonly
};
```

---

## Implementing All Standard Utilities

```typescript
// Partial<T>
type MyPartial<T> = {
  [K in keyof T]?: T[K];
};

// Required<T>
type MyRequired<T> = {
  [K in keyof T]-?: T[K];
};

// Readonly<T>
type MyReadonly<T> = {
  readonly [K in keyof T]: T[K];
};

// Pick<T, K>
type MyPick<T, K extends keyof T> = {
  [P in K]: T[P];
};

// Omit<T, K> — two approaches:
// Approach 1: using Pick + Exclude
type MyOmit<T, K extends keyof T> = MyPick<T, Exclude<keyof T, K>>;

// Approach 2: using 'as' clause to filter keys
type MyOmit2<T, K extends keyof T> = {
  [P in keyof T as P extends K ? never : P]: T[P];
};

// Record<K, V>
type MyRecord<K extends keyof any, V> = {
  [P in K]: V;
};

// Exclude<T, U>
type MyExclude<T, U> = T extends U ? never : T;
// This DISTRIBUTES over unions:
// MyExclude<'a' | 'b' | 'c', 'b'>
// = ('a' extends 'b' ? never : 'a') | ('b' extends 'b' ? never : 'b') | ('c' extends 'b' ? never : 'c')
// = 'a' | never | 'c'
// = 'a' | 'c'

// Extract<T, U>
type MyExtract<T, U> = T extends U ? T : never;

// NonNullable<T>
type MyNonNullable<T> = T extends null | undefined ? never : T;
// Or using Exclude:
type MyNonNullable2<T> = Exclude<T, null | undefined>;

// ReturnType<T>
type MyReturnType<T extends (...args: any) => any> =
  T extends (...args: any) => infer R ? R : never;

// Parameters<T>
type MyParameters<T extends (...args: any) => any> =
  T extends (...args: infer P) => any ? P : never;

// InstanceType<T>
type MyInstanceType<T extends new (...args: any) => any> =
  T extends new (...args: any) => infer I ? I : never;

// ConstructorParameters<T>
type MyConstructorParameters<T extends new (...args: any) => any> =
  T extends new (...args: infer P) => any ? P : never;

// Awaited<T> — recursively unwraps Promise
type MyAwaited<T> =
  T extends null | undefined ? T :
  T extends object & { then(onfulfilled: infer F, ...args: any): any } ?
    F extends (value: infer V, ...args: any) => any ?
      MyAwaited<V> :
      never :
  T;
```

---

## Advanced Custom Utilities

```typescript
// Deep Partial
type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

// Deep Readonly
type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;

// Flatten nested object type (one level):
type FlattenOnce<T> = {
  [K in keyof T]: T[K] extends object ? keyof T[K] : never
}[keyof T];

// Nullable<T> — add null
type Nullable<T> = T | null;

// Maybe<T> — add null and undefined
type Maybe<T> = T | null | undefined;

// ValueOf<T> — union of all value types
type ValueOf<T> = T[keyof T];
type UserValues = ValueOf<{ id: string; age: number }>; // string | number

// KeysOfType<T, V> — keys whose values match V
type KeysOfType<T, V> = {
  [K in keyof T]: T[K] extends V ? K : never;
}[keyof T];

interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  available: boolean;
}

type StringKeys = KeysOfType<Product, string>;   // 'id' | 'name'
type NumberKeys = KeysOfType<Product, number>;   // 'price' | 'stock'
type BooleanKeys = KeysOfType<Product, boolean>; // 'available'

// PickByValue<T, V> — pick properties by value type
type PickByValue<T, V> = Pick<T, KeysOfType<T, V>>;
type StringProps = PickByValue<Product, string>; // { id: string; name: string }

// Getters<T> — create getter methods
type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

type UserGetters = Getters<{ name: string; age: number }>;
// { getName: () => string; getAge: () => number }

// UnionToIntersection<U> — convert union to intersection (advanced)
type UnionToIntersection<U> =
  (U extends any ? (x: U) => void : never) extends (x: infer I) => void
  ? I
  : never;

type UI = UnionToIntersection<{ a: string } | { b: number }>;
// { a: string } & { b: number }

// Overwrite<T, U> — replace T properties with U's
type Overwrite<T, U> = Omit<T, keyof U> & U;

interface Base { id: string; name: string; createdAt: Date; }
interface Updates { name: string; updatedAt: Date; }
type Result = Overwrite<Base, Updates>;
// { id: string; createdAt: Date; name: string; updatedAt: Date }
```

---

## Practical Implementations Used in Production

```typescript
// Strongly-typed event emitter:
type EventMap = {
  'user:created': { user: User };
  'user:deleted': { userId: string };
  'error': { error: Error };
};

type EventKey = keyof EventMap;
type EventHandler<K extends EventKey> = (payload: EventMap[K]) => void;

class TypedEmitter {
  private handlers = new Map<EventKey, Set<Function>>();

  on<K extends EventKey>(event: K, handler: EventHandler<K>): this {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return this;
  }

  emit<K extends EventKey>(event: K, payload: EventMap[K]): void {
    this.handlers.get(event)?.forEach(h => h(payload));
  }
}

const emitter = new TypedEmitter();
emitter.on('user:created', ({ user }) => console.log(user.name)); // ✅ typed
emitter.on('error', ({ error }) => console.error(error.message)); // ✅ typed
emitter.emit('user:created', { user: { id: '1', name: 'Alice' } }); // ✅

// Type-safe Redux-style reducer:
type Action<T extends string, P = void> = P extends void
  ? { type: T }
  : { type: T; payload: P };

type IncrementAction = Action<'INCREMENT', number>;
type ResetAction = Action<'RESET'>;

type CounterAction = IncrementAction | ResetAction;

function counterReducer(state: number, action: CounterAction): number {
  switch (action.type) {
    case 'INCREMENT': return state + action.payload; // typed!
    case 'RESET': return 0;
  }
}
```

---

## Interview Questions

**Q: How does TypeScript distribute conditional types over unions?**
A: When `T` is a bare type parameter in `T extends U ? X : Y`, TypeScript distributes over each union member separately. `Exclude<'a' | 'b', 'b'>` becomes `('a' extends 'b' ? never : 'a') | ('b' extends 'b' ? never : 'b')` = `'a'`. This distribution is why utility types like `Exclude`, `Extract`, `NonNullable` work correctly. To prevent distribution, wrap in tuples: `[T] extends [U] ? X : Y`.

**Q: Implement `Partial<T>` using mapped types.**
A: `type Partial<T> = { [K in keyof T]?: T[K] }`. The `?` makes each property optional. `K in keyof T` iterates all keys. `T[K]` preserves the original value type.

**Q: What does the `-` modifier do in mapped types?**
A: It removes modifiers. `-?` removes the `?` (makes optional properties required). `-readonly` removes the `readonly` modifier. These are how `Required<T>` and `Mutable<T>` work. Without `-`, you can only add modifiers, not remove them.

**Q: How would you implement `ReturnType<T>`?**
A: Using `infer` in a conditional type: `type ReturnType<T extends (...args: any) => any> = T extends (...args: any) => infer R ? R : never`. The `infer R` captures whatever type the function returns. The constraint `extends (...args: any) => any` ensures T is a function.
