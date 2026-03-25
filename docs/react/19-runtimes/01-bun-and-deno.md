# Bun & Deno — Node.js Alternatives

## The Landscape

```
Node.js (2009) — Ryan Dahl — V8 + libuv
  │
  ├── Deno (2018) — Ryan Dahl (again) — V8 + Tokio (Rust)
  │   "10 things I regret about Node.js"
  │
  └── Bun (2022) — Jarred Sumner — JavaScriptCore + Zig
      "Node.js, but fast"
```

---

## Bun

### What is Bun?

A JavaScript runtime built with Zig, using Apple's **JavaScriptCore** (Safari's engine) instead of V8. Designed to be a drop-in Node.js replacement with much faster startup and I/O.

### Speed Claims (benchmarks as of 2024)

```
Startup time:
  Node.js: ~80ms
  Bun:     ~7ms   (~10x faster)

HTTP server (requests/sec):
  Node.js (http): ~130k req/s
  Bun (Bun.serve): ~250k req/s
  (numbers vary heavily by benchmark)

npm install (cold):
  npm:   ~30s
  bun:   ~3s    (~10x faster — parallel, binary lockfile)
```

### Bun's Built-in Tooling

One of Bun's core design goals is eliminating the toolchain tax — the requirement to install, configure, and maintain separate tools for package management (npm/yarn), TypeScript execution (ts-node/tsx), bundling (webpack/esbuild), and testing (Jest/Vitest). Bun ships all four capabilities as a single binary. This reduces project setup to a single `bun install` and means TypeScript runs natively without a separate compilation step or tsconfig for the runner.

Bun bundles: runtime + package manager + bundler + test runner.

```bash
# Package manager (replaces npm/yarn/pnpm)
bun install                     # reads package.json, installs deps
bun add react react-dom         # add dependency
bun remove lodash               # remove
bun update                      # update all

# Run scripts (replaces node/ts-node/tsx)
bun run server.ts               # runs TypeScript directly (no compile step)
bun run start                   # runs package.json script

# Bundler (replaces webpack/rollup/esbuild)
bun build ./src/index.ts --outdir ./dist --target browser
bun build ./src/server.ts --outdir ./dist --target bun

# Test runner (replaces Jest, mostly compatible)
bun test
bun test --watch
bun test --coverage
```

### Bun APIs

Bun exposes its own high-performance APIs alongside Node.js compatibility. `Bun.serve` uses JavaScriptCore's optimized HTTP implementation and is consistently faster than Node's `http` module in benchmarks. `Bun.file` returns a lazy `BunFile` object — the file content is not read until you call `.text()`, `.json()`, or `.arrayBuffer()`. The built-in SQLite (`bun:sqlite`) and password hashing APIs mean many projects can avoid external packages entirely for common backend tasks.

```typescript
// HTTP server — Bun.serve (fastest)
const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/users') {
      const users = await db.query('SELECT * FROM users');
      return Response.json(users);
    }

    return new Response('Not Found', { status: 404 });
  },
  error(err) {
    return new Response(`Error: ${err.message}`, { status: 500 });
  },
});

console.log(`Listening on http://localhost:${server.port}`);

// File I/O — Bun APIs
const text = await Bun.file('data.txt').text();
const json = await Bun.file('config.json').json();
await Bun.write('output.txt', 'Hello, World!');

// SQLite — built in (no npm package needed)
import { Database } from 'bun:sqlite';
const db = new Database('mydb.sqlite');
const users = db.query('SELECT * FROM users WHERE age > ?').all(18);

// Hashing (built in)
const hash = Bun.hash('hello world');
const password = await Bun.password.hash('secret123');
const valid = await Bun.password.verify('secret123', password);

// Environment
const port = Bun.env.PORT ?? '3000';
```

### Node.js Compatibility

A runtime is only as useful as the ecosystem it supports. Bun's primary adoption strategy is maximizing compatibility with existing Node.js code and npm packages — the vast majority of Node projects should run with a simple `bun install && bun run start` without any changes. The compatibility matrix below shows what is fully implemented, partially implemented, and still missing. Native addons (`.node` files compiled with node-gyp) are the largest compatibility gap because they are compiled against specific Node.js ABI versions.

Bun aims to be a drop-in replacement — supports most Node.js built-in modules:

```
✅ Supported:  fs, path, http, https, crypto, events, stream,
               buffer, os, url, util, zlib, child_process, cluster,
               worker_threads, net, dgram, readline, assert

⚠️ Partial:    tls, dns, v8 (missing some APIs)
❌ Not supported: vm (partial), trace_events, inspector
```

Most npm packages work with Bun. Known issues with packages that use native Node.js bindings.

### When to Use Bun

- **Scripts/tooling** — much faster than `node script.ts` or `ts-node`
- **CI/CD** — faster `bun install` saves meaningful time at scale
- **New projects** — if team is comfortable, full Bun stack is simpler
- **SQLite apps** — built-in SQLite is convenient
- **Hot path performance** — startup time matters (serverless, CLIs)

### When to Be Cautious

- Mature production systems — Node.js is battle-tested, Bun is not
- Packages relying on native addons (`.node` files) — may not work
- Edge cases in Node.js compat — some subtle differences exist
- Windows support — historically lagged Linux/macOS

---

## Deno

### What is Deno?

Deno was Ryan Dahl's "do-over" of Node.js, addressing his regrets:

1. No `package.json` — imports from URLs or JSR (originally)
2. **Secure by default** — no file/network/env access without explicit permission flags
3. TypeScript first-class — no `tsc` needed
4. Web-standard APIs (Fetch, Web Crypto, ReadableStream, etc.)
5. Ships as single executable

### Security Model

Deno's permission system implements the principle of least privilege at the runtime level. Every potentially dangerous operation (network access, file I/O, environment variable reads, subprocess spawning) is denied by default and must be explicitly granted via command-line flags. This makes it safe to run scripts from untrusted sources — a script you download and run with no flags literally cannot exfiltrate your environment variables or read your SSH keys even if it tries. Permissions can be scoped to specific hosts, paths, or variable names for production deployments.

```bash
# Deno requires explicit permission flags:
deno run app.ts                              # no permissions at all
deno run --allow-net app.ts                  # allow all network
deno run --allow-net=api.example.com app.ts  # allow specific host only
deno run --allow-read=/tmp app.ts            # read only /tmp
deno run --allow-env=PORT,DATABASE_URL app.ts  # specific env vars
deno run --allow-all app.ts                  # -A: everything (like Node)
```

### Deno APIs

Deno prioritizes Web Platform API compatibility: wherever a Web standard exists (`fetch`, `Request`, `Response`, `ReadableStream`, `Web Crypto`), Deno uses it rather than a Node-style alternative. This means Deno code is more portable to other environments (browsers, Cloudflare Workers) and is less likely to require platform-specific shims. `Deno.serve` is the modern high-level HTTP API; lower-level `Deno.listen` is available for custom protocols.

```typescript
// HTTP server (Deno.serve)
Deno.serve({ port: 8000 }, async (req) => {
  const url = new URL(req.url);

  if (url.pathname === '/health') {
    return Response.json({ status: 'ok' });
  }

  return new Response('Not Found', { status: 404 });
});

// File I/O — Web Stream APIs
const file = await Deno.open('data.txt');
const content = await new Response(file.readable).text();

// Standard library (JSR)
import { join } from 'jsr:@std/path';
import { serve } from 'jsr:@std/http';

// Node.js compatibility (Deno 2)
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
```

### Deno 2 — The Big Change

Deno's original stance — no `package.json`, no `node_modules`, URL imports only — made it incompatible with the npm ecosystem and limited adoption. Deno 2 pragmatically reversed this, treating npm compatibility as a first-class requirement while keeping all of Deno's security and Web Platform API advantages. The result is that existing npm packages now work with Deno, making the security model and TypeScript-first experience accessible to teams without a full rewrite.

Deno 2 (released October 2024) made major pragmatic changes:
- `package.json` support — compatible with npm ecosystem
- `node_modules` support (optional)
- `npm:` specifier — `import express from 'npm:express'`
- `node:` specifier — `import fs from 'node:fs'`
- Much better Node.js compatibility

```typescript
// Deno 2 — works with npm packages
import express from 'npm:express';
import { z } from 'npm:zod';

const app = express();
app.get('/', (req, res) => res.json({ hello: 'world' }));
app.listen(3000);
```

### Deno KV — Built-in Database

Deno KV is a key-value store built into the Deno runtime itself — no external database connection needed. Locally it uses SQLite as the backing store; on Deno Deploy it is backed by FoundationDB with strong consistency and global replication. Keys are typed arrays (tuples) that support prefix scanning, making it easy to model hierarchical data. Atomic operations let you perform conditional writes without race conditions — the `check` operation fails the transaction if the key's `versionstamp` doesn't match, enabling optimistic concurrency control.

```typescript
const kv = await Deno.openKv();

// Set/get
await kv.set(['users', '123'], { name: 'Alice', email: 'a@example.com' });
const result = await kv.get(['users', '123']);
console.log(result.value); // { name: 'Alice', ... }

// Atomic transactions
await kv.atomic()
  .check({ key: ['users', '123'], versionstamp: null }) // only if not exists
  .set(['users', '123'], userData)
  .commit();

// List with prefix
for await (const entry of kv.list({ prefix: ['users'] })) {
  console.log(entry.key, entry.value);
}
```

On Deno Deploy, KV is globally replicated with strong consistency via FoundationDB.

### Deno Deploy — Edge Runtime

Deno Deploy is Cloudflare Workers' main competitor in the V8 isolate edge space. Code is deployed globally and runs close to users with near-zero cold starts. It is the natural production deployment target for Deno applications, with built-in KV, Queues, and Cron support. Unlike Cloudflare Workers, it has no artificial CPU time limits for paid plans and supports the full Deno 2 API surface including Node.js compatibility.

```typescript
// Runs at edge (worldwide) like Cloudflare Workers
// But with Deno APIs

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // geo is available on Deno Deploy
  const region = Deno.env.get('DENO_REGION') ?? 'unknown';

  return Response.json({
    message: 'Hello from the edge!',
    region,
    path: url.pathname,
  });
});
```

---

## Bun vs Deno vs Node.js — Comparison

| Feature | Node.js | Bun | Deno |
|---------|---------|-----|------|
| Engine | V8 | JavaScriptCore | V8 |
| Language | C++/JS | Zig | Rust |
| TypeScript | Via tsc/tsx | Native | Native |
| Package manager | npm/yarn/pnpm | Built-in (bun) | npm compat (Deno 2) |
| Security | None by default | None by default | Permission flags |
| Built-in bundler | No | Yes | Yes (deno compile) |
| Built-in test runner | Yes (node:test) | Yes (jest-compat) | Yes |
| SQLite built-in | No | Yes (bun:sqlite) | Yes (jsr:@std/data-structures) |
| HTTP performance | Good | Excellent | Good |
| Node.js compat | ✅ It IS Node | ✅ High | ✅ High (Deno 2) |
| npm packages | ✅ | ✅ | ✅ (npm: prefix) |
| Edge deployment | No | Bun Edge (beta) | Deno Deploy |
| Maturity | 15+ years | ~2 years | ~6 years |
| Production use | Widespread | Growing | Growing |

---

## When to Use Which

```
Node.js:
  ✓ Production systems requiring battle-tested stability
  ✓ Large teams with existing Node.js expertise
  ✓ Packages relying on native addons (node-gyp)
  ✓ Maximum npm ecosystem compatibility

Bun:
  ✓ Developer tooling, scripts, build pipelines
  ✓ New projects wanting simplicity (no separate bundler/test runner)
  ✓ Startup-time-sensitive workloads (Lambda cold starts, CLIs)
  ✓ SQLite-backed applications

Deno:
  ✓ Security-conscious environments (sandboxing matters)
  ✓ Deno Deploy for edge functions
  ✓ TypeScript-first new projects
  ✓ Teams that want Web Platform APIs (Fetch, Web Crypto built-in)
  ✓ Deno KV for simple globally-replicated state
```

---

## Interview Questions

**Q: What are the main differences between Bun and Node.js?**
Bun uses JavaScriptCore instead of V8, written in Zig, with built-in package manager, bundler, and test runner. Key advantages: ~10x faster startup, faster `bun install`, faster I/O. Key risks: less mature, some Node.js compat gaps (native addons), not yet battle-tested at scale. Most npm packages and Node.js code runs in Bun.

**Q: What was Ryan Dahl's main regret about Node.js that led to Deno?**
Multiple: (1) No security model — scripts have full system access by default. (2) `package.json`/`node_modules` complexity. (3) Not using Promises from the start (callback-based APIs). (4) `index.js` module resolution magic. Deno addressed these: secure by default (permission flags), first-class TypeScript, Web Platform APIs (Fetch), URL-based imports.

**Q: How does Deno's security model work?**
Programs run with no permissions by default — no file, network, or environment access. Permissions are granted explicitly via flags: `--allow-net`, `--allow-read`, `--allow-env`, etc. Can be scoped: `--allow-net=api.example.com` limits to one host. Useful for running untrusted scripts safely. In practice, most production apps use `--allow-all`, but the model is valuable for CI scripts, user-provided code execution.

**Q: Would you use Bun in production today?**
Depends on the use case. For internal tooling, build scripts, and developer experience: yes, the speed benefits are real and risks are low. For critical production API servers: I'd want the team to be comfortable with it and have validated all dependencies work correctly. Node.js has 15 years of production battle-testing. Bun is improving rapidly but is ~2 years old — the risk/reward tradeoff matters.
