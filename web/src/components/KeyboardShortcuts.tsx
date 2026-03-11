'use client';

import { useEffect, useState } from 'react';
import { X, Keyboard } from 'lucide-react';

const SHORTCUTS = [
  { category: 'Navigation', items: [
    { keys: ['['],        desc: 'Previous page' },
    { keys: [']'],        desc: 'Next page' },
    { keys: ['⌘', 'K'],  desc: 'Open search' },
    { keys: ['?'],        desc: 'Keyboard shortcuts' },
  ]},
  { category: 'Search', items: [
    { keys: ['↑', '↓'],  desc: 'Navigate results' },
    { keys: ['↵'],        desc: 'Open result' },
    { keys: ['Esc'],      desc: 'Close search' },
  ]},
  { category: 'Reading', items: [
    { keys: ['↑'],        desc: 'Scroll up' },
    { keys: ['↓'],        desc: 'Scroll down' },
  ]},
];

export default function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '?') { e.preventDefault(); setOpen(v => !v); }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl"
        style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <Keyboard size={16} style={{ color: 'var(--accent)' }} />
            <span className="font-semibold text-sm" style={{ color: 'var(--fg)' }}>
              Keyboard Shortcuts
            </span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded hover:bg-[var(--card-bg)] transition-colors"
            aria-label="Close"
          >
            <X size={15} style={{ color: 'var(--muted)' }} />
          </button>
        </div>

        {/* Shortcuts list */}
        <div className="px-5 py-4 space-y-5">
          {SHORTCUTS.map(group => (
            <div key={group.category}>
              <p
                className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: 'var(--muted)' }}
              >
                {group.category}
              </p>
              <div className="space-y-2">
                {group.items.map(item => (
                  <div key={item.desc} className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: 'var(--fg)' }}>
                      {item.desc}
                    </span>
                    <div className="flex items-center gap-1">
                      {item.keys.map((k, i) => (
                        <kbd key={i} className="kbd">{k}</kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 border-t text-xs text-center"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          Press <kbd className="kbd">?</kbd> to toggle this panel
        </div>
      </div>
    </div>
  );
}
