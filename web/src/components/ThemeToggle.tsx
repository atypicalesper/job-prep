'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { Palette } from 'lucide-react';

const THEMES: { id: string; label: string; swatch: string; dark: boolean }[] = [
  { id: 'light',    label: 'Light',    swatch: '#fafafa',  dark: false },
  { id: 'dark',     label: 'Dark',     swatch: '#0b0d14',  dark: true  },
  { id: 'midnight', label: 'Midnight', swatch: '#1e1e2e',  dark: true  },
  { id: 'ocean',    label: 'Ocean',    swatch: '#1c2333',  dark: true  },
  { id: 'forest',   label: 'Forest',   swatch: '#1d2021',  dark: true  },
  { id: 'dawn',     label: 'Dawn',     swatch: '#fdf6e3',  dark: false },
  { id: 'slate',    label: 'Slate',    swatch: '#1e1e1e',  dark: true  },
];

const ACCENT: Record<string, string> = {
  light:    '#4f46e5',
  dark:     '#818cf8',
  midnight: '#cba6f7',
  ocean:    '#64b5f6',
  forest:   '#8ec07c',
  dawn:     '#c4621f',
  slate:    '#569cd6',
};

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (!mounted) return <div className="theme-toggle-btn" aria-hidden />;

  const current = THEMES.find(t => t.id === theme) ?? THEMES[1];

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        aria-label="Change theme"
        aria-expanded={open}
        className="theme-toggle-btn"
        title="Change theme"
      >
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
          {/* Colour swatch dot */}
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            backgroundColor: ACCENT[current.id] ?? current.swatch,
            flexShrink: 0,
          }} />
          <Palette size={12} style={{ color: 'var(--fg)', flexShrink: 0 }} />
        </span>
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label="Theme options"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 200,
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '6px',
            minWidth: 140,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {THEMES.map(t => {
            const isActive = theme === t.id;
            return (
              <button
                key={t.id}
                role="menuitem"
                onClick={() => { setTheme(t.id); setOpen(false); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '5px 8px',
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  background: isActive ? 'var(--sidebar-active)' : 'transparent',
                  color: isActive ? 'var(--sidebar-active-text)' : 'var(--muted)',
                  fontSize: '0.75rem',
                  fontWeight: isActive ? 600 : 400,
                  textAlign: 'left',
                  width: '100%',
                  transition: 'background 0.12s, color 0.12s',
                }}
                onMouseEnter={e => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--sidebar-hover)';
                }}
                onMouseLeave={e => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                {/* Swatch */}
                <span style={{
                  width: 14,
                  height: 14,
                  borderRadius: 4,
                  background: `linear-gradient(135deg, ${t.swatch} 50%, ${ACCENT[t.id]} 50%)`,
                  border: '1px solid rgba(128,128,128,0.25)',
                  flexShrink: 0,
                }} />
                {t.label}
                {isActive && (
                  <span style={{ marginLeft: 'auto', fontSize: '0.65rem' }}>✓</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
