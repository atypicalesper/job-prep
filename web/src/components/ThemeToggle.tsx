'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import gsap from 'gsap';
import { Sun, Moon } from 'lucide-react';

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
        {isDark ? <Moon size={15} /> : <Sun size={16} />}
      </span>
    </button>
  );
}

