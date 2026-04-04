import { getAllDocSlugs } from '@/lib/docs';
import HomePageClient from './HomePageClient';

export default function HomePage() {
  // Count markdown files per top-level section for progress bars
  const slugs = getAllDocSlugs();
  const pageCounts: Record<string, number> = {};
  for (const slug of slugs) {
    if (slug[0]) {
      pageCounts[slug[0]] = (pageCounts[slug[0]] ?? 0) + 1;
    }
  }
  return <HomePageClient pageCounts={pageCounts} />;
}
