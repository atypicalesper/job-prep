import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDocContent, getPrevNext, getAllDocSlugs } from '@/lib/docs';
import MarkdownContent from '@/components/MarkdownContent';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PageProps {
  params: { slug: string[] };
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

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs mb-6 flex-wrap" style={{ color: 'var(--muted)' }}>
        <Link href="/" className="hover:underline" style={{ color: 'var(--accent)' }}>Home</Link>
        {params.slug.map((segment, i) => {
          const href = '/' + params.slug.slice(0, i + 1).join('/');
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

      {/* Markdown content */}
      <MarkdownContent markdown={doc.content} />

      {/* Prev / Next navigation */}
      {(prev || next) && (
        <div className="mt-14 pt-6 border-t grid grid-cols-2 gap-4" style={{ borderColor: 'var(--border)' }}>
          {prev ? (
            <Link
              href={'/' + prev.slug.join('/')}
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
              href={'/' + next.slug.join('/')}
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
  );
}
