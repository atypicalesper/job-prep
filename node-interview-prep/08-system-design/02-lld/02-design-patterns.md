# Design Patterns in TypeScript

The 23 GoF patterns grouped by purpose. Focus on the most common in Node.js interviews.

---

## Creational Patterns

### Singleton

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

### Adapter

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

### Observer

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
