# Next.js Performance & SEO

## Metadata API

### Static Metadata
```tsx
// app/layout.tsx
import { Metadata } from 'next';

export const metadata: Metadata = {
  // Template: page title | site name
  title: {
    template: '%s | My App',
    default: 'My App',
  },
  description: 'Build something great',
  // Base URL for relative OG/Twitter images
  metadataBase: new URL('https://myapp.com'),
  openGraph: {
    siteName: 'My App',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@handle',
  },
  // Prevent indexing in preview environments
  robots: process.env.VERCEL_ENV === 'production'
    ? { index: true, follow: true }
    : { index: false, follow: false },
};
```

### Dynamic Metadata
```tsx
// app/blog/[slug]/page.tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const post = await getPost(params.slug);
  if (!post) return { title: 'Post not found' };

  return {
    title: post.title,             // becomes "Post Title | My App" via template
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      images: [{
        url: post.coverImage,      // relative URL resolved against metadataBase
        width: 1200,
        height: 630,
        alt: post.title,
      }],
      type: 'article',
      publishedTime: post.createdAt.toISOString(),
      authors: [post.author.name],
    },
    alternates: {
      canonical: `/blog/${params.slug}`,  // avoid duplicate content
    },
  };
}
```

### Robots & Sitemap
```ts
// app/robots.ts
import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard/', '/api/'],
    },
    sitemap: 'https://myapp.com/sitemap.xml',
  };
}

// app/sitemap.ts
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await db.post.findMany({
    select: { slug: true, updatedAt: true },
    where: { published: true },
  });

  const postUrls = posts.map(post => ({
    url: `https://myapp.com/blog/${post.slug}`,
    lastModified: post.updatedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  return [
    { url: 'https://myapp.com', lastModified: new Date(), priority: 1 },
    { url: 'https://myapp.com/blog', lastModified: new Date(), priority: 0.9 },
    ...postUrls,
  ];
}
```

---

## Image Optimization

```tsx
import Image from 'next/image';

// Local image — Next.js knows the dimensions
import hero from '@/public/hero.jpg';
<Image src={hero} alt="Hero" priority />

// Remote image — must declare dimensions
<Image
  src="https://example.com/photo.jpg"
  alt="Photo"
  width={800}
  height={600}
  sizes="(max-width: 768px) 100vw, 800px"  // for responsive
  quality={85}      // default 75
  priority          // above the fold (LCP image — skip lazy loading)
/>

// Fill parent container
<div className="relative h-64 w-full">
  <Image
    src="/banner.jpg"
    alt="Banner"
    fill
    className="object-cover"
    sizes="100vw"
  />
</div>
```

**`sizes` is critical** — tells the browser which source to download at each viewport width. Wrong sizes = massive images on mobile.

Configure allowed remote domains:
```ts
// next.config.js
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: '**.githubusercontent.com',
      },
    ],
  },
};
```

---

## Font Optimization

```tsx
// app/layout.tsx
import { Inter, JetBrains_Mono } from 'next/font/google';
import localFont from 'next/font/local';

// Google fonts — downloaded at build, served from your domain
// Zero external requests, no layout shift
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});

// Local font
const myFont = localFont({
  src: './fonts/MyFont.woff2',
  display: 'swap',
  variable: '--font-custom',
});

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="font-sans">  {/* font-sans → uses --font-inter via Tailwind */}
        {children}
      </body>
    </html>
  );
}
```

Tailwind config:
```js
// tailwind.config.ts
theme: {
  extend: {
    fontFamily: {
      sans: ['var(--font-inter)'],
      mono: ['var(--font-mono)'],
    },
  },
}
```

---

## Script Optimization

```tsx
import Script from 'next/script';

// afterInteractive — after hydration (analytics, chat widgets)
<Script
  src="https://www.googletagmanager.com/gtag/js"
  strategy="afterInteractive"
/>

// lazyOnload — during browser idle (non-critical third parties)
<Script src="https://intercom.io/widget.js" strategy="lazyOnload" />

// beforeInteractive — must load before React hydrates (rare)
// Goes in document <head>, only in layout.tsx
<Script src="/polyfills.js" strategy="beforeInteractive" />

// Inline with onLoad
<Script
  src="https://cdn.example.com/lib.js"
  strategy="afterInteractive"
  onLoad={() => { window.initLib(); }}
/>
```

---

## Core Web Vitals

| Metric | Target | What it measures | Next.js fix |
|--------|--------|-----------------|-------------|
| **LCP** (Largest Contentful Paint) | < 2.5s | Load time of largest element | `priority` on hero image, fast TTFB |
| **CLS** (Cumulative Layout Shift) | < 0.1 | Unexpected layout jumps | `width`+`height` on images, no dynamic content injection above fold |
| **INP** (Interaction to Next Paint) | < 200ms | Responsiveness to input | Smaller JS bundles, defer non-critical JS |
| **FCP** (First Contentful Paint) | < 1.8s | First pixel rendered | Streaming, SSR, remove render-blocking resources |
| **TTFB** (Time to First Byte) | < 600ms | Server response time | CDN, ISR/SSG, efficient DB queries |

---

## Bundle Analysis

```bash
npm install @next/bundle-analyzer
```

```js
// next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer({
  // your config
});
```

```bash
ANALYZE=true npm run build
```

### Common bundle wins:
```tsx
// ❌ Imports entire library
import _ from 'lodash';
const result = _.groupBy(items, 'category');

// ✅ Tree-shakeable import (or use native)
import groupBy from 'lodash/groupBy';
// Or just:
Object.groupBy(items, item => item.category);

// ❌ Heavy date library
import moment from 'moment'; // 300KB

// ✅ date-fns (tree-shakeable) or native Intl
import { format } from 'date-fns';
new Intl.DateTimeFormat('en', { month: 'long' }).format(date);

// Dynamic import for below-the-fold components
import dynamic from 'next/dynamic';
const HeavyChart = dynamic(() => import('./Chart'), {
  loading: () => <ChartSkeleton />,
  ssr: false,  // don't SSR chart (requires browser APIs)
});
```

---

## `next/dynamic` — Code Splitting

```tsx
import dynamic from 'next/dynamic';

// Split out a heavy component — only loads when rendered
const RichEditor = dynamic(() => import('./RichEditor'), {
  loading: () => <p>Loading editor...</p>,
  ssr: false,  // editor uses window — can't SSR
});

// With named export
const { Chart } = dynamic(() =>
  import('./charts').then(mod => ({ default: mod.Chart }))
);
```

---

## Lighthouse & Performance Checklist

```
✅ Images: next/image with correct sizes and priority on LCP image
✅ Fonts: next/font (no external font requests)
✅ Scripts: next/script with correct strategy
✅ Metadata: title, description, OG, Twitter cards on every page
✅ Canonical URLs: alternates.canonical to avoid duplicate content
✅ robots.ts and sitemap.ts
✅ No render-blocking CSS (Tailwind purges unused CSS)
✅ Dynamic import for heavy below-fold components
✅ Bundle analyzer run — no large unexpected dependencies
✅ Static/ISR where possible (SSG pages have instant TTFB)
```

---

## Interview Questions

**Q: How does `next/image` improve performance vs a plain `<img>`?**
Automatic WebP/AVIF conversion (smaller file size), lazy loading by default (offscreen images not loaded), prevents CLS by reserving space via width/height, serves correctly sized images per device via `sizes` + `srcset`, and uses a built-in CDN on Vercel.

**Q: What's the difference between `priority` and lazy loading for images?**
By default, all `next/image` images are lazy (loaded when near viewport). `priority` disables lazy loading — use it for the LCP image (hero, above-the-fold banner). Wrong: marking all images as `priority`. Right: only the first visible image.

**Q: How do you prevent CLS from fonts?**
`next/font` downloads fonts at build time and inlines the CSS. No external request = no FOUT (Flash of Unstyled Text), no CLS. The `display: 'swap'` option shows fallback font first, then swaps to the loaded font — acceptable CLS.

**Q: How would you track Core Web Vitals in Next.js?**
Export `reportWebVitals` from `app/layout.tsx` or use the `onRouteChange` hook. Alternatively, use the Web Vitals API directly with `web-vitals` package and send to your analytics endpoint. Vercel automatically tracks these for deployed apps.
