'use client';

import Link from 'next/link';
import { useRef, useState, useEffect } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { BookOpen, ArrowRight, Clock } from 'lucide-react';
import { getVisitedCountBySection, getRecent, type RecentPage } from '@/lib/progress';

const SECTIONS = [
  { icon: '🧠', title: 'JavaScript Fundamentals', slug: '01-javascript-fundamentals', desc: 'Event loop, closures, prototypes, async/await, generators, memory leaks' },
  { icon: '⚙️', title: 'Node.js Core', slug: '02-nodejs-core', desc: 'V8, libuv, streams, buffers, worker threads, cluster, child processes' },
  { icon: '🔷', title: 'TypeScript', slug: '03-typescript', desc: 'Type system, generics, utility types, decorators, strict mode patterns' },
  { icon: '🚀', title: 'Performance', slug: '05-performance', desc: 'Profiling, memory leaks, caching strategies, flame graphs, V8 optimization' },
  { icon: '🗄️', title: 'Databases', slug: '06-databases', desc: 'SQL joins, window functions, Redis patterns, transactions, indexing' },
  { icon: '🌐', title: 'API Design', slug: '07-api-design', desc: 'REST, GraphQL, HTTP/2, WebSockets, auth, rate limiting, Express vs Fastify' },
  { icon: '🏗️', title: 'System Design', slug: '08-system-design', desc: 'HLD, SOLID, design patterns, microservices, event sourcing, CQRS' },
  { icon: '🐳', title: 'DevOps', slug: '09-devops', desc: 'Docker multi-stage, CI/CD, serverless, Lambda patterns, containers' },
  { icon: '🧪', title: 'Testing', slug: '10-testing', desc: 'Jest, mocking strategies, Testcontainers, integration tests, race conditions' },
  { icon: '🔒', title: 'Security', slug: '11-security', desc: 'OWASP Top 10, injection, XSS, CSRF, auth vulnerabilities, helmet' },
  { icon: '💬', title: 'Interview Practice', slug: '12-interview-practice', desc: '100 rapid-fire Q&As, coding challenges, behavioral stories, cheat sheet' },
];

export default function HomePage() {
  const gridRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  const [visitedCounts, setVisitedCounts] = useState<Record<string, number>>({});
  const [recentPages, setRecentPages] = useState<RecentPage[]>([]);

  useEffect(() => {
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

  return (
    <div className="px-4 sm:px-8 py-8 sm:py-10 max-w-5xl mx-auto" ref={gridRef}>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <div ref={heroRef} className="mb-10">
        {/* Gradient glow behind title */}
        <div className="relative mb-3">
          <div
            className="absolute -inset-4 rounded-2xl opacity-10 pointer-events-none blur-2xl"
            style={{ background: 'radial-gradient(ellipse at top left, var(--accent) 0%, transparent 70%)' }}
          />
          <div className="relative flex items-center gap-4">
            <img src="/logo.png" alt="logo" className="logo-img w-14 h-14 object-contain shrink-0 drop-shadow-lg" />
            <h1 className="text-4xl font-bold hero-title">
              Node.js Interview Prep
            </h1>
          </div>
        </div>

        <p className="text-lg mb-6 max-w-2xl" style={{ color: 'var(--muted)' }}>
          Senior engineer interview guide — deep dives into JavaScript internals, Node.js architecture, TypeScript, system design, and more.
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
            href="/01-javascript-fundamentals/01-event-loop/01-event-loop-deep-dive"
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
                    {visited > 0 && (
                      <span className="visited-badge shrink-0">
                        {visited}✓
                      </span>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                    {s.desc}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* ── Stats bar ─────────────────────────────────────────── */}
      <div className="mt-10 flex gap-6 flex-wrap text-sm border-t pt-6" style={{ color: 'var(--muted)', borderColor: 'var(--border)' }}>
        {[
          ['77+', 'Topic Files'],
          ['500+', 'Code Examples'],
          ['250+', 'Interview Q&As'],
          ['11',   'Major Sections'],
        ].map(([num, label]) => (
          <div key={label} className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold" style={{ color: 'var(--accent)' }}>{num}</span>
            <span>{label}</span>
          </div>
        ))}

        {/* Total visited pages */}
        {Object.values(visitedCounts).reduce((a, b) => a + b, 0) > 0 && (
          <div className="flex items-baseline gap-1.5 ml-auto">
            <span className="text-xl font-bold" style={{ color: 'var(--success)' }}>
              {Object.values(visitedCounts).reduce((a, b) => a + b, 0)}
            </span>
            <span>pages read</span>
          </div>
        )}
      </div>
    </div>
  );
}
