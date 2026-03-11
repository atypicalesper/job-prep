# Serverless and AWS Lambda — Patterns and Tradeoffs

---

## What is Serverless?

```
Traditional server:
  Always running → you pay 24/7 → you manage scaling, OS, runtime updates

Serverless (FaaS — Function as a Service):
  Functions deployed as units → runs only when invoked → pay per invocation
  AWS Lambda, Google Cloud Functions, Azure Functions, Cloudflare Workers

Characteristics:
  ✓ Auto-scales from 0 to 10,000+ concurrent invocations automatically
  ✓ No server management (no EC2, no patching)
  ✓ Pay per request + duration (not idle time)
  ✓ Event-driven: HTTP, S3 events, SQS, SNS, DynamoDB streams, scheduled
  ✗ Cold starts (first invocation after idle period is slow)
  ✗ Max execution time (15 minutes for Lambda)
  ✗ Stateless (no in-memory state between invocations)
  ✗ Vendor lock-in
  ✗ Difficult to test locally, debug production issues
```

---

## Lambda Execution Model

```
Cold start:
  1. Lambda service provisions a new execution environment (container)
  2. Downloads function code (or container image)
  3. Initializes runtime (Node.js process starts)
  4. Runs global initialization code (your module-level code)
  5. Runs your handler function
  Total: 100ms - 3s depending on package size, memory, runtime

Warm invocation:
  1. Reuses existing execution environment
  2. Runs your handler function (only)
  Total: <10ms overhead (just the handler)

Lambda reuses execution environments for:
  ~15 minutes of idle time (approximate — not guaranteed)
  Multiple sequential requests from the same container

Concurrent invocations:
  Each concurrent request gets its OWN execution environment
  1000 requests at once = 1000 containers (cold starts for new ones)
```

```javascript
// CRITICAL: code outside handler runs once per cold start
// Code inside handler runs per invocation

// Module-level (runs once):
import { DynamoDB } from '@aws-sdk/client-dynamodb';

const dynamodb = new DynamoDB({ region: 'us-east-1' }); // ← connection reused!
const config = await loadConfig();                       // ← cached across invocations

// Handler (runs per invocation):
export const handler = async (event) => {
  // This is fast — dynamodb client already initialized
  const result = await dynamodb.getItem({ ... });
  return { statusCode: 200, body: JSON.stringify(result) };
};

// ❌ Don't do this (creates new client every invocation):
export const badHandler = async (event) => {
  const dynamodb = new DynamoDB({ region: 'us-east-1' }); // reconnects every time!
  // ...
};
```

---

## Cold Start Optimization

```javascript
// 1. Minimize package size — smaller zip = faster download
//    Use tree-shaking, avoid bundling unused code
//    Target: <1MB unzipped is ideal

// package.json build script:
// "build": "esbuild src/handler.ts --bundle --platform=node --target=node18
//           --external:@aws-sdk/* --outfile=dist/handler.js --minify"
// AWS SDK v3 is available in the Lambda runtime — don't bundle it

// 2. Increase memory — more memory = more vCPU = faster startup
//    Lambda: memory and CPU are linked
//    128MB: ~800ms cold start
//    1024MB: ~300ms cold start
//    1769MB: 1 full vCPU
//    Often cheaper to use more memory (faster = less duration billing)

// 3. Provisioned concurrency — pre-warms N containers
//    Lambda keeps N instances always warm → zero cold starts
//    Cost: you pay for idle time of those N instances
//    Use for: latency-sensitive APIs, predictable traffic

// 4. Lambda SnapStart (Java) / not yet for Node.js
//    Snapshots the initialized state — restores instead of re-initializing

// 5. Keep function warm with scheduled ping (poor man's solution):
// EventBridge rule: run every 5 minutes
// Handler: if event.source === 'warmup', return early
export const handler = async (event) => {
  if (event.source === 'serverless-warmup') {
    return 'warmed';
  }
  // ... actual logic
};
```

---

## Database Connections in Lambda

```javascript
// Problem: each Lambda container opens a DB connection.
// 1000 concurrent invocations = 1000 DB connections.
// Most databases handle 100-500 connections max.

// Solution 1: RDS Proxy
//   AWS service that pools connections between Lambda and RDS
//   Lambda → RDS Proxy (pool) → RDS
//   Handles connection multiplexing transparently

// Solution 2: DynamoDB — designed for Lambda
//   Serverless, no connection limits, auto-scales
//   HTTP-based API (no persistent connections)
//   Use for: simple access patterns, high scale

// Solution 3: Aurora Serverless v2
//   MySQL/PostgreSQL that scales to zero
//   Data API: HTTP-based SQL execution (no connection management)

// Solution 4: Short-lived connections with pool max=1
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,          // one connection per Lambda instance
  idleTimeoutMillis: 120_000,  // hold connection between invocations
  allowExitOnIdle: false,
});

// Clean up on Lambda shutdown (SIGTERM sent by Lambda runtime):
process.on('SIGTERM', async () => {
  await pool.end();
});
```

---

## Event Sources and Trigger Patterns

```javascript
// ─── API Gateway / Function URL (HTTP) ───────────────────────────────────────
export const handler = async (event: APIGatewayProxyEventV2) => {
  const { method, path, body, headers, queryStringParameters } = event;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'hello' }),
  };
};

// ─── S3 Event (process uploaded files) ──────────────────────────────────────
export const s3Handler = async (event: S3Event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key);
    // Download and process the file:
    const obj = await s3.getObject({ Bucket: bucket, Key: key });
    // ...
  }
};

// ─── SQS Queue Consumer ──────────────────────────────────────────────────────
export const sqsHandler = async (event: SQSEvent) => {
  const failed: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.body);
      await processMessage(message);
    } catch (err) {
      // Report failure — Lambda retries this specific message:
      failed.push({ itemIdentifier: record.messageId });
    }
  }

  // Return failed items for retry (partial batch response):
  return { batchItemFailures: failed };
};

// ─── Scheduled Task (EventBridge Scheduler) ─────────────────────────────────
export const scheduledHandler = async () => {
  await sendDailyReport();
  await cleanupExpiredSessions();
};

// ─── DynamoDB Streams (react to DB changes) ──────────────────────────────────
export const dynamoHandler = async (event: DynamoDBStreamEvent) => {
  for (const record of event.Records) {
    if (record.eventName === 'INSERT') {
      const newItem = record.dynamodb?.NewImage;
      await indexInElasticsearch(newItem);
    }
  }
};
```

---

## Serverless Framework / AWS SAM / CDK

```typescript
// AWS CDK — Infrastructure as code for Lambda:
import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { LambdaRestApi } from 'aws-cdk-lib/aws-apigatewayv2';

const usersFn = new Function(this, 'UsersFunction', {
  runtime: Runtime.NODEJS_18_X,
  code: Code.fromAsset('dist/users'),
  handler: 'handler.handler',
  memorySize: 512,
  timeout: Duration.seconds(30),
  environment: {
    DATABASE_URL: process.env.DATABASE_URL!,
    NODE_ENV: 'production',
  },
  // Provisioned concurrency for low latency:
  currentVersionOptions: {
    provisionedConcurrentExecutions: 5,
  },
});

// serverless.yml (Serverless Framework):
// functions:
//   createUser:
//     handler: dist/users.handler
//     events:
//       - httpApi:
//           path: POST /users
//     environment:
//       DATABASE_URL: ${env:DATABASE_URL}
//     memorySize: 512
//     timeout: 30
```

---

## Testing Lambda Functions

```javascript
// Unit test — just test your handler directly:
import { handler } from './users.handler';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';

const ddbMock = mockClient(DynamoDBClient);

beforeEach(() => ddbMock.reset());

it('returns 200 with user data', async () => {
  ddbMock.on(GetItemCommand).resolves({
    Item: { id: { S: '123' }, name: { S: 'Alice' } },
  });

  const event = {
    requestContext: { http: { method: 'GET' } },
    pathParameters: { id: '123' },
  };

  const result = await handler(event as any);

  expect(result.statusCode).toBe(200);
  expect(JSON.parse(result.body)).toMatchObject({ id: '123', name: 'Alice' });
});

// Integration test — use LocalStack (emulates AWS services locally):
// localstack start -d
// AWS_ENDPOINT_URL=http://localhost:4566 jest --testPathPattern=integration
```

---

## Serverless Patterns

```javascript
// ─── Idempotency — safe to retry duplicate events ─────────────────────────────
// AWS Lambda may deliver SQS messages AT LEAST ONCE.
// Your handler must be idempotent.

const processedEvents = new Set<string>(); // in-memory (only for warm container)

export const handler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    const idempotencyKey = record.messageId;

    // Check if already processed (use DynamoDB with TTL for persistence):
    const existing = await dynamodb.getItem({
      TableName: 'processed-events',
      Key: { id: { S: idempotencyKey } },
    });

    if (existing.Item) {
      console.log(`Already processed: ${idempotencyKey}, skipping`);
      continue;
    }

    await processMessage(JSON.parse(record.body));

    // Mark as processed:
    await dynamodb.putItem({
      TableName: 'processed-events',
      Item: {
        id: { S: idempotencyKey },
        ttl: { N: String(Math.floor(Date.now() / 1000) + 86400) },  // 1 day TTL
      },
    });
  }
};

// ─── Fan-out: SNS → multiple SQS queues ──────────────────────────────────────
// OrderPlaced event → SNS topic
//   → inventory-queue → Lambda (reserve stock)
//   → email-queue → Lambda (send confirmation)
//   → analytics-queue → Lambda (update dashboard)

// ─── Saga pattern with Step Functions ────────────────────────────────────────
// Coordinate multi-step distributed transaction:
// Step 1: reserve inventory
// Step 2: charge payment
// Step 3: create shipment
// On failure at any step → compensating transactions (rollback)
```

---

## Lambda vs Containers vs VMs

```
                 Lambda          Container (ECS)    VM (EC2)
─────────────────┼───────────────┼───────────────────┼──────────────
Startup time     │ 100ms-3s      │ 1-30s             │ 1-5 min
Idle cost        │ $0            │ Pay per hour       │ Pay per hour
Scale to 0       │ Yes           │ Yes (fargate)      │ No
Max duration     │ 15 min        │ Unlimited          │ Unlimited
State            │ Stateless     │ Stateful possible  │ Stateful
Cold starts      │ Yes           │ Possible           │ No
Control          │ Low           │ High               │ Full

Use Lambda for:
  ✓ Event processing (S3, SQS, DynamoDB streams)
  ✓ Scheduled tasks (cron jobs)
  ✓ Sporadically accessed APIs
  ✓ Preprocessing/transformation pipelines
  ✓ Webhooks

Use containers for:
  ✓ Continuously running APIs (high baseline traffic)
  ✓ WebSockets
  ✓ Long-running tasks
  ✓ Stateful services
  ✓ Predictable, high traffic (cheaper per request at scale)

Break-even point (Lambda vs always-on container):
  At ~40-60% CPU utilization, a container is usually cheaper than Lambda
```

---

## Common Interview Questions

**Q: What is a cold start and how do you minimize it?**
A cold start is the initialization overhead when Lambda creates a new execution environment: downloading code, starting Node.js, running module-level code. Mitigation: minimize bundle size (<1MB), increase memory (more CPU → faster init), use provisioned concurrency (pre-warm N instances), keep module-level code minimal (no expensive blocking operations).

**Q: How do you handle database connections in Lambda?**
Persistent TCP connections don't work well at scale — 1000 concurrent lambdas = 1000 connections. Solutions: (1) RDS Proxy (AWS-managed connection pool), (2) DynamoDB (HTTP-based, no connection management), (3) Aurora Serverless with Data API (HTTP SQL), (4) Single connection per container reused across warm invocations with `max: 1` pool.

**Q: Why can't you use WebSockets with standard Lambda?**
Lambda runs for one invocation then stops — it can't maintain a persistent connection. Use API Gateway WebSocket API: Gateway manages connections, routes messages to Lambda. Lambda processes each message, uses the connection ID to push responses back via the management API. State must be external (DynamoDB, Redis).

**Q: What is idempotency and why does it matter for Lambda?**
SQS delivers messages at least once — Lambda may process the same event multiple times (network retry, Lambda failure after processing but before ack). Your handler must produce the same result for duplicate calls. Implement using a deduplication key stored in DynamoDB with TTL. AWS Lambda Powertools has a built-in idempotency decorator.

**Q: When would you NOT use serverless?**
(1) Sustained high traffic — containers are cheaper above ~40% CPU utilization, (2) Long-running tasks (>15 minutes), (3) WebSockets (possible but complex), (4) Latency-sensitive APIs where cold starts are unacceptable and provisioned concurrency is too expensive, (5) Large monolith applications that can't be decomposed into functions.
