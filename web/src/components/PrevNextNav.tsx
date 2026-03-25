'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useNotebook } from '@/lib/notebook';
import RoughBorder from './RoughBorder';

interface NavPage {
  title: string;
  slug: string[];
}

interface Props {
  prev?: NavPage;
  next?: NavPage;
  prevHref?: string;
  nextHref?: string;
}

export default function PrevNextNav({ prev, next, prevHref, nextHref }: Props) {
  const { notebook } = useNotebook();

  if (!prev && !next) return null;

  return (
    <>
      <div className="mt-4 flex justify-center">
        <div
          className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border"
          style={{ color: 'var(--muted)', borderColor: 'var(--border)', backgroundColor: 'var(--card-bg)' }}
        >
          <kbd className="kbd">[</kbd>
          <span>prev</span>
          <span className="opacity-30 mx-0.5">·</span>
          <span>next</span>
          <kbd className="kbd">]</kbd>
        </div>
      </div>

      <div
        className="mt-4 pt-6 border-t grid grid-cols-1 sm:grid-cols-2 gap-4"
        style={{ borderColor: 'var(--border)' }}
      >
        {prev ? (
          <Link
            href={prevHref!}
            className="group flex items-center gap-3 rounded-xl border p-4 transition-all hover:-translate-x-1"
            style={{
              position: 'relative',
              backgroundColor: 'var(--card-bg)',
              borderColor: notebook ? 'transparent' : 'var(--card-border)',
            }}
          >
            {notebook && <RoughBorder />}
            <ChevronLeft size={18} style={{ color: 'var(--muted)' }} className="shrink-0" />
            <div>
              <div className="text-xs mb-0.5" style={{ color: 'var(--muted)' }}>Previous</div>
              <div className="text-sm font-medium group-hover:text-indigo-400 transition-colors" style={{ color: 'var(--fg)' }}>
                {prev.title}
              </div>
            </div>
          </Link>
        ) : <div />}

        {next ? (
          <Link
            href={nextHref!}
            className="group flex items-center justify-end gap-3 rounded-xl border p-4 transition-all hover:translate-x-1"
            style={{
              position: 'relative',
              backgroundColor: 'var(--card-bg)',
              borderColor: notebook ? 'transparent' : 'var(--card-border)',
            }}
          >
            {notebook && <RoughBorder />}
            <div className="text-right">
              <div className="text-xs mb-0.5" style={{ color: 'var(--muted)' }}>Next</div>
              <div className="text-sm font-medium group-hover:text-indigo-400 transition-colors" style={{ color: 'var(--fg)' }}>
                {next.title}
              </div>
            </div>
            <ChevronRight size={18} style={{ color: 'var(--muted)' }} className="shrink-0" />
          </Link>
        ) : <div />}
      </div>
    </>
  );
}
