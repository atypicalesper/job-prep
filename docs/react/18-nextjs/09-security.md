# Security in Next.js

Security in Next.js spans multiple layers: the framework itself, your React components, the data you expose through APIs, and the environment you deploy into. Most vulnerabilities in Next.js apps are not framework bugs — they come from patterns developers choose: missing input validation, secrets leaked to the client, over-trusted data, and skipped security headers.

This doc covers the exploitable patterns you need to know and the mitigations for each.

---

## The Trust Boundary

The single most important mental model in Next.js security is the **server/client trust boundary**. Code in Server Components, Route Handlers, and Server Actions runs on your server. Code in Client Components runs in the user's browser — fully visible, fully controllable by the user.

**What this means in practice:**

- Secrets (`process.env.DATABASE_URL`, API keys, signing keys) must never be imported into Client Components
- Authorization checks must happen on the server — client-side checks are UI conveniences, not security
- Data fetched on the server must be filtered before being passed to the client as props — don't forward entire database rows

```tsx
// ❌ Wrong — leaks secret to client bundle
'use client';
import { STRIPE_SECRET_KEY } from '@/lib/config'; // this env var now ships to the browser

// ✅ Correct — secret stays on the server
// app/api/payment/route.ts (Server-only)
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
```

Use the `server-only` package to enforce this boundary at build time:

```tsx
// lib/db.ts
import 'server-only'; // throws a build error if imported in a Client Component
import { prisma } from './prisma';
```

---

## Environment Variables and Secret Leakage

Next.js has two categories of environment variables:

| Prefix | Exposure | Use for |
|---|---|---|
| `NEXT_PUBLIC_` | Bundled into the client — **publicly visible** | Analytics IDs, public feature flags |
| (no prefix) | Server-only | API keys, DB credentials, secrets |

```env
# .env.local
DATABASE_URL=postgres://...          # ✅ server-only
STRIPE_SECRET_KEY=sk_live_...        # ✅ server-only
NEXT_PUBLIC_ANALYTICS_ID=UA-1234     # ✅ intentionally public
```

**Never prefix a secret with `NEXT_PUBLIC_`** — anyone who visits your site can read it from the JavaScript bundle using DevTools.

```bash
# Audit for accidental leaks — check the compiled bundle
grep -r "NEXT_PUBLIC_" .env
```

---

## Cross-Site Scripting (XSS)

XSS attacks inject malicious scripts into a page that run in other users' browsers. React prevents most XSS by escaping all JSX expressions before rendering. The exceptions are explicit bypass mechanisms you must audit carefully.

### `dangerouslySetInnerHTML`

This prop skips React's escaping and injects raw HTML. Only use it with content you fully control or have sanitized with a library like `DOMPurify`.

```tsx
// ❌ Wrong — user-controlled content injected raw
<div dangerouslySetInnerHTML={{ __html: userPost.content }} />

// ✅ Correct — sanitize first
import DOMPurify from 'isomorphic-dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userPost.content) }} />
```

### JSON-LD and inline scripts

When embedding JSON-LD or other data in `<script>` tags, the data itself must be safe — a `</script>` string in the JSON would break out of the script context.

```tsx
// ❌ Wrong — if jsonLd contains "</script>" it breaks the page
<script dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

// ✅ Correct — escape the dangerous sequence
<script
  dangerouslySetInnerHTML={{
    __html: JSON.stringify(jsonLd).replace(/<\/script>/gi, '<\\/script>'),
  }}
/>
```

### `href` and `src` props

React does not prevent `javascript:` URLs in `href` or `src`. Sanitize dynamic URLs:

```tsx
function isSafeUrl(url: string) {
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// ✅ Safe href
<a href={isSafeUrl(user.website) ? user.website : '#'}>{user.name}</a>
```

---

## Server Actions Security

Server Actions are the primary attack surface unique to Next.js. They are publicly accessible HTTP endpoints. Any user can call them with arbitrary inputs — treat them like API routes.

### Always validate inputs

```tsx
'use server';
import { z } from 'zod';

const schema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
});

export async function createPost(formData: FormData) {
  const result = schema.safeParse({
    title: formData.get('title'),
    body: formData.get('body'),
  });

  if (!result.success) {
    return { error: result.error.flatten() };
  }

  // safe to use result.data
}
```

### Always authorize in the action

```tsx
'use server';
import { getSession } from '@/lib/auth';

export async function deletePost(postId: string) {
  const session = await getSession();
  if (!session) throw new Error('Unauthenticated');

  const post = await db.post.findUnique({ where: { id: postId } });
  if (!post) throw new Error('Not found');
  if (post.authorId !== session.user.id) throw new Error('Unauthorized'); // ← check ownership

  await db.post.delete({ where: { id: postId } });
}
```

Do not rely on the UI hiding a delete button. The action itself must verify ownership.

---

## SQL Injection and Database Safety

Use parameterized queries or a type-safe ORM. Never concatenate user input into SQL strings.

```ts
// ❌ Wrong — SQL injection
const users = await db.query(`SELECT * FROM users WHERE email = '${email}'`);

// ✅ Correct — parameterized (Postgres.js)
const users = await sql`SELECT * FROM users WHERE email = ${email}`;

// ✅ Correct — ORM (Prisma)
const users = await prisma.user.findMany({ where: { email } });
```

---

## Path Traversal in File Operations

If you use the file system in Server Components or Route Handlers, never trust user-supplied paths.

```ts
// ❌ Wrong — user can request "../../etc/passwd"
const content = fs.readFileSync(path.join('./docs', req.params.slug));

// ✅ Correct — resolve and verify the path stays inside the allowed directory
const DOCS_ROOT = path.resolve('./docs');
const requested  = path.resolve(DOCS_ROOT, req.params.slug);

if (!requested.startsWith(DOCS_ROOT + path.sep)) {
  return new Response('Forbidden', { status: 403 });
}

const content = fs.readFileSync(requested);
```

---

## Security Headers

Security headers instruct the browser on how to behave when loading your page. For Next.js apps with a server (not static export), configure them in `next.config.js`:

```js
// next.config.js
const securityHeaders = [
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'X-Frame-Options',           value: 'DENY' },
  { key: 'X-XSS-Protection',          value: '1; mode=block' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",  // tighten with nonces in production
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

module.exports = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};
```

**For static exports (GitHub Pages, S3):** HTTP headers can't be set by Next.js. Use `<meta http-equiv="Content-Security-Policy">` in `layout.tsx` for CSP, and configure the CDN/hosting layer for other headers.

### What each header does

| Header | Purpose |
|---|---|
| `X-Content-Type-Options: nosniff` | Prevents browsers from MIME-sniffing responses (blocks polyglot file attacks) |
| `X-Frame-Options: DENY` | Prevents your page from being loaded in an iframe (blocks clickjacking) |
| `Referrer-Policy` | Controls how much URL info is sent in the `Referer` header to third parties |
| `HSTS` | Forces HTTPS for future visits — never downgrade to HTTP |
| `Permissions-Policy` | Opt out of browser features (camera, mic, location) you don't use |
| `CSP` | Allowlist of sources for scripts, styles, images — the primary XSS mitigation |

---

## Authentication Patterns

### Protect routes at the middleware layer

Next.js Middleware runs before any page or API route is served — the right place to enforce authentication on all protected routes.

```ts
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req: NextRequest) {
  const token = await getToken({ req });
  const isAuthPage = req.nextUrl.pathname.startsWith('/login');

  if (!token && !isAuthPage) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/settings/:path*'],
};
```

### Use `httpOnly` cookies for session tokens

Tokens stored in `localStorage` are accessible to JavaScript and vulnerable to XSS. `httpOnly` cookies are invisible to JavaScript:

```ts
// Setting a session cookie in a Route Handler
res.cookies.set('session', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: 60 * 60 * 24 * 7, // 7 days
});
```

| Attribute | Purpose |
|---|---|
| `httpOnly` | Cookie invisible to JavaScript — blocks XSS token theft |
| `secure` | Cookie only sent over HTTPS |
| `sameSite: lax` | Blocks CSRF on cross-site POST requests while allowing GET navigation |

---

## CSRF Protection

Cross-Site Request Forgery tricks a user's browser into making authenticated requests to your app from a different site. Server Actions in Next.js include CSRF protection built in — they check the `Origin` header and reject cross-origin requests by default.

For Route Handlers, you must implement CSRF protection manually if they accept state-changing requests (POST, PUT, DELETE):

```ts
// app/api/action/route.ts
export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  const host   = req.headers.get('host');

  // reject if origin doesn't match the expected host
  if (!origin || !origin.includes(host ?? '')) {
    return new Response('Forbidden', { status: 403 });
  }

  // ... handle request
}
```

Or use `sameSite: lax/strict` on session cookies — most CSRF attacks are neutralized by this alone on modern browsers.

---

## Rate Limiting

Without rate limiting, Server Actions and Route Handlers can be spammed — for brute-forcing passwords, triggering expensive operations, or causing DoS.

Implement rate limiting at the edge using a store like Redis (Upstash):

```ts
// lib/ratelimit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'), // 10 requests per 10 seconds
});

// app/api/login/route.ts
import { ratelimit } from '@/lib/ratelimit';

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') ?? '127.0.0.1';
  const { success } = await ratelimit.limit(ip);
  if (!success) return new Response('Too Many Requests', { status: 429 });

  // ... handle login
}
```

---

## Dependency Security

Third-party packages are an attack surface. A compromised or malicious package in your `node_modules` can exfiltrate secrets or inject code.

```bash
# Audit for known vulnerabilities
npm audit

# Fix automatically where possible
npm audit fix

# Check for packages that shouldn't have network/fs access
npx can-i-ignore-scripts  # review postinstall scripts
```

**Lockfiles:** Always commit `package-lock.json` or `yarn.lock`. Without a lockfile, `npm install` can resolve to a newer (potentially compromised) patch version.

---

## Security Checklist for Next.js Apps

```
Secrets and Environment
✅ No secrets prefixed with NEXT_PUBLIC_
✅ .env files in .gitignore
✅ server-only imported in files with DB/secret access

XSS
✅ dangerouslySetInnerHTML only used with sanitized content
✅ Dynamic hrefs sanitized to block javascript: URLs
✅ JSON-LD script content escaped

Server Actions
✅ All inputs validated with Zod or equivalent
✅ Authorization checked inside every mutating action
✅ No action trusts client-supplied IDs without ownership checks

API Routes
✅ Authentication checked at middleware or route level
✅ CSRF protection on state-changing endpoints
✅ Rate limiting on auth and expensive endpoints
✅ SQL queries use parameterized statements or ORM

Headers (server deployments)
✅ X-Content-Type-Options: nosniff
✅ X-Frame-Options: DENY
✅ Content-Security-Policy configured
✅ HSTS enabled in production

Dependencies
✅ npm audit run regularly (in CI)
✅ Lockfile committed
✅ postinstall scripts reviewed for untrusted packages
```

---

## Interview Questions

**Q: What is the server/client trust boundary in Next.js and why does it matter for security?**

Code in Server Components and Server Actions runs on the server and has access to secrets, databases, and filesystem. Code in Client Components runs in the user's browser and is fully visible. The boundary matters because any secret imported into a Client Component — even indirectly — gets bundled into the JavaScript sent to every visitor. Authorization logic in Client Components is also bypassable since users control their browser.

**Q: Why are Server Actions not automatically secure?**

Server Actions compile to HTTP POST endpoints. Any user can call them directly with crafted inputs, bypassing your UI entirely. Without explicit input validation (Zod) and ownership checks, a user could submit arbitrary data or perform actions on resources they don't own.

**Q: What is the difference between `httpOnly` cookies and `localStorage` for storing tokens?**

`localStorage` is accessible to JavaScript, meaning a single XSS vulnerability allows an attacker to steal the token. `httpOnly` cookies are invisible to JavaScript — even if XSS occurs, the attacker can't read the cookie value. They're also automatically sent with requests, so you don't need to manage them in application code.

**Q: When is a Content Security Policy not sufficient as an XSS mitigation?**

CSP is weakened by `'unsafe-inline'` in `script-src`, which allows inline scripts — the most common XSS injection vector. Without a nonce- or hash-based approach, you have to allow inline scripts globally. CSP is also only a browser-enforced mitigation — it doesn't prevent injection, it prevents execution. The correct defense is sanitizing input before rendering, with CSP as a second layer.

**Q: What is CSRF and how does Next.js Server Actions handle it?**

CSRF tricks a logged-in user's browser into making an authenticated request to your app from a malicious site. Server Actions are protected by default — Next.js checks the `Origin` header and rejects requests that don't originate from the same host. Route Handlers do not have this protection and require explicit origin checking or rely on `sameSite` cookie attributes.
