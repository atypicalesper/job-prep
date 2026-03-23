# Next.js Authentication — Auth.js (NextAuth v5)

## Setup

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

### Server Component
```tsx
import { auth } from '@/auth';

export default async function ProfilePage() {
  const session = await auth();
  if (!session) redirect('/login');

  return <div>Welcome, {session.user.name}</div>;
}
```

### Client Component
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
