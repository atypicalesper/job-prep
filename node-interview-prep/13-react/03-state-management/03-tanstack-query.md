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
