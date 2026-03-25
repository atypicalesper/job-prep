# React 19 — Deep Dive

## What's New in React 19

React 19 (stable December 2024) ships several major features that fundamentally change how you write React applications:

1. **Actions** — async functions that handle form submissions and mutations
2. **`useActionState`** — manage action state (pending, error, result)
3. **`useFormStatus`** — read form submission status in child components
4. **`useOptimistic`** — optimistic UI updates
5. **`use()` hook** — read resources (Promises, Context) in render
6. **Server Components** (stable via Next.js/frameworks)
7. **Server Actions** — server-side functions called from client
8. **New ref behavior** — ref as prop (no more `forwardRef`)
9. **Improved hydration** — better error messages, attribute support
10. **Document metadata** — `<title>`, `<meta>` in components

---

## Actions — The Core Concept

An **Action** is an async function passed to a form (or called directly) that handles mutations. React manages the pending state automatically.

Actions are React 19's answer to a pattern that every form had to implement manually: tracking `isPending`, handling errors, and resetting form state after success. Before Actions, this required `useState` for every piece of form status, `try/catch` blocks, and `finally` clauses to reset loading state. Actions replace this boilerplate — you write the async mutation logic, React manages the pending/error/reset lifecycle automatically within a concurrent transition.

### Before React 19 (the old way)

```tsx
function OldForm() {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    setError(null);
    try {
      await updateName(name);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input value={name} onChange={e => setName(e.target.value)} />
      <button disabled={isPending}>Submit</button>
      {error && <p>{error}</p>}
    </form>
  );
}
```

### With React 19 Actions

```tsx
// Action = async function that takes FormData (or other args)
async function updateNameAction(formData: FormData) {
  const name = formData.get('name') as string;
  await api.updateUser({ name }); // throws on error
}

function NewForm() {
  return (
    // Pass async function directly to form's action prop
    <form action={updateNameAction}>
      <input name="name" />
      <button type="submit">Submit</button>
      {/* React handles pending state automatically */}
    </form>
  );
}
```

React automatically:
- Starts a transition when the form is submitted
- Manages pending state
- Resets the form on success
- Provides error boundaries for failures

---

## `useActionState` — Action + State

Combines an action with state management. Returns `[state, dispatch, isPending]`.

```tsx
import { useActionState } from 'react';

type State = {
  error: string | null;
  success: boolean;
};

async function updateProfileAction(
  prevState: State,
  formData: FormData
): Promise<State> {
  const name = formData.get('name') as string;
  const bio = formData.get('bio') as string;

  if (!name.trim()) {
    return { error: 'Name is required', success: false };
  }

  try {
    await api.updateProfile({ name, bio });
    return { error: null, success: true };
  } catch (err) {
    return { error: 'Failed to update profile', success: false };
  }
}

function ProfileForm({ user }: { user: User }) {
  const [state, formAction, isPending] = useActionState(
    updateProfileAction,
    { error: null, success: false }  // initial state
  );

  return (
    <form action={formAction}>
      <input name="name" defaultValue={user.name} />
      <textarea name="bio" defaultValue={user.bio} />

      {state.error && (
        <p className="error">{state.error}</p>
      )}
      {state.success && (
        <p className="success">Profile updated!</p>
      )}

      <button type="submit" disabled={isPending}>
        {isPending ? 'Saving...' : 'Save'}
      </button>
    </form>
  );
}
```

### `useActionState` with pagination/navigation

```tsx
// State can be anything — use for paginated data fetching too
async function loadMoreAction(
  prevState: { items: Item[]; page: number },
  _formData: FormData
) {
  const newItems = await api.getItems({ page: prevState.page + 1 });
  return {
    items: [...prevState.items, ...newItems],
    page: prevState.page + 1,
  };
}

function ItemList({ initial }: { initial: Item[] }) {
  const [state, loadMore, isPending] = useActionState(loadMoreAction, {
    items: initial,
    page: 1,
  });

  return (
    <div>
      {state.items.map(item => <Item key={item.id} item={item} />)}
      <form action={loadMore}>
        <button type="submit" disabled={isPending}>
          {isPending ? 'Loading...' : 'Load More'}
        </button>
      </form>
    </div>
  );
}
```

---

## `useFormStatus` — Status in Child Components

Lets a child component know about the enclosing form's submission status — without prop drilling.

```tsx
import { useFormStatus } from 'react-dom';

// This component can be deep in the tree
function SubmitButton() {
  const { pending, data, method, action } = useFormStatus();

  return (
    <button type="submit" disabled={pending}>
      {pending ? (
        <>
          <Spinner /> Submitting...
        </>
      ) : (
        'Submit'
      )}
    </button>
  );
}

// Works as long as SubmitButton is a descendant of a <form>
function MyForm() {
  return (
    <form action={myAction}>
      <input name="email" type="email" />
      <div className="footer">
        <SubmitButton />  {/* reads form status automatically */}
      </div>
    </form>
  );
}
```

**Important:** `useFormStatus` must be in a component that is a **child** of the form. It doesn't work in the same component as the form.

---

## `useOptimistic` — Optimistic UI

Show the result of a mutation before the server responds. Reverts if mutation fails.

```tsx
import { useOptimistic, useActionState } from 'react';

type Message = { id: string; text: string; sending?: boolean };

async function sendMessageAction(
  prevMessages: Message[],
  formData: FormData
): Promise<Message[]> {
  const text = formData.get('text') as string;
  const message = await api.sendMessage(text); // real API call
  return [...prevMessages, message];
}

function MessageThread({ initial }: { initial: Message[] }) {
  const [messages, formAction] = useActionState(
    sendMessageAction,
    initial
  );

  const [optimisticMessages, addOptimistic] = useOptimistic(
    messages,
    // Optimistic update function: (currentState, optimisticValue) => newState
    (state, newMessage: Message) => [...state, newMessage]
  );

  async function action(formData: FormData) {
    const text = formData.get('text') as string;

    // Show message immediately (optimistic)
    addOptimistic({
      id: crypto.randomUUID(),
      text,
      sending: true,
    });

    // Dispatch actual action
    await formAction(formData);
    // If formAction succeeds → optimistic replaced by real data
    // If formAction fails → optimistic is automatically reverted
  }

  return (
    <div>
      <ul>
        {optimisticMessages.map(msg => (
          <li key={msg.id} style={{ opacity: msg.sending ? 0.5 : 1 }}>
            {msg.text}
            {msg.sending && ' (Sending...)'}
          </li>
        ))}
      </ul>
      <form action={action}>
        <input name="text" />
        <SubmitButton />
      </form>
    </div>
  );
}
```

---

## `use()` Hook — Reading Promises and Context

`use()` is a new hook that can read Promises and Context. Unlike other hooks, it can be called **conditionally**.

### `use()` with Promises (Suspense integration)

```tsx
import { use, Suspense } from 'react';

// Server fetches data, passes Promise to client component
function UserPage({ userPromise }: { userPromise: Promise<User> }) {
  return (
    <Suspense fallback={<Skeleton />}>
      <UserProfile userPromise={userPromise} />
    </Suspense>
  );
}

function UserProfile({ userPromise }: { userPromise: Promise<User> }) {
  // use() suspends until promise resolves
  const user = use(userPromise);

  return <div>{user.name}</div>;
}
```

### `use()` with Context (conditional!)

```tsx
import { use, createContext } from 'react';

const ThemeContext = createContext<'light' | 'dark'>('light');

// use() can be called conditionally — unlike useContext!
function Button({ showTheme }: { showTheme: boolean }) {
  if (showTheme) {
    const theme = use(ThemeContext); // conditional use — this is new!
    return <button className={theme}>Click</button>;
  }
  return <button>Click</button>;
}
```

---

## Server Components — In Depth

Server Components render on the server and send HTML + a serialized component tree to the client. They have **zero client-side JavaScript**.

```
Request → Server renders component tree
            ↓
          RSC Payload (JSON-like serialized tree)
            ↓
          Client hydrates Client Components
          Server Components' output = static HTML (no hydration)
```

### Server Component Rules

```tsx
// ✅ Server Component (default in Next.js app dir)
// - Can be async
// - Can access databases, file system, env vars directly
// - NO useState, useEffect, event handlers
// - NOT sent to client

async function ProductList() {
  // Direct DB access — no API call needed
  const products = await db.product.findMany({ take: 10 });

  return (
    <ul>
      {products.map(p => (
        <li key={p.id}>
          {p.name} - ${p.price}
          <AddToCartButton productId={p.id} />  {/* Client Component */}
        </li>
      ))}
    </ul>
  );
}

// ✅ Client Component — needs interactivity
'use client';
function AddToCartButton({ productId }: { productId: string }) {
  const [added, setAdded] = useState(false);

  return (
    <button onClick={() => {
      addToCart(productId);
      setAdded(true);
    }}>
      {added ? 'Added!' : 'Add to Cart'}
    </button>
  );
}
```

### Composition Pattern — Server wrapping Client

```tsx
// Server Component can pass data to Client Component as props
async function Page() {
  const user = await db.getUser(session.userId); // server-only

  return (
    <div>
      <h1>Welcome, {user.name}</h1>
      {/* Pass server data to client component */}
      <UserSettings initialPreferences={user.preferences} />
      {/* Server Components can be children of Client Components too */}
      <ClientLayout>
        <ServerSidebar />  {/* still a Server Component! */}
      </ClientLayout>
    </div>
  );
}
```

### What NOT to do

```tsx
// ❌ Can't import Server Component in Client Component
'use client';
import { ServerComponent } from './Server'; // ERROR — can't use in client!

// ✅ Instead: pass Server Component as children prop
'use client';
function ClientWrapper({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(!open)}>Toggle</button>
      {open && children}  {/* children could be a Server Component */}
    </div>
  );
}
```

---

## Server Actions

Server Actions are async functions that run on the server but can be called from client code (forms, event handlers).

```tsx
// actions.ts — 'use server' makes all exports Server Actions
'use server';
import { revalidatePath } from 'next/cache';

export async function deletePost(postId: string) {
  // Runs on server — has access to DB, env vars, etc.
  await db.post.delete({ where: { id: postId } });
  revalidatePath('/posts');  // invalidate cached page
}

export async function updatePost(formData: FormData) {
  const id = formData.get('id') as string;
  const title = formData.get('title') as string;

  await db.post.update({
    where: { id },
    data: { title },
  });

  revalidatePath(`/posts/${id}`);
}
```

```tsx
// Client Component using Server Action
'use client';
import { deletePost } from './actions';

function PostCard({ post }) {
  return (
    <div>
      <h2>{post.title}</h2>

      {/* Server Action in form */}
      <form action={updatePost}>
        <input name="id" type="hidden" value={post.id} />
        <input name="title" defaultValue={post.title} />
        <button type="submit">Save</button>
      </form>

      {/* Server Action in event handler */}
      <button onClick={() => deletePost(post.id)}>
        Delete
      </button>
    </div>
  );
}
```

---

## Ref as Prop (No More forwardRef)

```tsx
// React 18 — needed forwardRef
const Input = forwardRef<HTMLInputElement, Props>(
  ({ label, ...props }, ref) => (
    <div>
      <label>{label}</label>
      <input ref={ref} {...props} />
    </div>
  )
);

// React 19 — ref is just a prop
function Input({ label, ref, ...props }: Props & { ref?: React.Ref<HTMLInputElement> }) {
  return (
    <div>
      <label>{label}</label>
      <input ref={ref} {...props} />
    </div>
  );
}

// Usage (unchanged)
const inputRef = useRef<HTMLInputElement>(null);
<Input label="Name" ref={inputRef} />
```

---

## Document Metadata in Components

No more `react-helmet`. Built-in support for `<title>`, `<meta>`, `<link>`.

```tsx
// Works in Server Components and Client Components
function BlogPost({ post }) {
  return (
    <article>
      {/* React hoists these to <head> automatically */}
      <title>{post.title} | My Blog</title>
      <meta name="description" content={post.excerpt} />
      <meta property="og:title" content={post.title} />
      <meta property="og:image" content={post.coverImage} />
      <link rel="canonical" href={`https://blog.example.com/posts/${post.slug}`} />

      <h1>{post.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: post.content }} />
    </article>
  );
}
```

---

## React 19 Migration Guide

```bash
# Update
npm install react@19 react-dom@19

# Codemod for most breaking changes
npx codemod@latest react/19/migration-recipe
```

### Breaking Changes

```tsx
// 1. ref cleanup function
// React 18:
<div ref={(node) => { ref.current = node; }} />

// React 19: can return cleanup
<div ref={(node) => {
  // setup
  return () => {
    // cleanup (called on unmount)
  };
}} />

// 2. ReactDOM.render removed (was deprecated in 18)
// Use createRoot
import { createRoot } from 'react-dom/client';
createRoot(document.getElementById('root')).render(<App />);

// 3. Context.Provider shorthand
// React 18:
<ThemeContext.Provider value="dark">

// React 19 (both work):
<ThemeContext value="dark">

// 4. Removed: defaultProps on function components
// Use default parameters instead
function Button({ color = 'blue' }) { ... }
```

---

## Interview Questions

**Q: What are React Actions and why were they introduced?**
Actions are async functions passed to form's `action` prop or used with `useActionState`. They simplify the pattern of handling form submission, pending state, and errors — previously required `useState` + `try/catch` + `useEffect`. React automatically manages the transition, pending state, and form reset.

**Q: What is `useOptimistic` and when would you use it?**
`useOptimistic` lets you show the expected result of an async action immediately, before the server responds. If the action fails, the optimistic state is automatically reverted. Use it for: adding to cart, liking posts, sending messages, reordering lists — anywhere users expect instant feedback.

**Q: What's the difference between Server Components and Client Components?**
Server Components run only on the server: no JS bundle sent to client, can access DB/filesystem directly, cannot use state/effects/event handlers. Client Components run on client: can use hooks, event handlers, but can't access server resources. They're complementary — compose them to get the benefits of both (fast server-rendered data fetching + interactive UI).

**Q: What is `use()` and how is it different from other hooks?**
`use()` can read a Promise (suspending until resolved) or a Context. Unlike all other hooks, `use()` can be called conditionally. It enables patterns where you pass a Promise from server to client, and the client component suspends until the data is ready (instead of loading state management).

**Q: What's the `useActionState` signature and what does it return?**
`const [state, action, isPending] = useActionState(fn, initialState)`. `fn` receives `(prevState, formData)` and returns the new state. `action` is passed to the form's `action` prop. `isPending` is true while the action is running. Unlike `useReducer`, the function is async and React manages the transition automatically.
