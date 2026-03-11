'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ChevronRight } from 'lucide-react';
import type { NavItem } from '@/lib/docs';
import ThemeToggle from './ThemeToggle';

interface Props {
  nav: NavItem[];
}

export default function Sidebar({ nav }: Props) {
  const pathname = usePathname();
  const sidebarRef = useRef<HTMLElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useGSAP(() => {
    if (!mounted) return;
    gsap.from('.sidebar-section', {
      opacity: 0,
      x: -20,
      duration: 0.5,
      stagger: 0.06,
      ease: 'power3.out',
    });
  }, { scope: sidebarRef, dependencies: [mounted] });

  return (
    <aside
      ref={sidebarRef}
      className="sidebar w-64 shrink-0 h-screen sticky top-0 flex flex-col overflow-y-auto"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b"
        style={{ borderColor: 'var(--sidebar-border)' }}>
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <span className="text-lg font-bold" style={{ color: 'var(--accent)' }}>⚡</span>
          <span className="font-semibold text-sm leading-tight" style={{ color: 'var(--fg)' }}>
            Node Interview<br />
            <span style={{ color: 'var(--muted)', fontWeight: 400 }}>Prep Guide</span>
          </span>
        </Link>
        <ThemeToggle />
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(section => (
          <NavNode key={section.slug.join('/')} item={section} pathname={pathname} depth={0} />
        ))}
      </nav>

      <div className="px-5 py-3 text-xs border-t" style={{ color: 'var(--muted)', borderColor: 'var(--sidebar-border)' }}>
        Senior Node.js Interview Prep
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
function NavNode({ item, pathname, depth }: { item: NavItem; pathname: string; depth: number }) {
  const active = isAncestorActive(item, pathname);
  const [open, setOpen] = useState(() => active || depth === 0);
  const contentRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);

  // Keep open when navigating to a child
  useEffect(() => {
    if (active && !open) setOpen(true);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

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
            <NavNode key={child.slug.join('/')} item={child} pathname={pathname} depth={depth + 1} />
          ))}
        </div>
      </div>
    </div>
  );
}
