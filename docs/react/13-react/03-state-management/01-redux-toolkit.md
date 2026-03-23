# Redux Toolkit (RTK)

Redux Toolkit is the official, opinionated way to write Redux. It eliminates boilerplate, enforces best practices, and includes utilities for common patterns.

```bash
npm install @reduxjs/toolkit react-redux
```

---

## Core Concepts

```
Action → Reducer → Store → Component
  ↑                            │
  └────────────────────────────┘
         dispatch(action)
```

Redux is predictable because:
- State is a single immutable tree
- The only way to change it is to dispatch an action
- Reducers are pure functions

---

## createSlice

The heart of RTK. Generates action creators and action types automatically.

```ts
// store/counterSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface CounterState {
  value: number;
  status: 'idle' | 'loading';
}

const initialState: CounterState = { value: 0, status: 'idle' };

export const counterSlice = createSlice({
  name: 'counter',
  initialState,
  reducers: {
    increment: (state) => {
      state.value += 1; // Immer makes mutation safe
    },
    decrement: (state) => {
      state.value -= 1;
    },
    incrementByAmount: (state, action: PayloadAction<number>) => {
      state.value += action.payload;
    },
    reset: () => initialState, // return new state entirely
  },
});

// Auto-generated action creators
export const { increment, decrement, incrementByAmount, reset } = counterSlice.actions;

// Selector
export const selectCount = (state: RootState) => state.counter.value;

export default counterSlice.reducer;
```

**Immer is built in** — you can "mutate" state inside reducers and RTK converts it to an immutable update under the hood.

---

## configureStore

```ts
// store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import counterReducer from './counterSlice';
import userReducer from './userSlice';

export const store = configureStore({
  reducer: {
    counter: counterReducer,
    user: userReducer,
  },
  // middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(myMiddleware),
  // devTools: process.env.NODE_ENV !== 'production',
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

---

## Typed Hooks

```ts
// store/hooks.ts
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';
import type { RootState, AppDispatch } from '.';

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
```

---

## Provider + Usage

```tsx
// main.tsx
import { Provider } from 'react-redux';
import { store } from './store';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <Provider store={store}>
    <App />
  </Provider>
);

// Component
import { useAppDispatch, useAppSelector } from './store/hooks';
import { increment, selectCount } from './store/counterSlice';

function Counter() {
  const count = useAppSelector(selectCount);
  const dispatch = useAppDispatch();

  return (
    <div>
      <span>{count}</span>
      <button onClick={() => dispatch(increment())}>+</button>
    </div>
  );
}
```

---

## createAsyncThunk

Handles async operations (API calls) with automatic pending/fulfilled/rejected action types.

```ts
// store/userSlice.ts
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

// Step 1: define the thunk
export const fetchUser = createAsyncThunk(
  'user/fetchById',          // action type prefix
  async (userId: string, thunkAPI) => {
    const response = await fetch(`/api/users/${userId}`);
    if (!response.ok) {
      // Use rejectWithValue for a clean error payload
      return thunkAPI.rejectWithValue({ status: response.status });
    }
    return response.json(); // becomes action.payload on fulfilled
  }
);

// Step 2: handle lifecycle in extraReducers
const userSlice = createSlice({
  name: 'user',
  initialState: { data: null, loading: false, error: null } as UserState,
  reducers: {
    clearUser: (state) => { state.data = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchUser.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload;
      })
      .addCase(fetchUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as { status: number };
      });
  },
});

export const { clearUser } = userSlice.actions;
export default userSlice.reducer;

// Usage in component
function UserProfile({ id }: { id: string }) {
  const dispatch = useAppDispatch();
  const { data, loading, error } = useAppSelector(s => s.user);

  useEffect(() => {
    dispatch(fetchUser(id));
  }, [id]);

  if (loading) return <Spinner />;
  if (error) return <Error />;
  return <div>{data?.name}</div>;
}
```

---

## RTK Query

Built-in data fetching and caching solution. Generates hooks automatically.

```ts
// store/api.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  tagTypes: ['Post', 'User'],
  endpoints: (builder) => ({
    // Query (GET)
    getUsers: builder.query<User[], void>({
      query: () => '/users',
      providesTags: ['User'],
    }),
    getUserById: builder.query<User, string>({
      query: (id) => `/users/${id}`,
      providesTags: (result, error, id) => [{ type: 'User', id }],
    }),
    // Mutation (POST/PUT/DELETE)
    createUser: builder.mutation<User, Partial<User>>({
      query: (body) => ({ url: '/users', method: 'POST', body }),
      invalidatesTags: ['User'], // refetch getUsers after creating
    }),
    deleteUser: builder.mutation<void, string>({
      query: (id) => ({ url: `/users/${id}`, method: 'DELETE' }),
      invalidatesTags: (result, error, id) => [{ type: 'User', id }],
    }),
  }),
});

// Auto-generated hooks
export const {
  useGetUsersQuery,
  useGetUserByIdQuery,
  useCreateUserMutation,
  useDeleteUserMutation,
} = api;
```

```ts
// Add api reducer + middleware to store
export const store = configureStore({
  reducer: {
    counter: counterReducer,
    [api.reducerPath]: api.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(api.middleware),
});
```

```tsx
// Component using RTK Query
function UserList() {
  const { data: users, isLoading, isError, refetch } = useGetUsersQuery();
  const [deleteUser] = useDeleteUserMutation();

  if (isLoading) return <Spinner />;
  if (isError) return <p>Failed to load</p>;

  return (
    <ul>
      {users?.map(user => (
        <li key={user.id}>
          {user.name}
          <button onClick={() => deleteUser(user.id)}>Delete</button>
        </li>
      ))}
    </ul>
  );
}
```

### RTK Query Features
- **Automatic caching** — responses cached by endpoint + arg
- **Cache invalidation** — `invalidatesTags` / `providesTags`
- **Polling** — `useGetUsersQuery(undefined, { pollingInterval: 5000 })`
- **Optimistic updates** — via `onQueryStarted` in endpoint definition
- **Conditional fetching** — `useGetUserQuery(id, { skip: !id })`
- **Pagination** — cursor or page param in query arg
- **Code generation** — from OpenAPI spec

---

## createEntityAdapter

Manages normalized state for collections (like a mini in-memory DB).

```ts
import { createEntityAdapter, createSlice } from '@reduxjs/toolkit';

const postsAdapter = createEntityAdapter<Post>({
  sortComparer: (a, b) => b.createdAt.localeCompare(a.createdAt),
});

// Gives you: { ids: [], entities: {} }
const postsSlice = createSlice({
  name: 'posts',
  initialState: postsAdapter.getInitialState({ loading: false }),
  reducers: {
    addPost: postsAdapter.addOne,
    addPosts: postsAdapter.addMany,
    updatePost: postsAdapter.updateOne,
    removePost: postsAdapter.removeOne,
    upsertPost: postsAdapter.upsertOne,
  },
});

// Auto-generated selectors
const postsSelectors = postsAdapter.getSelectors(
  (state: RootState) => state.posts
);
export const {
  selectAll: selectAllPosts,
  selectById: selectPostById,
  selectIds: selectPostIds,
} = postsSelectors;
```

---

## Middleware

```ts
// Custom logger middleware
const logger = (store: MiddlewareAPI) => (next: Dispatch) => (action: Action) => {
  console.group(action.type);
  console.log('prev state', store.getState());
  const result = next(action); // passes action to next middleware / reducer
  console.log('next state', store.getState());
  console.groupEnd();
  return result;
};

configureStore({
  reducer: { ... },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(logger),
});
```

---

## Selectors with Reselect

```ts
import { createSelector } from '@reduxjs/toolkit'; // re-exported from reselect

const selectItems = (state: RootState) => state.cart.items;
const selectTaxRate = (state: RootState) => state.settings.taxRate;

// Memoized — only recomputes when items or taxRate change
export const selectCartTotal = createSelector(
  [selectItems, selectTaxRate],
  (items, taxRate) => {
    const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    return subtotal * (1 + taxRate);
  }
);
```

---

## When to Use Redux

**Use Redux when:**
- Global state shared across many unrelated components
- Complex state transitions with clear action semantics
- Need for Redux DevTools time-travel debugging
- Large team needing predictable state contract
- Middleware for logging, analytics, side effects (redux-saga, redux-observable)

**Don't use Redux for:**
- Local UI state (open/closed modal, form field values)
- Server state (use React Query / RTK Query instead)
- Simple apps — `useState` + Context is often enough

---

## Redux DevTools

Install the browser extension. With `configureStore`, DevTools work automatically:
- Time-travel: step backward/forward through actions
- Action log with diffs
- State snapshot export/import
- Trace: see where dispatch was called

---

## RTK vs Legacy Redux

| | Legacy Redux | Redux Toolkit |
|---|---|---|
| Boilerplate | `actionTypes.js`, `actions.js`, `reducer.js` | One `createSlice` |
| Mutation | Must spread manually | Immer built-in |
| Async | Manual `redux-thunk` | `createAsyncThunk` |
| Normalization | Manual | `createEntityAdapter` |
| Data fetching | `redux-saga` or manual | RTK Query |
| Bundle size | Smaller (no extras) | Slightly larger |
