# Next.js Rendering Strategies — SSR, SSG, ISR, PPR

## The Four Rendering Models

Rendering strategy determines when and where a page's HTML is produced. This single decision affects your app's performance, infrastructure cost, data freshness, and SEO. Next.js supports four models that exist on a spectrum from "cheapest/most cached" (SSG) to "freshest/most expensive" (CSR). Most production apps use a mix — pick the right strategy per route rather than applying one globally.

| Strategy | When HTML is generated | Data freshness | Use case |
|----------|----------------------|----------------|----------|
| **SSG** (Static) | Build time | Stale until redeploy | Blog posts, docs, landing pages |
| **ISR** (Incremental) | Build time + background revalidation | Stale up to N seconds | Product listings, news |
| **SSR** (Server-side) | Per request | Always fresh | Dashboards, personalized pages |
| **CSR** (Client-side) | In browser | Fetched after load | Heavily interactive UIs |

---

## Static Site Generation (SSG)

SSG is the most performant rendering strategy: pages are rendered to plain HTML at build time, stored on a CDN, and served instantly to every user with no server computation per request. Because the HTML is pre-built, there's nothing to go wrong at runtime — no database timeouts, no cold starts, no server errors. The trade-off is staleness: once built, the content doesn't change until the next deploy. SSG is ideal for content that changes infrequently and is identical for all users, like blog posts, documentation, and marketing pages.

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

ISR is a hybrid between SSG and SSR: pages are pre-rendered statically but can be automatically regenerated in the background after a specified time interval. The first request after expiry serves the stale cached page immediately (no user waits) while Next.js regenerates a fresh version in the background — the classic stale-while-revalidate pattern. This gives you near-static performance with content that stays reasonably fresh. ISR is the right default for content that changes periodically but doesn't need to be real-time, like product listings, news articles, or pricing pages.

### Time-based revalidation

Time-based ISR works by setting a `revalidate` interval in seconds — either as a route-level export or per `fetch()` call. After the interval passes, the next request to that route triggers a background regeneration. The export-level `revalidate` applies to the entire route; the per-fetch `revalidate` applies only to that specific data fetch. Both can coexist — the more restrictive value wins.

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

On-demand revalidation lets you invalidate specific cached pages or data tags immediately — without waiting for a time interval to expire. Instead of a clock triggering the refresh, an external event (a CMS publishing content, a database update) calls a protected Route Handler that runs `revalidatePath` or `revalidateTag`. This gives you the CDN-level performance of static pages with the content freshness of a dynamic system. The secret token prevents unauthorized cache busting.

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

Cache tags are string labels you attach to `fetch()` calls that let you group related fetches and invalidate them all at once with a single `revalidateTag()` call. This is more flexible than path-based revalidation when the same data appears on multiple pages — instead of listing every path that shows products, you tag the fetch with `'products'` and invalidate that tag once. Tags persist in the Data Cache across requests and survive server restarts.

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

SSR renders a page fresh on every request — the server runs your component code, fetches the latest data, and sends back fully formed HTML each time. This guarantees data freshness and is the right choice for content that is personalized per user (dashboards, account pages) or must reflect the most current state of the system. In the App Router, a route becomes SSR as soon as it reads any request-time value like cookies or headers — Next.js detects this and opts the route out of static caching automatically.

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

PPR is a new rendering model that blurs the line between static and dynamic. A single route can have parts that are pre-rendered at build time (the static shell: nav, layout, above-the-fold content) and other parts that are dynamically rendered per request (prices, personalized content, real-time data) — all within the same page file. The static shell is served from the CDN instantly; dynamic parts are streamed in as the request resolves. PPR uses `<Suspense>` boundaries as the signal: everything outside a `Suspense` is static, everything inside is dynamic. This gives you static-page TTFB with dynamic content — previously you had to choose one or the other.

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

Picking a rendering strategy is a decision tree based on two questions: is the content the same for all users, and how frequently does it change? The answers map directly to the four strategies above. When in doubt, start more static and add dynamism only where you have a concrete need for freshness — static is always cheaper and faster.

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

`generateMetadata` is an async function you export from a page file to generate SEO metadata dynamically — fetching the same data your page fetches (Next.js deduplicates the request) and returning a typed `Metadata` object. This replaces the old `<Head>` component from the Pages Router and is the correct way to generate per-page titles, descriptions, and Open Graph/Twitter card images in the App Router. Static metadata can use the simpler `export const metadata` object; `generateMetadata` is for routes where the metadata depends on the page's params or fetched data.

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

Suspense is a React primitive that lets you declare a loading boundary around any component that isn't ready to render yet. In Next.js, it integrates with the HTTP streaming protocol: rather than waiting for all data to be ready before sending any HTML (the old SSR model), the server sends the page shell immediately and then streams additional HTML chunks into the browser as each suspended section resolves. The result is a dramatically lower Time to First Byte (TTFB) and faster Largest Contentful Paint (LCP) because users see something immediately and sections fill in progressively.

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
