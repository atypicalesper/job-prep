# dev-atlas

> **282 files · 12 domains · one place to actually understand the stack**

A deep, structured knowledge base for modern web engineers. Not cheat sheets — real explanations, mental models, implementations, and the tricky questions that separate good engineers from great ones.

---

## What's inside

```
dev-atlas/
├── JavaScript          ← internals, closures, async, prototypes, patterns
├── TypeScript          ← type system, generics, utility types, advanced patterns
├── React               ← reconciliation, hooks, state management, performance
├── Next.js             ← App Router, rendering, server actions, SEO, auth
├── Node.js             ← architecture, streams, worker threads, API design
├── Databases           ← SQL, NoSQL, Redis, ORM, scaling, design
├── Engineering         ← system design, DevOps, testing, security, DSA
├── AI Engineering      ← RAG, agents, LangChain, MCP, fine-tuning, evaluation
├── Python              ← ML stack, FastAPI, asyncio, LLMs
├── Networks            ← TCP/IP, DNS, HTTP, real-time, cloud networking
└── Cloud               ← AWS, IaC, serverless
```

---

## Start here

| I want to... | Go here |
|---|---|
| Crack a JS interview | [JavaScript rapid fire](docs/engineering/12-interview-practice/01-rapid-fire-qa/01-javascript-rapid-fire.md) · [Node.js rapid fire](docs/engineering/12-interview-practice/01-rapid-fire-qa/02-nodejs-rapid-fire.md) |
| Understand React deeply | [Virtual DOM & reconciliation](docs/react/13-react/01-core-concepts/01-virtual-dom-and-reconciliation.md) · [Advanced patterns](docs/react/13-react/02-advanced-patterns/01-render-optimization.md) |
| Learn Next.js App Router | [App Router deep dive](docs/react/18-nextjs/01-app-router-deep-dive.md) · [Rendering strategies](docs/react/18-nextjs/02-rendering-strategies.md) |
| Master async JavaScript | [Event loop](docs/javascript/01-javascript-fundamentals/01-event-loop/01-what-is-event-loop.md) · [Promises internals](docs/javascript/01-javascript-fundamentals/05-promises-async-await/02-promises-internals.md) |
| Prep for system design | [HLD fundamentals](docs/engineering/08-system-design/01-hld/01-fundamentals.md) · [Design questions](docs/engineering/12-interview-practice/04-system-design-practice/01-design-questions.md) |
| Practice DSA | [Big tech roadmap](docs/engineering/14-dsa/00-big-tech-roadmap.md) · [Common algorithms](docs/engineering/14-dsa/01-common-algorithms.md) |
| Build AI systems | [AI roadmap](docs/ai/00-roadmap/01-ai-developer-roadmap.md) · [RAG deep dive](docs/ai/03-rag-and-vector-databases/04-advanced-rag-patterns.md) |
| Last day before interview | [Cheat sheet](docs/engineering/12-interview-practice/00-cheat-sheet/01-last-day-reference.md) · [AI quick reference](docs/ai/00-cheat-sheet/01-ai-quick-reference.md) |

---

## JavaScript

<details>
<summary><strong>Core Fundamentals</strong></summary>

| Topic | What's covered |
|---|---|
| [Event Loop](docs/javascript/01-javascript-fundamentals/01-event-loop/) | What is the event loop · call stack & heap · microtasks vs macrotasks · setTimeout internals · tricky questions |
| [Closures](docs/javascript/01-javascript-fundamentals/02-closures/) | What is a closure · lexical scope · practical uses · loops gotcha · tricky questions |
| [Prototypes & Inheritance](docs/javascript/01-javascript-fundamentals/03-prototypes-and-inheritance/) | Prototype chain · class vs prototype · Object.create/assign · instanceof/typeof |
| [`this` Keyword](docs/javascript/01-javascript-fundamentals/04-this-keyword/) | What is this · implicit/explicit binding · arrow functions · call/apply/bind |
| [Promises & Async/Await](docs/javascript/01-javascript-fundamentals/05-promises-async-await/) | Callbacks · promise internals · Promise.all/race/any/allSettled · async/await deep dive · error handling |
| [Generators & Iterators](docs/javascript/01-javascript-fundamentals/06-generators-and-iterators/) | Iterator protocol · generators basics |
| [Memory & GC](docs/javascript/01-javascript-fundamentals/07-memory-and-garbage-collection/) | Garbage collection internals · memory leaks |
| [Miscellaneous](docs/javascript/01-javascript-fundamentals/08-miscellaneous/) | Hoisting · coercion & equality · symbols/proxy/reflect · destructuring · polyfills · [debounce & throttle](docs/javascript/01-javascript-fundamentals/08-miscellaneous/08-debounce-throttle.md) |
| [OOP](docs/javascript/01-javascript-fundamentals/09-oop/) | OOP patterns · design patterns |
| [Functional Programming](docs/javascript/01-javascript-fundamentals/10-functional-programming/) | Functional patterns · immutability |

</details>

<details>
<summary><strong>TypeScript</strong></summary>

| Topic | What's covered |
|---|---|
| [Type System](docs/javascript/03-typescript/01-type-system/) | Type system basics · type narrowing |
| [Strict Mode](docs/javascript/03-typescript/02-strict-mode/) | Strict mode overview |
| [Generics](docs/javascript/03-typescript/03-generics/) | Generics basics |
| [Utility Types](docs/javascript/03-typescript/04-utility-types/) | Built-in utilities · implementing utility types |
| [Advanced Patterns](docs/javascript/03-typescript/05-advanced-patterns/) | Mapped & conditional types |
| [Decorators](docs/javascript/03-typescript/07-decorators/) | Decorators deep dive |
| [Module Augmentation](docs/javascript/03-typescript/08-module-augmentation/) | Module augmentation patterns |
| [Modern Features](docs/javascript/03-typescript/09-modern-features/) | TypeScript 5.x |
| [OOP & Classes](docs/javascript/03-typescript/10-oop-and-classes/) | Classes and interfaces |
| [TypeScript + React](docs/javascript/03-typescript/11-typescript-react/) | TypeScript with React |
| [Config](docs/javascript/03-typescript/12-config/) | tsconfig deep dive |

</details>

<details>
<summary><strong>Async Patterns</strong></summary>

| Topic | What's covered |
|---|---|
| [EventEmitter](docs/javascript/04-async-patterns/01-event-emitter/) | EventEmitter deep dive |
| [Concurrency Control](docs/javascript/04-async-patterns/02-concurrency-control/) | p-limit · semaphore |
| [Async Iterators](docs/javascript/04-async-patterns/03-async-iterators/) | Async generators and iterators |
| [Kafka](docs/javascript/04-async-patterns/04-kafka/) | Kafka with KafkaJS |
| [RabbitMQ](docs/javascript/04-async-patterns/04-rabbitmq/) | RabbitMQ vs Kafka |
| [Concurrency Models](docs/javascript/16-concurrency-models/) | Concurrency comparison across runtimes |

</details>

---

## React & Next.js

<details>
<summary><strong>React</strong></summary>

| Topic | What's covered |
|---|---|
| [Core Concepts](docs/react/13-react/01-core-concepts/) | Virtual DOM & reconciliation · lifecycle & hooks · state · events & forms · tricky questions |
| [Advanced Patterns](docs/react/13-react/02-advanced-patterns/) | Render optimization · custom hooks · Concurrent Mode & Suspense · testing · React 19 |
| [State Management](docs/react/13-react/03-state-management/) | Redux Toolkit · Zustand & Jotai · TanStack Query |
| [Browser Internals](docs/react/15-browser-internals/) | How browsers work · V8 deep dive · web storage & cookies · web workers & service workers |
| [Frontend Performance](docs/react/17-frontend-perf/) | Core Web Vitals · bundle optimization |

</details>

<details>
<summary><strong>Next.js</strong></summary>

| Topic | What's covered |
|---|---|
| [App Router](docs/react/18-nextjs/01-app-router-deep-dive.md) | File-based routing · layouts · data fetching · caching · middleware · streaming |
| [Rendering Strategies](docs/react/18-nextjs/02-rendering-strategies.md) | SSG · ISR · SSR · PPR · Suspense & streaming |
| [Server Actions & Forms](docs/react/18-nextjs/03-server-actions-and-forms.md) | Server actions · Zod · useActionState · optimistic updates · security |
| [Authentication](docs/react/18-nextjs/04-authentication.md) | Auth.js / NextAuth · route protection · RBAC · cookies & sessions |
| [Performance & SEO](docs/react/18-nextjs/05-performance-and-seo.md) | Metadata API · image/font/script optimization · Core Web Vitals · bundle analysis |
| [SEO](docs/react/18-nextjs/08-seo.md) | Search engine mechanics · Open Graph · JSON-LD · robots & sitemaps |
| [Tailwind & Components](docs/react/18-nextjs/06-tailwind-and-components.md) | Design system · responsive layouts · component patterns · dark mode |
| [Architecture](docs/react/18-nextjs/07-architecture-patterns.md) | Feature-based structure · data layer · env vars · production checklist |

</details>

<details>
<summary><strong>Runtimes</strong></summary>

| Topic | What's covered |
|---|---|
| [Bun & Deno](docs/react/19-runtimes/01-bun-and-deno.md) | Comparison · use cases |
| [Edge Computing](docs/react/19-runtimes/02-edge-computing.md) | Edge runtime · use cases |

</details>

---

## Node.js

<details>
<summary><strong>Core</strong></summary>

| Topic | What's covered |
|---|---|
| [Architecture](docs/node/02-nodejs-core/01-architecture/) | Node.js internals · V8 engine · libuv & thread pool |
| [Event Loop](docs/node/02-nodejs-core/02-event-loop-nodejs/) | Phases overview · order of execution · tricky questions |
| [Streams](docs/node/02-nodejs-core/03-streams/) | What are streams · backpressure · tricky questions · deep dive |
| [Buffers](docs/node/02-nodejs-core/04-buffers/) | Buffers deep dive |
| [Modules](docs/node/02-nodejs-core/05-modules/) | CommonJS · CJS vs ESM · tricky questions |
| [Child Processes](docs/node/02-nodejs-core/06-child-processes/) | child_process module |
| [Worker Threads](docs/node/02-nodejs-core/07-worker-threads/) | Worker threads |
| [Cluster](docs/node/02-nodejs-core/08-cluster/) | Cluster module |
| [Error Handling](docs/node/02-nodejs-core/09-error-handling/) | Types of errors · tricky questions |
| [Async Context](docs/node/02-nodejs-core/10-async-context/) | AsyncLocalStorage |
| [Anti-Patterns](docs/node/02-nodejs-core/11-anti-patterns/) | Node.js anti-patterns |
| [HTTP Internals](docs/node/02-nodejs-core/12-http-internals/) | HTTP agent & connections |
| [File System](docs/node/02-nodejs-core/13-filesystem/) | fs deep dive |
| [Modern Node.js](docs/node/02-nodejs-core/14-nodejs-modern/) | Node.js v20/v22 features |

</details>

<details>
<summary><strong>Performance & API Design</strong></summary>

| Topic | What's covered |
|---|---|
| [Performance](docs/node/05-performance/) | Profiling · memory leaks · CPU optimization · caching · OpenTelemetry · error tracking |
| [REST](docs/node/07-api-design/01-rest/) | REST principles · API versioning |
| [GraphQL](docs/node/07-api-design/02-graphql/) | GraphQL & N+1 |
| [gRPC](docs/node/07-api-design/03-grpc/) | gRPC vs REST |
| [WebSockets](docs/node/07-api-design/03-websockets/) | WebSockets & scaling |
| [Auth](docs/node/07-api-design/04-auth/) | JWT & OAuth · stateless vs stateful |
| [Networking](docs/node/07-api-design/06-networking/) | HTTP internals · network fundamentals |
| [Frameworks](docs/node/07-api-design/07-frameworks/) | Express vs Fastify |

</details>

---

## Databases

<details>
<summary><strong>All topics</strong></summary>

| Topic | What's covered |
|---|---|
| [SQL](docs/databases/01-sql-fundamentals/) | Joins · window functions · indexes · transactions & ACID · tricky questions · PostgreSQL advanced |
| [NoSQL / MongoDB](docs/databases/02-nosql/) | MongoDB patterns · tricky questions |
| [Redis](docs/databases/03-redis/) | Fundamentals · advanced patterns |
| [ORM](docs/databases/04-orm/) | ORM patterns · N+1 problem |
| [Scaling](docs/databases/06-sharding-and-scaling.md) | Sharding & scaling |
| [Migrations](docs/databases/07-migrations-zero-downtime.md) | Zero downtime migrations |
| [Design](docs/databases/08-database-design.md) | Database design patterns |

</details>

---

## Engineering

<details>
<summary><strong>System Design</strong></summary>

| Topic | What's covered |
|---|---|
| [HLD](docs/engineering/08-system-design/hld/) | Fundamentals · URL shortener · chat · notifications · rate limiter · job queue · e-commerce |
| [LLD](docs/engineering/08-system-design/02-lld/) | SOLID · design patterns · LRU cache · rate limiter implementation |
| [Senior Topics](docs/engineering/08-system-design/03-sde3-senior-topics/) | Engineering excellence · production engineering |
| [Microservices](docs/engineering/08-system-design/04-microservices/) | Networking · concurrency models |
| [Event Sourcing](docs/engineering/08-system-design/05-event-sourcing/) | Event sourcing & CQRS |
| [Distributed Systems](docs/engineering/08-system-design/06-distributed-systems.md) | Distributed systems fundamentals |

</details>

<details>
<summary><strong>DevOps</strong></summary>

| Topic | What's covered |
|---|---|
| [Docker](docs/engineering/09-devops/01-docker/) | Docker for Node.js |
| [Process Management](docs/engineering/09-devops/02-process-management/) | PM2 & graceful shutdown |
| [Kubernetes](docs/engineering/09-devops/03-kubernetes/) | Kubernetes for Node.js |
| [CI/CD](docs/engineering/09-devops/04-cicd/) | GitHub Actions pipeline |
| [Serverless](docs/engineering/09-devops/05-serverless/) | Serverless & Lambda |
| [Feature Flags](docs/engineering/09-devops/06-feature-flags/) | Feature flags |
| [Monorepo](docs/engineering/09-devops/07-monorepo-tooling.md) | Monorepo tooling |

</details>

<details>
<summary><strong>Testing & Security</strong></summary>

| Topic | What's covered |
|---|---|
| [Unit Testing](docs/engineering/10-testing/01-jest/) | Jest fundamentals |
| [Integration Testing](docs/engineering/10-testing/02-integration/) | Testcontainers |
| [E2E Testing](docs/engineering/10-testing/03-e2e-testing/) | E2E patterns |
| [Node Security](docs/engineering/11-security/01-node-security/) | Security fundamentals · auth security |
| [Auth & OAuth](docs/engineering/11-security/02-auth-oauth-jwt.md) | JWT & OAuth deep dive |
| [Supply Chain](docs/engineering/11-security/03-supply-chain-and-secrets.md) | Secrets management |

</details>

<details>
<summary><strong>DSA — 17 pattern files</strong></summary>

| Pattern | File |
|---|---|
| Roadmap | [Big tech roadmap](docs/engineering/14-dsa/00-big-tech-roadmap.md) |
| Core | [Common algorithms](docs/engineering/14-dsa/01-common-algorithms.md) · [Advanced challenges](docs/engineering/14-dsa/02-advanced-challenges.md) |
| Two pointers | [Sliding window & two pointers](docs/engineering/14-dsa/03-sliding-window-and-two-pointers.md) |
| Trees & Graphs | [Trees & graphs](docs/engineering/14-dsa/04-trees-and-graphs.md) |
| DP | [Dynamic programming](docs/engineering/14-dsa/05-dynamic-programming.md) |
| Heaps | [Heaps & priority queue](docs/engineering/14-dsa/06-heaps-and-priority-queue.md) |
| Backtracking | [Backtracking](docs/engineering/14-dsa/07-backtracking.md) |
| Tries | [Tries](docs/engineering/14-dsa/08-tries.md) |
| Union Find | [Union Find](docs/engineering/14-dsa/09-union-find.md) |
| Monotonic Stack | [Monotonic stack](docs/engineering/14-dsa/10-monotonic-stack.md) |
| Linked Lists | [Linked list patterns](docs/engineering/14-dsa/11-linked-list-patterns.md) |
| Binary Search | [Binary search patterns](docs/engineering/14-dsa/12-binary-search-patterns.md) |
| Bit Manipulation | [Bit manipulation](docs/engineering/14-dsa/13-bit-manipulation.md) |
| Stacks & Queues | [Stacks & queues](docs/engineering/14-dsa/14-stacks-and-queues.md) |
| Sorting | [Sorting & searching](docs/engineering/14-dsa/15-sorting-and-searching.md) |
| Intervals | [Intervals](docs/engineering/14-dsa/16-intervals.md) |
| Strings & Arrays | [Strings & arrays](docs/engineering/14-dsa/17-strings-and-arrays.md) |

</details>

<details>
<summary><strong>Interview Practice</strong></summary>

| Topic | What's covered |
|---|---|
| [Cheat Sheet](docs/engineering/12-interview-practice/00-cheat-sheet/01-last-day-reference.md) | Last-day reference — everything in one page |
| [Rapid Fire Q&A](docs/engineering/12-interview-practice/01-rapid-fire-qa/) | JavaScript · Node.js · TypeScript · React |
| [Behavioral](docs/engineering/12-interview-practice/03-behavioral/) | STAR questions · SDE3 behavioral · technical war stories |
| [System Design Practice](docs/engineering/12-interview-practice/04-system-design-practice/) | Design questions · operational reliability · backend engineering Q&A |

</details>

---

## AI Engineering

<details>
<summary><strong>All topics — 45+ files</strong></summary>

| Topic | What's covered |
|---|---|
| [Fundamentals](docs/ai/01-ai-fundamentals/) | Overview · interview questions · tricky questions · deep dive |
| [Prompt Engineering](docs/ai/02-prompt-engineering/) | Overview · interview questions · tricky questions · advanced patterns |
| [RAG & Vector Databases](docs/ai/03-rag-and-vector-databases/) | Overview · advanced RAG · vector DB deep dive · embedding models · advanced retrieval |
| [LangChain & LangGraph](docs/ai/04-langchain-and-langgraph/) | Overview · interview questions · advanced patterns |
| [Agentic AI](docs/ai/05-agentic-ai/) | Overview · memory systems · browser & computer agents |
| [Workflow Automation](docs/ai/06-workflow-automation/) | n8n & Step Functions · Playwright advanced |
| [MCP](docs/ai/07-mcp/) | Overview · interview questions · tricky questions |
| [AI in Production](docs/ai/08-ai-in-production/) | LLM observability · cost optimization |
| [Fine-Tuning](docs/ai/09-fine-tuning/) | Overview · interview questions |
| [AI Evaluation](docs/ai/10-ai-evaluation/) | Overview · RAGAS & DeepEval |
| [Multimodal AI](docs/ai/11-multimodal-ai/) | Overview · interview questions |
| [AI Security](docs/ai/12-ai-security/) | Overview · interview questions |
| [Reasoning Models](docs/ai/13-reasoning-models/) | Reasoning models deep dive |
| [Local LLMs](docs/ai/14-local-llms/) | Ollama & local inference |
| [Quick Reference](docs/ai/00-cheat-sheet/01-ai-quick-reference.md) | AI cheat sheet |

</details>

---

## Python

<details>
<summary><strong>ML & AI stack</strong></summary>

| Topic | What's covered |
|---|---|
| [Essentials](docs/python/01-python-essentials/) | Python for JS developers |
| [NumPy & Pandas](docs/python/02-numpy-and-pandas/) | NumPy · Pandas · Matplotlib & Seaborn |
| [Scikit-Learn](docs/python/03-scikit-learn/) | ML with sklearn |
| [PyTorch](docs/python/04-pytorch-basics/) | PyTorch deep learning |
| [Python for LLMs](docs/python/05-python-for-llms/) | OpenAI/Anthropic/HuggingFace · structured outputs · prompt caching |
| [FastAPI for AI](docs/python/06-fastapi-for-ai/) | FastAPI AI APIs |
| [Async Python](docs/python/07-async-python/) | asyncio for AI |
| [Tooling](docs/python/09-python-tooling/) | Environment & testing · Docker for Python AI |

</details>

---

## Networks & Cloud

<details>
<summary><strong>Networks</strong></summary>

| Topic | What's covered |
|---|---|
| [OSI & TCP/IP](docs/networks/01-osi-and-tcp-ip-models.md) | OSI & TCP/IP models |
| [IP & Subnets](docs/networks/02-ip-addressing-and-subnets.md) | IP addressing & subnets |
| [TCP & UDP](docs/networks/03-tcp-udp-transport.md) | Transport layer |
| [DNS & HTTP](docs/networks/04-dns-and-http.md) | Application layer |
| [Routing](docs/networks/05-routing-nat-firewalls.md) | Routing · NAT · firewalls |
| [Cloud Networking](docs/networks/06-cloud-networking.md) | Cloud networking |
| [Real-time](docs/networks/09-realtime-and-messaging.md) | Real-time & messaging |

</details>

<details>
<summary><strong>Cloud</strong></summary>

| Topic | What's covered |
|---|---|
| [AWS Core](docs/cloud/01-aws-core-services.md) | Core services |
| [IaC & Serverless](docs/cloud/02-iac-and-serverless.md) | Infrastructure as code · serverless |
| [Interview Questions](docs/cloud/03-interview-questions.md) | Cloud interview questions |

</details>
