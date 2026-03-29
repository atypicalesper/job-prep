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

    const OFFSET = 100; // px from viewport top — heading is "passed" once it crosses this line

    const onScroll = () => {
      let current = headings[0].id;
      for (const h of headings) {
        const el = document.getElementById(h.id);
        if (el && el.getBoundingClientRect().top <= OFFSET) {
          current = h.id;
        }
      }
      setActive(current);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // set correct active on mount / section change
    return () => window.removeEventListener('scroll', onScroll);
  }, [headings]);

  if (headings.length < 3) return null;

  return (
    <aside className="hidden lg:block w-48 shrink-0 self-start sticky top-8">
      <nav>
        <p
          className="text-[11px] font-semibold uppercase tracking-wider mb-3"
          style={{ color: 'var(--muted)' }}
        >
          On this page
        </p>
        <ul className="space-y-0.5 border-l" style={{ borderColor: 'var(--border)' }}>
          {headings.map(h => {
            const isActive = active === h.id;
            return (
              <li key={h.id}>
                <a
                  href={`#${h.id}`}
                  className="block text-[12px] leading-snug py-0.5 hover:text-[var(--accent)]"
                  style={{
                    paddingLeft: h.depth === 3 ? '1.25rem' : '0.625rem',
                    color: isActive ? 'var(--accent)' : 'var(--muted)',
                    fontWeight: isActive ? 600 : 400,
                    borderLeft: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                    marginLeft: '-1px',
                    transition: 'color 0.2s, border-color 0.2s, font-weight 0s',
                  }}
                >
                  {h.text}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
