'use client';

import { useEffect, useRef } from 'react';
import rough from 'roughjs';
import { useTheme } from 'next-themes';

interface Props {
  roughness?: number;
  strokeWidth?: number;
}

export default function RoughBorder({ roughness = 1.8, strokeWidth = 1.5 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const draw = () => {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const { width: w, height: h } = svg.getBoundingClientRect();
      if (!w || !h) return;

      const stroke = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      const rc = rough.svg(svg);
      svg.appendChild(
        rc.rectangle(3, 3, w - 6, h - 6, { roughness, strokeWidth, stroke, fill: 'none' }),
      );
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(svg.parentElement ?? svg);
    return () => ro.disconnect();
  }, [resolvedTheme, roughness, strokeWidth]);

  return (
    <svg
      ref={svgRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1,
        overflow: 'visible',
      }}
    />
  );
}
