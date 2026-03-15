# Distributed Systems — Deep Dive

## CAP Theorem

A distributed system can guarantee at most **2 of 3**:

```
        Consistency
            △
           / \
          /   \
         /     \
        /  CA   \
       /─────────\
      /     |     \
     /  CP  |  AP  \
    ▽───────┼───────▽
 Availability   Partition
               Tolerance
```

- **Consistency (C):** Every read receives the most recent write (or an error)
- **Availability (A):** Every request receives a response (not necessarily most recent data)
- **Partition Tolerance (P):** System continues operating when network partitions occur

**The key insight:** Network partitions are unavoidable in distributed systems. So the real trade-off is **C vs A during a partition.**

### Real-world Database Classifications

| System | Type | Trade-off |
|--------|------|-----------|
| PostgreSQL (single node) | CA | No partition tolerance |
| Cassandra | AP | Eventually consistent, always available |
| DynamoDB | AP | Eventually consistent (strong consistency optional) |
| MongoDB | CP | Consistent, may reject writes during partition |
| HBase | CP | Consistent, may be unavailable during partition |
| CockroachDB | CP | Consistent (uses Raft) |
| Redis Cluster | AP (default) | Eventually consistent during partition |

### Example: AP vs CP during network partition

```
Node A ←──── partition ────→ Node B

AP (Cassandra):
  Write to A succeeds → A and B diverge temporarily
  Reads from B return stale data
  Partition heals → eventual consistency (CRDT/LWW)

CP (MongoDB):
  Write requires majority quorum
  If B is majority, writes to A fail (error returned)
  System unavailable on A's side, but data consistent
```

---

## PACELC Theorem

Extends CAP: even when no partition, there's a latency vs consistency trade-off.

```
If Partition: C vs A
Else (normal): L vs C
```

| System | P | EL | EC |
|--------|---|----|----|
| DynamoDB | AP | EL | EC |
| Cassandra | AP | EL | EC |
| CockroachDB | CP | EL | EC |
| MongoDB | CP | EL | EC |
| BigTable | CP | EL | EC |

---

## Consistency Models

From strongest to weakest:

```
Linearizability (Strict)
  └─ Operations appear instantaneous, globally ordered
  └─ Reads always see the latest write
  └─ Cost: high latency (needs coordination)

Sequential Consistency
  └─ Operations appear in some sequential order
  └─ Each process sees operations in its own order
  └─ Different processes may see different orderings

Causal Consistency
  └─ Causally related operations seen in order
  └─ Concurrent (unrelated) operations may be seen differently

Read-your-writes Consistency
  └─ After a write, same client always reads that write
  └─ Others may still see stale data

Eventual Consistency
  └─ All replicas converge if no new writes
  └─ No guarantee on when or ordering
  └─ Cost: lowest latency
```

### Linearizability in practice
```
Timeline:
Client A: ──write(x=1)──────────────────
Client B: ────────────read(x)───────────
Client C: ──────────────────────read(x)─

Linearizable: B might read 0 or 1 (depends on timing)
              C MUST read 1 (write completed before C's read)

Non-linearizable: C reads 0 (stale) — violates guarantee
```

---

## Consensus Algorithms

### Why Consensus is Hard

In an asynchronous distributed system, even with 1 faulty node, it's **impossible** to guarantee consensus (FLP impossibility theorem, 1985).

In practice: algorithms use timeouts/leases to work around this.

### Paxos

The original consensus algorithm. Foundation for many systems.

**Roles:**
- **Proposers** — propose values
- **Acceptors** — vote on proposals
- **Learners** — learn the decided value

**Two phases:**

```
Phase 1 — Prepare:
Proposer → Acceptors: "Prepare(n)"   (n = proposal number)
Acceptors → Proposer: "Promise(n)" + highest accepted value (if any)

Phase 2 — Accept:
Proposer → Acceptors: "Accept(n, v)"  (v = chosen value)
Acceptors → Proposer: "Accepted(n, v)"

Learner learns value once majority has accepted.
```

**Problems with Paxos:**
- Underspecified (Lamport's paper was confusing)
- Multi-Paxos (for log replication) requires many extensions
- Leader election not defined

### Raft — Understandable Consensus

Designed to be more understandable than Paxos. Used by etcd, CockroachDB, TiKV.

**Key Concepts:**
- **Leader election** — one leader at a time
- **Log replication** — leader receives writes, replicates to followers
- **Safety** — never commits a different value at same log index

#### Leader Election

```
States:
  Follower → Candidate → Leader
    ↑                        |
    └────────────────────────┘ (heartbeat / step down)

Term: monotonically increasing epoch number
      (like a logical clock for leadership)

Timeout:
  Follower: random 150-300ms election timeout
  If no heartbeat → become Candidate
  Candidate: vote for self, request votes from all
  If majority votes → become Leader
  If another leader → revert to Follower
```

#### Log Replication

```
Client ──write("x=1")──→ Leader
                          │
             ┌────────────┼────────────┐
             ↓            ↓            ↓
          Follower1    Follower2    Follower3
             │            │            │
             └─────ACK────┴────ACK─────┘
                          │
                    majority ACKs
                          │
                    Leader commits
                    Leader replies to client
                    Leader sends commit to followers
```

**Log Entry:**
```
Index: 1  Term: 1  Command: x=1
Index: 2  Term: 1  Command: y=2
Index: 3  Term: 2  Command: x=3  ← needs majority before commit
```

#### Safety Properties
- Leader has all committed entries (never loses them)
- Election: candidate must have up-to-date log to win
- Only one leader per term

---

## Clock Synchronization

### The Problem

Clocks in distributed systems drift. NTP can sync to ~1-10ms accuracy but can go backward, jump, or be unreliable.

**Why it matters:**
- Event ordering across nodes
- Distributed tracing
- Conflict resolution in CRDTs
- Distributed transactions

### Lamport Timestamps

Logical clock that captures causal ordering.

**Rules:**
1. Before any event in process: increment clock
2. Before sending message: increment clock, attach timestamp
3. On receiving message: `clock = max(local, received) + 1`

```
Process A:     1────────2────────────5────────
                         \          ↑
                    send(ts=2)   receive
Process B:          1────────────3────────────
                                 (max(1,2)+1 = 3)
```

**Limitation:** Lamport timestamps can tell you A happened before B, but NOT that A and B are concurrent.

### Vector Clocks

One counter per process. Captures both causality AND concurrency.

```
3 processes: A, B, C
Vector clock: [A, B, C]

Process A:
  event1 → [1,0,0]
  send to B → [2,0,0] (attached to message)

Process B:
  event1 → [0,1,0]
  receive from A → [2,2,0] (max each component + 1 for receive)
  send to C → [2,3,0]

Process C:
  event1 → [0,0,1]
  receive from B → [2,3,2]
```

**Comparing vector clocks:**
```
VC(a) < VC(b) = a happened-before b
  ↔ all components of VC(a) ≤ VC(b)
     AND at least one component strictly <

VC(a) || VC(b) = concurrent
  ↔ neither VC(a) < VC(b) nor VC(b) < VC(a)

Example:
[1,2,0] vs [1,1,2]:
  [1,2,0] < [1,1,2]? No (2 > 1 in position B)
  [1,1,2] < [1,2,0]? No (2 > 0 in position C)
  → Concurrent!
```

**Used in:** DynamoDB, Riak, CRDTs for conflict detection.

### Hybrid Logical Clocks (HLC)

Combines physical clock with logical clock. Used in CockroachDB.

```
HLC = (physical_time, logical_counter)

Properties:
- HLC ≥ physical_time (never goes backward)
- Preserves happened-before like Lamport
- Close to physical time (within NTP skew)
```

---

## Distributed Transactions

### 2-Phase Commit (2PC)

```
Coordinator           Participant 1     Participant 2
     │                      │                 │
     │──── PREPARE ─────────►                 │
     │──── PREPARE ──────────────────────────►│
     │                      │                 │
     │◄─── VOTE YES ─────────                 │
     │◄─── VOTE YES ──────────────────────────│
     │                      │                 │
     │──── COMMIT ──────────►                 │
     │──── COMMIT ───────────────────────────►│
     │                      │                 │
     │◄─── ACK ──────────────                 │
     │◄─── ACK ───────────────────────────────│
```

**Problems with 2PC:**
- Coordinator is single point of failure
- Participants block while waiting for Phase 2
- If coordinator crashes after PREPARE but before COMMIT → participants stuck in "in-doubt" state

### Saga Pattern (for microservices)

Long-running transactions across services via compensating transactions.

```
Order Service      Payment Service     Inventory Service
     │                   │                    │
 Create Order        Charge Card          Reserve Item
     │                   │                    │
     │────────────────────────────────────────►
     │                   │                    │
     │◄─── Failure (item out of stock) ────────
     │                   │                    │
  Cancel Order      Refund Card              -
     │                   │                    │
  (compensate)       (compensate)
```

**Types:**
- **Choreography:** Services publish events, others react
- **Orchestration:** Central coordinator calls services in sequence

---

## Distributed Locking

### Redis Redlock

```js
// Simple Redis lock (single instance — not distributed)
async function withLock(redisClient, key, ttlMs, fn) {
  const lockValue = crypto.randomUUID();
  const acquired = await redisClient.set(
    `lock:${key}`, lockValue,
    'PX', ttlMs,  // expire after ttlMs
    'NX'          // only set if not exists
  );

  if (!acquired) throw new Error('Could not acquire lock');

  try {
    return await fn();
  } finally {
    // Release: only if we still own it (Lua script for atomicity)
    await redisClient.eval(`
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `, 1, `lock:${key}`, lockValue);
  }
}
```

**Redlock (N Redis nodes):**
1. Get current timestamp
2. Try to acquire lock on N/2+1 nodes (majority)
3. Lock is valid only if acquired majority within TTL/2
4. Release on all nodes when done

**Controversy (Martin Kleppmann):** Redlock has edge cases with clock skew. For true safety, use fencing tokens (monotonically increasing number) passed with the lock to the resource.

---

## Gossip Protocol

Used for cluster membership, failure detection (Cassandra, DynamoDB).

```
Node A ──gossip──► Node B (A's view)
Node B ──gossip──► Node C (merged view)
Node C ──gossip──► Node D
...
Every node knows about every other within O(log N) rounds
```

**Properties:**
- Epidemic/viral spread
- Eventually consistent
- Fault-tolerant (no single point of failure)
- O(log N) convergence

---

## Interview Questions

**Q: Explain CAP theorem. Which do you pick in practice?**
P (partition tolerance) is non-negotiable in distributed systems — networks fail. So the real choice is C vs A during a partition. For financial systems: choose CP (can't show stale balances). For shopping carts: choose AP (better to show stale cart than error). Most systems are tunable (DynamoDB eventual vs strong consistency).

**Q: What's the difference between Paxos and Raft?**
Both solve distributed consensus (replicated state machine). Raft was designed to be more understandable: clear leader election with randomized timeouts, explicit log replication. Paxos is more foundational but harder to implement correctly (Multi-Paxos needed for production). etcd, CockroachDB use Raft.

**Q: What are vector clocks used for?**
Vector clocks track causal relationships between events. They can determine if event A happened before B, or if they're concurrent. Used in conflict detection for multi-master databases (DynamoDB, Riak). If two writes are concurrent (no causal relationship), the database can apply a conflict resolution strategy (LWW, merge, ask user).

**Q: Why is 2PC a problem?**
Blocking protocol — participants lock resources until coordinator commits/aborts. If coordinator crashes after PREPARE, participants are stuck in-doubt until coordinator recovers. This creates availability problems. Alternatives: Saga pattern for eventual consistency across services, or use a database with distributed transactions (CockroachDB, Spanner).

**Q: What is a fencing token and why is it needed for distributed locks?**
A fencing token is a monotonically increasing number issued with each lock grant. The protected resource rejects requests with a lower token number than the highest seen. This prevents a client that held a lock but was paused (GC pause, network delay) from making writes after the lock expired and another client acquired it with a higher token.
