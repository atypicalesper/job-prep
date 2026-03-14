# React — 60 Tricky Interview Questions

Predict the output or explain the behavior before reading the answer. Covers hooks rules, rendering, closures in effects, context, refs, batching, and more.

---

## Q1 — What does this render?

```jsx
function Counter() {
  const [count, setCount] = React.useState(0);

  function handleClick() {
    setCount(count + 1);
    setCount(count + 1);
    setCount(count + 1);
  }

  return <button onClick={handleClick}>{count}</button>;
}
```

**Answer:** Each click increments by **1**, not 3.

**Why:** All three `setCount` calls read the same stale `count` (say `0`), so they all enqueue `setCount(1)`. React batches them and processes the last enqueued value. Use functional updates to fix:
```js
setCount(c => c + 1); // × 3 → increments by 3
```

---

## Q2 — Will this cause an infinite render loop?

```jsx
function App() {
  const [x, setX] = React.useState(0);
  setX(1); // called directly in render
  return <div>{x}</div>;
}
```

**Answer:** Yes — **infinite loop** / React error in strict mode.

**Why:** `setX` during render triggers a re-render, which calls `setX` again, infinitely. State updates in render body (outside effects or event handlers) are only valid if they are conditional on not having run yet, and React will bail out only if the new value equals the old one. Since `0 → 1` is a change, it loops. In strict mode React throws immediately.

---

## Q3 — What logs after the button click?

```jsx
function App() {
  const [val, setVal] = React.useState('a');

  function handleClick() {
    setVal('b');
    console.log(val); // (1)
  }

  return <button onClick={handleClick}>{val}</button>;
}
```

**Answer:** `'a'`

**Why:** `setState` is asynchronous (batched). The closure captures `val = 'a'` at the time the handler was created. The updated state `'b'` is only available in the *next* render's closure.

---

## Q4 — Does this leak a subscription?

```jsx
useEffect(() => {
  const sub = someStream.subscribe(handler);
}, []);
```

**Answer:** Yes — **memory leak** because there is no cleanup function.

**Why:** The subscription runs once on mount but is never torn down on unmount. Correct:
```js
useEffect(() => {
  const sub = someStream.subscribe(handler);
  return () => sub.unsubscribe();
}, []);
```

---

## Q5 — How many times does `expensiveFn` run?

```jsx
function App() {
  const [n, setN] = React.useState(0);
  const result = React.useMemo(() => expensiveFn(n), [n]);
  const result2 = React.useMemo(() => expensiveFn(n), [n]);
  // ...
}
```

**Answer:** Each `useMemo` is independent — `expensiveFn` runs at most once per memo per render, so **up to 2 times** if `n` changes. They do not share a cache.

---

## Q6 — What happens here?

```jsx
const MyCtx = React.createContext(null);

function Parent() {
  const [v, setV] = React.useState(0);
  return (
    <MyCtx.Provider value={{ v, setV }}>
      <Child />
    </MyCtx.Provider>
  );
}

function Child() {
  const { v } = React.useContext(MyCtx);
  return <div>{v}</div>;
}
```

Every time `Parent` re-renders for any reason, does `Child` re-render?

**Answer:** Yes — because `{ v, setV }` is a **new object reference** on every render, causing `Child` to re-render even if `v` didn't change. Fix: `useMemo` or split context.

---

## Q7 — What is the output order?

```jsx
function App() {
  console.log('render');
  React.useEffect(() => { console.log('effect'); }, []);
  React.useLayoutEffect(() => { console.log('layout'); }, []);
  return null;
}
```

**Answer:** `render` → `layout` → `effect`

**Why:** `useLayoutEffect` fires synchronously after DOM mutations, before the browser paints. `useEffect` fires asynchronously after paint.

---

## Q8 — Will `useCallback` prevent the child from re-rendering?

```jsx
function Parent() {
  const [x, setX] = React.useState(0);
  const fn = React.useCallback(() => {}, []);
  return <Child fn={fn} />;
}

const Child = React.memo(({ fn }) => {
  console.log('child render');
  return <div />;
});
```

**Answer:** Yes — `fn` is stable (empty deps), `React.memo` does a shallow comparison, so `Child` does **not** re-render when `x` changes.

---

## Q9 — What does this print?

```jsx
function App() {
  const ref = React.useRef(0);

  function handleClick() {
    ref.current += 1;
    console.log(ref.current);
  }

  return <button onClick={handleClick}>click</button>;
}
```

**Answer:** `1`, `2`, `3` … on successive clicks — no re-renders, but the value is correctly mutated because `ref.current` is a mutable box.

---

## Q10 — Does this violate Rules of Hooks?

```jsx
function useData(condition) {
  if (condition) {
    const [data, setData] = React.useState(null);
    return data;
  }
  return null;
}
```

**Answer:** Yes — hooks called inside `if` blocks violate the Rules of Hooks. React relies on call order being stable across renders. This will throw in development.

---

## Q11 — What is printed after the button click?

```jsx
function App() {
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    console.log('effect', count);
  });

  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

**Answer:** `effect 0` on mount, then `effect 1`, `effect 2`, … on each click.

**Why:** No dependency array → effect runs after *every* render.

---

## Q12 — Stale closure in useEffect

```jsx
function Timer() {
  const [sec, setSec] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => {
      setSec(sec + 1); // stale closure
    }, 1000);
    return () => clearInterval(id);
  }, []); // empty deps

  return <div>{sec}</div>;
}
```

**Answer:** Counter stays at **1** forever.

**Why:** The closure captures `sec = 0` at mount and always sets `sec + 1 = 1`. Fix: `setSec(s => s + 1)`.

---

## Q13 — Does `useMemo` guarantee no re-computation?

```jsx
const v = React.useMemo(() => heavyCalc(), []);
```

**Answer:** **No.** React may discard memoized values in the future (e.g., during concurrent mode off-screen work). `useMemo` is a performance hint, not a semantic guarantee.

---

## Q14 — What renders?

```jsx
function App() {
  const [items, setItems] = React.useState([1, 2, 3]);

  return (
    <ul>
      {items.map(i => <li>{i}</li>)}
    </ul>
  );
}
```

**Answer:** Renders correctly but throws a **"key" warning** in dev. Without unique keys React can't efficiently reconcile list changes (insertions, deletions).

---

## Q15 — What happens on the second render?

```jsx
function App() {
  const [a, setA] = React.useState(0);
  const [b, setB] = React.useState(0);

  function handleClick() {
    setA(1);
    setB(2);
  }

  console.log('render', a, b);
  return <button onClick={handleClick} />;
}
```

**Answer:** Only **one re-render** logs `render 1 2` — React batches both state updates (React 18+ batches all updates, including in timeouts).

---

## Q16 — Is `useEffect` called on the server (SSR)?

**Answer:** No. `useEffect` and `useLayoutEffect` are **not** called during server-side rendering. Only the render function and `useMemo`/`useCallback` run. Use this to guard browser-only code.

---

## Q17 — Can you call hooks from a regular function?

```jsx
function helper() {
  const [x] = React.useState(0); // ← called from helper, not a component
  return x;
}
function App() {
  helper();
  return null;
}
```

**Answer:** This violates Rules of Hooks. Hooks must be called at the top level of a React function component or a custom hook (function prefixed `use`). React tracks hooks by call order per component fiber — calling them from nested regular functions breaks this.

---

## Q18 — What does `React.StrictMode` do in development?

**Answer:** It intentionally **double-invokes** render functions, state initializers, and `useMemo`/`useCallback` computations to surface side effects. Effects are also mounted → unmounted → remounted. This only happens in dev to help you find non-idempotent code. Production is unaffected.

---

## Q19 — What is the bug?

```jsx
function Form() {
  const [name, setName] = React.useState('');
  const inputRef = React.useRef();

  React.useEffect(() => {
    inputRef.current.focus();
  }, [name]); // runs on every name change

  return <input ref={inputRef} value={name} onChange={e => setName(e.target.value)} />;
}
```

**Answer:** Refocusing the input on every keystroke is annoying UX. `useEffect` with `[name]` fires after every character. Should use `[]` to focus only on mount.

---

## Q20 — Does `React.memo` do deep equality?

**Answer:** No — **shallow equality** by default. For deep equality, pass a custom comparison function as the second argument:
```js
React.memo(Component, (prev, next) => deepEqual(prev, next))
```

---

## Q21 — What logs?

```jsx
function App() {
  const [n, setN] = React.useState(0);

  React.useEffect(() => {
    return () => console.log('cleanup', n);
  }, [n]);

  return <button onClick={() => setN(v => v + 1)}>{n}</button>;
}
```

**Answer:** On first click: `cleanup 0` then the effect re-runs. On second click: `cleanup 1`. Each re-run of the effect first calls the *previous* cleanup with the *previous* `n` captured in its closure.

---

## Q22 — What is the issue with this context pattern?

```jsx
const Ctx = React.createContext();
function Provider({ children }) {
  const [user, setUser] = React.useState(null);
  const logout = () => setUser(null);
  return <Ctx.Provider value={{ user, setUser, logout }}>{children}</Ctx.Provider>;
}
```

**Answer:** `logout` is recreated on every render → new object reference → all consumers re-render needlessly. Fix with `useCallback(() => setUser(null), [])`.

---

## Q23 — When does `getDerivedStateFromProps` run in function components?

**Answer:** It doesn't. `getDerivedStateFromProps` is a class component API. In function components you derive state inline during render:
```js
const derived = computeFrom(props); // just a variable, no hook needed
```

---

## Q24 — What is rendered?

```jsx
function App() {
  const [show, setShow] = React.useState(true);
  return (
    <>
      {show && <Child />}
      <button onClick={() => setShow(false)}>hide</button>
    </>
  );
}

function Child() {
  React.useEffect(() => () => console.log('unmounted'), []);
  return <div>child</div>;
}
```

**Answer:** When "hide" is clicked: `unmounted` is logged. React calls the cleanup of all effects when a component unmounts.

---

## Q25 — What is wrong?

```jsx
React.useEffect(async () => {
  const data = await fetch('/api').then(r => r.json());
  setData(data);
}, []);
```

**Answer:** `useEffect` should **not** be passed an async function directly. An async function returns a Promise, but React expects the return value to be either `undefined` or a cleanup function. React can't await the Promise and will not call it as a cleanup. Fix:
```js
useEffect(() => {
  let cancelled = false;
  fetch('/api').then(r => r.json()).then(data => {
    if (!cancelled) setData(data);
  });
  return () => { cancelled = true; };
}, []);
```

---

## Q26 — Does this trigger a re-render?

```jsx
const ref = React.useRef({ count: 0 });
ref.current.count = 5;
```

**Answer:** **No.** Mutating `ref.current` does not schedule a re-render. Refs are escape hatches for values that don't need to drive the UI.

---

## Q27 — What is the output?

```jsx
function App() {
  const [x, setX] = React.useState(0);

  React.useEffect(() => {
    setX(1);
  }, []);

  React.useEffect(() => {
    console.log(x);
  }, [x]);

  return null;
}
```

**Answer:** `0` (initial), then `1` (after the first effect sets state).

**Why:** Both effects run after the first render. First, the log effect runs: prints `0`. Then the setter effect runs: sets `x = 1`, triggering a second render. After the second render, the log effect re-runs: prints `1`.

---

## Q28 — What does `forwardRef` solve?

```jsx
const Input = React.forwardRef((props, ref) => <input ref={ref} {...props} />);
```

**Answer:** By default, refs on function components don't work because function components don't have instances. `forwardRef` lets a parent pass a `ref` down to a DOM element (or imperative handle) inside a child component.

---

## Q29 — What is `useImperativeHandle` for?

```jsx
React.useImperativeHandle(ref, () => ({
  focus: () => inputRef.current.focus(),
  reset: () => setVal(''),
}));
```

**Answer:** It customizes what the parent sees when accessing `ref.current`, exposing only specific methods instead of the raw DOM node. Used with `forwardRef`.

---

## Q30 — Does `key` re-mount a component?

```jsx
<Child key={version} />
```

If `version` changes, does `Child` re-render or re-mount?

**Answer:** **Re-mount** — React treats a different `key` as a completely different component instance: unmounts the old one (cleanup runs), mounts the new one. State is reset. This is a common trick to reset a component's state.

---

## Q31 — What is the bug?

```jsx
function useWindowWidth() {
  const width = window.innerWidth; // ← no state
  return width;
}
```

**Answer:** This only reads `window.innerWidth` once during the first render and never updates. The component won't re-render on resize. Correct:
```js
const [width, setWidth] = useState(window.innerWidth);
useEffect(() => {
  const handler = () => setWidth(window.innerWidth);
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler);
}, []);
```

---

## Q32 — Will `React.memo` help here?

```jsx
const Child = React.memo(({ onClick }) => <button onClick={onClick}>click</button>);

function Parent() {
  const handleClick = () => console.log('click'); // ← new function each render
  return <Child onClick={handleClick} />;
}
```

**Answer:** **No.** A new function reference is created on every render, so `React.memo`'s shallow comparison always fails. Wrap `handleClick` with `useCallback`.

---

## Q33 — What is the problem with index as key?

```jsx
{items.map((item, i) => <Item key={i} item={item} />)}
```

**Answer:** When items are reordered, added to the front, or deleted, React matches components by key index. This causes wrong component state to be reused and can produce subtle bugs or mismatched animations. Use stable unique IDs instead.

---

## Q34 — What renders and when does the effect run (React 18 concurrent)?

```jsx
function App() {
  const [v, setV] = React.useState(0);
  React.useTransition(); // returns [isPending, startTransition]
  return <div>{v}</div>;
}
```

**Answer:** `useTransition` itself doesn't change rendering here. But wrapping a `setV` call in `startTransition` marks it as non-urgent: React can interrupt it to handle higher-priority updates (e.g., user input), then resume. The component re-renders once the transition commits.

---

## Q35 — What is `flushSync` for?

```jsx
import { flushSync } from 'react-dom';

flushSync(() => {
  setState(1);
});
// DOM is updated synchronously here
```

**Answer:** Normally React 18 batches all state updates. `flushSync` forces React to flush updates synchronously, so the DOM reflects the new state immediately after the call. Useful when you need to read layout right after a state change.

---

## Q36 — What does `Suspense` do?

```jsx
<Suspense fallback={<Spinner />}>
  <LazyComponent />
</Suspense>
```

**Answer:** When `LazyComponent` suspends (throws a Promise — via `React.lazy`, data fetching with Relay/SWR, etc.), React renders the `fallback` until the Promise resolves, then swaps in the real content. Multiple suspended components can share one boundary.

---

## Q37 — What is the error boundary pattern?

```jsx
class ErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err, info) { logError(err, info); }
  render() {
    return this.state.hasError ? <Fallback /> : this.props.children;
  }
}
```

**Answer:** Error boundaries catch render errors (and errors in lifecycle methods / constructors) in their subtree. They **cannot** catch errors in event handlers, async code, or SSR. As of 2025, error boundaries must still be class components (no hook equivalent in stable React).

---

## Q38 — What does `useId` solve?

```jsx
const id = React.useId();
return <><label htmlFor={id}>Name</label><input id={id} /></>;
```

**Answer:** `useId` generates a stable, unique ID that matches between server and client renders, avoiding SSR hydration mismatches when you need IDs for accessibility (labels, aria-* attributes).

---

## Q39 — Will this component re-render when context changes?

```jsx
const Ctx = React.createContext({ a: 1, b: 2 });

function Child() {
  const { a } = React.useContext(Ctx);
  return <div>{a}</div>;
}
```

If only `b` changes, does `Child` re-render?

**Answer:** **Yes.** `useContext` re-renders whenever the context **value reference** changes, regardless of which property you destructure. To optimize, split contexts or use a selector library (e.g., `use-context-selector`).

---

## Q40 — What is the difference between controlled and uncontrolled inputs?

**Controlled:**
```jsx
<input value={val} onChange={e => setVal(e.target.value)} />
```
**Uncontrolled:**
```jsx
<input defaultValue="hello" ref={inputRef} />
```

**Answer:** Controlled inputs are driven by React state — React is the single source of truth. Uncontrolled inputs let the DOM manage their own state; you read the value imperatively via refs. Mixing both (setting `value` without `onChange`) causes React's "you changed an uncontrolled input to controlled" warning.

---

## Q41 — What is the output?

```jsx
function App() {
  const [count, setCount] = React.useState(0);

  function handleClick() {
    setCount(c => c + 1);
    setCount(c => c + 1);
  }

  console.log('render', count);
  return <button onClick={handleClick} />;
}
```

**Answer:** `render 0` on mount, then `render 2` on click. Functional updates are composed: `0+1=1`, `1+1=2`, and React merges them into a single re-render.

---

## Q42 — Why does this cause a hydration mismatch?

```jsx
function App() {
  return <div>{Math.random()}</div>;
}
```

**Answer:** Server renders one random number; client renders a different one. React compares them during hydration and warns/errors. Any non-deterministic value (Date, Math.random, browser-only APIs) inside render causes SSR/CSR mismatches.

---

## Q43 — What does the `useReducer` function signature look like, and when should you prefer it over `useState`?

```jsx
const [state, dispatch] = React.useReducer(reducer, initialState);
```

**Answer:** Prefer `useReducer` when:
- Next state depends on previous state in complex ways
- Multiple sub-values need to update together
- You want to centralize transition logic (testable pure function)
- You want to pass `dispatch` (stable identity) instead of multiple setter callbacks

---

## Q44 — What is `useDebugValue` for?

```jsx
function useUser(id) {
  const user = useFetch(`/users/${id}`);
  React.useDebugValue(user ? user.name : 'loading');
  return user;
}
```

**Answer:** `useDebugValue` displays a label for custom hooks in React DevTools. It has no effect on rendering or behavior.

---

## Q45 — What is the difference between `useEffect` and `useLayoutEffect`?

**Answer:**
| | `useEffect` | `useLayoutEffect` |
|---|---|---|
| When | After paint (async) | After DOM mutation, before paint (sync) |
| Blocks paint? | No | Yes |
| Use for | Data fetching, subscriptions | DOM reads/writes (measuring, animations) |
| SSR | Skipped | Skipped (warns) |

Use `useLayoutEffect` only when you need to read or write to the DOM before the user sees it.

---

## Q46 — Can you use hooks in class components?

**Answer:** **No.** Hooks only work inside function components or other custom hooks. Class components use lifecycle methods and `setState`.

---

## Q47 — What is the "tearing" problem in concurrent React?

**Answer:** In concurrent mode React can pause and resume rendering. If an external mutable store (not state/context) changes between two renders of the same tree, different parts of the UI can read different values — a "tear". Solution: use `useSyncExternalStore` which guarantees a consistent snapshot.

---

## Q48 — What does `useSyncExternalStore` do?

```jsx
const count = React.useSyncExternalStore(
  store.subscribe,
  store.getSnapshot,
  store.getServerSnapshot // optional for SSR
);
```

**Answer:** It safely integrates external stores (Redux, Zustand, etc.) with concurrent React. It subscribes to the store and always reads a consistent snapshot, preventing tearing. It also supports SSR with a separate `getServerSnapshot`.

---

## Q49 — What happens when two siblings Suspend at the same time?

```jsx
<Suspense fallback={<Spinner />}>
  <A /> {/* suspends */}
  <B /> {/* suspends */}
</Suspense>
```

**Answer:** Both `A` and `B` suspend. React shows the `fallback` until **both** resolve. When A resolves first, React still waits for B before committing the real content to avoid a partial UI flash.

---

## Q50 — What is the difference between `startTransition` and `useDeferredValue`?

```jsx
// startTransition: wrap the state update
startTransition(() => setQuery(input));

// useDeferredValue: wrap the consumption of a value
const deferredQuery = React.useDeferredValue(query);
```

**Answer:** Both mark work as non-urgent. `startTransition` is used when you control the state setter. `useDeferredValue` is used when you receive a value from props/context that you can't control — you defer its propagation down the tree.

---

## Q51 — What is the problem here?

```jsx
function App() {
  const [data, setData] = React.useState(null);

  React.useEffect(() => {
    fetch('/api/data')
      .then(r => r.json())
      .then(setData);
  }, []);

  if (!data) return <div>loading</div>;
  return <List items={data} />;
}
```

**Answer:** If the component unmounts before the fetch resolves, `setData` is called on an unmounted component — harmless in React 18 (warning removed), but can still cause stale state bugs in StrictMode double-effects or when navigation happens quickly. Best to use a cancellation flag or AbortController.

---

## Q52 — Does setting state to the same value re-render?

```jsx
const [x, setX] = React.useState(0);
setX(0); // same value
```

**Answer:** **No** (after the first render). If the new state is `Object.is` equal to the current state, React bails out of re-rendering. Exception: if you're in the middle of rendering when you call it, the current render completes first.

---

## Q53 — What is the issue with this pattern?

```jsx
function Parent() {
  const [list, setList] = React.useState([]);
  return <Child list={list} onAdd={item => setList([...list, item])} />;
}
```

**Answer:** `onAdd` is a new function on every render (closure over stale `list`). For basic cases this is fine, but it means `React.memo` won't help for `Child`. Fix: wrap with `useCallback` and use functional update:
```js
const onAdd = useCallback(item => setList(prev => [...prev, item]), []);
```

---

## Q54 — What happens in React 18 when you call `setState` from a `setTimeout`?

```jsx
setTimeout(() => {
  setA(1);
  setB(2);
}, 1000);
```

**Answer:** In React 18, automatic batching applies everywhere — including `setTimeout`, native event handlers, and Promises. Both updates are batched into a single re-render. In React 17 and earlier, only React event handlers were batched; `setTimeout` would have caused two re-renders.

---

## Q55 — What is the "rules of hooks" linter catching?

```jsx
function App({ condition }) {
  if (condition) {
    const [v, setV] = React.useState(0); // eslint-disable-next-line react-hooks/rules-of-hooks
  }
}
```

**Answer:** React tracks hooks by their call order (position in the fiber's hook list). If you conditionally skip a hook, the call order changes between renders, corrupting all subsequent hooks. The lint rule `react-hooks/rules-of-hooks` statically prevents this.

---

## Q56 — What does the cleanup function in `useEffect` run for?

**Answer:** Cleanup runs:
1. Before the **next** execution of the same effect (when deps change)
2. When the component **unmounts**

It does **not** run before the first effect execution.

---

## Q57 — What is `React.lazy`?

```jsx
const Heavy = React.lazy(() => import('./Heavy'));
```

**Answer:** `React.lazy` enables code splitting. It takes a function returning a dynamic `import()` and returns a lazily-loaded component. It must be wrapped in `<Suspense>`. The JS bundle for `Heavy` is only fetched when `Heavy` is first rendered.

---

## Q58 — What is the output when this component renders?

```jsx
function App() {
  const [s, setS] = React.useState(() => {
    console.log('initializer');
    return 0;
  });
  console.log('render');
  return <button onClick={() => setS(1)} />;
}
```

**Answer:** First render: `initializer` then `render`. Subsequent renders (after click): only `render`. The state initializer function is called **once** — only on the initial render.

---

## Q59 — Can you return objects from a `useReducer` reducer and mutate them?

```jsx
function reducer(state, action) {
  state.count += 1; // mutation!
  return state;
}
```

**Answer:** **Don't.** Mutating the state object and returning the same reference means `Object.is(prevState, newState)` is `true` — React bails out and won't re-render. Always return a new object:
```js
return { ...state, count: state.count + 1 };
```

---

## Q60 — What is the difference between `useEffect(() => fn, [])` and `componentDidMount`?

**Answer:** They are similar but not identical:
- `componentDidMount` runs synchronously after the DOM is updated (like `useLayoutEffect`)
- `useEffect([])` runs **asynchronously** after the browser has painted
- In React 18 StrictMode, `useEffect([])` fires **twice** in development (mount → unmount → mount) to surface non-idempotent effects; `componentDidMount` also fires twice in StrictMode for class components

---
