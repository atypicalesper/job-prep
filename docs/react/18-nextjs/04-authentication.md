# Next.js Authentication — Auth.js (NextAuth v5)

## Setup

Auth.js (formerly NextAuth) is the de-facto authentication library for Next.js. It handles the complexity of OAuth flows, session management, CSRF protection, and database adapters so you don't have to build any of that yourself. Version 5 (the beta) is a full rewrite that works natively with the App Router — it exports a single `auth()` function that works uniformly in Server Components, Route Handlers, and middleware. The central `auth.ts` file is where you configure every aspect of authentication: which providers to allow, how sessions are stored, and how to transform tokens into session objects.

```bash
npm install next-auth@beta
```

```ts
// auth.ts (root of project)
import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { db } from './lib/db';
import bcrypt from 'bcryptjs';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
    }),
    Credentials({
      credentials: {
        email: { type: 'email' },
        password: { type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await db.user.findUnique({
          where: { email: credentials.email as string },
        });
        if (!user?.hashedPassword) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.hashedPassword
        );
        return valid ? user : null;
      },
    }),
  ],
  session: { strategy: 'jwt' },  // or 'database' with adapter
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
});
```

```ts
// app/api/auth/[...nextauth]/route.ts
import { handlers } from '@/auth';
export const { GET, POST } = handlers;
```

---

## Reading the Session

Auth.js provides two different APIs for reading the current session depending on where your component runs. The pattern differs because Server Components run at request time on the server (where you can call `auth()` directly as an async function), while Client Components run in the browser (where they need a React context provided by `SessionProvider` to access session data reactively). Always prefer the server-side `auth()` call when possible — it avoids a client-side network request and keeps sensitive session data off the browser.

### Server Component

In a Server Component, reading the session is a single `await auth()` call that returns the session object or `null`. This call reads from the session cookie on the incoming request — there's no network round trip involved. It's the simplest and most performant way to guard a page or pass user data to server-rendered UI. Call it at the top of the component and redirect immediately if there's no session.

```tsx
import { auth } from '@/auth';

export default async function ProfilePage() {
  const session = await auth();
  if (!session) redirect('/login');

  return <div>Welcome, {session.user.name}</div>;
}
```

### Client Component

In Client Components, the session is accessed via the `useSession()` hook which reads from the nearest `SessionProvider` context. The hook returns both the session data and a `status` string (`'loading'`, `'authenticated'`, or `'unauthenticated'`), allowing you to render a spinner while the session resolves on initial load. Always handle the `loading` state to avoid a flash of the wrong UI.

```tsx
'use client';
import { useSession } from 'next-auth/react';

export function UserMenu() {
  const { data: session, status } = useSession();

  if (status === 'loading') return <Spinner />;
  if (!session) return <SignInButton />;

  return (
    <div>
      <img src={session.user.image!} alt={session.user.name!} />
      <button onClick={() => signOut()}>Sign out</button>
    </div>
  );
}
```

Wrap the app in `SessionProvider` for client components:
```tsx
// app/layout.tsx
import { SessionProvider } from 'next-auth/react';
import { auth } from '@/auth';

export default async function RootLayout({ children }) {
  const session = await auth();
  return (
    <html>
      <body>
        <SessionProvider session={session}>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
```

---

## Route Protection with Middleware

Middleware-based route protection is the most efficient way to guard entire sections of your app. Rather than checking auth in each individual page (which still renders the page tree before redirecting), middleware intercepts the request before any page code runs and redirects immediately. Auth.js v5 integrates directly with Next.js middleware — you wrap your middleware function with `auth()`, which gives you access to `req.auth` (the session) on every request. This is your first line of defense for coarse-grained access control.

```ts
// middleware.ts
import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  const protectedRoutes = ['/dashboard', '/settings', '/profile'];
  const authRoutes = ['/login', '/register'];

  // Redirect unauthenticated users
  if (protectedRoutes.some(p => pathname.startsWith(p)) && !isLoggedIn) {
    return NextResponse.redirect(new URL(`/login?callbackUrl=${pathname}`, req.url));
  }

  // Redirect logged-in users away from auth pages
  if (authRoutes.includes(pathname) && isLoggedIn) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

---

## Role-Based Authorization

Role-based authorization extends basic authentication (are you logged in?) with authorization (what are you allowed to do?). The pattern involves three steps: storing the role in your database, propagating it through the JWT and session via Auth.js callbacks, and then extending TypeScript's `Session` type so the compiler knows the `role` field exists. Without the TypeScript module augmentation, you'd get type errors every time you access `session.user.role`. Middleware is appropriate for blanket role-based redirects; for fine-grained checks (resource ownership, conditional UI), do the check inside the page or action itself.

```ts
// types/next-auth.d.ts — extend the session type
import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: 'USER' | 'ADMIN' | 'EDITOR';
    } & DefaultSession['user'];
  }
}
```

```tsx
// Protecting a page by role
export default async function AdminPage() {
  const session = await auth();

  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/unauthorized');

  return <AdminDashboard />;
}
```

```ts
// Reusable auth guard helper
import { auth } from '@/auth';
import { redirect } from 'next/navigation';

type Role = 'USER' | 'ADMIN' | 'EDITOR';

export async function requireAuth(minRole?: Role) {
  const session = await auth();
  if (!session) redirect('/login');

  const roles: Role[] = ['USER', 'EDITOR', 'ADMIN'];
  if (minRole && roles.indexOf(session.user.role) < roles.indexOf(minRole)) {
    redirect('/unauthorized');
  }

  return session;
}

// Usage:
export default async function EditorPage() {
  const session = await requireAuth('EDITOR');
  return <Editor user={session.user} />;
}
```

---

## Sign In / Sign Out Actions

Auth.js v5 exposes `signIn` and `signOut` functions that work as Server Actions — they can be called directly from form `action` props without any client-side JavaScript. This is the recommended pattern because it works even before JavaScript hydrates, degrades gracefully, and avoids writing a separate API route for auth. For OAuth providers, `signIn('github')` initiates the full OAuth redirect flow server-side. For credentials, it calls your `authorize` function and sets the session cookie on success.

```tsx
// In Server Components or Server Actions
import { signIn, signOut } from '@/auth';

// Sign in form (Server Action)
export function SignInForm() {
  return (
    <form
      action={async (formData) => {
        'use server';
        await signIn('credentials', {
          email: formData.get('email'),
          password: formData.get('password'),
          redirectTo: '/dashboard',
        });
      }}
    >
      <input name="email" type="email" />
      <input name="password" type="password" />
      <button>Sign In</button>
    </form>
  );
}

// OAuth sign in
export function GitHubSignIn() {
  return (
    <form action={async () => {
      'use server';
      await signIn('github', { redirectTo: '/dashboard' });
    }}>
      <button>Sign in with GitHub</button>
    </form>
  );
}

// Sign out
export function SignOutButton() {
  return (
    <form action={async () => {
      'use server';
      await signOut({ redirectTo: '/' });
    }}>
      <button>Sign out</button>
    </form>
  );
}
```

---

## Prisma Schema for Auth.js

Auth.js with the Prisma adapter requires a specific set of database tables to store users, OAuth accounts, sessions, and verification tokens. These four models are not optional — the adapter reads and writes to them during the auth flow. The `User` model is the canonical user record; `Account` stores OAuth provider tokens (one user can link multiple providers); `Session` stores server-side sessions when using the `database` strategy; and `VerificationToken` is used for email verification flows. You can extend the `User` model with your own fields (like `role` and `hashedPassword`) but must keep the Auth.js required fields.

```prisma
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  hashedPassword String?
  role          Role      @default(USER)
  accounts      Account[]
  sessions      Session[]
  createdAt     DateTime  @default(now())
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime
  @@unique([identifier, token])
}

enum Role {
  USER
  EDITOR
  ADMIN
}
```

---

## Cookies & Sessions

When you need authentication without Auth.js — or need to store arbitrary server-side state — Next.js exposes a `cookies()` API in Server Components, Server Actions, and Route Handlers. Cookies set via this API are `httpOnly` by default when you configure them that way, meaning JavaScript cannot read them (protecting against XSS). The `sameSite: 'lax'` setting is the recommended default — it prevents CSRF attacks while allowing cookies to be sent when navigating from an external link. Always set `secure: true` in production to ensure cookies are only sent over HTTPS.

```ts
// Manual cookie management (without Auth.js)
import { cookies } from 'next/headers';

// Read
const cookieStore = cookies();
const token = cookieStore.get('token')?.value;

// Set (only in Route Handlers or Server Actions)
cookies().set('token', value, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 7,  // 7 days
  path: '/',
});

// Delete
cookies().delete('token');
```

---

## Interview Questions

**Q: JWT strategy vs database sessions — when to use which?**
JWT: stateless, no DB lookup on every request, but can't revoke without blacklist. Use for: read-heavy apps, serverless, horizontal scaling. Database sessions: revokable (just delete the row), supports multiple device management, requires DB lookup per request. Use for: banking/security-sensitive apps, admin panels.

**Q: How do you protect against CSRF with Server Actions?**
Next.js Server Actions automatically include CSRF protection — they check the `Origin` header and only accept requests from the same origin. You don't need to add CSRF tokens manually.

**Q: How do you handle auth in middleware vs page components?**
Middleware is best for blanket route protection (redirect all unauthenticated users away from `/dashboard/*`). Page-level auth is best for fine-grained authorization (checking roles, checking resource ownership). Use both: middleware as the first line, component as the specific check.

**Q: What's the difference between `session: jwt` and `session: database`?**
With `jwt`, the session is stored in an encrypted cookie — no DB read needed to get user data. With `database`, a session record exists in DB and is fetched on each request. JWT is faster but can't be instantly revoked. You need an adapter (like PrismaAdapter) for database sessions.
