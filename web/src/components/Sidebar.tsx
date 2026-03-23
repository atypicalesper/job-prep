'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import gsap from 'gsap';
import Image from 'next/image';
import { ChevronRight, Search, ArrowLeft } from 'lucide-react';
import type { NavItem } from '@/lib/docs';
import ThemeToggle from './ThemeToggle';

const SECTION_ICONS: Record<string, string> = {
  'node': '💻',
  'python': '🐍',
  'ai': '🤖',
  'networks': '📡',
};

interface Props {
  nav: NavItem[];
  onSearchOpen?: () => void;
}

export default function Sidebar({ nav, onSearchOpen }: Props) {
  const pathname = usePathname();
  const sidebarRef = useRef<HTMLElement>(null);

  // Detect which top-level section we're inside (null = home)
  const activeTopSlug = pathname === '/' ? null : pathname.split('/')[1] ?? null;
  const activeSection = activeTopSlug ? nav.find(s => s.slug[0] === activeTopSlug) ?? null : null;

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
            dev <span style={{ color: 'var(--accent)' }}>atlas</span>
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

      {activeSection ? (
        /* ── Section view: only current section's tree ── */
        <SectionNav section={activeSection} pathname={pathname} />
      ) : (
        /* ── Home view: all sections as compact list ── */
        <AllSectionsNav nav={nav} pathname={pathname} />
      )}

      {/* Footer */}
      <div
        className="px-4 py-2 border-t shrink-0 flex items-center justify-between mt-auto"
        style={{ borderColor: 'var(--sidebar-border)' }}
      >
        <a
          href="https://github.com/atypicalesper/dev-atlas"
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

// ─── Home view: flat list of all sections ────────────────────────────────────

function AllSectionsNav({ nav, pathname }: { nav: NavItem[]; pathname: string }) {
  return (
    <nav className="flex-1 px-2 pt-2 pb-3 overflow-y-auto">
      <div className="px-1 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
          Topics
        </span>
      </div>
      {nav.map(section => {
        const slug0 = section.slug[0];
        const icon = SECTION_ICONS[slug0] ?? '📄';
        // First leaf page in this section for the href
        const href = getFirstHref(section);
        const isActive = pathname.startsWith('/' + slug0);

        return (
          <Link
            key={slug0}
            href={href}
            className="flex items-center gap-2.5 w-full rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-[var(--sidebar-hover)]"
            style={{ color: isActive ? 'var(--sidebar-active-text)' : 'var(--muted)' }}
          >
            <span className="text-sm shrink-0">{icon}</span>
            <span className="truncate font-medium">{section.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}

// ─── Section view: back button + section nav tree ────────────────────────────

function SectionNav({ section, pathname }: { section: NavItem; pathname: string }) {
  const slug0 = section.slug[0];
  const icon = SECTION_ICONS[slug0] ?? '📄';

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Back to all topics */}
      <div className="px-2 pt-2">
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] transition-colors hover:bg-[var(--sidebar-hover)]"
          style={{ color: 'var(--muted)' }}
        >
          <ArrowLeft size={11} />
          <span>All topics</span>
        </Link>
      </div>

      {/* Section heading */}
      <div
        className="flex items-center gap-2 px-3 py-2 mx-2 mt-1 mb-0.5 rounded-lg"
        style={{ backgroundColor: 'var(--sidebar-active)', color: 'var(--fg)' }}
      >
        <span className="text-base shrink-0">{icon}</span>
        <span className="font-semibold text-[11px] leading-tight truncate">{section.title}</span>
      </div>

      {/* Nav tree — only this section */}
      <nav className="flex-1 px-2 pb-3 overflow-y-auto">
        <div
          className="mt-1 space-y-0.5"
        >
          {(section.children ?? []).map(child => (
            <NavNode key={child.slug.join('/')} item={child} pathname={pathname} depth={0} />
          ))}
        </div>
      </nav>
    </div>
  );
}

// ─── Recursive nav node ───────────────────────────────────────────────────────

function NavNode({ item, pathname, depth }: { item: NavItem; pathname: string; depth: number }) {
  const isActive = isAncestorActive(item, pathname);
  const [open, setOpen] = useState(isActive);
  const contentRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);
  const didMount = useRef(false);

  useEffect(() => {
    if (isActive && !open) setOpen(true);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      if (contentRef.current) gsap.set(contentRef.current, { height: open ? 'auto' : 0, opacity: open ? 1 : 0 });
      if (arrowRef.current) gsap.set(arrowRef.current, { rotation: open ? 90 : 0 });
      return;
    }
    if (contentRef.current) {
      gsap.to(contentRef.current, { height: open ? 'auto' : 0, opacity: open ? 1 : 0, duration: 0.18, ease: 'power2.out' });
    }
    if (arrowRef.current) {
      gsap.to(arrowRef.current, { rotation: open ? 90 : 0, duration: 0.15 });
    }
  }, [open]);

  // Leaf — link
  if (!item.children) {
    const href = '/' + item.slug.join('/');
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={`nav-item block rounded py-0.5 px-2 text-[11px] leading-5 transition-colors ${active ? 'nav-active' : ''}`}
        style={{
          color: active ? 'var(--sidebar-active-text)' : 'var(--muted)',
          paddingLeft: `${depth * 8 + 8}px`,
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
        style={{ color: isActive ? 'var(--fg)' : 'var(--muted)', paddingLeft: `${depth * 8 + 8}px` }}
      >
        <span className="truncate">{item.title}</span>
        <span ref={arrowRef} style={{ display: 'inline-block', flexShrink: 0 }}>
          <ChevronRight size={10} style={{ color: 'var(--muted)' }} />
        </span>
      </button>

      <div ref={contentRef} style={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0, overflow: 'hidden' }}>
        <div
          className="border-l space-y-0.5 mt-0.5"
          style={{ borderColor: 'var(--sidebar-border)', marginLeft: `${depth * 8 + 14}px`, paddingLeft: '8px' }}
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

/** Get the href for the first leaf page in a section */
function getFirstHref(item: NavItem): string {
  if (!item.children) return '/' + item.slug.join('/');
  return getFirstHref(item.children[0]);
}
