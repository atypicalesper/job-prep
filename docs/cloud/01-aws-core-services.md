# AWS Core Services

The fundamental building blocks of AWS — what every backend engineer needs to know for system design and interviews.

---

## IAM — Identity & Access Management

IAM controls WHO can do WHAT to WHICH resources.

```
Principal  →  Action  →  Resource
(who)         (what)     (which)
```

### Key Concepts

**Users** — long-term credentials for humans (avoid for apps — use roles).

**Groups** — collection of users sharing permissions. Assign policies to groups, not individual users.

**Roles** — temporary credentials assumed by AWS services, EC2 instances, Lambda functions, or external identities. No permanent credentials — rotated automatically.

**Policies** — JSON documents defining Allow/Deny rules.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::my-bucket/*"
    },
    {
      "Effect": "Deny",
      "Action": "s3:DeleteObject",
      "Resource": "*"
    }
  ]
}
```

**Policy types**: Identity-based (attached to user/role), Resource-based (attached to resource, e.g., S3 bucket policy), Permission boundaries (cap maximum permissions), SCPs (Service Control Policies — org-wide guardrails).

### Least Privilege

Start with zero permissions. Grant only what's needed. Audit with IAM Access Analyzer.

```bash
# Check what permissions a role has
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::123:role/MyRole \
  --action-names s3:DeleteObject
```

### Instance Profiles

Attach an IAM role to an EC2 instance or ECS task — code gets credentials automatically via instance metadata (no hardcoded keys).

```python
import boto3
# No credentials needed — picked up from instance role
s3 = boto3.client('s3')
s3.get_object(Bucket='my-bucket', Key='file.txt')
```

---

## EC2 — Elastic Compute Cloud

Virtual machines in the cloud.

### Instance Types

```
Family:  Purpose
t4g/t3   Burstable — dev/test, variable load
m6i/m7g  General purpose — balanced CPU/memory
c7g/c6i  Compute optimized — CPU-intensive (inference, transcoding)
r7g/r6i  Memory optimized — in-memory DBs, caches
p3/p4d   GPU instances — ML training
i3/i4i   Storage optimized — high IOPS (databases)
```

**Naming**: `m6i.xlarge` → family `m`, gen `6`, processor `i`ntel, size `xlarge`.

### Purchasing Options

| Option | Cost | Commitment | Use Case |
|---|---|---|---|
| On-Demand | 100% | None | Dev, unpredictable |
| Reserved (1–3yr) | ~40–60% off | 1–3 years | Steady baseline |
| Savings Plans | ~40–60% off | 1–3 years | Flexible reserved |
| Spot | ~70–90% off | None, can be interrupted | Batch, fault-tolerant |
| Dedicated Host | Premium | Optional | Licensing, compliance |

### Auto Scaling Groups (ASG)

Automatically add/remove instances based on demand.

```
Min: 2   Desired: 4   Max: 20
         ↑
  Scale-out policy: CPU > 70% for 2 min → add 2 instances
  Scale-in policy: CPU < 30% for 10 min → remove 1 instance
```

**Launch Templates** define what instances to launch (AMI, instance type, security groups, user data script).

**Lifecycle hooks**: pause instances during launch/termination for custom actions (warm-up, drain connections).

---

## S3 — Simple Storage Service

Object storage — infinitely scalable, durable (99.999999999%), cheap.

### Storage Classes

| Class | Use Case | Retrieval | Cost |
|---|---|---|---|
| Standard | Frequently accessed | Instant | High |
| Standard-IA | Infrequent, but instant | Instant | Medium |
| One Zone-IA | Non-critical infrequent | Instant | Lower |
| Glacier Instant | Archives, instant needed | Instant | Low |
| Glacier Flexible | Archives | 1–12 hours | Very low |
| Glacier Deep Archive | Long-term compliance | 12–48 hours | Cheapest |
| Intelligent-Tiering | Unknown access pattern | Instant | Auto-optimizes |

### Key Features

**Versioning** — keeps all versions of objects. Protection against overwrites/deletes.

**Lifecycle policies** — auto-transition or expire objects:
```json
{
  "Rules": [{
    "Status": "Enabled",
    "Transitions": [
      { "Days": 30, "StorageClass": "STANDARD_IA" },
      { "Days": 90, "StorageClass": "GLACIER" }
    ],
    "Expiration": { "Days": 365 }
  }]
}
```

**Pre-signed URLs** — temporary URLs for direct client uploads/downloads (bypass your server):
```python
url = s3.generate_presigned_url('get_object',
  Params={'Bucket': 'my-bucket', 'Key': 'file.pdf'},
  ExpiresIn=3600)  # 1 hour
```

**Event notifications** — trigger Lambda/SQS/SNS on object create/delete. Common pattern: file upload → Lambda for processing.

**S3 as static site host**: serve React/Next.js static builds directly from S3 + CloudFront.

---

## RDS — Relational Database Service

Managed SQL databases: PostgreSQL, MySQL, MariaDB, Oracle, SQL Server, Aurora.

### Key Features

- **Automated backups** — daily snapshots + transaction logs, point-in-time restore up to 35 days
- **Read replicas** — up to 15 replicas (Aurora), async replication, for read scaling
- **Multi-AZ deployment** — synchronous standby in another AZ, automatic failover (~30–60s)
- **Storage auto-scaling** — grows automatically when low on space
- **Parameter groups** — tune DB engine settings (e.g., `work_mem`, `max_connections`)

### Aurora

AWS-built, MySQL/PostgreSQL compatible. 5× faster than MySQL, 3× faster than PostgreSQL (per AWS benchmarks).

Key differentiators:
- Storage auto-scales to 128TB
- Up to 15 read replicas with < 10ms lag (vs seconds for standard RDS)
- Aurora Serverless v2 — scales compute from 0.5 to 128 ACUs
- Global Database — cross-region replicas with < 1s replication lag

```
             ┌── Read Replica (AZ-a)
Writer ───── ├── Read Replica (AZ-b)
(primary)    └── Read Replica (AZ-c)
             Shared distributed storage (6 copies across 3 AZs)
```

### RDS Proxy

Connection pooler between app and RDS. Handles connection bursts (Lambda → RDS common case), reduces failover time.

---

## Lambda — Serverless Functions

Run code without managing servers. Billed per invocation + duration.

### Execution Model

```
Invocation → Cold Start (if no warm container) → Execute → Return
                  ↑
         Download code, init runtime, run handler init (~100ms–5s)

Warm invocations reuse the container — no cold start
```

**Cold start reduction**:
- Use Provisioned Concurrency (pre-warm N containers)
- Keep packages small (smaller ZIP = faster init)
- Avoid heavy imports at module level — use lazy imports
- Use Graviton (arm64) — faster init, cheaper

### Limits

| Property | Limit |
|---|---|
| Max execution time | 15 minutes |
| Memory | 128MB–10GB |
| Ephemeral storage (/tmp) | 512MB–10GB |
| Payload (sync) | 6MB request/response |
| Payload (async) | 256KB |
| Concurrency (default) | 1000 per region |

### Event Sources

```
API Gateway/ALB  → HTTP request/response (sync)
SQS              → batch processing (async, retry on failure)
SNS              → fan-out notifications (async)
S3               → object events (async)
DynamoDB Streams → change data capture (async)
EventBridge      → scheduled (cron) or rule-based events
Kinesis          → real-time stream processing
```

### Lambda + SQS Pattern (Reliable Processing)

```
Producer → SQS Queue → Lambda (batch of 10) → Process
                ↓ (on failure)
            Dead Letter Queue → Alert
```

Configure `ReservedConcurrency` to prevent Lambda from overwhelming downstream services.

---

## SQS & SNS — Messaging

### SQS — Simple Queue Service

Decoupled message queue. Producers send, consumers poll.

**Standard queue**: at-least-once delivery, best-effort ordering, near-unlimited throughput.
**FIFO queue**: exactly-once, ordered, 3000 msg/s with batching.

Key settings:
- `VisibilityTimeout`: time message is hidden after consumer receives it (must finish processing before it expires, or re-delivered)
- `MessageRetentionPeriod`: 1 min–14 days
- `ReceiveMessageWaitTimeSeconds`: 0–20s (long polling — reduces empty receives)
- `DeadLetterQueue`: after N failed receives, move to DLQ

### SNS — Simple Notification Service

Pub/Sub fan-out. One message → multiple subscribers (SQS, Lambda, email, HTTP).

```
Order Placed (SNS topic)
  ├── SQS: Inventory Service
  ├── SQS: Email Service
  ├── Lambda: Analytics
  └── HTTP: Webhook
```

**SNS → SQS fan-out** is the standard pattern for decoupled microservices.

---

## ECS & EKS — Containers

### ECS — Elastic Container Service

AWS-native container orchestration. Simpler than Kubernetes.

```
Cluster
  └── Service (desired count: 3, task definition: v12)
        └── Task (container: api:v12, cpu: 512, mem: 1GB)
              └── Container
```

**Launch types**: EC2 (you manage instances) or **Fargate** (serverless containers — no EC2 to manage).

**ECS + ALB**: ALB routes to ECS service via target group with dynamic port mapping.

### EKS — Elastic Kubernetes Service

Managed Kubernetes control plane. Use when you need full K8s ecosystem (Helm, custom operators, multi-cloud portability).

**Fargate profiles** for K8s: run pods without managing nodes.

---

## CloudFront — CDN

Global CDN with 400+ edge locations. Integrates with S3, ALB, API Gateway.

```
User (Tokyo) → CloudFront Edge (Tokyo) → Origin (us-east-1)
```

**Cache behaviors** by path:
```
/static/*   → TTL 1 year, compress
/api/*      → TTL 0, forward all headers
/*          → TTL 1 day
```

**Lambda@Edge / CloudFront Functions** — run code at edge: auth, URL rewriting, A/B testing, request manipulation.

**OAC (Origin Access Control)** — only allow CloudFront to read from S3 (block direct S3 access).

---

## Common Interview Questions

**Q: EC2 vs Lambda vs ECS — how do you choose?**

EC2 when: long-running processes, GPU workloads, specific OS/network config, or when you need consistent baseline performance. Lambda when: event-driven, short bursts, unpredictable traffic, ≤15 min execution, want zero server management. ECS/Fargate when: containerized services needing >15 min, persistent HTTP servers, more control than Lambda but less than EC2. Cost: Lambda most expensive per compute-second but zero cost when idle; EC2 cheapest at high sustained utilization.

**Q: How do you secure sensitive config in Lambda/ECS?**

Never put secrets in environment variables as plaintext (visible in console). Use: (1) AWS Secrets Manager — store, rotate, audit secrets; fetch at runtime via SDK; (2) SSM Parameter Store — cheaper, good for non-rotating config; (3) Environment variables encrypted with a custom KMS key (acceptable for non-sensitive config). For Lambda, fetch secrets on cold start and cache in module scope (not per-invocation). Rotate with Lambda extensions or Secrets Manager rotation.

**Q: How do you handle Lambda cold starts?**

Provisioned Concurrency pre-warms N containers, eliminating cold starts for those N concurrent invocations (costs money even when idle). Reduce cold start duration by: keeping deployment package small, using Lambda Layers for shared dependencies, minimizing heavy init code, using `arm64` architecture, choosing Node.js/Python over Java (JVM cold starts are worst). For non-latency-critical workloads, accept cold starts. For user-facing APIs, use Provisioned Concurrency on peak hours only (schedule with Application Auto Scaling).
