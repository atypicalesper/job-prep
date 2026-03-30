# Browser APIs

## Fetch & HTTP

```js
// Basic GET
const res = await fetch('/api/users')
if (!res.ok) throw new Error(`HTTP ${res.status}`)
const data = await res.json()

// POST with JSON body
const res = await fetch('/api/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Alice' }),
  signal: AbortSignal.timeout(5000),   // auto-abort after 5s
})

// With AbortController (manual cancel)
const controller = new AbortController()
const res = await fetch('/api/stream', { signal: controller.signal })
controller.abort()  // cancel request

// Response methods (consume body once)
res.json()       // parse JSON
res.text()       // raw text
res.blob()       // binary data
res.arrayBuffer()
res.formData()

res.headers.get('content-type')
res.status        // 200, 404, etc.
res.ok            // true if 200-299
```

### Parallel requests

```js
// All resolve or all reject
const [users, posts] = await Promise.all([
  fetch('/api/users').then(r => r.json()),
  fetch('/api/posts').then(r => r.json()),
])

// Settle regardless of failure
const results = await Promise.allSettled([...])
results.forEach(r => {
  if (r.status === 'fulfilled') console.log(r.value)
  else console.error(r.reason)
})
```

---

## Web Storage

```js
// localStorage — persists until explicitly cleared
localStorage.setItem('theme', 'dark')
localStorage.getItem('theme')       // 'dark'
localStorage.removeItem('theme')
localStorage.clear()

// sessionStorage — cleared when tab closes
sessionStorage.setItem('draft', JSON.stringify(data))
const draft = JSON.parse(sessionStorage.getItem('draft') ?? 'null')

// Both are synchronous and string-only (~5MB limit)
// For complex data, serialize/deserialize with JSON

// Listen for changes from other tabs
window.addEventListener('storage', e => {
  console.log(e.key, e.oldValue, e.newValue)  // localStorage only
})
```

### Cookies

```js
// Read all cookies
document.cookie  // "theme=dark; user=alice"

// Set cookie
document.cookie = 'theme=dark; path=/; max-age=86400; SameSite=Lax; Secure'

// Attributes
// path=/        — accessible from all paths
// max-age=N     — seconds until expiry (overrides expires)
// expires=date  — specific expiry date
// Secure        — HTTPS only
// HttpOnly      — not accessible via JS (server-set only, prevents XSS)
// SameSite=Lax  — sent on same-site + top-level cross-site navigation
// SameSite=Strict — only same-site requests
// SameSite=None; Secure — cross-site (third-party cookies)
```

---

## URL & History

```js
// URL parsing
const url = new URL('https://example.com/search?q=hello&page=2#results')
url.hostname    // 'example.com'
url.pathname    // '/search'
url.searchParams.get('q')      // 'hello'
url.searchParams.set('page', '3')
url.searchParams.append('filter', 'new')
url.hash        // '#results'
url.toString()  // full URL string

// History API (SPA routing)
history.pushState({ page: 2 }, '', '/search?page=2')   // add entry
history.replaceState({ page: 2 }, '', '/search?page=2') // replace current
history.back()
history.forward()
history.go(-2)

window.addEventListener('popstate', e => {
  console.log(e.state)   // state object passed to pushState
})
```

---

## Clipboard API

```js
// Write
await navigator.clipboard.writeText('Hello world')

// Read (requires user permission or gesture)
const text = await navigator.clipboard.readText()

// Copy on button click
document.querySelector('#copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(document.querySelector('#output').value)
})
```

---

## Geolocation

```js
navigator.geolocation.getCurrentPosition(
  position => {
    const { latitude, longitude, accuracy } = position.coords
  },
  error => {
    // error.code: 1=PERMISSION_DENIED, 2=UNAVAILABLE, 3=TIMEOUT
    console.error(error.message)
  },
  { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
)

// Watch (continuous updates)
const id = navigator.geolocation.watchPosition(success, error, options)
navigator.geolocation.clearWatch(id)
```

---

## Notifications API

```js
// Request permission
const permission = await Notification.requestPermission()
// 'granted' | 'denied' | 'default'

if (permission === 'granted') {
  new Notification('New message', {
    body: 'Alice: Hey!',
    icon: '/icon.png',
    badge: '/badge.png',
  })
}
```

---

## ResizeObserver

Watch element size changes without polling — better than `window.resize` for components.

```js
const observer = new ResizeObserver(entries => {
  for (const entry of entries) {
    const { width, height } = entry.contentRect
    console.log(`${entry.target.id}: ${width}×${height}`)
  }
})

observer.observe(document.querySelector('.chart'))
observer.unobserve(el)
observer.disconnect()
```

---

## requestAnimationFrame

Sync with browser paint cycle for smooth animations.

```js
function animate(timestamp) {
  // timestamp is DOMHighResTimeStamp (ms)
  el.style.transform = `translateX(${Math.sin(timestamp / 1000) * 100}px)`
  requestAnimationFrame(animate)
}

const id = requestAnimationFrame(animate)
cancelAnimationFrame(id)

// Better pattern: stop when done
function runAnimation() {
  let start = null
  const duration = 500

  function step(timestamp) {
    if (!start) start = timestamp
    const progress = Math.min((timestamp - start) / duration, 1)
    el.style.opacity = progress
    if (progress < 1) requestAnimationFrame(step)
  }

  requestAnimationFrame(step)
}
```

---

## Web Workers

Offload heavy computation off the main thread.

```js
// main.js
const worker = new Worker('./worker.js')

worker.postMessage({ data: largeArray })

worker.addEventListener('message', e => {
  console.log('Result:', e.data)
})

worker.addEventListener('error', e => {
  console.error(e.message)
})

worker.terminate()

// worker.js
self.addEventListener('message', e => {
  const result = heavyComputation(e.data)
  self.postMessage(result)
})
```

**Limitations**: no DOM access, no `window`, limited APIs. Use `SharedArrayBuffer` + `Atomics` for shared memory between workers.

---

## IndexedDB (via idb wrapper)

Client-side database — structured data, large storage, indexed queries.

```js
import { openDB } from 'idb'

const db = await openDB('my-app', 1, {
  upgrade(db) {
    const store = db.createObjectStore('notes', { keyPath: 'id', autoIncrement: true })
    store.createIndex('by-date', 'createdAt')
  },
})

// Write
await db.add('notes', { title: 'Hello', body: '...', createdAt: new Date() })
await db.put('notes', { id: 1, title: 'Updated', body: '...', createdAt: new Date() })

// Read
const note = await db.get('notes', 1)
const all = await db.getAll('notes')
const byDate = await db.getAllFromIndex('notes', 'by-date')

// Delete
await db.delete('notes', 1)
await db.clear('notes')
```

---

## Performance API

```js
// High-resolution timestamps
const start = performance.now()
doWork()
console.log(performance.now() - start, 'ms')

// Mark and measure
performance.mark('start-render')
render()
performance.mark('end-render')
performance.measure('render', 'start-render', 'end-render')

const [measure] = performance.getEntriesByName('render')
console.log(measure.duration)

// Navigation timing
const nav = performance.getEntriesByType('navigation')[0]
console.log(nav.domContentLoadedEventEnd - nav.startTime)  // DOMContentLoaded time
console.log(nav.loadEventEnd - nav.startTime)              // load time

// Resource timing
performance.getEntriesByType('resource').forEach(r => {
  console.log(r.name, r.duration)
})
```
