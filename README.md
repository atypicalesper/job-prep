<div align="center">

# 🗺️ dev atlas

[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)](docs/javascript/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](docs/javascript/03-typescript/)
[![React](https://img.shields.io/badge/React-61DAFB?style=flat&logo=react&logoColor=black)](docs/react/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat&logo=next.js&logoColor=white)](docs/react/18-nextjs/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)](docs/node/)
[![Python](https://img.shields.io/badge/Python-3776AB?style=flat&logo=python&logoColor=white)](docs/python/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-336791?style=flat&logo=postgresql&logoColor=white)](docs/databases/)
[![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat&logo=redis&logoColor=white)](docs/databases/03-redis/)
[![AWS](https://img.shields.io/badge/AWS-232F3E?style=flat&logo=amazon-aws&logoColor=white)](docs/cloud/)
[![AI](https://img.shields.io/badge/AI%20%2F%20ML-FF6F00?style=flat&logo=openai&logoColor=white)](docs/ai/)

**285+ files · 10 domains · one place to actually understand the stack**

*Deep explanations, mental models, implementations, and the tricky questions that separate good engineers from great ones.*

</div>

---

## 🚀 Start here

| I want to... | Go here |
|---|---|
| Crack a JS interview | [JavaScript rapid fire](docs/engineering/12-interview-practice/01-rapid-fire-qa/01-javascript-rapid-fire.md) · [Node.js rapid fire](docs/engineering/12-interview-practice/01-rapid-fire-qa/02-nodejs-rapid-fire.md) |
| Understand React deeply | [Virtual DOM & reconciliation](docs/react/13-react/01-core-concepts/01-virtual-dom-and-reconciliation.md) · [Advanced patterns](docs/react/13-react/02-advanced-patterns/01-render-optimization.md) |
| Learn Next.js App Router | [App Router deep dive](docs/react/18-nextjs/01-app-router-deep-dive.md) · [Rendering strategies](docs/react/18-nextjs/02-rendering-strategies.md) |
| Master async JavaScript | [Event loop](docs/javascript/01-javascript-fundamentals/01-event-loop/01-what-is-event-loop.md) · [Promises internals](docs/javascript/01-javascript-fundamentals/05-promises-async-await/02-promises-internals.md) |
| Prep for system design | [HLD fundamentals](docs/engineering/08-system-design/01-hld/01-fundamentals.md) · [Design questions](docs/engineering/12-interview-practice/04-system-design-practice/01-design-questions.md) |
| Practice DSA | [Big tech roadmap](docs/engineering/14-dsa/00-big-tech-roadmap.md) · [Common algorithms](docs/engineering/14-dsa/01-common-algorithms.md) |
| Build AI systems | [AI roadmap](docs/ai/00-roadmap/01-ai-developer-roadmap.md) · [RAG deep dive](docs/ai/03-rag-and-vector-databases/04-advanced-rag-patterns.md) |
| Last day before interview | [Cheat sheet](docs/engineering/12-interview-practice/00-cheat-sheet/01-last-day-reference.md) · [All cheatsheets](docs/cheatsheets/) |
| Learn frontend fundamentals | [HTML & A11y](docs/react/00-frontend-fundamentals/01-html-semantics-accessibility.md) · [CSS](docs/react/00-frontend-fundamentals/02-css-fundamentals.md) · [DOM](docs/react/00-frontend-fundamentals/03-dom-and-events.md) |
| Learn backend fundamentals | [HTTP & REST](docs/node/00-backend-fundamentals/01-http-and-rest.md) · [Auth & Security](docs/node/00-backend-fundamentals/02-auth-and-security.md) · [Databases & Caching](docs/node/00-backend-fundamentals/03-databases-and-caching.md) |

---

## 🗂️ What's inside

```
dev-atlas/
├── 🧠 javascript        ← internals, closures, async, prototypes, TypeScript
├── ⚛️  react             ← frontend fundamentals, React 19, Next.js, browser internals
├── ⚙️  node              ← backend fundamentals, architecture, streams, API design
├── 🗄️  databases         ← SQL, NoSQL, Redis, ORM, scaling
├── 🏗️  engineering       ← system design, DSA, DevOps, testing, security, interview prep
├── 🤖 ai                ← RAG, agents, LangChain, MCP, production AI
├── 🐍 python            ← ML stack, FastAPI, asyncio, LLMs
├── ☁️  cloud             ← AWS, IaC, serverless
├── 📡 networks          ← TCP/IP, DNS, HTTP, real-time
└── 📋 cheatsheets       ← JS, React, Frontend, Backend, DSA, System Design
```

---

## 🧠 JavaScript

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
| [Miscellaneous](docs/javascript/01-javascript-fundamentals/08-miscellaneous/) | Hoisting · coercion & equality · symbols/proxy/reflect · destructuring · polyfills · debounce & throttle |
| [OOP](docs/javascript/01-javascript-fundamentals/09-oop/) | OOP patterns · design patterns |
| [Functional Programming](docs/javascript/01-javascript-fundamentals/10-functional-programming/) | Functional patterns · immutability |

</details>

<details>
<summary><strong>TypeScript</strong></summary>

| Topic | What's covered |
|---|---|
| [Type System](docs/javascript/03-typescript/01-type-system/) | Type system basics · type narrowing |
| [Generics](docs/javascript/03-typescript/03-generics/) | Generics basics |
| [Utility Types](docs/javascript/03-typescript/04-utility-types/) | Built-in utilities · implementing utility types |
| [Advanced Patterns](docs/javascript/03-typescript/05-advanced-patterns/) | Mapped & conditional types |
| [Decorators](docs/javascript/03-typescript/07-decorators/) | Decorators deep dive |
| [TypeScript + React](docs/javascript/03-typescript/11-typescript-react/) | TypeScript with React |

</details>

---

## ⚛️ React & Next.js

<details>
<summary><strong>Frontend Fundamentals</strong> 🆕</summary>

| Topic | What's covered |
|---|---|
| [HTML & Accessibility](docs/react/00-frontend-fundamentals/01-html-semantics-accessibility.md) | Semantic HTML · forms · ARIA · focus management · images |
| [CSS Fundamentals](docs/react/00-frontend-fundamentals/02-css-fundamentals.md) | Box model · flexbox · grid · cascade · custom properties · responsive |
| [DOM & Events](docs/react/00-frontend-fundamentals/03-dom-and-events.md) | Selecting · manipulating · event delegation · bubbling · observers |
| [Browser APIs](docs/react/00-frontend-fundamentals/04-browser-apis.md) | Fetch · storage · URL · clipboard · workers · IndexedDB · performance |
| [Rapid Fire Q&A](docs/react/00-frontend-fundamentals/05-rapid-fire.md) | 30+ frontend interview questions with concise answers |
| [Cheatsheet](docs/react/00-frontend-fundamentals/06-cheatsheet.md) | HTML/CSS/DOM/Events/APIs quick reference |

</details>

<details>
<summary><strong>React</strong></summary>

| Topic | What's covered |
|---|---|
| [Core Concepts](docs/react/13-react/01-core-concepts/) | Virtual DOM & reconciliation · lifecycle & hooks · state · events & forms |
| [Advanced Patterns](docs/react/13-react/02-advanced-patterns/) | Render optimization · custom hooks · Concurrent Mode & Suspense · React 19 |
| [State Management](docs/react/13-react/03-state-management/) | Redux Toolkit · Zustand & Jotai · TanStack Query |
| [Browser Internals](docs/react/15-browser-internals/) | How browsers work · V8 deep dive · web storage · web workers |
| [Frontend Performance](docs/react/17-frontend-perf/) | Core Web Vitals · bundle optimization |

</details>

<details>
<summary><strong>Next.js</strong></summary>

| Topic | What's covered |
|---|---|
| [App Router](docs/react/18-nextjs/01-app-router-deep-dive.md) | File-based routing · layouts · data fetching · caching · middleware · streaming |
| [Rendering Strategies](docs/react/18-nextjs/02-rendering-strategies.md) | SSG · ISR · SSR · PPR · Suspense & streaming |
| [Server Actions & Forms](docs/react/18-nextjs/03-server-actions-and-forms.md) | Server actions · Zod · useActionState · optimistic updates |
| [Authentication](docs/react/18-nextjs/04-authentication.md) | Auth.js · route protection · RBAC · cookies & sessions |
| [Performance & SEO](docs/react/18-nextjs/05-performance-and-seo.md) | Metadata API · image/font optimization · Core Web Vitals |

</details>

---

## ⚙️ Node.js

<details>
<summary><strong>Backend Fundamentals</strong> 🆕</summary>

| Topic | What's covered |
|---|---|
| [HTTP & REST](docs/node/00-backend-fundamentals/01-http-and-rest.md) | HTTP methods · status codes · headers · REST design · HTTP/2 vs 3 · caching · WebSockets vs SSE |
| [Auth & Security](docs/node/00-backend-fundamentals/02-auth-and-security.md) | Sessions · JWT · OAuth/OIDC · bcrypt · input validation · SQL injection · XSS · CORS · rate limiting · OWASP |
| [Databases & Caching](docs/node/00-backend-fundamentals/03-databases-and-caching.md) | SQL · indexing · transactions · ACID · NoSQL · Redis patterns · connection pooling |
| [Rapid Fire Q&A](docs/node/00-backend-fundamentals/04-rapid-fire.md) | 35+ backend interview questions with concise answers |
| [Cheatsheet](docs/node/00-backend-fundamentals/05-cheatsheet.md) | HTTP/REST/SQL/Redis/Express/Security quick reference |

</details>

<details>
<summary><strong>Node.js Core</strong></summary>

| Topic | What's covered |
|---|---|
| [Architecture](docs/node/02-nodejs-core/01-architecture/) | Node.js internals · V8 engine · libuv & thread pool |
| [Event Loop](docs/node/02-nodejs-core/02-event-loop-nodejs/) | Phases overview · order of execution · tricky questions |
| [Streams](docs/node/02-nodejs-core/03-streams/) | What are streams · backpressure · deep dive |
| [Worker Threads](docs/node/02-nodejs-core/07-worker-threads/) | Worker threads |
| [Error Handling](docs/node/02-nodejs-core/09-error-handling/) | Types of errors · tricky questions |
| [HTTP Internals](docs/node/02-nodejs-core/12-http-internals/) | HTTP agent & connections |
| [API Design](docs/node/07-api-design/) | REST · GraphQL · gRPC · WebSockets · JWT & OAuth |

</details>

---

## 🏗️ Engineering

<details>
<summary><strong>System Design</strong></summary>

| Topic | What's covered |
|---|---|
| [HLD](docs/engineering/08-system-design/01-hld/) | Fundamentals · URL shortener · chat · notifications · rate limiter · job queue · e-commerce |
| [LLD](docs/engineering/08-system-design/02-lld/) | SOLID · design patterns · LRU cache · rate limiter implementation |
| [Distributed Systems](docs/engineering/08-system-design/06-distributed-systems.md) | Distributed systems fundamentals |
| [Microservices](docs/engineering/08-system-design/04-microservices/) | Networking · concurrency models |
| [Event Sourcing](docs/engineering/08-system-design/05-event-sourcing/) | Event sourcing & CQRS |

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
| Monotonic Stack | [Monotonic stack](docs/engineering/14-dsa/10-monotonic-stack.md) |
| Linked Lists | [Linked list patterns](docs/engineering/14-dsa/11-linked-list-patterns.md) |
| Binary Search | [Binary search patterns](docs/engineering/14-dsa/12-binary-search-patterns.md) |

</details>

<details>
<summary><strong>Interview Practice</strong></summary>

| Topic | What's covered |
|---|---|
| [Cheat Sheet](docs/engineering/12-interview-practice/00-cheat-sheet/01-last-day-reference.md) | Last-day reference — everything in one page |
| [Rapid Fire Q&A](docs/engineering/12-interview-practice/01-rapid-fire-qa/) | JavaScript · Node.js · TypeScript · React |
| [Behavioral](docs/engineering/12-interview-practice/03-behavioral/) | STAR questions · SDE3 behavioral |
| [System Design Practice](docs/engineering/12-interview-practice/04-system-design-practice/) | Design questions · backend engineering Q&A |

</details>

---

## 📋 Cheatsheets

> Quick-reference sheets for last-minute revision — all in one place.

| Sheet | Topics |
|---|---|
| [JavaScript](docs/cheatsheets/01-javascript.md) | Types, arrays, objects, async, classes, generators, Map/Set |
| [React](docs/cheatsheets/02-react.md) | Hooks, patterns, performance, Context, Next.js App Router, TypeScript |
| [Frontend](docs/cheatsheets/03-frontend.md) | HTML, CSS, DOM, events, web APIs, accessibility |
| [Backend](docs/cheatsheets/04-backend.md) | HTTP, REST, JWT, bcrypt, SQL, Redis, Express, security |
| [DSA Patterns](docs/cheatsheets/05-dsa.md) | Arrays, linked lists, trees, graphs, DP, heap, all patterns |
| [System Design](docs/cheatsheets/06-system-design.md) | HLD framework, scale estimates, caching, databases, patterns |

---

## 🤖 AI Engineering

<details>
<summary><strong>45+ files</strong></summary>

| Topic | What's covered |
|---|---|
| [Fundamentals](docs/ai/01-ai-fundamentals/) | Overview · interview questions · deep dive |
| [Prompt Engineering](docs/ai/02-prompt-engineering/) | Overview · advanced patterns |
| [RAG & Vector DBs](docs/ai/03-rag-and-vector-databases/) | Overview · advanced RAG · embedding models |
| [LangChain & LangGraph](docs/ai/04-langchain-and-langgraph/) | Overview · advanced patterns |
| [Agentic AI](docs/ai/05-agentic-ai/) | Agents · memory systems |
| [MCP](docs/ai/07-mcp/) | Overview · interview questions |
| [AI in Production](docs/ai/08-ai-in-production/) | Observability · cost optimization |
| [Quick Reference](docs/ai/00-cheat-sheet/01-ai-quick-reference.md) | AI cheat sheet |

</details>

---

## 🐍 Python · ☁️ Cloud · 📡 Networks

<details>
<summary><strong>Python</strong></summary>

| Topic | What's covered |
|---|---|
| [Essentials](docs/python/01-python-essentials/) | Python for JS developers |
| [NumPy & Pandas](docs/python/02-numpy-and-pandas/) | NumPy · Pandas · visualisation |
| [PyTorch](docs/python/04-pytorch-basics/) | PyTorch deep learning |
| [Python for LLMs](docs/python/05-python-for-llms/) | OpenAI/Anthropic/HuggingFace SDKs |
| [FastAPI for AI](docs/python/06-fastapi-for-ai/) | FastAPI AI APIs |
| [Async Python](docs/python/07-async-python/) | asyncio for AI |

</details>

<details>
<summary><strong>Cloud & Networks</strong></summary>

| Topic | What's covered |
|---|---|
| [AWS Core](docs/cloud/01-aws-core-services.md) | Core services |
| [IaC & Serverless](docs/cloud/02-iac-and-serverless.md) | Terraform · CDK · Lambda |
| [OSI & TCP/IP](docs/networks/01-osi-and-tcp-ip-models.md) | OSI & TCP/IP models |
| [DNS & HTTP](docs/networks/04-dns-and-http.md) | Application layer |
| [Real-time](docs/networks/09-realtime-and-messaging.md) | WebSockets · SSE · messaging |

</details>

---

<div align="center">

[![Live site](https://img.shields.io/badge/Live%20Site-atypicalesper.github.io%2Fdev--atlas-4f46e5?style=flat)](https://atypicalesper.github.io/dev-atlas)
[![Contribute](https://img.shields.io/badge/Contribute-GitHub-181717?style=flat&logo=github)](https://github.com/atypicalesper/dev-atlas)

</div>
