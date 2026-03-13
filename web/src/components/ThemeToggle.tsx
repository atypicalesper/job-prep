'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import gsap from 'gsap';

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const btnRef = useRef<HTMLButtonElement>(null);
  const rippleRef = useRef<HTMLSpanElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);

  useEffect(() => setMounted(true), []);

  function toggle() {
    const next = resolvedTheme === 'dark' ? 'light' : 'dark';

    // Radial ripple pans out from the button in the incoming theme's color
    if (rippleRef.current) {
      gsap.fromTo(
        rippleRef.current,
        { scale: 0, opacity: 0.5 },
        { scale: 10, opacity: 0, duration: 0.55, ease: 'power2.out' },
      );
    }

    // Icon spins out, theme switches, icon spins in
    if (iconRef.current) {
      gsap.to(iconRef.current, {
        rotation: next === 'dark' ? 30 : -30,
        scale: 0,
        opacity: 0,
        duration: 0.18,
        ease: 'power2.in',
        onComplete: () => {
          setTheme(next);
          gsap.fromTo(
            iconRef.current,
            { rotation: next === 'dark' ? -30 : 30, scale: 0, opacity: 0 },
            { rotation: 0, scale: 1, opacity: 1, duration: 0.28, ease: 'back.out(2)' },
          );
        },
      });
    } else {
      setTheme(next);
    }
  }

  if (!mounted) {
    return <div className="theme-toggle-btn" aria-hidden />;
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      ref={btnRef}
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="theme-toggle-btn"
    >
      {/* Ripple — expands outward from button center in the incoming theme's color */}
      <span
        ref={rippleRef}
        className="theme-toggle-ripple"
        style={{ backgroundColor: isDark ? '#fde68a' : '#312e81' }}
      />

      {/* Icon — sun in light mode, moon in dark mode */}
      <span ref={iconRef} className="theme-toggle-icon">
        {isDark ? <MoonIcon /> : <SunIcon />}
      </span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={15} height={15} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
