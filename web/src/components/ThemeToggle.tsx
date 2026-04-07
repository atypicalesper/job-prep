'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { Palette, Check } from 'lucide-react';

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
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Close on outside click or scroll
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('scroll', () => setOpen(false), { capture: true, once: true });
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const handleOpen = useCallback(() => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPanelPos({ top: rect.bottom + 6, left: rect.right - 140 });
    }
    setOpen(o => !o);
  }, []);

  // resolvedTheme is undefined until client-side JS runs
  if (!resolvedTheme) return <div className="theme-toggle-btn" aria-hidden />;

  const current = THEMES.find(t => t.id === resolvedTheme) ?? THEMES[1];

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        aria-label="Change theme"
        aria-expanded={open}
        className="theme-toggle-btn"
        title="Change theme"
      >
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
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
            position: 'fixed',
            top: panelPos.top,
            left: panelPos.left,
            zIndex: 9999,
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
            const isActive = resolvedTheme === t.id;
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
                  <Check size={11} style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--accent)' }} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
