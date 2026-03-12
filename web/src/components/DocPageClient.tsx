'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { recordVisit } from '@/lib/progress';
import BackToTop from './BackToTop';

interface Props {
  slug: string[];
  title: string;
  prevHref?: string;
  nextHref?: string;
}

export default function DocPageClient({ slug, title, prevHref, nextHref }: Props) {
  const router = useRouter();

  // Record visit + scroll to top on each new page
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    recordVisit(slug, title);
    window.scrollTo({ top: 0 });
  }, [slug.join('/')]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard nav: [ = prev, ] = next
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '[' && prevHref) { router.push(prevHref); window.scrollTo({ top: 0 }); }
      if (e.key === ']' && nextHref) { router.push(nextHref); window.scrollTo({ top: 0 }); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prevHref, nextHref, router]);

  return <BackToTop />;
}
