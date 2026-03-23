# Next.js Rendering Strategies — SSR, SSG, ISR, PPR

## The Four Rendering Models

| Strategy | When HTML is generated | Data freshness | Use case |
|----------|----------------------|----------------|----------|
| **SSG** (Static) | Build time | Stale until redeploy | Blog posts, docs, landing pages |
| **ISR** (Incremental) | Build time + background revalidation | Stale up to N seconds | Product listings, news |
| **SSR** (Server-side) | Per request | Always fresh | Dashboards, personalized pages |
| **CSR** (Client-side) | In browser | Fetched after load | Heavily interactive UIs |

---

## Static Site Generation (SSG)

```tsx
// app/blog/[slug]/page.tsx

// Pre-render all known slugs at build time
export async function generateStaticParams() {
  const posts = await db.post.findMany({ select: { slug: true } });
  return posts.map(p => ({ slug: p.slug }));
}

// By default, pages with generateStaticParams are static
export default async function PostPage({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug);
  if (!post) notFound();
  return <Article post={post} />;
}

// Unknown slugs at build time:
export const dynamicParams = true;  // (default) render on-demand and cache
// export const dynamicParams = false; // 404 for unknown params
```

---

## Incremental Static Regeneration (ISR)

### Time-based revalidation
```tsx
// Revalidate the entire route every 60 seconds
export const revalidate = 60;

export default async function ProductsPage() {
  const products = await fetch('https://api.example.com/products', {
    next: { revalidate: 60 },  // same thing on a per-fetch level
  }).then(r => r.json());

  return <ProductList products={products} />;
}
```

### On-demand revalidation (webhook pattern)
```tsx
// app/api/revalidate/route.ts
import { revalidatePath, revalidateTag } from 'next/cache';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.REVALIDATE_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { tag, path } = await req.json();

  if (tag) revalidateTag(tag);      // invalidate by tag
  if (path) revalidatePath(path);   // invalidate specific path

  return Response.json({ revalidated: true });
}

// Usage: POST /api/revalidate?secret=xxx with { tag: 'products' }
// Fire this from your CMS webhook when content changes
```

### Tagged fetch
```tsx
async function getProducts() {
  const res = await fetch('https://api.example.com/products', {
    next: { tags: ['products'] },
  });
  return res.json();
}

// Later, anywhere server-side:
revalidateTag('products'); // all fetches tagged 'products' are purged
```

---

## Server-Side Rendering (SSR)

```tsx
// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

// Or: reading cookies/headers makes the route dynamic automatically
import { cookies, headers } from 'next/headers';

export default async function DashboardPage() {
  const cookieStore = cookies();
  const userId = cookieStore.get('userId')?.value;

  // This component is server-rendered on every request
  const data = await getUserDashboard(userId);
  return <Dashboard data={data} />;
}
```

**What makes a route dynamic automatically:**
- Reading `cookies()` or `headers()`
- Using `searchParams` in a page
- `fetch()` with `cache: 'no-store'`
- `export const dynamic = 'force-dynamic'`

---

## Partial Pre-rendering (PPR) — Next.js 14+

Renders the static shell at build time, streams dynamic parts at request time.

```tsx
// next.config.js — enable PPR
const nextConfig = {
  experimental: {
    ppr: true,
  },
};

// app/product/[id]/page.tsx
import { Suspense } from 'react';

// Static part renders at build time
export default function ProductPage({ params }) {
  return (
    <div>
      <ProductHeader />         {/* static — baked in */}
      <Suspense fallback={<PriceSkeleton />}>
        <DynamicPrice id={params.id} />   {/* dynamic — streams in */}
      </Suspense>
      <Suspense fallback={<ReviewsSkeleton />}>
        <Reviews id={params.id} />        {/* dynamic — streams in */}
      </Suspense>
    </div>
  );
}

async function DynamicPrice({ id }) {
  const price = await getRealtimePrice(id); // uncached, always fresh
  return <span>{price}</span>;
}
```

---

## Choosing the Right Strategy

```
Is the content the same for all users?
├── Yes → Can it change after deploy?
│         ├── Never/rarely → SSG (generateStaticParams)
│         └── Periodically → ISR (revalidate = N)
└── No  → Is the content personalized?
          ├── No (public + real-time) → SSR (dynamic)
          └── Yes (user-specific)    → SSR + auth check
              OR: static shell + client fetch (hybrid)
```

---

## `generateMetadata` for Dynamic SEO

```tsx
// app/blog/[slug]/page.tsx
import { Metadata } from 'next';

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPost(params.slug);
  if (!post) return { title: 'Not Found' };

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      images: [{ url: post.coverImage, width: 1200, height: 630 }],
      type: 'article',
      publishedTime: post.createdAt.toISOString(),
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      images: [post.coverImage],
    },
  };
}
```

---

## Suspense & Streaming

```tsx
// app/dashboard/page.tsx
// Streams sections as they resolve — TTFB is instant

import { Suspense } from 'react';

export default function DashboardPage() {
  return (
    <div>
      {/* Rendered immediately — no async work */}
      <DashboardHeader />

      {/* Streams in — has its own async fetch */}
      <Suspense fallback={<StatsSkeleton />}>
        <StatsSection />
      </Suspense>

      {/* Streams in independently */}
      <Suspense fallback={<FeedSkeleton />}>
        <ActivityFeed />
      </Suspense>
    </div>
  );
}

async function StatsSection() {
  const stats = await getStats(); // slow query — but doesn't block the rest
  return <StatsPanel stats={stats} />;
}
```

**Why streaming beats SSR for perceived performance:**
- HTML shell + nav renders instantly (no white screen)
- Each section fills in as its data arrives
- User can interact with loaded sections while others stream

---

## Interview Questions

**Q: When would you choose ISR over SSR?**
ISR when content changes infrequently and can tolerate stale data for N seconds (product pages, blog). SSR when data must be fresh per-request or is user-specific (dashboards, personalized feeds). ISR is cheaper (fewer server renders) and faster (cached response).

**Q: What's the stale-while-revalidate behavior of ISR?**
When a cached page expires, the next request serves the stale page immediately while triggering a background regeneration. The request after that gets the fresh page. This means no user ever waits for regeneration — they may see stale data for at most one request cycle.

**Q: How do you handle a slug that wasn't in `generateStaticParams`?**
With `dynamicParams = true` (default), Next.js renders it on-demand and caches the result as a new static page. With `dynamicParams = false`, it returns 404. The on-demand approach is common for large catalogs where pre-rendering all pages at build time is impractical.

**Q: What triggers a route to become dynamic?**
Reading `cookies()`, `headers()`, or `searchParams`; `fetch()` with `cache: 'no-store'`; or `export const dynamic = 'force-dynamic'`. Also: using `Date.now()` or `Math.random()` in the component (Next.js detects these).
