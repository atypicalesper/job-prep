# Tailwind CSS & Component Design in Next.js

## Setup

```bash
npm install tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

```js
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          500: '#3b82f6',
          900: '#1e3a8a',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)'],
        mono: ['var(--font-mono)'],
      },
    },
  },
  plugins: [],
};

export default config;
```

```css
/* app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --radius: 0.5rem;
  }
  body {
    @apply bg-white text-gray-900 antialiased;
  }
}

@layer components {
  /* Reusable class compositions */
  .btn-primary {
    @apply inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white
           font-medium hover:bg-blue-700 focus:outline-none focus:ring-2
           focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50
           disabled:cursor-not-allowed transition-colors;
  }
}
```

---

## Design System Primitives

### Button
```tsx
// components/ui/Button.tsx
import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  // Base styles always applied
  'inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
        secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-500',
        destructive: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
        ghost: 'hover:bg-gray-100 text-gray-700 focus:ring-gray-500',
        outline: 'border border-gray-300 bg-white hover:bg-gray-50 focus:ring-blue-500',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
);

Button.displayName = 'Button';

// Usage:
// <Button variant="primary" size="lg">Submit</Button>
// <Button variant="ghost" size="icon"><Icon /></Button>
```

```ts
// lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Merges class names and resolves Tailwind conflicts
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
// cn('px-2 py-1', 'px-4') → 'py-1 px-4' (px-4 wins, no duplicate)
```

### Input
```tsx
// components/ui/Input.tsx
import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, label, id, ...props }, ref) => (
    <div className="space-y-1">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={cn(
          'block w-full rounded-md border px-3 py-2 text-sm shadow-sm',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
          'placeholder:text-gray-400',
          error ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
);

Input.displayName = 'Input';
```

### Modal / Dialog
```tsx
// components/ui/Modal.tsx
'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Prevent body scroll
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => e.target === overlayRef.current && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        className={cn(
          'relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl',
          className
        )}
      >
        {title && (
          <h2 id="modal-title" className="text-lg font-semibold text-gray-900 mb-4">
            {title}
          </h2>
        )}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
        {children}
      </div>
    </div>,
    document.body
  );
}
```

---

## Responsive Layout Patterns

### Responsive Navigation
```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="border-b bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="font-bold text-xl">Logo</Link>

          {/* Desktop nav */}
          <div className="hidden sm:flex sm:gap-6">
            <NavLinks />
          </div>

          {/* Mobile hamburger */}
          <button
            className="sm:hidden p-2"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
          >
            {open ? '✕' : '☰'}
          </button>
        </div>

        {/* Mobile menu */}
        {open && (
          <div className="sm:hidden py-4 border-t flex flex-col gap-2">
            <NavLinks />
          </div>
        )}
      </div>
    </nav>
  );
}
```

### Card Grid
```tsx
// Responsive grid: 1 col mobile → 2 col tablet → 3 col desktop
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
  {posts.map(post => (
    <PostCard key={post.id} post={post} />
  ))}
</div>
```

### Sidebar Layout
```tsx
// Sidebar collapses to top on mobile
<div className="flex flex-col md:flex-row gap-6">
  <aside className="w-full md:w-64 shrink-0">
    <Sidebar />
  </aside>
  <main className="flex-1 min-w-0">  {/* min-w-0 prevents overflow */}
    {children}
  </main>
</div>
```

---

## Component Patterns

### Compound Component
```tsx
// Keeps related components together with shared context
const CardContext = createContext<{ elevated?: boolean }>({});

function Card({ children, elevated = false }: { children: React.ReactNode; elevated?: boolean }) {
  return (
    <CardContext.Provider value={{ elevated }}>
      <div className={cn('rounded-lg border bg-white', elevated && 'shadow-lg')}>
        {children}
      </div>
    </CardContext.Provider>
  );
}

Card.Header = function CardHeader({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-4 border-b font-semibold">{children}</div>;
};

Card.Body = function CardBody({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-4">{children}</div>;
};

// Usage:
<Card elevated>
  <Card.Header>Title</Card.Header>
  <Card.Body>Content here</Card.Body>
</Card>
```

### Render Props / Slot Pattern
```tsx
// Flexible skeleton that accepts content as props
interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-gray-400 mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      <p className="text-gray-500 mt-1">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
```

---

## Dark Mode

```tsx
// tailwind.config.ts
const config = {
  darkMode: 'class',  // toggle via 'dark' class on <html>
  // ...
};

// Usage:
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">

// Toggle:
'use client';
import { useTheme } from 'next-themes';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
```

---

## Interview Questions

**Q: What is `cn()` / `clsx` + `tailwind-merge` for?**
`clsx` conditionally joins class names. `tailwind-merge` resolves Tailwind conflicts — if you pass `px-2 px-4`, it deduplicates to `px-4`. Together, they allow components to accept `className` overrides without unexpected class conflicts.

**Q: What is `cva` (class-variance-authority)?**
A library for creating component variants with type safety. You define a base class and variant maps, and get a typed function that returns the correct class string. Eliminates manual ternary chains for variant styling.

**Q: Server Component vs Client Component for UI — when does it matter?**
Pure display components (cards, badges, layouts, typography) — Server Components. Anything with `useState`, `useEffect`, event handlers, browser APIs — Client Components. Keep Client Components as leaf nodes (small, interactive-only). Push data fetching up to Server Components.

**Q: How do you share styles between components without creating a design system library?**
`@layer components` in `globals.css` for multi-use class compositions. `cn()` utility for conditional + mergeable classes. `cva` for variant-rich components. Avoid premature abstraction — three similar button usages is fine, four+ warrants a shared component.
