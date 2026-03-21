# Workflow Automation — Tricky Questions

### Q1: Step Functions charges per state transition. Your Map state processes 10,000 items — how much does it cost and how do you optimize?

**Answer:**

```
Standard workflow pricing: $0.025 per 1,000 state transitions
Express workflow pricing: $1 per million + duration

Map over 10,000 items, each with 5 states:
  = 10,000 × 5 = 50,000 transitions
  = 50,000 / 1,000 × $0.025
  = $1.25 per execution

At 100 executions/day: $125/day = $3,750/month

Optimization strategies:
```

```json
// 1. Use Express Workflows for high-volume, short-duration
// Standard: $0.025/1000 transitions, unlimited duration
// Express: $1/million transitions + $0.00001667/GB-second
// Express is 25x cheaper per transition!

// 2. Batch items before Map (reduce iterations)
// Instead of Map over 10,000 individual items:
// Batch into 100 groups of 100 → only 100 Map iterations
{
  "BatchItems": {
    "Type": "Task",
    "Resource": "arn:...:batch-into-chunks",  // Lambda groups items
    "Next": "ProcessBatches"
  },
  "ProcessBatches": {
    "Type": "Map",
    "MaxConcurrency": 10,
    "ItemsPath": "$.batches",  // Now only 100 items
    "Iterator": { ... }
  }
}

// 3. Move complex logic into Lambda (not separate states)
// BAD: 10 states in the Map iterator = 100,000 transitions
// GOOD: 1 Task state calling Lambda that does all the logic = 10,000 transitions
```

---

### Q2: Your n8n workflow processes webhooks. Traffic spikes to 10,000 webhooks/minute. What breaks and how do you fix it?

**Answer:**

```
What breaks:
1. Single n8n instance CPU saturation
   → Webhooks queue up → timeout → lost events

2. Memory exhaustion
   → Each active workflow execution consumes ~50MB
   → 100 concurrent = 5GB RAM needed

3. Database bottleneck
   → n8n stores execution history in Postgres/SQLite
   → 10,000/minute = 166 writes/second → SQLite breaks, Postgres slows

4. External API rate limits
   → If each webhook calls OpenAI: 10,000 req/min >> OpenAI limits

Fixes:
```

```yaml
# 1. Scale n8n horizontally with queue mode
# n8n main (webhook receiver) + n8n workers (execution)
# docker-compose.yml
services:
  n8n-main:
    image: n8nio/n8n
    environment:
      - EXECUTIONS_MODE=queue
      - QUEUE_BULL_REDIS_HOST=redis

  n8n-worker:
    image: n8nio/n8n
    command: worker
    environment:
      - EXECUTIONS_MODE=queue
    deploy:
      replicas: 5  # Scale horizontally

  redis:
    image: redis:alpine  # Queue backend

# 2. Add rate limiting / debouncing at the webhook level
# Use API Gateway → SQS → Lambda → n8n webhook
# SQS acts as buffer, smooths out spikes

# 3. Disable execution history for high-volume workflows
# n8n: Settings → Workflow → "Save Successful Executions": Never
# Removes DB write on every execution

# 4. Use n8n's built-in rate limiting
# Add "Wait" node after webhook to throttle downstream API calls
# Or use "Batch" node to group webhook payloads

# 5. For very high volume: ditch n8n, use Step Functions
# Step Functions Express handles millions of executions/day natively
```

---

### Q3: How do you implement idempotency in workflow automation? Why does it matter?

**Answer:**

Idempotency means running the same workflow twice with the same input produces the same result without side effects.

**Why it matters:**
- Webhooks can be delivered more than once (HTTP retries)
- Step Functions can retry failed states
- n8n can re-execute on error
- Without idempotency: duplicate emails sent, duplicate DB records, double charges

```python
# Non-idempotent (DANGEROUS):
def process_payment(order_id: str, amount: float):
    charge_credit_card(amount)  # Could be called twice!
    update_db(order_id, "PAID")

# Idempotent (SAFE):
def process_payment(order_id: str, amount: float):
    # Check if already processed
    if get_payment_status(order_id) == "PAID":
        return {"status": "already_paid", "idempotent": True}

    # Use idempotency key with payment provider
    charge_credit_card(
        amount=amount,
        idempotency_key=f"order_{order_id}"  # Stripe/Braintree deduplicate
    )
    update_db(order_id, "PAID")

# In Step Functions: use idempotency tokens
# In n8n: add deduplication check as first node
# Rule: always check before write/send/charge
```

---

### Q4: When would you choose LangGraph over AWS Step Functions for an AI workflow? And vice versa?

**Answer:**

```
Choose LangGraph when:
  ✓ Workflow logic is determined by LLM decisions at runtime
    (step N depends on what the model said in step N-1)
  ✓ You need stateful conversation/reasoning across steps
  ✓ Tools are Python functions (LangChain ecosystem)
  ✓ You want streaming responses to UI
  ✓ Agent loops, retries, and dynamic branching

  Example: AI research agent that decides which sources to search,
           reads results, decides if it needs more info, etc.

Choose Step Functions when:
  ✓ Workflow steps are predetermined (just data-driven branching)
  ✓ You need to orchestrate AWS services (Lambda, SQS, SNS, ECS, Bedrock)
  ✓ You need audit trail, execution history, CloudWatch integration
  ✓ Workflow can run for hours/days (Step Functions: up to 1 year)
  ✓ Team is AWS-native, not Python-native
  ✓ You need to handle thousands of parallel executions reliably

  Example: Document processing pipeline where:
           Upload S3 → Textract → Bedrock summarize → Notify user

Hybrid (common in production):
  Step Functions handles the infrastructure orchestration:
    S3 event → Step Functions state machine
      → Task: invoke Lambda that runs LangGraph agent
      → Task: store result in DynamoDB
      → Task: send SES notification
```

---

### Q5: Playwright test flakiness — your E2E tests pass locally but fail in CI. Top 5 causes and fixes.

**Answer:**

```python
# Cause 1: Race conditions (most common)
# BAD: hardcoded waits
await page.wait_for_timeout(2000)  # Might not be enough in slow CI

# GOOD: wait for specific conditions
await page.wait_for_selector(".result-list", state="visible")
await page.wait_for_load_state("networkidle")
await page.wait_for_function("() => document.querySelectorAll('.item').length > 0")

# Cause 2: Viewport/resolution differences
# CI runs headless at default size, your local is 2560x1440
await browser.new_context(viewport={"width": 1280, "height": 720})  # Standardize

# Cause 3: Test isolation failures
# Tests share state (localStorage, cookies, DB)
# FIX: use fresh browser context per test
context = await browser.new_context(storage_state=None)  # No shared state
await context.add_cookies([])  # Clear cookies

# Cause 4: Flaky selectors
# BAD: position-based (breaks when layout changes)
await page.click(".container > div:nth-child(3) > button")
# GOOD: semantic selectors
await page.get_by_role("button", name="Submit Order").click()
await page.get_by_test_id("checkout-button").click()  # data-testid attribute

# Cause 5: External dependencies (API calls, timers)
# FIX: mock external dependencies in E2E tests
await page.route("**/api/payments/**", lambda route: route.fulfill(
    status=200,
    content_type="application/json",
    body=json.dumps({"status": "success", "id": "test_123"})
))

# CI-specific configuration
# playwright.config.ts
export default {
  retries: process.env.CI ? 2 : 0,  // Retry twice in CI
  workers: process.env.CI ? 1 : undefined,  // Single worker in CI (less contention)
  timeout: 60000,  // Longer timeout in CI
  use: {
    video: "on-first-retry",   // Record video on retry for debugging
    screenshot: "only-on-failure",
    trace: "on-first-retry"
  }
}
```
