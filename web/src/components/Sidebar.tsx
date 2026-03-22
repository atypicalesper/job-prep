'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import gsap from 'gsap';
import Image from 'next/image';
import { ChevronRight, Search } from 'lucide-react';
import type { NavItem } from '@/lib/docs';
import ThemeToggle from './ThemeToggle';

// Icons for top-level sections (matches DOCS_ROOT directory order)
const SECTION_ICONS: Record<string, string> = {
  '01-javascript-fundamentals': '🧠',
  '02-nodejs-core': '⚙️',
  '03-typescript': '🔷',
  '04-async-patterns': '🔀',
  '05-performance': '🚀',
  '06-databases': '🗄️',
  '07-api-design': '🌐',
  '08-system-design': '🏗️',
  '09-devops': '🐳',
  '10-testing': '🧪',
  '11-security': '🔒',
  '12-interview-practice': '💬',
  '13-react': '⚛️',
  '14-dsa': '📊',
  '15-browser-internals': '🖥️',
  '16-concurrency-models': '⚡',
  '17-frontend-perf': '📈',
  '18-nextjs': '▲',
  '19-runtimes': '🟡',
  '20-ai-ml-engineering': '🤖',
  '21-python-for-ai': '🐍',
};

interface Props {
  nav: NavItem[];
  onSearchOpen?: () => void;
}

export default function Sidebar({ nav, onSearchOpen }: Props) {
  const pathname = usePathname();
  const sidebarRef = useRef<HTMLElement>(null);

  // Which top-level section is open — only one at a time (accordion)
  const activeTopSlug = nav.find(s => isAncestorActive(s, pathname))?.slug[0] ?? null;
  const [openSlug, setOpenSlug] = useState<string | null>(activeTopSlug);

  // When route changes, ensure the active section is open
  useEffect(() => {
    if (activeTopSlug) setOpenSlug(activeTopSlug);
  }, [activeTopSlug]);

  // Scroll active item into view
  useEffect(() => {
    const active = sidebarRef.current?.querySelector('.nav-active') as HTMLElement | null;
    active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [pathname]);

  return (
    <aside
      ref={sidebarRef}
      className="sidebar w-56 shrink-0 h-screen sticky top-0 flex flex-col overflow-y-auto"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--sidebar-border)' }}
      >
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <Image
            src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/logo.svg`}
            alt="logo" width={26} height={26}
            className="logo-img object-contain shrink-0" unoptimized
          />
          <span className="font-semibold text-xs leading-tight" style={{ color: 'var(--fg)' }}>
            SWE<br />
            <span style={{ color: 'var(--muted)', fontWeight: 400 }}>Interview Prep</span>
          </span>
        </Link>
        <ThemeToggle />
      </div>

      {/* Search */}
      <button
        onClick={onSearchOpen}
        className="mx-2.5 mt-2.5 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-all hover:bg-[var(--sidebar-hover)]"
        style={{ color: 'var(--muted)', border: '1px solid var(--sidebar-border)' }}
      >
        <Search size={12} />
        <span className="flex-1 text-left">Search…</span>
        <span className="text-[10px] opacity-50">⌘K</span>
      </button>

      {/* Section label */}
      <div className="px-3 pt-2.5 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
          Topics
        </span>
      </div>

      {/* Nav — accordion: one section open at a time */}
      <nav className="flex-1 px-2 pb-3">
        {nav.map(section => {
          const slug0 = section.slug[0];
          const icon = SECTION_ICONS[slug0] ?? '📄';
          const isOpen = openSlug === slug0;
          const isActive = isAncestorActive(section, pathname);

          return (
            <TopSection
              key={slug0}
              item={section}
              icon={icon}
              isOpen={isOpen}
              isActive={isActive}
              pathname={pathname}
              onToggle={() => setOpenSlug(isOpen ? null : slug0)}
            />
          );
        })}
      </nav>

      {/* Footer */}
      <div
        className="px-4 py-2 border-t shrink-0 flex items-center justify-between"
        style={{ borderColor: 'var(--sidebar-border)' }}
      >
        <a
          href="https://github.com/atypicalesper/job-prep"
          target="_blank" rel="noopener noreferrer"
          className="text-[10px] opacity-50 hover:opacity-100 transition-opacity"
          style={{ color: 'var(--accent)' }}
        >
          ↗ contribute
        </a>
        <kbd
          className="kbd cursor-pointer opacity-40 hover:opacity-80 transition-opacity text-[10px]"
          title="Keyboard shortcuts"
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }))}
        >
          ?
        </kbd>
      </div>
    </aside>
  );
}

// ─── Top-level accordion section ────────────────────────────────────────────

function TopSection({
  item, icon, isOpen, isActive, pathname, onToggle,
}: {
  item: NavItem;
  icon: string;
  isOpen: boolean;
  isActive: boolean;
  pathname: string;
  onToggle: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);
  const didMount = useRef(false);

  // Animate open/close (skip on first mount to avoid flash)
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      // Set initial state without animation
      if (contentRef.current) {
        gsap.set(contentRef.current, { height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 });
      }
      if (arrowRef.current) {
        gsap.set(arrowRef.current, { rotation: isOpen ? 90 : 0 });
      }
      return;
    }
    if (contentRef.current) {
      gsap.to(contentRef.current, {
        height: isOpen ? 'auto' : 0,
        opacity: isOpen ? 1 : 0,
        duration: 0.22,
        ease: isOpen ? 'power2.out' : 'power2.in',
      });
    }
    if (arrowRef.current) {
      gsap.to(arrowRef.current, { rotation: isOpen ? 90 : 0, duration: 0.2 });
    }
  }, [isOpen]);

  // Leaf section (no children) — render as link
  if (!item.children) {
    const href = '/' + item.slug.join('/');
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={`flex items-center gap-2 w-full rounded-md px-2 py-1 text-xs transition-colors ${active ? 'nav-active' : ''}`}
        style={{ color: active ? 'var(--sidebar-active-text)' : 'var(--muted)' }}
      >
        <span className="text-sm shrink-0">{icon}</span>
        <span className="truncate font-medium">{item.title}</span>
      </Link>
    );
  }

  return (
    <div>
      <button
        onClick={onToggle}
        className={`flex items-center gap-2 w-full rounded-md px-2 py-1 text-xs font-medium text-left transition-colors hover:bg-[var(--sidebar-hover)]`}
        style={{ color: isActive ? 'var(--fg)' : 'var(--muted)' }}
      >
        <span className="text-sm shrink-0">{icon}</span>
        <span className="flex-1 truncate">{item.title}</span>
        <span ref={arrowRef} style={{ display: 'inline-block', flexShrink: 0 }}>
          <ChevronRight size={11} style={{ color: 'var(--muted)' }} />
        </span>
      </button>

      <div
        ref={contentRef}
        style={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0, overflow: 'hidden' }}
      >
        <div
          className="mt-0.5 mb-1 space-y-0.5 border-l pl-2"
          style={{ borderColor: 'var(--sidebar-border)', marginLeft: '22px' }}
        >
          {item.children.map(child => (
            <NavNode key={child.slug.join('/')} item={child} pathname={pathname} depth={1} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Recursive nested nav node ───────────────────────────────────────────────

function NavNode({ item, pathname, depth }: { item: NavItem; pathname: string; depth: number }) {
  const active = isAncestorActive(item, pathname);
  const [open, setOpen] = useState(active);
  const contentRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);
  const didMount = useRef(false);

  useEffect(() => {
    if (active && !open) setOpen(true);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      if (contentRef.current) gsap.set(contentRef.current, { height: open ? 'auto' : 0, opacity: open ? 1 : 0 });
      if (arrowRef.current) gsap.set(arrowRef.current, { rotation: open ? 90 : 0 });
      return;
    }
    if (contentRef.current) {
      gsap.to(contentRef.current, {
        height: open ? 'auto' : 0,
        opacity: open ? 1 : 0,
        duration: 0.18,
        ease: 'power2.out',
      });
    }
    if (arrowRef.current) {
      gsap.to(arrowRef.current, { rotation: open ? 90 : 0, duration: 0.15 });
    }
  }, [open]);

  // Leaf — link
  if (!item.children) {
    const href = '/' + item.slug.join('/');
    const isActive = pathname === href;
    return (
      <Link
        href={href}
        className={`nav-item block rounded py-0.5 px-2 text-[11px] leading-5 transition-colors ${isActive ? 'nav-active' : ''}`}
        style={{
          color: isActive ? 'var(--sidebar-active-text)' : 'var(--muted)',
          paddingLeft: `${(depth - 1) * 8 + 8}px`,
        }}
      >
        {item.title}
      </Link>
    );
  }

  // Group
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="nav-item w-full flex items-center justify-between py-0.5 px-2 rounded text-[11px] leading-5 font-medium text-left transition-colors hover:bg-[var(--sidebar-hover)]"
        style={{ color: 'var(--fg)', paddingLeft: `${(depth - 1) * 8 + 8}px` }}
      >
        <span className="truncate">{item.title}</span>
        <span ref={arrowRef} style={{ display: 'inline-block', flexShrink: 0 }}>
          <ChevronRight size={10} style={{ color: 'var(--muted)' }} />
        </span>
      </button>

      <div
        ref={contentRef}
        style={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0, overflow: 'hidden' }}
      >
        <div
          className="border-l space-y-0.5 mt-0.5"
          style={{ borderColor: 'var(--sidebar-border)', marginLeft: `${(depth - 1) * 8 + 14}px`, paddingLeft: '8px' }}
        >
          {item.children.map(child => (
            <NavNode key={child.slug.join('/')} item={child} pathname={pathname} depth={depth + 1} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isAncestorActive(item: NavItem, pathname: string): boolean {
  if (!item.children) return pathname === '/' + item.slug.join('/');
  return item.children.some(child => isAncestorActive(child, pathname));
}
