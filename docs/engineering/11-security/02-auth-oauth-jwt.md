# Auth, OAuth 2.0, OIDC & JWT

Authentication and authorization are the most common security gaps in web applications.

---

## Authentication vs Authorization

Authentication and authorization are distinct security operations that are almost always conflated. Authentication establishes identity — it answers "who is making this request?" by verifying a credential (password, token, certificate). Authorization uses the established identity to answer "is this identity permitted to perform this action on this resource?" A system can have authentication without authorization (everyone who logs in gets the same access), but authorization without authentication is meaningless (you can't make access decisions about an unknown identity). Confusing the two leads to the most common access-control bugs: implementing AuthN correctly but missing AuthZ checks, or performing AuthZ based on unverified client-supplied data rather than the server-established identity.

**Authentication (AuthN)** — who are you? Verify identity.
**Authorization (AuthZ)** — what can you do? Verify permissions.

```
AuthN: "Is this user who they claim to be?" → JWT / session
AuthZ: "Can this user perform this action?" → RBAC / ABAC / policies
```

---

## Session-based vs Token-based Auth

### Session-based (Stateful)

Session-based authentication stores the authentication state on the server: after a successful login the server creates a session record (typically in Redis or a database), issues the session ID to the client in an HttpOnly cookie, and looks up that session on every subsequent request. Because the server holds the state, it has complete control — invalidating a session (logout, account lock) is instant and requires no coordination. The trade-off is that every server must share access to the same session store, which adds a dependency for horizontal scaling.

```
1. User logs in → server creates session → stores in DB/Redis
2. Server returns session ID in cookie (HttpOnly)
3. Every request: browser sends cookie → server looks up session → validates
```

- Server must store sessions → horizontal scaling needs shared session store (Redis)
- Easy to revoke (delete session from store)
- CSRF risk (cookie sent automatically — need CSRF token)

### Token-based / JWT (Stateless)

JWT-based authentication moves the session state from the server into the token itself: the server signs a payload (user ID, role, expiry) with a secret or private key, and the client presents this token on every request. The server verifies the signature — a cheap cryptographic operation — and extracts the claims without any database lookup. This scales naturally across many server instances since there is no shared session store. The cost is that tokens cannot be revoked before they expire without adding server-side state (a blacklist), which partially negates the stateless benefit. Short expiry times (15 minutes) combined with long-lived refresh tokens are the standard compromise.

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

A JSON Web Token is a compact, self-contained credential that encodes claims (assertions about a subject) in a JSON object, digitally signs the result, and base64url-encodes the whole thing into a string that can be passed in an HTTP header. The key property is self-contained verification: the server can validate the token using only its own secret or public key, with no database lookup. This makes JWTs horizontally scalable and stateless. The most important thing to understand about JWTs is that the payload is not encrypted — it is only signed. Anyone who possesses the token can read the claims by base64-decoding the payload. The signature only prevents tampering; it provides no confidentiality. For confidential claims, use JWE (JSON Web Encryption) or store sensitive data server-side.

Three base64url-encoded parts separated by dots: `header.payload.signature`

```
eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiI0MiIsInJvbGUiOiJhZG1pbiIsImV4cCI6MTcwMDAwMH0.SIG
      ↑ header              ↑ payload                                              ↑ signature
```

### Header

The header identifies the algorithm used to sign the token. Always explicitly whitelist the expected algorithm during validation — the `alg: none` attack works by sending a token with the algorithm set to `none` and no signature; a naive verifier that trusts the header's algorithm claim will accept it.

```json
{ "alg": "RS256", "typ": "JWT" }
```

### Payload (Claims)

The payload is the token's data — a JSON object of claims. Standard registered claims (`sub`, `iss`, `aud`, `exp`, `iat`) have defined semantics understood by all JWT libraries. Custom claims (`role`, `email`) can carry any application-specific data. The payload is base64url-encoded, not encrypted — anyone who possesses the token can decode and read it without knowing the signing key. Never put sensitive data (passwords, PII beyond what's needed) in the payload.

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

The signature is what makes the token tamper-proof. It is a cryptographic function over the header and payload — any change to either (even a single character) produces a completely different signature that fails verification. The server never needs to look up the token in a database because the signature itself is proof of authenticity.

```
HMAC-SHA256(base64(header) + "." + base64(payload), secret)
// or RSA/ECDSA for asymmetric signing
```

### Symmetric vs Asymmetric Signing

The choice between symmetric (HS256) and asymmetric (RS256/ES256) signing determines who can verify tokens — and that determines your architecture. With symmetric signing, anyone who can verify tokens can also forge them (because the same secret does both operations), so the secret must never leave the auth service. This works fine when there is only one service that needs to verify tokens. With asymmetric signing, the private key signs and stays on the auth service, while the public key (which can only verify, not sign) can be freely distributed to all microservices that need to verify tokens. The `/.well-known/jwks.json` endpoint is the standard mechanism for services to fetch the current public keys, including during key rotation.

| | HS256 (HMAC) | RS256 (RSA) / ES256 (ECDSA) |
|---|---|---|
| Keys | Single shared secret | Private key signs, public key verifies |
| Use case | Single service | Multiple services / microservices |
| Key distribution | Secret must be shared | Public key is safe to distribute |
| JWKS | Not applicable | Public keys at `/.well-known/jwks.json` |

**Prefer RS256/ES256** for microservices — only auth service needs private key; all other services verify with public key (fetchable from JWKS endpoint).

### Validation Checklist

JWT validation must be both complete and explicit. Many vulnerabilities arise from partial validation — verifying the signature but not checking `exp`, trusting the token's `alg` header rather than specifying expected algorithms, or not verifying `iss` and `aud` claims, which opens the door to token confusion across services. The checklist below represents the minimum required for secure validation in production.

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

The stateless property of JWTs is simultaneously their greatest strength (no database lookup on every request) and their most significant security weakness. A signed token is valid until its `exp` claim says otherwise — the server cannot "un-sign" a token that has been issued. This becomes a problem when you need to invalidate a specific token immediately: a user logs out, an account is compromised, a user's role is revoked, or an administrator force-expires a session. The three approaches below represent a spectrum of tradeoffs between the pure stateless ideal and the operational reality that some revocation capability is usually required.

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

OAuth 2.0 solves the problem of delegated authorization: how does a third-party application access a resource on a user's behalf without the user handing over their password? Before OAuth, the only option was to give your credentials directly to the third party — a severe security risk because you couldn't selectively revoke access, the third party could impersonate you fully, and a breach of the third party exposed your credentials everywhere you used them. OAuth 2.0 introduces a consent-based authorization flow where the user authenticates directly with the resource owner (e.g., Google), grants limited permissions (scopes), and the third-party application receives a time-limited access token with only those permissions. The user's password never leaves Google, and the token can be revoked without changing the password.

Authorization framework for delegated access. Allows third-party apps to access resources on behalf of a user without sharing their password.

### Roles

OAuth 2.0 defines four distinct roles that interact in any authorization flow. Understanding the separation is essential: the Authorization Server issues tokens and is the only party that validates credentials; the Resource Server only validates tokens and never sees the user's password; the Client is your application; and the Resource Owner is the user consenting to access. This separation is what makes delegated access safe — your application never handles the user's credentials at the Authorization Server.

```
Resource Owner: the user
Client: your app (wants access)
Authorization Server: issues tokens (Google, GitHub, Auth0, Keycloak)
Resource Server: API being accessed
```

### Authorization Code Flow (Web Apps — Most Secure)

The Authorization Code Flow is the most secure and recommended grant type for server-side web applications. The key security property is that the access token is never exposed to the browser — instead, the authorization server redirects to your server with a short-lived, single-use authorization code, and your server exchanges that code for tokens using its `client_secret` in a back-channel (server-to-server) call. This means even if the redirect URL is intercepted (e.g., in browser history or server logs), the intercepted code is useless without the `client_secret`. The `state` parameter provides CSRF protection by verifying that the redirect came from the same browser session that initiated the login.

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

PKCE (pronounced "pixie") solves the authorization code interception attack for public clients — SPAs and mobile apps that cannot securely store a `client_secret` because their code is fully accessible to the user or an attacker. Without a `client_secret` to verify the token exchange, any attacker who intercepts the authorization code (e.g., via a malicious app registered for the same redirect URI scheme on mobile) could exchange it for tokens. PKCE binds the authorization code to the specific client instance that requested it: the client generates a random secret (`code_verifier`), hashes it to a `code_challenge`, and includes only the hash in the authorization request. At token exchange time, the client sends the original verifier — the auth server hashes it and compares it to the stored challenge. An attacker who intercepts only the code cannot compute the verifier from the hash alone.

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

Different deployment contexts require different grant types. Client Credentials is used for machine-to-machine communication where there is no user involved — a background job calling an internal API, a microservice calling another microservice. The Refresh Token flow is the mechanism that keeps users logged in without re-entering credentials: the short-lived access token expires, the client silently exchanges the long-lived refresh token for a new access token, and the user never notices. Refresh token rotation (issuing a new refresh token with each exchange and invalidating the old one) limits the damage window if a refresh token is stolen.

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

OpenID Connect is an identity layer built on top of OAuth 2.0 that adds a standardized way to authenticate users and communicate their identity. OAuth 2.0 was designed purely for authorization (delegating access to resources) — it deliberately says nothing about who the user is. Applications that implemented "Sign in with Google" on top of bare OAuth 2.0 each had to call the `/userinfo` endpoint and interpret the response in ad-hoc ways. OIDC standardizes this: it adds the `id_token` (a JWT with defined claims about the user's identity), the `/.well-known/openid-configuration` discovery endpoint (so clients can find all endpoints automatically), and the `/userinfo` endpoint's response format. The `nonce` claim in the `id_token` prevents replay attacks — an attacker who intercepts an `id_token` and replays it to your app can be detected if the nonce doesn't match what your session expected.

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

HTTP response headers are a browser-enforced security layer that operates independently of your application code. Once set, they instruct the browser to enforce policies on the client side — restricting which scripts can execute, requiring HTTPS, preventing embedding in iframes, and disabling unnecessary browser features. They represent a defense-in-depth layer: even if your application has an injection vulnerability that slips through, correctly configured security headers can prevent the browser from executing injected scripts (CSP), following HTTP downgrade requests (HSTS), or submitting form data to attacker origins. The headers below are non-breaking to add and represent the minimum baseline for any production web application.

### Content Security Policy (CSP)

CSP is a response header that instructs the browser to enforce a whitelist of trusted sources for scripts, styles, images, and other resource types. It is the most powerful browser-side defense against XSS: even if an attacker successfully injects a `<script>` tag, CSP prevents the browser from executing it if the source is not whitelisted. The directives are additive — `default-src` sets the fallback for any resource type not explicitly listed. Start with Report-Only mode to observe what would be blocked without actually blocking anything, tune the policy until violations stop, then switch to enforcement mode. Nonces are preferred over `'unsafe-inline'` for inline scripts because they change on every request, making them impossible to predict.

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

Beyond CSP, several other headers provide targeted defenses against specific attack classes. Each header below addresses one mechanism: HSTS eliminates HTTP downgrade attacks, `X-Content-Type-Options` prevents MIME confusion attacks where the browser executes a file as JavaScript even though the server declared it as text, `X-Frame-Options` prevents the page from being embedded in an iframe on an attacker's site for clickjacking, and `Permissions-Policy` restricts access to sensitive browser features the application doesn't use.

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

CORS is a browser mechanism that allows servers to declare which origins are permitted to read their responses via JavaScript. A key distinction is that CORS does not prevent requests — the browser sends the request and the server processes it; CORS only controls whether the browser exposes the response to the requesting JavaScript. This is why CORS is not a substitute for server-side authentication: a non-browser HTTP client (curl, Postman, a server-side attacker) ignores CORS entirely. The `credentials: true` option requires an explicit origin whitelist; using a wildcard origin with credentials enabled is blocked by browsers and will cause all credentialed cross-origin requests to fail.

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
