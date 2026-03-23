# Auth, OAuth 2.0, OIDC & JWT

Authentication and authorization are the most common security gaps in web applications.

---

## Authentication vs Authorization

**Authentication (AuthN)** — who are you? Verify identity.
**Authorization (AuthZ)** — what can you do? Verify permissions.

```
AuthN: "Is this user who they claim to be?" → JWT / session
AuthZ: "Can this user perform this action?" → RBAC / ABAC / policies
```

---

## Session-based vs Token-based Auth

### Session-based (Stateful)

```
1. User logs in → server creates session → stores in DB/Redis
2. Server returns session ID in cookie (HttpOnly)
3. Every request: browser sends cookie → server looks up session → validates
```

- Server must store sessions → horizontal scaling needs shared session store (Redis)
- Easy to revoke (delete session from store)
- CSRF risk (cookie sent automatically — need CSRF token)

### Token-based / JWT (Stateless)

```
1. User logs in → server creates signed JWT → returns to client
2. Client stores JWT (memory or localStorage)
3. Every request: client sends JWT in Authorization header → server verifies signature
```

- No server-side storage → scales horizontally
- Hard to revoke before expiry (need token blacklist = stateful again)
- XSS risk if stored in localStorage (prefer httpOnly cookie)

---

## JWT — JSON Web Token

Three base64url-encoded parts separated by dots: `header.payload.signature`

```
eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiI0MiIsInJvbGUiOiJhZG1pbiIsImV4cCI6MTcwMDAwMH0.SIG
      ↑ header              ↑ payload                                              ↑ signature
```

### Header
```json
{ "alg": "RS256", "typ": "JWT" }
```

### Payload (Claims)
```json
{
  "sub": "42",              // subject (user ID)
  "iss": "https://auth.example.com",  // issuer
  "aud": "https://api.example.com",   // audience
  "exp": 1700000000,        // expiry (Unix timestamp)
  "iat": 1699996400,        // issued at
  "role": "admin",          // custom claim
  "email": "user@example.com"
}
```

### Signature
```
HMAC-SHA256(base64(header) + "." + base64(payload), secret)
// or RSA/ECDSA for asymmetric signing
```

### Symmetric vs Asymmetric Signing

| | HS256 (HMAC) | RS256 (RSA) / ES256 (ECDSA) |
|---|---|---|
| Keys | Single shared secret | Private key signs, public key verifies |
| Use case | Single service | Multiple services / microservices |
| Key distribution | Secret must be shared | Public key is safe to distribute |
| JWKS | Not applicable | Public keys at `/.well-known/jwks.json` |

**Prefer RS256/ES256** for microservices — only auth service needs private key; all other services verify with public key (fetchable from JWKS endpoint).

### Validation Checklist

```javascript
import jwt from 'jsonwebtoken';

function validateToken(token) {
  const payload = jwt.verify(token, publicKey, {
    algorithms: ['RS256'],     // ✅ whitelist algorithms (prevent "alg: none" attack)
    issuer: 'https://auth.example.com',   // ✅ check iss
    audience: 'https://api.example.com',  // ✅ check aud
    // exp checked automatically by jsonwebtoken
  });
  // ✅ check exp (done by library)
  // ✅ check iat not in the future
  return payload;
}
```

**Common JWT attacks**:
- `alg: none` — set algorithm to none, strip signature → always whitelist algorithms
- Algorithm confusion — sign with RS256 private key, verify expects HS256 with public key as secret → always explicitly specify expected algorithm
- Expired token accepted — not checking `exp` → always validate

### Token Revocation

JWTs are stateless — can't be revoked before expiry without extra infrastructure.

Options:
1. **Short expiry** (15 min access token) + long-lived refresh token (revocable in DB)
2. **Token blacklist** in Redis (defeats stateless benefit but necessary for logout/compromise)
3. **Token version** stored in DB — include `tokenVersion` in JWT, check against stored version on each request

```javascript
// Token version pattern
const payload = { sub: userId, tokenVersion: user.tokenVersion };
// On logout/password reset: user.tokenVersion++ in DB
// On validation: fetch user, check payload.tokenVersion === user.tokenVersion
```

---

## OAuth 2.0

Authorization framework for delegated access. Allows third-party apps to access resources on behalf of a user without sharing their password.

### Roles

```
Resource Owner: the user
Client: your app (wants access)
Authorization Server: issues tokens (Google, GitHub, Auth0, Keycloak)
Resource Server: API being accessed
```

### Authorization Code Flow (Web Apps — Most Secure)

```
1. User clicks "Sign in with Google"
2. App redirects to Google:
   /authorize?response_type=code
           &client_id=ABC
           &redirect_uri=https://app.com/callback
           &scope=openid email profile
           &state=RANDOM_STRING        ← CSRF protection
           &code_challenge=HASH        ← PKCE

3. User logs in at Google, grants consent

4. Google redirects to:
   https://app.com/callback?code=AUTH_CODE&state=RANDOM_STRING

5. App verifies state matches, exchanges code for tokens:
   POST /token
     code=AUTH_CODE
     &client_id=ABC
     &client_secret=XYZ        ← server-side only
     &code_verifier=ORIGINAL   ← PKCE

6. Auth server returns:
   { access_token, refresh_token, id_token (OIDC), expires_in }
```

**Why code instead of returning token directly?** Auth code is short-lived (10 min), single-use, and the actual token exchange happens server-side with client_secret — never exposed to browser.

### PKCE (Proof Key for Code Exchange)

For SPAs and mobile apps that can't store `client_secret` securely:

```javascript
// Before redirect
const verifier = crypto.randomBytes(32).toString('base64url');
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
sessionStorage.setItem('pkce_verifier', verifier);

// In /authorize URL
&code_challenge=challenge
&code_challenge_method=S256

// In token exchange (no client_secret needed)
&code_verifier=verifier
```

### Other Grant Types

**Client Credentials** — machine-to-machine (no user involved):
```
POST /token
  grant_type=client_credentials
  &client_id=ABC
  &client_secret=XYZ
  &scope=read:orders

→ access_token (no refresh token)
```

**Refresh Token Flow** — get new access token without re-login:
```
POST /token
  grant_type=refresh_token
  &refresh_token=LONG_LIVED_TOKEN
  &client_id=ABC

→ new access_token (+ optionally new refresh_token — rotation)
```

---

## OIDC — OpenID Connect

OAuth 2.0 + authentication layer. Adds `id_token` (JWT with user identity) on top of OAuth's `access_token`.

```
OAuth 2.0: "I authorize this app to access my Google Drive"
OIDC:      "I authorize this app AND here's proof of who I am (id_token)"
```

**id_token** standard claims:
```json
{
  "iss": "https://accounts.google.com",
  "sub": "1234567890",          // unique user ID at this provider
  "email": "user@gmail.com",
  "email_verified": true,
  "name": "Tarun Singh",
  "picture": "https://...",
  "iat": 1699996400,
  "exp": 1700000000,
  "nonce": "RANDOM"             // replay attack prevention
}
```

**OIDC Discovery** — providers expose metadata at `/.well-known/openid-configuration`:
```json
{
  "issuer": "https://accounts.google.com",
  "authorization_endpoint": "https://accounts.google.com/o/oauth2/v2/auth",
  "token_endpoint": "https://oauth2.googleapis.com/token",
  "jwks_uri": "https://www.googleapis.com/oauth2/v3/certs"
}
```

---

## Security Headers & CSP

### Content Security Policy (CSP)

Tells the browser which sources are allowed to load resources — primary defense against XSS.

```
Content-Security-Policy:
  default-src 'self';                    ← only load from same origin
  script-src 'self' https://cdn.example.com 'nonce-abc123';  ← scripts
  style-src 'self' 'unsafe-inline';      ← allow inline styles
  img-src 'self' data: https:;           ← images from any HTTPS
  connect-src 'self' https://api.example.com;  ← fetch/XHR/WebSocket
  font-src 'self' https://fonts.gstatic.com;
  frame-ancestors 'none';                ← prevent clickjacking (like X-Frame-Options)
  upgrade-insecure-requests;             ← auto-upgrade HTTP to HTTPS
  report-uri /csp-violations;            ← report violations
```

**Start with `Content-Security-Policy-Report-Only`** — reports violations without blocking, so you can tune before enforcing.

**Nonces for inline scripts** (better than `unsafe-inline`):
```javascript
// Server generates random nonce per request
const nonce = crypto.randomBytes(16).toString('base64');
// Header: script-src 'nonce-{nonce}'
// HTML: <script nonce="{nonce}">...</script>
```

### Other Security Headers

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
# Force HTTPS, remember for 1 year

X-Content-Type-Options: nosniff
# Prevent MIME-type sniffing (browser won't execute a JS file served as text/plain)

X-Frame-Options: DENY
# Prevent clickjacking (replaced by CSP frame-ancestors)

Referrer-Policy: strict-origin-when-cross-origin
# Limit referrer info on cross-origin requests

Permissions-Policy: camera=(), microphone=(), geolocation=()
# Disable browser features the app doesn't need

Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
# Enable SharedArrayBuffer, isolate browsing context
```

### CORS (Cross-Origin Resource Sharing)

```javascript
// Express
import cors from 'cors';

app.use(cors({
  origin: ['https://app.example.com', 'https://admin.example.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,    // allow cookies
  maxAge: 86400,        // cache preflight for 1 day
}));
```

**Preflight (OPTIONS)**: browser sends before non-simple requests (POST with JSON, custom headers). Server must respond with CORS headers. `maxAge` caches the preflight result.

Never use `origin: '*'` with `credentials: true` — browsers block it.

---

## Interview Questions

**Q: Where should you store JWTs on the client side?**

Avoid `localStorage` — vulnerable to XSS (any script can read it). Prefer `httpOnly; Secure; SameSite=Strict` cookies — inaccessible to JavaScript. XSS can't steal the token, CSRF is mitigated by `SameSite`. For SPAs needing to read token claims (e.g., user role for UI): store a separate, non-sensitive "profile token" in memory or localStorage. Never store the access token in localStorage.

**Q: Explain the Authorization Code Flow with PKCE.**

PKCE (Proof Key for Code Exchange) is for clients that can't store a `client_secret` securely (SPAs, mobile). Client generates a random `code_verifier`, hashes it to `code_challenge`, includes challenge in the auth request. Auth server stores the challenge. When exchanging the auth code for tokens, client sends the original `code_verifier` — auth server hashes it and compares to stored challenge. Prevents auth code interception attacks — even if attacker intercepts the code, they don't have the verifier.

**Q: What is the difference between OAuth 2.0 and OIDC?**

OAuth 2.0 is an authorization framework — it delegates access to resources (e.g., "this app can read my Google Drive"). It doesn't define how to authenticate or represent user identity. OIDC (OpenID Connect) is an identity layer on top of OAuth 2.0 — it adds an `id_token` (JWT with user claims like `sub`, `email`, `name`) and a `/userinfo` endpoint. Use OAuth for "log in with GitHub to access repos"; use OIDC for "log in with Google and get user identity for your app."

**Q: How does CSP prevent XSS?**

Even if an attacker injects a `<script>` tag, CSP's `script-src 'self'` directive prevents the browser from executing scripts from any other origin or inline scripts (without a nonce). The injected script has no nonce and is blocked. CSP doesn't prevent injection of HTML/CSS — it prevents execution of unauthorized scripts. Use nonces or hashes for inline scripts; avoid `unsafe-inline` and `unsafe-eval`.
