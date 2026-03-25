# Next.js Server Actions & Forms

## What are Server Actions?

Server Actions are async functions that execute **on the server** but can be invoked directly from client-side code — without you writing an API route, a `fetch` call, or any plumbing in between. You define a function with `'use server'`, pass it to a `<form action={...}>` or call it like a normal async function, and Next.js handles the HTTP round-trip invisibly.

Before Server Actions, mutations in Next.js looked like this:
1. Write a `POST /api/posts` route in `app/api/posts/route.ts`
2. Write a `fetch('/api/posts', { method: 'POST', body: ... })` call on the client
3. Handle loading, error, and success state manually
4. Revalidate the cache somehow

Server Actions collapse all of that into a single function. The function lives on the server (has access to databases, secrets, file system), but is callable from anywhere on the client.

```tsx
// 'use server' at the top of the file OR inline in a component
'use server';

export async function createPost(formData: FormData) {
  const title = formData.get('title') as string;
  await db.post.create({ data: { title } });
  revalidatePath('/posts');
}
```

**Key properties:**
- Run exclusively on the server — database credentials, secrets, and Node.js APIs are safe
- Automatically serialized over HTTP — arguments and return values must be serializable
- Work without JavaScript (native HTML form POST) — progressively enhanced by React
- Trigger cache revalidation via `revalidatePath` / `revalidateTag`

---

## Basic Form with Server Action

A form's `action` attribute normally points to a URL. In Next.js, you can pass a Server Action function directly. React intercepts the submission, serializes the form data, sends it to the server, and calls your function — all transparently.

```tsx
// app/posts/new/page.tsx
import { createPost } from '../actions';

export default function NewPostPage() {
  return (
    <form action={createPost}>
      <input name="title" placeholder="Post title" required />
      <textarea name="content" required />
      <button type="submit">Create Post</button>
    </form>
  );
}
```

**Why this matters:** Works without JavaScript. The form submits via native HTML POST. React progressively enhances it when JS loads — no flash of broken UI, accessible by default, works on slow networks.

The `formData` parameter is a standard browser `FormData` object — `formData.get('title')` reads the input with `name="title"`.

---

## Zod Validation in Server Actions

**What is Zod?** Zod is a TypeScript-first schema validation library. You define the shape and constraints of your data once, and Zod both validates incoming data and infers TypeScript types from the schema — one source of truth for type safety and runtime validation.

**Why validate in Server Actions?** Server Actions are publicly accessible POST endpoints. A user can call them directly with `curl` or Postman, bypassing any client-side validation entirely. Server-side validation is not optional — it's the security boundary.

`safeParse` (vs `parse`) returns a result object instead of throwing, making it easy to return field-level errors back to the form.

```tsx
// app/actions/post.ts
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

const createPostSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(100),
  content: z.string().min(10, 'Content too short'),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, hyphens'),
});

export async function createPost(
  prevState: { errors?: Record<string, string[]>; success?: boolean } | null,
  formData: FormData
) {
  const raw = {
    title: formData.get('title'),
    content: formData.get('content'),
    slug: formData.get('slug'),
  };

  const result = createPostSchema.safeParse(raw);

  if (!result.success) {
    return {
      errors: result.error.flatten().fieldErrors,
      // fieldErrors shape: { title: ['Title must be at least 3 characters'], ... }
    };
  }

  await db.post.create({ data: result.data });
  revalidatePath('/posts');
  redirect('/posts');  // only runs on success
}
```

`result.error.flatten().fieldErrors` gives you a `Record<string, string[]>` — field name to array of error messages — which maps cleanly to inline form errors per field.

---

## `useActionState` — Client Form with Validation Errors

**What it does:** `useActionState` is a React hook that connects a Server Action to a Client Component. It gives you three things:
- `state` — the last value returned by the Server Action (validation errors, success data, etc.)
- `action` — a wrapped version of your Server Action to pass to `<form action={...}>`
- `isPending` — true while the action is in-flight

**Why it exists:** Without `useActionState`, you'd have no way to display server-returned validation errors in the form — you'd just get a page reload with no feedback. `useActionState` keeps the form mounted and updates it with the server's response.

The hook requires the Server Action to accept `(prevState, formData)` as its signature — the state from the last call is passed as the first argument each time.

```tsx
// app/posts/new/page.tsx
'use client';

import { useActionState } from 'react';
import { createPost } from '../actions/post';

export default function NewPostForm() {
  const [state, action, isPending] = useActionState(createPost, null);

  return (
    <form action={action}>
      <div>
        <input name="title" placeholder="Title" />
        {state?.errors?.title && (
          <p className="text-red-500">{state.errors.title[0]}</p>
        )}
      </div>

      <div>
        <input name="slug" placeholder="slug-here" />
        {state?.errors?.slug && (
          <p className="text-red-500">{state.errors.slug[0]}</p>
        )}
      </div>

      <div>
        <textarea name="content" placeholder="Content" />
        {state?.errors?.content && (
          <p className="text-red-500">{state.errors.content[0]}</p>
        )}
      </div>

      <button disabled={isPending}>
        {isPending ? 'Creating...' : 'Create Post'}
      </button>
    </form>
  );
}
```

---

## Optimistic Updates with `useOptimistic`

**What is an optimistic update?** When a user performs an action (like liking a post), instead of waiting for the server to respond before updating the UI, you immediately show the expected result. If the server fails, you roll back. This creates the perception of instant responsiveness — the UI feels faster than the network actually is.

**Why use `useOptimistic`?** Before this hook, optimistic updates required significant boilerplate: local state, a flag for whether the server call was in-flight, rollback logic on error. `useOptimistic` encapsulates all of that — it automatically rolls back to the real value once the Server Action settles.

```tsx
'use client';

import { useOptimistic } from 'react';
import { toggleLike } from '../actions/like';

interface Props {
  postId: string;
  initialLikes: number;
  isLiked: boolean;
}

export function LikeButton({ postId, initialLikes, isLiked }: Props) {
  // First arg: the real server state
  // Second arg: reducer — how to compute the optimistic state from an action
  const [optimisticLikes, setOptimisticLikes] = useOptimistic(
    { count: initialLikes, liked: isLiked },
    (state, action: 'like' | 'unlike') => ({
      count: action === 'like' ? state.count + 1 : state.count - 1,
      liked: action === 'like',
    })
  );

  async function handleLike() {
    const action = optimisticLikes.liked ? 'unlike' : 'like';
    setOptimisticLikes(action);        // instant UI update — no wait
    await toggleLike(postId, action);  // actual server mutation
    // if toggleLike throws, React automatically reverts to initialLikes
  }

  return (
    <button onClick={handleLike}>
      {optimisticLikes.liked ? '❤️' : '🤍'} {optimisticLikes.count}
    </button>
  );
}
```

**Rollback:** If the Server Action throws, React discards the optimistic state and reverts to the original value automatically. You don't need to write rollback logic.

---

## Server Action Called Programmatically

**When to use this pattern:** `<form action={...}>` is ideal for form submissions. But Server Actions can also be called like any async function — from click handlers, `useEffect`, custom hooks, anywhere. This pattern is useful for mutations that aren't form-based: deleting a record, toggling a setting, triggering a background job.

```tsx
'use client';

import { deletePost } from '../actions/post';

export function DeleteButton({ postId }: { postId: string }) {
  async function handleDelete() {
    if (!confirm('Are you sure?')) return;
    await deletePost(postId);
  }

  return (
    <button onClick={handleDelete} className="text-red-500">
      Delete
    </button>
  );
}

// The action:
'use server';
export async function deletePost(postId: string) {
  // Auth check first — always
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');

  await db.post.delete({ where: { id: postId } });
  revalidatePath('/posts');
}
```

When called programmatically, the return value is directly available as the resolved Promise value — no `useActionState` needed unless you want to track pending state.

---

## Error Handling in Server Actions

**The core rule:** Return errors as data values. Don't throw them (unless you want the error to bubble up to the nearest `error.tsx` boundary — which shows a full error page, not an inline form error).

There are two types of errors you'll encounter:
- **Expected errors** (validation failures, "user not found", permission denied) — return these as structured objects so the UI can display them gracefully
- **Unexpected errors** (database down, network failure) — let these throw and be caught by `error.tsx`, or wrap in try/catch and return a generic message

```tsx
'use server';

export async function updateUser(userId: string, formData: FormData) {
  try {
    await db.user.update({
      where: { id: userId },
      data: { name: formData.get('name') as string },
    });
    revalidatePath('/profile');
    return { success: true };
  } catch (error) {
    // Return error — do NOT throw (would show Next.js error page)
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return { error: 'User not found' };
      }
    }
    return { error: 'Something went wrong' };
  }
}
```

**Rule:** Return errors as values, don't throw. Throwing from a Server Action shows the `error.tsx` boundary — appropriate for catastrophic failures, not form validation.

---

## Server Action Security

**Why security matters here:** Server Actions compile down to POST endpoints with auto-generated URLs. They're not hidden — any client can discover and call them directly. This means every Server Action is an API endpoint that must be treated with the same security discipline as a REST route.

The three non-negotiable checks — in order:

1. **Authenticate** — Is there a valid session? Who is this user?
2. **Authorize** — Does this user have permission to perform this action on this resource?
3. **Validate** — Is the data well-formed and within expected bounds?

Skipping authentication means anonymous users can mutate data. Skipping authorization means any logged-in user can modify another user's data (IDOR — Insecure Direct Object Reference). Skipping validation means malformed data reaches your database.

```tsx
'use server';

export async function updatePost(postId: string, formData: FormData) {
  // 1. Authentication — is there a logged-in user?
  const session = await getSession();
  if (!session?.user) throw new Error('Unauthorized');

  // 2. Authorization — does this user own this post?
  const post = await db.post.findUnique({ where: { id: postId } });
  if (!post || post.authorId !== session.user.id) {
    throw new Error('Forbidden');
  }

  // 3. Zod validation — is the data safe to write to the DB?
  const result = updatePostSchema.safeParse({
    title: formData.get('title'),
    content: formData.get('content'),
  });
  if (!result.success) return { errors: result.error.flatten().fieldErrors };

  await db.post.update({ where: { id: postId }, data: result.data });
  revalidatePath(`/posts/${postId}`);
}
```

---

## `useFormStatus` — Pending State in Child Components

**What it does:** `useFormStatus` is a React DOM hook that reads the pending state of the nearest parent `<form>`. It's designed specifically for submit buttons and loading indicators that live inside a form but don't want to receive the pending state via props.

**Why it exists:** Without it, you'd need to pass `isPending` down as a prop from the component that calls `useActionState`. `useFormStatus` eliminates that prop-drilling — any child of a `<form>` can subscribe to the form's status directly.

**Important:** `useFormStatus` must be used inside a component that is rendered _inside_ the `<form>`. It won't work in the same component that renders the `<form>` itself.

```tsx
// components/SubmitButton.tsx
'use client';

import { useFormStatus } from 'react-dom';

export function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  // Automatically knows if parent form is submitting — no props needed
  return (
    <button disabled={pending} type="submit">
      {pending ? 'Saving...' : label}
    </button>
  );
}

// Usage — SubmitButton reads form state without any prop passing
<form action={serverAction}>
  <input name="title" />
  <SubmitButton label="Save Post" />
</form>
```

`useFormStatus` also exposes `data` (the FormData being submitted), `method`, and `action` — useful for more advanced pending UIs.

---

## Interview Questions

**Q: How do Server Actions differ from API routes?**

Server Actions are colocated with components, have zero boilerplate (no route file, no `fetch` call), and integrate with React's `useActionState`/`useOptimistic`. API routes are better when you need: non-form data (binary uploads, arbitrary JSON), external clients (mobile apps), or a public REST API. For internal mutations in a Next.js app, Server Actions are almost always simpler.

**Q: Can a Server Action return data?**

Yes. Whatever you return is received by `useActionState` as the new state, or is the resolved value if you `await` the action directly. This is how you return validation errors, success messages, or updated data to the client without a separate fetch call.

**Q: What's the difference between `useActionState` and `useFormStatus`?**

`useActionState(action, initialState)` manages the action's return value (errors, success state) and pending boolean for the whole action. `useFormStatus()` is for child components inside a `<form>` — it gives them access to the form's pending state without prop drilling. They're complementary: `useActionState` at the form level, `useFormStatus` inside child components like `<SubmitButton>`.

**Q: Why should you validate in Server Actions even if you validate on the client?**

Server Actions are regular POST endpoints accessible to anyone with `curl`. Client validation is UX — fast feedback for real users. Server validation is security — it's the actual guard against malformed or malicious data. Never skip server-side Zod validation regardless of what the client sends.

**Q: What happens when a Server Action throws?**

It propagates to the nearest `error.tsx` error boundary, which shows an error page. For expected errors (validation, permission denied), return error objects instead of throwing. Reserve throwing for truly unrecoverable situations.

**Q: What is progressive enhancement in the context of Server Actions?**

When you pass a Server Action to `<form action={...}>`, the form works as a native HTML form POST even before React hydrates. Once React loads, it intercepts the submission and enhances it with client-side pending state, optimistic updates, etc. This means the form works on slow networks, with JavaScript disabled, or during hydration — it degrades gracefully.
