'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRef, useState, useLayoutEffect } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { BookOpen, ArrowRight, Clock } from 'lucide-react';
import { getVisitedCountBySection, getRecent, type RecentPage } from '@/lib/progress';

const SECTIONS: { icon: string; title: string; slug: string; desc: string; badge?: string }[] = [
  { icon: '🧠', title: 'JavaScript Fundamentals', slug: '01-javascript-fundamentals', desc: 'Event loop, closures, prototypes, this keyword, async/await, generators, OOP, functional programming, memory & GC, polyfills, hoisting, coercion' },
  { icon: '⚙️', title: 'Node.js Core', slug: '02-nodejs-core', desc: 'V8, libuv, streams, buffers, modules, worker threads, cluster, child processes, HTTP internals, async context, anti-patterns' },
  { icon: '🔷', title: 'TypeScript', slug: '03-typescript', desc: 'Type system, generics, utility types, decorators, advanced patterns, module augmentation, TS+React, modern features, OOP' },
  { icon: '🔀', title: 'Async Patterns', slug: '04-async-patterns', desc: 'EventEmitter, concurrency control, async iterators, Kafka, RabbitMQ, p-limit, backpressure' },
  { icon: '🚀', title: 'Performance', slug: '05-performance', desc: 'Profiling, memory leaks, CPU optimization, caching strategies, observability, error tracking, flame graphs' },
  { icon: '🗄️', title: 'Databases', slug: '06-databases', desc: 'SQL, NoSQL, Redis, ORMs, connection pooling, sharding, zero-downtime migrations, CQRS, indexing' },
  { icon: '🌐', title: 'API Design', slug: '07-api-design', desc: 'REST, GraphQL, gRPC, WebSockets, SSE, CORS, tRPC, OpenAPI, federation, auth patterns, networking' },
  { icon: '🏗️', title: 'System Design', slug: '08-system-design', desc: 'HLD, LLD, SOLID, microservices, event sourcing, distributed systems, CAP, SDE3 senior topics' },
  { icon: '🐳', title: 'DevOps', slug: '09-devops', desc: 'Docker, Kubernetes, CI/CD, process management, serverless, feature flags, monorepo tooling' },
  { icon: '🧪', title: 'Testing', slug: '10-testing', desc: 'Unit tests, Jest, integration testing, E2E testing, mocking strategies, Testcontainers' },
  { icon: '🔒', title: 'Security', slug: '11-security', desc: 'OWASP Top 10, Node.js security, supply chain attacks, SBOM, secrets management' },
  { icon: '💬', title: 'Interview Practice', slug: '12-interview-practice', desc: 'Rapid-fire Q&As, behavioral STAR stories, system design walkthroughs, last-day cheat sheet' },
  { icon: '⚛️', title: 'React', slug: '13-react', desc: 'Core concepts, hooks, concurrent features, advanced patterns, state management (Zustand/Redux/Jotai), React 19' },
  { icon: '📊', title: 'DSA', slug: '14-dsa', desc: 'Big Tech roadmap, arrays, strings, trees, graphs, DP, sliding window, binary search, tries, union-find, heaps, backtracking, bit manipulation' },
  { icon: '🖥️', title: 'Browser Internals', slug: '15-browser-internals', desc: 'Critical rendering path, V8 deep dive, Web Workers, Service Workers, web storage, cookies, IndexedDB, PWA' },
  { icon: '⚡', title: 'Concurrency Models', slug: '16-concurrency-models', desc: 'JS event loop vs Go goroutines vs Python asyncio vs Java virtual threads — side-by-side comparison' },
  { icon: '📈', title: 'Frontend Perf', slug: '17-frontend-perf', desc: 'Core Web Vitals, LCP/INP/CLS, code splitting, tree shaking, lazy loading, image optimization, bundle analysis' },
  { icon: '▲', title: 'Next.js', slug: '18-nextjs', desc: 'App Router, rendering strategies, Server Actions, authentication, performance & SEO, Tailwind, architecture patterns' },
  { icon: '🟡', title: 'Runtimes', slug: '19-runtimes', desc: 'Bun, Deno, edge computing, Cloudflare Workers, V8 isolates — when and why to use each' },
  { icon: '🤖', title: 'AI/ML Engineering', slug: '20-ai-ml-engineering', desc: 'RAG, vector DBs (ChromaDB/Pinecone/pgvector/FAISS), embedding models, LangChain, LangGraph, agents, MCP, fine-tuning, evaluation, n8n, Playwright' },
  { icon: '🐍', title: 'Python for AI', slug: '21-python-for-ai', desc: 'GIL & asyncio, NumPy vectorization, Pandas, scikit-learn Pipelines, PyTorch deep learning, OpenAI/Anthropic/HuggingFace SDKs, FastAPI streaming, async patterns, interview questions', badge: 'NEW' },
];

interface Props {
  pageCounts: Record<string, number>;
}

export default function HomePageClient({ pageCounts }: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  const [visitedCounts, setVisitedCounts] = useState<Record<string, number>>({});
  const [recentPages, setRecentPages] = useState<RecentPage[]>([]);

  useLayoutEffect(() => {
    const counts: Record<string, number> = {};
    for (const s of SECTIONS) {
      counts[s.slug] = getVisitedCountBySection(s.slug);
    }
    setVisitedCounts(counts);
    setRecentPages(getRecent().slice(0, 4));
  }, []);

  useGSAP(() => {
    gsap.from(heroRef.current, {
      opacity: 0,
      y: -30,
      duration: 0.7,
      ease: 'power3.out',
    });

    gsap.from('.topic-card', {
      opacity: 0,
      y: 40,
      scale: 0.96,
      duration: 0.55,
      stagger: 0.06,
      ease: 'power3.out',
      delay: 0.2,
    });
  }, { scope: gridRef });

  const totalVisited = Object.values(visitedCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="px-4 sm:px-8 py-8 sm:py-10 max-w-5xl mx-auto" ref={gridRef}>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <div ref={heroRef} className="mb-10">
        {/* Gradient glow behind title */}
        <div className="relative mb-3">
          {/* Dot grid background */}
          <div
            className="absolute -inset-6 rounded-2xl pointer-events-none opacity-[0.035] dark:opacity-[0.06]"
            style={{
              backgroundImage: 'radial-gradient(circle, var(--fg) 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }}
          />
          <div
            className="absolute -inset-4 rounded-2xl opacity-[0.12] pointer-events-none blur-2xl"
            style={{ background: 'radial-gradient(ellipse at top left, var(--accent) 0%, transparent 70%)' }}
          />
          <div className="relative flex items-center gap-4">
            <Image src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/logo.svg`} alt="logo" width={72} height={72} className="logo-img object-contain shrink-0 drop-shadow-lg" unoptimized />
            <h1 className="text-4xl font-bold hero-title">
              SWE Interview Prep
            </h1>
          </div>
        </div>

        <p className="text-lg mb-6 max-w-2xl" style={{ color: 'var(--muted)' }}>
          Software engineer interview guide — JavaScript, React, Node.js, TypeScript, DSA, system design, databases, AI/ML engineering, and more.
        </p>

        <div className="flex gap-3 flex-wrap">
          <Link
            href="/12-interview-practice/00-cheat-sheet/01-last-day-reference"
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105 active:scale-95 hover:shadow-lg"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            📋 Last-Day Cheat Sheet
          </Link>
          <Link
            href="/01-javascript-fundamentals/01-event-loop/01-what-is-event-loop"
            className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-105 active:scale-95 border"
            style={{ color: 'var(--fg)', borderColor: 'var(--border)', backgroundColor: 'var(--card-bg)' }}
          >
            🧠 Start Learning
          </Link>
        </div>
      </div>

      {/* ── Continue learning (only when visited pages exist) ── */}
      {recentPages.length > 0 && (
        <div className="mb-8">
          <p
            className="text-[11px] font-semibold uppercase tracking-wider mb-3 flex items-center gap-2"
            style={{ color: 'var(--muted)' }}
          >
            <Clock size={12} />
            Continue learning
          </p>
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
            {recentPages.map(p => (
              <Link
                key={p.slug}
                href={'/' + p.slug}
                className="recent-card shrink-0 flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm"
                style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
              >
                <BookOpen size={13} style={{ color: 'var(--accent)' }} className="shrink-0" />
                <span
                  className="truncate font-medium"
                  style={{ color: 'var(--fg)', maxWidth: '180px' }}
                >
                  {p.title}
                </span>
                <ArrowRight size={12} style={{ color: 'var(--muted)' }} className="shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Section grid ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {SECTIONS.map(s => {
          const visited = visitedCounts[s.slug] ?? 0;
          const total = pageCounts[s.slug] ?? 0;
          const pct = total > 0 ? Math.round((visited / total) * 100) : 0;
          return (
            <Link
              key={s.slug}
              href={`/${s.slug}`}
              className="topic-card group block rounded-xl border p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
              style={{
                backgroundColor: 'var(--card-bg)',
                borderColor: 'var(--card-border)',
              }}
            >
              {/* Accent bar on left edge */}
              <div className="card-accent-bar" />

              <div className="flex items-start gap-3">
                {/* Icon with subtle background */}
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-lg transition-all duration-200 group-hover:scale-110"
                  style={{ background: 'var(--sidebar-active)' }}
                >
                  {s.icon}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h2
                      className="font-semibold text-sm group-hover:text-indigo-400 transition-colors truncate"
                      style={{ color: 'var(--fg)' }}
                    >
                      {s.title}
                    </h2>
                    {/* NEW badge — hidden once the section has been visited */}
                    {s.badge && visited === 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md text-white shrink-0" style={{ backgroundColor: 'var(--accent)' }}>
                        {s.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                    {s.desc}
                  </p>

                  {/* Progress bar — only when user has visited at least one page */}
                  {visited > 0 && total > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
                          {visited}/{total} pages
                        </span>
                        <span
                          className="text-[10px] font-semibold"
                          style={{ color: pct === 100 ? 'var(--success)' : 'var(--accent)' }}
                        >
                          {pct}%
                        </span>
                      </div>
                      <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: pct === 100 ? 'var(--success)' : 'var(--accent)',
                            transition: 'width 0.5s ease',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* ── Stats bar ─────────────────────────────────────────── */}
      <div className="mt-10 flex gap-6 flex-wrap items-center text-sm border-t pt-6" style={{ color: 'var(--muted)', borderColor: 'var(--border)' }}>
        {[
          ['270+', 'Topic Files'],
          ['1100+', 'Code Examples'],
          ['650+', 'Interview Q&As'],
          ['21',   'Major Sections'],
        ].map(([num, label]) => (
          <div key={label} className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold tabular-nums" style={{ color: 'var(--accent)', letterSpacing: '-0.02em' }}>{num}</span>
            <span className="text-xs">{label}</span>
          </div>
        ))}

        <div className="ml-auto flex items-center gap-3">
          {/* Total visited pages */}
          {totalVisited > 0 && (
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold" style={{ color: 'var(--success)' }}>
                {totalVisited}
              </span>
              <span>pages read</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
