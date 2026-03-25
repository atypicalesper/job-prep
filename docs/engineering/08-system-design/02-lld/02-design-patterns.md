# Design Patterns in TypeScript

The 23 GoF patterns grouped by purpose. Focus on the most common in Node.js interviews.

---

## Creational Patterns

Creational patterns deal with the problem of object construction: when to create an object, which class to instantiate, and how to manage the lifetime of the resulting instance. They decouple the code that uses an object from the code that decides how to create it, so that construction logic can evolve independently from business logic.

### Singleton

The Singleton pattern ensures that a class has exactly one instance throughout the lifetime of a process, and provides a global access point to that instance. It exists to avoid the waste and inconsistency of creating multiple copies of a resource that should be shared — a database connection pool, a logger, a configuration object. The key property is that the instance is lazily created on first access and cached for all subsequent calls. Prefer module-level singletons in Node.js (the module cache handles deduplication) over class-based Singletons, which are harder to test because they resist dependency injection. Avoid using Singletons for application logic — they introduce hidden global state that makes reasoning about execution order and test isolation difficult.

```typescript
// Ensure only one instance exists
class Database {
  private static instance: Database | null = null;
  private connection: Connection;

  private constructor() {
    this.connection = createConnection(process.env.DATABASE_URL!);
  }

  static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  query(sql: string) { return this.connection.query(sql); }
}

// Usage:
const db1 = Database.getInstance();
const db2 = Database.getInstance();
console.log(db1 === db2); // true — same instance

// Modern alternative: module-level singleton (Node.js module cache handles it):
// db.ts
const connection = createConnection(process.env.DATABASE_URL!);
export default connection;
// Every import gets the same cached module
```

### Factory Method

The Factory Method pattern centralizes object creation behind a function or method so that the caller never needs to know which concrete class it is getting. The problem it solves is that construction decisions (which logger to use, which payment adapter to instantiate) tend to be conditional on runtime configuration, environment, or user input — embedding those `if/switch` blocks directly in business logic makes it brittle and hard to extend. By delegating construction to a factory, adding a new variant only requires touching the factory, not every call site. Use it when the exact class to instantiate is determined at runtime and you want call sites to remain ignorant of that decision.

```typescript
// Create objects without specifying exact class
interface Logger {
  log(message: string): void;
}

class ConsoleLogger implements Logger {
  log(message: string) { console.log(`[Console] ${message}`); }
}

class FileLogger implements Logger {
  log(message: string) { fs.appendFileSync('app.log', `${message}\n`); }
}

class CloudLogger implements Logger {
  log(message: string) { sendToCloudWatch(message); }
}

// Factory:
function createLogger(type: 'console' | 'file' | 'cloud'): Logger {
  switch (type) {
    case 'console': return new ConsoleLogger();
    case 'file':    return new FileLogger();
    case 'cloud':   return new CloudLogger();
  }
}

const logger = createLogger(process.env.LOG_TYPE as any);
```

### Builder

The Builder pattern separates the construction of a complex object from its representation, allowing the same construction process to produce objects with different configurations. It solves the "telescoping constructor" problem: when an object has many optional fields, a constructor with a dozen parameters becomes unreadable and error-prone (which argument is which?). Builder uses a fluent API of named setter methods, each returning `this`, so the caller only sets what they need and the intent is self-documenting. It is especially useful for query builders, HTTP request clients, and test fixture factories where objects are partially configured in many different ways.

```typescript
// Construct complex objects step by step
class QueryBuilder {
  private table: string = '';
  private conditions: string[] = [];
  private orderBy: string = '';
  private limitNum: number = 0;
  private fields: string[] = ['*'];

  select(...fields: string[]): this {
    this.fields = fields;
    return this;
  }

  from(table: string): this {
    this.table = table;
    return this;
  }

  where(condition: string): this {
    this.conditions.push(condition);
    return this;
  }

  order(field: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this.orderBy = `${field} ${direction}`;
    return this;
  }

  limit(n: number): this {
    this.limitNum = n;
    return this;
  }

  build(): string {
    let query = `SELECT ${this.fields.join(', ')} FROM ${this.table}`;
    if (this.conditions.length) query += ` WHERE ${this.conditions.join(' AND ')}`;
    if (this.orderBy) query += ` ORDER BY ${this.orderBy}`;
    if (this.limitNum) query += ` LIMIT ${this.limitNum}`;
    return query;
  }
}

const query = new QueryBuilder()
  .select('id', 'name', 'email')
  .from('users')
  .where('active = true')
  .where('age > 18')
  .order('name')
  .limit(20)
  .build();
// SELECT id, name, email FROM users WHERE active = true AND age > 18 ORDER BY name ASC LIMIT 20
```

---

## Structural Patterns

Structural patterns are about composing classes and objects into larger structures while keeping those structures flexible and efficient. They solve the problem of incompatibility and layering: how to make existing code work with new interfaces, how to add behavior without modifying existing classes, and how to control access to expensive or sensitive objects.

### Adapter

The Adapter pattern wraps an existing class with a different interface so that otherwise-incompatible code can work together without modification. The classic case is integrating a third-party library or legacy system whose API doesn't match the interface your application expects — rewriting the library isn't an option, but writing a thin translation layer around it is. The adapter translates calls from the expected interface into calls the wrapped object understands, hiding the impedance mismatch from the rest of the system. Use it when you need to integrate external APIs, legacy code, or any collaborator that you don't own and can't change.

```typescript
// Convert incompatible interfaces to work together

// Legacy payment gateway:
class LegacyPaymentGateway {
  processPayment(cardNumber: string, amount: number, currency: string): boolean {
    // old API
    return true;
  }
}

// Your app's payment interface:
interface PaymentProcessor {
  charge(payment: {
    cardToken: string;
    amountCents: number;
    currencyCode: string;
  }): Promise<{ success: boolean; transactionId: string }>;
}

// Adapter:
class LegacyPaymentAdapter implements PaymentProcessor {
  constructor(private legacy: LegacyPaymentGateway) {}

  async charge(payment: {
    cardToken: string;
    amountCents: number;
    currencyCode: string;
  }) {
    const amount = payment.amountCents / 100;
    const success = this.legacy.processPayment(
      payment.cardToken,
      amount,
      payment.currencyCode
    );
    return { success, transactionId: `legacy-${Date.now()}` };
  }
}
```

### Decorator

The Decorator pattern attaches additional responsibilities to an object at runtime by wrapping it in another object that implements the same interface. It solves the feature-explosion problem that inheritance creates: if you have a `DataSource` and want to support every combination of encryption and compression, subclassing produces a combinatorial explosion of classes (`EncryptedSource`, `CompressedSource`, `EncryptedCompressedSource`...). Decorators are stackable — each wraps the previous, delegating to it while adding its own behavior before or after. The key mental model is that decorators are transparent: any code working with the base interface works identically with the decorated version. Use Decorator instead of inheritance whenever you need composable, layered behavior at runtime.

```typescript
// Add behavior to objects without modifying them

interface DataSource {
  write(data: string): void;
  read(): string;
}

class FileDataSource implements DataSource {
  constructor(private filename: string) {}
  write(data: string) { fs.writeFileSync(this.filename, data); }
  read() { return fs.readFileSync(this.filename, 'utf8'); }
}

// Decorator base:
abstract class DataSourceDecorator implements DataSource {
  constructor(protected wrapped: DataSource) {}
  write(data: string) { this.wrapped.write(data); }
  read() { return this.wrapped.read(); }
}

// Encryption decorator:
class EncryptionDecorator extends DataSourceDecorator {
  write(data: string) {
    super.write(encrypt(data));
  }
  read() {
    return decrypt(super.read());
  }
}

// Compression decorator:
class CompressionDecorator extends DataSourceDecorator {
  write(data: string) {
    super.write(compress(data));
  }
  read() {
    return decompress(super.read());
  }
}

// Stack decorators:
const source = new CompressionDecorator(
  new EncryptionDecorator(
    new FileDataSource('data.bin')
  )
);
// write → compress → encrypt → write to file
// read → read from file → decrypt → decompress
```

### Proxy

The Proxy pattern provides a surrogate that controls access to another object, intercepting calls before they reach it. It exists to add cross-cutting concerns — caching, access control, logging, lazy initialization — without changing the target object's code. The proxy and the target share the same interface, so callers are unaware they're talking to a proxy. The key distinction from Decorator is intent: a proxy manages the lifecycle and access to the object (often acting as a stand-in for an expensive or remote resource), while a Decorator adds new behavior to an existing one. Common real-world uses include HTTP caching layers, database connection pools, and authorization wrappers.

```typescript
// Control access to another object

// Lazy-loading proxy:
interface UserService {
  getUser(id: string): Promise<User>;
}

class RealUserService implements UserService {
  async getUser(id: string): Promise<User> {
    return db.users.findById(id);
  }
}

class CachingUserServiceProxy implements UserService {
  private realService: RealUserService;
  private cache = new Map<string, { user: User; expiresAt: number }>();

  constructor() {
    this.realService = new RealUserService();
  }

  async getUser(id: string): Promise<User> {
    const cached = this.cache.get(id);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.user;
    }

    const user = await this.realService.getUser(id);
    this.cache.set(id, { user, expiresAt: Date.now() + 60_000 });
    return user;
  }
}
```

---

## Behavioral Patterns

Behavioral patterns define how objects communicate and distribute responsibility. They solve the problem of tight coupling between objects that need to collaborate: when object A directly calls object B, A must know B exists, making both hard to change independently. Behavioral patterns introduce indirection — through events, strategies, commands, or chains — so that collaborators are loosely coupled and their interactions can be reconfigured without modifying the participants.

### Observer

The Observer pattern defines a one-to-many relationship where multiple "observers" are automatically notified when a single "subject" changes state. It decouples the source of an event from the code that reacts to it: the subject doesn't need to know who is listening or how many listeners there are. This makes it easy to add new reactions to existing events without modifying the emitting code. Node.js's `EventEmitter` is a direct implementation of this pattern. Use Observer when multiple independent components need to respond to the same state change, but coupling them directly would create a tangled dependency web.

```typescript
// One-to-many dependency — when one changes, all dependents are notified

type EventHandler<T> = (data: T) => void;

class EventEmitter<Events extends Record<string, any>> {
  private handlers = new Map<keyof Events, Set<Function>>();

  on<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): this {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return this;
  }

  off<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): this {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

  emit<K extends keyof Events>(event: K, data: Events[K]): void {
    this.handlers.get(event)?.forEach(h => h(data));
  }
}

// Usage:
type UserEvents = {
  created: { user: User };
  deleted: { userId: string };
};

const userEmitter = new EventEmitter<UserEvents>();
userEmitter.on('created', ({ user }) => sendWelcomeEmail(user));
userEmitter.on('created', ({ user }) => updateAnalytics(user));
userEmitter.on('deleted', ({ userId }) => cleanupData(userId));
```

### Strategy

The Strategy pattern defines a family of algorithms, encapsulates each one, and makes them interchangeable at runtime. It exists to eliminate large `if/switch` blocks that select between different algorithms or behaviors — instead of baking the selection logic into the consumer, you pass in the desired behavior as an object. This allows the algorithm to vary independently from the context that uses it. The mental model is "the context delegates work to a strategy object it was given." Use Strategy whenever you have a single operation that can be performed in multiple ways and the choice may vary at runtime (sorting algorithms, pricing rules, authentication strategies, compression codecs).

```typescript
// Define a family of algorithms, make them interchangeable

interface SortStrategy<T> {
  sort(data: T[]): T[];
}

class BubbleSort<T> implements SortStrategy<T> {
  sort(data: T[]): T[] {
    // O(n²) — simple
    const arr = [...data];
    for (let i = 0; i < arr.length - 1; i++) {
      for (let j = 0; j < arr.length - i - 1; j++) {
        if (arr[j] > arr[j+1]) [arr[j], arr[j+1]] = [arr[j+1], arr[j]];
      }
    }
    return arr;
  }
}

class QuickSort<T> implements SortStrategy<T> {
  sort(data: T[]): T[] {
    // O(n log n)
    if (data.length <= 1) return data;
    const [pivot, ...rest] = data;
    return [
      ...this.sort(rest.filter(x => x <= pivot)),
      pivot,
      ...this.sort(rest.filter(x => x > pivot))
    ];
  }
}

class Sorter<T> {
  constructor(private strategy: SortStrategy<T>) {}

  setStrategy(strategy: SortStrategy<T>) {
    this.strategy = strategy;
  }

  sort(data: T[]): T[] {
    return this.strategy.sort(data);
  }
}

// Choose strategy at runtime:
const sorter = new Sorter<number>(
  data.length < 10 ? new BubbleSort() : new QuickSort()
);
```

### Command

The Command pattern encapsulates a request as a standalone object that contains all information needed to perform an action. This object-as-request model unlocks capabilities that a direct method call cannot provide: the command can be queued for later execution, logged for auditing, undone by reversing its effect, or retried without the invoker knowing anything about the operation's internals. The key properties are that a Command exposes an `execute()` method and optionally an `undo()` method, decoupling the code that initiates an operation from the code that performs it. Use Command when you need operation history (undo/redo), deferred or queued execution, or a transaction log.

```typescript
// Encapsulate requests as objects — supports undo, queue, log

interface Command {
  execute(): void;
  undo(): void;
}

class TextEditor {
  private content = '';
  private history: Command[] = [];

  execute(command: Command) {
    command.execute();
    this.history.push(command);
  }

  undo() {
    this.history.pop()?.undo();
  }
}

class InsertCommand implements Command {
  constructor(
    private editor: { content: string },
    private position: number,
    private text: string
  ) {}

  execute() {
    const { content } = this.editor;
    this.editor.content =
      content.slice(0, this.position) + this.text + content.slice(this.position);
  }

  undo() {
    const { content } = this.editor;
    this.editor.content =
      content.slice(0, this.position) + content.slice(this.position + this.text.length);
  }
}
```

### Chain of Responsibility

Chain of Responsibility passes a request through a sequence of handlers, where each handler decides either to process the request and stop the chain, or to pass it to the next handler. This pattern solves the problem of conditionally applying processing steps without hard-coding their order or composition in the invoker. The mental model is a pipeline: each stage in the pipeline is independent, has a single job, and can short-circuit the rest. Express middleware is the canonical Node.js example — each `app.use()` handler is one link in the chain, and calling `next()` passes control forward. Use CoR when you have a variable number of processing steps that need to be composed flexibly (auth, rate limiting, logging, validation).

```typescript
// Pass requests along a chain of handlers (Express middleware!)

abstract class Middleware {
  protected next: Middleware | null = null;

  setNext(middleware: Middleware): Middleware {
    this.next = middleware;
    return middleware;
  }

  abstract handle(req: Request, res: Response): void;
}

class AuthMiddleware extends Middleware {
  handle(req: Request, res: Response) {
    if (!req.headers.authorization) {
      res.status(401).json({ error: 'Unauthorized' });
      return; // stop chain
    }
    this.next?.handle(req, res);
  }
}

class RateLimitMiddleware extends Middleware {
  handle(req: Request, res: Response) {
    if (isRateLimited(req.ip)) {
      res.status(429).json({ error: 'Rate limited' });
      return;
    }
    this.next?.handle(req, res);
  }
}

// Build chain:
const auth = new AuthMiddleware();
const rateLimit = new RateLimitMiddleware();
auth.setNext(rateLimit);
```

---

## Interview Questions

**Q: What is the difference between Decorator and Proxy patterns?**
A: Both wrap an object. Proxy controls access to the same interface — often for lazy initialization, caching, access control, or logging. Decorator adds new behavior — often stacked to compose features (compression + encryption). The intent differs: Proxy manages the relationship with the wrapped object; Decorator enhances the wrapped object's behavior.

**Q: How does the Observer pattern relate to Node.js EventEmitter?**
A: Node.js's `EventEmitter` IS the Observer pattern. `emitter.on(event, listener)` = subscribe. `emitter.emit(event, data)` = notify all subscribers. The DOM's `addEventListener` is the same pattern. Benefits: loose coupling — emitter doesn't know who's listening.

**Q: When would you use the Factory pattern?**
A: When the exact class to instantiate depends on runtime conditions, or when you want to decouple object creation from use. Examples: creating different loggers based on environment, creating different payment processors based on payment method, creating different notification senders (SMS, email, push) based on user preference.

**Q: What design pattern does Express middleware use?**
A: Chain of Responsibility. Each middleware either handles the request (and optionally calls `next()`) or passes it along. The chain is defined by the order of `app.use()` calls. Middlewares for auth, logging, parsing, rate limiting are all separate handlers in the chain.
