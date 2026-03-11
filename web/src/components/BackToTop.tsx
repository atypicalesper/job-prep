'use client';

import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const check = () => setVisible(window.scrollY > 500);
    window.addEventListener('scroll', check, { passive: true });
    return () => window.removeEventListener('scroll', check);
  }, []);

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Scroll to top"
      className={[
        'fixed bottom-6 right-6 z-40 p-2.5 rounded-full shadow-lg',
        'transition-all duration-300 hover:scale-110 active:scale-95',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none',
      ].join(' ')}
      style={{ backgroundColor: 'var(--accent)', color: 'white' }}
    >
      <ArrowUp size={16} />
    </button>
  );
}
