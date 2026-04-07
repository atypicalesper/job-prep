export const dynamic = 'force-static';

import { getAllDocSlugs, getAllDirSlugs } from '@/lib/docs';

const BASE = 'https://atypicalesper.github.io/dev-atlas';

export default function sitemap() {
  const docSlugs = getAllDocSlugs();
  const dirSlugs = getAllDirSlugs();

  const home = { url: `${BASE}/`, lastModified: new Date(), changeFrequency: 'weekly' as const, priority: 1.0 };

  const dirs = dirSlugs.map(slug => ({
    url: `${BASE}/${slug.join('/')}/`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  const docs = docSlugs.map(slug => ({
    url: `${BASE}/${slug.join('/')}/`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  return [home, ...dirs, ...docs];
}
