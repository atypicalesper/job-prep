# Render Optimization

## Understanding Re-renders

A "re-render" in React means calling the component function again and diffing the returned VDOM. It does NOT mean updating the real DOM (that only happens if the diff finds changes).

```
Re-render triggers:
  1. State change (useState setter, useReducer dispatch)
  2. Parent re-renders (default behavior)
  3. Context value changes (for consumers)
  4. Custom hook state changes (hooks are just functions — state changes inside them trigger re-renders of the host component)
```

### Measuring Re-renders

```jsx
// Quick way: console.log in component body
function MyComponent() {
  console.log('MyComponent renders');
  // ...
}

// Better: React DevTools Profiler
// - Highlights components that re-rendered
// - Shows render time and why each component rendered

// React 18+ StrictMode doubles renders in development
// Don't count those as "unnecessary" — they're intentional
```

---

## React.memo — Skip Re-renders When Props Unchanged

`React.memo` is a higher-order component that wraps a component and memoizes the last rendered output. Before re-rendering, React performs a shallow comparison of the previous and new props. If all props are shallowly equal (`Object.is` for primitives, reference equality for objects/functions/arrays), React reuses the last rendered output and skips calling the component function entirely. This is an optimization — use it on components that render frequently with the same props and are expensive to render. Do not apply it everywhere; the comparison itself has a small cost that can exceed the render cost for trivial components.

```jsx
// Without memo: re-renders every time parent renders
function ExpensiveList({ items }) {
  console.log('ExpensiveList renders');
  return (
    <ul>
      {items.map(item => (
        <li key={item.id}>{item.name}</li>
      ))}
    </ul>
  );
}

// With memo: skips re-render if props are shallowly equal
const ExpensiveList = React.memo(function ExpensiveList({ items }) {
  console.log('ExpensiveList renders');
  return (
    <ul>
      {items.map(item => (
        <li key={item.id}>{item.name}</li>
      ))}
    </ul>
  );
});
```

### Custom Comparison Function

```jsx
const UserCard = React.memo(
  function UserCard({ user, onClick }) {
    return <div onClick={onClick}>{user.name}</div>;
  },
  (prevProps, nextProps) => {
    // Return true to SKIP re-render (props are "equal")
    // Return false to RE-RENDER
    return prevProps.user.id === nextProps.user.id
        && prevProps.user.name === nextProps.user.name;
    // Ignores onClick changes intentionally
  }
);
```

### When React.memo Breaks

```jsx
function Parent() {
  const [count, setCount] = useState(0);

  // PROBLEM 1: Inline object — new reference every render
  return <MemoChild config={{ color: 'red' }} />;
  // Fix: const config = useMemo(() => ({ color: 'red' }), []);

  // PROBLEM 2: Inline function — new reference every render
  return <MemoChild onClick={() => console.log('hi')} />;
  // Fix: const onClick = useCallback(() => console.log('hi'), []);

  // PROBLEM 3: Children as JSX — new reference every render
  return <MemoChild><span>Hello</span></MemoChild>;
  // children is a new React element object each time
  // Fix: Extract child to a stable variable or rethink the structure
}
```

---

## useMemo and useCallback — Stabilizing References

The fundamental problem that `useMemo` and `useCallback` solve together is reference instability. In JavaScript, `{ a: 1 } !== { a: 1 }` and `() => {} !== () => {}` — every render creates new references for objects and functions even when the values are logically identical. This instability breaks `React.memo` (which compares prop references) and causes `useEffect` to re-run unnecessarily (when a dependency is technically new but semantically unchanged). `useMemo` stabilizes object/array references; `useCallback` stabilizes function references. They are most powerful when used in concert with `React.memo`.

### useMemo: Memoize Computed Values

```jsx
function Dashboard({ transactions, dateRange }) {
  // Expensive: only recompute when inputs change
  const summary = useMemo(() => {
    return transactions
      .filter(t => t.date >= dateRange.start && t.date <= dateRange.end)
      .reduce((acc, t) => ({
        total: acc.total + t.amount,
        count: acc.count + 1,
      }), { total: 0, count: 0 });
  }, [transactions, dateRange]);

  // Also: stabilize object references for child components
  const chartData = useMemo(() => ({
    labels: transactions.map(t => t.date),
    values: transactions.map(t => t.amount),
  }), [transactions]);

  return (
    <div>
      <p>Total: {summary.total} ({summary.count} transactions)</p>
      <MemoChart data={chartData} />
    </div>
  );
}
```

### useCallback: Memoize Functions

```jsx
function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  // Stable function reference — won't cause ResultList to re-render
  const handleSelect = useCallback((item) => {
    console.log('Selected:', item.name);
  }, []); // no deps — never changes

  // Function that depends on state
  const handleSearch = useCallback(() => {
    fetchResults(query).then(setResults);
  }, [query]); // new reference only when query changes

  return (
    <div>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <button onClick={handleSearch}>Search</button>
      <MemoResultList results={results} onSelect={handleSelect} />
    </div>
  );
}

const MemoResultList = React.memo(function ResultList({ results, onSelect }) {
  console.log('ResultList renders');
  return results.map(r => (
    <div key={r.id} onClick={() => onSelect(r)}>{r.name}</div>
  ));
});
```

---

## When NOT to Memoize

Memoization has costs: memory for the cached value + comparison overhead on every render.

```jsx
// UNNECESSARY: Trivial computation
const fullName = useMemo(() => `${first} ${last}`, [first, last]);
// Just do: const fullName = `${first} ${last}`;

// UNNECESSARY: No memo'd child consuming this
const handleClick = useCallback(() => {
  setCount(c => c + 1);
}, []);
// If no React.memo child receives this, useCallback does nothing useful

// UNNECESSARY: Component renders rarely anyway
const MemoFooter = React.memo(Footer);
// If the parent rarely re-renders, memo adds overhead for no gain

// UNNECESSARY: Primitive props
<MemoChild count={5} name="Alice" />
// Primitives are compared by value — they'll be equal, no memo needed
// (Actually memo still helps here by skipping the child's render entirely,
//  but the comparison cost is the same as the render cost for simple components)
```

### The Rule of Thumb

Memoize when:
- The component renders **often** with the **same props**
- The component is **expensive** to render (large lists, heavy computation)
- The value is passed to a dependency array of another hook

Don't memoize when:
- The component is cheap to render
- Props change almost every render anyway
- You're prematurely optimizing before measuring

---

## Avoiding Unnecessary Re-renders — Structural Patterns

Before reaching for `useMemo`/`useCallback`, consider whether the component tree structure itself is the problem. Two structural patterns — moving state down and lifting content up — can eliminate unnecessary re-renders without any memoization overhead. These patterns work because React only re-renders a component when its own state changes or its parent re-renders. By restructuring the tree so that frequently-changing state lives in a small, isolated component, you prevent its changes from reaching expensive siblings.

### Pattern 1: Move State Down

```jsx
// BAD: The entire App re-renders on every keystroke
function App() {
  const [text, setText] = useState('');

  return (
    <div>
      <input value={text} onChange={e => setText(e.target.value)} />
      <ExpensiveTree />  {/* re-renders on every keystroke! */}
    </div>
  );
}

// GOOD: Extract the stateful part
function App() {
  return (
    <div>
      <SearchInput />     {/* only this re-renders on keystroke */}
      <ExpensiveTree />   {/* not affected */}
    </div>
  );
}

function SearchInput() {
  const [text, setText] = useState('');
  return <input value={text} onChange={e => setText(e.target.value)} />;
}
```

### Pattern 2: Lift Content Up (Children Pattern)

```jsx
// BAD: ScrollTracker re-renders children on every scroll
function ScrollTracker() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handler = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <div>
      <p>Scrolled: {scrollY}px</p>
      <ExpensiveContent />  {/* re-renders on every scroll! */}
    </div>
  );
}

// GOOD: Accept children — they're created by the parent, not affected
function ScrollTracker({ children }) {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handler = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <div>
      <p>Scrolled: {scrollY}px</p>
      {children}  {/* same reference — React skips re-render */}
    </div>
  );
}

// Usage
<ScrollTracker>
  <ExpensiveContent />
</ScrollTracker>
```

---

## Virtualization — Large Lists

Virtualization (also called windowing) is the technique of rendering only the DOM nodes that are currently visible in the viewport. For a list of 10,000 items, a naive implementation creates 10,000 DOM nodes — each with layout properties, event listeners, and style calculations. Virtualization reduces this to roughly the number of items that fit in the viewport (typically 15–30 nodes), dramatically reducing initial paint time, memory usage, and scroll jank. The container maintains its full scrollable height (so the scrollbar behaves correctly), but only the visible nodes exist in the DOM. The library repositions nodes as the user scrolls.

Rendering thousands of DOM nodes kills performance. Virtualization only renders items visible in the viewport.

```
┌──────────────────────────┐
│                          │  ← Items above viewport: NOT rendered
│   (scrolled past)        │
│                          │
├──────────────────────────┤ ─── viewport top
│   Item 47                │
│   Item 48                │  ← Only these are real DOM nodes
│   Item 49                │
│   Item 50                │
│   Item 51                │
├──────────────────────────┤ ─── viewport bottom
│                          │
│   (not yet scrolled to)  │  ← Items below viewport: NOT rendered
│                          │
└──────────────────────────┘
```

### Using @tanstack/react-virtual

```jsx
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualList({ items }) {
  const parentRef = useRef(null);

  const virtualizer = useVirtualizer({
    count: items.length,       // total number of items
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,    // estimated row height in px
    overscan: 5,               // render 5 extra items above/below viewport
  });

  return (
    <div ref={parentRef} style={{ height: '400px', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map(virtualRow => (
          <div
            key={virtualRow.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            {items[virtualRow.index].name}
          </div>
        ))}
      </div>
    </div>
  );
}

// Renders 10,000 items with only ~15-20 DOM nodes at any time
```

---

## Code Splitting with React.lazy and Suspense

Code splitting defers the download of JavaScript bundles until they are actually needed. Without it, the browser must download, parse, and compile the entire application's JavaScript before the user can interact with any page — even pages the user may never visit. `React.lazy` integrates code splitting with the component model: the component's bundle is fetched on first render, and `Suspense` provides the loading state while the download is in progress. Route-level splitting is the highest-impact form — each route becomes a separate chunk that is only loaded when the user navigates to it.

### Basic Lazy Loading

```jsx
import { lazy, Suspense } from 'react';

// Instead of: import HeavyChart from './HeavyChart';
const HeavyChart = lazy(() => import('./HeavyChart'));

function Dashboard() {
  return (
    <div>
      <h1>Dashboard</h1>
      <Suspense fallback={<p>Loading chart...</p>}>
        <HeavyChart data={data} />
      </Suspense>
    </div>
  );
}

// HeavyChart's code is in a separate JS bundle
// Only downloaded when Dashboard first renders
```

### Route-Level Code Splitting

```jsx
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

const Home = lazy(() => import('./pages/Home'));
const Profile = lazy(() => import('./pages/Profile'));
const Settings = lazy(() => import('./pages/Settings'));

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<FullPageSpinner />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
```

### Named Exports with Lazy

```jsx
// React.lazy only supports default exports
// For named exports, create an intermediate module:

// MathUtils.js
export function add(a, b) { return a + b; }
export function Calculator() { return <div>Calculator</div>; }

// CalcLoader.js
export { Calculator as default } from './MathUtils';

// App.js
const Calculator = lazy(() => import('./CalcLoader'));

// Or inline:
const Calculator = lazy(() =>
  import('./MathUtils').then(module => ({ default: module.Calculator }))
);
```

### Preloading Components

```jsx
const HeavyEditor = lazy(() => import('./HeavyEditor'));

function App() {
  const [showEditor, setShowEditor] = useState(false);

  // Preload on hover — start downloading before user clicks
  const preloadEditor = () => {
    import('./HeavyEditor'); // triggers the download
  };

  return (
    <div>
      <button
        onMouseEnter={preloadEditor}
        onClick={() => setShowEditor(true)}
      >
        Open Editor
      </button>

      {showEditor && (
        <Suspense fallback={<Spinner />}>
          <HeavyEditor />
        </Suspense>
      )}
    </div>
  );
}
```

---

## React Compiler (React Forget)

React Compiler is a static analysis tool that transforms your component code at build time to automatically insert `useMemo`, `useCallback`, and `React.memo` where it determines they would be beneficial. Its goal is to eliminate the manual memoization burden entirely — you write plain, readable components without performance annotations and the compiler adds them correctly. This is possible because the compiler can statically analyze which values and functions are stable across renders and which are genuinely new. It respects the Rules of Hooks and only applies optimizations where the semantics are unchanged.

React Compiler (previously called React Forget) is a build-time tool that automatically memoizes components and hooks. It aims to eliminate the need for manual `useMemo`, `useCallback`, and `React.memo`.

```jsx
// What you write:
function TodoList({ todos, filter }) {
  const filtered = todos.filter(t => t.status === filter);
  const handleClick = (id) => markComplete(id);

  return filtered.map(t => (
    <TodoItem key={t.id} todo={t} onClick={handleClick} />
  ));
}

// What React Compiler outputs (conceptually):
function TodoList({ todos, filter }) {
  const filtered = useMemo(() => todos.filter(t => t.status === filter), [todos, filter]);
  const handleClick = useCallback((id) => markComplete(id), []);

  return useMemo(() => filtered.map(t => (
    <TodoItem key={t.id} todo={t} onClick={handleClick} />
  )), [filtered, handleClick]);
}
```

**Status (2025):** Shipping in production at Meta. Available as an experimental Babel plugin for the community. Works with Next.js 15+.

---

## Interview Quick Hits

**Q: Does React.memo do deep comparison?**
No. Shallow comparison by default. `{ a: 1 } !== { a: 1 }` (different references). Pass a custom comparison function for deep checks, or use `useMemo` to stabilize references.

**Q: What's the cost of over-memoizing?**
Memory (cached values stick around) + comparison overhead on every render. For cheap components, the comparison cost can exceed the render cost.

**Q: How does virtualization work?**
Only render items visible in the viewport. Use absolute positioning with transforms. The container has the full scrollable height (so scrollbar is correct), but only 10-20 actual DOM nodes exist at any time.

**Q: When should you code-split?**
Route-level splitting is almost always worth it. Component-level splitting for heavy components (charts, editors, maps) that aren't needed on initial load. Don't split tiny components — the network overhead outweighs the benefit.

**Q: What triggers a Suspense fallback?**
A lazy component that hasn't loaded yet, or a component that throws a promise (the mechanism used by data-fetching libraries like Relay and the `use()` hook in React 19).
