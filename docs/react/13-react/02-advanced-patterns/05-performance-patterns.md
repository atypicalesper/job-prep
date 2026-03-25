# React Performance Patterns

## Understanding Re-renders

A component re-renders when:
1. Its own state changes
2. Its parent re-renders (default behavior — even if props didn't change)
3. A context it consumes changes

Re-renders are not always bad — React is fast. Optimize only when you can measure a real problem with React DevTools Profiler.

---

## React.memo

`React.memo` wraps a component and performs a shallow comparison of its props before deciding whether to re-render. If all props pass the comparison (same primitive values, same object references), React reuses the previous render output and skips calling the component function. The custom comparator overload allows deep equality checks for specific props — useful when a prop is a new object reference but its contents haven't changed. Use `React.memo` on pure display components in frequently-re-rendering parents, especially list items in large lists.

```jsx
const ExpensiveList = React.memo(function ExpensiveList({ items, onSelect }) {
  console.log('render list');
  return (
    <ul>
      {items.map(item => (
        <li key={item.id} onClick={() => onSelect(item)}>{item.name}</li>
      ))}
    </ul>
  );
});

// Custom comparator for deep equality
const MemoItem = React.memo(Item, (prev, next) =>
  prev.id === next.id && prev.title === next.title
);
```

**When to use:** Pure display components that render often with same props (list items, chart nodes, table rows).

---

## useCallback

Every render creates a new function object for every inline function in JSX. When that function is passed as a prop to a `React.memo`-wrapped child, the new reference causes the child to re-render even if the function's behavior is unchanged. `useCallback` stores the function in a memoization cache and returns the same reference across renders until its dependencies change. The cost of `useCallback` is real — a dependency array allocation and comparison on every render — so it only pays off when the saved child re-render cost exceeds this overhead.

```jsx
function Parent() {
  const [count, setCount] = React.useState(0);

  // Without useCallback: new function every render → Child always re-renders
  // With useCallback: same reference until deps change
  const handleSelect = React.useCallback((item) => {
    console.log('selected', item);
  }, []); // stable — no deps

  return <ExpensiveList items={data} onSelect={handleSelect} />;
}
```

**Rule:** Only wrap with `useCallback` when passing to a `React.memo`'d component or as a dep to `useEffect`. Don't wrap everything — the overhead of creating the callback + the deps array comparison is not free.

---

## useMemo

`useMemo` caches a computation result and recomputes it only when its listed dependencies change. It is valuable in two scenarios: when the computation itself is expensive (filtering/sorting large datasets, complex aggregations), and when the result is an object or array used as a prop or `useEffect` dependency — because JavaScript's reference equality means a freshly-computed `{ a: 1 }` is never equal to an older `{ a: 1 }` even if the data is identical. Measure before adding `useMemo` — the dependency comparison runs on every render, and for cheap computations this overhead can exceed the savings.

```jsx
function FilteredList({ items, filter }) {
  // Only recomputes when items or filter changes
  const filtered = React.useMemo(
    () => items.filter(i => i.name.includes(filter)),
    [items, filter]
  );

  return <ul>{filtered.map(i => <li key={i.id}>{i.name}</li>)}</ul>;
}
```

**Heuristics for when `useMemo` is worth it:**
- The computation takes >1ms (measure first)
- The result is used as a prop to a `React.memo`'d component
- The result is a dep of a `useEffect`/`useCallback`

---

## List Virtualization

Rendering a list of 10,000 items creates 10,000 DOM nodes, each of which the browser tracks for layout, painting, and events. Virtualization solves this by maintaining a fixed pool of DOM nodes equal to the number of visible rows plus a small overscan buffer, and recycling them as the user scrolls. The scroll container has the full height of the list (so the scrollbar is accurate), but only the visible items exist as real DOM elements. This technique makes previously impossible UIs — trading dashboards, chat histories, large data tables — performant.

```jsx
import { FixedSizeList } from 'react-window';

function VirtualList({ items }) {
  const Row = ({ index, style }) => (
    <div style={style}>{items[index].name}</div>
  );

  return (
    <FixedSizeList
      height={600}
      itemCount={items.length}
      itemSize={35}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
}
```

Alternatives: `react-virtual`, `@tanstack/virtual`, `react-virtuoso`.

---

## Code Splitting

```jsx
// Route-based splitting
const Dashboard = React.lazy(() => import('./Dashboard'));
const Settings = React.lazy(() => import('./Settings'));

function App() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Suspense>
  );
}

// Component-based splitting (heavy modal, chart, etc.)
const HeavyChart = React.lazy(() => import('./HeavyChart'));

function Analytics() {
  const [show, setShow] = React.useState(false);
  return (
    <>
      <button onClick={() => setShow(true)}>Load Chart</button>
      {show && (
        <Suspense fallback={<Spinner />}>
          <HeavyChart />
        </Suspense>
      )}
    </>
  );
}
```

---

## Context Splitting

A single large context is a common performance anti-pattern. Every component that consumes the context re-renders whenever any part of the context value changes — even if that component only uses one field. Splitting the context into separate contexts aligned with update frequency means a component subscribed to `ThemeContext` is unaffected by changes to `UserContext` or `CartContext`. The general rule: group values that change together and are consumed together into one context; separate values with different update frequencies.

```jsx
// ❌ Single context — all consumers re-render on any change
const AppCtx = createContext({ user, theme, cart });

// ✅ Split by update frequency
const UserCtx = createContext(user);
const ThemeCtx = createContext(theme);
const CartCtx = createContext(cart);
```

Or use a selector pattern with `useSyncExternalStore` / Zustand's `useStore(state => state.user)`.

---

## Avoid Inline Object/Array Props

Inline object and array literals in JSX (`style={{ margin: 8 }}` or `colors={['red', 'blue']}`) create a new reference on every render. If the receiving component uses `React.memo`, the prop comparison always fails — the memo is effectively disabled. The fix is to hoist the value to a constant outside the component (for truly static values) or use `useMemo` (for values that depend on props or state). This is one of the most common reasons `React.memo` appears to "not work."

```jsx
// ❌ New array on every render → child always re-renders
<Chart colors={['red', 'blue']} />

// ✅ Stable reference
const COLORS = ['red', 'blue'];
<Chart colors={COLORS} />

// ❌ New object every render
<Box style={{ margin: 8 }} />

// ✅ Memoize or extract constant
const boxStyle = { margin: 8 };
<Box style={boxStyle} />
```

---

## Avoid State That Causes Unnecessary Re-renders

Storing derived data in state — values that can be computed from other state or props — is an anti-pattern that causes unnecessary re-renders and keeps two values in sync manually. When the source data changes, you must update both the original and the derived state, which risks inconsistency and triggers an extra render per sync. The fix is to compute the derived value directly in the render function (or via `useMemo` for expensive computations). React's model is: minimize state to the minimal canonical representation, and derive everything else.

```jsx
// ❌ Storing derived data in state
const [filteredItems, setFilteredItems] = React.useState([]);
useEffect(() => setFilteredItems(items.filter(...)), [items, filter]);

// ✅ Derive during render (or useMemo for expensive ones)
const filteredItems = React.useMemo(() => items.filter(...), [items, filter]);
```

---

## Profiling

React's built-in `Profiler` component records render timing for a subtree, reporting the component ID, whether it mounted or updated, and how long the render took in milliseconds. Use this for pinpointing which part of a large tree is slow when the DevTools Profiler is not available (e.g., in automated performance benchmarks). In development, React DevTools Profiler gives a flame graph view of all renders during a recorded interaction — highlight which components rendered, how long each took, and why they rendered. Always profile before optimizing; the bottleneck is rarely where you expect it.

```jsx
// Wrap in React.Profiler to measure render timing
<React.Profiler
  id="ExpensiveTree"
  onRender={(id, phase, actualDuration) => {
    console.log(id, phase, actualDuration, 'ms');
  }}
>
  <ExpensiveTree />
</React.Profiler>
```

**React DevTools Profiler:** Record interactions, flame graph shows which components rendered and how long they took. Use "Highlight updates" to see what re-renders on each interaction.

---

## Web Workers for Heavy Computation

The browser's main thread handles JavaScript execution, rendering, and user input — all on the same thread. A heavy computation (generating reports, running image processing, parsing large JSON) that runs on the main thread blocks all three simultaneously, making the UI unresponsive. Web Workers run JavaScript in a separate OS thread, communicating with the main thread via `postMessage`. The computation can run at full CPU speed without blocking the UI. The `useWorker` hook below encapsulates the worker lifecycle — creating it on mount, terminating it on unmount — and wraps the message-passing in a Promise for clean `async/await` usage.

```js
// worker.js
self.onmessage = (e) => {
  const result = heavyCompute(e.data);
  self.postMessage(result);
};

// Component
function useWorker(workerFn) {
  const workerRef = React.useRef();

  React.useEffect(() => {
    workerRef.current = new Worker(new URL('./worker.js', import.meta.url));
    return () => workerRef.current.terminate();
  }, []);

  return React.useCallback((data) => new Promise(resolve => {
    workerRef.current.onmessage = e => resolve(e.data);
    workerRef.current.postMessage(data);
  }), []);
}
```

---

## Performance Checklist

- [ ] Measure first with React DevTools Profiler — don't guess
- [ ] `React.memo` on pure display components that re-render unnecessarily
- [ ] `useCallback` on handlers passed to memoized children
- [ ] `useMemo` on expensive computations (>1ms), not trivial ones
- [ ] Virtualize long lists (>100 items)
- [ ] Code-split large routes and rarely-used heavy components
- [ ] Split context by update frequency
- [ ] Avoid inline objects/arrays in JSX
- [ ] Derive state from existing state rather than storing duplicated derived data
- [ ] Use `useTransition` to keep UI responsive during heavy updates
