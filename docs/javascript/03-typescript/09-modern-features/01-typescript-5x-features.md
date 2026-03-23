# TypeScript Modern Features (4.9 – 5.x)

---

## `satisfies` Operator (TS 4.9)

```typescript
// Problem: you want BOTH type checking AND inferred literal types

// Option A: type annotation — checks types but widens to the annotation:
const palette: Record<string, [number, number, number] | string> = {
  red: [255, 0, 0],
  green: '#00ff00',
};
palette.red.toUpperCase(); // ❌ Error: toUpperCase doesn't exist on array | string
// TypeScript only knows it's [number,number,number] | string — can't narrow

// Option B: no annotation — gets literal types but no error on wrong value:
const palette = {
  red: [255, 0, 0],
  green: '#00ff00',
  bleu: [0, 0, 255], // typo! no error
};

// ✅ Option C: satisfies — validates type but KEEPS inferred literal types:
const palette = {
  red: [255, 0, 0],
  green: '#00ff00',
  bleu: [0, 0, 255], // ❌ Error: 'bleu' not in 'red' | 'green' | 'blue'
} satisfies Record<'red' | 'green' | 'blue', [number, number, number] | string>;

palette.red.map(c => c * 2);   // ✅ TypeScript knows red is an array
palette.green.toUpperCase();   // ✅ TypeScript knows green is a string

// Another example:
type Config = {
  host: string;
  port: number;
  flags: string[];
};

const config = {
  host: 'localhost',
  port: 3000,
  flags: ['debug', 'verbose'],
  extra: 'oops', // ❌ Error: extra not in Config
} satisfies Config;

config.flags.includes('debug'); // ✅ knows it's string[], not just string[]|string
```

---

## `const` Type Parameters (TS 5.0)

```typescript
// Problem: TypeScript widens inferred types in generic functions

function identity<T>(value: T): T {
  return value;
}

const x = identity(['hello', 'world']);
// x is inferred as: string[] (widened!)
// But you wanted: ['hello', 'world'] (literal tuple)

// Old workaround — caller must add `as const`:
const x = identity(['hello', 'world'] as const); // readonly ['hello', 'world']

// ✅ TS 5.0: const type parameter — function infers literal types:
function identity<const T>(value: T): T {
  return value;
}

const x = identity(['hello', 'world']);
// x is now: readonly ['hello', 'world']  ← literal preserved!

// Very useful for route definitions, config objects, etc.:
function createRoutes<const T extends Record<string, string>>(routes: T): T {
  return routes;
}

const routes = createRoutes({
  home: '/home',
  about: '/about',
});
// routes.home is '/home' (literal), not string
type RouteName = keyof typeof routes; // 'home' | 'about'
```

---

## `infer extends` (TS 4.8)

```typescript
// Before 4.8: inferred type from conditional is not narrowed
type FirstStringElement<T> = T extends [infer First, ...any[]]
  ? First extends string ? First : never
  : never;

// TS 4.8: `infer X extends Constraint` — infer AND constrain in one step:
type FirstStringElement<T> = T extends [infer First extends string, ...any[]]
  ? First
  : never;

type R1 = FirstStringElement<['hello', 1, 2]>; // 'hello'
type R2 = FirstStringElement<[42, 'world']>;    // never (42 doesn't extend string)

// More useful: extract numeric literal:
type ParseInt<T extends string> = T extends `${infer N extends number}` ? N : never;
type X = ParseInt<'42'>; // 42 (number literal, not string!)
type Y = ParseInt<'abc'>; // never

// Enum key from string:
enum Direction { Up = 'UP', Down = 'DOWN' }
type DirectionKey<T extends string> =
  T extends `${infer K extends keyof typeof Direction}` ? K : never;
type K = DirectionKey<'Up'>; // 'Up'
```

---

## `NoInfer<T>` Utility Type (TS 5.4)

```typescript
// Problem: TypeScript sometimes infers a type parameter from a position
// where you DON'T want inference to happen:

function createTransition<T>(
  initial: T,
  next: T,  // TypeScript unifies inference from both initial and next
): T {
  return next;
}

// TypeScript infers T = 'open' | 'closed' from both args:
const state = createTransition('open', 'closed');
// state: 'open' | 'closed' — probably not what you want

// ✅ NoInfer: prevent inference from the second parameter:
function createTransition<T>(
  initial: T,
  next: NoInfer<T>, // T is only inferred from initial; next is checked against it
): T {
  return next;
}

createTransition('open', 'closed'); // ❌ Error: 'closed' not assignable to 'open'
createTransition<'open' | 'closed'>('open', 'closed'); // ✅ explicit T

// Real use case: default values that shouldn't widen the type:
function useState<T>(initial: T, fallback: NoInfer<T>): T {
  return initial ?? fallback;
}
const s = useState(42 as number | null, 0); // fallback must be number, not widened
```

---

## Variadic Tuple Types (TS 4.0)

```typescript
// Spread tuples and create typed concatenation:

type Concat<T extends unknown[], U extends unknown[]> = [...T, ...U];
type R = Concat<[1, 2], [3, 4]>; // [1, 2, 3, 4]

// Typed function argument prepend:
type PrependArg<T extends (...args: any[]) => any, Arg> =
  (arg: Arg, ...args: Parameters<T>) => ReturnType<T>;

function addLogging<T extends (...args: any[]) => any>(fn: T): PrependArg<T, string> {
  return (label: string, ...args: Parameters<T>) => {
    console.log(`[${label}]`, args);
    return fn(...args);
  };
}

const add = (a: number, b: number) => a + b;
const loggedAdd = addLogging(add);
loggedAdd('sum', 1, 2); // ✅ typed: (label: string, a: number, b: number) => number

// Typed curry:
type Curry<T extends unknown[], R> =
  T extends [] ? R :
  T extends [infer First, ...infer Rest]
    ? (arg: First) => Curry<Rest, R>
    : never;

// Tail of a tuple:
type Tail<T extends unknown[]> = T extends [unknown, ...infer Rest] ? Rest : never;
type T = Tail<[1, 2, 3]>; // [2, 3]
```

---

## Template Literal Types + String Manipulation (TS 4.1)

```typescript
// Generate typed event names from an object:
type EventNames<T extends Record<string, unknown>> =
  `on${Capitalize<string & keyof T>}`;

type UserEvents = EventNames<{ click: void; hover: void; focus: void }>;
// 'onClick' | 'onHover' | 'onFocus'

// Typed CSS property builder:
type CSSUnit = 'px' | 'rem' | 'em' | '%';
type CSSValue = `${number}${CSSUnit}`;

const size: CSSValue = '16px';  // ✅
const bad: CSSValue = '16vw';   // ❌ 'vw' not in CSSUnit

// Extract path segments:
type ExtractParams<Path extends string> =
  Path extends `${string}:${infer Param}/${infer Rest}`
    ? Param | ExtractParams<Rest>
    : Path extends `${string}:${infer Param}`
    ? Param
    : never;

type Params = ExtractParams<'/users/:id/posts/:postId'>;
// 'id' | 'postId'

// Usage in Express-like typing:
function route<Path extends string>(
  path: Path,
  handler: (params: Record<ExtractParams<Path>, string>) => void
) {}

route('/users/:id/posts/:postId', (params) => {
  params.id;     // ✅ typed
  params.postId; // ✅ typed
  params.wrong;  // ❌ Error
});
```

---

## Using Declaration (TS 5.2)

```typescript
// Explicit resource management — automatic disposal when leaving scope

// Any object with Symbol.dispose can be used with `using`:
class DatabaseConnection {
  constructor(public url: string) {
    console.log('Connected');
  }

  query(sql: string) { /* ... */ }

  [Symbol.dispose]() {
    console.log('Disconnected');  // called automatically
  }
}

// Async version:
class AsyncConnection {
  async [Symbol.asyncDispose]() {
    await this.close();
  }
}

// Usage — connection is automatically disposed at end of scope:
function processData() {
  using conn = new DatabaseConnection('postgres://...');
  // ^ conn is scoped to this block

  const result = conn.query('SELECT * FROM users');
  return result;
  // conn[Symbol.dispose]() is called here, even if an exception was thrown!
}

// Equivalent to try/finally:
function processData() {
  const conn = new DatabaseConnection('postgres://...');
  try {
    return conn.query('SELECT * FROM users');
  } finally {
    conn[Symbol.dispose]();
  }
}

// Async:
async function processData() {
  await using conn = new AsyncConnection('postgres://...');
  return await conn.query('SELECT * FROM users');
  // conn[Symbol.asyncDispose]() is called automatically
}
```

---

## Access Modifiers on Constructor Parameters (TS shorthand)

```typescript
// Not new, but commonly forgotten:
class UserService {
  // ❌ Verbose (common in JS-converted code):
  private readonly db: Database;
  private readonly logger: Logger;

  constructor(db: Database, logger: Logger) {
    this.db = db;
    this.logger = logger;
  }

  // ✅ TypeScript shorthand — declares AND assigns:
  constructor(
    private readonly db: Database,
    private readonly logger: Logger,
    protected readonly cache?: Cache,
    public readonly name: string = 'default',
  ) {}
}
```

---

## Interview Questions

**Q: When would you use `satisfies` instead of a type annotation?**
A: When you want the compiler to validate that an object conforms to a type BUT you also need the inferred literal/narrowed types for actual usage. Classic cases: (1) config objects where you want autocomplete on specific values, (2) dictionary objects where values have different types per key, (3) any place where `as const` gives too-narrow types but an annotation gives too-wide types. The mnemonic: annotation says "I am this type", `satisfies` says "I match this type but remember what I actually am".

**Q: What does `const` in a type parameter do?**
A: Tells TypeScript to infer the most specific (literal) type when the type parameter is bound, equivalent to the caller writing `as const`. Without it, `identity(['a', 'b'])` infers `string[]`. With `<const T>`, it infers `readonly ['a', 'b']`. Useful for functions that build typed structures (route definitions, event maps, config) where you want literal inference without forcing callers to write `as const` everywhere.

**Q: What is `NoInfer<T>` and when do you need it?**
A: Prevents TypeScript from using that position to infer the type parameter — inference only happens from other argument positions. Use it for "default" or "fallback" parameters that should be checked against an already-inferred type, not used to widen it. Example: `setState<T>(initial: T, default: NoInfer<T>)` — `T` is inferred from `initial`, and `default` is checked against it. Without `NoInfer`, `setState(true, 'oops')` would silently infer `T = boolean | string`.

**Q: What changed between TypeScript 4.x and 5.x that matters for daily use?**
A: Key TS 5.x changes: (1) `const` type parameters — no more `as const` for callers. (2) `NoInfer<T>` utility type. (3) `using`/`await using` for explicit resource management. (4) Decorator support (Stage 3 decorators, not experimental). (5) All `enum` and `namespace` merging rules stabilized. (6) `--moduleResolution bundler` for modern bundler setups. (7) Variadic tuple types improvements. For daily use, `satisfies` (4.9) and `const` type params (5.0) are the most practically impactful.
