# TypeScript Decorators

Decorators are a metaprogramming feature that let you add behavior to classes, methods, properties, and parameters. Widely used in NestJS, TypeORM, Angular.

**Enable in tsconfig.json:**
```json
{ "compilerOptions": { "experimentalDecorators": true, "emitDecoratorMetadata": true } }
```

---

## Types of Decorators

```typescript
// 1. Class decorator
@Injectable()
class UserService {}

// 2. Method decorator
class Controller {
  @Get('/users')
  @Auth(['admin'])
  async getUsers() {}
}

// 3. Property decorator
class User {
  @IsEmail()
  email: string;
}

// 4. Parameter decorator
class Controller {
  async getUser(@Param('id') id: string) {}
}
```

---

## Class Decorator

```typescript
// A class decorator receives the constructor and can:
// 1. Replace the class (return new constructor)
// 2. Modify the prototype
// 3. Store metadata

function Singleton<T extends { new(...args: any[]): {} }>(constructor: T) {
  let instance: T | null = null;

  // Return a new class that wraps the original:
  return class extends constructor {
    constructor(...args: any[]) {
      if (instance) return instance as any;
      super(...args);
      instance = this as any;
    }
  };
}

@Singleton
class DatabaseConnection {
  constructor(public url: string) {
    console.log('Connecting to', url);
  }
}

const db1 = new DatabaseConnection('postgres://...');
const db2 = new DatabaseConnection('postgres://...'); // same instance
console.log(db1 === db2); // true

// ----

// Decorator factory (with parameters):
function Controller(path: string) {
  return function(constructor: Function) {
    Reflect.defineMetadata('path', path, constructor);
    // Store route prefix on the class
  };
}

@Controller('/users')
class UserController {}

// Retrieve metadata:
const path = Reflect.getMetadata('path', UserController); // '/users'
```

---

## Method Decorator

```typescript
// Receives: target (class prototype), key (method name), descriptor
function Log(target: any, key: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;

  descriptor.value = async function(...args: any[]) {
    const start = Date.now();
    console.log(`→ ${key}(${JSON.stringify(args)})`);

    try {
      const result = await originalMethod.apply(this, args);
      console.log(`← ${key} (${Date.now() - start}ms)`, result);
      return result;
    } catch (err) {
      console.error(`✗ ${key} failed (${Date.now() - start}ms):`, err);
      throw err;
    }
  };

  return descriptor;
}

// Memoize decorator:
function Memoize(target: any, key: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  const cache = new Map<string, any>();

  descriptor.value = function(...args: any[]) {
    const cacheKey = JSON.stringify(args);
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const result = originalMethod.apply(this, args);
    cache.set(cacheKey, result);
    return result;
  };

  return descriptor;
}

// Retry decorator:
function Retry(attempts: number, delayMs = 100) {
  return function(target: any, key: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value;

    descriptor.value = async function(...args: any[]) {
      let lastError: Error;
      for (let i = 0; i < attempts; i++) {
        try {
          return await original.apply(this, args);
        } catch (err) {
          lastError = err as Error;
          if (i < attempts - 1) {
            await new Promise(r => setTimeout(r, delayMs * 2 ** i));
          }
        }
      }
      throw lastError!;
    };
  };
}

// Usage:
class UserService {
  @Log
  @Retry(3, 100)
  async fetchUser(id: string) {
    return fetch(`/api/users/${id}`).then(r => r.json());
  }

  @Memoize
  expensiveComputation(n: number) {
    // Only computes once per unique n:
    return fibonacci(n);
  }
}
```

---

## Property Decorator

```typescript
// Property decorators can't set values directly (no descriptor for properties)
// They're used to attach metadata or replace with getter/setter

function Required(target: any, key: string) {
  // Store required fields metadata:
  const existing = Reflect.getMetadata('required', target) || [];
  Reflect.defineMetadata('required', [...existing, key], target);
}

function MinLength(min: number) {
  return function(target: any, key: string) {
    let value: string;

    Object.defineProperty(target, key, {
      get() { return value; },
      set(newValue: string) {
        if (typeof newValue === 'string' && newValue.length < min) {
          throw new Error(`${key} must be at least ${min} characters`);
        }
        value = newValue;
      },
      enumerable: true,
      configurable: true,
    });
  };
}

class User {
  @Required
  @MinLength(2)
  name: string;

  @Required
  email: string;

  constructor(name: string, email: string) {
    this.name = name; // triggers setter → validates length
    this.email = email;
  }
}

const u = new User('Al', 'al@example.com'); // ok
new User('A', 'a@b.com'); // throws: name must be at least 2 characters
```

---

## NestJS-Style Decorators (Real World)

```typescript
// How NestJS builds routes with decorators:

const routeRegistry: Array<{
  path: string;
  method: string;
  handler: string;
  controller: Function;
}> = [];

function Get(path: string) {
  return (target: any, key: string) => {
    routeRegistry.push({ path, method: 'GET', handler: key, controller: target.constructor });
  };
}

function Post(path: string) {
  return (target: any, key: string) => {
    routeRegistry.push({ path, method: 'POST', handler: key, controller: target.constructor });
  };
}

function Auth(roles: string[]) {
  return (target: any, key: string, descriptor: PropertyDescriptor) => {
    const original = descriptor.value;
    descriptor.value = async function(req: any, ...args: any[]) {
      if (!req.user || !roles.some(r => req.user.roles.includes(r))) {
        throw new Error('Forbidden');
      }
      return original.call(this, req, ...args);
    };
  };
}

// Controller:
@Controller('/users')
class UserController {
  @Get('/')
  async findAll(req: Request) {
    return [{ id: 1, name: 'Alice' }];
  }

  @Get('/:id')
  @Auth(['admin', 'user'])
  async findOne(req: Request) {
    return { id: req.params.id };
  }

  @Post('/')
  @Auth(['admin'])
  async create(req: Request) {
    return { created: true };
  }
}
```

---

## Decorator Execution Order

```typescript
// Decorators execute bottom-up for methods, outside-in for class

@A  // runs third
@B  // runs second
class C {
  @D  // runs first (method decorators bottom-up)
  @E  // runs second
  method() {}
}

// Parameter decorators run right-to-left:
method(@F param1, @G param2) {}
// G evaluates, then F
```

---

## Interview Questions

**Q: What are decorators and why are they useful?**
A: Decorators are functions that modify the behavior of classes, methods, or properties at definition time. Useful for: cross-cutting concerns (logging, validation, auth) that apply to many methods, dependency injection metadata (NestJS uses them to wire up services), ORM column/table definitions (TypeORM `@Entity`, `@Column`), serialization rules. They separate the "what" from the "how" — the decorated function stays clean.

**Q: What is `emitDecoratorMetadata` used for?**
A: When enabled with `experimentalDecorators`, TypeScript emits type metadata (type, paramTypes, returnType) that can be read at runtime via `Reflect.getMetadata`. NestJS and TypeORM use this to know the TypeScript type of constructor parameters and inject the right service instances automatically — no manual wiring needed.

**Q: Can you use decorators on a plain function (outside a class)?**
A: No. Decorators can only be applied to class declarations, class methods, class properties, and class method parameters. For function decoration outside classes, you use higher-order functions (wrappers). The decorator syntax `@decorator` is syntactic sugar for `class = decorator(class)` or `method = decorator(proto, key, descriptor)`.

**Q: What is the difference between a decorator and a higher-order function?**
A: A higher-order function takes a function and returns a new function — explicit and called at runtime. A decorator uses `@syntax` and runs at class definition time (module load) — declarative and automatic. Decorators can also access metadata (property names, parameter types) which HOFs can't. In practice, many decorators ARE implemented using HOFs internally.
