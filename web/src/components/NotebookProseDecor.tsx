'use client';

import { useEffect } from 'react';
import rough from 'roughjs';
import { useTheme } from 'next-themes';
import { useNotebook } from '@/lib/notebook';

const ATTR = 'data-nb-decor';

export default function NotebookProseDecor() {
  const { notebook } = useNotebook();
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const cleanup = () =>
      document.querySelectorAll(`[${ATTR}]`).forEach(el => el.remove());

    cleanup();
    if (!notebook) return;

    const stroke = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();

    document.querySelectorAll('.prose h2, .prose h3').forEach(heading => {
      const { width } = heading.getBoundingClientRect();
      if (!width) return;

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
      svg.setAttribute(ATTR, '');
      svg.setAttribute('width', String(width));
      svg.setAttribute('height', '10');
      svg.style.cssText = 'display:block;pointer-events:none;margin-top:2px;overflow:visible;';

      const isH2 = heading.tagName === 'H2';
      const rc = rough.svg(svg);
      svg.appendChild(
        rc.line(0, 5, width, 5, {
          roughness: 1.4,
          strokeWidth: isH2 ? 1.8 : 1.3,
          stroke,
        }),
      );

      heading.after(svg);
    });

    return cleanup;
  }, [notebook, resolvedTheme]);

  return null;
}
