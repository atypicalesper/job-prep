'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

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

  useGSAP(() => {
    // Hero entrance
    gsap.from(heroRef.current, {
      opacity: 0,
      y: -30,
      duration: 0.7,
      ease: 'power3.out',
    });

    // Cards stagger in
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
      {/* Hero */}
      <div ref={heroRef} className="mb-12">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-4xl">⚡</span>
          <h1 className="text-4xl font-bold" style={{ color: 'var(--fg)' }}>
            Node.js Interview Prep
          </h1>
        </div>
        <p className="text-lg mb-6" style={{ color: 'var(--muted)' }}>
          Senior engineer interview guide — deep dives into JavaScript internals, Node.js architecture, TypeScript, system design, and more.
        </p>
        <div className="flex gap-3 flex-wrap">
          <Link
            href="/12-interview-practice/00-cheat-sheet/01-last-day-reference"
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105 active:scale-95"
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

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {SECTIONS.map(s => (
          <Link
            key={s.slug}
            href={`/${s.slug}`}
            className="topic-card group block rounded-xl border p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
            style={{
              backgroundColor: 'var(--card-bg)',
              borderColor: 'var(--card-border)',
            }}
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl leading-none mt-0.5">{s.icon}</span>
              <div>
                <h2 className="font-semibold text-sm mb-1 group-hover:text-indigo-400 transition-colors"
                  style={{ color: 'var(--fg)' }}>
                  {s.title}
                </h2>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                  {s.desc}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Stats bar */}
      <div className="mt-10 flex gap-6 flex-wrap text-sm" style={{ color: 'var(--muted)' }}>
        {[
          ['75+', 'Topic Files'],
          ['500+', 'Code Examples'],
          ['200+', 'Interview Q&As'],
          ['11', 'Major Sections'],
        ].map(([num, label]) => (
          <div key={label} className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold" style={{ color: 'var(--accent)' }}>{num}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
