# Zustand & Jotai

Lightweight alternatives to Redux — minimal API, no providers required (Zustand), atomic model (Jotai).

---

## Zustand

```bash
npm install zustand
```

Zustand uses a single hook based on a store creator. No Provider, no boilerplate.

### Basic Store

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

```bash
npm install jotai
```

Jotai takes an **atomic** approach — state is split into small atoms. Components subscribe to only the atoms they need.

### Basic Atoms

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
