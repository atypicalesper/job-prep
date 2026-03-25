# Next.js Architecture & Production Patterns

## Feature-Based Folder Structure

A feature-based folder structure organizes code by domain (what it does) rather than by file type (what kind of file it is). Instead of a top-level `components/` that holds components for every feature and a top-level `hooks/` that mixes unrelated logic, each feature gets its own directory containing all the files it needs — components, server actions, query functions, and validation schemas. This makes features self-contained: you can understand, test, and eventually extract a feature without hunting across multiple top-level directories. The `app/` directory remains thin, containing only routing files (`page.tsx`, `layout.tsx`) that import from `features/`.

```
src/
├── app/                          ← Routing only (page.tsx, layout.tsx, etc.)
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx            ← App shell (nav, sidebar)
│   │   ├── dashboard/page.tsx
│   │   └── posts/
│   │       ├── page.tsx
│   │       ├── [slug]/page.tsx
│   │       └── new/page.tsx
│   ├── api/
│   │   └── [...route]/route.ts
│   └── layout.tsx                ← Root layout
│
├── features/                     ← Feature modules (domain logic lives here)
│   ├── auth/
│   │   ├── actions.ts            ← Server Actions
│   │   ├── components/           ← Auth-specific UI
│   │   ├── hooks/                ← useSession wrapper etc.
│   │   └── lib/                  ← Auth utilities
│   ├── posts/
│   │   ├── actions.ts
│   │   ├── components/
│   │   │   ├── PostCard.tsx
│   │   │   ├── PostList.tsx
│   │   │   └── PostEditor.tsx
│   │   ├── hooks/
│   │   └── lib/
│   │       ├── queries.ts        ← DB query functions
│   │       └── validations.ts    ← Zod schemas
│   └── users/
│       ├── actions.ts
│       └── components/
│
├── components/                   ← Shared/generic UI
│   └── ui/                       ← Design system primitives
│       ├── Button.tsx
│       ├── Input.tsx
│       └── Modal.tsx
│
├── lib/                          ← Shared utilities
│   ├── db.ts                     ← Prisma client singleton
│   ├── auth.ts                   ← NextAuth config
│   └── utils.ts                  ← cn(), formatDate(), etc.
│
└── types/                        ← Global TypeScript types
    └── index.ts
```

**Rule:** `app/` routes import from `features/`. `features/` are self-contained. `components/ui/` has no business logic.

---

## Data Layer Separation

Separating your data access logic into a dedicated layer (query functions in `features/*/lib/queries.ts`) provides a single, canonical place to write and optimize database queries. Pages and Server Actions import from this layer instead of writing inline queries — this prevents the same query from being implemented slightly differently in three places, and makes it easy to add caching, logging, or pagination in one spot. Wrapping queries with React's `cache()` ensures deduplication within a render pass — if two Server Components in the same tree call `getPost(slug)`, the database is queried only once.

```ts
// features/posts/lib/queries.ts
// ALL database access lives here — pages/actions import from this file

import { db } from '@/lib/db';
import { cache } from 'react';

export const getPost = cache(async (slug: string) => {
  return db.post.findUnique({
    where: { slug },
    include: { author: { select: { name: true, image: true } } },
  });
});

export async function getPosts({
  page = 1,
  limit = 10,
  authorId,
}: {
  page?: number;
  limit?: number;
  authorId?: string;
} = {}) {
  const [posts, total] = await Promise.all([
    db.post.findMany({
      where: { published: true, ...(authorId && { authorId }) },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { author: { select: { name: true } } },
    }),
    db.post.count({
      where: { published: true, ...(authorId && { authorId }) },
    }),
  ]);

  return { posts, total, pages: Math.ceil(total / limit) };
}
```

```ts
// features/posts/actions.ts
'use server';
import { requireAuth } from '@/lib/auth';
import { createPostSchema } from './lib/validations';
import { revalidatePath } from 'next/cache';

export async function createPost(prevState: unknown, formData: FormData) {
  const session = await requireAuth();

  const result = createPostSchema.safeParse(Object.fromEntries(formData));
  if (!result.success) return { errors: result.error.flatten().fieldErrors };

  await db.post.create({
    data: { ...result.data, authorId: session.user.id },
  });

  revalidatePath('/posts');
  redirect('/posts');
}
```

---

## Prisma Singleton (prevent connection pool exhaustion)

In Next.js development, the module system is re-evaluated on every hot reload. If `PrismaClient` were instantiated at module scope without any guard, each hot reload would create a new client with its own connection pool — eventually exhausting PostgreSQL's `max_connections` limit. The singleton pattern uses `globalThis` (which persists across module re-evaluations in the same Node.js process) to store the single PrismaClient instance and reuse it on subsequent reloads. In production there are no hot reloads, so this is purely a development concern, but the pattern is safe in both environments.

```ts
// lib/db.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
```

**Why:** In development, Next.js hot-reloads modules. Without this singleton, each reload creates a new PrismaClient and new connection pool, eventually exhausting database connections.

---

## Environment Variables

Next.js has a tiered environment variable system that controls what code can access what secrets. Variables without a prefix are server-only — they are never bundled into client-side code and are safe for database URLs, API secrets, and auth keys. Variables prefixed with `NEXT_PUBLIC_` are deliberately exposed to the browser — use these only for non-sensitive values like your public API base URL or analytics IDs. The `.env.local` file holds actual secrets and must never be committed; `.env.example` documents the shape of required variables (with empty values) and is committed as a reference for other developers.

```bash
# .env.local (never commit)
DATABASE_URL="postgresql://user:pass@localhost:5432/mydb"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"
NEXTAUTH_URL="http://localhost:3000"
GITHUB_ID="..."
GITHUB_SECRET="..."

# .env.example (commit this — documents required vars)
DATABASE_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
GITHUB_ID=
GITHUB_SECRET=
```

### Type-safe env validation

Environment variables are untyped strings by default — a missing variable silently becomes `undefined` and only fails at the point of use, often deep in a request handler. Validating the entire environment with a Zod schema at startup changes this: if any required variable is missing or malformed, the server refuses to start and throws a descriptive error immediately. This converts runtime surprises into a clear startup failure. The `NEXT_PUBLIC_` prefix variables must be listed explicitly in the schema because Tailwind's tree-shaking only inlines them at build time.

```ts
// lib/env.ts
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32),
  NEXTAUTH_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'test', 'production']),
  // NEXT_PUBLIC_ vars are exposed to the browser
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

export const env = envSchema.parse(process.env);
// Throws at startup if any env var is missing/invalid
```

---

## Error Boundaries

An error boundary is a React component that catches JavaScript errors anywhere in its child component tree and renders a fallback UI instead of crashing the whole page. In Next.js, `error.tsx` files provide file-system-level error boundaries — each one catches errors from the route segment it lives in (and all its children) while leaving the rest of the layout intact. The `reset` function tells React to retry rendering the segment; if the error was transient (a network blip, a race condition), this often recovers without a full page reload. The `digest` property on the error is a server-side hash useful for correlating client-side errors with server logs.

```tsx
// app/error.tsx — catches all unhandled errors in the subtree
'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Report to Sentry/Datadog
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
      <p className="text-gray-500 mb-4">{error.message}</p>
      <button onClick={reset} className="btn-primary">
        Try again
      </button>
    </div>
  );
}
```

---

## Loading UI Hierarchy

Loading UI in Next.js is defined through the `loading.tsx` file convention, which creates implicit `<Suspense>` boundaries at each route segment level. The hierarchy mirrors the route segment hierarchy — a `loading.tsx` inside `dashboard/` shows while the dashboard page loads, and a `loading.tsx` inside `dashboard/analytics/` shows only while that sub-page loads, without affecting the parent dashboard layout. This means you can have granular, context-appropriate loading states at each level of your app without manually wrapping each page in `<Suspense>`.

```
app/
├── loading.tsx          ← Global loading (rare)
├── dashboard/
│   ├── loading.tsx      ← Shows while /dashboard page loads
│   ├── page.tsx
│   └── analytics/
│       ├── loading.tsx  ← Shows while /dashboard/analytics loads
│       └── page.tsx
```

The file-based `loading.tsx` is just syntactic sugar for wrapping `page.tsx` in a `<Suspense>`.

---

## API Layer Pattern (when you need it)

Use Route Handlers when:
- Building a public API consumed by mobile/external clients
- Webhooks (Stripe, GitHub)
- File uploads
- Non-form data (binary, streaming)

For Next.js-internal mutations (forms, data changes triggered by users within the app), prefer Server Actions — they require less code and have CSRF protection built in. Route Handlers are the right tool when you need a stable, versioned HTTP interface that external systems will call, or when you're handling requests that don't originate from a form action. The handler below shows the standard pattern: authenticate, validate input with Zod, query the data layer, and return a typed JSON response.

```ts
// app/api/posts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPosts } from '@/features/posts/lib/queries';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const page = Number(searchParams.get('page') ?? 1);

  const result = await getPosts({ page });
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const result = createPostSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ errors: result.error.flatten() }, { status: 422 });
  }

  const post = await db.post.create({ data: { ...result.data, authorId: session.user.id } });
  return NextResponse.json(post, { status: 201 });
}
```

---

## Production Checklist

A production checklist is a pre-deployment sanity check that covers the categories where Next.js apps most commonly fail: security (leaked secrets, unauthenticated mutations), performance (accidentally dynamic pages, unoptimized assets), reliability (missing error boundaries, unhandled 404s), and observability (no way to diagnose issues after they happen). Running through this list before every deploy prevents the class of bugs that are hard to reproduce locally but appear immediately under real traffic.

```
Security:
✅ NEXTAUTH_SECRET set (min 32 chars, random)
✅ All secrets in env vars, not hardcoded
✅ Server Actions authenticate and authorize before mutations
✅ Zod validation on ALL server-side inputs
✅ CSP headers configured (next.config.js headers())
✅ Rate limiting on auth endpoints

Performance:
✅ Static/ISR for public pages (not force-dynamic everywhere)
✅ Images using next/image with correct sizes
✅ Fonts using next/font
✅ Bundle analyzer run — no surprise large packages
✅ Database: Prisma singleton, no N+1 queries (use include or select)

Reliability:
✅ error.tsx at app root
✅ loading.tsx for slow routes
✅ not-found.tsx
✅ Environment variable validation at startup (Zod)
✅ Database connection pooling (PgBouncer for serverless)

Observability:
✅ Error reporting (Sentry)
✅ Logging (structured JSON in production)
✅ Health check endpoint (/api/health)
```

---

## Interview Questions

**Q: How do you avoid N+1 queries in a Next.js app with Prisma?**
Use `include` or `select` to fetch related data in one query instead of a loop. Use `react`'s `cache()` to deduplicate identical queries in the same render. For complex aggregations, use Prisma's `$transaction` or raw SQL. Avoid fetching in component loops.

**Q: Why use feature-based folder structure over file-type-based?**
File-type folders (`components/`, `hooks/`, `utils/`) scatter related code. When you need to delete a feature, you're hunting across 5 folders. Feature folders keep everything for one domain together — cohesion. At scale, features can be extracted to packages without restructuring.

**Q: How do you handle database migrations in production?**
`prisma migrate deploy` (not `dev`) applies pending migrations without interactivity. Run it in your deployment step before starting the server (entrypoint script or CI step). Never run `migrate dev` in production — it generates migrations and runs them, which is dangerous.

**Q: What's the Prisma singleton pattern for and when do you need it?**
Next.js hot-reload creates new module instances in development. Without a singleton, each hot-reload creates a new PrismaClient with a new connection pool, quickly exhausting PostgreSQL's max_connections. The singleton uses `globalThis` to persist the instance across hot-reloads. In production this isn't needed (no hot-reload), but the pattern works for both.
