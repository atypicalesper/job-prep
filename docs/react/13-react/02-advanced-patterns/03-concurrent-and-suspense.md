# Concurrent React & Suspense

React 18 introduced the concurrent renderer — React can now prepare multiple versions of the UI at the same time, interrupt renders, and prioritize urgent updates.

---

## The Concurrent Model

In the legacy renderer, rendering was **synchronous and uninterruptible** — once React started updating the tree it couldn't stop. This caused jank on large trees.

In concurrent mode React can:
- **Pause** a render mid-way and resume later
- **Abandon** a render that became stale
- **Prioritize** urgent updates (typing) over deferred ones (search results re-render)

---

## createRoot (React 18)

`createRoot` is the opt-in entry point to React 18's concurrent renderer. All React 18 features — automatic batching, `useTransition`, `useDeferredValue`, Suspense for data — require the concurrent renderer and are only available after opting in via `createRoot`. The legacy `ReactDOM.render` still works in React 18 but uses the synchronous renderer and does not enable concurrent features. Migrating is a one-line change in your app entry point.

```jsx
// React 17 (legacy)
import ReactDOM from 'react-dom';
ReactDOM.render(<App />, document.getElementById('root'));

// React 18 (concurrent)
import { createRoot } from 'react-dom/client';
createRoot(document.getElementById('root')).render(<App />);
```

Opting into `createRoot` enables concurrent features and automatic batching.

---

## Automatic Batching

Batching is React's mechanism for grouping multiple state updates from the same synchronous block into a single re-render. In React 17, this only worked inside React-managed event handlers (like `onClick`). Updates in `setTimeout`, `Promise.then`, or native event listeners each triggered separate re-renders. React 18's automatic batching extends this to all contexts, reducing render count and preventing intermediate renders where the UI would briefly show partially-updated state.

React 18 batches **all** state updates by default — even those inside setTimeout, Promises, and native event handlers.

```js
// React 17: two renders
setTimeout(() => { setA(1); setB(2); }, 0);

// React 18: one render
setTimeout(() => { setA(1); setB(2); }, 0);
```

**Override with `flushSync`:**
```js
import { flushSync } from 'react-dom';
flushSync(() => setA(1)); // DOM updated synchronously here
setB(2); // second render
```

---

## useTransition

Marks a state update as non-urgent. React shows the current UI while preparing the new one.

```jsx
function SearchResults() {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState([]);
  const [isPending, startTransition] = React.useTransition();

  function handleChange(e) {
    const val = e.target.value;
    setQuery(val); // urgent — updates input immediately

    startTransition(() => {
      setResults(searchIndex(val)); // non-urgent — can be interrupted
    });
  }

  return (
    <>
      <input value={query} onChange={handleChange} />
      {isPending && <Spinner />}
      <ResultList items={results} />
    </>
  );
}
```

**Key insight:** The input stays responsive because `setQuery` is urgent. The expensive filter runs in a lower-priority render that can be interrupted by the next keystroke.

---

## useDeferredValue

Defers a value that you receive from props or context (when you can't wrap the setter).

```jsx
function App({ query }) {
  const deferredQuery = React.useDeferredValue(query);

  // deferredQuery lags behind query during transitions
  const results = React.useMemo(() => search(deferredQuery), [deferredQuery]);

  return (
    <>
      {query !== deferredQuery && <Spinner />}
      <ResultList items={results} />
    </>
  );
}
```

**vs `useTransition`:**
- `useTransition` — you control the setter
- `useDeferredValue` — you receive a value you can't control

---

## Suspense

When a component isn't ready to render (lazy import, data fetch), it **suspends** by throwing a Promise. React catches this and shows the nearest `<Suspense>` fallback.

```jsx
const ProfilePage = React.lazy(() => import('./ProfilePage'));

function App() {
  return (
    <Suspense fallback={<Skeleton />}>
      <ProfilePage userId={1} />
    </Suspense>
  );
}
```

### Suspense for Data Fetching

Works with frameworks that implement the "suspend on Promise" contract (Next.js App Router, Relay, SWR with `suspense: true`):

```jsx
// With SWR suspense mode
function Profile({ id }) {
  const { data } = useSWR(`/users/${id}`, { suspense: true });
  // data is always defined here — component only renders when ready
  return <h1>{data.name}</h1>;
}

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <ErrorBoundary fallback={<Error />}>
        <Profile id={1} />
      </ErrorBoundary>
    </Suspense>
  );
}
```

---

## Suspense + Transitions

Combining them prevents old UI from being replaced by a fallback during navigation:

```jsx
function App() {
  const [page, setPage] = React.useState('home');
  const [isPending, startTransition] = React.useTransition();

  function navigate(p) {
    startTransition(() => setPage(p));
  }

  return (
    <>
      <nav>
        <button onClick={() => navigate('home')}>Home</button>
        <button onClick={() => navigate('about')}>About</button>
      </nav>
      {isPending && <Spinner />}
      <Suspense fallback={<PageSkeleton />}>
        {page === 'home' ? <HomePage /> : <AboutPage />}
      </Suspense>
    </>
  );
}
```

Without `startTransition`, navigating would immediately show the `<PageSkeleton>` fallback. With it, React keeps the old page visible until the new one is ready.

---

## useSyncExternalStore

`useSyncExternalStore` is the React 18 hook for safely subscribing to external mutable stores. The "tearing" problem it solves: in concurrent mode, React can pause and resume a render across multiple frames. If an external store (not React state) changes value between two render passes of the same tree, different components can read different snapshots of the store — producing a visually inconsistent ("torn") UI. `useSyncExternalStore` prevents this by taking a snapshot of the store at the start of each render and using that consistent snapshot throughout. Every state management library (Zustand, Redux) that supports React 18 uses this hook internally.

Safely subscribes to external mutable stores (Redux, Zustand, browser APIs) without tearing.

```jsx
function useOnlineStatus() {
  return React.useSyncExternalStore(
    (callback) => {
      window.addEventListener('online', callback);
      window.addEventListener('offline', callback);
      return () => {
        window.removeEventListener('online', callback);
        window.removeEventListener('offline', callback);
      };
    },
    () => navigator.onLine,          // client snapshot
    () => true                        // server snapshot
  );
}
```

---

## Server Components (React Server Components — RSC)

RSC is a different concept from SSR. Components marked as server components run **only on the server** — they have no client-side JS bundle.

```jsx
// app/page.tsx (Next.js App Router — server component by default)
async function Page() {
  const data = await db.query('SELECT * FROM posts'); // direct DB access!
  return <PostList posts={data} />;
}
```

Rules:
- Server components can `async/await`
- They cannot use hooks, event handlers, or browser APIs
- They pass serializable props to Client Components (`'use client'`)

```jsx
'use client'; // boundary
export function LikeButton({ postId }) {
  const [liked, setLiked] = React.useState(false);
  return <button onClick={() => setLiked(l => !l)}>{liked ? '❤️' : '🤍'}</button>;
}
```

---

## Streaming SSR

Traditional SSR blocks: the server must complete all data fetching and render the entire page to a string before sending any HTML to the browser. Streaming SSR (React 18 + Node.js HTTP streaming) allows the server to send the initial shell — headers, navigation, static layout — immediately, then stream in content sections as their data resolves, each wrapped in a `<Suspense>` boundary. The browser can start parsing and displaying the shell before the full page arrives, significantly improving Time to First Byte (TTFB) and Largest Contentful Paint (LCP) metrics on data-heavy pages.

React 18 can stream HTML from the server, sending pieces of the page as they become ready rather than waiting for everything.

```jsx
// Next.js App Router uses streaming automatically with Suspense
export default async function Layout({ children }) {
  return (
    <html>
      <body>
        <Header /> {/* sent immediately */}
        <Suspense fallback={<Skeleton />}>
          {children} {/* streamed when ready */}
        </Suspense>
      </body>
    </html>
  );
}
```

**Benefits:** Faster TTFB, progressive loading, partial hydration.

---

## Priority Levels (conceptual)

| Priority | Examples | API |
|---|---|---|
| Urgent | Typing, clicking | Regular `setState` |
| Transition | Route change, filter/search | `startTransition`, `useDeferredValue` |
| Idle | Analytics, prefetch | `requestIdleCallback` / `scheduler` |

---

## Key Takeaways

1. **`createRoot`** enables concurrent mode — required for React 18 features
2. **`useTransition`** keeps UI responsive during expensive state updates
3. **`useDeferredValue`** defers values you receive (can't wrap the setter)
4. **`Suspense`** handles async boundaries — data, code splitting, server rendering
5. **Automatic batching** reduces render count in all async contexts
6. **RSC** eliminates client bundle for pure data-fetching components
