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
