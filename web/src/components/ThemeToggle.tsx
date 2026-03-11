'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

gsap.registerPlugin();

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const trackRef = useRef<HTMLButtonElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const sunRef = useRef<SVGSVGElement>(null);
  const moonRef = useRef<SVGSVGElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => setMounted(true), []);

  // Build timeline once after mount
  useGSAP(() => {
    if (!mounted) return;

    const tl = gsap.timeline({ paused: true });
    tlRef.current = tl;

    // Thumb slides right + track turns dark
    tl.to(thumbRef.current, {
      x: 32,
      duration: 0.45,
      ease: 'back.out(2)',
    }, 0);

    // Track bg morphs: light gold → deep indigo
    tl.fromTo(trackRef.current,
      { backgroundColor: '#fde68a' },
      { backgroundColor: '#1e1b4b', duration: 0.45, ease: 'power2.inOut' },
    0);

    // Sun rotates + fades out
    tl.to(sunRef.current, {
      rotation: 90,
      opacity: 0,
      scale: 0.5,
      transformOrigin: '50% 50%',
      duration: 0.3,
      ease: 'power2.in',
    }, 0);

    // Moon rotates in + fades
    tl.fromTo(moonRef.current,
      { rotation: -45, opacity: 0, scale: 0.5 },
      { rotation: 0, opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(1.5)' },
    0.15);

    // Set correct initial position without animation
    if (resolvedTheme === 'dark') {
      tl.progress(1);
      tl.pause();
    }
  }, { dependencies: [mounted] });

  // Animate on theme change
  useEffect(() => {
    if (!tlRef.current || !mounted) return;
    if (resolvedTheme === 'dark') {
      tlRef.current.play();
    } else {
      tlRef.current.reverse();
    }
  }, [resolvedTheme, mounted]);

  function toggle() {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }

  if (!mounted) {
    return <div className="w-16 h-8 rounded-full border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card-bg)' }} />;
  }

  return (
    <button
      ref={trackRef}
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="theme-toggle-track flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      style={{
        backgroundColor: resolvedTheme === 'dark' ? '#1e1b4b' : '#fde68a',
        transition: 'none', // GSAP handles color
      }}
    >
      {/* Sun icon — left side */}
      <svg
        ref={sunRef}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute"
        style={{
          width: 14,
          height: 14,
          left: 6,
          top: '50%',
          transform: 'translateY(-50%)',
          color: '#92400e',
          opacity: resolvedTheme === 'dark' ? 0 : 1,
        }}
      >
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

      {/* Moon icon — right side */}
      <svg
        ref={moonRef}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute"
        style={{
          width: 13,
          height: 13,
          right: 7,
          top: '50%',
          transform: 'translateY(-50%)',
          color: '#c7d2fe',
          opacity: resolvedTheme === 'dark' ? 1 : 0,
        }}
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>

      {/* Sliding thumb */}
      <div
        ref={thumbRef}
        className="theme-toggle-thumb"
        style={{
          transform: resolvedTheme === 'dark' ? 'translateX(32px)' : 'translateX(0)',
        }}
      />
    </button>
  );
}
