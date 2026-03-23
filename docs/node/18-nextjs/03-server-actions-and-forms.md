# Next.js Server Actions & Forms

## What are Server Actions?

Server Actions are async functions that run on the server, invoked directly from the client — no manual API route needed. They're the Next.js equivalent of a form POST handler but with full TypeScript support and built-in React integration.

```tsx
// 'use server' at the top of the file OR inline in a component
'use server';

export async function createPost(formData: FormData) {
  const title = formData.get('title') as string;
  await db.post.create({ data: { title } });
  revalidatePath('/posts');
}
```

---

## Basic Form with Server Action

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

Works without JavaScript. The form submits via native HTML POST. React progressively enhances it.

---

## Zod Validation in Server Actions

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
    };
  }

  await db.post.create({ data: result.data });
  revalidatePath('/posts');
  redirect('/posts');  // only runs on success
}
```

---

## `useActionState` — Client Form with Validation Errors

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
  const [optimisticLikes, setOptimisticLikes] = useOptimistic(
    { count: initialLikes, liked: isLiked },
    (state, action: 'like' | 'unlike') => ({
      count: action === 'like' ? state.count + 1 : state.count - 1,
      liked: action === 'like',
    })
  );

  async function handleLike() {
    const action = optimisticLikes.liked ? 'unlike' : 'like';
    setOptimisticLikes(action);        // instant UI update
    await toggleLike(postId, action);  // actual server mutation
  }

  return (
    <button onClick={handleLike}>
      {optimisticLikes.liked ? '❤️' : '🤍'} {optimisticLikes.count}
    </button>
  );
}
```

---

## Server Action Called Programmatically

Not just for forms — can be called from event handlers, `useEffect`, etc.

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
  // Auth check first
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');

  await db.post.delete({ where: { id: postId } });
  revalidatePath('/posts');
}
```

---

## Error Handling in Server Actions

```tsx
'use server';

export async function updateUser(userId: string, formData: FormData) {
  try {
    // Throws if user not found or DB error
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

**Rule:** Return errors as values, don't throw. Throwing from a Server Action shows the `error.tsx` boundary.

---

## Server Action Security

Server Actions are publicly accessible POST endpoints. Always:
1. **Authenticate** — check session before any mutation
2. **Authorize** — check that the user owns the resource
3. **Validate** — use Zod, never trust FormData directly

```tsx
'use server';

export async function updatePost(postId: string, formData: FormData) {
  // 1. Auth check
  const session = await getSession();
  if (!session?.user) throw new Error('Unauthorized');

  // 2. Authorization — owns the post?
  const post = await db.post.findUnique({ where: { id: postId } });
  if (!post || post.authorId !== session.user.id) {
    throw new Error('Forbidden');
  }

  // 3. Zod validation
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

```tsx
// components/SubmitButton.tsx
'use client';

import { useFormStatus } from 'react-dom';

export function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  // Automatically knows if parent form is submitting
  return (
    <button disabled={pending} type="submit">
      {pending ? 'Saving...' : label}
    </button>
  );
}

// Usage — works without any prop passing
<form action={serverAction}>
  <input name="title" />
  <SubmitButton label="Save Post" />   {/* knows when form is pending */}
</form>
```

---

## Interview Questions

**Q: How do Server Actions differ from API routes?**
Server Actions are colocated with components, have zero boilerplate (no route file, no fetch call), and integrate with React's `useActionState`/`useOptimistic`. API routes are better when you need: non-form data (binary uploads, arbitrary JSON), external clients (mobile apps), or a public REST API. For internal mutations in a Next.js app, Server Actions are simpler.

**Q: Can a Server Action return data?**
Yes. Whatever you return is received by `useActionState` as the new state, or is the resolved value if you `await` the action directly. This is how you return validation errors, success messages, or updated data to the client.

**Q: What's the difference between `useActionState` and `useFormStatus`?**
`useActionState(action, initialState)` manages the action's return value (errors, success state) and pending boolean for the whole action call. `useFormStatus()` is for child components inside a `<form>` — it gives them access to the form's pending state without prop drilling. They're often used together.

**Q: Why should you validate in Server Actions even if you validate on the client?**
Server Actions are regular POST endpoints accessible to anyone with curl. Client validation is UX (instant feedback), server validation is security. Never skip server-side Zod validation.
