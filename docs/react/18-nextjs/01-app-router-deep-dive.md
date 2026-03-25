# Next.js App Router — Deep Dive

## Pages Router vs App Router

Next.js has two distinct routing systems that reflect different eras of React. The Pages Router (`/pages`) was the original approach and relies on React 17+ with client-side rendering as the default. The App Router (`/app`), introduced in Next.js 13 and stabilized in 14, is built on React 18 and treats every component as a Server Component by default. The App Router is not just a new file convention — it represents a fundamental shift in how rendering, data fetching, and layouts work. For any new project, the App Router is the recommended choice.

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

The App Router uses a file-system-based routing model where the directory structure under `app/` directly maps to URL segments. Each route segment can contain a set of special reserved files that control how that segment renders, handles errors, and responds to loading states. This is more than just routing — each folder is a self-contained unit that controls its own layout, fallback UI, and error recovery. Understanding which filename does what is foundational before building anything in Next.js.

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

Layouts and templates are wrapper components that surround one or more pages. The key distinction is lifecycle: a layout persists across navigations (its state and effects survive), while a template creates a fresh instance on every navigation. Layouts are the primary tool for shared chrome like navigation bars, sidebars, and footers. They form a nested hierarchy — each route segment can have its own layout that wraps its children without re-rendering when navigating within that segment.

### Root Layout (required)

The root layout is the one mandatory file in any App Router project. It replaces the old `_app.tsx` and `_document.tsx` and must render the `<html>` and `<body>` tags. It wraps every page in your app and is the right place for global providers, fonts, and site-wide metadata. Because it persists across all navigations, any state or context placed here survives page changes — use this deliberately.

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

A nested layout lives inside a route segment folder and wraps all pages within that segment and its children. Its key property is that it does not re-render when you navigate between sibling routes within its segment — so a sidebar or tab bar in a dashboard layout stays mounted and keeps its state while the inner page changes. This is fundamentally different from the old Pages Router where every navigation was a full page re-render.

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

A template is a special variant of a layout that re-creates a new component instance on every navigation instead of preserving the existing one. This means `useEffect` runs again, state resets, and the DOM is torn down and rebuilt. Use a template when you specifically need this behavior — for example, a page entry animation that should replay on each visit, or a component that measures scroll position from scratch per page. If you don't need re-mounting, always prefer a layout (less overhead, better UX).

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

Route groups are a purely organizational tool that let you group related route folders together without adding a segment to the URL. A folder name wrapped in parentheses — like `(marketing)` — is stripped from the URL path entirely. This is useful when you want different layouts for different sections of your app (a marketing layout vs. an app layout) while keeping the URLs clean. You can also use route groups to co-locate feature files that logically belong together without changing the public route structure.

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

Data fetching in the App Router is built directly into Server Components — you write `async/await` at the top level of any server component, and Next.js handles the rest. This eliminates the separate data-fetching lifecycle that Pages Router required (`getServerSideProps`, `getStaticProps`) and puts the data and the UI that renders it in the same place. The model is: fetch what you need, as close to where you use it as possible, and let Next.js's caching layer handle deduplication and revalidation.

### Server Component (default — no boilerplate)

A Server Component is a React component that runs only on the server — it has direct access to databases, the filesystem, and environment secrets without any of that code reaching the browser. Because it never ships to the client, it has zero impact on your JavaScript bundle size. The trade-off is that Server Components cannot use browser APIs, event handlers, or React hooks like `useState`. Use Server Components for everything that fetches data and doesn't need interactivity; add a `'use client'` boundary only when you need it.

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

When a component needs multiple independent data sources, fetching them sequentially with `await` creates a waterfall — each request waits for the previous one to finish. `Promise.all` fires all requests at the same time and waits for all of them to resolve, cutting the total wait time to the duration of the slowest request rather than the sum of all requests. Use this pattern whenever the data sources are not dependent on each other's results.

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

Sometimes you need to load critical data first and then stream in secondary sections as they resolve — this is where Suspense boundaries combined with async Server Components shine. Each `<Suspense>` boundary wraps a component that fetches its own data independently. Next.js streams the HTML over the wire: the shell renders immediately, and each suspended section fills in as its data arrives. This gives users a fast initial render (low TTFB) while slower data loads progressively without blocking anything else.

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

Request memoization is React's built-in deduplication of `fetch()` calls within a single render pass. If two different Server Components in the same render tree call `fetch()` with the same URL and options, React executes the network request once and shares the result. This means you can co-locate data fetching inside the components that need the data (rather than lifting it all to the top) without worrying about redundant network requests. It is scoped to one request cycle — the cache is cleared between requests.

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

The Data Cache is Next.js's server-side persistent cache for `fetch()` responses. Unlike request memoization (which lives only for one render), the Data Cache survives across multiple requests and even server restarts — think of it as a CDN for your data fetches. By default, `fetch()` in a Server Component caches forever (static behavior). You opt into freshness by setting `revalidate` (time-based) or `cache: 'no-store'` (always fresh). This is the primary lever for controlling how dynamic or static your data is.

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

The Full Route Cache stores the rendered HTML and React Server Component payload of entire routes on the server. When a route is fully static (no dynamic data, no user-specific content), Next.js renders it once at build time and serves the cached result for every subsequent request. This is effectively free performance — serving a static HTML file is orders of magnitude cheaper than re-running your server logic per request. Routes opt out of this cache as soon as they use any dynamic API (`cookies()`, `headers()`, etc.).

```tsx
// Force dynamic (no static cache)
export const dynamic = 'force-dynamic';

// Force static (prerender even with dynamic APIs)
export const dynamic = 'force-static';

// Revalidate entire route every N seconds (ISR)
export const revalidate = 3600;
```

### 4. Router Cache (client-side)

The Router Cache is a client-side in-memory cache that stores previously visited and prefetched route segments in the browser. When you navigate to a route that's already in the Router Cache, Next.js renders it instantly without a server round trip. Next.js automatically prefetches routes that appear in `<Link>` components in the viewport, so clicking a link often feels instantaneous. The cache has a time-based expiry and is cleared on hard navigation or explicit `router.refresh()` calls.

### On-Demand Revalidation

On-demand revalidation lets you invalidate cached data at any point in response to an event — for example, when a CMS publishes new content or a user submits a form. Rather than waiting for a time-based expiry, you call `revalidatePath` or `revalidateTag` from a Server Action or Route Handler to immediately purge the relevant cache entries. The next request to the affected route regenerates fresh data.

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

Dynamic routes allow a single file to handle multiple URL patterns by using bracket syntax in the folder or file name. The matched segment value is passed to the component as a `params` prop. Combined with `generateStaticParams`, you can pre-render a known set of dynamic pages at build time (SSG) while still handling unknown params dynamically at request time. This is the recommended pattern for content-driven sites where you know most slugs ahead of time.

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

Route Handlers are the App Router's equivalent of Pages Router API routes — they let you build HTTP endpoints inside your Next.js app using Web standard `Request` and `Response` objects. You define a file named `route.ts` inside any `app/` directory and export functions named after HTTP methods (`GET`, `POST`, `PUT`, `DELETE`, etc.). Unlike Server Actions (which are for form mutations), Route Handlers are the right choice when you need a proper REST/JSON API consumed by external clients, mobile apps, or webhooks.

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

Middleware is a special function that runs at the network edge — before a request reaches any page, layout, or API route. Because it runs in V8 isolates rather than a full Node.js process, it starts up nearly instantly and adds minimal latency. This makes it ideal for tasks that need to run on every request but must be lightweight: checking authentication tokens, redirecting users, injecting headers, or routing A/B test variants. The critical constraint is that you cannot use Node.js APIs or connect to a database from middleware — it must remain stateless and fast.

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

`unstable_cache` and React's `cache()` are two complementary tools for avoiding redundant work on the server. React's `cache()` is a request-scoped deduplication wrapper — it ensures that a function is called at most once per render pass regardless of how many components invoke it (similar to request memoization for `fetch()`). `unstable_cache` is Next.js's persistent cache — it stores the result of any async function (not just `fetch()`) in the Data Cache with full support for tags and TTL. Use `cache()` for deduplication within a request; use `unstable_cache` when you want a non-`fetch()` operation like a direct Prisma query to benefit from cross-request caching.

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

Next.js provides a file-based error handling system that mirrors the layout hierarchy. An `error.tsx` file in any route segment automatically becomes a React error boundary for that segment — if any component inside throws, the error boundary catches it and renders your error UI instead of crashing the whole page. The `reset` function it receives attempts to re-render the segment without a full page reload. Error boundaries must be Client Components because they rely on React's class-based error catching mechanism, which only works on the client.

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

`loading.tsx` is a special file that defines the fallback UI shown while a page or layout segment is loading. When Next.js encounters this file, it automatically wraps the corresponding `page.tsx` in a `<Suspense>` boundary using your loading component as the fallback. This means users see your skeleton or spinner immediately — the shell of the page renders right away, and the actual content streams in when ready. It requires zero manual Suspense setup and is the recommended first step for improving perceived performance on any slow route.

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

Server Actions are async functions that run on the server but can be called directly from Client Components — no API route, no `fetch()`, no manual request handling needed. They are defined with the `'use server'` directive (either at the top of a file or inline inside a function) and can be passed directly to a form's `action` prop or invoked programmatically. Next.js automatically generates a secure RPC endpoint under the hood and handles serialization. Use Server Actions for form submissions and mutations that need server-side logic (database writes, cache revalidation, redirects) — they reduce boilerplate dramatically compared to the old Route Handler + client `fetch()` pattern.

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

Next.js's `<Image>` component is a drop-in replacement for the standard `<img>` tag that adds automatic optimization: images are converted to modern formats (WebP/AVIF), lazy-loaded by default, and served at the correct size for each device via the `sizes` prop. Critically, it reserves the correct space in the layout before the image loads, preventing Cumulative Layout Shift (CLS) — one of the core Web Vitals metrics. Always provide `width` and `height`, and add `priority` to your largest above-the-fold image (the LCP element) to eager-load it.

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

`next/font` solves two font performance problems at once: it downloads Google Fonts at build time and serves them from your own domain (eliminating the external DNS lookup and connection cost), and it automatically applies `font-display: swap` to prevent invisible text during loading. The font is exposed as a CSS variable that Tailwind or your own CSS can reference. This approach gives you the convenience of Google Fonts with the performance characteristics of self-hosted fonts.

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

The `<Script>` component extends the standard `<script>` tag with a `strategy` prop that controls exactly when a third-party script loads relative to the page lifecycle. The three strategies map to distinct use cases: `afterInteractive` for analytics (loads after hydration, doesn't block anything), `lazyOnload` for non-critical widgets (loads during idle time), and `beforeInteractive` for scripts that must exist before React hydrates (rare — use sparingly as it blocks rendering). Using these strategies instead of plain `<script>` tags prevents third-party code from degrading your Core Web Vitals.

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
