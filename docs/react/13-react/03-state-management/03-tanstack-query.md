# TanStack Query (React Query)

TanStack Query is the gold standard for **server state** management — async data fetching, caching, synchronization, and background updates.

```bash
npm install @tanstack/react-query @tanstack/react-query-devtools
```

**Server state vs client state:**
- **Client state** — UI state (modal open, theme) → useState/Zustand/Redux
- **Server state** — data from API (users, posts) → React Query / RTK Query

---

## Setup

`QueryClient` is the central cache that stores all fetched data, tracks request status, and coordinates background refetches. A single instance is created at the app root and shared via `QueryClientProvider` (which uses React Context internally). The `defaultOptions` object lets you set global policies — `staleTime`, retry count, refetch behavior — that apply to every query unless overridden at the call site. `ReactQueryDevtools` adds an in-browser panel showing every cached query, its status, and the cached data.

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,   // 5 min — don't refetch if fresh
      gcTime: 1000 * 60 * 10,     // 10 min — keep inactive data in cache
      retry: 2,                    // retry failed queries twice
      refetchOnWindowFocus: true,  // refetch when tab is focused
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MyApp />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

---

## useQuery — Fetching Data

`useQuery` is the core hook for reading server data. It takes a `queryKey` (the cache identifier) and a `queryFn` (any async function returning data), then manages the full lifecycle: loading on first mount, caching the result, returning stale data while background-refetching, and retrying on failure. The key insight is that `useQuery` is declarative — you describe *what* data you need, and React Query decides *when* to fetch it based on staleness, window focus, and component mount state.

```tsx
import { useQuery } from '@tanstack/react-query';

async function fetchUser(id: string): Promise<User> {
  const res = await fetch(`/api/users/${id}`);
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
}

function UserProfile({ id }: { id: string }) {
  const {
    data: user,
    isLoading,
    isError,
    error,
    isFetching,      // background refetch happening
    isStale,         // data older than staleTime
    refetch,
  } = useQuery({
    queryKey: ['user', id],       // cache key — array, include all deps
    queryFn: () => fetchUser(id),
    staleTime: 1000 * 60,         // 1 min
    enabled: !!id,                // only fetch when id is truthy
  });

  if (isLoading) return <Spinner />;
  if (isError) return <p>Error: {error.message}</p>;

  return (
    <div>
      <h1>{user?.name}</h1>
      {isFetching && <small>Updating...</small>}
      <button onClick={() => refetch()}>Refresh</button>
    </div>
  );
}
```

### Query Key Design

Query keys serve two purposes simultaneously: they are the cache lookup key and the dependency array that triggers refetches when values change. An array structure lets you build hierarchies — invalidating `['user']` will invalidate every query whose key starts with `'user'`, including `['user', userId]` and `['user', userId, 'posts']`. Treat query keys like the URL of a REST resource: include every variable that changes the response.

```ts
// Query keys are the cache key + dependency tracker
['users']                          // all users
['users', { status: 'active' }]   // filtered
['user', userId]                   // single user
['user', userId, 'posts']          // user's posts

// Invalidate by prefix
queryClient.invalidateQueries({ queryKey: ['user'] }); // invalidates all user queries
queryClient.invalidateQueries({ queryKey: ['user', userId] }); // specific user
```

---

## useMutation — Creating/Updating/Deleting

`useMutation` handles write operations (POST, PUT, PATCH, DELETE). Unlike `useQuery`, mutations don't run automatically — they run when you call `mutate()` or `mutateAsync()` imperatively. The lifecycle callbacks (`onSuccess`, `onError`, `onSettled`) are where you synchronize the local cache after a successful write, typically by invalidating related queries so they refetch fresh data. The `isPending` flag makes it easy to disable buttons during submission.

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';

function CreatePost() {
  const queryClient = useQueryClient();

  const createPost = useMutation({
    mutationFn: (newPost: Partial<Post>) =>
      fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPost),
      }).then(r => r.json()),

    onSuccess: (data) => {
      // Invalidate and refetch the posts list
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      // Or manually update the cache
      queryClient.setQueryData(['post', data.id], data);
    },

    onError: (error) => {
      console.error('Failed to create post:', error);
    },

    onSettled: () => {
      // Runs on both success and error
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createPost.mutate({ title: 'New Post', body: '...' });
    // or: createPost.mutateAsync(...) — returns a Promise
  }

  return (
    <form onSubmit={handleSubmit}>
      <button type="submit" disabled={createPost.isPending}>
        {createPost.isPending ? 'Creating...' : 'Create Post'}
      </button>
      {createPost.isError && <p>Error: {createPost.error.message}</p>}
    </form>
  );
}
```

---

## Optimistic Updates

Update the UI immediately, rollback on error:

```ts
const updateTodo = useMutation({
  mutationFn: (todo: Todo) => fetch(`/api/todos/${todo.id}`, {
    method: 'PUT', body: JSON.stringify(todo),
  }).then(r => r.json()),

  onMutate: async (newTodo) => {
    // Cancel any outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['todos'] });

    // Snapshot previous value
    const previousTodos = queryClient.getQueryData<Todo[]>(['todos']);

    // Optimistically update
    queryClient.setQueryData<Todo[]>(['todos'], (old) =>
      old?.map(t => t.id === newTodo.id ? newTodo : t) ?? []
    );

    // Return context with snapshot for rollback
    return { previousTodos };
  },

  onError: (err, newTodo, context) => {
    // Rollback to previous value
    queryClient.setQueryData(['todos'], context?.previousTodos);
  },

  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['todos'] });
  },
});
```

---

## Pagination

Standard `useQuery` pagination works by including the page number in the query key so each page gets its own cache entry. The `keepPreviousData` / `placeholderData` option is the critical UX detail: instead of showing a blank loading state between page transitions, React Query continues showing the old page's data while the new page loads in the background, then swaps them atomically. Use this whenever users navigate between pages of a list.

```tsx
function PaginatedPosts() {
  const [page, setPage] = useState(1);

  const { data, isPlaceholderData } = useQuery({
    queryKey: ['posts', page],
    queryFn: () => fetchPosts(page),
    placeholderData: keepPreviousData, // keep showing previous page while next loads
  });

  return (
    <>
      {data?.posts.map(post => <Post key={post.id} post={post} />)}
      <div>
        <button onClick={() => setPage(p => p - 1)} disabled={page === 1}>Prev</button>
        <span>Page {page}</span>
        <button
          onClick={() => setPage(p => p + 1)}
          disabled={isPlaceholderData || !data?.hasMore}
        >Next</button>
      </div>
    </>
  );
}
```

---

## Infinite Scroll

`useInfiniteQuery` extends `useQuery` for cursor- or page-based infinite lists. It accumulates all pages in `data.pages` (an array of page responses) and provides `fetchNextPage()` to load more. `getNextPageParam` extracts the next cursor from each page response — return `undefined` when there are no more pages. Flatten pages on read with `.flatMap()`. This pattern is preferred over manually managing page state because React Query handles caching, deduplication, and background updates for all pages simultaneously.

```tsx
import { useInfiniteQuery } from '@tanstack/react-query';

function InfiniteList() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['items'],
    queryFn: ({ pageParam }) => fetchItems({ cursor: pageParam }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const allItems = data?.pages.flatMap(page => page.items) ?? [];

  return (
    <>
      {allItems.map(item => <Item key={item.id} item={item} />)}
      <button
        onClick={() => fetchNextPage()}
        disabled={!hasNextPage || isFetchingNextPage}
      >
        {isFetchingNextPage ? 'Loading more...' : 'Load more'}
      </button>
    </>
  );
}
```

---

## Query Invalidation & Prefetching

Cache management is how you keep the UI consistent with the server after mutations. Invalidation marks a query as stale and schedules a refetch the next time it is observed by a mounted component. Prefetching goes in the other direction — you proactively load data before a component needs it (e.g., hovering a link) so there is zero loading state when the user navigates. Both operations share the same `queryKey` matching rules as the hooks, so prefix-based invalidation covers all related queries at once.

```ts
// Invalidate — mark as stale and refetch if observed
queryClient.invalidateQueries({ queryKey: ['posts'] });

// Refetch immediately (even if not observed)
queryClient.refetchQueries({ queryKey: ['posts'] });

// Prefetch — load data before it's needed
await queryClient.prefetchQuery({
  queryKey: ['user', nextUserId],
  queryFn: () => fetchUser(nextUserId),
});

// Set data manually (e.g., after mutation response)
queryClient.setQueryData(['user', userId], updatedUser);

// Remove from cache
queryClient.removeQueries({ queryKey: ['user', userId] });
```

---

## Dependent Queries

Sometimes you need data from one query before you can run another — for example, you need a user's `teamId` before fetching team posts. The `enabled` option controls whether a query runs at all; setting it to a boolean derived from earlier data creates a dependency chain without any explicit sequencing logic. React Query handles the rest: Query 2 waits, activates automatically when Query 1 resolves, and re-runs if `teamId` ever changes.

```ts
// Query 2 depends on data from Query 1
const { data: user } = useQuery({
  queryKey: ['user', userId],
  queryFn: () => fetchUser(userId),
});

const { data: posts } = useQuery({
  queryKey: ['posts', user?.teamId],
  queryFn: () => fetchTeamPosts(user!.teamId),
  enabled: !!user?.teamId, // only runs when teamId is available
});
```

---

## Parallel Queries

Multiple `useQuery` calls in the same component already run in parallel by default — React Query fires all queries simultaneously on mount. `useQueries` is the dynamic version: when the number of queries isn't known at compile time (e.g., fetching one query per item in a list), it accepts an array of query configs and returns an array of results with the same shape as individual `useQuery` returns.

```ts
// Multiple independent queries run in parallel automatically
const usersQuery = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
const postsQuery = useQuery({ queryKey: ['posts'], queryFn: fetchPosts });

// Dynamic parallel queries
const results = useQueries({
  queries: userIds.map(id => ({
    queryKey: ['user', id],
    queryFn: () => fetchUser(id),
  })),
});
```

---

## Polling

`refetchInterval` turns any query into a polling query that automatically refetches on a fixed timer. This is the simplest way to keep server-driven data (job status, real-time metrics, notification counts) up to date without WebSockets. Setting `refetchIntervalInBackground: true` keeps polling even when the user switches tabs. React Query pauses polling automatically when the query is unmounted, so there are no leaked intervals.

```ts
const { data } = useQuery({
  queryKey: ['status'],
  queryFn: fetchStatus,
  refetchInterval: 5000,               // every 5 seconds
  refetchIntervalInBackground: true,   // even when tab not focused
});
```

---

## Suspense Mode

`useSuspenseQuery` integrates TanStack Query with React's Suspense system. Instead of returning an `isLoading` flag, the hook suspends the component until data is ready — the component body always runs with `data` fully resolved. This eliminates loading condition branches in component code and pushes loading and error UI to a dedicated `<Suspense>` and `<ErrorBoundary>` wrapper higher in the tree. Use it when you prefer the "render when ready" model over explicit loading states.

```tsx
const { data } = useSuspenseQuery({
  queryKey: ['user', id],
  queryFn: () => fetchUser(id),
});
// data is always defined — component suspended until ready

function App() {
  return (
    <Suspense fallback={<Skeleton />}>
      <ErrorBoundary fallback={<Error />}>
        <UserProfile id={1} />
      </ErrorBoundary>
    </Suspense>
  );
}
```

---

## staleTime vs gcTime

These two settings control the two-phase lifecycle of cached data. `staleTime` defines the "freshness window" — how long React Query treats data as current and will not refetch it even if a component remounts or the window regains focus. `gcTime` (formerly `cacheTime`) defines how long *unused* data is kept in memory after no component is subscribed to it; once the gc timer expires the cache entry is evicted. Setting `staleTime: Infinity` effectively makes a query client-side only (never auto-refetches); setting `gcTime: 0` evicts data the moment the last subscriber unmounts.

```
Request → Data arrives → [FRESH] → staleTime passes → [STALE] → gcTime passes → [DELETED]

FRESH: Not refetched on window focus / component mount
STALE: Will be refetched in the background when next observed
DELETED: Removed from cache entirely
```

```ts
useQuery({
  staleTime: 1000 * 60,    // fresh for 1 minute
  gcTime: 1000 * 60 * 5,  // kept in cache for 5 minutes after last use
});
```

---

## Key Differences: React Query vs RTK Query

| | TanStack Query | RTK Query |
|---|---|---|
| Setup | Standalone | Requires Redux store |
| Bundle size | ~13KB | Part of RTK (~15KB total) |
| Framework | Any (Vue, Solid, etc.) | React only |
| Cache model | Query key based | Endpoint + arg based |
| Invalidation | Manual or by key prefix | Tag-based (`invalidatesTags`) |
| DevTools | Dedicated UI | Redux DevTools |
| Optimistic | `onMutate` / `onError` | `onQueryStarted` |
| Best for | Teams not using Redux | Teams already using RTK |
