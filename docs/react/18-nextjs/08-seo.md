# SEO in Next.js

## What is SEO?

SEO (Search Engine Optimization) is the practice of making your web pages understandable and discoverable by search engines so they rank higher in search results. It's not about tricking algorithms — it's about clearly communicating what your page is about, to both humans and machines.

Modern SEO has two distinct layers:

- **Technical SEO** — Can search engines find, crawl, and render your page correctly? Is it fast enough? Is it accessible?
- **Content SEO** — Is the content relevant, well-structured, and authoritative for the query?

As a Next.js developer, you own the technical SEO layer entirely. This doc covers everything you control in code.

---

## How Search Engines Work

Understanding the pipeline helps you make better decisions:

1. **Crawl** — A bot (Googlebot, Bingbot) follows links across the web and downloads your HTML
2. **Render** — The bot executes JavaScript and renders the final DOM (Google does this; many others don't)
3. **Index** — The rendered page content is analyzed, classified, and added to the search index
4. **Rank** — When a user searches, the index is queried and pages are ranked by relevance, authority, and quality signals

**Why Next.js is good for SEO:** Client-only React apps (CRA, Vite without SSR) return an empty `<div id="root"></div>` to the crawler. The bot sees nothing. Next.js pre-renders pages on the server (SSG/SSR), so the crawler receives fully-formed HTML with real content — no rendering step needed, no risk of JS execution failures affecting your index.

---

## Pre-rendering and SEO

The rendering strategy you choose directly impacts SEO:

| Strategy | SEO Impact | When to Use |
|---|---|---|
| **SSG** (Static) | Best — HTML fully built at deploy time, served instantly from CDN | Marketing pages, blogs, docs |
| **ISR** (Incremental Static) | Excellent — static-like with periodic freshness | Product pages, news with known URLs |
| **SSR** (Server-rendered) | Good — HTML generated per request, always fresh | User-specific pages, real-time data |
| **CSR** (Client-only) | Poor — bots see empty HTML until JS runs | Admin dashboards, highly interactive tools |

**Rule:** Anything publicly accessible and meant to rank in search results should use SSG or SSR. Reserve CSR for authenticated-only pages that don't need indexing.

---

## The Metadata API

The `metadata` export (or `generateMetadata` function) in any `page.tsx` or `layout.tsx` tells Next.js what to put in the `<head>` of that page. It compiles to standard HTML `<meta>` tags at build/request time.

### What each field does

**`title`** — The most important SEO field. Appears in search results, browser tabs, and social shares. The template pattern (`%s | Site Name`) lets nested pages set their title while automatically appending the site name.

**`description`** — A 150–160 character summary shown in search result snippets. Doesn't directly affect ranking but heavily impacts click-through rate (CTR). Write it for humans, not algorithms.

**`metadataBase`** — The base URL for resolving relative paths in OG images, canonical URLs, etc. Without this, relative URLs in metadata won't resolve correctly in production.

**`robots`** — Controls which pages search engines index and follow. Use `{ index: false }` on preview deployments, staging, admin pages, and duplicate content pages.

**`alternates.canonical`** — Tells search engines the "true" URL for a page when the same content exists at multiple URLs (e.g., `/blog/post` and `/blog/post?ref=twitter`). Prevents duplicate content penalties.

```tsx
// app/layout.tsx — site-wide defaults
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    template: '%s | My App',   // child pages: "Post Title | My App"
    default: 'My App',         // fallback when no page sets a title
  },
  description: 'Build something great with Next.js',
  metadataBase: new URL('https://myapp.com'),
  robots: process.env.VERCEL_ENV === 'production'
    ? { index: true, follow: true }
    : { index: false, follow: false },  // don't index preview/staging
};
```

### Dynamic metadata for content pages

Static `metadata` exports can't use runtime data (database, params). Use `generateMetadata` for pages where the title and description come from a database record:

```tsx
// app/blog/[slug]/page.tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const post = await getPost(params.slug);
  if (!post) return { title: 'Post not found' };

  return {
    title: post.title,           // → "My Post Title | My App" via template
    description: post.excerpt,   // first 150 chars of the post
    alternates: {
      canonical: `/blog/${params.slug}`,  // prevent duplicate content
    },
  };
}
```

`generateMetadata` runs on the server, can access databases, and is deduplicated with the page's own data fetching (same fetch calls are cached).

---

## Open Graph Protocol

Open Graph (OG) is a protocol created by Facebook, now used universally. When you share a URL on Slack, Twitter, LinkedIn, iMessage, or Discord, the platform fetches the page's OG tags to generate the preview card — title, description, image.

Without OG tags: the platform guesses (or shows nothing). With OG tags: you control exactly what the preview looks like.

**Key OG fields:**

| Field | Purpose |
|---|---|
| `og:title` | Title shown in the preview card |
| `og:description` | Description in the preview card |
| `og:image` | The preview image — ideally 1200×630px |
| `og:type` | `website` for general pages, `article` for blog posts |
| `og:url` | Canonical URL of the page |
| `og:site_name` | Your site name |

```tsx
// app/blog/[slug]/page.tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const post = await getPost(params.slug);

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      publishedTime: post.createdAt.toISOString(),
      authors: [post.author.name],
      images: [{
        url: post.coverImage,   // resolved against metadataBase
        width: 1200,
        height: 630,
        alt: post.title,
      }],
    },
    twitter: {
      card: 'summary_large_image',  // large image preview on Twitter/X
      title: post.title,
      description: post.excerpt,
      images: [post.coverImage],
      creator: '@yourhandle',
    },
  };
}
```

**OG Image size:** 1200×630px is the standard. Images too small get downscaled and look blurry. Missing images mean no visual preview — lower CTR on shares.

---

## Dynamic OG Images with `ImageResponse`

Next.js lets you generate OG images programmatically using JSX — no design tool, no static assets. The image is generated at build time (for static pages) or on-demand (for dynamic pages) and cached at the edge.

```tsx
// app/blog/[slug]/opengraph-image.tsx
import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OGImage({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug);

  return new ImageResponse(
    (
      <div
        style={{
          background: '#0f172a',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '60px',
          color: 'white',
        }}
      >
        <p style={{ fontSize: 24, color: '#94a3b8', margin: 0 }}>My Blog</p>
        <h1 style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.2 }}>
          {post.title}
        </h1>
        <p style={{ fontSize: 28, color: '#94a3b8' }}>{post.author.name}</p>
      </div>
    ),
    { ...size }
  );
}
```

Next.js automatically wires up the file at `app/blog/[slug]/opengraph-image.tsx` as the OG image for that route — no metadata configuration needed.

---

## Structured Data (JSON-LD)

Structured data is machine-readable information added to your HTML that tells search engines what your content *is*, not just what it *says*. Google uses it to render **rich results** — star ratings, FAQs, breadcrumbs, recipes, events, and more directly in search results.

The standard format is JSON-LD (JavaScript Object Notation for Linked Data), embedded in a `<script type="application/ld+json">` tag.

**Why it matters:** Pages with valid structured data can appear in rich result formats which have significantly higher CTR than plain blue links.

```tsx
// app/blog/[slug]/page.tsx — Article schema
export default async function BlogPost({ params }) {
  const post = await getPost(params.slug);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    image: post.coverImage,
    datePublished: post.createdAt.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    author: {
      '@type': 'Person',
      name: post.author.name,
      url: `https://myapp.com/authors/${post.author.slug}`,
    },
    publisher: {
      '@type': 'Organization',
      name: 'My App',
      logo: {
        '@type': 'ImageObject',
        url: 'https://myapp.com/logo.png',
      },
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article>{/* page content */}</article>
    </>
  );
}
```

```tsx
// FAQ schema — enables FAQ rich results in search
const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map(faq => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer,
    },
  })),
};
```

**Common schema types:** `Article`, `Product`, `FAQPage`, `BreadcrumbList`, `Organization`, `Person`, `Event`, `Recipe`. Google's [Rich Results Test](https://search.google.com/test/rich-results) validates your structured data.

---

## Robots & Crawl Control

`robots.txt` tells crawlers which parts of your site they can and cannot access. It's a convention, not a security mechanism — a malicious bot ignores it. Use it to prevent crawlers from wasting time on pages that don't need indexing.

```ts
// app/robots.ts — generates /robots.txt automatically
import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',          // all bots
        allow: '/',
        disallow: [
          '/dashboard/',         // authenticated pages — no public value
          '/api/',               // API routes — not HTML pages
          '/admin/',
          '/_next/',             // Next.js internals
        ],
      },
      {
        userAgent: 'GPTBot',     // OpenAI's crawler
        disallow: '/',           // opt out of AI training data
      },
    ],
    sitemap: 'https://myapp.com/sitemap.xml',
  };
}
```

---

## Sitemaps

A sitemap is a file that lists all the URLs on your site you want search engines to index. It helps crawlers discover pages they might not find through link-following alone — especially important for large sites or pages with few inbound links.

```ts
// app/sitemap.ts — generates /sitemap.xml
import { MetadataRoute } from 'next';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await db.post.findMany({
    select: { slug: true, updatedAt: true },
    where: { published: true },
  });

  const postUrls = posts.map(post => ({
    url: `https://myapp.com/blog/${post.slug}`,
    lastModified: post.updatedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.8,             // 0.0–1.0, relative to other pages
  }));

  return [
    {
      url: 'https://myapp.com',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1.0,           // homepage is highest priority
    },
    {
      url: 'https://myapp.com/blog',
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    ...postUrls,
  ];
}
```

For very large sites (> 50,000 URLs), split into multiple sitemaps and reference them from a sitemap index file.

---

## Core Web Vitals and SEO

Google uses Core Web Vitals as a ranking signal. A fast, stable, responsive page ranks better than a slow one with identical content. These are the three metrics that matter most:

**LCP (Largest Contentful Paint)** — How long until the largest visible element (usually the hero image or main heading) is rendered. Target: under 2.5 seconds.

In Next.js: add `priority` to your hero image, use SSG/SSR so the HTML arrives pre-rendered, and ensure fast server response times (TTFB).

**CLS (Cumulative Layout Shift)** — How much the page layout unexpectedly shifts during load. A button that jumps because an image above it loaded slowly is CLS. Target: under 0.1.

In Next.js: always specify `width` and `height` on `next/image` (or use `fill`), use `next/font` to prevent font-related layout shifts, avoid injecting content above the fold after load.

**INP (Interaction to Next Paint)** — How quickly the page responds to user input. Target: under 200ms.

In Next.js: minimize JavaScript bundle size, defer non-critical scripts with `next/script`, avoid long-running synchronous tasks on the main thread.

```
LCP < 2.5s   → Fast server + priority on hero image
CLS < 0.1    → Explicit image dimensions + stable fonts
INP < 200ms  → Small JS bundles + deferred scripts
```

---

## SEO Checklist for Next.js Pages

```
Metadata
✅ Unique title per page (50–60 characters)
✅ Unique description per page (150–160 characters)
✅ metadataBase set in root layout
✅ Dynamic generateMetadata for content pages

Open Graph
✅ og:title, og:description, og:image on every page
✅ OG image is 1200×630px
✅ Twitter card configured (summary_large_image)

Crawlability
✅ robots.ts — disallow admin, API, auth pages
✅ sitemap.ts — all public indexable URLs listed
✅ canonical URLs set to prevent duplicate content

Performance
✅ next/image with correct sizes + priority on LCP image
✅ next/font (no external font requests, no layout shift)
✅ next/script with afterInteractive/lazyOnload strategies
✅ SSG or SSR for all public pages (not CSR)

Structured Data
✅ Article schema on blog posts
✅ Organization schema on homepage/about
✅ FAQPage schema on FAQ sections (if applicable)

Technical
✅ No render-blocking resources
✅ No broken internal links
✅ HTTPS everywhere
✅ Mobile-responsive layout
```

---

## Interview Questions

**Q: Why does rendering strategy matter for SEO?**

Client-rendered pages return an empty HTML shell to crawlers — the content only exists after JavaScript runs. Many bots don't execute JavaScript, and even Googlebot can delay rendering by days. Server-rendered pages (SSG/SSR in Next.js) return complete HTML immediately, guaranteed to be indexed correctly and quickly.

**Q: What's the difference between `metadata` and `generateMetadata`?**

`metadata` is a static export — values are hardcoded at build time. `generateMetadata` is an async function that runs per-request (SSR) or at build time (SSG), allowing you to fetch from a database, use route params, or derive metadata from dynamic data. Use `generateMetadata` for any content page where the title/description depends on the content.

**Q: What is a canonical URL and when do you need one?**

A canonical URL tells search engines which URL is the "real" version of a page when the same content is accessible at multiple URLs (due to query parameters, trailing slashes, protocol differences, etc.). Without canonicals, Google may split link authority across duplicates or choose the wrong version to index.

**Q: What is structured data and what does it enable?**

Structured data (JSON-LD) is machine-readable markup that tells search engines what your content is — an Article, a Product, an FAQ, an Event. Google uses it to generate rich results: star ratings in search snippets, FAQ dropdowns, breadcrumbs, recipe cards. These enhance visibility and increase CTR significantly.

**Q: How do Core Web Vitals affect SEO?**

Google uses CWV as a ranking signal — identical content on a fast page will outrank the same content on a slow page. LCP, CLS, and INP are the three measured vitals. In Next.js specifically: `priority` on hero images fixes LCP, `next/image` with explicit dimensions fixes CLS, and smaller JS bundles fix INP.

**Q: What's the purpose of `robots.txt` vs the `robots` metadata field?**

`robots.txt` is a file-level instruction to crawlers — it prevents bots from even fetching certain URLs. The `robots` metadata field (`<meta name="robots">`) is a page-level instruction — the bot fetches the page but is told not to index it. Use `robots.txt` to block entire URL patterns (like `/api/`), use the metadata field for individual pages you want fetched but not indexed.
