# Node.js Senior Engineer Interview Prep

A comprehensive, structured interview preparation guide covering JavaScript, Node.js, TypeScript, databases, system design, and everything else you need to ace a senior Node.js engineering interview.

---

## How to Use This Guide

Each topic has its own folder with multiple markdown files. Topics are organized from foundational to advanced. The **Tricky Questions** file in each section is the most important for interviews — study those last once you understand the concepts.

**Recommended study order:**
1. JavaScript Fundamentals (if rusty)
2. Node.js Core (your primary domain)
3. TypeScript (increasingly expected)
4. Databases — SQL is heavily tested
5. System Design (for senior roles)
6. API Design + Auth
7. Security, Testing, DevOps (supporting knowledge)
8. Interview Practice — rapid-fire Q&A to solidify

---

## Directory Structure

```
node-interview-prep/
├── 01-javascript-fundamentals/     ← JS foundations you must know cold
│   ├── 01-event-loop/
│   ├── 02-closures/
│   ├── 03-prototypes-and-inheritance/
│   ├── 04-this-keyword/
│   ├── 05-promises-async-await/
│   ├── 06-generators-and-iterators/
│   ├── 07-memory-and-garbage-collection/
│   │   ├── 01-memory-leaks.md
│   │   └── 02-gc-internals.md      (V8 GC, generational hypothesis, hidden classes)
│   └── 08-miscellaneous/
│
├── 02-nodejs-core/                 ← The core of Node.js interviews
│   ├── 01-architecture/            (V8, libuv, thread pool)
│   ├── 02-event-loop-nodejs/       (6 phases, nextTick vs setImmediate)
│   ├── 03-streams/                 (4 types, backpressure, pipeline)
│   ├── 04-buffers/                 (binary data, encodings, timing safety)
│   ├── 05-modules/                 (CJS vs ESM, caching, circular deps)
│   ├── 06-child-processes/         (exec/spawn/fork/execFile, shell injection)
│   ├── 07-worker-threads/          (CPU-bound work, SharedArrayBuffer, Atomics)
│   ├── 08-cluster/                 (multi-core, rolling restart, IPC, vs Workers)
│   └── 09-error-handling/          (operational vs programmer errors)
│
├── 03-typescript/                  ← Modern Node.js is TypeScript
│   ├── 01-type-system/             (structural typing, narrowing)
│   ├── 02-strict-mode/             (all 8 strict flags explained)
│   ├── 03-generics/                (constraints, infer, keyof)
│   ├── 04-utility-types/           (built-in + implementing from scratch)
│   ├── 05-advanced-patterns/       (mapped types, conditional, template literals)
│   ├── 06-tricky-questions/        (15 TypeScript output prediction questions)
│   └── 07-decorators/              (class/method/property/parameter + NestJS-style)
│
├── 04-async-patterns/              ← Beyond basic async/await
│   ├── 01-event-emitter/           (API, async gotchas, typed events, async iteration)
│   └── 02-concurrency/             (pLimit, Semaphore, batch, circuit breaker, Bull)
│
├── 05-performance/                 ← Making Node.js fast
│   └── 01-profiling/               (--prof, clinic.js, memory profiling)
│
├── 06-databases/                   ← Heavily tested in interviews
│   ├── 01-sql-fundamentals/        ← 35 tricky SQL questions!
│   │   ├── 01-joins-and-aggregations.md
│   │   ├── 02-window-functions.md  (ROW_NUMBER, RANK, LAG, running totals)
│   │   ├── 03-indexes-and-performance.md
│   │   ├── 04-transactions-and-acid.md
│   │   └── 05-tricky-sql-questions.md  ← Must read!
│   ├── 02-nosql/                   (MongoDB: embed vs ref, aggregation, transactions)
│   ├── 03-redis/                   (all data types, caching, distributed lock, rate limiting)
│   └── 04-orm/                     (Prisma N+1 fix, transactions, Sequelize)
│
├── 07-api-design/                  ← Building great APIs
│   ├── 01-rest/                    (principles, status codes, pagination, versioning)
│   ├── 02-graphql/                 (N+1 problem, DataLoader, Apollo Server setup)
│   ├── 03-websockets/              (ws library, Socket.io, Redis pub/sub scaling)
│   └── 04-auth/                    (JWT deep dive, OAuth2 + PKCE, refresh tokens)
│
├── 08-system-design/               ← Senior-level expected knowledge
│   ├── 01-hld/
│   │   ├── 01-fundamentals.md      (CAP, scaling, caching patterns, message queues)
│   │   └── 02-case-studies.md      (URL shortener, chat app, rate limiter, notifications)
│   ├── 02-lld/
│   │   ├── 01-solid-principles.md  (all 5 with TypeScript examples)
│   │   ├── 02-design-patterns.md   (Singleton, Factory, Builder, Adapter, Observer...)
│   │   └── 03-lru-cache-implementation.md  (O(1) HashMap + doubly linked list)
│   └── 03-sde3-senior-topics/
│       ├── 01-engineering-excellence.md  (consistency, microservices, observability, clean arch)
│       └── 02-production-engineering.md  (API optimization, DB HA, code review, memory leaks)
│
├── 09-devops/                      ← Deployment knowledge
│   ├── 01-docker/                  (multi-stage builds, health checks, SIGTERM fix)
│   ├── 02-process-management/      (PM2 ecosystem.config.js, zero-downtime, graceful shutdown)
│   ├── 03-kubernetes/              (Deployment, HPA, probes, rolling updates, Secrets)
│   └── 04-cicd/                    (GitHub Actions full pipeline, caching, secrets)
│
├── 10-testing/                     ← Quality engineering
│   └── 01-jest/                    (unit, integration, mocking strategies, fake timers)
│
├── 11-security/                    ← OWASP, Node security
│   └── 01-node-security/           (injection, XSS, helmet, rate limiting, prototype pollution)
│
└── 12-interview-practice/          ← Final preparation
    ├── 01-rapid-fire-qa/
    │   ├── 01-javascript-rapid-fire.md   (50 questions)
    │   └── 02-nodejs-rapid-fire.md       (50 questions)
    ├── 02-coding-challenges/
    │   ├── 01-common-algorithms.md       (Two Sum, LRU, debounce, Promise.all...)
    │   └── 02-advanced-challenges.md     (Observable, deque, middleware compose)
    ├── 03-behavioral/
    │   └── 01-star-questions.md          (STAR framework, story templates, questions to ask)
    └── 04-system-design-practice/
        └── 01-design-questions.md        (Job queue, rate limiter, cache, leaderboard, logging)
```

---

## Most Important Topics (Interview Frequency)

### JavaScript — Study These Cold

| Topic | Key Concept |
|-------|-------------|
| Event Loop | Microtask vs macrotask order, output prediction |
| Closures | Memory implications, loop gotcha with var |
| this keyword | 4 binding rules, arrow function lexical this |
| Promises | Promise.all vs allSettled vs race vs any |
| Async/await | Sequential vs parallel, error handling |
| Prototypes | `__proto__` vs `.prototype`, prototype chain lookup |

### Node.js — Your Domain

| Topic | Key Concept |
|-------|-------------|
| Event Loop Phases | timers → poll → check → nextTick priority |
| libuv Thread Pool | Default 4 threads, what goes in (fs, dns.lookup, crypto) |
| Streams | 4 types, backpressure, pipeline vs pipe |
| CommonJS vs ESM | module.exports vs exports gotcha, live bindings |
| Worker Threads | vs Child Processes, SharedArrayBuffer, Atomics |
| Error Handling | operational vs programmer errors, uncaughtException |

### TypeScript — Increasingly Required

| Topic | Key Concept |
|-------|-------------|
| Strict mode flags | All 8 flags, especially strictNullChecks |
| Type narrowing | Discriminated unions, type predicates |
| Generics | Constraints, infer, conditional types |
| Utility types | Implementing Partial/ReturnType from scratch |
| Mapped types | Key remapping, template literal types |

### SQL — Heavily Tested

| Topic | Key Concept |
|-------|-------------|
| NULL behavior | NULL = NULL → NULL (not TRUE), NOT IN trap |
| Window functions | RANK vs DENSE_RANK, Nth salary problem |
| Indexes | Left-prefix rule, when indexes don't help |
| Transactions | Isolation levels, SKIP LOCKED for queues |
| Joins | WHERE vs ON for filters with LEFT JOIN |

### System Design — Senior Level

| Topic | Key Concept |
|-------|-------------|
| CAP Theorem | CP vs AP choice, PACELC |
| SOLID | All 5 principles with real examples |
| Design Patterns | Observer, Factory, Strategy, Decorator |
| LRU Cache | O(1) HashMap + doubly linked list |
| Redis | Distributed lock (NX+PX+Lua), rate limiting |
| SDE3 Topics | Consistency models, saga pattern, observability, clean architecture |
| Production Eng | API optimization, DB HA/downtime, code review, memory leak investigation |

---

## Tricky Questions Files — Read These

These are the most interview-relevant files:

- [01-javascript-fundamentals/01-event-loop/05-tricky-questions.md](01-javascript-fundamentals/01-event-loop/05-tricky-questions.md)
- [01-javascript-fundamentals/02-closures/05-tricky-questions.md](01-javascript-fundamentals/02-closures/05-tricky-questions.md)
- [01-javascript-fundamentals/04-this-keyword/05-tricky-questions.md](01-javascript-fundamentals/04-this-keyword/05-tricky-questions.md)
- [01-javascript-fundamentals/05-promises-async-await/06-tricky-questions.md](01-javascript-fundamentals/05-promises-async-await/06-tricky-questions.md)
- [01-javascript-fundamentals/08-miscellaneous/06-tricky-questions.md](01-javascript-fundamentals/08-miscellaneous/06-tricky-questions.md)
- [02-nodejs-core/02-event-loop-nodejs/07-tricky-questions.md](02-nodejs-core/02-event-loop-nodejs/07-tricky-questions.md)
- [02-nodejs-core/05-modules/06-tricky-questions.md](02-nodejs-core/05-modules/06-tricky-questions.md)
- [02-nodejs-core/09-error-handling/06-tricky-questions.md](02-nodejs-core/09-error-handling/06-tricky-questions.md)
- [03-typescript/06-tricky-questions/01-typescript-tricky-questions.md](03-typescript/06-tricky-questions/01-typescript-tricky-questions.md)
- [06-databases/01-sql-fundamentals/05-tricky-sql-questions.md](06-databases/01-sql-fundamentals/05-tricky-sql-questions.md)
- [12-interview-practice/04-system-design-practice/01-design-questions.md](12-interview-practice/04-system-design-practice/01-design-questions.md)
- [12-interview-practice/03-behavioral/01-star-questions.md](12-interview-practice/03-behavioral/01-star-questions.md)

---

## 1-Week Study Schedule

| Day | Focus |
|-----|-------|
| **Day 1** | JS Event Loop, Closures, Prototypes (tricky questions) |
| **Day 2** | Promises, Async/Await, Generators + all async tricky questions |
| **Day 3** | Node.js core: architecture, event loop phases, streams, modules, child processes, cluster |
| **Day 4** | TypeScript: strict mode, generics, utility types, mapped types, decorators |
| **Day 5** | SQL: joins, window functions, indexes, 35 tricky questions + MongoDB + Redis |
| **Day 6** | System design: SOLID, design patterns, case studies, SDE3 topics |
| **Day 7** | 100 rapid-fire Q&A + coding challenges + system design practice + behavioral |

---

## Key Interview Patterns

### Output Prediction Questions
These show up constantly. Know:
1. Microtask vs macrotask order (Promise → nextTick → setImmediate)
2. Closure captures variable reference, not value
3. `this` in regular vs arrow functions
4. `var` hoisting vs `let`/`const` TDZ

### System Design Template
1. Clarify requirements (functional + non-functional)
2. Estimate scale (DAU, RPS, storage)
3. Core components + data flow
4. API design + database schema
5. Address bottlenecks (caching, sharding, CDN)
6. Failure handling + monitoring

### Coding Challenge Approach
1. Clarify edge cases first
2. State time/space complexity before coding
3. Start with brute force, then optimize
4. Talk through your thinking
5. Test with edge cases (empty, single, duplicates)

---

Good luck with the interview!
