import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDocContent, getDirInfo, getPrevNext, getAllDocSlugs, getAllDirSlugs, extractHeadings, extractExcerpt, humanize } from '@/lib/docs';
import type { NavItem } from '@/lib/docs';
import MarkdownContent from '@/components/MarkdownContent';
import TableOfContents from '@/components/TableOfContents';
import ReadingProgress from '@/components/ReadingProgress';
import DocPageClient from '@/components/DocPageClient';
import PrevNextNav from '@/components/PrevNextNav';
import NotebookProseDecor from '@/components/NotebookProseDecor';
import { Clock, FolderOpen, ChevronRight } from 'lucide-react';

interface PageProps {
  params: Promise<{ slug: string[] }>;
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

const SITE_URL = 'https://atypicalesper.github.io/dev-atlas';

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const canonical = `${SITE_URL}/${slug.join('/')}/`;
  const doc = getDocContent(slug);
  if (doc) {
    const description = extractExcerpt(doc.content);
    return {
      title: doc.title,
      description,
      alternates: { canonical },
      openGraph: { title: `${doc.title} — dev atlas`, description, url: canonical },
      twitter:   { title: `${doc.title} — dev atlas`, description },
    };
  }
  const dir = getDirInfo(slug);
  if (dir) {
    const description = `${dir.title} — ${dir.children.length} sections in the dev atlas developer knowledge base.`;
    return {
      title: dir.title,
      description,
      alternates: { canonical },
      openGraph: { title: `${dir.title} — dev atlas`, description, url: canonical },
      twitter:   { title: `${dir.title} — dev atlas`, description },
    };
  }
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

export default async function DocPage({ params }: PageProps) {
  const { slug } = await params;
  const doc = getDocContent(slug);

  // ── Directory index page ────────────────────────────────────────────────
  if (!doc) {
    const dir = getDirInfo(slug);
    if (!dir) notFound();

    return (
      <div className="page-content max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <Breadcrumb slug={slug} />

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
                      className="font-semibold text-sm hover:text-indigo-400 transition-colors inline-flex items-center gap-1"
                      style={{ color: 'var(--fg)' }}
                    >
                      {child.title}
                      <ChevronRight size={13} style={{ color: 'var(--muted)' }} />
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

  const { prev, next } = getPrevNext(slug);
  const headings = extractHeadings(doc.content);
  const prevHref = prev ? '/' + prev.slug.join('/') : undefined;
  const nextHref = next ? '/' + next.slug.join('/') : undefined;

  const pageUrl = `${SITE_URL}/${slug.join('/')}/`;
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
      ...slug.map((segment, i) => ({
        '@type': 'ListItem',
        position: i + 2,
        name: humanize(segment),
        item: `${SITE_URL}/${slug.slice(0, i + 1).join('/')}/`,
      })),
    ],
  };
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: doc.title,
    description: extractExcerpt(doc.content),
    url: pageUrl,
    publisher: {
      '@type': 'Organization',
      name: 'dev atlas',
      url: SITE_URL,
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <ReadingProgress />
      <DocPageClient
        slug={slug}
        title={doc.title}
        prevHref={prevHref}
        nextHref={nextHref}
      />

      <div className="page-content flex gap-10 max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="flex-1 min-w-0">

          {/* Breadcrumb + meta row */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <Breadcrumb slug={slug} />

            {/* Reading time */}
            <span className="reading-badge">
              <Clock size={11} />
              {readingTime(doc.content)}
            </span>
          </div>

          {/* Markdown content */}
          <MarkdownContent markdown={doc.content} />
          <NotebookProseDecor />

          {/* Prev / Next navigation */}
          <PrevNextNav prev={prev ?? undefined} next={next ?? undefined} prevHref={prevHref} nextHref={nextHref} />
        </div>

        {/* Table of contents — xl screens only */}
        <TableOfContents headings={headings} />
      </div>
    </>
  );
}
