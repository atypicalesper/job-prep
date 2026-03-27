import { MetadataRoute } from 'next';

const BASE = 'https://atypicalesper.github.io/dev-atlas';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/_next/'],
      },
      {
        userAgent: 'GPTBot',
        disallow: '/',
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
