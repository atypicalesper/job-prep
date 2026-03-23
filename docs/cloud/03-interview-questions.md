# Cloud Interview Questions

---

**Q: Explain the shared responsibility model in AWS.**

AWS is responsible for security **of** the cloud: physical infrastructure, hardware, hypervisor, managed service internals (e.g., RDS OS patching). You are responsible for security **in** the cloud: OS patching on EC2, network config (security groups, NACLs), IAM policies, data encryption, application security. The boundary shifts based on service type: for EC2 you own everything above the hypervisor; for Lambda/RDS AWS owns more. Shared responsibility is why "AWS is secure" ≠ "your app is secure."

**Q: How would you design a highly available, fault-tolerant web application on AWS?**

Multi-AZ deployment:
- ALB across ≥2 AZs (ALB is regionally redundant by default)
- Auto Scaling Group with instances spread across ≥2 AZs
- RDS Multi-AZ (synchronous standby) or Aurora (6-copy storage across 3 AZs)
- ElastiCache in cluster mode with replicas per AZ
- S3 + CloudFront for static assets (99.999999999% durability, global)
- Route 53 health checks with failover routing
- SQS for decoupling synchronous dependencies

For HA: `N+1` instances minimum. For fault tolerance: system continues operating even if one AZ fails entirely.

**Q: How do you reduce costs on AWS?**

1. **Right-size**: use CloudWatch metrics to find under-utilized instances. Switch to Graviton (20–40% cheaper)
2. **Reserved Instances / Savings Plans**: commit 1–3 years for 40–60% off on predictable workloads
3. **Spot Instances**: 70–90% off for fault-tolerant, stateless workloads (batch jobs, rendering)
4. **S3 lifecycle policies**: move infrequently accessed objects to IA/Glacier automatically
5. **Data transfer**: keep traffic within the same AZ (cross-AZ transfer is charged); use VPC endpoints to avoid NAT Gateway costs for S3/DynamoDB
6. **Auto Scaling**: don't pay for idle capacity — scale down aggressively in non-prod environments
7. **Lambda/Fargate**: zero cost when idle vs EC2 that runs 24/7
8. **Cost Explorer + Budgets**: set alerts, find biggest spenders

**Q: What is the difference between CloudFormation and CDK?**

CloudFormation is AWS's native IaC — you write YAML/JSON templates. CDK compiles TypeScript/Python/Java code to CloudFormation templates. CDK adds: type safety, IDE autocomplete, reusable constructs, loops/conditionals, testing. Both deploy via CloudFormation under the hood, so CDK has the same deployment model. Use CDK when your team prefers code over YAML; CloudFormation when you want simplicity or already have YAML templates. CDK generates verbose CloudFormation that can be hard to debug.

**Q: How does Lambda scale, and what are its limits?**

Lambda scales by running multiple instances concurrently — each invocation gets its own isolated container. Default concurrency: 1000 per region (soft limit, request increase). Burst limit: 3000–500 additional instances per minute depending on region. Reserved concurrency: cap a function's concurrency (protect downstream resources). Provisioned concurrency: pre-warm N containers (eliminates cold starts, charged even when idle). Lambda does NOT queue — if concurrency is exhausted, new invocations are throttled (429). Use SQS in front of Lambda for buffering.

**Q: S3 vs EBS vs EFS — when do you use each?**

**S3**: object storage, accessed via HTTP/SDK. Best for: files, images, backups, static sites, data lakes. Not mountable as filesystem. **EBS (Elastic Block Store)**: network-attached block storage mounted to ONE EC2 instance. Best for: OS volume, databases requiring low-latency disk I/O, anything needing a filesystem. **EFS (Elastic File System)**: NFS-based, mountable by MULTIPLE EC2 instances simultaneously. Best for: shared storage across a fleet, CMS media, ML training data accessed by multiple nodes. Cost: S3 cheapest; EFS most expensive per GB but no pre-provisioning.

**Q: How do you handle secrets rotation in a serverless environment?**

Use AWS Secrets Manager with automatic rotation: Secrets Manager calls a Lambda rotation function on schedule (e.g., every 30 days), which updates the secret and the resource (e.g., RDS password). Lambda reads secrets at startup, caches in module scope. Add cache TTL to refresh periodically:

```javascript
let secretCache = null;
let cacheExpiry = 0;

async function getSecret() {
  if (Date.now() < cacheExpiry && secretCache) return secretCache;
  const sm = new SecretsManagerClient({});
  const response = await sm.send(new GetSecretValueCommand({ SecretId: 'prod/db' }));
  secretCache = JSON.parse(response.SecretString);
  cacheExpiry = Date.now() + 5 * 60 * 1000; // refresh every 5 min
  return secretCache;
}
```

**Q: Explain VPC endpoints — when and why?**

Without VPC endpoints, traffic from private subnets to AWS services (S3, DynamoDB, SQS) routes through NAT Gateway → internet → AWS service. Problems: NAT Gateway costs ($0.045/GB), traffic goes outside VPC (security risk). VPC Gateway Endpoints (S3, DynamoDB — free) add a route table entry routing traffic directly. Interface Endpoints (all other services) create a private ENI in your subnet ($0.01/hour + data). Use endpoints when: high S3/DynamoDB traffic (NAT cost), compliance requires no internet traffic, or you want to restrict bucket access to your VPC only (bucket policy + `aws:sourceVpc`).

**Q: What is CloudFront and how does it differ from a load balancer?**

A load balancer distributes traffic across backend instances (same origin, different servers). CloudFront is a CDN — it caches content at 400+ global edge locations close to users, reducing origin load and latency. An ALB is in one region; CloudFront is global. CloudFront also: terminates TLS at edge (faster handshake), DDoS protection via Shield Standard, supports Lambda@Edge for edge compute, handles static asset caching. Typical architecture: CloudFront → ALB → ECS/Lambda. CloudFront handles static, ALB handles dynamic.
