import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center">
      {/* Floating astronaut illustration */}
      <img
        src="/logo.png"
        alt="lost in space"
        className="logo-img w-32 h-32 object-contain mb-8 opacity-80"
        style={{ animation: 'float 4s ease-in-out infinite' }}
      />

      <h1 className="text-6xl font-bold mb-3" style={{ color: 'var(--accent)' }}>
        404
      </h1>

      <p className="text-xl font-semibold mb-2" style={{ color: 'var(--fg)' }}>
        Lost in space
      </p>

      <p className="text-sm mb-8 max-w-sm" style={{ color: 'var(--muted)' }}>
        This page doesn&apos;t exist. Maybe it was moved, deleted, or you took a wrong turn somewhere in the cosmos.
      </p>

      <div className="flex gap-3 flex-wrap justify-center">
        <Link
          href="/"
          className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105 active:scale-95"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          ← Back to home
        </Link>
        <Link
          href="/12-interview-practice/00-cheat-sheet/01-last-day-reference"
          className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-105 active:scale-95 border"
          style={{ color: 'var(--fg)', borderColor: 'var(--border)', backgroundColor: 'var(--card-bg)' }}
        >
          📋 Cheat Sheet
        </Link>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(-3deg); }
          50%       { transform: translateY(-16px) rotate(3deg); }
        }
      `}</style>
    </div>
  );
}
