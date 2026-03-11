'use client';

import { useEffect, useState } from 'react';
import type { Heading } from '@/lib/docs';

interface Props {
  headings: Heading[];
}

export default function TableOfContents({ headings }: Props) {
  const [active, setActive] = useState('');

  useEffect(() => {
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      entries => {
        // Pick the topmost visible heading
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActive(visible[0].target.id);
      },
      { rootMargin: '0px 0px -70% 0px', threshold: 0 },
    );

    headings.forEach(h => {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 3) return null;

  return (
    <aside className="hidden xl:block w-52 shrink-0">
      <nav className="sticky top-8">
        <p
          className="text-[11px] font-semibold uppercase tracking-wider mb-3"
          style={{ color: 'var(--muted)' }}
        >
          On this page
        </p>
        <ul className="space-y-0.5">
          {headings.map(h => (
            <li key={h.id}>
              <a
                href={`#${h.id}`}
                className="block text-[12px] leading-snug py-0.5 transition-colors hover:text-[var(--accent)]"
                style={{
                  paddingLeft: h.depth === 3 ? '0.75rem' : '0',
                  color: active === h.id ? 'var(--accent)' : 'var(--muted)',
                  fontWeight: active === h.id ? 600 : 400,
                }}
              >
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
