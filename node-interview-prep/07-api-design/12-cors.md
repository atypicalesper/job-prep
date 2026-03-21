# CORS — Cross-Origin Resource Sharing

## Why CORS Exists

The **Same-Origin Policy** blocks JavaScript from reading responses from a different origin. Origin = scheme + host + port.

```
https://app.example.com  ──── fetch ────▶  https://api.example.com  ← DIFFERENT ORIGIN
                                            Browser blocks the response
```

CORS is the mechanism that lets servers **opt-in** to allowing cross-origin requests.

---

## Simple vs Preflight Requests

### Simple requests (no preflight)

Conditions: method is GET/POST/HEAD, headers are only safe headers (Content-Type: application/x-www-form-urlencoded, multipart/form-data, text/plain), no custom headers.

```
Browser ──── GET /api/data ──────────────────────────▶ Server
              Origin: https://app.example.com
             ◀─── Access-Control-Allow-Origin: * ─────
             Browser allows JS to read response ✅
```

### Preflight requests (OPTIONS first)

Triggered when: PUT/PATCH/DELETE method, JSON body (`Content-Type: application/json`), any custom header (Authorization, X-Custom-Header).

```
Browser ──── OPTIONS /api/data ──────────────────────▶ Server
              Origin: https://app.example.com
              Access-Control-Request-Method: DELETE
              Access-Control-Request-Headers: Authorization

             ◀─── 204 No Content ─────────────────────
              Access-Control-Allow-Origin: https://app.example.com
              Access-Control-Allow-Methods: GET, POST, DELETE
              Access-Control-Allow-Headers: Authorization
              Access-Control-Max-Age: 86400

Browser ──── DELETE /api/data ───────────────────────▶ Server
              Origin: https://app.example.com
              Authorization: Bearer ...

             ◀─── 200 OK ─────────────────────────────
              Access-Control-Allow-Origin: https://app.example.com
```

`Access-Control-Max-Age` caches the preflight result — browser skips the OPTIONS call for that duration.

---

## CORS Headers

### Response headers (server sets these)

```http
# Allow specific origin (most secure for authenticated APIs)
Access-Control-Allow-Origin: https://app.example.com

# Allow any origin (public APIs, CDNs)
Access-Control-Allow-Origin: *

# Allow cookies/auth headers to be sent (cannot use * when true)
Access-Control-Allow-Credentials: true

# Methods allowed for cross-origin requests
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS

# Headers the browser is allowed to send
Access-Control-Allow-Headers: Authorization, Content-Type, X-Request-ID

# Headers the browser JS is allowed to read from the response
# (safe headers like Content-Type are always accessible)
Access-Control-Expose-Headers: X-Total-Count, X-Rate-Limit-Remaining

# How long to cache the preflight (seconds)
Access-Control-Max-Age: 86400
```

### Request headers (browser sets automatically)

```http
Origin: https://app.example.com
Access-Control-Request-Method: DELETE         # preflight only
Access-Control-Request-Headers: Authorization # preflight only
```

---

## Node.js CORS Implementation

### Express — manual

```js
app.use((req, res, next) => {
  const allowedOrigins = ['https://app.example.com', 'https://admin.example.com'];
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin'); // CRITICAL: tell CDN this response varies by origin
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  next();
});
```

### Express — cors package

```js
import cors from 'cors';

// Simple: allow all
app.use(cors());

// Production: restrict origins
app.use(cors({
  origin: (origin, callback) => {
    const allowed = ['https://app.example.com', 'https://admin.example.com'];
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-ID'],
  exposedHeaders: ['X-Total-Count'],
  maxAge: 86400,
}));
```

### FastAPI (Python)

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
  CORSMiddleware,
  allow_origins=["https://app.example.com"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["Authorization", "Content-Type"],
  max_age=86400,
)
```

---

## Common CORS Errors & Fixes

### "No 'Access-Control-Allow-Origin' header"

```
Access to fetch at 'https://api.example.com' from origin 'https://app.example.com'
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present.
```

**Fix:** Server is not sending CORS headers. Add CORS middleware. Check that the preflight OPTIONS request is handled and not returning 404.

### "The value of 'Access-Control-Allow-Origin' header must not be '*' when credentials flag is true"

```
The value of the 'Access-Control-Allow-Origin' header in the response
must not be the wildcard '*' when the request's credentials mode is 'include'.
```

**Fix:** When sending cookies/auth, you must use a specific origin, not `*`. Also set `Access-Control-Allow-Credentials: true`.

### Wildcard with credentials

```js
// WRONG — * cannot be used with credentials
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Credentials', 'true');

// CORRECT
res.setHeader('Access-Control-Allow-Origin', req.headers.origin); // reflect specific origin
res.setHeader('Vary', 'Origin');                                   // critical for caching
res.setHeader('Access-Control-Allow-Credentials', 'true');
```

### Preflight returning 404

```js
// Make sure OPTIONS is handled BEFORE your routes
app.options('*', cors()); // handle all preflight requests
app.use(cors());
```

---

## The Vary: Origin Header

**Critical and commonly missed.** When you dynamically set `Access-Control-Allow-Origin` based on the request's `Origin`, you MUST add `Vary: Origin` to tell CDNs and reverse proxies that this response varies per origin.

```
Without Vary: Origin:
  CDN caches response for origin A with Access-Control-Allow-Origin: https://a.com
  User from origin B gets the cached response with the wrong ACAO header → CORS fails

With Vary: Origin:
  CDN stores separate cache entries per Origin value
  Each origin gets the correct ACAO header
```

---

## CORS vs CSRF

They solve different problems:

| | CORS | CSRF |
|---|---|---|
| What it stops | JS reading responses cross-origin | Unauthorized cross-origin STATE-CHANGING requests (form submits) |
| Who enforces it | Browser (blocks JS from reading) | Server (validates request authenticity) |
| Cookie requests | Browser still sends cookies cross-origin even on CORS-blocked requests | CSRF token or SameSite cookie prevents forged requests |
| Defense | CORS headers on server | CSRF token, SameSite=Strict/Lax cookies |

**CORS does NOT prevent CSRF.** A form POST from another domain sends cookies but doesn't send the response to JS. The server still processes the request. SameSite cookies are the modern CSRF defense.

---

## Proxy Pattern (Bypass CORS in Development)

```js
// vite.config.ts / next.config.js — proxy to avoid CORS in dev
export default {
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
}

// Next.js rewrites
module.exports = {
  async rewrites() {
    return [
      { source: '/api/:path*', destination: 'http://localhost:4000/:path*' }
    ];
  }
};
```

Same origin from browser's perspective → no CORS check.

---

## Interview Q&A

**Q: Does CORS prevent the server from processing the request?**

No. For simple requests, the server processes the request and returns the response — CORS only controls whether the browser lets JavaScript read the response. For preflight, the browser checks first, but for simple requests (GET, form POST) the server has already acted. CORS is not a security mechanism that prevents the request — it controls client-side access to the response.

**Q: Why can't you use `Access-Control-Allow-Origin: *` with cookies?**

When credentials (cookies, auth headers) are included, the browser requires a specific origin in ACAO — wildcard would mean "any site can make credentialed requests to your API and the browser will expose the response to their JS", which would be a massive security hole. With credentials, you must reflect the specific allowed origin and set `Access-Control-Allow-Credentials: true`.

**Q: What is the `Vary: Origin` header and why is it critical?**

When you dynamically set `Access-Control-Allow-Origin` based on the incoming `Origin` header, HTTP caches (CDN, browser cache, Varnish) might cache the response and serve it to a different origin — with the wrong ACAO header, causing CORS failures. `Vary: Origin` tells caches to store separate entries per unique Origin value, ensuring each origin gets the correct response.

**Q: Explain the preflight request mechanism.**

When a cross-origin request uses a non-simple method (DELETE, PUT, PATCH), sends custom headers (Authorization), or uses Content-Type: application/json, the browser first sends an OPTIONS "preflight" request asking "is this cross-origin request allowed?". The server responds with CORS headers specifying allowed origins, methods, and headers. If approved, the browser sends the actual request. `Access-Control-Max-Age` caches this approval so subsequent requests skip the preflight (up to browser limits, typically 2 hours).
