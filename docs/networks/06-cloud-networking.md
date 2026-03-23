# Cloud Networking

Cloud providers offer virtual networking primitives that mirror physical networking — but managed, software-defined, and API-driven. AWS terms are used throughout since they're most common in interviews, but the concepts are universal across AWS, GCP, and Azure.

---

## VPC — Virtual Private Cloud

A VPC is an isolated virtual network you define within a cloud region. You control the IP range, subnets, routing, and access controls.

```
Region: us-east-1
└── VPC: 10.0.0.0/16
    ├── AZ: us-east-1a
    │   ├── Public Subnet:  10.0.1.0/24   (web servers)
    │   └── Private Subnet: 10.0.2.0/24   (app servers)
    ├── AZ: us-east-1b
    │   ├── Public Subnet:  10.0.3.0/24
    │   └── Private Subnet: 10.0.4.0/24
    └── AZ: us-east-1c
        ├── Public Subnet:  10.0.5.0/24
        └── Private Subnet: 10.0.6.0/24
```

A VPC spans all Availability Zones in a region. Subnets are tied to a single AZ.

### Public vs Private Subnets

**Public subnet**: has a route to an Internet Gateway. Resources can have public IPs and be reached from the internet.

**Private subnet**: no route to internet. Resources have only private IPs. Reach internet via NAT Gateway (outbound only).

```
Route table — Public subnet:
  10.0.0.0/16  → local
  0.0.0.0/0    → igw-xxxxx  ← Internet Gateway

Route table — Private subnet:
  10.0.0.0/16  → local
  0.0.0.0/0    → nat-xxxxx  ← NAT Gateway (outbound only)
```

---

## Internet Gateway & NAT Gateway

### Internet Gateway (IGW)

Horizontally scaled, redundant, stateful gateway. Enables VPC resources to communicate with the internet. Attached to the VPC (not a subnet). For a resource to use it, its subnet's route table must point `0.0.0.0/0` to the IGW, and it needs a public IP (Elastic IP or auto-assigned).

### NAT Gateway

Allows private subnet resources to reach the internet (software updates, API calls) without being directly reachable from the internet. Lives in a **public subnet**, has an Elastic IP, and private subnets route internet traffic through it.

```
Private EC2 → NAT Gateway (public subnet) → IGW → Internet
                         ↑
             Translates private IP to Elastic IP
             (return traffic routed back via same mapping)
```

**Cost note**: NAT Gateway charges per GB processed. Pulling large artifacts in private subnets gets expensive. VPC Endpoints eliminate this for AWS services.

---

## Security Groups

Stateful virtual firewalls attached to ENIs (Elastic Network Interfaces), operating at the resource level (EC2, RDS, Lambda, etc.).

```
Rules are "allow only" — implicit deny for everything not listed.

Security Group: sg-web
  Inbound:
    HTTP   TCP  80    0.0.0.0/0   ← public
    HTTPS  TCP  443   0.0.0.0/0
    SSH    TCP  22    10.0.0.0/8  ← internal only
  Outbound:
    All    All  All   0.0.0.0/0   ← allow all outbound (default)

Security Group: sg-database
  Inbound:
    PostgreSQL TCP 5432  sg-app     ← only app tier SG
  Outbound:
    All                  0.0.0.0/0
```

**SG referencing**: instead of IP ranges, reference another security group. Any resource with `sg-app` attached can reach the DB. Dynamic — no IP management needed.

**Stateful**: if inbound port 443 is allowed, the response on a random ephemeral port is automatically allowed back.

---

## NACLs — Network Access Control Lists

Stateless firewall at the subnet boundary. Every packet (inbound and outbound) is evaluated independently.

```
NACL (default: allow all):
  Rule#  Type    Protocol  Port     Source        Allow/Deny
  100    HTTP    TCP       80       0.0.0.0/0     ALLOW
  110    HTTPS   TCP       443      0.0.0.0/0     ALLOW
  120    SSH     TCP       22       10.0.0.0/8    ALLOW
  130    Custom  TCP       1024-65535  0.0.0.0/0  ALLOW  ← ephemeral (STATELESS!)
  *      All     All       All      0.0.0.0/0     DENY
```

**Key difference from Security Groups**:

| | Security Group | NACL |
|---|---|---|
| Level | Resource (ENI) | Subnet |
| State | Stateful | Stateless |
| Rules | Allow only | Allow + Deny |
| Evaluation | All rules evaluated | Lowest rule# wins (first match) |
| Default | Deny all inbound | Allow all |

Because NACLs are stateless, you must explicitly allow **ephemeral ports (1024–65535)** for return traffic. Security groups don't require this.

---

## VPC Peering

Direct network connection between two VPCs. Traffic stays on AWS backbone (no internet, no NAT). Can be within the same account or cross-account.

```
VPC A (10.0.0.0/16) ←── peering ──→ VPC B (172.16.0.0/16)
```

Requirements:
- CIDR ranges must not overlap
- Routes must be added in both VPCs' route tables
- Not transitive: if A↔B and B↔C, A cannot reach C through B

**Transit Gateway** solves transitivity for hub-and-spoke architectures (N VPCs, 1 TGW).

---

## VPC Endpoints

Allow private subnet resources to access AWS services without going through NAT Gateway or internet.

**Interface Endpoint** (PrivateLink): creates an ENI with a private IP in your subnet. Traffic to the service routes through it. Supported by 100+ services (S3, DynamoDB, SQS, ECR, etc.).

**Gateway Endpoint**: no ENI — just a route table entry pointing `s3` or `dynamodb` traffic to AWS's network. Free (no per-hour charge). Only for S3 and DynamoDB.

```
Private EC2 → VPC Endpoint → S3 (no internet, no NAT Gateway cost)
```

---

## Elastic Load Balancers

Distribute traffic across multiple targets (EC2, containers, IPs, Lambda).

### Application Load Balancer (ALB) — Layer 7

HTTP/HTTPS aware. Routes by URL path, host header, query string, headers.

```
/api/*     → Target Group: api-servers
/static/*  → Target Group: cdn-origin
/admin/*   → Target Group: admin-servers (with IP restriction rule)

Host-based:
  api.example.com  → api target group
  www.example.com  → web target group
```

ALB terminates TLS, forwards as HTTP to targets (or re-encrypts). Sticky sessions via cookie. WebSocket support.

### Network Load Balancer (NLB) — Layer 4

TCP/UDP/TLS. Extreme performance (millions of RPS, microsecond latency). Preserves client IP. Static IP per AZ. Used for non-HTTP workloads (game servers, custom TCP protocols).

### Gateway Load Balancer (GWLB) — Layer 3

Routes traffic through third-party virtual appliances (firewalls, IDS/IPS) transparently. Returns traffic to its original destination after inspection.

### Health Checks

All LBs perform health checks. Unhealthy targets are automatically removed from rotation.

```
HTTP health check:
  Path:     /health
  Expected: 200 OK
  Interval: 30s
  Threshold: 2 consecutive failures → unhealthy
```

---

## Route 53 (DNS + Health Routing)

AWS's DNS service with routing policies:

| Policy | Behavior |
|---|---|
| **Simple** | One record, one IP |
| **Weighted** | 80% → v1, 20% → v2 (A/B testing) |
| **Latency** | Route to lowest-latency region |
| **Failover** | Primary + standby, switch on health check failure |
| **Geolocation** | Route based on user's country/continent |
| **Geoproximity** | Route based on geographic distance (bias adjustable) |
| **Multivalue** | Up to 8 healthy records returned (not a replacement for LB) |

**Health checks** integrated — Route 53 can remove unhealthy endpoints from DNS automatically.

---

## CDN — Content Delivery Network

CDNs cache content at edge locations close to users. Reduces latency, offloads origin, absorbs traffic spikes.

```
User (London) → CDN Edge (Frankfurt) → Origin (us-east-1)
                    ↑
          Cache HIT: served from edge (5ms)
          Cache MISS: fetch from origin (100ms), cache it
```

**CloudFront (AWS)**: 400+ edge locations. Works with S3, ALB, API Gateway, custom origins.

```
CloudFront behaviors:
  /static/*  → Cache everything, TTL 1 year
  /api/*     → No cache, forward all headers
  /*         → Cache, TTL 24 hours
```

**Cache invalidation**: purge by path (`/*` or `/index.html`). Charged per path (first 1000 free/month on CloudFront).

**Origin shield**: optional extra caching layer between edge and origin, reducing origin load.

---

## Service Mesh (Kubernetes / Microservices)

In containerized environments, a service mesh handles service-to-service communication:

- **Mutual TLS (mTLS)**: automatic encryption between services
- **Traffic management**: canary deployments, retries, timeouts, circuit breaking
- **Observability**: distributed tracing, metrics per service pair

**Istio / Linkerd**: sidecar proxies (Envoy) injected into each pod. Intercept all traffic transparently.

```
Pod A → Envoy sidecar → network → Envoy sidecar → Pod B
           ↑                           ↑
       mTLS, retries               metrics, traces
```

---

## Common Networking Architectures

### Three-Tier Web App

```
Internet
    ↓
[ALB — public subnets, multi-AZ]
    ↓
[EC2/ECS Web/App — private subnets, auto-scaling]
    ↓
[RDS — isolated private subnets, Multi-AZ standby]
```

Security groups:
- ALB SG: allow 80, 443 from internet
- App SG: allow 3000 from ALB SG only
- DB SG: allow 5432 from App SG only

### Bastion Host (Jump Box)

SSH access to private subnet resources:

```
Internet → Bastion (public subnet) → Private EC2
                ↑
     Only trusted IP, key-based auth
```

Modern alternative: AWS Systems Manager Session Manager (no SSH port needed, no bastion needed).

---

## Common Interview Questions

**Q: What is the difference between a Security Group and a NACL?**

Security Groups are stateful, resource-level firewalls (allow-only rules). NACLs are stateless subnet-level firewalls with allow+deny rules, evaluated in order. Stateless means you must explicitly allow return traffic (ephemeral ports). SGs are the primary mechanism; NACLs add a subnet-level layer. Use NACLs to deny specific IPs across all resources in a subnet, or for defense-in-depth.

**Q: Why can't resources in a private subnet reach the internet, and how do you fix it?**

Private subnet route tables don't have a route to the Internet Gateway (or don't have one at all). Packets to internet IPs have no route → dropped. Fix: add a NAT Gateway in a public subnet, then add a route in the private subnet's route table: `0.0.0.0/0 → nat-xxxxx`. NAT Gateway has a public Elastic IP, performs SNAT on outbound packets, and forwards responses back.

**Q: Why use a VPC Endpoint instead of routing through NAT Gateway for S3 access?**

Two reasons: cost and security. NAT Gateway charges per GB transferred — downloading large amounts of data from S3 via NAT Gateway can be expensive. VPC Endpoints (specifically Gateway Endpoints for S3) are free. Security: with a VPC Endpoint, S3 traffic never leaves AWS's network — it never touches the internet, even with HTTPS. You can also attach IAM-like resource policies to endpoints restricting access to specific buckets.

**Q: What is the difference between ALB and NLB?**

ALB operates at Layer 7 (HTTP/HTTPS) — it understands HTTP headers, paths, and can route intelligently. It's for web applications. NLB operates at Layer 4 (TCP/UDP) — it doesn't inspect application content, just forwards packets. NLB is faster (microsecond latency), supports static IPs, and works with any TCP/UDP protocol. Use ALB for web apps with path/host-based routing; use NLB for non-HTTP workloads or when you need extreme performance.

---

## Links to Refer

- [AWS VPC Documentation](https://docs.aws.amazon.com/vpc/)
- [Cloudflare — What is a CDN?](https://www.cloudflare.com/learning/cdn/what-is-a-cdn/)
- [AWS — Security Groups vs NACLs](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html)
- [GCP VPC Overview](https://cloud.google.com/vpc/docs/overview)
