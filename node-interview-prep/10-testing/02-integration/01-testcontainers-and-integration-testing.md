# Integration Testing with Testcontainers

Unit tests mock dependencies. Integration tests use REAL databases, Redis, Kafka.
Testcontainers spins up Docker containers programmatically for tests.

---

## Why Integration Tests?

```
Unit test:       fast, isolated, mocks DB → doesn't catch SQL bugs, migration errors
Integration test: real DB → catches query errors, constraint violations, index issues
E2E test:        full stack → slow, flaky, expensive

Sweet spot for backend: integration tests hitting real DB/Redis in Docker.

Testcontainers:
  - Spins up a real PostgreSQL/Redis/Kafka container for your tests
  - Container starts before tests, cleans up after
  - Each test suite gets a fresh container (or shared with truncation between tests)
  - Works with Jest, Mocha, Vitest
```

---

## Setup

```bash
npm install --save-dev @testcontainers/postgresql @testcontainers/redis
# or the core package:
npm install --save-dev testcontainers
```

```typescript
// jest.integration.config.ts
export default {
  preset: 'ts-jest',
  testMatch: ['**/*.integration.test.ts'],
  testTimeout: 60_000,       // containers take time to start
  globalSetup: './src/test/global-setup.ts',
  globalTeardown: './src/test/global-teardown.ts',
  setupFilesAfterFramework: ['./src/test/setup.ts'],
  // Run integration tests serially (less flakiness):
  maxWorkers: 1,
};
```

---

## PostgreSQL Integration Tests

```typescript
// src/test/global-setup.ts
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'child_process';

let container: StartedPostgreSqlContainer;

export default async function globalSetup() {
  container = await new PostgreSqlContainer('postgres:15-alpine')
    .withDatabase('testdb')
    .withUsername('testuser')
    .withPassword('testpass')
    .withReuse()          // reuse container across test runs if still running
    .start();

  // Expose connection string to tests via environment:
  process.env.DATABASE_URL = container.getConnectionUri();

  // Run migrations against the test DB:
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: container.getConnectionUri() },
  });

  // Store reference for teardown:
  (global as any).__PG_CONTAINER__ = container;
}

// src/test/global-teardown.ts
export default async function globalTeardown() {
  await (global as any).__PG_CONTAINER__?.stop();
}

// src/test/setup.ts — runs before each test file:
import { pool } from '../db/pool';

beforeEach(async () => {
  // Clean all tables between tests (faster than container restart):
  await pool.query(`
    TRUNCATE TABLE orders, users, products RESTART IDENTITY CASCADE
  `);
});

afterAll(async () => {
  await pool.end();
});
```

### Testing a Repository with Real DB

```typescript
// src/users/user.repository.ts
export class UserRepository {
  constructor(private readonly db: Pool) {}

  async create(data: { name: string; email: string }): Promise<User> {
    const result = await this.db.query(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
      [data.name, data.email]
    );
    return result.rows[0];
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.db.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0] ?? null;
  }

  async findWithOrders(userId: number): Promise<UserWithOrders | null> {
    const result = await this.db.query(`
      SELECT u.*, json_agg(o.*) FILTER (WHERE o.id IS NOT NULL) AS orders
      FROM users u
      LEFT JOIN orders o ON o.user_id = u.id
      WHERE u.id = $1
      GROUP BY u.id
    `, [userId]);
    return result.rows[0] ?? null;
  }
}

// src/users/user.repository.integration.test.ts
import { Pool } from 'pg';
import { UserRepository } from './user.repository';

describe('UserRepository', () => {
  let repo: UserRepository;
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    repo = new UserRepository(pool);
  });

  afterAll(() => pool.end());

  describe('create', () => {
    it('creates a user and returns it with an id', async () => {
      const user = await repo.create({
        name: 'Alice',
        email: 'alice@example.com',
      });

      expect(user.id).toBeDefined();
      expect(user.name).toBe('Alice');
      expect(user.email).toBe('alice@example.com');
      expect(user.created_at).toBeInstanceOf(Date);
    });

    it('throws on duplicate email (unique constraint)', async () => {
      await repo.create({ name: 'Bob', email: 'bob@example.com' });

      await expect(
        repo.create({ name: 'Bob2', email: 'bob@example.com' })
      ).rejects.toThrow(/unique/i);  // PostgreSQL constraint error
    });
  });

  describe('findByEmail', () => {
    it('returns null for nonexistent email', async () => {
      const result = await repo.findByEmail('nobody@example.com');
      expect(result).toBeNull();
    });

    it('finds an existing user', async () => {
      await repo.create({ name: 'Carol', email: 'carol@example.com' });
      const found = await repo.findByEmail('carol@example.com');
      expect(found?.name).toBe('Carol');
    });
  });

  describe('findWithOrders', () => {
    it('returns user with empty orders array when no orders', async () => {
      const user = await repo.create({ name: 'Dave', email: 'dave@example.com' });
      const result = await repo.findWithOrders(user.id);

      expect(result).not.toBeNull();
      expect(result!.orders).toEqual([]);  // no orders → null filtered → empty array
    });
  });
});
```

---

## Redis Integration Tests

```typescript
// src/test/redis-setup.ts
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { createClient } from 'redis';

let redisContainer: StartedRedisContainer;

export async function startRedis() {
  redisContainer = await new RedisContainer('redis:7-alpine')
    .withReuse()
    .start();

  process.env.REDIS_URL = redisContainer.getConnectionUrl();
  return redisContainer;
}

export async function stopRedis() {
  await redisContainer?.stop();
}

// src/cache/cache.service.integration.test.ts
import { createClient } from 'redis';
import { CacheService } from './cache.service';

describe('CacheService', () => {
  let redis: ReturnType<typeof createClient>;
  let cache: CacheService;

  beforeAll(async () => {
    redis = createClient({ url: process.env.REDIS_URL });
    await redis.connect();
    cache = new CacheService(redis);
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    await redis.flushDb();  // clean slate between tests
  });

  it('stores and retrieves a value', async () => {
    await cache.set('key', { data: 42 }, 60);
    const value = await cache.get('key');
    expect(value).toEqual({ data: 42 });
  });

  it('returns null for expired key', async () => {
    await cache.set('expiring', 'value', 1);  // 1 second TTL
    await new Promise(r => setTimeout(r, 1500));
    const value = await cache.get('expiring');
    expect(value).toBeNull();
  });

  it('returns null for nonexistent key', async () => {
    const value = await cache.get('doesnotexist');
    expect(value).toBeNull();
  });

  it('deletes a key', async () => {
    await cache.set('toDelete', 'value', 60);
    await cache.del('toDelete');
    expect(await cache.get('toDelete')).toBeNull();
  });
});
```

---

## HTTP API Integration Tests (Supertest + Real DB)

```typescript
// src/app.integration.test.ts
import request from 'supertest';
import { app } from './app';           // your Express app
import { pool } from './db/pool';
import { redis } from './redis/client';

describe('POST /users', () => {
  it('creates a user and returns 201', async () => {
    const res = await request(app)
      .post('/users')
      .send({ name: 'Alice', email: 'alice@test.com' })
      .expect(201);

    expect(res.body).toMatchObject({
      id: expect.any(Number),
      name: 'Alice',
      email: 'alice@test.com',
    });

    // Verify it's actually in the DB:
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      ['alice@test.com']
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Alice');
  });

  it('returns 409 on duplicate email', async () => {
    await request(app)
      .post('/users')
      .send({ name: 'Alice', email: 'dup@test.com' })
      .expect(201);

    await request(app)
      .post('/users')
      .send({ name: 'Alice2', email: 'dup@test.com' })
      .expect(409);
  });

  it('returns 400 on invalid email', async () => {
    const res = await request(app)
      .post('/users')
      .send({ name: 'Alice', email: 'not-an-email' })
      .expect(400);

    expect(res.body.error).toBeDefined();
  });
});

describe('GET /users/:id', () => {
  it('returns 404 for nonexistent user', async () => {
    await request(app).get('/users/999999').expect(404);
  });

  it('returns the user with their orders', async () => {
    // Seed:
    const { rows: [user] } = await pool.query(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id',
      ['Bob', 'bob@test.com']
    );
    await pool.query(
      'INSERT INTO orders (user_id, amount) VALUES ($1, $2)',
      [user.id, 99.99]
    );

    const res = await request(app).get(`/users/${user.id}`).expect(200);
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.orders[0].amount).toBe('99.99');
  });
});
```

---

## Testing Transactions and Concurrent Access

```typescript
describe('Race condition: concurrent user creation', () => {
  it('handles concurrent creates with same email gracefully', async () => {
    const email = 'concurrent@test.com';

    // Fire 5 concurrent requests with same email:
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        request(app).post('/users').send({ name: 'Test', email })
      )
    );

    const successes = results.filter(
      r => r.status === 'fulfilled' && r.value.status === 201
    );
    const conflicts = results.filter(
      r => r.status === 'fulfilled' && r.value.status === 409
    );

    // Exactly one should succeed, rest should conflict:
    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(4);

    // Verify only one row in DB:
    const { rows } = await pool.query(
      'SELECT COUNT(*) FROM users WHERE email = $1',
      [email]
    );
    expect(Number(rows[0].count)).toBe(1);
  });
});

describe('Transaction rollback on error', () => {
  it('rolls back partial changes on failure', async () => {
    // Seed a user:
    const { rows: [user] } = await pool.query(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id',
      ['Alice', 'alice-tx@test.com']
    );

    // Simulate a failing transaction:
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE users SET name = $1 WHERE id = $2', ['Changed', user.id]);
      await client.query('SELECT 1/0');  // will throw division by zero
      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    // Verify name wasn't changed:
    const { rows } = await pool.query(
      'SELECT name FROM users WHERE id = $1',
      [user.id]
    );
    expect(rows[0].name).toBe('Alice');  // unchanged
  });
});
```

---

## Testing with Prisma

```typescript
// When using Prisma, use DATABASE_URL env var pointing to test container.
// Prisma creates its own connection pool — just set the env var.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
  log: [],  // silence logs in tests
});

beforeEach(async () => {
  // Order matters — delete child tables before parent:
  await prisma.$transaction([
    prisma.order.deleteMany(),
    prisma.user.deleteMany(),
  ]);
});

afterAll(async () => {
  await prisma.$disconnect();
});

it('creates and finds a user', async () => {
  const user = await prisma.user.create({
    data: { name: 'Alice', email: 'alice@test.com' },
  });

  const found = await prisma.user.findUnique({
    where: { email: 'alice@test.com' },
  });

  expect(found?.id).toBe(user.id);
});
```

---

## Test Database Strategies

```
Strategy 1: One container per test run (default)
  + Slowest to start but cleanest isolation
  + Each test run gets a fresh DB
  + Use: CI/CD pipelines

Strategy 2: Container reuse + truncation between tests (recommended)
  + Fast: container starts once, data cleared between tests
  + TRUNCATE ... RESTART IDENTITY CASCADE — reset IDs too
  + Use: local development, large test suites

Strategy 3: Transactions — rollback instead of truncate
  + Wrap each test in a transaction, rollback at end
  + Very fast — no actual writes hit disk
  + Works when your code doesn't manage transactions itself
  + Use: read-heavy test suites

  beforeEach(async () => {
    txClient = await pool.connect();
    await txClient.query('BEGIN');
    // Inject txClient into repository for this test
  });
  afterEach(async () => {
    await txClient.query('ROLLBACK');
    txClient.release();
  });

Strategy 4: Isolated schemas
  + Each test worker gets its own schema: CREATE SCHEMA test_worker_N
  + Allows parallel test runs against one container
  + Complex setup, but fast
```

---

## Common Interview Questions

**Q: Why use Testcontainers instead of mocking the DB?**
Mocks can't catch SQL syntax errors, constraint violations, index failures, or migration bugs. Real containers give you confidence that your queries actually work. Testcontainers makes real-DB tests almost as easy as mocking.

**Q: How do you keep integration tests fast?**
(1) Share one container per test suite (not per test), (2) truncate tables between tests instead of restarting the container, (3) run integration tests in a separate pass from unit tests, (4) use transactions and rollback for read-heavy suites.

**Q: What's the difference between integration and E2E tests?**
Integration tests: test one service with its real dependencies (DB, Redis) — no network calls to other services (mock those). E2E tests: full stack, real browser or API client, hitting a deployed environment. Integration tests are faster and more maintainable for backend services.

**Q: How do you test race conditions?**
Use `Promise.all` or `Promise.allSettled` to fire concurrent requests. Check that constraints (unique index, optimistic locks) hold. Verify the database state after. For distributed scenarios, you may need multiple service instances.
