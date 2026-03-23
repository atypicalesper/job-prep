# SOLID Principles with TypeScript

---

## S — Single Responsibility Principle

Each class/module should have one reason to change.

```typescript
// ❌ Bad: UserService does too many things
class UserService {
  async getUser(id: string) { /* DB query */ }
  async sendWelcomeEmail(user: User) { /* email */ }
  generatePdfReport(users: User[]) { /* PDF generation */ }
  formatUserForApi(user: User) { /* formatting */ }
}

// ✅ Good: each class has one job
class UserRepository {
  async findById(id: string): Promise<User | null> {
    return db.users.findOne({ where: { id } });
  }
  async save(user: User): Promise<User> {
    return db.users.save(user);
  }
}

class EmailService {
  async sendWelcome(user: User): Promise<void> {
    await mailer.send({ to: user.email, template: 'welcome' });
  }
}

class UserReportService {
  generatePdf(users: User[]): Buffer {
    // PDF generation logic
  }
}

class UserPresenter {
  toApiResponse(user: User): ApiUser {
    return { id: user.id, name: user.name, email: user.email };
  }
}
```

---

## O — Open/Closed Principle

Open for extension, closed for modification. Add new behavior by adding code, not changing existing code.

```typescript
// ❌ Bad: must modify existing code to add new discount type
class DiscountCalculator {
  calculate(type: string, price: number): number {
    if (type === 'percentage') return price * 0.9;
    if (type === 'fixed') return price - 10;
    if (type === 'buy2get1') return price * 2/3; // added later — modified class!
    return price;
  }
}

// ✅ Good: extend by adding new class, don't modify existing
interface DiscountStrategy {
  apply(price: number): number;
}

class PercentageDiscount implements DiscountStrategy {
  constructor(private percent: number) {}
  apply(price: number): number { return price * (1 - this.percent / 100); }
}

class FixedDiscount implements DiscountStrategy {
  constructor(private amount: number) {}
  apply(price: number): number { return Math.max(0, price - this.amount); }
}

class Buy2Get1Discount implements DiscountStrategy {
  apply(price: number): number { return price * 2 / 3; }
}

class DiscountCalculator {
  constructor(private strategy: DiscountStrategy) {}
  calculate(price: number): number { return this.strategy.apply(price); }
}

// Add new discounts without touching existing code:
const calc = new DiscountCalculator(new PercentageDiscount(10));
```

---

## L — Liskov Substitution Principle

Subclasses should be usable wherever the base class is expected, without breaking behavior.

```typescript
// ❌ Bad: Square breaks Rectangle's behavior
class Rectangle {
  constructor(protected width: number, protected height: number) {}
  setWidth(w: number) { this.width = w; }
  setHeight(h: number) { this.height = h; }
  area() { return this.width * this.height; }
}

class Square extends Rectangle {
  setWidth(w: number) {
    this.width = w;
    this.height = w; // violates LSP!
  }
  setHeight(h: number) {
    this.width = h;
    this.height = h; // violates LSP!
  }
}

function makeRectangle(r: Rectangle) {
  r.setWidth(4);
  r.setHeight(5);
  console.assert(r.area() === 20); // fails for Square!
}

// ✅ Good: use composition or separate hierarchies
interface Shape {
  area(): number;
}

class Rectangle implements Shape {
  constructor(private width: number, private height: number) {}
  area() { return this.width * this.height; }
}

class Square implements Shape {
  constructor(private side: number) {}
  area() { return this.side ** 2; }
}
```

---

## I — Interface Segregation Principle

Clients shouldn't depend on interfaces they don't use. Many specific interfaces > one general interface.

```typescript
// ❌ Bad: fat interface forces all implementors to implement everything
interface Worker {
  work(): void;
  eat(): void;
  sleep(): void;
}

class Robot implements Worker {
  work() { /* works */ }
  eat() { throw new Error('Robots don\'t eat!'); } // forced!
  sleep() { throw new Error('Robots don\'t sleep!'); } // forced!
}

// ✅ Good: small, focused interfaces
interface Workable { work(): void; }
interface Eatable  { eat(): void; }
interface Sleepable { sleep(): void; }

class Human implements Workable, Eatable, Sleepable {
  work()  { /* works */ }
  eat()   { /* eats */ }
  sleep() { /* sleeps */ }
}

class Robot implements Workable {
  work() { /* works */ }
}
```

---

## D — Dependency Inversion Principle

High-level modules shouldn't depend on low-level modules. Both should depend on abstractions.

```typescript
// ❌ Bad: UserService directly depends on concrete implementations
class UserService {
  private db = new PostgresDatabase();      // concrete dependency!
  private mailer = new SendGridMailer();    // concrete dependency!
  private logger = new WinstonLogger();     // concrete dependency!

  async createUser(data: CreateUserDto) {
    const user = await this.db.save(data);
    await this.mailer.send(user.email, 'welcome');
    this.logger.info('User created', { userId: user.id });
    return user;
  }
}

// ✅ Good: depend on abstractions (interfaces)
interface IUserRepository {
  save(data: CreateUserDto): Promise<User>;
  findById(id: string): Promise<User | null>;
}

interface IMailer {
  send(to: string, template: string): Promise<void>;
}

interface ILogger {
  info(message: string, meta?: object): void;
  error(message: string, meta?: object): void;
}

class UserService {
  constructor(
    private repo: IUserRepository,   // injected — any implementation works
    private mailer: IMailer,
    private logger: ILogger
  ) {}

  async createUser(data: CreateUserDto): Promise<User> {
    const user = await this.repo.save(data);
    await this.mailer.send(user.email, 'welcome');
    this.logger.info('User created', { userId: user.id });
    return user;
  }
}

// Wire up (in composition root / DI container):
const service = new UserService(
  new PostgresUserRepository(db),
  new SendGridMailer(apiKey),
  new WinstonLogger()
);

// Easy to test with mocks:
const service = new UserService(
  new InMemoryUserRepository(),
  new MockMailer(),
  new NullLogger()
);
```

---

## Interview Questions

**Q: What is the Single Responsibility Principle and how do you apply it in practice?**
A: A class should have only one reason to change — one job. In practice: separate data access (repositories), business logic (services/use cases), presentation (controllers/presenters), external integrations (adapters). A controller should orchestrate, not contain business logic. A service should not handle HTTP concerns.

**Q: What is the Liskov Substitution Principle and what's a common violation?**
A: If you have a function that works with type `Animal`, you should be able to pass any subtype (`Dog`, `Cat`) and it should still work correctly. Classic violations: subclass throws where base class doesn't, subclass weakens preconditions, strengthens postconditions. The Rectangle/Square is the canonical example — Square breaks Rectangle's invariants (setting width changes height). Fix with composition over inheritance or redesigning the hierarchy.

**Q: What is Dependency Injection and how does it enable testability?**
A: DI passes dependencies from outside rather than creating them inside. Instead of `new PostgresDB()` inside the service, inject `IDatabase` in the constructor. Benefits: testability (inject mocks in tests), flexibility (swap implementations without touching service code), and explicit dependencies (requirements visible in constructor). DI containers (tsyringe, inversify) automate the wiring.
