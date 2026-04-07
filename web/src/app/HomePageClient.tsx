'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRef, useState, useLayoutEffect } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Brain, Server, Layers, Wrench, Database, Cloud, Code2, Bot, Network, ClipboardList, BookOpen, Play, type LucideIcon } from 'lucide-react';
import { getVisitedCountBySection, getRecent } from '@/lib/progress';
import { useNotebook } from '@/lib/notebook';
import RoughBorder from '@/components/RoughBorder';

const SECTIONS: { icon: LucideIcon; title: string; slug: string; desc: string; badge?: string }[] = [
  {
    icon: Brain,
    title: 'JavaScript',
    slug: 'javascript',
    desc: 'Event loop, closures, prototypes, async/await, generators, TypeScript type system, generics, decorators, async patterns, concurrency models, functional & OOP programming',
  },
  {
    icon: Server,
    title: 'Node.js',
    slug: 'node',
    desc: 'V8, libuv, streams, buffers, worker threads, cluster, child processes, HTTP internals, performance profiling, memory leaks, databases, SQL, NoSQL, Redis, API design, REST, GraphQL, gRPC, WebSockets',
  },
  {
    icon: Layers,
    title: 'React & Frontend',
    slug: 'react',
    desc: 'React 19, hooks, concurrent features, state management, Next.js App Router, Server Actions, browser internals, critical rendering path, Core Web Vitals, bundle optimization, Bun, Deno, edge runtimes',
  },
  {
    icon: Wrench,
    title: 'Engineering',
    slug: 'engineering',
    desc: 'System design, HLD/LLD, SOLID, microservices, DevOps, Docker, Kubernetes, CI/CD, testing (Jest, E2E), security (OWASP), DSA, algorithms, interview practice, behavioral STAR stories',
  },
  {
    icon: Database,
    title: 'Databases',
    slug: 'databases',
    desc: 'SQL deep dive, indexing (B-trees, covering indexes), transactions & ACID, isolation levels, PostgreSQL internals, Redis patterns, MongoDB, connection pooling, sharding, replication, schema design, CQRS, event sourcing',
  },
  {
    icon: Cloud,
    title: 'Cloud',
    slug: 'cloud',
    desc: 'AWS core services (IAM, EC2, S3, RDS, Lambda, SQS/SNS, ECS), Terraform, CDK, serverless patterns, Step Functions, EventBridge, DynamoDB, CloudFront, observability, cost optimization',
  },
  {
    icon: Code2,
    title: 'Python',
    slug: 'python',
    desc: 'Python essentials, NumPy, Pandas, matplotlib/seaborn, scikit-learn, PyTorch, FastAPI, async Python, OpenAI/Anthropic/HuggingFace SDKs, structured outputs, prompt caching, tooling',
  },
  {
    icon: Bot,
    title: 'AI / ML',
    slug: 'ai',
    desc: 'LLM APIs, prompt engineering, RAG, vector DBs, LangChain, LangGraph, agentic AI, MCP, AI in production, fine-tuning, RAGAS evaluation, reasoning models, local LLMs, observability, cost optimization',
  },
  {
    icon: Network,
    title: 'Networks',
    slug: 'networks',
    desc: 'OSI & TCP/IP models, IP addressing, subnetting, CIDR, TCP/UDP, DNS, HTTP/2/3, TLS handshake, routing, NAT, firewalls, VPC, security groups, load balancers, CDN, troubleshooting',
  },
  {
    icon: ClipboardList,
    title: 'Cheatsheets',
    slug: 'cheatsheets',
    desc: 'All quick-reference cheatsheets in one place — JavaScript, React, Frontend, Backend, DSA patterns, System Design. Optimised for last-minute interview revision.',
    badge: 'NEW',
  },
];

interface Props {
  pageCounts: Record<string, number>;
}

export default function HomePageClient({ pageCounts }: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  const [visitedCounts, setVisitedCounts] = useState<Record<string, number>>({});
  const [recentSlug, setRecentSlug] = useState<{ slug: string; title: string } | null>(null);

  useLayoutEffect(() => {
    const counts: Record<string, number> = {};
    for (const s of SECTIONS) {
      counts[s.slug] = getVisitedCountBySection(s.slug);
    }
    setVisitedCounts(counts);

    const recent = getRecent();
    if (recent.length > 0) {
      setRecentSlug({ slug: recent[0].slug, title: recent[0].title });
    }
  }, []);

  useGSAP(() => {
    gsap.from(heroRef.current, {
      opacity: 0,
      y: -30,
      duration: 0.7,
      ease: 'power3.out',
    });

    if (cardsRef.current) {
      gsap.from(cardsRef.current.children, {
        opacity: 0,
        y: 40,
        scale: 0.96,
        duration: 0.55,
        stagger: 0.06,
        ease: 'power3.out',
        delay: 0.2,
      });
    }
  }, { scope: gridRef, dependencies: [] });

  const { notebook } = useNotebook();
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
              dev <span style={{ color: 'var(--accent)' }}>atlas</span>
            </h1>
          </div>
        </div>

        <p className="text-lg mb-6 max-w-2xl" style={{ color: 'var(--muted)' }}>
          The complete developer knowledge base — JavaScript, TypeScript, React, Node.js, Python, AI/ML, system design, DSA, databases, and more.
        </p>

        <div className="flex gap-3 flex-wrap">
          <Link
            href="/engineering/12-interview-practice/00-cheat-sheet/01-last-day-reference"
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105 active:scale-95 hover:shadow-lg inline-flex items-center gap-2"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <ClipboardList size={14} />
            Last-Day Cheat Sheet
          </Link>
          <Link
            href="/javascript/01-javascript-fundamentals/01-event-loop/01-what-is-event-loop"
            className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-105 active:scale-95 border inline-flex items-center gap-2"
            style={{ color: 'var(--fg)', borderColor: 'var(--border)', backgroundColor: 'var(--card-bg)' }}
          >
            <BookOpen size={14} />
            Start Learning
          </Link>
          {recentSlug && (
            <Link
              href={`/${recentSlug.slug}`}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-105 active:scale-95 border inline-flex items-center gap-2"
              style={{ color: 'var(--fg)', borderColor: 'var(--border)', backgroundColor: 'var(--card-bg)' }}
              title={`Continue: ${recentSlug.title}`}
            >
              <Play size={13} />
              Continue
            </Link>
          )}
        </div>

      </div>{/* end hero */}

      {/* ── Section grid ─────────────────────────────────────── */}
      <div ref={cardsRef} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {SECTIONS.map(s => {
          const visited = visitedCounts[s.slug] ?? 0;
          const total = pageCounts[s.slug] ?? 0;
          const pct = total > 0 ? Math.round((visited / total) * 100) : 0;
          return (
            <Link
              key={s.slug}
              href={`/${s.slug}`}
              className="group block rounded-xl border p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
              style={{
                position: 'relative',
                backgroundColor: 'var(--card-bg)',
                borderColor: notebook ? 'transparent' : 'var(--card-border)',
              }}
            >
              {notebook && <RoughBorder />}
              {/* Accent bar on left edge */}
              <div className="card-accent-bar" />

              <div className="flex items-start gap-3">
                {/* Icon with subtle background */}
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200 group-hover:scale-110"
                  style={{ background: 'var(--sidebar-active)' }}
                >
                  <s.icon size={16} style={{ color: 'var(--accent)' }} />
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
          ['285+', 'Topic Files'],
          ['1200+', 'Code Examples'],
          ['700+', 'Interview Q&As'],
          ['9',    'Categories'],
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
