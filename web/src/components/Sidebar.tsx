'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import Image from 'next/image';
import { ChevronRight, Search, ChevronsUpDown } from 'lucide-react';
import type { NavItem } from '@/lib/docs';
import ThemeToggle from './ThemeToggle';

interface Props {
  nav: NavItem[];
  onSearchOpen?: () => void;
}

export default function Sidebar({ nav, onSearchOpen }: Props) {
  const pathname = usePathname();
  const sidebarRef = useRef<HTMLElement>(null);
  // collapseKey: increment to collapse all; negative to expand all
  const [collapseKey, setCollapseKey] = useState(0);


  // Scroll active nav item into view whenever the page changes
  useEffect(() => {
    const active = sidebarRef.current?.querySelector('.nav-active') as HTMLElement | null;
    active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [pathname]);

  return (
    <aside
      ref={sidebarRef}
      className="sidebar w-64 shrink-0 h-screen sticky top-0 flex flex-col overflow-y-auto"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b"
        style={{ borderColor: 'var(--sidebar-border)' }}>
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <Image src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/logo.svg`} alt="logo" width={32} height={32} className="logo-img object-contain shrink-0" unoptimized />
          <span className="font-semibold text-sm leading-tight" style={{ color: 'var(--fg)' }}>
            SWE<br />
            <span style={{ color: 'var(--muted)', fontWeight: 400 }}>Interview Prep</span>
          </span>
        </Link>
        <ThemeToggle />
      </div>

      {/* Search button */}
      <button
        onClick={onSearchOpen}
        className="mx-3 mt-3 flex items-center gap-2 w-[calc(100%-1.5rem)] rounded-lg px-3 py-2 text-sm transition-all hover:bg-[var(--sidebar-hover)] hover:border-[var(--accent)] focus:outline-none"
        style={{ color: 'var(--muted)', border: '1px solid var(--sidebar-border)', transition: 'background 0.15s, border-color 0.15s' }}
      >
        <Search size={14} />
        <span className="flex-1 text-left text-xs">Search…</span>
        <span className="text-[10px] opacity-60">⌘K</span>
      </button>

      {/* Nav header with collapse/expand all */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
          Topics
        </span>
        <button
          onClick={() => setCollapseKey(k => k + 1)}
          className="flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 transition-colors hover:bg-[var(--sidebar-hover)]"
          style={{ color: 'var(--muted)' }}
          title="Collapse all sections"
        >
          <ChevronsUpDown size={11} />
          Collapse
        </button>
      </div>

      <nav className="flex-1 px-3 pb-3 space-y-1">
        {nav.map(section => (
          <NavNode key={section.slug.join('/')} item={section} pathname={pathname} depth={0} collapseKey={collapseKey} />
        ))}
      </nav>

      <div
        className="px-4 pt-3 pb-2 border-t space-y-2"
        style={{ borderColor: 'var(--sidebar-border)' }}
      >
        {/* Row: shortcuts */}
        <div className="flex items-center justify-end gap-2">
          <kbd
            className="kbd cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
            title="Keyboard shortcuts"
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }))}
          >
            ?
          </kbd>
        </div>

        {/* Row: contribute + developed by */}
        <div className="flex items-center justify-between gap-2">
          <a
            href="https://github.com/atypicalesper/job-prep"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] transition-colors hover:opacity-100 opacity-60"
            style={{ color: 'var(--accent)' }}
          >
            ↗ contribute
          </a>
          <span className="text-[10px] opacity-40" style={{ color: 'var(--muted)' }}>
            by <a
              href="https://atypicalesper.github.io"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-100 transition-opacity"
              style={{ color: 'var(--accent)' }}
            >atypicalesper</a>
          </span>
        </div>
      </div>
    </aside>
  );
}

/** Checks whether any descendant file matches the current pathname */
function isAncestorActive(item: NavItem, pathname: string): boolean {
  if (!item.children) {
    return pathname === '/' + item.slug.join('/');
  }
  return item.children.some(child => isAncestorActive(child, pathname));
}

/** Recursive nav node — renders as collapsible group OR a leaf link */
function NavNode({ item, pathname, depth, collapseKey }: { item: NavItem; pathname: string; depth: number; collapseKey: number }) {
  const active = isAncestorActive(item, pathname);
  const [open, setOpen] = useState(() => active);
  const contentRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);

  // Keep open when navigating to a child
  useEffect(() => {
    if (active && !open) setOpen(true);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Collapse all when collapseKey increments (except currently active)
  useEffect(() => {
    if (collapseKey === 0) return;
    if (!active) {
      setOpen(false);
      if (contentRef.current) gsap.set(contentRef.current, { height: 0, opacity: 0 });
      if (arrowRef.current) gsap.set(arrowRef.current, { rotation: 0 });
    }
  }, [collapseKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle() {
    const next = !open;
    setOpen(next);
    if (contentRef.current) {
      gsap.to(contentRef.current, {
        height: next ? 'auto' : 0,
        opacity: next ? 1 : 0,
        duration: 0.28,
        ease: next ? 'power2.out' : 'power2.in',
      });
    }
    if (arrowRef.current) {
      gsap.to(arrowRef.current, {
        rotation: next ? 90 : 0,
        duration: 0.22,
        ease: 'power2.inOut',
      });
    }
  }

  // Leaf — render as a link
  if (!item.children) {
    const href = '/' + item.slug.join('/');
    const isActive = pathname === href;
    const indent = depth > 1 ? `${(depth - 1) * 10}px` : undefined;
    return (
      <Link
        href={href}
        className={`sidebar-section nav-item block rounded-md py-1.5 text-sm transition-colors ${isActive ? 'nav-active' : ''}`}
        style={{
          color: isActive ? 'var(--sidebar-active-text)' : 'var(--muted)',
          paddingLeft: indent ?? '0.75rem',
          paddingRight: '0.75rem',
        }}
      >
        {item.title}
      </Link>
    );
  }

  // Group — render as collapsible
  const isTopLevel = depth === 0;
  const paddingLeft = isTopLevel ? '0.75rem' : `${depth * 10}px`;

  return (
    <div className={isTopLevel ? 'sidebar-section' : ''}>
      <button
        onClick={toggle}
        className={`nav-item w-full flex items-center justify-between py-2 rounded-lg text-sm transition-colors text-left ${isTopLevel ? 'font-semibold' : 'font-medium'}`}
        style={{
          color: 'var(--fg)',
          paddingLeft,
          paddingRight: '0.75rem',
        }}
      >
        <span className="truncate">{item.title}</span>
        <span
          ref={arrowRef}
          style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}
        >
          <ChevronRight size={13} style={{ color: 'var(--muted)' }} />
        </span>
      </button>

      <div
        ref={contentRef}
        style={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0, overflow: 'hidden' }}
      >
        <div
          className="space-y-0.5 border-l mt-0.5 mb-1"
          style={{ borderColor: 'var(--sidebar-border)', marginLeft: `calc(${paddingLeft} + 6px)`, paddingLeft: '10px' }}
        >
          {item.children.map(child => (
            <NavNode key={child.slug.join('/')} item={child} pathname={pathname} depth={depth + 1} collapseKey={collapseKey} />
          ))}
        </div>
      </div>
    </div>
  );
}
