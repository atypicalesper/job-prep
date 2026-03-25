# Zustand & Jotai

Lightweight alternatives to Redux — minimal API, no providers required (Zustand), atomic model (Jotai).

---

## Zustand

Zustand is a minimal global state library built around a single concept: a `create` function that returns a hook. It has no Provider, no action types, no reducers, and no context boilerplate — the entire API fits in a few dozen lines. Internally it uses a subscription model similar to React's `useSyncExternalStore`: components subscribe to the store and re-render only when the slice they select changes. At ~3KB gzipped, Zustand has negligible bundle impact compared to Redux Toolkit.

```bash
npm install zustand
```

Zustand uses a single hook based on a store creator. No Provider, no boilerplate.

### Basic Store

The `create` function accepts a callback that receives `set` (for updating state) and returns an object defining both state values and actions. Actions are just regular functions that call `set` — there is no separation between action creators and reducers. The result is a custom hook that any component can call directly without any wrapping provider.

```ts
import { create } from 'zustand';

interface CounterStore {
  count: number;
  increment: () => void;
  decrement: () => void;
  reset: () => void;
  incrementBy: (n: number) => void;
}

export const useCounterStore = create<CounterStore>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
  decrement: () => set((state) => ({ count: state.count - 1 })),
  reset: () => set({ count: 0 }),
  incrementBy: (n) => set((state) => ({ count: state.count + n })),
}));

// Component — no Provider needed
function Counter() {
  const { count, increment, decrement } = useCounterStore();
  return (
    <div>
      <button onClick={decrement}>-</button>
      <span>{count}</span>
      <button onClick={increment}>+</button>
    </div>
  );
}
```

### Selectors — Prevent Unnecessary Re-renders

When you call `useCounterStore()` with no arguments, the component re-renders any time *any* field in the store changes — even fields it never reads. Passing a selector function tells Zustand to only notify that component when the selected slice changes. For objects (multiple values at once), Zustand's `shallow` comparator does a one-level equality check so you don't get unnecessary re-renders from new object references.

```ts
// ❌ Subscribes to entire store — re-renders on any change
const store = useCounterStore();

// ✅ Subscribes only to count — re-renders only when count changes
const count = useCounterStore((state) => state.count);

// ✅ Multiple values — use shallow comparison
import { shallow } from 'zustand/shallow';

const { count, increment } = useCounterStore(
  (state) => ({ count: state.count, increment: state.increment }),
  shallow
);
```

### Async Actions

Unlike Redux, Zustand has no special construct for async operations — you write ordinary `async` functions directly inside the store creator. The function calls `set` before the await (to show a loading state) and again after (to store the result or error). There is no `createAsyncThunk` boilerplate; the store itself is the canonical place to encapsulate both the async logic and the state it affects.

```ts
interface UserStore {
  user: User | null;
  loading: boolean;
  error: string | null;
  fetchUser: (id: string) => Promise<void>;
}

export const useUserStore = create<UserStore>((set) => ({
  user: null,
  loading: false,
  error: null,
  fetchUser: async (id) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`/api/users/${id}`);
      const user = await res.json();
      set({ user, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },
}));
```

### Middleware: Persist to localStorage

Zustand's `persist` middleware automatically serializes the store to a storage backend (localStorage by default) on every state change and rehydrates it on page load. You can restrict which fields are saved using `partialize` — useful when some state (like loading flags or large caches) should not survive a page refresh. This gives you localStorage persistence with zero manual read/write code.

```ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const useSettingsStore = create(
  persist<SettingsStore>(
    (set) => ({
      theme: 'dark',
      fontSize: 14,
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'app-settings',              // localStorage key
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ theme: state.theme }), // only persist theme
    }
  )
);
```

### Middleware: DevTools

Wrapping a Zustand store with the `devtools` middleware connects it to the Redux DevTools browser extension. This lets you inspect every `set` call as a labeled action, time-travel through state changes, and diff before/after state — the same tooling as Redux without the boilerplate. The `name` option labels the store in the DevTools panel when you have multiple stores.

```ts
import { devtools } from 'zustand/middleware';

export const useStore = create(
  devtools<StoreType>(
    (set) => ({ ... }),
    { name: 'MyStore' }  // shows in Redux DevTools
  )
);
```

### Combining Middleware

Zustand middleware composes by nesting — each middleware wraps the next, innermost first. The `immer` middleware (from `zustand/middleware/immer`) lets you write mutating-style reducers as Immer handles the immutable copy, just like RTK. The order of wrapping matters: `devtools` should be outermost so it sees all mutations; `persist` should wrap `immer` so it serializes the final produced state.

```ts
export const useStore = create(
  devtools(
    persist(
      immer<StoreType>((set) => ({
        items: [],
        addItem: (item) => set((state) => { state.items.push(item); }),
      })),
      { name: 'my-store' }
    )
  )
);
```

### Slices Pattern (for large stores)

As a Zustand store grows, keeping all state and actions in one `create` call becomes unwieldy. The slices pattern breaks domain concerns into separate creator functions that each accept `set` and `get` as arguments, then spreads them into a single store. This mirrors the mental model of Redux slices without any of the Redux infrastructure — you still get one store, one hook, and no Provider.

```ts
// Compose multiple slices into one store
const createCartSlice = (set) => ({
  items: [],
  addItem: (item) => set((state) => ({ items: [...state.items, item] })),
  removeItem: (id) => set((state) => ({ items: state.items.filter(i => i.id !== id) })),
});

const createUserSlice = (set) => ({
  user: null,
  setUser: (user) => set({ user }),
  logout: () => set({ user: null }),
});

export const useStore = create((set, get) => ({
  ...createCartSlice(set),
  ...createUserSlice(set),
}));
```

### Reading State Outside Components

React hooks only work inside components, but sometimes you need store state in utility functions, HTTP interceptors, or event handlers that live outside the React tree. Zustand exposes `.getState()` directly on the store object for synchronous reads and `.subscribe()` for reactive external listeners — no hook required. This is a key ergonomic advantage over Redux, which requires importing the `store` directly and is considered an anti-pattern there.

```ts
// Access store state in non-React code (utils, services)
const { user } = useUserStore.getState();

// Subscribe to changes outside React
const unsub = useUserStore.subscribe(
  (state) => state.count,
  (count) => console.log('count changed:', count)
);
```

### Zustand vs Redux

| | Zustand | Redux Toolkit |
|---|---|---|
| Setup | ~5 lines | configureStore + slices |
| Provider | Not needed | `<Provider store={store}>` |
| DevTools | Optional middleware | Built-in |
| Async | Plain async functions | `createAsyncThunk` |
| Middleware | Compose manually | `getDefaultMiddleware` |
| Bundle size | ~3KB | ~15KB |
| Data fetching | Manual or React Query | RTK Query |
| Best for | Small–medium apps | Large apps, complex flows |

---

## Jotai

Jotai is inspired by Recoil (Facebook's experimental state library) and takes a fundamentally different approach from Zustand or Redux: instead of one central store, state is split into individual atoms that can be composed and derived from each other. There is no global store object — atoms are module-level constants, and Jotai manages their values in a `Provider`-scoped store (or a default global store if no Provider is used). The atomic model excels when different parts of the UI need overlapping but not identical subsets of state, or when state has complex async derivation chains.

```bash
npm install jotai
```

Jotai takes an **atomic** approach — state is split into small atoms. Components subscribe to only the atoms they need.

### Basic Atoms

An atom is the smallest unit of state in Jotai — a single, independently subscribable value. Components read atoms with `useAtomValue` and write them with `useSetAtom`; using both together is `useAtom`. Derived atoms automatically track their dependencies: when `countAtom` changes, any component subscribed to `doubleCountAtom` re-renders automatically. This fine-grained subscription model means a component that reads only one atom never re-renders when an unrelated atom changes.

```ts
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';

// Primitive atom
export const countAtom = atom(0);

// Derived (read-only) atom
export const doubleCountAtom = atom((get) => get(countAtom) * 2);

// Derived (read-write) atom
export const incrementedAtom = atom(
  (get) => get(countAtom),
  (get, set, amount: number) => set(countAtom, get(countAtom) + amount)
);
```

```tsx
function Counter() {
  const [count, setCount] = useAtom(countAtom);
  const double = useAtomValue(doubleCountAtom);
  const increment = useSetAtom(countAtom);

  return (
    <div>
      <p>Count: {count}, Double: {double}</p>
      <button onClick={() => setCount(c => c + 1)}>+</button>
    </div>
  );
}
```

### Async Atoms

Jotai atoms can be async: if the read function returns a Promise, the atom integrates natively with React Suspense. The component suspends while the promise is pending and renders once it resolves — no explicit `isLoading` state needed. Because async atoms participate in the same dependency graph as synchronous ones, changing `selectedIdAtom` automatically re-fetches `userAtom`. This is Jotai's strongest differentiator: async data and derived state unify into a single reactive graph.

```ts
// Async read atom — Suspense compatible
const userAtom = atom(async (get) => {
  const id = get(selectedIdAtom);
  const res = await fetch(`/api/users/${id}`);
  return res.json();
});

// Usage — must wrap in Suspense
function UserProfile() {
  const user = useAtomValue(userAtom); // suspends until resolved
  return <div>{user.name}</div>;
}

function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <UserProfile />
    </Suspense>
  );
}
```

### atomWithStorage (Persist)

`atomWithStorage` from `jotai/utils` creates an atom that is automatically persisted to and rehydrated from a storage backend (localStorage by default). It has the same API as a regular atom — you use `useAtom` exactly as you would for in-memory state. This is the simplest persistence primitive in the Jotai ecosystem: one line replaces any custom read/write/hydration code.

```ts
import { atomWithStorage } from 'jotai/utils';

const themeAtom = atomWithStorage('theme', 'dark');

function ThemeToggle() {
  const [theme, setTheme] = useAtom(themeAtom);
  return (
    <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>
      {theme}
    </button>
  );
}
```

### atomFamily (Dynamic atoms)

`atomFamily` is a factory that creates one distinct atom per parameter value. It solves the problem of needing per-entity state — for example, a separate loading or data atom for each post ID — without manually managing a map of atoms. Calling `postAtomFamily(id)` always returns the same atom instance for that ID, so subscriptions are stable and memory is not wasted on duplicates.

```ts
import { atomFamily } from 'jotai/utils';

// Creates one atom per id
const postAtomFamily = atomFamily((id: string) =>
  atom(async () => {
    const res = await fetch(`/api/posts/${id}`);
    return res.json();
  })
);

function Post({ id }: { id: string }) {
  const post = useAtomValue(postAtomFamily(id));
  return <div>{post.title}</div>;
}
```

### Jotai DevTools

Because Jotai's state lives in atoms scattered across the module graph rather than in a single store, standard Redux DevTools can't see it directly. The `jotai-devtools` package bridges this gap by registering all atoms with the DevTools extension, letting you inspect their current values and track changes over time.

```tsx
import { useAtomsDevtools } from 'jotai-devtools';
// Wrap app and inspect all atoms in Redux DevTools
```

### Jotai vs Zustand vs Redux

| | Jotai | Zustand | Redux Toolkit |
|---|---|---|---|
| Mental model | Atoms (fine-grained) | Single store | Single store |
| Re-renders | Per atom — very granular | Selector-based | Selector-based |
| Async | Built-in (Suspense) | Manual | `createAsyncThunk` |
| Devtools | `jotai-devtools` | `devtools` middleware | Built-in |
| Bundle | ~3KB | ~3KB | ~15KB |
| Best for | Fine-grained reactivity | Simple global state | Complex, teams |

---

## Which to Choose?

```
Feature complexity →
Low                                                        High
│                                                           │
useState     Context+useReducer     Zustand/Jotai     Redux Toolkit
             (small subtree)        (global, simple)   (large app,
                                                         middleware,
                                                         RTK Query)
```

**Practical guide:**
- **useState** — local component state
- **useReducer** — complex local state with actions
- **Context** — theme, auth, i18n (low-frequency updates)
- **Zustand** — global state, medium app, minimal setup
- **Jotai** — when you need fine-grained atom subscriptions (derived state, async)
- **Redux Toolkit** — large team, need time-travel debug, complex async flows, RTK Query for data fetching
