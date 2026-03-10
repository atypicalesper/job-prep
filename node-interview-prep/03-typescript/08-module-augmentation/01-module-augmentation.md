# TypeScript Module Augmentation and Declaration Merging

---

## What Is Module Augmentation?

```typescript
// Module augmentation lets you ADD to existing type declarations —
// your own modules, third-party libraries, or global types.
// You're extending the types, not replacing them.

// Used for:
// 1. Adding properties to Express req/res (most common)
// 2. Extending third-party library types
// 3. Adding custom properties to global objects (window, process.env)
// 4. Declaration merging for interfaces
```

---

## Augmenting Express Request

```typescript
// Problem: you add user to req in middleware, but TypeScript doesn't know:
app.use(async (req, res, next) => {
  const token = req.headers.authorization;
  req.user = await verifyJwt(token); // ❌ Property 'user' does not exist on Request
  next();
});

// Fix: augment Express's Request interface

// src/types/express.d.ts (or any .d.ts file included in tsconfig):
import 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        roles: string[];
      };
      requestId: string;
      startTime: number;
    }
  }
}

// Now TypeScript knows about req.user everywhere:
app.get('/profile', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ id: req.user.id, email: req.user.email }); // ✅ typed
});
```

---

## Augmenting Third-Party Library Types

```typescript
// Example: adding a method to a third-party client library
// that's missing from its type definitions:

// Option 1: Module augmentation (preferred when extending existing types)
declare module 'some-db-client' {
  interface Client {
    // Add a missing method:
    queryWithRetry<T>(sql: string, params: any[], retries?: number): Promise<T[]>;
  }

  interface ConnectionOptions {
    // Add missing option:
    applicationName?: string;
  }
}

// Now you can call it with full type safety:
const result = await client.queryWithRetry<User>('SELECT * FROM users', [], 3);

// Option 2: Using interface merging (for your own interfaces)
// file-a.ts:
interface PluginOptions {
  timeout: number;
}

// file-b.ts (merges with file-a.ts):
interface PluginOptions {
  retries: number;
}

// Both files contribute to the same interface — merged result:
const opts: PluginOptions = { timeout: 5000, retries: 3 }; // ✅
```

---

## Augmenting Global Types

```typescript
// Extend the global Window object (browser):
declare global {
  interface Window {
    __APP_CONFIG__: {
      apiUrl: string;
      version: string;
    };
    analytics: {
      track(event: string, data?: object): void;
    };
  }
}

// Usage:
window.__APP_CONFIG__.apiUrl; // ✅ typed

// Extend NodeJS global:
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production' | 'test';
      DATABASE_URL: string;
      REDIS_URL: string;
      JWT_SECRET: string;
      PORT?: string;  // ? = optional (not guaranteed to exist)
    }
  }
}

// Now process.env is typed (no more string | undefined for known vars):
const dbUrl: string = process.env.DATABASE_URL; // ✅ string, not string | undefined
const port = process.env.PORT ?? '3000';         // ✅ string | undefined
const env = process.env.NODE_ENV;                // ✅ 'development' | 'production' | 'test'
```

---

## Typed process.env Pattern

```typescript
// src/config/env.ts — validate + type process.env at startup:
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

// Throws at startup if any required env var is missing/invalid:
export const env = envSchema.parse(process.env);

// Type inference — env is now fully typed from the schema:
// env.PORT is number (not string), env.NODE_ENV is literal union, etc.

// No need to augment ProcessEnv if using this pattern —
// just import env everywhere instead of process.env.
```

---

## Declaration Merging with Namespaces

```typescript
// Merging function + namespace (adds static properties to a function):
function createRouter(base: string): Router {
  // ... implementation
}

namespace createRouter {
  export interface Options {
    prefix?: string;
    middleware?: any[];
  }

  export function withOptions(opts: Options): Router {
    return createRouter(opts.prefix ?? '/');
  }
}

// Usage:
const router = createRouter('/api');
const router2 = createRouter.withOptions({ prefix: '/v2', middleware: [auth] });

// This pattern is used by libraries like Express itself:
// express() is a function AND has properties like express.Router, express.json
```

---

## Merging Enums

```typescript
// Declaration merging is NOT allowed for:
// - Type aliases (type Foo = ...)
// - Classes
// - Enums (can't split across files)

// But you CAN augment an enum with a namespace:
enum Direction {
  Up = 'UP',
  Down = 'DOWN',
  Left = 'LEFT',
  Right = 'RIGHT',
}

namespace Direction {
  export function isVertical(d: Direction): boolean {
    return d === Direction.Up || d === Direction.Down;
  }
  export function opposite(d: Direction): Direction {
    const map = {
      [Direction.Up]: Direction.Down,
      [Direction.Down]: Direction.Up,
      [Direction.Left]: Direction.Right,
      [Direction.Right]: Direction.Left,
    };
    return map[d];
  }
}

Direction.isVertical(Direction.Up); // ✅ true
Direction.opposite(Direction.Left); // ✅ Direction.Right
```

---

## Patching Types for Missing Definitions (@types workaround)

```typescript
// When a library has no types and no @types package:

// Option 1: Quick stub in src/types/untyped-lib.d.ts:
declare module 'untyped-library' {
  export function doThing(config: { key: string; value: number }): Promise<void>;
  export const VERSION: string;
  export default class Client {
    constructor(options: { apiKey: string });
    send(data: object): Promise<{ id: string }>;
  }
}

// Option 2: Accept any (quick, unsafe):
declare module 'untyped-library'; // whole module is `any`

// Option 3: Augment existing @types that are incomplete:
// If @types/some-lib is missing a method that exists at runtime:
declare module 'some-lib' {
  interface SomeClass {
    missingMethod(arg: string): void;
  }
}
```

---

## Interview Questions

**Q: What is the difference between module augmentation and creating a new type?**
A: Module augmentation ADDS to an existing type in its original module — it merges with the declaration, so the original library's type still works and you're extending it. Creating a new type creates a separate type that's disconnected from the library's actual interface. Augmentation is needed when you want `req.user` to be recognized on Express's `Request` — you can't change Express's source, but you can extend its types.

**Q: Why does TypeScript allow interface merging but not type alias merging?**
A: Interfaces are designed to be extensible — it's a deliberate design decision supporting declaration merging for exactly these use cases (extending third-party types, adding to global objects). Type aliases are meant to be final/closed — they represent a fixed shape. The distinction is: `interface` is "open for extension", `type` is "this is the complete definition". This is one of the primary practical differences between `interface` and `type`.

**Q: How do you properly type `process.env` in TypeScript?**
A: Augment `NodeJS.ProcessEnv` interface with your known variables. But better practice: use a validation library (Zod, Joi) to parse and validate `process.env` at startup into a typed `env` object — catches missing vars at startup rather than at runtime, and gives you proper types (number for `PORT`, literal unions for `NODE_ENV`). Import `env` everywhere instead of `process.env`.

**Q: What is a `.d.ts` file and when do you need one?**
A: `.d.ts` files are TypeScript declaration files — they contain only type information with no runtime code. They tell TypeScript the types of JavaScript modules. You need them when: (1) adding types to untyped JS libraries (either locally or as a `@types/` package), (2) augmenting existing library types (module augmentation goes in a `.d.ts` file), (3) your compiled output (`.js` + `.d.ts`) needs to be consumed by other TypeScript projects. They're generated automatically by `tsc` with `"declaration": true`.
