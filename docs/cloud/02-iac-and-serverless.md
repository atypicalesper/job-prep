# Infrastructure as Code & Serverless Patterns

---

## Terraform

Declarative IaC — define desired state, Terraform figures out what to create/update/destroy.

### Core Concepts

```hcl
# Provider
provider "aws" {
  region = "us-east-1"
}

# Resource
resource "aws_s3_bucket" "uploads" {
  bucket = "my-app-uploads-${var.env}"
}

# Variable
variable "env" {
  type    = string
  default = "dev"
}

# Output
output "bucket_name" {
  value = aws_s3_bucket.uploads.bucket
}

# Data source — read existing resources
data "aws_vpc" "default" {
  default = true
}
```

### State

Terraform state tracks what it manages. Remote state in S3 + DynamoDB lock:

```hcl
terraform {
  backend "s3" {
    bucket         = "my-tfstate-bucket"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}
```

**Never edit state manually.** `terraform state mv` / `terraform import` for migrations.

### Workflow

```bash
terraform init      # download providers
terraform plan      # show changes (diff)
terraform apply     # apply changes
terraform destroy   # tear down

# Targeted
terraform plan -target=aws_lambda_function.api
terraform apply -var="env=prod"
```

### Modules

Reusable units of configuration:

```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.0.0"

  name = "my-vpc"
  cidr = "10.0.0.0/16"
  azs  = ["us-east-1a", "us-east-1b"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.3.0/24", "10.0.4.0/24"]
  enable_nat_gateway = true
}
```

### Workspaces

Manage multiple environments with one config:

```bash
terraform workspace new staging
terraform workspace select prod
terraform apply -var-file="prod.tfvars"
```

---

## AWS CDK — Cloud Development Kit

Define infrastructure using real programming languages (TypeScript, Python, Java, Go). Compiles to CloudFormation.

```typescript
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';

export class MyStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string) {
    super(scope, id);

    // S3 bucket
    const bucket = new s3.Bucket(this, 'UploadsBucket', {
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [{
        expiration: cdk.Duration.days(90),
        transitions: [{
          storageClass: s3.StorageClass.GLACIER,
          transitionAfter: cdk.Duration.days(30),
        }]
      }]
    });

    // Lambda that processes uploads
    const processor = new lambda.Function(this, 'Processor', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda'),
      timeout: cdk.Duration.minutes(5),
      environment: { BUCKET: bucket.bucketName },
    });

    // Grant Lambda read access to bucket
    bucket.grantRead(processor);

    // Trigger Lambda on S3 uploads
    processor.addEventSource(
      new lambdaEventSources.S3EventSource(bucket, {
        events: [s3.EventType.OBJECT_CREATED],
      })
    );
  }
}
```

```bash
cdk synth   # generate CloudFormation template
cdk diff    # show changes vs deployed
cdk deploy  # deploy stack
cdk destroy
```

**CDK vs Terraform**: CDK has better type safety and IDE support; Terraform is provider-agnostic and has a larger ecosystem. CDK tightly couples to CloudFormation — CDK is better when going all-in on AWS.

---

## Serverless Patterns

### API Gateway + Lambda (REST API)

```
Client → API Gateway → Lambda → DynamoDB/RDS
```

```typescript
// Lambda handler
export const handler = async (event: APIGatewayProxyEvent) => {
  const userId = event.pathParameters?.id;
  const body = JSON.parse(event.body ?? '{}');

  // ... business logic

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true }),
  };
};
```

API Gateway features: request validation, throttling (rate limit per key), usage plans, WAF integration, custom authorizers.

**Lambda Authorizer** — custom auth logic:
```typescript
export const authorizer = async (event: APIGatewayTokenAuthorizerEvent) => {
  const token = event.authorizationToken.replace('Bearer ', '');
  const payload = verifyJWT(token);  // throws if invalid

  return {
    principalId: payload.sub,
    policyDocument: {
      Statement: [{ Effect: 'Allow', Action: 'execute-api:Invoke', Resource: event.methodArn }]
    },
    context: { userId: payload.sub }  // available in downstream Lambda
  };
};
```

### Fan-out with SNS + SQS

```
Order Created → SNS Topic
                 ├── SQS: email-queue    → Lambda: send confirmation email
                 ├── SQS: inventory-queue → Lambda: reserve inventory
                 └── SQS: analytics-queue → Lambda: track event
```

Each SQS queue has its own Lambda trigger with independent scaling, retry policy, and DLQ.

### Step Functions — Orchestration

Long-running workflows with state, branching, retries, parallel execution:

```json
{
  "StartAt": "ValidateOrder",
  "States": {
    "ValidateOrder": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:::function:ValidateOrder",
      "Next": "ProcessPayment",
      "Catch": [{ "ErrorEquals": ["ValidationError"], "Next": "Fail" }]
    },
    "ProcessPayment": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:::function:ProcessPayment",
      "Retry": [{ "ErrorEquals": ["PaymentTimeout"], "MaxAttempts": 3 }],
      "Next": "FulfillOrder"
    },
    "FulfillOrder": { "Type": "Task", "Resource": "...", "End": true },
    "Fail": { "Type": "Fail" }
  }
}
```

**Express Workflows** for high-volume short-duration (<5 min). **Standard Workflows** for long-running (up to 1 year), exactly-once execution.

### EventBridge — Event Bus

Decoupled event routing with schema registry and cross-account event delivery.

```
Sources → EventBridge Bus → Rules → Targets
                              ↓
                      "source = myapp AND detail-type = OrderPlaced"
                              ↓
                      Lambda / SQS / Step Functions / API Gateway
```

**Scheduled rules** (cron replacement):
```
cron(0 12 * * ? *)   # Every day at 12:00 UTC
rate(5 minutes)       # Every 5 minutes
```

**EventBridge Pipes** — point-to-point integration with filtering + enrichment (Kinesis → filter → Lambda enrichment → SQS target).

---

## DynamoDB

NoSQL key-value + document store. Single-digit millisecond latency at any scale.

### Data Model

```
Table: Orders
  Partition Key (PK): userId       ← distributes data across partitions
  Sort Key (SK): orderId           ← orders within a user's partition

Item: {
  userId: "u#42",       ← PK
  orderId: "o#20250101",← SK
  status: "shipped",
  total: 49.99
}
```

**Single table design**: store multiple entity types in one table using composite key patterns.

```
PK            SK              Entity
u#42          u#42            User (self)
u#42          o#2025-001      Order
u#42          o#2025-002      Order
p#SHIRT-L     p#SHIRT-L       Product
o#2025-001    ITEM#1          OrderItem
```

### GSI — Global Secondary Index

Query by non-key attributes:

```
GSI: statusIndex
  PK: status        ← query all orders by status
  SK: createdAt     ← range, sort

Query: status = "pending" AND createdAt > "2025-01-01"
```

### Read Modes

**Eventual consistency** (default): reads from any replica, may be slightly stale. Cheaper.
**Strong consistency**: reads from leader, always up-to-date. 2× read capacity units.

### Capacity Modes

**On-demand**: pay per request, auto-scales. Higher per-request cost.
**Provisioned**: specify RCU/WCU in advance, cheaper at predictable load. Use Auto Scaling.

---

## Observability

### CloudWatch

```javascript
// Structured logging → CloudWatch Logs Insights
console.log(JSON.stringify({
  level: 'INFO',
  requestId: context.awsRequestId,
  userId: event.userId,
  duration: Date.now() - startTime,
  message: 'Order processed'
}));
```

**Metrics**: built-in (Lambda duration/errors/throttles, ALB request count) + custom:
```javascript
import { CloudWatch } from '@aws-sdk/client-cloudwatch';
const cw = new CloudWatch({});
await cw.putMetricData({
  Namespace: 'MyApp',
  MetricData: [{ MetricName: 'OrdersProcessed', Value: 1, Unit: 'Count' }]
});
```

**Alarms** → SNS → PagerDuty/Slack.

**CloudWatch Logs Insights** query:
```
fields @timestamp, level, message
| filter level = "ERROR"
| stats count() by bin(5m)
| sort @timestamp desc
```

### X-Ray — Distributed Tracing

Trace requests across Lambda, API Gateway, RDS, DynamoDB:

```javascript
import AWSXRay from 'aws-xray-sdk-core';
const AWS = AWSXRay.captureAWS(require('aws-sdk'));

// Creates sub-segment automatically for SDK calls
const s3 = new AWS.S3();
```

**Service Map**: visual graph of service dependencies + latency/error rates per edge.

---

## Interview Questions

**Q: Terraform state — what happens if two engineers run apply at the same time?**

Without locking, both reads see the same state, both make changes, and the second write overwrites the first — state corruption. Solution: remote state with DynamoDB locking (`dynamodb_table` in S3 backend config). Terraform acquires a DynamoDB lock before applying and releases it after. The second engineer's `apply` waits or fails with a lock error. CI/CD pipelines should serialize `terraform apply` (one at a time per environment).

**Q: When would you choose Step Functions over a Lambda calling another Lambda?**

Direct Lambda invocations: synchronous coupling, error handling in code, limited visibility. Step Functions: visual workflow, built-in retry/catch, parallel execution, human approval steps, audit history, max 1-year execution. Use Step Functions when: workflow has > 2 steps, retry logic is complex, you need audit trail, or execution time exceeds Lambda's 15-minute limit. For simple chains, direct invocation is fine; for orchestration, Step Functions prevents callback hell.

**Q: DynamoDB single-table design — pros and cons?**

Pros: all entity types in one table = fewer round trips (one query fetches multiple entity types via SK patterns), lower cost (one table's provisioned capacity serves all), simpler operational management. Cons: schema is harder to understand, no ad-hoc queries without GSIs (no SQL JOINs), requires upfront access pattern analysis, harder to onboard new engineers. Use when access patterns are known and stable. Use multiple tables when teams own different entities independently or schema is still evolving.
