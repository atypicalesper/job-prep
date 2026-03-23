# Technical War Stories — SDE3 Behavioral Examples

These are structured answers for the "tell me about a time you..." technical stories that SDE3 interviews rely on heavily. Each uses STAR format. Adapt them to your own real experiences — but these give you the structure and the level of technical depth expected.

---

## "Tell me about the hardest bug you ever debugged"

**Situation:**
We had a Node.js microservice processing payment webhooks. In production, roughly 1 in 500 webhook events was being silently dropped — no error logged, no retry, just lost. This caused real money to not reconcile.

**Task:**
Find the root cause without being able to reproduce it locally, and without downtime.

**Action:**
First I added structured logging with correlation IDs at every stage of the webhook pipeline. No luck reproducing for 2 days. Then I noticed the dropped events were clustered at specific times — always between 2:00-2:05 AM UTC. That pointed to a scheduled job.

Turned out we had a daily database vacuum job that briefly locked the `events` table. The webhook handler was using a transaction with `SELECT FOR UPDATE` on that table. When the lock wait exceeded the default 30-second timeout, pg was throwing `LockNotAvailable`, but we had a generic catch block that swallowed it and returned a 200 to Stripe — so Stripe never retried.

Fix was two-part: (1) the catch block now differentiates error types — lock errors return 503, not 200, so Stripe retries. (2) The vacuum job was moved to use `SKIP LOCKED` and was rescheduled to 4 AM.

**Result:**
Zero dropped events since. Added a reconciliation monitor that alerts if webhook event count and DB event count diverge by more than 0.01%.

**Key signals you're showing:**
- Systematic debugging approach (logging, correlation IDs, clustering)
- Deep knowledge of PostgreSQL (lock types, transaction behavior)
- Fixed the symptom AND the root cause
- Added monitoring so it can't happen silently again

---

## "Tell me about a time you improved performance significantly"

**Situation:**
Our main product feed API was taking 4-8 seconds to respond at peak hours, causing 15% of users to abandon. Product said "fix it or we lose the contract."

**Task:**
Get p99 under 500ms without a major rewrite.

**Action:**
Started with profiling — used `clinic.js` + `0x` flamegraphs in a load test environment mirroring production. Found three hotspots:

1. **N+1 query**: For each of 50 products in the feed, we were making an individual DB call to get the seller's trust score. 50 queries × 5ms = 250ms just for that.
   Fix: Single `SELECT ... WHERE seller_id IN (...)` query, then build a Map for O(1) lookup.

2. **No index on `created_at + status`**: The main feed query was doing a full table scan on 8M rows.
   Fix: `CREATE INDEX CONCURRENTLY idx_products_status_created ON products(status, created_at DESC)`. Added `EXPLAIN ANALYZE` to confirm it was used.

3. **Response serialization**: We were serializing the full Prisma model (70+ fields) then stripping in the controller. For 50 products × 70 fields, `JSON.stringify` was taking ~180ms.
   Fix: `select` only the 12 fields the client actually needed at the Prisma query level.

**Result:**
p50 went from 2.1s to 85ms. p99 went from 8s to 340ms. Zero application code changes — only query optimization and one index. The contract was renewed.

**Key signals:**
- Used real profiling tools, not guessing
- Addressed multiple independent bottlenecks
- Understood both DB and application-layer performance
- Measured before and after

---

## "Tell me about a time you had to make a difficult technical decision"

**Situation:**
We were building a new notifications system. The engineering lead was pushing for Kafka — "it scales to millions, future-proof." We had 50k users at the time, expected to reach 200k in 18 months.

**Task:**
Evaluate the proposal and make a recommendation with the team.

**Action:**
I wrote a technical decision document. I listed our actual requirements: ~5k notifications/min peak, at-least-once delivery, consumers needed to replay events (for a new mobile app being built). Then I mapped those requirements to what we'd need operationally.

Kafka would require: 3 brokers minimum for HA, ZooKeeper (or KRaft), a separate schema registry, engineering time to set up and monitor, and our team had zero Kafka experience. A managed option (Confluent Cloud) would cost ~$1500/month.

In contrast, a BullMQ queue backed by our existing Redis could handle >100k jobs/min, had native retry, dead letter queues, and replay. Total setup time: 2 days.

I presented both options with honest trade-offs. My recommendation: BullMQ now, with a documented migration path to Kafka if we hit 2M users. The lead initially pushed back — "we'll just have to redo this in 6 months." I acknowledged that risk but pointed out the rebuild would take 1 sprint then, vs the Kafka setup taking 3 sprints now, and we'd have real usage data to inform the design.

**Result:**
Team voted 4-1 for BullMQ. 18 months later, we're at 180k users, BullMQ is handling load fine. The Kafka discussion never came up again because we never hit the limit.

**Key signals:**
- Data-driven, not opinion-driven
- Considered operational complexity, not just technical
- Didn't just defer to seniority — presented a real case
- Right-sized the solution

---

## "Tell me about a time you dealt with a production incident"

**Situation:**
At 11 PM on a Friday, our primary PostgreSQL database ran out of disk space. Write operations started failing. API error rate spiked to 40%. On-call got paged.

**Task:**
Restore write availability ASAP, find root cause, prevent recurrence.

**Action:**
First thing: established an incident channel, added the team, posted status. Checked `df -h` — /var/lib/postgresql at 100%. Looked at `pg_database_size` — main DB only grew by 200MB this week. Something else ate the disk.

Found it: WAL (write-ahead log) files in `/var/lib/postgresql/14/main/pg_wal` had grown to 40GB. Root cause: a read replica had fallen 6 hours behind due to a network partition that morning, and PostgreSQL was keeping WAL files until the replica caught up.

Immediate fix: `ALTER SYSTEM SET wal_keep_size = '1GB'` + `SELECT pg_reload_conf()`. This told Postgres to stop keeping unlimited WAL for the lagging replica. Freed 35GB. Write operations restored within 3 minutes of diagnosis.

Then fixed the replica: it had a stuck replication slot. Dropped and recreated it: `SELECT pg_drop_replication_slot('replica1')` then re-initialized the replica from a base backup.

**Result:**
Full recovery in 22 minutes. Added a Datadog alert for WAL directory size >5GB and replication lag >30 minutes. Wrote a runbook. Two weeks later, the alert fired (another replica fell behind briefly) — was resolved in 4 minutes with the runbook.

**Key signals:**
- Structured incident response (communication first, then diagnosis)
- Deep PostgreSQL internals knowledge
- Addressed immediate symptom AND root cause
- Runbook + monitoring = never get paged for same issue twice

---

## "Tell me about a time you disagreed with your tech lead / manager"

**Situation:**
My tech lead decided we should rewrite our authentication service in Go "because it's faster." The existing Node.js service handled 500 req/s, had 4ms p99, and zero production issues in 2 years.

**Task:**
Evaluate the proposal professionally and voice my concerns without being dismissive.

**Action:**
I asked to understand the motivation. Turned out the lead had just come from a Go-heavy company and felt more productive in it — but the technical justification was thin. I didn't want to be the person who just says "no changes," so I ran a benchmark comparing the existing Node service against a prototype Go service I built in a weekend. The Go service was ~2x faster at the CPU level, but our bottleneck was actually database latency (avg 18ms), not Node.js overhead (avg 0.3ms). The rewrite would give us ~0.3ms back on a 18.3ms request.

I wrote it up: "The rewrite would take ~6 weeks, introduce Go to a team of 8 Node.js engineers (training cost), and yield a ~1.5% latency improvement. If we have 6 engineer-weeks to invest in auth, I'd propose: row-level caching with Redis (estimated 40% latency reduction) and adding refresh token rotation (a security gap we currently have)."

The lead appreciated the benchmarks and agreed to defer the rewrite. We shipped the caching improvement.

**Result:**
Auth latency dropped from 18ms to 10ms p99. No rewrite needed. Tech lead and I had a better working relationship after — he said "I appreciate you pushing back with data instead of just opinion."

**Key signals:**
- Did the work to validate (actual benchmark) before arguing
- Found a path that addressed the underlying goal differently
- Not "no" but "here's a better yes"
- Measured and proposed alternatives

---

## "Tell me about a time you mentored someone"

**Situation:**
A junior engineer on my team kept getting PRs rejected for the same issues — no error handling, missing edge cases, N+1 queries. The senior engineers were frustrated, and the junior was demoralized.

**Task:**
Help the junior improve without undermining their confidence or creating a dependency.

**Action:**
I set up a weekly 30-minute 1:1 specifically for code review discussion. Instead of just pointing out issues, I started asking "what happens if this function is called with null?" and letting them find it. I introduced them to the mental model of "happy path vs sad path" — write the happy path, then explicitly think about every input that breaks it.

I also gave them a specific list of things to check before every PR: (1) what happens if this DB call fails? (2) are there any N+1 queries in loops? (3) what's the worst input this function could receive? We called it "the checklist."

Three months in, their PRs were getting approved first-pass most of the time. I deliberately stepped back — stopped proactively asking if they needed help, and made them come to me.

**Result:**
Six months later they were reviewing other people's PRs effectively. In their quarterly review, their manager said it was the fastest growth they'd seen from a junior. One thing I learned: giving someone a mental model is 10× more effective than pointing out specific bugs. The checklist generalized to problems I'd never explicitly taught.

**Key signals:**
- Structured approach (not just "be helpful")
- Taught thinking process, not just answers
- Intentionally built independence, not dependency
- Self-reflection on what worked

---

## Common Prompts & What They're Really Asking

| Question | What they want to see |
|----------|----------------------|
| "Hardest bug" | Systematic debugging, depth of knowledge, patience |
| "Improved performance" | Measurement before/after, root cause vs symptom |
| "Difficult decision" | Data-driven, trade-off thinking, alignment |
| "Production incident" | Calm under pressure, communication, runbook culture |
| "Disagreed with lead" | Psychological safety, data > opinion, professionalism |
| "Mentored someone" | Teaching process not answers, building independence |
| "Failed / made a mistake" | Ownership, what you learned, what you changed |
| "Ambiguous requirement" | Clarifying questions, scoped delivery, stakeholder comm |

## Framework: The SDE3 Answer Checklist

For every behavioral answer, make sure you cover:

```
✓ Quantified impact (latency dropped X%, saved $Y, reduced time by Z%)
✓ Why it was technically hard (not just "it was complex")
✓ What you specifically did (not "we" for everything)
✓ What you'd do differently / what you learned
✓ How it influenced your team / process after
```

Numbers matter. "It was slow" → bad. "p99 went from 8s to 340ms" → SDE3.
