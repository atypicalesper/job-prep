'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { Menu, Search as SearchIcon, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Sidebar from './Sidebar';
import Search from './Search';
import KeyboardShortcuts from './KeyboardShortcuts';
import ThemeToggle from './ThemeToggle';
import type { NavItem, SearchItem } from '@/lib/docs';

interface Props {
  nav: NavItem[];
  searchIndex: SearchItem[];
  children: React.ReactNode;
}

export default function Shell({ nav, searchIndex, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);       // mobile drawer
  const [collapsed, setCollapsed] = useState(false);           // desktop collapse
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();

  // Close mobile drawer on navigation
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  // Persist collapse state
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved === 'true') setCollapsed(true);
  }, []);
  const toggleCollapsed = () => {
    setCollapsed(v => {
      localStorage.setItem('sidebar-collapsed', String(!v));
      return !v;
    });
  };

  // Cmd+K / Ctrl+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(true); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Lock body scroll while mobile sidebar open
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  return (
    <div className="flex min-h-screen">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={[
          'fixed inset-y-0 left-0 z-30 transition-transform duration-300 ease-in-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          'md:relative md:inset-auto md:z-auto md:translate-x-0 md:transition-none',
          collapsed ? 'md:w-0 md:overflow-hidden' : '',
        ].join(' ')}
      >
        <Sidebar nav={nav} onSearchOpen={() => setSearchOpen(true)} />
      </div>

      {/* Main area */}
      <div className="flex-1 min-w-0 overflow-x-clip flex flex-col">
        {/* Mobile top bar */}
        <header
          className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b md:hidden"
          style={{ backgroundColor: 'var(--sidebar-bg)', borderColor: 'var(--sidebar-border)' }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--sidebar-hover)]"
            aria-label="Open menu"
          >
            <Menu size={20} style={{ color: 'var(--fg)' }} />
          </button>
          <span className="flex items-center gap-2 flex-1 min-w-0">
            <Image src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/logo.svg`} alt="logo" width={24} height={24} className="logo-img object-contain shrink-0" unoptimized />
            <span className="text-sm font-semibold truncate" style={{ color: 'var(--fg)' }}>dev <span style={{ color: 'var(--accent)' }}>atlas</span></span>
          </span>
          <ThemeToggle />
          <button
            onClick={() => setSearchOpen(true)}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--sidebar-hover)]"
            aria-label="Search"
          >
            <SearchIcon size={18} style={{ color: 'var(--muted)' }} />
          </button>
        </header>

        {/* Desktop collapse toggle — floats at top-left of content area */}
        <button
          onClick={toggleCollapsed}
          className="hidden md:flex items-center justify-center absolute top-3 left-3 z-10 w-7 h-7 rounded-md transition-colors hover:bg-[var(--sidebar-hover)]"
          style={{ color: 'var(--muted)' }}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed
            ? <PanelLeftOpen size={15} />
            : <PanelLeftClose size={15} />
          }
        </button>

        <main className="flex-1">{children}</main>
      </div>

      {searchOpen && <Search index={searchIndex} onClose={() => setSearchOpen(false)} />}
      <KeyboardShortcuts />
    </div>
  );
}
