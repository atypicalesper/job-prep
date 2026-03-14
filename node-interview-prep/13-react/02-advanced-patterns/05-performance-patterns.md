# React Performance Patterns

## Understanding Re-renders

A component re-renders when:
1. Its own state changes
2. Its parent re-renders (default behavior — even if props didn't change)
3. A context it consumes changes

Re-renders are not always bad — React is fast. Optimize only when you can measure a real problem with React DevTools Profiler.

---

## React.memo

Prevents re-rendering when props haven't changed (shallow comparison).

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

Stabilizes function references so `React.memo` children don't re-render.

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

Memoizes expensive computations.

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

For lists with thousands of items, only render what's visible.

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

Avoid making all consumers re-render when unrelated context slice changes.

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

```jsx
// ❌ Storing derived data in state
const [filteredItems, setFilteredItems] = React.useState([]);
useEffect(() => setFilteredItems(items.filter(...)), [items, filter]);

// ✅ Derive during render (or useMemo for expensive ones)
const filteredItems = React.useMemo(() => items.filter(...), [items, filter]);
```

---

## Profiling

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
