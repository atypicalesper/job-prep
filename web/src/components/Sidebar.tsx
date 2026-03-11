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

  // Stagger-in animation on first mount
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
      {/* Logo / title */}
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

      {/* Nav sections */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(section => (
          <SectionGroup key={section.slug.join('/')} section={section} pathname={pathname} />
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-3 text-xs border-t" style={{ color: 'var(--muted)', borderColor: 'var(--sidebar-border)' }}>
        Senior Node.js Interview Prep
      </div>
    </aside>
  );
}

function SectionGroup({ section, pathname }: { section: NavItem; pathname: string }) {
  const isActive = section.children?.some(child => {
    const href = '/' + child.slug.join('/');
    return pathname === href || pathname.startsWith(href + '/');
  });
  const [open, setOpen] = useState(isActive ?? true);
  const contentRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);

  function toggle() {
    const next = !open;
    setOpen(next);

    if (contentRef.current) {
      gsap.to(contentRef.current, {
        height: next ? 'auto' : 0,
        opacity: next ? 1 : 0,
        duration: 0.3,
        ease: next ? 'power2.out' : 'power2.in',
      });
    }
    if (arrowRef.current) {
      gsap.to(arrowRef.current, {
        rotation: next ? 90 : 0,
        duration: 0.25,
        ease: 'power2.inOut',
      });
    }
  }

  if (!section.children) {
    const href = '/' + section.slug.join('/');
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={`sidebar-section nav-item block rounded-lg px-3 py-2 text-sm transition-colors ${active ? 'nav-active' : ''}`}
        style={{ color: active ? 'var(--sidebar-active-text)' : 'var(--fg)' }}
      >
        {section.title}
      </Link>
    );
  }

  return (
    <div className="sidebar-section">
      {/* Section header */}
      <button
        onClick={toggle}
        className="nav-item w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold transition-colors text-left"
        style={{ color: 'var(--fg)' }}
      >
        <span className="truncate">{section.title}</span>
        <span ref={arrowRef} style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          <ChevronRight size={14} style={{ color: 'var(--muted)' }} />
        </span>
      </button>

      {/* Children */}
      <div
        ref={contentRef}
        style={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0, overflow: 'hidden' }}
      >
        <div className="ml-2 mt-0.5 space-y-0.5 border-l pl-3" style={{ borderColor: 'var(--sidebar-border)' }}>
          {section.children.map(child => (
            <NavLink key={child.slug.join('/')} item={child} pathname={pathname} />
          ))}
        </div>
      </div>
    </div>
  );
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const href = '/' + item.slug.join('/');
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={`nav-item block rounded-md px-3 py-1.5 text-sm transition-colors ${active ? 'nav-active' : ''}`}
      style={{ color: active ? 'var(--sidebar-active-text)' : 'var(--muted)' }}
    >
      {item.title}
    </Link>
  );
}
