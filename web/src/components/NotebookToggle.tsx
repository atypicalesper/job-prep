'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { PenLine } from 'lucide-react';
import { useNotebook } from '@/lib/notebook';

export default function NotebookToggle() {
  const { notebook, toggleNotebook } = useNotebook();
  const [mounted, setMounted] = useState(false);
  const rippleRef = useRef<HTMLSpanElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);

  useEffect(() => setMounted(true), []);

  function handleToggle() {
    if (rippleRef.current) {
      gsap.fromTo(
        rippleRef.current,
        { scale: 0, opacity: 0.5 },
        { scale: 10, opacity: 0, duration: 0.55, ease: 'power2.out' },
      );
    }

    if (iconRef.current) {
      gsap.to(iconRef.current, {
        rotation: notebook ? -20 : 20,
        scale: 0,
        opacity: 0,
        duration: 0.18,
        ease: 'power2.in',
        onComplete: () => {
          toggleNotebook();
          gsap.fromTo(
            iconRef.current,
            { rotation: notebook ? 20 : -20, scale: 0, opacity: 0 },
            { rotation: 0, scale: 1, opacity: 1, duration: 0.28, ease: 'back.out(2)' },
          );
        },
      });
    } else {
      toggleNotebook();
    }
  }

  if (!mounted) return <div className="theme-toggle-btn" aria-hidden />;

  return (
    <button
      onClick={handleToggle}
      aria-label={notebook ? 'Disable notebook theme' : 'Enable notebook theme'}
      title={notebook ? 'Notebook mode on' : 'Notebook mode off'}
      className="theme-toggle-btn"
      style={notebook ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : {}}
    >
      <span
        ref={rippleRef}
        className="theme-toggle-ripple"
        style={{ backgroundColor: notebook ? 'rgba(255,255,255,0.3)' : 'var(--accent)' }}
      />
      <span ref={iconRef} className="theme-toggle-icon" style={notebook ? { color: '#fff' } : {}}>
        <PenLine size={15} />
      </span>
    </button>
  );
}
