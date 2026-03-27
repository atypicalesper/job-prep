# Hot Module Replacement (HMR)

HMR is a dev-server feature that swaps updated modules in a running browser page **without a full reload** — preserving application state while applying code changes instantly.

---

## How HMR Works: The WebSocket Pipeline

HMR requires a persistent, bidirectional channel between the dev server and the browser. That channel is a **WebSocket**.

```
┌──────────────────────────────────────────────────────────────┐
│  File system                 Dev Server            Browser   │
│                                                              │
│  src/Button.tsx              Watcher               WS client │
│       │                          │                    │      │
│       │  (save)                  │                    │      │
│       └──────────────────────►  │                    │      │
│                               Build changed          │      │
│                               module → hash          │      │
│                                  │                    │      │
│                                  │   WS message       │      │
│                                  │  { type: 'update'  │      │
│                                  │    id: 'Button'    │      │
│                                  │    hash: 'a3f...'} │      │
│                                  └───────────────────►│      │
│                                                  Fetch new   │
│                                                  module JS   │
│                                                  via HTTP    │
│                                                       │      │
│                                                  module.hot  │
│                                                  .accept()   │
│                                                  → replace   │
└──────────────────────────────────────────────────────────────┘
```

### Step-by-step

1. **Watcher** — a file-system watcher (chokidar) detects a change.
2. **Incremental compile** — only the affected module and its dependants are recompiled.
3. **Manifest update** — the server records a new content hash for the changed chunk.
4. **WebSocket push** — the server sends a small JSON message to all connected clients:
   ```json
   { "type": "update", "updates": [{ "id": "./src/Button.tsx", "hash": "a3f9c" }] }
   ```
5. **Module fetch** — the browser HMR runtime requests the new module JS over HTTP (or the WebSocket itself in some bundlers).
6. **Module replacement** — `module.hot.accept()` callbacks fire; the new module exports replace the old ones in the module registry.
7. **Re-render** — framework-specific runtime (React Fast Refresh, Vue HMR) triggers a re-render with preserved component state.

---

## The WebSocket Connection

The browser client establishes a WS connection to the dev server on page load:

```js
// Injected by the bundler's client runtime (webpack example)
const socket = new WebSocket('ws://localhost:3000/__webpack_hmr');

socket.onmessage = ({ data }) => {
  const msg = JSON.parse(data);
  if (msg.type === 'update') applyUpdate(msg);
  if (msg.type === 'reload')  location.reload();
};
```

**Why WebSocket and not polling?**
- Server-push: the server initiates the notification, no wasted requests when nothing changed.
- Low latency: sub-millisecond delivery vs. 500–2000 ms poll intervals.
- Persistent: one connection handles the entire dev session.

**Fallback**: if the WebSocket connection fails (proxy blocks `Upgrade` header, network issue), bundlers fall back to **Server-Sent Events (SSE)** or polling. Next.js uses SSE by default; Vite uses WebSocket with SSE fallback.

---

## Webpack HMR

Webpack injects two chunks into the bundle at dev time:

| Chunk | Purpose |
|---|---|
| `webpack-dev-server/client` | WebSocket client, receives messages |
| `webpack/hot/dev-server` | Decides hot-update vs. full reload |

The runtime fetches `[hash].hot-update.json` (manifest) and `[hash].hot-update.js` (the module code) after receiving a WS message.

```js
// webpack module.hot API
if (module.hot) {
  module.hot.accept('./utils', () => {
    // re-import updated module
    const newUtils = require('./utils');
    render(newUtils);
  });
}
```

`module.hot.accept` with no arguments = self-accepting; the module handles its own update. Required for React Fast Refresh to work.

---

## Vite HMR

Vite serves **native ES modules** in dev mode — no bundling step. HMR is faster because:

- No bundle → individual module files are re-fetched directly.
- The module graph is maintained in memory; only the changed module and its importers need updating.
- Uses native browser module cache invalidation (`?t=timestamp` query param).

```ts
// Vite HMR API
if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    // newModule is the freshly evaluated module
  });

  import.meta.hot.dispose((data) => {
    // cleanup before the module is replaced
    data.state = savedState;
  });
}
```

Vite's WebSocket sends:
- `type: 'update'` — module hot-update
- `type: 'full-reload'` — full page reload required
- `type: 'prune'` — module removed from the graph
- `type: 'error'` — compile error (displayed as an overlay)

---

## React Fast Refresh

React Fast Refresh is React's HMR integration, replacing the older React Hot Loader.

**What it preserves:**
- Component state (`useState`, `useReducer`) across edits to the same component.
- Refs, context values in the updated subtree.

**When it resets state (full remount):**
- The component's key changes.
- A new component is added above it in the tree.
- The file exports a non-component (hook, util) mixed with component exports — Fast Refresh can't determine what to hot-swap safely.
- An error was thrown — after fixing the error, state resets to avoid stale corrupt state.

**How it works internally:**
- Babel/SWC plugin instruments every component with a `$$typeof` registration.
- The Fast Refresh runtime tracks component identity by source location (file + export name).
- On update: existing component instances are re-rendered with the new implementation but old state.

---

## Full Reload vs. Hot Update

The HMR runtime decides which to do based on the **dependency bubble**:

1. Start at the changed module.
2. Walk up the import graph through accepting modules (`module.hot.accept` / `import.meta.hot.accept`).
3. If an accepting boundary is found before reaching the root → **hot update** that subtree.
4. If no boundary found before the root (e.g., a utility used everywhere with no accept) → **full reload**.

Common full-reload triggers:
- Changes to global CSS files (unless CSS HMR is configured).
- Changes to `next.config.js`, `vite.config.ts`, or env files.
- Changes to a module that doesn't participate in HMR (no `accept` call in the chain).
- Syntax errors in any module.

---

## Interview Q&A

**Q: What protocol does HMR use and why?**
WebSocket (or SSE as fallback). WS allows the server to push update notifications instantly rather than the browser polling. The actual module code is fetched over HTTP after the WS notification.

**Q: Can HMR work behind a reverse proxy (Nginx, ngrok)?**
Only if the proxy is configured to pass WebSocket upgrade headers. Without this, the `Upgrade: websocket` header is stripped and the WS handshake fails. Fix: `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";` in Nginx config. Vite's SSE fallback also requires `proxy_buffering off`.

**Q: Why does Fast Refresh sometimes reset state even on a small change?**
If the component file exports both a component and a non-component value (constant, type, hook), Fast Refresh marks the file as "non-pure" and remounts instead of hot-swapping. Separating concerns (components in one file, utils in another) keeps HMR granular.

**Q: What is the difference between HMR in webpack vs. Vite for large projects?**
Webpack re-bundles the changed chunk even in dev mode — startup and update times grow with project size. Vite never bundles in dev; it sends individual module files and only reprocesses the changed module + its direct importers. Result: Vite HMR update time is nearly constant (sub-50ms) regardless of project size, while webpack HMR slows with scale.

**Q: How does HMR handle CSS changes?**
CSS HMR doesn't require JS module replacement — it just swaps the `<style>` or `<link>` tag in the DOM. For CSS-in-JS (styled-components, emotion), the CSS is embedded in JS modules and goes through the normal JS HMR path. For Tailwind/PostCSS in Vite, the compiled CSS is a virtual module that is hot-swapped without a reload.

**Q: What happens to WebSocket connections in the app when HMR fires?**
HMR replaces JS modules but does not reload the page, so existing WebSocket connections opened by app code stay alive. This is one of HMR's key benefits for real-time app development — you can edit UI code without reconnecting to your own WS server or losing subscription state.

---

## Tricky Edge Cases

**Service workers block HMR**: If your app registers a SW that intercepts `fetch`, the HMR module fetches may be served from the SW cache. Ensure SW scope excludes the dev server's hot-update URLs, or disable the SW in dev mode.

**Cross-origin dev servers**: If your HTML is served from `:3000` but HMR WS connects to `:3001`, the browser blocks the WS due to CORS. Solution: configure the bundler's `hmr.host` / `devServer.client.webSocketURL` explicitly.

**Multiple tabs**: Each tab opens its own WS connection. All tabs receive the same HMR updates and hot-swap independently — good for testing multiple states simultaneously.

**TypeScript-only changes**: Changing only a `.d.ts` or type annotation may or may not trigger HMR depending on the bundler. Vite skips HMR for type-only changes in `.ts` files (detected by the TS transpiler). Webpack with ts-loader may still trigger a full recompile.
