# Authentication and Authorization — JWT and OAuth2

---

## JWT (JSON Web Tokens)

### Structure

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJuYW1lIjoiQWxpY2UiLCJpYXQiOjE3MDUzMTI4MDB9.Abc123...

Header.Payload.Signature
  │        │        │
  ▼        ▼        ▼
Base64   Base64   HMAC/RSA of header+payload
```

```javascript
// Header:
{ "alg": "HS256", "typ": "JWT" }

// Payload (claims):
{
  "sub": "user:123",    // subject (who)
  "iss": "my-api",      // issuer
  "aud": "my-app",      // audience
  "iat": 1705312800,    // issued at (Unix timestamp)
  "exp": 1705316400,    // expiry (1 hour later)
  "jti": "uuid",        // JWT ID (for blacklisting)
  // Custom claims:
  "email": "alice@example.com",
  "role": "admin"
}

// Signature (prevents tampering):
HMACSHA256(base64(header) + "." + base64(payload), secret)
```

### JWT is NOT encrypted — only signed!

```javascript
// Anyone can base64-decode the payload and read it
// Don't put secrets in JWT payload
// JWT only proves the server created it (signature verification)
```

---

## JWT Implementation in Node.js

```typescript
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!; // must be long random string
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

// Generate tokens:
function generateTokens(userId: string, role: string) {
  const accessToken = jwt.sign(
    { sub: userId, role },
    JWT_SECRET,
    { expiresIn: '15m', issuer: 'my-api' } // short-lived!
  );

  const refreshToken = jwt.sign(
    { sub: userId, jti: crypto.randomUUID() },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' } // long-lived
  );

  return { accessToken, refreshToken };
}

// Verify access token (middleware):
function authenticateJWT(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET, { issuer: 'my-api' });
    req.user = payload as JwtPayload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Refresh token endpoint:
app.post('/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  try {
    const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as JwtPayload;

    // Check token not blacklisted (Redis):
    const blacklisted = await redis.get(`blacklist:${payload.jti}`);
    if (blacklisted) return res.status(401).json({ error: 'Token revoked' });

    // Issue new access token:
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(
      payload.sub!, 'user'
    );

    // Blacklist old refresh token (rotation):
    await redis.setex(`blacklist:${payload.jti}`, 7 * 86400, '1');

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});
```

---

## JWT Security Best Practices

```
1. Short access token TTL (15 minutes)
2. Refresh tokens long-lived (7-30 days) + rotation
3. Store refresh tokens server-side (DB/Redis) for revocation
4. Use RS256 (asymmetric) for multi-service auth (each service verifies with public key)
5. Validate all claims: exp, iss, aud
6. Never put PII or secrets in payload
7. Use HTTPS only
8. Don't store in localStorage (XSS risk) — use httpOnly cookies
```

---

## Cookie vs Header Token Storage

```
localStorage/sessionStorage:
✅ Simple to implement
❌ Vulnerable to XSS (JS can read it)
❌ Not sent automatically — must add to every request

httpOnly Cookie:
✅ JS cannot read it (XSS protection)
✅ Sent automatically with requests
❌ Vulnerable to CSRF — mitigate with:
   - SameSite=Strict (same origin only)
   - CSRF token (double submit cookie pattern)
   - Custom request headers (CORS prevents third-party sites from setting them)

Best practice: httpOnly, Secure, SameSite=Strict cookie for refresh token
              Short-lived access token in memory (not persisted)
```

---

## OAuth2 — Authorization Framework

```
NOT an authentication protocol — it's an authorization protocol.
OpenID Connect (OIDC) adds authentication on top of OAuth2.

Roles:
Resource Owner — the user
Client — your application
Authorization Server — issues tokens (Google, GitHub, Auth0)
Resource Server — the API being accessed

Grant Types:
1. Authorization Code (+ PKCE) — for web/mobile apps
2. Client Credentials — for server-to-server (no user)
3. Device Code — for devices without browsers (TV, CLI)
4. Implicit — deprecated (use Authorization Code + PKCE)
```

---

## OAuth2 Authorization Code Flow (with PKCE)

```
1. App generates: code_verifier (random) + code_challenge = SHA256(code_verifier)

2. Redirect user to Authorization Server:
   GET /authorize?
     response_type=code&
     client_id=myapp&
     redirect_uri=https://myapp.com/callback&
     scope=read:user email&
     state=random-csrf-token&
     code_challenge=abc123&
     code_challenge_method=S256

3. User authenticates + consents

4. Authorization Server redirects back:
   GET /callback?code=AUTH_CODE&state=random-csrf-token

5. App verifies state matches (CSRF protection)

6. App exchanges code for tokens:
   POST /token
   { grant_type: "authorization_code", code, redirect_uri, code_verifier }

7. Authorization Server returns:
   { access_token, refresh_token, id_token (OIDC), expires_in }

8. App uses access_token to call Resource Server
```

---

## Client Credentials Flow (Service-to-Service)

```typescript
// Microservice A calling Microservice B:
async function getServiceToken(): Promise<string> {
  const response = await fetch('https://auth.example.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.CLIENT_ID!,
      client_secret: process.env.CLIENT_SECRET!,
      scope: 'read:orders write:inventory'
    })
  });

  const { access_token, expires_in } = await response.json();

  // Cache the token (reuse until near expiry):
  await redis.set('service:token', access_token, 'EX', expires_in - 60);
  return access_token;
}

// Use with caching:
async function callOrderService(orderId: string) {
  let token = await redis.get('service:token');
  if (!token) token = await getServiceToken();

  return fetch(`https://orders.internal/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}
```

---

## Session vs JWT Trade-offs

```
Sessions (Server-side state):
✅ Instant revocation (delete from Redis/DB)
✅ No token size limit
✅ Simpler rotation
❌ Requires shared state (Redis) for horizontal scaling
❌ DB lookup on every request

JWT (Stateless):
✅ No DB lookup — stateless verification
✅ Self-contained claims (no extra query for roles)
✅ Works across domains/services
❌ Can't revoke until expiry (need blacklist for true revocation)
❌ Larger request size
❌ Must keep secret secure

Recommendation:
- Use sessions for single-server apps or when revocation is critical
- Use JWT for distributed systems / microservices
- Use short TTL (15min) access tokens + refresh token rotation as compromise
```

---

## Interview Questions

**Q: How do you invalidate a JWT?**
A: JWTs are stateless — you can't invalidate them server-side without adding state. Options: (1) Short TTL (15min) — tokens expire quickly. (2) Blacklist: store revoked `jti` values in Redis with TTL matching token TTL. (3) Token rotation: refresh tokens are single-use and tracked in DB. (4) Change the signing secret — invalidates ALL tokens (nuclear option for security breach).

**Q: What is PKCE and why is it needed?**
A: Proof Key for Code Exchange. The client generates a random `code_verifier`, hashes it to `code_challenge`, and sends the challenge with the auth request. When exchanging the auth code for tokens, it sends the original `code_verifier`. The auth server verifies the hash matches. This prevents authorization code interception attacks — if an attacker intercepts the code, they can't exchange it without the verifier.

**Q: What is the difference between OAuth2 and OpenID Connect?**
A: OAuth2 is an authorization framework — it grants access to resources on behalf of a user. It answers "what can this app do?". OpenID Connect (OIDC) is an authentication layer on top — it provides identity. It answers "who is this user?" OIDC adds the `id_token` (a JWT with user identity info), the `/userinfo` endpoint, and standardized claims like `sub`, `email`, `name`.

**Q: Where should you store JWT tokens in a browser?**
A: For access tokens: in-memory (JavaScript variable) — best XSS protection since there's no persistent storage, but lost on page refresh. For refresh tokens: httpOnly secure cookie with SameSite=Strict — prevents XSS access while mitigating CSRF. Avoid localStorage for sensitive tokens — it's accessible to any JS on the page.
