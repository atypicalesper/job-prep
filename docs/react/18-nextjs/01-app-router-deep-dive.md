# Next.js App Router — Deep Dive

## Pages Router vs App Router

| Feature | Pages Router (`/pages`) | App Router (`/app`) |
|---------|------------------------|---------------------|
| Default component type | Client Component | **Server Component** |
| Data fetching | `getServerSideProps`, `getStaticProps` | `async/await` in component |
| Layouts | `_app.tsx` (global only) | Nested layouts per route |
| Streaming | No | Yes (Suspense) |
| Server Actions | No | Yes |
| Metadata API | `<Head>` | `export const metadata` |
| React version | React 17+ | React 18+ |

---

## File System Conventions

```
app/
├── layout.tsx          ← Root layout (required)
├── page.tsx            ← / route
├── loading.tsx         ← Suspense fallback for this segment
├── error.tsx           ← Error boundary for this segment
├── not-found.tsx       ← 404 for this segment
├── template.tsx        ← Like layout but re-mounts on navigate
├── (marketing)/        ← Route group (no URL segment)
│   ├── about/page.tsx  ← /about
│   └── blog/page.tsx   ← /blog
├── dashboard/
│   ├── layout.tsx      ← Nested layout (wraps all dashboard routes)
│   ├── page.tsx        ← /dashboard
│   ├── [id]/
│   │   └── page.tsx    ← /dashboard/[id]
│   └── [...slug]/
│       └── page.tsx    ← /dashboard/a/b/c (catch-all)
└── api/
    └── users/
        └── route.ts    ← API route handler
```

---

## Layouts & Templates

### Root Layout (required)
```tsx
// app/layout.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { template: '%s | My App', default: 'My App' },
  description: 'My application',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>...</nav>
        {children}  {/* page or nested layout */}
        <footer>...</footer>
      </body>
    </html>
  );
}
```

### Nested Layout — Shared UI per route segment
```tsx
// app/dashboard/layout.tsx
// Renders for /dashboard, /dashboard/*, etc.
// Does NOT re-render when navigating between child routes
export default function DashboardLayout({ children }) {
  return (
    <div className="dashboard">
      <Sidebar />       {/* persists across dashboard routes */}
      <main>{children}</main>
    </div>
  );
}
```

### Template vs Layout
```tsx
// template.tsx — re-mounts on EVERY navigation (new instance)
// Use when you need fresh state/effects per page visit
// Layout persists → Template re-mounts

export default function Template({ children }) {
  // useEffect here runs on every navigation (unlike layout)
  return <div>{children}</div>;
}
```

### Route Groups — Organize without affecting URL
```
app/
├── (auth)/
│   ├── layout.tsx     ← Layout only for auth routes
│   ├── login/page.tsx ← /login (not /auth/login)
│   └── register/page.tsx
├── (dashboard)/
│   ├── layout.tsx     ← Different layout for dashboard
│   └── home/page.tsx  ← /home
```

---

## Data Fetching

### Server Component (default — no boilerplate)
```tsx
// app/users/page.tsx
// This is a Server Component by default
async function UsersPage() {
  // Direct DB access — no API round trip
  const users = await db.user.findMany();

  // Or fetch from external API
  const data = await fetch('https://api.example.com/users', {
    next: { revalidate: 60 },  // ISR — cache for 60s
  }).then(r => r.json());

  return <UserList users={users} />;
}
```

### Parallel Data Fetching
```tsx
async function DashboardPage() {
  // Parallel — not sequential (no await waterfall)
  const [user, stats, notifications] = await Promise.all([
    getUser(),
    getStats(),
    getNotifications(),
  ]);

  return (
    <div>
      <UserCard user={user} />
      <StatsPanel stats={stats} />
      <NotificationBell count={notifications.unread} />
    </div>
  );
}
```

### Sequential with Suspense (streaming)
```tsx
// Stream each section as it resolves
async function DashboardPage() {
  // Await critical above-the-fold data immediately
  const user = await getUser();

  return (
    <div>
      <UserCard user={user} />

      {/* These stream in when ready */}
      <Suspense fallback={<StatsSkeleton />}>
        <Stats />           {/* fetches its own data */}
      </Suspense>

      <Suspense fallback={<FeedSkeleton />}>
        <ActivityFeed />    {/* fetches its own data */}
      </Suspense>
    </div>
  );
}

async function Stats() {
  const stats = await getStats();  // independent fetch
  return <StatsPanel stats={stats} />;
}
```

---

## Caching — The Most Complex Part of Next.js

Next.js 14/15 has 4 caching layers:

```
Request → Router Cache (client) → Full Route Cache (server)
              ↓                           ↓
         Data Cache ←──── fetch() ──── Request Memoization
```

### 1. Request Memoization
Same `fetch()` URL called multiple times in one render = deduplicated.

```tsx
// Both components fetch the same URL — only ONE HTTP request made
async function UserAvatar() {
  const user = await getUser(); // fetch('/api/user')
  return <img src={user.avatar} />;
}

async function UserName() {
  const user = await getUser(); // fetch('/api/user') — SAME cache, no extra request
  return <span>{user.name}</span>;
}
```

Only applies to the same render pass. Cleared between requests.

### 2. Data Cache (persistent)
`fetch()` results are cached between requests (like ISR for data).

```tsx
// Default: cache forever (static)
fetch('https://api.example.com/data');

// Revalidate after N seconds (ISR)
fetch('https://api.example.com/data', {
  next: { revalidate: 3600 },  // 1 hour
});

// Cache with tags (on-demand revalidation)
fetch('https://api.example.com/posts', {
  next: { tags: ['posts'] },
});

// No cache (always fresh = dynamic)
fetch('https://api.example.com/data', {
  cache: 'no-store',
});
```

### 3. Full Route Cache (static pages)
Entire routes can be rendered at build time and cached. Pages are static unless they opt out.

```tsx
// Force dynamic (no static cache)
export const dynamic = 'force-dynamic';

// Force static (prerender even with dynamic APIs)
export const dynamic = 'force-static';

// Revalidate entire route every N seconds (ISR)
export const revalidate = 3600;
```

### 4. Router Cache (client-side)
Prefetched routes cached in the browser for instant navigation. Auto-clears on navigation.

### On-Demand Revalidation

```tsx
// Server Action or Route Handler
import { revalidatePath, revalidateTag } from 'next/cache';

async function publishPost(id: string) {
  await db.post.update({ where: { id }, data: { published: true } });

  revalidatePath('/blog');           // clear specific path
  revalidatePath('/blog/[slug]', 'page'); // clear all pages of dynamic route
  revalidateTag('posts');            // clear all fetches tagged 'posts'
}
```

---

## Dynamic Routes & Params

```tsx
// app/posts/[slug]/page.tsx
interface Props {
  params: { slug: string };
  searchParams: { page?: string };
}

export default async function PostPage({ params, searchParams }: Props) {
  const post = await getPost(params.slug);
  const page = Number(searchParams.page ?? 1);
  return <Post post={post} page={page} />;
}

// Static generation: pre-render known slugs at build time
export async function generateStaticParams() {
  const posts = await db.post.findMany({ select: { slug: true } });
  return posts.map(p => ({ slug: p.slug }));
}

// Metadata per page
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPost(params.slug);
  return {
    title: post.title,
    openGraph: { images: [post.coverImage] },
  };
}
```

---

## Route Handlers (API Routes)

```tsx
// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = Number(searchParams.get('page') ?? 1);

  const users = await db.user.findMany({
    skip: (page - 1) * 20,
    take: 20,
  });

  return NextResponse.json({ data: users });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const validated = createUserSchema.parse(body);
  const user = await db.user.create({ data: validated });
  return NextResponse.json(user, { status: 201 });
}

// Dynamic route handler
// app/api/users/[id]/route.ts
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await db.user.findUnique({ where: { id: params.id } });
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(user);
}
```

---

## Middleware

Runs on the **Edge** before every request. Good for auth, redirects, A/B testing.

```ts
// middleware.ts (root of project)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from './lib/auth';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Auth protection
  if (pathname.startsWith('/dashboard')) {
    const token = request.cookies.get('token')?.value;

    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
      const payload = await verifyToken(token);
      // Inject user info into headers for server components
      const response = NextResponse.next();
      response.headers.set('x-user-id', payload.userId);
      return response;
    } catch {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // A/B testing
  if (pathname === '/') {
    const bucket = Math.random() < 0.5 ? 'a' : 'b';
    const response = NextResponse.rewrite(
      new URL(`/variants/${bucket}`, request.url)
    );
    response.cookies.set('bucket', bucket, { maxAge: 86400 });
    return response;
  }

  return NextResponse.next();
}

// Only run middleware on matched paths
export const config = {
  matcher: ['/dashboard/:path*', '/'],
};
```

---

## `unstable_cache` / `cache()` — Server-Side Memoization

```tsx
import { unstable_cache } from 'next/cache';

// Cache expensive DB query with tag and TTL
const getCachedUser = unstable_cache(
  async (id: string) => {
    return db.user.findUnique({ where: { id } });
  },
  ['user'],                          // cache key prefix
  {
    tags: ['users'],                 // revalidateTag('users') clears this
    revalidate: 3600,                // 1 hour
  }
);

// In React 'cache' (server components only — deduplication)
import { cache } from 'react';

const getUser = cache(async (id: string) => {
  console.log('DB query'); // only logs once even if called from multiple components
  return db.user.findUnique({ where: { id } });
});
```

---

## Error Handling

```tsx
// app/dashboard/error.tsx
// Must be a Client Component — receives error from server
'use client';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to error tracking
    Sentry.captureException(error);
  }, [error]);

  return (
    <div>
      <h2>Something went wrong</h2>
      <button onClick={reset}>Try again</button>
    </div>
  );
}

// app/not-found.tsx
export default function NotFound() {
  return <div>Page not found</div>;
}

// Programmatic 404/redirect from server components
import { notFound, redirect } from 'next/navigation';

async function PostPage({ params }) {
  const post = await getPost(params.slug);
  if (!post) notFound();            // renders not-found.tsx
  if (!post.published) redirect('/'); // redirects
  return <Post post={post} />;
}
```

---

## `loading.tsx` — Instant Loading States

```tsx
// app/dashboard/loading.tsx
// Shown while the page is streaming/loading
// Wraps the page in a Suspense boundary automatically

export default function DashboardLoading() {
  return <DashboardSkeleton />;
}
```

The file-based `loading.tsx` is equivalent to:
```tsx
<Suspense fallback={<DashboardLoading />}>
  <DashboardPage />
</Suspense>
```

---

## Server Actions in Next.js

```tsx
// app/actions/user.ts
'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createUser(formData: FormData) {
  const name = formData.get('name') as string;
  const email = formData.get('email') as string;

  // Validate
  if (!email.includes('@')) {
    return { error: 'Invalid email' };
  }

  const user = await db.user.create({ data: { name, email } });
  revalidatePath('/users');
  redirect(`/users/${user.id}`);
}

// Client usage
'use client';
import { createUser } from '../actions/user';
import { useActionState } from 'react';

function CreateUserForm() {
  const [state, action, isPending] = useActionState(createUser, null);

  return (
    <form action={action}>
      <input name="name" required />
      <input name="email" type="email" required />
      {state?.error && <p>{state.error}</p>}
      <button disabled={isPending}>Create</button>
    </form>
  );
}
```

---

## Performance Patterns

### Image Optimization
```tsx
import Image from 'next/image';

// Automatic: WebP, lazy loading, prevents CLS
<Image
  src="/hero.jpg"
  alt="Hero"
  width={1200}
  height={600}
  priority          // LCP image — eager load
  sizes="(max-width: 768px) 100vw, 1200px"
/>
```

### Font Optimization
```tsx
// app/layout.tsx
import { Inter, Roboto_Mono } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

// Fonts are downloaded at build time, served from your domain
// No external network request → no layout shift
export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
```

### Script Optimization
```tsx
import Script from 'next/script';

// afterInteractive — load after page is interactive (analytics)
<Script src="https://analytics.example.com/script.js" strategy="afterInteractive" />

// lazyOnload — load during browser idle time
<Script src="https://chat-widget.example.com/widget.js" strategy="lazyOnload" />

// beforeInteractive — load before page hydration (rare)
<Script src="/critical.js" strategy="beforeInteractive" />
```

---

## Interview Questions

**Q: What's the main difference between Pages Router and App Router?**
App Router defaults all components to Server Components (no JS bundle, can fetch data directly). Pages Router uses Client Components by default. App Router enables nested layouts, streaming with Suspense, Server Actions, and has a more powerful metadata API. For new projects, App Router is recommended.

**Q: How does Next.js caching work?**
Four layers: (1) Request Memoization — deduplicates identical `fetch()` calls within one render pass. (2) Data Cache — persists `fetch()` results across requests (like a CDN for data), controlled via `cache`/`revalidate` options. (3) Full Route Cache — stores rendered HTML/RSC payload on the server for static routes. (4) Router Cache — stores prefetched routes on the client for instant navigation.

**Q: What is `generateStaticParams` and when do you use it?**
It returns the list of dynamic route parameters to pre-render at build time. Use it for routes where you know all possible values (blog slugs, product IDs) to generate static HTML instead of rendering on every request. At runtime, any params not in the list can either 404 or dynamically render (controlled by `dynamicParams` export).

**Q: What can and can't you do in middleware?**
Middleware runs on the Edge (V8 isolates, no Node.js APIs). You can: read/write cookies, set headers, redirect, rewrite, return a response early. You can't: access the database, use Node.js APIs (`fs`, `crypto`), import heavy libraries. Keep it lightweight. Use it for: auth checks (verify JWT), A/B routing, geo-routing, bot detection.

**Q: What's the difference between `layout.tsx` and `template.tsx`?**
Layout persists across navigations between its children — state is preserved, effects don't re-run. Template creates a new instance on each navigation — state resets, `useEffect` runs again. Use layouts for persistent UI (nav, sidebar). Use templates when you need fresh state per page (e.g., page entry animation, per-page scroll position tracking).
