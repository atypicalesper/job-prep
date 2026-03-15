# Monorepo Tooling — Turborepo, Nx, pnpm Workspaces

## What is a Monorepo?

A single git repository containing multiple packages/applications.

```
monorepo/
├── apps/
│   ├── web/           ← Next.js frontend
│   ├── api/           ← Express/Fastify backend
│   └── mobile/        ← React Native
├── packages/
│   ├── ui/            ← Shared component library
│   ├── config/        ← Shared ESLint/TS configs
│   ├── utils/         ← Shared utilities
│   └── types/         ← Shared TypeScript types
└── package.json       ← Workspace root
```

**Benefits:**
- Atomic commits across packages ("feat: add dark mode to ui + web")
- Shared code without npm publish ceremony
- Single CI/CD pipeline
- Easier refactoring across package boundaries
- Consistent tooling (one ESLint, one TypeScript config)

**Challenges:**
- Build everything on every change = slow
- Need tooling to know what changed and what to rebuild
- IDE performance with many packages

---

## pnpm Workspaces (Foundation Layer)

pnpm's workspace protocol is the most common base for monorepos.

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

```json
// packages/ui/package.json
{
  "name": "@myapp/ui",
  "version": "0.0.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  }
}
```

```json
// apps/web/package.json
{
  "name": "@myapp/web",
  "dependencies": {
    "@myapp/ui": "workspace:*",    // pnpm workspace protocol
    "@myapp/utils": "workspace:*"  // resolved locally, not from registry
  }
}
```

```bash
# Install (pnpm installs all workspace packages)
pnpm install

# Run script in specific package
pnpm --filter @myapp/web build

# Run script in all packages
pnpm --filter './packages/*' build

# Run in dependency order
pnpm -r build  # recursive, respects dependency graph
```

---

## Turborepo

Turborepo is a build system that adds **caching** and **parallel execution** on top of workspace scripts.

### The Problem Turborepo Solves

```
Without Turbo:
  You change one file in packages/ui
  → Full rebuild of ALL packages = 10 minutes

With Turbo:
  Hash all inputs (source files, env, deps)
  Cache outputs (build artifacts, test results)
  Replay cache on hit instead of rebuilding
  → Only rebuild what changed = 30 seconds

Remote cache (Vercel / self-hosted):
  CI rebuilds already computed on another dev's machine = ~0 seconds
```

### Setup

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],  // ^ = run deps' build first
      "outputs": ["dist/**", ".next/**"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": [],
      "cache": true,
      "inputs": ["src/**/*.ts", "test/**/*.ts"]
    },
    "lint": {
      "outputs": [],
      "cache": true
    },
    "dev": {
      "cache": false,         // never cache dev
      "persistent": true      // long-running process
    },
    "typecheck": {
      "dependsOn": ["^typecheck"],
      "outputs": []
    }
  }
}
```

```json
// root package.json
{
  "scripts": {
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "dev": "turbo dev",
    "typecheck": "turbo typecheck"
  },
  "devDependencies": {
    "turbo": "^2.0.0"
  }
}
```

```bash
# Build — runs in parallel, caches results
turbo build

# Build only what web and its deps need
turbo build --filter=@myapp/web

# Build everything that changed since main
turbo build --filter='[origin/main]'

# Force rebuild (ignore cache)
turbo build --force

# Show what would run
turbo build --dry-run
```

### Dependency Graph

```
apps/web    ─── depends on ──→  packages/ui
apps/api    ─── depends on ──→  packages/utils
packages/ui ─── depends on ──→  packages/config

turbo build order:
  1. packages/config  (no deps)
  2. packages/ui, packages/utils  (parallel, both depend on config)
  3. apps/web, apps/api  (parallel, deps are built)
```

### Remote Caching

```bash
# Authenticate with Vercel (free for personal use)
turbo link

# Or self-hosted cache server
# turbo.json:
{
  "remoteCache": {
    "enabled": true
  }
}

# CI: set TURBO_TOKEN and TURBO_TEAM env vars
# Cache is shared across all developers and CI runs
```

---

## Nx

Nx is a more opinionated and feature-rich build system. Popular in enterprise/Angular ecosystems, but works for any JS/TS project.

### Nx vs Turborepo

| Feature | Turborepo | Nx |
|---------|-----------|-----|
| Learning curve | Low | Medium |
| Configuration | Minimal | More options |
| Code generation | Via scripts | Built-in generators |
| Plugins | Few | Many (React, Next, Node, etc.) |
| Affected detection | Basic | Advanced (more granular) |
| Cache | Hashes inputs | Hashes inputs |
| Remote cache | Vercel/self-hosted | Nx Cloud/self-hosted |
| Visualization | Dashboard | `nx graph` |
| Languages | JS/TS only | JS, Java, Go, etc. |

### Key Nx Concepts

```bash
# Initialize in existing monorepo
npx nx@latest init

# Generate a new app
nx g @nx/next:app web
nx g @nx/node:app api

# Generate a shared library
nx g @nx/react:library ui --directory=packages/ui

# Run target
nx build web
nx test ui
nx lint api

# Run only what's affected by changed files
nx affected:build --base=main
nx affected:test --base=main

# Visualize dependency graph
nx graph
```

```json
// project.json (per package — instead of turbo.json tasks)
{
  "name": "web",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "targets": {
    "build": {
      "executor": "@nx/next:build",
      "options": { "outputPath": "dist/apps/web" },
      "cache": true,
      "inputs": ["production", "^production"],
      "outputs": ["{options.outputPath}"]
    },
    "test": {
      "executor": "@nx/jest:jest",
      "cache": true,
      "inputs": ["default", "^production", "{workspaceRoot}/jest.config.ts"]
    }
  }
}
```

---

## Shared Configs Pattern

```
packages/
  config/
    eslint-config/      ← shared ESLint config
    tsconfig/           ← base tsconfigs
    jest-config/        ← shared jest setup
```

```json
// packages/config/tsconfig/base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  }
}
```

```json
// apps/api/tsconfig.json
{
  "extends": "@myapp/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

```js
// packages/config/eslint-config/index.js
module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  rules: {
    'no-console': 'warn',
    '@typescript-eslint/no-explicit-any': 'error',
  },
};
```

```json
// apps/api/.eslintrc.json
{
  "extends": ["@myapp/eslint-config"],
  "rules": {
    "no-console": "off"  // override for server logs
  }
}
```

---

## Changesets — Versioning Packages

For libraries you publish to npm from a monorepo:

```bash
# Record a change
npx changeset add
# → prompts: which packages changed? what kind of change? changelog text

# Created: .changeset/blue-foxes-fly.md
# ---
# "@myapp/ui": minor
# ---
# Add Button variant prop

# Bump versions and update CHANGELOG
npx changeset version

# Publish to npm
npx changeset publish
```

---

## Interview Questions

**Q: Why would you use a monorepo?**
To share code between packages without the overhead of publishing to npm, enable atomic commits across package boundaries, ensure consistent tooling, and simplify refactoring. Particularly valuable when you have a UI component library used by multiple apps, or shared types between frontend and backend.

**Q: What does Turborepo actually do?**
Turborepo adds intelligent caching and parallel execution to workspace scripts. It hashes all inputs (source files, environment, dependencies) and caches outputs. On a cache hit, it replays the output instead of re-running. With remote caching, the entire team and CI share the same cache — if a colleague already built a package, your CI doesn't need to rebuild it.

**Q: What is the `^` in `"dependsOn": ["^build"]`?**
`^` means "run this task in all dependencies first." `"build": { "dependsOn": ["^build"] }` means: before building this package, build all packages it depends on. Without `^`, tasks run in any order regardless of dependency graph — which can cause build failures when a package tries to import from an unbuilt dependency.

**Q: What's the difference between Turborepo and Nx?**
Turborepo is simpler — minimal config, hash-based caching, good for most JS/TS monorepos. Nx is more powerful — built-in code generators, richer plugin ecosystem (first-class Next.js, NestJS, React Native support), more granular affected detection, and supports non-JS languages. Nx has a steeper learning curve but provides more structure. Most teams starting fresh use Turborepo; enterprise teams with diverse tech stacks often prefer Nx.
