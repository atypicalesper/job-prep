# ORM Patterns — Prisma, Sequelize, and the N+1 Problem

---

## Prisma — Modern TypeScript ORM

Prisma is a next-generation ORM for Node.js and TypeScript. Unlike traditional ORMs (Sequelize, TypeORM) that use active record or data mapper patterns with class decorations, Prisma uses a separate schema file (`schema.prisma`) as the single source of truth for your data model. Prisma generates a fully type-safe client from this schema — every query method, filter, and return type is inferred, so misspelled field names or wrong types are caught at compile time rather than runtime. The generated client is not a generic query builder; it is an API tailored to your exact schema.

```typescript
// schema.prisma:
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  posts     Post[]
  createdAt DateTime @default(now())
}

model Post {
  id        String   @id @default(cuid())
  title     String
  content   String
  published Boolean  @default(false)
  author    User     @relation(fields: [authorId], references: [id])
  authorId  String
  tags      Tag[]
}

// Basic CRUD:
const user = await prisma.user.create({
  data: { email: 'alice@example.com', name: 'Alice' }
});

const users = await prisma.user.findMany({
  where: { posts: { some: { published: true } } },
  orderBy: { createdAt: 'desc' },
  skip: 0,
  take: 20,
  include: { posts: { where: { published: true } } } // eager load
});

const updated = await prisma.user.update({
  where: { id: userId },
  data: { name: 'Alice Updated' }
});

// Upsert:
const user = await prisma.user.upsert({
  where: { email: 'alice@example.com' },
  create: { email: 'alice@example.com', name: 'Alice' },
  update: { name: 'Alice' }
});
```

---

## The N+1 Problem with ORMs

The N+1 problem is the most common ORM performance pitfall. It happens when you load a list of N parent records and then, inside a loop, issue a separate query for each parent's related data — resulting in N+1 total database queries instead of 1 or 2. ORMs make this easy to stumble into accidentally because lazy loading hides the query behind a simple property access. The fix is eager loading: tell the ORM to fetch the related data in the initial query using `include` (Prisma) or `include` (Sequelize), which generates an efficient `WHERE id IN (...)` query for all related records at once.

```typescript
// ❌ N+1 with Prisma — fetching posts for each user separately:
const users = await prisma.user.findMany(); // 1 query: SELECT * FROM users

for (const user of users) {
  // N queries: SELECT * FROM posts WHERE authorId = ?  (once per user!)
  const posts = await prisma.post.findMany({ where: { authorId: user.id } });
  console.log(`${user.name} has ${posts.length} posts`);
}

// ✅ Fix: eager loading with include
const users = await prisma.user.findMany({
  include: {
    posts: { where: { published: true } }
  }
  // Prisma generates: SELECT * FROM users + SELECT * FROM posts WHERE authorId IN (...)
  // 2 queries total regardless of user count!
});

// ✅ Fix: select only needed fields
const users = await prisma.user.findMany({
  select: {
    id: true,
    name: true,
    _count: { select: { posts: true } } // just the count, not all posts!
  }
});
```

---

## Transactions with Prisma

Prisma supports two transaction modes. The sequential (batch) transaction is simpler: pass an array of Prisma operations and they execute in a single database transaction — if any fails, all are rolled back. The interactive transaction gives you a transaction-scoped Prisma client (`tx`) that you use inside a callback, allowing you to run multiple queries and make decisions between them, such as reading a value and conditionally inserting based on it. If the callback throws, the transaction rolls back automatically.

```typescript
// Interactive transaction (can run queries between steps):
const result = await prisma.$transaction(async (tx) => {
  // tx is a Prisma client scoped to this transaction
  const user = await tx.user.create({ data: userData });

  const post = await tx.post.create({
    data: { ...postData, authorId: user.id }
  });

  // If anything throws, entire transaction rolls back
  await tx.userActivity.create({
    data: { userId: user.id, action: 'first_post', postId: post.id }
  });

  return { user, post };
});

// Sequential transaction (for simple atomic operations):
const [updatedUser, deletedPost] = await prisma.$transaction([
  prisma.user.update({ where: { id }, data: { name: 'New Name' } }),
  prisma.post.delete({ where: { id: postId } }),
]);
```

---

## Raw Queries (when ORM isn't enough)

ORMs are excellent for standard CRUD operations, but they struggle with complex analytics queries, window functions, `DISTINCT ON`, recursive CTEs, and database-specific features. When the ORM's query builder cannot express what you need — or generates inefficient SQL — drop to raw SQL. Prisma's tagged template literal syntax for `$queryRaw` automatically parameterizes interpolated values, preventing SQL injection. Never use string concatenation to build raw queries with user input.

```typescript
// Prisma raw SQL:
const users = await prisma.$queryRaw<User[]>`
  SELECT u.*, COUNT(p.id) as post_count
  FROM users u
  LEFT JOIN posts p ON u.id = p."authorId"
  WHERE u."createdAt" > ${cutoffDate}
  GROUP BY u.id
  HAVING COUNT(p.id) > 5
`;

// Parameterized (safe from SQL injection):
const email = req.body.email; // user input
const user = await prisma.$queryRaw`
  SELECT * FROM users WHERE email = ${email}
`; // ✅ Automatically parameterized

// Never: `SELECT * FROM users WHERE email = '${email}'` — injection!
```

---

## Connection Pooling

Opening a new database connection for each request is expensive — connections take 10–100ms to establish and consume server resources. A connection pool maintains a fixed set of open connections that are checked out for each query and returned when done. Prisma manages connection pooling automatically, sized via the `connection_limit` parameter in the connection string. The critical mistake in serverless/Next.js environments is instantiating a new `PrismaClient` on every request (hot reload recreates modules in development), which exhausts the connection pool. The singleton pattern shown below prevents this.

```typescript
// Prisma uses connection pool automatically
// Configure via DATABASE_URL:
// postgresql://user:pass@localhost:5432/db?connection_limit=10&pool_timeout=20

// Or in Prisma constructor:
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    }
  },
  log: ['query', 'warn', 'error'],  // log all queries (dev only!)
});

// Singleton pattern for application (avoid creating multiple instances):
// lib/prisma.ts
import { PrismaClient } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

const prisma = global.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma; // prevent new instances on hot reload in dev
}

export default prisma;
```

---

## Sequelize (Traditional ORM)

Sequelize is a mature, battle-tested ORM for Node.js supporting PostgreSQL, MySQL, SQLite, and MSSQL. It uses an active record-style pattern: models are classes that represent tables, with methods for CRUD operations defined directly on the class. Associations (`hasMany`, `belongsTo`, etc.) define the relationships between models and enable eager loading via `include`. Compared to Prisma, Sequelize is less type-safe out of the box, has a larger surface area of methods to learn, and requires more manual work for TypeScript integration — but it is more flexible and supports a wider range of advanced SQL patterns.

```javascript
const { Sequelize, DataTypes } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  pool: { max: 10, min: 2, acquire: 30000, idle: 10000 },
  logging: false // disable query logging in production
});

const User = sequelize.define('User', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true }
}, { timestamps: true });

const Post = sequelize.define('Post', {
  title: DataTypes.STRING,
  content: DataTypes.TEXT
});

User.hasMany(Post, { foreignKey: 'authorId' });
Post.belongsTo(User, { foreignKey: 'authorId' });

// N+1 FIX with Sequelize: use include (eager loading)
const users = await User.findAll({
  include: [{ model: Post, where: { published: true }, required: false }]
  // Generates: SELECT ... FROM users LEFT JOIN posts ON ...
});
```

---

## Migration Patterns

A database migration is a versioned, incremental change to the schema that is tracked alongside your application code. Migrations allow teams to evolve the database schema in a controlled, reproducible way — each developer and each environment applies the same sequence of changes. Prisma generates migration files automatically from schema diffs (`prisma migrate dev`), which are SQL files that can be reviewed, committed to git, and applied idempotently in production (`prisma migrate deploy`). The `db push` command skips migration files entirely and is only appropriate for prototyping in development.

```bash
# Prisma migrations:
npx prisma migrate dev --name add_user_role    # create + apply in dev
npx prisma migrate deploy                       # apply in production
npx prisma migrate status                       # check migration status
npx prisma db push                             # push schema without migration (dev only)

# Migration file example (auto-generated):
-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
```

---

## Interview Questions

**Q: What is the N+1 problem and how do ORMs cause it?**
A: When you fetch N records (1 query) then for each record fetch related data (N more queries) — total N+1. ORMs make this easy to do accidentally with lazy loading. Fix: eager loading (`include`/`with` in Prisma, `include` in Sequelize). The ORM then uses a single `WHERE id IN (...)` query for all related records instead of one per parent.

**Q: What is lazy loading vs eager loading?**
A: Lazy loading: related data fetched only when accessed — each access triggers a separate query. Simple to write but causes N+1. Eager loading: related data fetched in the initial query (or a follow-up batch query) — no additional queries per item. Use eager loading when you know you'll need the related data for all/most records.

**Q: What are the risks of using ORMs for complex queries?**
A: (1) Generated SQL may be suboptimal (unnecessary joins, missing indexes). (2) Abstraction hides query complexity — developers don't know what SQL is generated. (3) ORM features may not support all DB capabilities. (4) Complex queries become verbose and hard to read. Solution: use ORM for standard CRUD, raw SQL (`$queryRaw`) for complex reports/analytics. Always check with `EXPLAIN ANALYZE` for slow queries.

**Q: How do you prevent SQL injection with ORMs?**
A: ORM methods (`findMany`, `create`) automatically use parameterized queries — safe by default. For raw queries, use template literals (Prisma's `` $queryRaw`...${variable}` ``) which are automatically parameterized. NEVER string-concatenate user input into raw query strings.
