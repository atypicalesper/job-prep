# Custom Hooks

Custom hooks are JavaScript functions whose names start with `use` and that can call other hooks. They let you extract and share stateful logic without changing component hierarchy.

---

## Why Custom Hooks?

- **Reuse** stateful logic across components
- **Separate concerns** — keep components focused on UI
- **Testable** in isolation
- **Composable** — hooks can call other hooks

---

## Basic Pattern

The simplest custom hook wraps a browser API that requires setup (adding an event listener) and teardown (removing it on unmount). The hook encapsulates the `useState` + `useEffect` pair, and the component that calls it just receives the value — with no knowledge of how it is obtained or updated. This is the template for most hooks that integrate React with the outside world.

```js
function useWindowSize() {
  const [size, setSize] = React.useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  React.useEffect(() => {
    const handler = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return size;
}

// Usage
function App() {
  const { width, height } = useWindowSize();
  return <p>{width} × {height}</p>;
}
```

---

## useFetch

`useFetch` encapsulates the three-state pattern common to any async data fetch: loading, success, and error. The `AbortController` and `cancelled` flag together solve the unmount race condition — if the component unmounts before the fetch resolves, the state update is suppressed. The hook re-fetches automatically whenever the `url` changes, making it easy to fetch user-specific data by changing the URL. For production use, prefer established libraries like SWR or React Query which add caching, deduplication, and revalidation on top of this same concept.

```js
function useFetch(url) {
  const [state, setState] = React.useState({ data: null, loading: true, error: null });

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    setState({ data: null, loading: true, error: null });

    fetch(url, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then(data => { if (!cancelled) setState({ data, loading: false, error: null }); })
      .catch(err => {
        if (!cancelled && err.name !== 'AbortError')
          setState({ data: null, loading: false, error: err });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url]);

  return state;
}
```

---

## useLocalStorage

`useLocalStorage` bridges React state with the browser's `localStorage` API — changes are persisted across page reloads. The lazy initializer reads from `localStorage` only once on mount (not on every render). The setter uses `setStored`'s functional update form to keep the write atomic, and the `try/catch` handles private browsing mode where `localStorage` access is blocked. The `useCallback` on `setValue` ensures the returned setter reference is stable across renders for the same `key`.

```js
function useLocalStorage(key, initialValue) {
  const [stored, setStored] = React.useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = React.useCallback((value) => {
    setStored(prev => {
      const next = typeof value === 'function' ? value(prev) : value;
      try { window.localStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [key]);

  return [stored, setValue];
}
```

---

## useDebounce

```js
function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}
```

---

## useEventListener

`useEventListener` solves a subtle problem: if you add an event listener in `useEffect` with the handler in its dependency array, the listener is removed and re-added on every render (since functions have new references each time). This hook breaks the dependency by storing the latest handler in a ref updated by `useLayoutEffect`, so the event listener is added only once but always calls the latest version of the handler. This pattern is applicable wherever you need a stable subscription to an external event source that should always invoke the most current handler.

```js
function useEventListener(eventName, handler, element = window) {
  const savedHandler = React.useRef(handler);

  React.useLayoutEffect(() => {
    savedHandler.current = handler;
  }, [handler]);

  React.useEffect(() => {
    if (!element?.addEventListener) return;
    const listener = (e) => savedHandler.current(e);
    element.addEventListener(eventName, listener);
    return () => element.removeEventListener(eventName, listener);
  }, [eventName, element]);
}
```

---

## usePrevious

`usePrevious` returns the value from the previous render. It works because `useEffect` runs after the render is committed — so during the current render, `ref.current` still holds the value that was set at the end of the previous render. This is useful for animating between old and new values, detecting whether a value increased or decreased, or implementing "undo" functionality without additional state.

```js
function usePrevious(value) {
  const ref = React.useRef();
  React.useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current; // returns the previous render's value
}
```

---

## useToggle

```js
function useToggle(initial = false) {
  const [value, setValue] = React.useState(initial);
  const toggle = React.useCallback(() => setValue(v => !v), []);
  return [value, toggle];
}
```

---

## useOnClickOutside

`useOnClickOutside` detects clicks that originate outside a given DOM element — the standard mechanism for closing dropdowns, modals, and popovers when the user clicks away. It attaches a `pointerdown` listener to `document` and checks whether the click target is contained within the referenced element. `pointerdown` is preferred over `click` because it fires earlier in the event sequence and works for both mouse and touch events. The `ref.current.contains(e.target)` check correctly handles clicks on child elements of the target.

```js
function useOnClickOutside(ref, handler) {
  React.useEffect(() => {
    const listener = (e) => {
      if (!ref.current || ref.current.contains(e.target)) return;
      handler(e);
    };
    document.addEventListener('pointerdown', listener);
    return () => document.removeEventListener('pointerdown', listener);
  }, [ref, handler]);
}
```

---

## useIntersectionObserver

The `IntersectionObserver` API efficiently notifies you when a DOM element enters or exits the viewport without requiring scroll event polling. `useIntersectionObserver` wraps it as a hook that returns the current `IntersectionObserverEntry`. The most common use cases are lazy-loading images (only load the `src` when the image enters the viewport) and infinite scroll (trigger data fetching when a sentinel element at the bottom of a list becomes visible). Individual dependency values from `options` are listed instead of the whole object to avoid recreating the observer on every render.

```js
function useIntersectionObserver(ref, options = {}) {
  const [entry, setEntry] = React.useState(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([e]) => setEntry(e), options);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, options.threshold, options.root, options.rootMargin]);

  return entry;
}

// Usage: lazy-load images, infinite scroll
function LazyImage({ src, alt }) {
  const ref = React.useRef();
  const entry = useIntersectionObserver(ref, { threshold: 0.1 });
  return (
    <img
      ref={ref}
      src={entry?.isIntersecting ? src : undefined}
      alt={alt}
    />
  );
}
```

---

## useReducerWithMiddleware (Redux-like pattern)

By wrapping `useReducer`'s `dispatch` function, you can add cross-cutting concerns — logging, analytics, side effects — that apply to every action without modifying the reducer itself. This is the same concept as Redux middleware but at the component level. The `dispatchWithLog` function closes over `state` at the time it is created, so it reads the state before the dispatch takes effect. Each new render creates a new `dispatchWithLog` bound to the current state — this is intentional for the logging use case.

```js
function useReducerWithLogger(reducer, initialState) {
  const [state, dispatch] = React.useReducer(reducer, initialState);

  const dispatchWithLog = React.useCallback((action) => {
    console.log('dispatch', action, '→ prev state:', state);
    dispatch(action);
  }, [state]);

  return [state, dispatchWithLog];
}
```

---

## Composing Custom Hooks

Custom hooks can call other custom hooks, building up complexity in reusable layers. A complex hook like `useAuth` can be built from simpler primitives: `useState` for the user value, `useEffect` for the subscription lifecycle, and `useCallback` for stable function references. The composition model means each layer is independently testable and the top-level component only sees the clean `{ user, loading, logout }` interface — with no knowledge of how subscriptions or callbacks are managed internally.

```js
// useAuth composes multiple hooks
function useAuth() {
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const unsub = auth.onAuthStateChanged(u => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const logout = React.useCallback(() => auth.signOut(), []);

  return { user, loading, logout };
}
```

---

## Testing Custom Hooks

`renderHook` from `@testing-library/react` renders a hook in a minimal component wrapper, giving you access to the hook's return value. State updates triggered by the hook must be wrapped in `act()` to ensure React processes them before your assertions run. This isolation makes hooks much easier to test than equivalent component-level logic — you can verify the hook's behavior directly without rendering any real UI.

Use `@testing-library/react` `renderHook`:

```js
import { renderHook, act } from '@testing-library/react';

test('useToggle', () => {
  const { result } = renderHook(() => useToggle(false));
  expect(result.current[0]).toBe(false);
  act(() => result.current[1]());
  expect(result.current[0]).toBe(true);
});
```

---

## Common Mistakes

1. **Not starting hook name with `use`** — linter won't check rules of hooks inside it
2. **Creating new objects/arrays in hook return** — causes re-renders; memoize return value
3. **Forgetting cleanup** — subscriptions, timers, observers must be torn down
4. **Missing deps** — stale closures; use `eslint-plugin-react-hooks` exhaustive-deps rule
5. **Reading browser APIs at module level** — use `typeof window !== 'undefined'` guard or initialize in `useEffect`
