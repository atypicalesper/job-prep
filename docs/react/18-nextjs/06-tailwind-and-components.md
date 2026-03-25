# Tailwind CSS & Component Design in Next.js

## Setup

Tailwind CSS is a utility-first CSS framework that replaces traditional stylesheet authoring with a set of single-purpose class names applied directly in JSX. Instead of writing `.card { padding: 1rem; border-radius: 0.5rem; }`, you write `className="p-4 rounded-lg"`. This eliminates naming things, prevents style sheet growth over time, and makes it trivially easy to see all styles for a component without leaving the file. The trade-off is that markup becomes class-heavy — tools like `cn()` and `cva` exist specifically to manage that complexity. Setting up Tailwind requires configuring PostCSS (for the build step), pointing the `content` array at your source files (so unused classes get purged), and importing the three Tailwind directives in your global stylesheet.

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

A design system primitive is a low-level, general-purpose UI component with no domain knowledge — it knows how to look and behave, but not what business concept it represents. Building these primitives as the foundation of your UI gives you consistency (every button looks the same), composability (you assemble more complex components from primitives), and a single place to make system-wide visual changes. The three primitives below — Button, Input, and Modal — represent the most common building blocks of any application UI.

### Button

The Button component uses `class-variance-authority` (CVA) to manage the combinatorial explosion of visual variants without writing conditional ternaries. CVA takes a base class string and a variant map, and returns a typed function that generates the correct class string for any combination of variant and size. The component uses `forwardRef` so it can be composed with third-party libraries that need to attach refs (like Radix UI or Floating UI). The `cn()` utility at the end allows consumers to pass a `className` override that merges cleanly with the generated classes.

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

The Input component wraps a native `<input>` with consistent styling, an accessible label, and an optional inline error state. The error prop changes the border color and background to a red tint, providing a clear visual signal without needing external state. Using `forwardRef` is important here so parent forms (especially when used with React Hook Form's `register()`) can attach refs to the underlying input. The label is always associated with the input via `htmlFor`/`id` for screen reader accessibility.

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

A modal is an overlay component that traps the user's focus and requires them to interact with it before returning to the page beneath. The implementation here uses a React portal (`createPortal`) to render the overlay directly into `document.body`, bypassing any CSS stacking context issues from parent elements. It handles two critical accessibility concerns: closing on Escape keypress and preventing body scroll while open. The `role="dialog"` and `aria-modal="true"` attributes tell screen readers this is a modal, and `aria-labelledby` associates the dialog with its title. Note: for production use, consider Radix UI's Dialog primitive, which handles focus trapping and more edge cases.

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

Tailwind's responsive design system is mobile-first: you write base styles for the smallest screen and use breakpoint prefixes (`sm:`, `md:`, `lg:`) to add or override styles at larger sizes. This is different from many traditional CSS approaches that target small screens with overrides — Tailwind's approach means your base markup is always the mobile layout, and complexity is added upward. The three patterns below cover the most common responsive challenges: navigation, content grids, and two-column sidebar layouts.

### Responsive Navigation

A responsive navigation bar must serve two distinct layouts: a horizontal link row on desktop and a collapsible drawer on mobile. The Tailwind approach uses `hidden sm:flex` (invisible on mobile, flex row on desktop) for the desktop links and `sm:hidden` (visible on mobile only) for the hamburger button. The mobile drawer conditionally renders based on a `useState` boolean — the drawer appears below the nav bar within the same container, avoiding the complexity of absolute positioning. The `aria-expanded` attribute on the button keeps the component accessible to screen reader users.

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

A responsive grid is one of Tailwind's most common and cleanest patterns. The `grid` utility creates a CSS Grid container, `grid-cols-N` sets the number of columns, and `gap-N` sets the gutters. By chaining responsive prefixes, a single `className` string moves from a single column on mobile to two on tablet to three on desktop — no media query CSS to write or maintain.

```tsx
// Responsive grid: 1 col mobile → 2 col tablet → 3 col desktop
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
  {posts.map(post => (
    <PostCard key={post.id} post={post} />
  ))}
</div>
```

### Sidebar Layout

A sidebar layout stacks vertically on mobile (using `flex-col`) and switches to a side-by-side arrangement on larger screens (`md:flex-row`). The `shrink-0` on the sidebar prevents it from squishing when the content area is wide. The `min-w-0` on the main content area is a subtle but important fix — flex children have a default `min-width: auto` which can cause text overflow; setting `min-w-0` allows the content to shrink and respect its container.

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

The compound component pattern is a way to group tightly related components under a single namespace while sharing implicit state via context. Instead of passing data through props at every level or using a flat list of unrelated components, you create a parent (`Card`) that provides context and attach sub-components to it as named properties (`Card.Header`, `Card.Body`). This gives consumers a clean, readable JSX API that clearly communicates structural intent, while keeping the internals flexible. Use this pattern when multiple components must coordinate around shared state or when you want to enforce a specific nesting structure.

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

The slot pattern (sometimes called render props or inversion of control) is a technique for creating flexible container components that accept their variable content as props rather than hardcoding it. The `EmptyState` component below has a fixed layout and styling but accepts its icon, title, description, and action button from the outside. This makes it reusable across dozens of different contexts — each use site provides different content but benefits from the same visual treatment and layout. The `action` prop is optional and rendered conditionally, so callers that don't need an action button simply omit it.

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

Dark mode in Tailwind works through the `class` strategy: when a `dark` class is present on the `<html>` element, any class prefixed with `dark:` activates. This means the same component can declare both its light and dark styles in a single `className` string. The `next-themes` library handles the mechanics of persisting the user's preference, syncing with `prefers-color-scheme`, and toggling the `dark` class without causing a flash of the wrong theme on initial render. The `darkMode: 'class'` config tells Tailwind to generate `dark:` variants.

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
