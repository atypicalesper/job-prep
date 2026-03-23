# Web Storage, Cookies & IndexedDB

## Storage Options Overview

| | Cookie | localStorage | sessionStorage | IndexedDB |
|---|---|---|---|---|
| Capacity | ~4KB | ~5–10MB | ~5MB | Hundreds of MB |
| Sent to server | ✅ Every request | ❌ | ❌ | ❌ |
| Accessible from JS | ✅ (unless HttpOnly) | ✅ | ✅ | ✅ |
| Expiry | Set by server/JS | Never (until cleared) | Tab close | Never (until cleared) |
| Shared across tabs | ✅ | ✅ | ❌ (per tab) | ✅ |
| Available in Workers | ❌ | ❌ | ❌ | ✅ |
| Structured data | ❌ (string only) | ❌ (string only) | ❌ | ✅ (any JS type) |

---

## Cookies

### Setting cookies (client-side)

```js
// Basic
document.cookie = 'theme=dark';

// With options
document.cookie = 'session=abc123; Max-Age=3600; Path=/; Secure; SameSite=Strict';

// Reading
function getCookie(name) {
  return document.cookie
    .split('; ')
    .find(row => row.startsWith(name + '='))
    ?.split('=')[1];
}

// Deleting (set Max-Age to 0 or negative)
document.cookie = 'session=; Max-Age=0; Path=/';
```

### Cookie attributes

```http
Set-Cookie: session=abc123;
  HttpOnly;           // JS cannot read — XSS protection
  Secure;             // HTTPS only
  SameSite=Strict;    // never sent cross-site (strongest CSRF protection)
  SameSite=Lax;       // sent on top-level GET navigations (default in modern browsers)
  SameSite=None; Secure; // sent cross-site (e.g. embedded iframe, third-party API)
  Domain=.example.com; // accessible on all subdomains
  Path=/api;           // only sent to /api paths
  Max-Age=3600;        // seconds until expiry
  Expires=Thu, 01 Jan 2026 00:00:00 GMT; // absolute expiry
  Partitioned;         // CHIPS — cookie partitioned per top-level site (privacy sandbox)
```

### Cookie size limit and strategy

4KB per cookie, ~50 cookies per domain. Use cookies **only** for session tokens, CSRF tokens, and user preferences. Everything else → localStorage or IndexedDB.

---

## localStorage

```js
// Store — must serialize objects
localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Tarun' }));

// Read
const user = JSON.parse(localStorage.getItem('user') ?? 'null');

// Delete one key
localStorage.removeItem('user');

// Clear everything
localStorage.clear();

// Iterate all keys
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  console.log(key, localStorage.getItem(key));
}
```

### Storage event (cross-tab sync)

```js
// Fires in OTHER tabs (not the tab that set the value)
window.addEventListener('storage', (e) => {
  console.log(e.key, e.oldValue, e.newValue, e.url);
});

// Use case: logout all tabs when one logs out
localStorage.setItem('logout', Date.now().toString());
// other tabs detect this and clear auth state
```

### Limitations

- Synchronous — blocks the main thread (don't store large data)
- Strings only — must JSON.stringify/parse
- No expiry — you must implement TTL manually:

```js
function setWithExpiry(key, value, ttlMs) {
  localStorage.setItem(key, JSON.stringify({ value, expiry: Date.now() + ttlMs }));
}

function getWithExpiry(key) {
  const item = localStorage.getItem(key);
  if (!item) return null;
  const { value, expiry } = JSON.parse(item);
  if (Date.now() > expiry) {
    localStorage.removeItem(key);
    return null;
  }
  return value;
}
```

---

## sessionStorage

Identical API to localStorage but:
- Cleared when the **tab** closes (not the window/browser)
- **Not shared** between tabs — each tab has its own sessionStorage
- Use for: wizard/multi-step form state, per-tab UI state

```js
// Good use case: persist form state during page refresh but not across tabs
sessionStorage.setItem('checkoutStep', JSON.stringify(formData));
```

---

## IndexedDB

Async, transactional, key-value (with indexes) database in the browser. Can store JS objects, Blobs, Files, ArrayBuffers.

### Raw API (verbose — use a wrapper in production)

```js
const request = indexedDB.open('AppDB', 1);

request.onupgradeneeded = (e) => {
  const db = e.target.result;
  const store = db.createObjectStore('todos', { keyPath: 'id', autoIncrement: true });
  store.createIndex('by-done', 'done', { unique: false });
};

request.onsuccess = (e) => {
  const db = e.target.result;

  // Write
  const tx = db.transaction('todos', 'readwrite');
  tx.objectStore('todos').add({ text: 'Learn IndexedDB', done: false });

  // Read
  const readTx = db.transaction('todos', 'readonly');
  const getAllReq = readTx.objectStore('todos').getAll();
  getAllReq.onsuccess = () => console.log(getAllReq.result);
};
```

### idb (clean promise wrapper — recommended)

```js
import { openDB } from 'idb';

const db = await openDB('AppDB', 1, {
  upgrade(db) {
    const store = db.createObjectStore('todos', { keyPath: 'id', autoIncrement: true });
    store.createIndex('by-done', 'done');
  },
});

// Write
await db.add('todos', { text: 'Learn idb', done: false });

// Read all
const all = await db.getAll('todos');

// Query by index
const pending = await db.getAllFromIndex('todos', 'by-done', false);

// Transaction (atomic multi-operation)
const tx = db.transaction('todos', 'readwrite');
await tx.store.put({ id: 1, text: 'Updated', done: true });
await tx.done;
```

### Use cases for IndexedDB

- Offline-first apps (PWA) — cache API responses, sync when online
- Large datasets (thousands of records)
- Binary data — audio, images, PDFs
- Draft content — auto-save long-form editors

---

## Cache API (Service Workers)

```js
// In Service Worker
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('v1').then(cache =>
      cache.addAll(['/index.html', '/styles.css', '/app.js'])
    )
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      // Cache-first strategy
      if (cached) return cached;

      // Stale-while-revalidate
      const fetchPromise = fetch(e.request).then(response => {
        caches.open('v1').then(cache => cache.put(e.request, response.clone()));
        return response;
      });
      return fetchPromise;
    })
  );
});
```

---

## Security Considerations

```
┌─────────────────────────────────────────────────────────┐
│ XSS attacks can read localStorage and sessionStorage    │
│ → Never store JWT access tokens in localStorage          │
│ → Use HttpOnly cookies for auth tokens                   │
│                                                         │
│ localStorage is accessible by any JS on the page        │
│ including injected third-party scripts                  │
└─────────────────────────────────────────────────────────┘
```

**Safe pattern for auth tokens:**

```
Access token  → memory only (JS variable, reset on refresh)
Refresh token → HttpOnly Secure SameSite=Strict cookie
```

On page load, call `/auth/refresh` with the cookie (sent automatically) to get a new in-memory access token. No JS can steal it.

---

## Interview Q&A

**Q: Where should you store JWT tokens — localStorage or cookies?**

Cookies with `HttpOnly; Secure; SameSite=Strict`. localStorage is readable by any JavaScript on the page — an XSS vulnerability lets an attacker steal the token. `HttpOnly` cookies are invisible to JavaScript entirely. The trade-off: cookies are automatically sent with every request (CSRF risk, mitigated by `SameSite`) and have a 4KB limit; localStorage is explicitly sent only when you choose to.

**Q: What is the difference between localStorage and sessionStorage?**

Same API, two lifetimes: `localStorage` persists until explicitly cleared (survives tab/browser close). `sessionStorage` is scoped to the current tab and cleared when that tab closes — not shared across tabs even on the same domain. Use sessionStorage for ephemeral per-tab state (form progress, scroll position), localStorage for persistent user preferences.

**Q: When would you use IndexedDB over localStorage?**

When you need: (1) async non-blocking reads (localStorage is synchronous, blocks main thread), (2) storing more than ~5MB, (3) structured queries with indexes, (4) storing binary data (Blobs, ArrayBuffers), (5) offline-first PWA data that needs to survive browser restart. For simple key-value with small strings, localStorage is fine.

**Q: What does `SameSite=Lax` vs `SameSite=Strict` mean for cookies?**

`Strict` — cookie is never sent in cross-site requests, including when a user clicks a link on another site to your site. Most protection, but can break OAuth flows (redirect back from auth provider is a cross-site navigation).

`Lax` — cookie is sent on cross-site top-level GET navigations (link clicks, redirects) but not on cross-site POST, PUT, PATCH, or iframe requests. Balances CSRF protection with usability. Modern browsers default to Lax if SameSite is unset.

`None; Secure` — always sent cross-site. Required for embedded iframes, third-party auth widgets, APIs called from different domains.
