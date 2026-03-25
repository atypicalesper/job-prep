# State Management in React

## The State Spectrum

```
Simple ◄──────────────────────────────────────────────► Complex

useState     useReducer     Context API     Zustand/Jotai     Redux
  │              │               │               │               │
  │              │               │               │               │
local state   complex local   shared across    global state    global state
one component  transitions    subtree          simple API      predictable,
                                                               middleware
```

---

## useState vs useReducer — When to Use Which

Both `useState` and `useReducer` manage local component state, but they suit different complexity levels. `useState` is idiomatic for one or two independent values where the update logic is a simple replacement. `useReducer` becomes preferable when multiple state values are interdependent (the next state of one depends on another), when you want to express transitions as named actions for clarity and testability, or when you need to pass the update mechanism deeply without creating closure-heavy setter callbacks.

### useState: Simple, Independent Values

```jsx
function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  return (
    <form>
      <input value={email} onChange={e => setEmail(e.target.value)} />
      <input value={password} onChange={e => setPassword(e.target.value)} />
      <input
        type="checkbox"
        checked={rememberMe}
        onChange={e => setRememberMe(e.target.checked)}
      />
    </form>
  );
}
```

### useReducer: Interrelated State, Complex Transitions

```jsx
const initialState = {
  status: 'idle',   // 'idle' | 'loading' | 'success' | 'error'
  data: null,
  error: null,
};

function fetchReducer(state, action) {
  switch (action.type) {
    case 'FETCH_START':
      return { status: 'loading', data: null, error: null };
    case 'FETCH_SUCCESS':
      return { status: 'success', data: action.payload, error: null };
    case 'FETCH_ERROR':
      return { status: 'error', data: null, error: action.payload };
    default:
      throw new Error(`Unhandled action: ${action.type}`);
  }
}

function UserProfile({ userId }) {
  const [state, dispatch] = useReducer(fetchReducer, initialState);

  useEffect(() => {
    dispatch({ type: 'FETCH_START' });
    fetchUser(userId)
      .then(data => dispatch({ type: 'FETCH_SUCCESS', payload: data }))
      .catch(err => dispatch({ type: 'FETCH_ERROR', payload: err.message }));
  }, [userId]);

  if (state.status === 'loading') return <Spinner />;
  if (state.status === 'error') return <p>Error: {state.error}</p>;
  if (state.status === 'success') return <p>{state.data.name}</p>;
  return null;
}
```

### Decision Guide

| Criteria | useState | useReducer |
|----------|----------|------------|
| Number of state fields | 1-3 | 4+ related fields |
| State transitions | Simple set | Depends on previous state |
| State machine behavior | No | Yes |
| Testing state logic | Hard (in component) | Easy (pure function) |
| Passing updater down | Creates closures | `dispatch` is stable |

---

## State Lifting and Prop Drilling

State lifting is the React pattern for sharing state between sibling components: move the state up to their closest common ancestor, then pass it down as props. This keeps the data flow unidirectional and predictable. The problem it creates — prop drilling — occurs when intermediate components must receive and forward props they do not themselves use, purely to pass them to a deeper descendant. Prop drilling is not always wrong (it makes data flow explicit), but it becomes painful when the same prop is threaded through 4+ components. The solutions are component composition (passing already-rendered JSX as `children`) and Context API.

### State Lifting: Shared State Goes to Common Ancestor

```jsx
// BEFORE: Each input has its own state — can't sync them
function TempInput() {
  const [temp, setTemp] = useState('');
  return <input value={temp} onChange={e => setTemp(e.target.value)} />;
}

// AFTER: Lift state to parent
function TemperatureConverter() {
  const [celsius, setCelsius] = useState('');

  const fahrenheit = celsius ? (parseFloat(celsius) * 9/5 + 32).toFixed(1) : '';

  return (
    <div>
      <label>Celsius</label>
      <input value={celsius} onChange={e => setCelsius(e.target.value)} />
      <label>Fahrenheit</label>
      <input value={fahrenheit} readOnly />
    </div>
  );
}
```

### Prop Drilling — The Problem

```jsx
function App() {
  const [user, setUser] = useState({ name: 'Alice', theme: 'dark' });

  return <Layout user={user} />;
}

function Layout({ user }) {
  // Layout doesn't USE user, just passes it down
  return (
    <div>
      <Sidebar user={user} />
      <Main user={user} />
    </div>
  );
}

function Sidebar({ user }) {
  // Sidebar doesn't USE user either
  return <UserAvatar user={user} />;
}

function UserAvatar({ user }) {
  // Finally! Someone actually uses it
  return <img src={`/avatars/${user.name}.png`} alt={user.name} />;
}

// Problem: Layout and Sidebar are "middlemen" — they receive and pass
// a prop they don't care about. If you rename the prop, you touch 4 files.
```

### Solutions to Prop Drilling

**1. Component Composition (often the best fix)**

```jsx
function App() {
  const [user, setUser] = useState({ name: 'Alice' });

  return (
    <Layout
      sidebar={<UserAvatar user={user} />}
      main={<Dashboard user={user} />}
    />
  );
}

function Layout({ sidebar, main }) {
  // Layout doesn't need to know about user at all
  return (
    <div>
      <aside>{sidebar}</aside>
      <main>{main}</main>
    </div>
  );
}
```

**2. Context API (for truly global values)**

```jsx
const UserContext = React.createContext(null);

function App() {
  const [user, setUser] = useState({ name: 'Alice' });

  return (
    <UserContext.Provider value={user}>
      <Layout />
    </UserContext.Provider>
  );
}

function Layout() {
  return (
    <div>
      <Sidebar />
      <Main />
    </div>
  );
}

function UserAvatar() {
  const user = useContext(UserContext);  // skip all the middlemen
  return <img src={`/avatars/${user.name}.png`} alt={user.name} />;
}
```

---

## Context API — Deep Dive

React Context is a mechanism for making a value available to any component in a subtree without threading it through props at every level. It is best suited for values that are read by many components at different nesting levels but change infrequently: theme, locale, authenticated user, feature flags. The critical performance characteristic to understand is that every component subscribed to a context re-renders when the context value reference changes — even if the component only uses a small slice of the value. This makes Context inappropriate for high-frequency state (form inputs, mouse position) without careful memoization or context splitting.

### When Context Makes Sense

- Theme (light/dark)
- Current authenticated user
- Locale / i18n
- Feature flags
- Any value needed by many components at different nesting levels

### When Context is a BAD Choice

- Frequently changing values (causes mass re-renders)
- State that only a few nearby components need (prop drilling is fine)
- Complex state with many actions (use external state library)

### The Re-render Problem

```jsx
const AppContext = React.createContext();

function App() {
  const [count, setCount] = useState(0);
  const [theme, setTheme] = useState('light');

  // Every state change creates a new value object
  // ALL consumers re-render — even if they only use one field
  const value = { count, theme, setCount, setTheme };

  return (
    <AppContext.Provider value={value}>
      <CountDisplay />   {/* re-renders when theme changes */}
      <ThemeDisplay />   {/* re-renders when count changes */}
    </AppContext.Provider>
  );
}
```

### Fix: Split Contexts

```jsx
const CountContext = React.createContext();
const ThemeContext = React.createContext();

function App() {
  const [count, setCount] = useState(0);
  const [theme, setTheme] = useState('light');

  return (
    <CountContext.Provider value={{ count, setCount }}>
      <ThemeContext.Provider value={{ theme, setTheme }}>
        <CountDisplay />   {/* only re-renders when count changes */}
        <ThemeDisplay />   {/* only re-renders when theme changes */}
      </ThemeContext.Provider>
    </CountContext.Provider>
  );
}
```

### Fix: Memoize the Value

```jsx
function App() {
  const [count, setCount] = useState(0);
  const [theme, setTheme] = useState('light');

  // Memoize so the value reference is stable unless deps change
  const countValue = useMemo(() => ({ count, setCount }), [count]);
  const themeValue = useMemo(() => ({ theme, setTheme }), [theme]);

  return (
    <CountContext.Provider value={countValue}>
      <ThemeContext.Provider value={themeValue}>
        <Children />
      </ThemeContext.Provider>
    </CountContext.Provider>
  );
}
```

---

## External State Libraries

External state libraries solve the limitations of React's built-in state primitives for global application state. Context is not performant for frequently changing values; `useState` and `useReducer` are scoped to component instances. External libraries maintain state outside the React component tree entirely and provide subscription-based access so components only re-render when the specific slice of state they use changes. The right choice depends on your needs: Redux Toolkit for large apps with complex state transitions and a need for dev tooling, Zustand for a lightweight option with minimal boilerplate, Jotai for a bottom-up atomic model that composes naturally with Suspense.

### Redux Pattern — Core Concepts

```
Action → Dispatcher → Reducer → Store → View → Action
```

```javascript
// 1. Action — plain object describing what happened
const increment = { type: 'counter/increment', payload: 1 };

// 2. Reducer — pure function: (state, action) => newState
function counterReducer(state = { value: 0 }, action) {
  switch (action.type) {
    case 'counter/increment':
      return { value: state.value + action.payload };
    case 'counter/decrement':
      return { value: state.value - action.payload };
    default:
      return state;
  }
}

// 3. Store — holds all state
const store = createStore(counterReducer);

// 4. Dispatch — sends actions to the store
store.dispatch({ type: 'counter/increment', payload: 5 });
console.log(store.getState()); // { value: 5 }
```

### Modern Redux Toolkit (RTK)

```javascript
import { createSlice, configureStore } from '@reduxjs/toolkit';

const counterSlice = createSlice({
  name: 'counter',
  initialState: { value: 0 },
  reducers: {
    increment: (state, action) => {
      state.value += action.payload; // Immer lets you "mutate" safely
    },
    decrement: (state, action) => {
      state.value -= action.payload;
    },
  },
});

export const { increment, decrement } = counterSlice.actions;

const store = configureStore({
  reducer: { counter: counterSlice.reducer },
});

// In component
function Counter() {
  const count = useSelector(state => state.counter.value);
  const dispatch = useDispatch();

  return (
    <button onClick={() => dispatch(increment(1))}>
      Count: {count}
    </button>
  );
}
```

### Zustand — Minimal Global State

```javascript
import { create } from 'zustand';

const useStore = create((set, get) => ({
  count: 0,
  increment: () => set(state => ({ count: state.count + 1 })),
  decrement: () => set(state => ({ count: state.count - 1 })),
  reset: () => set({ count: 0 }),
  // Async actions — no middleware needed
  fetchCount: async () => {
    const res = await fetch('/api/count');
    const data = await res.json();
    set({ count: data.count });
  },
}));

// In component — only re-renders when `count` changes
function Counter() {
  const count = useStore(state => state.count);
  const increment = useStore(state => state.increment);

  return <button onClick={increment}>Count: {count}</button>;
}
```

**Why Zustand over Redux?**
- No boilerplate (no actions, action types, reducers, providers)
- No context provider needed (works outside React too)
- Built-in selectors for fine-grained re-renders
- Tiny bundle size (~1KB)

### Jotai — Atomic State

```javascript
import { atom, useAtom } from 'jotai';

// Atoms — minimal units of state
const countAtom = atom(0);
const doubleCountAtom = atom(get => get(countAtom) * 2); // derived atom

function Counter() {
  const [count, setCount] = useAtom(countAtom);
  const [doubled] = useAtom(doubleCountAtom); // auto-updates

  return (
    <div>
      <p>Count: {count}, Doubled: {doubled}</p>
      <button onClick={() => setCount(c => c + 1)}>+</button>
    </div>
  );
}

// No Provider needed (Jotai v2)
// Only components using an atom re-render when it changes
```

**Why Jotai?**
- Bottom-up approach (atoms compose into state)
- No selectors needed — each atom is its own subscription
- Works great with Suspense (async atoms)
- Inspired by Recoil but simpler

---

## When to Use What — Decision Tree

```
                      Do you need state?
                           │
                      ┌────┴────┐
                      No        Yes
                      │         │
                  (derive     Is it used by only
                   from       one component?
                   props)          │
                            ┌─────┴─────┐
                           Yes          No
                            │            │
                        useState      Is it needed by
                        or            a few nearby
                        useReducer    components?
                                         │
                                    ┌────┴────┐
                                   Yes        No
                                    │          │
                                Lift state   Is it truly
                                to parent    global? (auth,
                                             theme, cart)
                                                │
                                           ┌────┴────┐
                                          No         Yes
                                           │          │
                                      Component    Does it change
                                      composition  frequently?
                                      (children       │
                                       prop)     ┌────┴────┐
                                                No        Yes
                                                 │          │
                                            Context     External lib
                                            API         (Zustand/Jotai
                                                        /Redux)
```

### Quick Reference

| Solution | Best For | Gotchas |
|----------|----------|---------|
| useState | Local, simple state | Stale closures, no batching awareness |
| useReducer | Complex local transitions | Verbose for simple cases |
| Lift state | 2-3 components sharing state | Can lead to prop drilling |
| Composition | Avoiding drilling in layout | Requires thinking in components |
| Context | Low-frequency global (theme, auth) | All consumers re-render on change |
| Zustand | Global state, simple API | Another dependency |
| Jotai | Atomic, bottom-up global state | Learning curve for derived atoms |
| Redux Toolkit | Large apps, middleware, devtools | Boilerplate, learning curve |

---

## Interview Quick Hits

**Q: Why not put everything in Context?**
Context re-renders ALL consumers on any change. For frequently changing state (form inputs, animations), this kills performance. Use Context for slow-changing globals (theme, auth).

**Q: Can you use Redux and Context together?**
Yes. Redux for complex app state, Context for UI concerns (theme, modals). Redux itself uses Context internally for its Provider.

**Q: What is the "single source of truth" principle?**
Each piece of state should live in exactly one place. Don't duplicate state across useState, Context, and a URL param. Pick one and derive the rest.

**Q: How does Zustand avoid the Context re-render problem?**
Zustand uses external stores with selector-based subscriptions. Components subscribe to specific slices of state and only re-render when their selected value changes — no React context involved.

**Q: When is prop drilling actually fine?**
When it's 2-3 levels deep and the intermediate components meaningfully use the data or it's clear from the component names what flows through. Not every prop chain is "drilling."
