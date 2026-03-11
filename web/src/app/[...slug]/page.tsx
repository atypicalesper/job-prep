import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDocContent, getPrevNext, getAllDocSlugs, extractHeadings } from '@/lib/docs';
import MarkdownContent from '@/components/MarkdownContent';
import TableOfContents from '@/components/TableOfContents';
import ReadingProgress from '@/components/ReadingProgress';
import DocPageClient from '@/components/DocPageClient';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';

interface PageProps {
  params: { slug: string[] };
}

function readingTime(markdown: string): string {
  const words = markdown.trim().split(/\s+/).length;
  const mins  = Math.ceil(words / 200);
  return `${mins} min read`;
}

export async function generateStaticParams() {
  const slugs = getAllDocSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const doc = getDocContent(params.slug);
  return {
    title: doc ? `${doc.title} — Node Interview Prep` : 'Not Found',
  };
}

export default function DocPage({ params }: PageProps) {
  const doc = getDocContent(params.slug);
  if (!doc) notFound();

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

      <div className="flex gap-10 max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="flex-1 min-w-0">

          {/* Breadcrumb + meta row */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <nav className="flex items-center gap-2 text-xs flex-wrap" style={{ color: 'var(--muted)' }}>
              <Link href="/" className="hover:underline" style={{ color: 'var(--accent)' }}>Home</Link>
              {params.slug.map((segment, i) => {
                const href  = '/' + params.slug.slice(0, i + 1).join('/');
                const label = segment.replace(/^\d+-/, '').replace(/-/g, ' ');
                const isLast = i === params.slug.length - 1;
                return (
                  <span key={i} className="flex items-center gap-2">
                    <ChevronRight size={12} />
                    {isLast ? (
                      <span style={{ color: 'var(--fg)' }} className="capitalize">{label}</span>
                    ) : (
                      <Link href={href} className="hover:underline capitalize">{label}</Link>
                    )}
                  </span>
                );
              })}
            </nav>

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
            <div
              className="mt-6 flex items-center justify-center gap-3 text-xs"
              style={{ color: 'var(--muted)' }}
            >
              <span>
                <kbd className="kbd">[</kbd> prev
              </span>
              <span className="opacity-40">·</span>
              <span>
                next <kbd className="kbd">]</kbd>
              </span>
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
