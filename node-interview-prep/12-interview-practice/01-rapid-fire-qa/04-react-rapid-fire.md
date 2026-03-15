# React, Browser & System Design — Rapid Fire Q&A

## React Core

**Q: What is the virtual DOM?**
An in-memory representation of the real DOM. React diffs the new vDOM against the previous one (reconciliation) and applies only the minimal set of real DOM mutations. Avoids expensive direct DOM manipulation on every state change.

**Q: What triggers a re-render?**
`setState`, `useState` setter, `useReducer` dispatch, context value change (for consumers), parent re-render (unless memoized), `forceUpdate`. Props changes trigger re-render only because the parent re-rendered.

**Q: What is the difference between `useMemo` and `useCallback`?**
`useMemo` memoizes a computed **value** — runs the function once and returns the cached result until deps change. `useCallback` memoizes a **function reference** — useful when passing callbacks to memoized children to prevent unnecessary re-renders. `useCallback(fn, deps)` ≡ `useMemo(() => fn, deps)`.

**Q: When does `useEffect` run?**
After every render by default. With `[]` — once after mount. With `[deps]` — after mount + any time a dep changes. Cleanup function runs before the next effect run and on unmount.

**Q: What is the rules of hooks?**
Only call hooks at the top level (not inside conditions, loops, or nested functions). Only call from React function components or custom hooks. The `use()` hook in React 19 is the only exception — it can be called conditionally.

**Q: What is a custom hook?**
A function starting with `use` that calls other hooks. Extracts stateful logic without changing component hierarchy — unlike HOCs or render props. Can return anything.

**Q: Explain React reconciliation.**
When state changes, React creates a new vDOM tree and compares it with the previous (diffing). Same element type at same position → update. Different type → unmount old, mount new. Lists use `key` prop to identify elements — without key, React diffs by index (can cause state bugs on reorder).

**Q: What is `key` and why does it matter?**
A stable, unique identifier for list items. React uses it to match elements between renders. Without a stable key, reordering a list causes React to update wrong elements (wrong state, DOM mutations instead of moves). Never use array index as key for reorderable lists.

**Q: What is React.memo?**
HOC that memoizes a component — skips re-render if props are shallowly equal. Only prevents re-renders from parent re-renders, not from internal state/context changes. Useful for expensive components with stable props.

**Q: What is the Context API and when NOT to use it?**
Provides a way to pass data through the component tree without prop drilling. Every consumer re-renders when the context value changes. NOT good for high-frequency updates (every keypress, mouse move) — use Zustand/Redux for that. Good for: theme, auth, locale, feature flags.

**Q: What is React Fiber?**
The reconciler rewrite in React 16. Enables incremental rendering — breaks work into units, can pause/resume/abort. Foundation for Concurrent Mode, Suspense, transitions. Each fiber is a unit of work representing a component.

**Q: What is Concurrent Mode / concurrent features?**
React can work on multiple state updates simultaneously, interrupt non-urgent renders for urgent ones. Enabled via `createRoot`. Key features: `useTransition` (mark state update as non-urgent), `useDeferredValue` (defer expensive re-renders), `Suspense` (suspend while data loads), streaming SSR.

**Q: What does `startTransition` do?**
Marks a state update as non-urgent. React can interrupt the transition to handle urgent updates (user input). The transition's `isPending` is true until the render completes. Use for: search results, tab switching, list filtering — anything where a slightly delayed response is acceptable.

**Q: What is Suspense?**
A component that shows a fallback while children are "suspended" (waiting for data or lazy import). Works with `React.lazy` for code splitting, `use(promise)` for data, and framework-level data fetching (Next.js). Does NOT work with `useEffect` data fetching.

**Q: What is hydration?**
The process of attaching React event handlers to server-rendered HTML. React "hydrates" the static HTML by walking the DOM and the component tree, attaching event listeners without re-rendering. Mismatch between server and client HTML causes hydration errors.

---

## React Advanced

**Q: What is the difference between controlled and uncontrolled components?**
Controlled: form input value is driven by React state (`value={state}`, `onChange` updates state). Uncontrolled: form manages its own state, accessed via `ref`. Controlled = single source of truth, easier to validate. Uncontrolled = less re-renders, easier to integrate with non-React code.

**Q: How do you prevent stale closures in useEffect?**
Include all referenced variables in the deps array. Use `useRef` for mutable values you don't want to re-run the effect for. Use the functional form of setState `setCount(prev => prev + 1)` to avoid closing over state.

**Q: When would you use `useReducer` over `useState`?**
When state logic is complex (multiple sub-values, next state depends on previous), when multiple state transitions share logic, or when state transitions need to be testable in isolation. Also easier to extract to Context when multiple components need to dispatch actions.

**Q: What is prop drilling and how do you solve it?**
Passing props through many intermediate components that don't need them. Solutions: Context API (for global/semi-global state), component composition (pass the component itself instead of data), Zustand/Redux, or lifting the consumer higher.

**Q: What are React Server Components?**
Components that run exclusively on the server — zero client JS bundle impact, can access databases/files directly, cannot use hooks or event handlers. They return JSX that renders to HTML and RSC payload (not full re-render on client). Interspersed with Client Components (`'use client'`) for interactive parts.

**Q: What is `useOptimistic`?**
Shows the expected result of an async action immediately, before the server responds. If the action fails, the optimistic state reverts automatically. Pattern: `addOptimistic(newItem)` → dispatch action → on success real state replaces optimistic → on failure optimistic reverts.

---

## Browser & V8

**Q: What is the critical rendering path?**
DNS → TCP → TLS → HTTP → HTML parse → DOM → CSSOM → Render Tree → Layout → Paint → Composite. CSS and sync scripts are render-blocking. Optimizing means reducing time in each step: preload, eliminate blocking resources, optimize images.

**Q: What triggers a reflow vs repaint?**
Reflow (layout): geometry changes (width, height, margin, font-size, window resize, DOM insert/remove). Repaint: visual changes that don't affect geometry (color, background, visibility). Reflow always triggers repaint. Repaint does NOT trigger reflow.

**Q: What is layout thrashing?**
Alternating between reading layout properties (offsetWidth, getBoundingClientRect) and writing styles in a loop. Each read after a write forces the browser to do a synchronous layout. Fix: batch all reads, then all writes — or use `requestAnimationFrame`.

**Q: What CSS properties can be animated without triggering paint?**
`transform` (translate, rotate, scale) and `opacity`. These are handled by the compositor thread on the GPU — no layout, no paint. Everything else (width, height, top, color) triggers paint or layout.

**Q: What is a V8 hidden class?**
An internal structure tracking the "shape" of an object (property names and their offsets). Objects with the same properties in the same order share a hidden class, enabling O(1) property access via inline caches. Adding properties dynamically, deleting properties, or different initialization order creates new hidden classes and slows access.

**Q: What is a service worker?**
A script that runs in the background, intercepting network requests. Enables: offline support (cache fallback), background sync, push notifications. Installed separately from the page, has no DOM access, survives page close. Used in PWAs.

**Q: What is the difference between localStorage and sessionStorage?**
Both are ~5-10MB key-value stores per origin. `localStorage` persists until explicitly cleared. `sessionStorage` is cleared when the tab/window closes. Both are synchronous (block main thread for large reads) and not accessible in Service Workers.

**Q: What does `defer` vs `async` do on a script tag?**
Both download in parallel with HTML parsing. `defer`: executes after HTML is fully parsed, in order. `async`: executes immediately when downloaded, may interrupt parsing, out of order. Use `defer` for scripts that depend on DOM or each other. Use `async` for independent scripts (analytics).

---

## System Design Rapid Fire

**Q: What is a CDN and why use it?**
Content Delivery Network — geographically distributed servers that cache and serve static assets (images, JS, CSS, HTML) close to users. Reduces latency (nearby server), reduces origin load, absorbs traffic spikes. Examples: Cloudflare, AWS CloudFront, Fastly.

**Q: What is horizontal vs vertical scaling?**
Vertical: bigger machine (more CPU/RAM). Simple but has a ceiling. Horizontal: more machines. Nearly unlimited but requires load balancing and stateless design (no in-memory session state — use Redis).

**Q: What is a load balancer?**
Distributes incoming requests across multiple server instances. Algorithms: round-robin, least connections, IP hash (sticky sessions), weighted. Layer 4 (TCP) or Layer 7 (HTTP, can route based on headers/URL).

**Q: How do you make a service stateless?**
Move all state out of process memory: sessions → Redis, uploaded files → S3, DB connections → pooled. Stateless services can be horizontally scaled and killed/restarted freely.

**Q: What is an API gateway?**
A single entry point for clients. Handles: routing to microservices, auth/authz, rate limiting, SSL termination, request transformation, logging. Examples: Kong, AWS API Gateway, Nginx.

**Q: What is eventual consistency?**
A data model where replicas may be temporarily out of sync but will converge if no new updates are made. Prioritizes availability and partition tolerance (AP in CAP). Example: DNS, DynamoDB default, Cassandra. "You'll see the change within N seconds."

**Q: What is a message queue and when do you use it?**
Async communication between services. Producer sends message, consumer processes it independently. Use when: decoupling services, handling traffic spikes (queue absorbs load), fan-out (one event → many consumers), retryable background jobs. Examples: RabbitMQ, SQS, Kafka.

**Q: What is the difference between a queue and a pub/sub topic?**
Queue: one message → one consumer (competing consumers). Point-to-point, message deleted after consumption. Pub/sub: one message → all subscribers. Event broadcast, each subscriber gets a copy. Kafka is both (topics with consumer groups — queue within a group, broadcast across groups).

**Q: What is database denormalization and when do you use it?**
Intentionally adding redundant data to avoid joins. Trades write overhead/complexity for read performance. Use when: read-heavy tables need to be fast, joins are too expensive at scale, read model is completely different from write model (CQRS). Not for frequently-updated data (maintaining consistency becomes burden).

**Q: What is a circuit breaker?**
A pattern that stops calling a failing service. After N failures in a time window → "open" (reject requests immediately). After a timeout → "half-open" (let one request through). If it succeeds → "closed" (normal). Prevents cascade failures when a downstream service is down. Libraries: Cockatiel, opossum (Node.js).

**Q: What is idempotency and why does it matter for APIs?**
An operation is idempotent if calling it multiple times produces the same result as calling it once. GET, PUT, DELETE should be idempotent. POST typically isn't. Idempotency keys allow clients to safely retry failed requests without duplicate side effects (critical for payments, order creation).

**Q: What is a webhook vs polling?**
Polling: client periodically asks "any new data?" — simple but wastes requests when nothing changed. Webhook: server pushes notification to client URL when event occurs — efficient but requires client to have a public HTTPS endpoint and handle failures/retries. Webhooks need idempotency (server may retry).

**Q: What is the difference between SQL and NoSQL?**
SQL: structured schema, ACID transactions, relational (joins), great for complex queries, vertical scale mainly. NoSQL: flexible/no schema, various data models (document, key-value, column-family, graph), horizontal scale, eventual consistency usually, no joins. Not either/or — use both in one system based on use case.

**Q: What is N+1 query problem?**
Loading N items then making N additional queries for related data (one per item). Solution: eager loading (JOIN or `include` in ORMs), DataLoader (batches + deduplicates). Classic interview Q for GraphQL/ORM discussions.

**Q: How do you design an API rate limiter?**
Options: token bucket (tokens refill at rate R, burst up to N), leaky bucket (constant output rate), fixed window (count per minute, boundary spike issue), sliding window (most accurate, more memory). Store counts in Redis (atomic INCR + EXPIRE). For distributed rate limiting: Redis Lua scripts for atomicity.

**Q: What is blue-green deployment?**
Two identical production environments (blue = current, green = new). Deploy to green, run tests, flip traffic from blue to green (instant cutover). If issue: flip back to blue (instant rollback). Eliminates downtime. Requires 2x infrastructure during deploy.

**Q: What is a canary deployment?**
Route a small percentage (e.g., 1-5%) of traffic to the new version. Monitor error rates, latency, business metrics. Gradually increase percentage. Rollback by routing all traffic back. Lower risk than full deploy — real-user validation at small scale.
