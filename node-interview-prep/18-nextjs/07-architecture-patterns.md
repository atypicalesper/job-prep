# Next.js Architecture & Production Patterns

## Feature-Based Folder Structure

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
