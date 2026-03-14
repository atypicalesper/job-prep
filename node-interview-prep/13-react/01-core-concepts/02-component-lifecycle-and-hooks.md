# Component Lifecycle and Hooks

## Class Lifecycle vs Hooks — The Mapping

```
┌──────────────────────────────────────────────────────────────────┐
│                    Class Lifecycle                                │
│                                                                  │
│  Mounting:                                                       │
│    constructor()          →  useState(initialValue)              │
│    render()               →  function body (return JSX)          │
│    componentDidMount()    →  useEffect(() => {}, [])             │
│                                                                  │
│  Updating:                                                       │
│    shouldComponentUpdate  →  React.memo                          │
│    render()               →  function body                       │
│    componentDidUpdate()   →  useEffect(() => {}, [deps])         │
│                                                                  │
│  Unmounting:                                                     │
│    componentWillUnmount() →  useEffect(() => { return cleanup }, []) │
│                                                                  │
│  Error Handling:                                                 │
│    componentDidCatch()    →  no hook equivalent (use ErrorBoundary class) │
│    getDerivedStateFromError → no hook equivalent                 │
└──────────────────────────────────────────────────────────────────┘
```

---

## useState — State in Function Components

```jsx
function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>+1</button>
      <button onClick={() => setCount(prev => prev + 1)}>+1 (functional)</button>
    </div>
  );
}
```

### Functional Updates — Why They Matter

```jsx
function Counter() {
  const [count, setCount] = useState(0);

  const incrementThree = () => {
    // BAD: All three read the SAME stale `count` value
    setCount(count + 1);  // count is 0 → sets to 1
    setCount(count + 1);  // count is STILL 0 → sets to 1
    setCount(count + 1);  // count is STILL 0 → sets to 1
    // Result: count goes from 0 to 1, NOT 3
  };

  const incrementThreeCorrect = () => {
    // GOOD: Each reads the latest pending state
    setCount(prev => prev + 1);  // 0 → 1
    setCount(prev => prev + 1);  // 1 → 2
    setCount(prev => prev + 1);  // 2 → 3
    // Result: count goes from 0 to 3
  };

  return <button onClick={incrementThreeCorrect}>+3</button>;
}
```

### Lazy Initialization

```jsx
// BAD: computeExpensiveDefault() runs on EVERY render
const [data, setData] = useState(computeExpensiveDefault());

// GOOD: Pass a function — only runs on mount
const [data, setData] = useState(() => computeExpensiveDefault());
```

### State Updates are Batched

```jsx
function Form() {
  const [name, setName] = useState('');
  const [age, setAge] = useState(0);

  const handleSubmit = () => {
    setName('Alice');
    setAge(30);
    // React 18+: These are batched into ONE re-render
    // Even in setTimeout, promises, and native event handlers
  };

  console.log('render'); // Logs once, not twice
}
```

---

## useEffect — Side Effects

```jsx
useEffect(
  () => {
    // Effect function — runs after render
    // (after DOM has been updated and painted)

    return () => {
      // Cleanup function — runs before next effect or unmount
    };
  },
  [dep1, dep2] // Dependency array
);
```

### Dependency Array Variants

```jsx
// 1. No dependency array — runs after EVERY render
useEffect(() => {
  console.log('runs after every render');
});

// 2. Empty array — runs once after mount, cleanup on unmount
useEffect(() => {
  const ws = new WebSocket('ws://localhost');
  return () => ws.close(); // cleanup on unmount
}, []);

// 3. With deps — runs when any dep changes
useEffect(() => {
  fetchUser(userId);
}, [userId]); // re-runs when userId changes
```

### Common Mistake: Object/Array Dependencies

```jsx
function Profile({ user }) {
  // BAD: user is an object — new reference every render
  useEffect(() => {
    saveToAnalytics(user);
  }, [user]); // runs EVERY render even if user data hasn't changed

  // GOOD: depend on primitive values
  useEffect(() => {
    saveToAnalytics({ id: user.id, name: user.name });
  }, [user.id, user.name]); // only runs when id or name actually change
}
```

### useEffect vs useLayoutEffect

```
useEffect:
  Render → DOM update → Browser paints → useEffect runs (async)
  Use for: data fetching, subscriptions, logging

useLayoutEffect:
  Render → DOM update → useLayoutEffect runs (sync) → Browser paints
  Use for: reading DOM layout, preventing visual flicker
```

```jsx
function Tooltip({ targetRef }) {
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // useLayoutEffect: measure DOM before paint to prevent flicker
  useLayoutEffect(() => {
    const rect = targetRef.current.getBoundingClientRect();
    setPosition({ top: rect.bottom, left: rect.left });
  }, [targetRef]);

  return <div style={{ position: 'absolute', ...position }}>Tooltip</div>;
}
```

---

## useRef — Mutable References

Two primary uses: **DOM access** and **mutable values that don't trigger re-renders**.

```jsx
function TextInput() {
  const inputRef = useRef(null);

  const focusInput = () => {
    inputRef.current.focus(); // Direct DOM access
  };

  return (
    <>
      <input ref={inputRef} />
      <button onClick={focusInput}>Focus</button>
    </>
  );
}
```

### useRef as Instance Variable (No Re-render)

```jsx
function Timer() {
  const [seconds, setSeconds] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setSeconds(s => s + 1);
    }, 1000);

    return () => clearInterval(intervalRef.current);
  }, []);

  const stop = () => clearInterval(intervalRef.current);

  return <p>{seconds}s <button onClick={stop}>Stop</button></p>;
}
```

### useRef vs useState

```jsx
function RenderCounter() {
  const [stateVal, setStateVal] = useState(0);
  const refVal = useRef(0);

  const updateBoth = () => {
    setStateVal(stateVal + 1);  // triggers re-render
    refVal.current += 1;         // does NOT trigger re-render
  };

  console.log('render', { stateVal, refCurrent: refVal.current });
  // After one click: { stateVal: 1, refCurrent: 1 }
  // refVal.current is always the latest value — no stale closure issue
}
```

---

## useMemo — Memoize Computed Values

```jsx
function FilteredList({ items, filter }) {
  // Without useMemo: filters on EVERY render (even if items/filter unchanged)
  // With useMemo: only recomputes when items or filter change
  const filtered = useMemo(() => {
    console.log('filtering...');
    return items.filter(item => item.name.includes(filter));
  }, [items, filter]);

  return <ul>{filtered.map(i => <li key={i.id}>{i.name}</li>)}</ul>;
}
```

### When NOT to Use useMemo

```jsx
// UNNECESSARY: simple computation, not expensive
const fullName = useMemo(() => `${first} ${last}`, [first, last]);
// Just do: const fullName = `${first} ${last}`;

// UNNECESSARY: React already handles this efficiently
const doubled = useMemo(() => count * 2, [count]);
// Just do: const doubled = count * 2;
```

---

## useCallback — Memoize Functions

```jsx
function Parent() {
  const [count, setCount] = useState(0);

  // Without useCallback: new function reference every render
  // Child (if wrapped in React.memo) would re-render unnecessarily
  const handleClick = useCallback(() => {
    console.log('clicked');
  }, []); // stable reference across renders

  return (
    <>
      <button onClick={() => setCount(c => c + 1)}>Count: {count}</button>
      <MemoChild onClick={handleClick} />
    </>
  );
}

const MemoChild = React.memo(({ onClick }) => {
  console.log('MemoChild renders');
  return <button onClick={onClick}>Click me</button>;
});
```

### useCallback is useMemo for Functions

```jsx
// These are equivalent:
const handleClick = useCallback(() => { doThing(); }, [dep]);
const handleClick = useMemo(() => () => { doThing(); }, [dep]);
```

---

## useReducer — Complex State Logic

```jsx
const initialState = { count: 0, step: 1 };

function reducer(state, action) {
  switch (action.type) {
    case 'increment':
      return { ...state, count: state.count + state.step };
    case 'decrement':
      return { ...state, count: state.count - state.step };
    case 'setStep':
      return { ...state, step: action.payload };
    case 'reset':
      return initialState;
    default:
      throw new Error(`Unknown action: ${action.type}`);
  }
}

function Counter() {
  const [state, dispatch] = useReducer(reducer, initialState);

  return (
    <div>
      <p>Count: {state.count} (step: {state.step})</p>
      <button onClick={() => dispatch({ type: 'increment' })}>+</button>
      <button onClick={() => dispatch({ type: 'decrement' })}>-</button>
      <button onClick={() => dispatch({ type: 'setStep', payload: 5 })}>Step=5</button>
      <button onClick={() => dispatch({ type: 'reset' })}>Reset</button>
    </div>
  );
}
```

### When useReducer > useState

- Multiple related state values
- Next state depends on previous state
- Complex state transitions (state machines)
- When you want to pass `dispatch` down (stable reference, unlike setter functions with closures)

---

## useContext — Sharing Values Across the Tree

```jsx
const ThemeContext = React.createContext('light');

function App() {
  const [theme, setTheme] = useState('light');

  return (
    <ThemeContext.Provider value={theme}>
      <Header />
      <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
        Toggle
      </button>
    </ThemeContext.Provider>
  );
}

function Header() {
  return <NavBar />;  // doesn't need to know about theme
}

function NavBar() {
  const theme = useContext(ThemeContext);
  return <nav className={theme}>Navigation</nav>;
}
```

### Context Pitfall: All Consumers Re-render

```jsx
// PROBLEM: Every consumer re-renders when ANY value in the context changes
const AppContext = React.createContext();

function App() {
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState('light');

  // BAD: new object every render → all consumers re-render
  return (
    <AppContext.Provider value={{ user, theme, setUser, setTheme }}>
      <UserPanel />  {/* re-renders when theme changes, even though it only uses user */}
      <ThemePanel /> {/* re-renders when user changes, even though it only uses theme */}
    </AppContext.Provider>
  );
}

// BETTER: Split into separate contexts
const UserContext = React.createContext();
const ThemeContext = React.createContext();
```

---

## Rules of Hooks — And Why

### Rule 1: Only Call Hooks at the Top Level

```jsx
// BAD: Hook inside condition
function Profile({ userId }) {
  if (userId) {
    useEffect(() => fetchUser(userId), [userId]); // ❌
  }
}

// WHY: React identifies hooks by their CALL ORDER (index).
// Render 1: useState (index 0), useEffect (index 1)
// Render 2 (if skipped): useState (index 0) → where's useEffect?
// React's internal hook list gets misaligned → bugs

// GOOD: Condition inside the hook
function Profile({ userId }) {
  useEffect(() => {
    if (userId) fetchUser(userId);
  }, [userId]); // ✅
}
```

### Rule 2: Only Call Hooks from React Functions

```jsx
// BAD: Hook in regular function
function getUser() {
  const [user, setUser] = useState(null); // ❌
}

// GOOD: Hook in component or custom hook
function useUser() {
  const [user, setUser] = useState(null); // ✅ (custom hook)
  return user;
}
```

---

## Custom Hooks — Reusable Logic

### Pattern: Extracting Shared Logic

```jsx
function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}

// Usage
function Settings() {
  const [theme, setTheme] = useLocalStorage('theme', 'light');
  const [lang, setLang] = useLocalStorage('lang', 'en');
  // ...
}
```

### Pattern: Async Data Fetching

```jsx
function useFetch(url) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;  // prevent state update on unmounted component
    setLoading(true);

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(json => {
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [url]);

  return { data, loading, error };
}

// Usage
function UserProfile({ userId }) {
  const { data: user, loading, error } = useFetch(`/api/users/${userId}`);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;
  return <p>{user.name}</p>;
}
```

### Pattern: useDebounce

```jsx
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// Usage
function Search() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (debouncedQuery) {
      searchAPI(debouncedQuery);
    }
  }, [debouncedQuery]); // only fires 300ms after user stops typing

  return <input value={query} onChange={e => setQuery(e.target.value)} />;
}
```

---

## Interview Quick Hits

**Q: Why can't you call hooks inside loops or conditions?**
React tracks hooks by call index. If the number or order of hook calls changes between renders, React's internal state array gets out of sync.

**Q: Does useEffect run before or after paint?**
After. The browser paints first, then useEffect fires asynchronously. Use useLayoutEffect if you need to run before paint.

**Q: What's the difference between `useRef` and a module-level variable?**
`useRef` is per-component-instance. A module-level variable is shared across all instances of that component.

**Q: When does the cleanup function of useEffect run?**
Before the next execution of the effect (when deps change) AND when the component unmounts.

**Q: Is `setState` synchronous?**
No. State updates are scheduled and batched. You won't see the new value until the next render. Use functional updates (`setCount(prev => prev + 1)`) to access the latest state.
