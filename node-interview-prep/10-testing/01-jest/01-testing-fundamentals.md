# Testing Fundamentals with Jest

---

## Testing Pyramid

```
       ╔═══════════════╗
       ║   E2E Tests   ║  ← few, slow, expensive
       ╠═══════════════╣
       ║  Integration  ║  ← some, moderate speed
       ╠═══════════════╣
       ║  Unit Tests   ║  ← many, fast, cheap
       ╚═══════════════╝

Unit:        Test individual functions/classes in isolation (mock dependencies)
Integration: Test multiple components together (real DB, real HTTP)
E2E:         Test full user flows (real browser, real services)
```

---

## Jest Configuration

```typescript
// jest.config.ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/*.test.ts', '**/*.spec.ts'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 }
  },
  clearMocks: true,     // clear mock.calls between tests
  resetMocks: true,     // reset mock implementations between tests
  setupFilesAfterFramework: ['./tests/setup.ts'],
};

export default config;
```

---

## Unit Testing

```typescript
// src/user/user.service.ts
export class UserService {
  constructor(
    private repo: UserRepository,
    private mailer: EmailService,
    private logger: Logger
  ) {}

  async createUser(data: CreateUserDto): Promise<User> {
    const existing = await this.repo.findByEmail(data.email);
    if (existing) throw new ConflictError('Email already exists');

    const user = await this.repo.save(data);
    await this.mailer.sendWelcome(user.email);
    this.logger.info('User created', { userId: user.id });
    return user;
  }
}

// tests/user/user.service.test.ts
import { UserService } from '../../src/user/user.service';
import { ConflictError } from '../../src/errors';

describe('UserService', () => {
  let service: UserService;
  let mockRepo: jest.Mocked<UserRepository>;
  let mockMailer: jest.Mocked<EmailService>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    // Create mocks:
    mockRepo = {
      findByEmail: jest.fn(),
      save: jest.fn(),
      findById: jest.fn(),
    } as jest.Mocked<UserRepository>;

    mockMailer = { sendWelcome: jest.fn() } as jest.Mocked<EmailService>;
    mockLogger = { info: jest.fn(), error: jest.fn() } as jest.Mocked<Logger>;

    service = new UserService(mockRepo, mockMailer, mockLogger);
  });

  describe('createUser', () => {
    const userData = { name: 'Alice', email: 'alice@example.com' };
    const savedUser = { id: '1', ...userData };

    it('creates and returns a new user', async () => {
      mockRepo.findByEmail.mockResolvedValue(null); // no existing user
      mockRepo.save.mockResolvedValue(savedUser);
      mockMailer.sendWelcome.mockResolvedValue(undefined);

      const result = await service.createUser(userData);

      expect(result).toEqual(savedUser);
      expect(mockRepo.save).toHaveBeenCalledWith(userData);
      expect(mockMailer.sendWelcome).toHaveBeenCalledWith(savedUser.email);
      expect(mockLogger.info).toHaveBeenCalledWith('User created', { userId: '1' });
    });

    it('throws ConflictError if email exists', async () => {
      mockRepo.findByEmail.mockResolvedValue(savedUser); // user exists

      await expect(service.createUser(userData))
        .rejects.toThrow(ConflictError);

      expect(mockRepo.save).not.toHaveBeenCalled();
      expect(mockMailer.sendWelcome).not.toHaveBeenCalled();
    });

    it('propagates repository errors', async () => {
      mockRepo.findByEmail.mockResolvedValue(null);
      mockRepo.save.mockRejectedValue(new Error('DB connection failed'));

      await expect(service.createUser(userData))
        .rejects.toThrow('DB connection failed');
    });
  });
});
```

---

## Mocking Strategies

```typescript
// 1. jest.fn() — mock individual functions
const fn = jest.fn().mockReturnValue(42);
const asyncFn = jest.fn().mockResolvedValue({ data: [] });
const failFn = jest.fn().mockRejectedValue(new Error('fail'));

// Check calls:
expect(fn).toHaveBeenCalled();
expect(fn).toHaveBeenCalledTimes(2);
expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
expect(fn).toHaveBeenLastCalledWith('arg1');

// 2. jest.mock() — mock entire module
jest.mock('../../src/database', () => ({
  query: jest.fn().mockResolvedValue([]),
  transaction: jest.fn().mockImplementation(async (fn) => fn({})),
}));

// 3. jest.spyOn() — spy on existing method (can restore)
const spy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
// ... test code ...
spy.mockRestore(); // restore original

// 4. Manual mock — create __mocks__ directory
// src/__mocks__/email.service.ts:
export const EmailService = jest.fn().mockImplementation(() => ({
  sendWelcome: jest.fn().mockResolvedValue(undefined),
}));

// 5. Mock modules with factory:
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('fake-token'),
  verify: jest.fn().mockReturnValue({ sub: 'user-1', role: 'admin' }),
}));
```

---

## Integration Testing with Supertest

```typescript
// tests/integration/user.routes.test.ts
import request from 'supertest';
import { createApp } from '../../src/app';
import { db } from '../../src/database';

describe('User Routes', () => {
  let app: Express;

  beforeAll(async () => {
    app = createApp();
    await db.migrate.latest();
    await db.seed.run();
  });

  afterAll(async () => {
    await db.migrate.rollback();
    await db.destroy();
  });

  beforeEach(async () => {
    await db('users').truncate(); // clean state per test
  });

  describe('POST /users', () => {
    it('creates a user and returns 201', async () => {
      const response = await request(app)
        .post('/users')
        .send({ name: 'Alice', email: 'alice@example.com' })
        .expect(201);

      expect(response.body.data).toMatchObject({
        id: expect.any(String),
        name: 'Alice',
        email: 'alice@example.com',
      });
    });

    it('returns 422 for invalid email', async () => {
      const response = await request(app)
        .post('/users')
        .send({ name: 'Alice', email: 'not-an-email' })
        .expect(422);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('returns 409 for duplicate email', async () => {
      await request(app).post('/users').send({ name: 'Alice', email: 'alice@example.com' });

      await request(app)
        .post('/users')
        .send({ name: 'Alice2', email: 'alice@example.com' })
        .expect(409);
    });
  });

  describe('GET /users/:id', () => {
    it('returns 401 without auth token', async () => {
      await request(app).get('/users/1').expect(401);
    });

    it('returns user for valid token', async () => {
      const { body: { data: user } } = await request(app)
        .post('/users')
        .send({ name: 'Alice', email: 'alice@example.com' });

      const { body: loginResponse } = await request(app)
        .post('/auth/login')
        .send({ email: 'alice@example.com', password: 'password123' });

      await request(app)
        .get(`/users/${user.id}`)
        .set('Authorization', `Bearer ${loginResponse.data.token}`)
        .expect(200);
    });
  });
});
```

---

## Testing Async Code

```typescript
// Promises:
it('resolves with user data', async () => {
  const user = await userService.getUser('1');
  expect(user.name).toBe('Alice');
});

it('rejects with error', async () => {
  await expect(userService.getUser('nonexistent'))
    .rejects.toThrow(NotFoundError);
});

// Callbacks (use done):
it('calls callback with data', (done) => {
  legacyFn('arg', (err, result) => {
    expect(err).toBeNull();
    expect(result).toBe(42);
    done();
  });
});

// Timers (fake timers):
jest.useFakeTimers();

it('calls debounced function after delay', () => {
  const fn = jest.fn();
  const debounced = debounce(fn, 1000);

  debounced();
  debounced();
  debounced();

  expect(fn).not.toHaveBeenCalled(); // not yet

  jest.advanceTimersByTime(1000);

  expect(fn).toHaveBeenCalledTimes(1); // called once
});

afterEach(() => {
  jest.useRealTimers();
});
```

---

## Test Quality Patterns

```typescript
// Good: descriptive names, single assertion per test concept
describe('PasswordValidator', () => {
  it('accepts passwords with 8+ characters, number, and special char', () => {
    expect(validate('P@ssw0rd!')).toBe(true);
  });
  it('rejects passwords shorter than 8 characters', () => {
    expect(validate('Ab1!')).toBe(false);
  });
  it('rejects passwords without numbers', () => {
    expect(validate('Password!')).toBe(false);
  });
});

// Parameterized tests (test.each):
test.each([
  ['abc123', false, 'no special char'],
  ['abcDEF!', false, 'no number'],
  ['Ab1!', false, 'too short'],
  ['Abc123!@', true, 'valid'],
])('validate(%s) = %s (%s)', (password, expected) => {
  expect(validate(password)).toBe(expected);
});

// Test isolation — use beforeEach/afterEach, not shared state
// Avoid test order dependency — each test should be independent
// Use realistic test data — not just 'foo', 'bar', '1', '2'
```

---

## Interview Questions

**Q: What is the difference between unit, integration, and E2E tests?**
A: Unit tests test a single function/class in isolation with all dependencies mocked — fast, many of them. Integration tests test multiple components together (real DB, real HTTP) — slower, fewer. E2E tests test the full system through the user interface — slowest, fewest. The testing pyramid: many unit, some integration, few E2E.

**Q: How do you test code that calls a database?**
A: Unit tests: mock the repository/database client — test business logic in isolation. Integration tests: use a real test database (Docker, TestContainers), run migrations, clean state between tests, test actual DB interactions. Never share state between tests — each test should set up its own data.

**Q: What is the difference between `jest.fn()`, `jest.mock()`, and `jest.spyOn()`?**
A: `jest.fn()` creates a standalone mock function with no original implementation. `jest.mock('module')` replaces an entire module with mocks — affects all files that import it. `jest.spyOn(obj, 'method')` replaces a method on an existing object with a spy but keeps the original implementation by default — useful when you want to verify calls but still run the real code.

**Q: How do you test for errors in async functions?**
A: Use `await expect(asyncFn()).rejects.toThrow(ErrorType)`. Don't use try/catch in tests unless testing the catch block itself — it can hide uncaught errors. If you expect a rejection but it resolves, the test passes (silently wrong). The `rejects` matcher ensures the test fails if the promise resolves unexpectedly.
