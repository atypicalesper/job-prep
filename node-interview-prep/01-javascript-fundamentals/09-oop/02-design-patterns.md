# Design Patterns in JavaScript

Patterns are reusable solutions to recurring design problems. Grouped into: **Creational**, **Structural**, **Behavioral**.

---

## Creational Patterns

### Singleton

Ensures only one instance of a class exists.

```js
class Database {
  static #instance = null;
  #connection;

  constructor(url) {
    if (Database.#instance) return Database.#instance;
    this.#connection = connectTo(url);
    Database.#instance = this;
  }

  static getInstance(url) {
    if (!Database.#instance) new Database(url);
    return Database.#instance;
  }

  query(sql) { return this.#connection.execute(sql); }
}

const db1 = new Database('mongodb://...');
const db2 = new Database('mongodb://...');
console.log(db1 === db2); // true — same instance
```

**Use for:** connection pools, loggers, config managers, caches.

### Factory

Delegates object creation to a method:

```js
class PaymentProcessor {
  static create(type, config) {
    switch (type) {
      case 'stripe':  return new StripeProcessor(config);
      case 'paypal':  return new PayPalProcessor(config);
      case 'crypto':  return new CryptoProcessor(config);
      default: throw new Error(`Unknown payment type: ${type}`);
    }
  }
}

// Client doesn't know which concrete class it gets
const processor = PaymentProcessor.create('stripe', { apiKey: '...' });
await processor.charge({ amount: 100, currency: 'USD' });
```

### Abstract Factory

Factory of factories — create families of related objects:

```js
// UI kit factory
class MaterialUIFactory {
  createButton() { return new MaterialButton(); }
  createInput() { return new MaterialInput(); }
  createModal() { return new MaterialModal(); }
}

class AntDesignFactory {
  createButton() { return new AntButton(); }
  createInput() { return new AntInput(); }
  createModal() { return new AntModal(); }
}

function renderForm(factory) {
  const btn = factory.createButton();
  const input = factory.createInput();
  // Works with any UI kit
  return { btn, input };
}
```

### Builder

Constructs complex objects step by step:

```js
class QueryBuilder {
  #table = '';
  #conditions = [];
  #columns = ['*'];
  #limit = null;
  #orderBy = null;

  from(table) { this.#table = table; return this; }
  select(...cols) { this.#columns = cols; return this; }
  where(condition) { this.#conditions.push(condition); return this; }
  orderBy(col, dir = 'ASC') { this.#orderBy = `${col} ${dir}`; return this; }
  limit(n) { this.#limit = n; return this; }

  build() {
    let sql = `SELECT ${this.#columns.join(', ')} FROM ${this.#table}`;
    if (this.#conditions.length) sql += ` WHERE ${this.#conditions.join(' AND ')}`;
    if (this.#orderBy) sql += ` ORDER BY ${this.#orderBy}`;
    if (this.#limit) sql += ` LIMIT ${this.#limit}`;
    return sql;
  }
}

const query = new QueryBuilder()
  .from('users')
  .select('id', 'name', 'email')
  .where("role = 'admin'")
  .where('active = 1')
  .orderBy('created_at', 'DESC')
  .limit(10)
  .build();
// SELECT id, name, email FROM users WHERE role = 'admin' AND active = 1 ORDER BY created_at DESC LIMIT 10
```

### Prototype

Clone existing objects rather than create from scratch:

```js
class Config {
  constructor(settings) { Object.assign(this, settings); }

  clone() { return new Config({ ...this }); }

  with(overrides) { return new Config({ ...this, ...overrides }); }
}

const defaultConfig = new Config({ theme: 'dark', lang: 'en', debug: false });
const devConfig = defaultConfig.with({ debug: true });
const prodConfig = defaultConfig.with({ theme: 'light' });
```

---

## Structural Patterns

### Decorator

Add behavior to objects without modifying their class:

```js
// Function-level decorator (modern JS)
function readonly(target, key, descriptor) {
  descriptor.writable = false;
  return descriptor;
}

function memoize(fn) {
  const cache = new Map();
  return function(...args) {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };
}

const expensiveCalc = memoize((n) => {
  console.log('computing...');
  return n * n;
});

expensiveCalc(5); // computing... → 25
expensiveCalc(5); // 25 (from cache, no log)

// Class-level decorator (wrapping)
function withLogging(ServiceClass) {
  return class extends ServiceClass {
    async request(...args) {
      console.log(`[${ServiceClass.name}] request`, args);
      const result = await super.request(...args);
      console.log(`[${ServiceClass.name}] response`, result);
      return result;
    }
  };
}

const LoggedApiService = withLogging(ApiService);
```

### Proxy

Intercept and control object operations:

```js
function createReactiveObject(target, onChange) {
  return new Proxy(target, {
    set(obj, prop, value) {
      const oldValue = obj[prop];
      obj[prop] = value;
      if (oldValue !== value) onChange(prop, value, oldValue);
      return true;
    },
    get(obj, prop) {
      if (typeof obj[prop] === 'object' && obj[prop] !== null) {
        return createReactiveObject(obj[prop], onChange); // deep reactive
      }
      return obj[prop];
    },
    deleteProperty(obj, prop) {
      const oldValue = obj[prop];
      delete obj[prop];
      onChange(prop, undefined, oldValue);
      return true;
    }
  });
}

const state = createReactiveObject({ count: 0, name: 'Alice' }, (key, val) => {
  console.log(`${key} changed to ${val}`);
  // trigger re-render, notify subscribers...
});

state.count = 5; // count changed to 5
state.name = 'Bob'; // name changed to Bob

// Validation proxy
function createValidated(target, validators) {
  return new Proxy(target, {
    set(obj, prop, value) {
      if (validators[prop] && !validators[prop](value)) {
        throw new TypeError(`Invalid value for ${prop}: ${value}`);
      }
      obj[prop] = value;
      return true;
    }
  });
}

const user = createValidated({}, {
  age: (v) => Number.isInteger(v) && v >= 0 && v <= 150,
  email: (v) => /\S+@\S+\.\S+/.test(v),
});

user.age = 25;       // ok
user.age = -1;       // TypeError: Invalid value for age: -1
```

### Adapter

Bridge incompatible interfaces:

```js
// Old API
class OldPaymentGateway {
  processPayment(amount, cardNumber, cvv, expiry) {
    return { status: 'ok', transactionId: '123' };
  }
}

// New interface expected by your app
class ModernPaymentAdapter {
  #gateway;

  constructor(gateway) { this.#gateway = gateway; }

  async charge({ amount, card }) {
    const result = this.#gateway.processPayment(
      amount, card.number, card.cvv, card.expiry
    );
    return {
      success: result.status === 'ok',
      id: result.transactionId,
    };
  }
}

const gateway = new ModernPaymentAdapter(new OldPaymentGateway());
await gateway.charge({ amount: 99.99, card: { number: '4111...', cvv: '123', expiry: '12/26' } });
```

### Facade

Simplified interface over a complex subsystem:

```js
class HomeTheaterFacade {
  constructor(tv, soundSystem, lights, streamer) {
    this.tv = tv;
    this.soundSystem = soundSystem;
    this.lights = lights;
    this.streamer = streamer;
  }

  watchMovie(title) {
    this.lights.dim(30);
    this.tv.turnOn();
    this.soundSystem.setVolume(40);
    this.soundSystem.setSurroundSound(true);
    this.streamer.play(title);
    console.log('Movie mode activated. Enjoy!');
  }

  endMovie() {
    this.streamer.stop();
    this.tv.turnOff();
    this.soundSystem.turnOff();
    this.lights.brighten(100);
  }
}

// Client: one method instead of 5 objects
const theater = new HomeTheaterFacade(tv, sound, lights, netflix);
theater.watchMovie('Inception');
```

### Composite

Treat individual objects and compositions uniformly:

```js
class FileSystemItem {
  constructor(name) { this.name = name; }
  getSize() { throw new Error(); }
  print(indent = '') { throw new Error(); }
}

class File extends FileSystemItem {
  constructor(name, size) { super(name); this.size = size; }
  getSize() { return this.size; }
  print(indent = '') { console.log(`${indent}📄 ${this.name} (${this.size}B)`); }
}

class Directory extends FileSystemItem {
  #children = [];
  add(item) { this.#children.push(item); return this; }
  remove(item) { this.#children = this.#children.filter(c => c !== item); }
  getSize() { return this.#children.reduce((sum, c) => sum + c.getSize(), 0); }
  print(indent = '') {
    console.log(`${indent}📁 ${this.name} (${this.getSize()}B)`);
    this.#children.forEach(c => c.print(indent + '  '));
  }
}

const root = new Directory('root')
  .add(new File('readme.txt', 100))
  .add(new Directory('src')
    .add(new File('index.js', 500))
    .add(new File('utils.js', 300)));

root.print();
// 📁 root (900B)
//   📄 readme.txt (100B)
//   📁 src (800B)
//     📄 index.js (500B)
//     📄 utils.js (300B)
```

---

## Behavioral Patterns

### Observer (Pub/Sub)

```js
class EventEmitter {
  #events = new Map();

  on(event, listener) {
    if (!this.#events.has(event)) this.#events.set(event, new Set());
    this.#events.get(event).add(listener);
    return () => this.off(event, listener); // returns unsubscribe fn
  }

  once(event, listener) {
    const wrapper = (...args) => { listener(...args); this.off(event, wrapper); };
    return this.on(event, wrapper);
  }

  off(event, listener) { this.#events.get(event)?.delete(listener); }

  emit(event, ...args) {
    this.#events.get(event)?.forEach(listener => listener(...args));
  }
}

const store = new EventEmitter();
const unsub = store.on('change', (newState) => console.log('State:', newState));
store.emit('change', { count: 1 });
unsub(); // stop listening
```

### Strategy

Swap algorithms at runtime:

```js
class Sorter {
  #strategy;
  constructor(strategy) { this.#strategy = strategy; }
  setStrategy(strategy) { this.#strategy = strategy; }
  sort(data) { return this.#strategy.sort([...data]); }
}

const bubbleSort = {
  sort(arr) { /* ... */ return arr; }
};

const quickSort = {
  sort(arr) { /* ... */ return arr; }
};

const sorter = new Sorter(quickSort);
sorter.sort([3, 1, 4, 1, 5]);

// Swap strategy at runtime
sorter.setStrategy(bubbleSort);
sorter.sort([3, 1, 4, 1, 5]);
```

### Command

Encapsulate operations as objects (enables undo/redo, queuing, logging):

```js
class TextEditor {
  #content = '';
  #history = [];

  execute(command) {
    this.#content = command.execute(this.#content);
    this.#history.push(command);
  }

  undo() {
    const command = this.#history.pop();
    if (command) this.#content = command.undo(this.#content);
  }

  get content() { return this.#content; }
}

const insertCommand = (text, position) => ({
  execute: (content) => content.slice(0, position) + text + content.slice(position),
  undo: (content) => content.slice(0, position) + content.slice(position + text.length),
});

const editor = new TextEditor();
editor.execute(insertCommand('Hello', 0));
editor.execute(insertCommand(' World', 5));
console.log(editor.content); // 'Hello World'
editor.undo();
console.log(editor.content); // 'Hello'
```

### Iterator

Sequential access without exposing internals:

```js
class Range {
  constructor(start, end, step = 1) {
    this.start = start;
    this.end = end;
    this.step = step;
  }

  [Symbol.iterator]() {
    let current = this.start;
    return {
      next: () => {
        if (current <= this.end) {
          const value = current;
          current += this.step;
          return { value, done: false };
        }
        return { value: undefined, done: true };
      }
    };
  }
}

const range = new Range(1, 10, 2);
console.log([...range]); // [1, 3, 5, 7, 9]
for (const n of range) console.log(n); // 1 3 5 7 9
```

### Chain of Responsibility

Pass a request along a chain of handlers:

```js
class Middleware {
  #next = null;
  setNext(handler) { this.#next = handler; return handler; }
  handle(req) { return this.#next?.handle(req); }
}

class AuthMiddleware extends Middleware {
  handle(req) {
    if (!req.token) return { error: 401, message: 'Unauthorized' };
    req.user = verifyToken(req.token);
    return super.handle(req);
  }
}

class RateLimitMiddleware extends Middleware {
  handle(req) {
    if (isRateLimited(req.ip)) return { error: 429, message: 'Too many requests' };
    return super.handle(req);
  }
}

class LoggerMiddleware extends Middleware {
  handle(req) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    return super.handle(req);
  }
}

// Build chain
const auth = new AuthMiddleware();
const rateLimit = new RateLimitMiddleware();
const logger = new LoggerMiddleware();

auth.setNext(rateLimit).setNext(logger);
auth.handle({ method: 'GET', url: '/api/data', token: '...', ip: '1.2.3.4' });
```

### Template Method

Define algorithm skeleton; let subclasses fill in steps:

```js
class DataExporter {
  // Template method — fixed algorithm
  export(data) {
    const validated = this.validate(data);
    const transformed = this.transform(validated);
    const formatted = this.format(transformed);
    this.write(formatted);
  }

  validate(data) { /* common validation */ return data; }
  transform(data) { return data; }          // override if needed

  // Abstract — subclasses MUST implement
  format(data) { throw new Error(); }
  write(content) { throw new Error(); }
}

class CSVExporter extends DataExporter {
  format(data) { return data.map(row => row.join(',')).join('\n'); }
  write(content) { fs.writeFileSync('output.csv', content); }
}

class JSONExporter extends DataExporter {
  format(data) { return JSON.stringify(data, null, 2); }
  write(content) { fs.writeFileSync('output.json', content); }
}
```
