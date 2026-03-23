import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDocContent, getDirInfo, getPrevNext, getAllDocSlugs, getAllDirSlugs, extractHeadings, humanize } from '@/lib/docs';
import type { NavItem } from '@/lib/docs';
import MarkdownContent from '@/components/MarkdownContent';
import TableOfContents from '@/components/TableOfContents';
import ReadingProgress from '@/components/ReadingProgress';
import DocPageClient from '@/components/DocPageClient';
import { ChevronLeft, ChevronRight, Clock, FolderOpen } from 'lucide-react';

interface PageProps {
  params: { slug: string[] };
}

function readingTime(markdown: string): string {
  const words = markdown.trim().split(/\s+/).length;
  const mins  = Math.ceil(words / 250);
  return `${mins} min read`;
}

/** Count total leaf-file descendants of a NavItem */
function flatCount(item: NavItem): number {
  if (!item.children) return 1;
  return item.children.reduce((sum, c) => sum + flatCount(c), 0);
}

export async function generateStaticParams() {
  const fileSlugs = getAllDocSlugs();
  const dirSlugs = getAllDirSlugs();
  return [...fileSlugs, ...dirSlugs].map(slug => ({ slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const doc = getDocContent(params.slug);
  if (doc) return { title: `${doc.title} — dev atlas` };
  const dir = getDirInfo(params.slug);
  if (dir) return { title: `${dir.title} — dev atlas` };
  return { title: 'Not Found' };
}

/** Breadcrumb strip shared by doc and dir pages */
function Breadcrumb({ slug }: { slug: string[] }) {
  return (
    <nav className="flex items-center gap-2 text-xs flex-wrap" style={{ color: 'var(--muted)' }}>
      <Link href="/" className="hover:underline" style={{ color: 'var(--accent)' }}>Home</Link>
      {slug.map((segment, i) => {
        const href  = '/' + slug.slice(0, i + 1).join('/');
        const label = humanize(segment);
        const isLast = i === slug.length - 1;
        return (
          <span key={i} className="flex items-center gap-2">
            <ChevronRight size={12} />
            {isLast ? (
              <span style={{ color: 'var(--fg)' }}>{label}</span>
            ) : (
              <Link href={href} className="hover:underline">{label}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export default function DocPage({ params }: PageProps) {
  const doc = getDocContent(params.slug);

  // ── Directory index page ────────────────────────────────────────────────
  if (!doc) {
    const dir = getDirInfo(params.slug);
    if (!dir) notFound();

    return (
      <div className="page-content max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <Breadcrumb slug={params.slug} />

        <div className="flex items-center gap-3 mt-6 mb-2">
          <FolderOpen size={22} style={{ color: 'var(--accent)' }} />
          <h1 className="text-2xl font-bold" style={{ color: 'var(--fg)' }}>{dir.title}</h1>
        </div>
        <p className="text-sm mb-8" style={{ color: 'var(--muted)' }}>
          {dir.children.length} {dir.children.length === 1 ? 'section' : 'sections'}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dir.children.map((child, i) => {
            const href = '/' + child.slug.join('/');
            const stagger = { '--stagger': `${i * 60}ms` } as React.CSSProperties;
            if (child.children) {
              const count = flatCount(child);
              // Subsection card
              return (
                <div
                  key={href}
                  className="dir-card rounded-xl border p-5"
                  style={{ ...stagger, backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <Link
                      href={href}
                      className="font-semibold text-sm hover:text-indigo-400 transition-colors"
                      style={{ color: 'var(--fg)' }}
                    >
                      {child.title} →
                    </Link>
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded-md shrink-0 ml-2"
                      style={{ backgroundColor: 'var(--sidebar-active)', color: 'var(--sidebar-active-text)' }}
                    >
                      {count} {count === 1 ? 'file' : 'files'}
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {child.children.map(gc => (
                      <li key={gc.slug.join('/')}>
                        <Link
                          href={'/' + gc.slug.join('/')}
                          className="text-xs hover:underline"
                          style={{ color: 'var(--muted)' }}
                        >
                          {gc.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            }
            // Direct file card
            return (
              <Link
                key={href}
                href={href}
                className="dir-card rounded-xl border p-5 block transition-all hover:-translate-y-1 hover:shadow-md group"
                style={{ ...stagger, backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
              >
                <span className="font-semibold text-sm group-hover:text-indigo-400 transition-colors" style={{ color: 'var(--fg)' }}>{child.title}</span>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Regular doc page ────────────────────────────────────────────────────

  const { prev, next } = getPrevNext(params.slug);
  const headings = extractHeadings(doc.content);
  const prevHref = prev ? '/' + prev.slug.join('/') : undefined;
  const nextHref = next ? '/' + next.slug.join('/') : undefined;

  return (
    <>
      <ReadingProgress />
      <DocPageClient
        slug={params.slug}
        title={doc.title}
        prevHref={prevHref}
        nextHref={nextHref}
      />

      <div className="page-content flex gap-10 max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="flex-1 min-w-0">

          {/* Breadcrumb + meta row */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <Breadcrumb slug={params.slug} />

            {/* Reading time */}
            <span className="reading-badge">
              <Clock size={11} />
              {readingTime(doc.content)}
            </span>
          </div>

          {/* Markdown content */}
          <MarkdownContent markdown={doc.content} />

          {/* Keyboard nav hint */}
          {(prev || next) && (
            <div className="mt-6 flex justify-center">
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
          )}

          {/* Prev / Next navigation */}
          {(prev || next) && (
            <div
              className="mt-4 pt-6 border-t grid grid-cols-1 sm:grid-cols-2 gap-4"
              style={{ borderColor: 'var(--border)' }}
            >
              {prev ? (
                <Link
                  href={prevHref!}
                  className="group flex items-center gap-3 rounded-xl border p-4 transition-all hover:-translate-x-1"
                  style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
                >
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
                  style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
                >
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
          )}
        </div>

        {/* Table of contents — xl screens only */}
        <TableOfContents headings={headings} />
      </div>
    </>
  );
}
