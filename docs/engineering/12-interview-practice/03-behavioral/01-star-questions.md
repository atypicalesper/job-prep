# Behavioral Interview Questions — STAR Method

Senior engineering roles test both technical and leadership skills. Use the **STAR** framework: **S**ituation, **T**ask, **A**ction, **R**esult.

---

## STAR Format

```
S — Situation: Set the context. What was the problem/challenge?
T — Task: What was YOUR responsibility specifically?
A — Action: What did YOU specifically do? (Not "we did")
R — Result: Quantifiable outcome. What improved?

Duration: 2-3 minutes per answer.
Use numbers: "reduced latency from 800ms to 120ms", "cut error rate from 5% to 0.1%"
```

---

## Technical Leadership Questions

### "Tell me about a time you improved system performance"

```
Template answer structure:

S: We had a checkout API endpoint that was timing out for 15% of users
   during peak traffic. P95 latency was 8 seconds.

T: I was tasked with investigating and fixing the performance issue
   without breaking existing functionality.

A:
1. Added structured logging with request timing around each operation
2. Discovered: DB query took 6.5s — fetching product inventory with N+1
3. Used EXPLAIN ANALYZE — no index on products.sku column (full table scan)
4. Added composite index on (sku, warehouse_id)
5. Changed ORM query to use eager loading (eliminated 50 extra queries)
6. Added Redis cache for product catalog (changes rarely, read heavily)
7. Deployed behind feature flag, gradual rollout, measured in prod

R:
- P95 latency: 8s → 120ms (98.5% improvement)
- Timeout rate: 15% → 0.02%
- DB CPU: 80% → 20%
- Freed up DB for other services
```

### "Describe a time you handled a production incident"

```
S: At 2 AM, PagerDuty fired — our payment service had 100% error rate,
   affecting all purchases. ~$50K/minute in lost revenue.

T: I was the on-call engineer and incident commander.

A:
1. Acknowledged alert, posted in #incidents channel
2. Checked dashboards: error rate spiked at 02:17 — correlated with deployment
3. Immediate rollback of the 02:15 deployment (mitigation in 8 minutes)
4. Error rate returned to normal — verified with metrics
5. Next morning: root cause analysis
   - New regex in email validation caused catastrophic backtracking on long inputs
   - Unit tests existed but didn't cover the edge case (very long email with no @)
   - CI/CD had no load testing step

6. Long-term fixes:
   - Added timeout for all regex operations (redos protection)
   - Added property-based testing for validation functions
   - Added basic load test to CI pipeline

R:
- Incident duration: 18 minutes
- Wrote blameless post-mortem shared with entire engineering team
- Zero recurrence of ReDoS issues (regex timeout layer added)
```

### "Tell me about a technical decision you disagreed with"

```
S: My team decided to rewrite our monolith into 15 microservices in 6 months.
   I disagreed with the scope and timeline.

T: I was a senior engineer with responsibility to raise concerns constructively.

A:
1. Instead of simply objecting, I wrote a document:
   "Trade-offs of Microservices Decomposition"
   - Listed real operational costs (distributed tracing, service discovery,
     network latency, eventual consistency, deploy complexity)
   - Proposed alternative: strangler fig — extract one service at a time
   - Included data: Netflix took 7 years, Shopify used modular monolith for years

2. Presented in architecture review — not emotional, facts-based

3. Compromise reached:
   - Extract 2 highest-value services first
   - Evaluate after 3 months
   - Keep rest as modular monolith in the interim

R:
- First two services extracted successfully in 6 weeks
- Team learned operational challenges (service discovery, tracing setup)
- Decision to NOT extract remaining services for another year
- Avoided likely 6-month delay if we'd tried to do all 15 at once
```

---

## Technical Depth Questions

### "How do you stay current with technology?"

```
Honest, concrete answer:
- Follow specific newsletters: Node.js Weekly, JavaScript Weekly, ByteByteGo
- Read release notes of tools I use: Node.js, TypeScript, Prisma changelogs
- GitHub: star repos I use, watch for breaking changes
- Hands-on: side projects where I try new tech without production risk
- Technical blogs: Dan Luu, Julia Evans, Brendan Gregg for systems content
- Conferences: JSConf, Node+JS Interactive talks on YouTube

What I DON'T do:
- Chase every framework hype (evaluating vs. adopting)
- Read everything — selective, focused on my domain
```

### "Describe your approach to debugging a hard bug"

```
Systematic process:
1. Reproduce reliably — if you can't reproduce it, you can't verify the fix
2. Bisect — git bisect or binary search in logs to find when it appeared
3. Form hypothesis — "I think X is causing Y because Z"
4. Gather evidence — logs, metrics, heap snapshot, packet capture
5. Isolate — minimum reproduction case, remove complexity
6. Fix — targeted, minimal change
7. Verify — does the fix resolve the reproduction case?
8. Prevent recurrence — test + documentation

Example tools:
- node --inspect + Chrome DevTools for async bugs
- process.hrtime for timing issues
- strace/dtrace for syscall-level issues
- git log --all -S 'keyword' to find when a variable was introduced
```

---

## People and Process Questions

### "Tell me about a time you mentored someone"

```
S: A junior engineer was struggling with async/await — their code had multiple
   uncaught promise rejection bugs going to production.

T: As their mentor, I needed to build their understanding durably, not just fix bugs.

A:
1. Instead of code review comments, did a 1:1 pairing session
2. Drew the Promise state machine on whiteboard — made it visual
3. Went through their code together, explaining each issue
4. Created a mental model: "every await needs either try/catch or .catch()"
5. Shared my error handling patterns (withRetry helper, etc.)
6. Set up automated lint rule (no-floating-promises) to catch future issues
7. Followed up 2 weeks later — reviewed their new PRs specifically for async

R:
- Their PRs had zero async bugs for the next 3 months
- They presented the async error handling patterns to the team
- The lint rule caught 15 issues across the codebase from other engineers too
```

### "How do you handle disagreements in code review?"

```
Principles:
1. Separate personal from technical — disagree with the approach, not the person
2. Provide rationale — "I prefer X because Y", not just "change this"
3. Ask questions before assuming — "Could you explain why you chose this approach?"
4. Acknowledge trade-offs — most decisions are trade-offs, not right/wrong
5. Escalate wisely — if blocking after 2 rounds, involve a third person or team lead
6. Accept disagreement — sometimes you implement it their way, document your concern, monitor

Things I never do in code review:
- Personal comments about the developer
- "This is terrible/awful/horrible" — describe the specific problem
- Blocking on personal style preferences
- Approving just to avoid conflict
```

---

## Questions to Ask the Interviewer

```
Technical depth:
- "How do you handle database migrations in production? Zero-downtime?"
- "What does your on-call rotation look like? How many incidents per month?"
- "What's the biggest technical challenge the team is facing right now?"
- "How do engineers decide when to take on tech debt vs. new features?"
- "What does a typical deployment process look like?"

Team and culture:
- "How do you measure and improve developer velocity?"
- "How are technical decisions made — consensus, lead, RFC process?"
- "What happened with the last major production incident?"
- "How do senior engineers spend their time — IC work vs. leadership?"
- "What does a successful first 3 months look like for this role?"

Growth:
- "What are the expectations for a senior engineer beyond coding?"
- "How do engineers progress to staff/principal level?"
- "Are there opportunities to lead technical initiatives?"
```

---

## Common Mistakes in Behavioral Interviews

```
❌ Saying "we" instead of "I" — they're evaluating YOU
❌ No numbers — "improved performance" vs "reduced p99 from 3s to 80ms"
❌ Too vague — describe what YOU specifically did, tools used, decisions made
❌ Negative about previous employers — always frame as "learning opportunities"
❌ No result — every story needs an outcome
❌ Over-long stories — 2-3 minutes max, then stop and see if they want more
❌ Choosing situations where you failed silently — show you raise concerns
❌ Only technical stories — include collaboration, influence, leadership
```
