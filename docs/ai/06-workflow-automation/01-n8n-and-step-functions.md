# Workflow Automation — n8n, AWS Step Functions & Playwright

## n8n

n8n is a node-based visual workflow automation tool (like Zapier but self-hostable and code-friendly).

### Core Concepts

```
Workflow = nodes connected by edges
Node types:
  - Trigger nodes: start the workflow (webhook, cron, manual)
  - Action nodes: do something (HTTP request, database, email)
  - Logic nodes: if/else, switch, merge, split, loop
  - Code nodes: run JavaScript/Python

Data flow: each node receives items (JSON objects) from previous node
```

### n8n with AI

```javascript
// n8n Code Node — LangChain integration
const { ChatOpenAI } = require("langchain/chat_models/openai");
const { HumanMessage } = require("langchain/schema");

const model = new ChatOpenAI({ modelName: "gpt-4o", openAIApiKey: $env.OPENAI_API_KEY });

const results = [];
for (const item of $input.all()) {
  const response = await model.call([
    new HumanMessage(`Summarize: ${item.json.content}`)
  ]);
  results.push({ json: { summary: response.content, original_id: item.json.id } });
}

return results;
```

### Common n8n Patterns

```
1. Webhook → AI Processing → Database
   POST /webhook → Extract text → GPT-4 summarize → Save to Postgres

2. Scheduled Data Pipeline
   Cron (daily 9am) → Fetch RSS feeds → AI categorize → Send digest email

3. AI Customer Support
   Email webhook → AI classify intent → If FAQ: AI answer | If complex: assign to human

4. Document Processing
   File upload trigger → Extract text → Embed → Store in vector DB → Notify user

5. Monitoring & Alerting
   HTTP request (every 5min) → Check status → If error: AI analyze log → Send Slack alert

Key n8n features for AI workflows:
  - Built-in OpenAI, Anthropic, Google AI nodes
  - LangChain node for agents
  - Vector store nodes (Pinecone, Supabase)
  - HTTP Request node for custom API calls
  - Wait node for human-in-the-loop approval
```

### Interview Questions on n8n

**Q: How do you handle errors in n8n workflows?**
```
1. Error Workflow: configure a separate workflow to run on any error
2. "Continue on Error" setting per node: workflow continues even if node fails
3. Try/Catch in Code node: handle errors in custom logic
4. Retry on Fail: automatic retry with configurable count and wait time
5. Set Error Output: route failed items to error branch while continuing with successes
```

**Q: How do you pass data between nodes in n8n?**
```javascript
// Access previous node output
const previousData = $node["HTTP Request"].json;
const allItems = $input.all();
const firstItem = $input.first();

// Access workflow variables
const apiKey = $env.API_KEY;
const workflowId = $workflow.id;

// Set data for next node
return [{ json: { processed: true, data: processedData } }];
```

---

## AWS Step Functions

Step Functions is a serverless orchestration service that coordinates distributed applications using visual state machines.

### Core Concepts

```
State Machine = JSON definition of workflow steps
States:
  - Task: call Lambda, ECS, HTTP endpoint, etc.
  - Choice: conditional branching
  - Parallel: run branches simultaneously
  - Map: process array items (like forEach)
  - Wait: pause for duration or until timestamp
  - Pass: pass/transform data
  - Succeed / Fail: terminal states
```

### ASL (Amazon States Language) Example

```json
{
  "Comment": "AI Document Processing Pipeline",
  "StartAt": "ExtractText",
  "States": {
    "ExtractText": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123:function:extract-text",
      "Next": "CheckLength"
    },
    "CheckLength": {
      "Type": "Choice",
      "Choices": [
        {
          "Variable": "$.wordCount",
          "NumericGreaterThan": 1000,
          "Next": "SummarizeFirst"
        }
      ],
      "Default": "EmbedDirectly"
    },
    "SummarizeFirst": {
      "Type": "Task",
      "Resource": "arn:aws:states:::bedrock:invokeModel",
      "Parameters": {
        "ModelId": "anthropic.claude-3-sonnet-20240229-v1:0",
        "Body": {
          "anthropic_version": "bedrock-2023-05-31",
          "messages": [{"role": "user", "content": "Summarize: $.text"}]
        }
      },
      "Next": "EmbedDirectly"
    },
    "ProcessInParallel": {
      "Type": "Parallel",
      "Branches": [
        {
          "StartAt": "EmbedText",
          "States": { "EmbedText": {"Type": "Task", "Resource": "arn:...:embed", "End": true} }
        },
        {
          "StartAt": "ExtractEntities",
          "States": { "ExtractEntities": {"Type": "Task", "Resource": "arn:...:extract", "End": true} }
        }
      ],
      "Next": "SaveResults"
    },
    "ProcessDocuments": {
      "Type": "Map",
      "ItemsPath": "$.documents",
      "MaxConcurrency": 10,
      "Iterator": {
        "StartAt": "ProcessSingle",
        "States": {
          "ProcessSingle": {"Type": "Task", "Resource": "arn:...:process", "End": true}
        }
      },
      "End": true
    }
  }
}
```

### Step Functions vs n8n vs LangGraph

| | Step Functions | n8n | LangGraph |
|---|---|---|---|
| **Best for** | Cloud-native AWS workflows | Visual automation, non-technical users | AI/LLM agent workflows |
| **AI integration** | Via Bedrock, Lambda | Built-in AI nodes | Native LLM orchestration |
| **State persistence** | Built-in, indefinite | In-memory + optional DB | Checkpointer (Postgres/Redis) |
| **Error handling** | Retry policies, catch/finally | Error workflows, continue-on-fail | Custom nodes + try/except |
| **Cost model** | Per state transition ($0.025/1000) | Self-hosted (free) or cloud plan | Execution cost only |
| **Human-in-loop** | Wait for callback token | Wait node + webhook | interrupt_before |
| **Parallelism** | Parallel + Map states | Split-in-batches node | asyncio.gather |

**Interview questions on Step Functions:**

**Q: How do you implement human approval in Step Functions?**
```json
{
  "WaitForApproval": {
    "Type": "Task",
    "Resource": "arn:aws:states:::sqs:sendMessage.waitForTaskToken",
    "Parameters": {
      "QueueUrl": "https://sqs.../approval-queue",
      "MessageBody": {
        "TaskToken.$": "$$.Task.Token",
        "Input.$": "$"
      }
    },
    "Next": "ProcessApproval",
    "TimeoutSeconds": 86400
  }
}
```

The workflow pauses until someone calls `SendTaskSuccess` or `SendTaskFailure` with the task token.

---

## Playwright (Advanced)

Playwright is a browser automation framework for web scraping, testing, and AI data collection.

### Key Patterns for AI Workflows

```python
from playwright.async_api import async_playwright
import asyncio

# 1. Stealth scraping with AI extraction
async def scrape_and_extract(url: str, schema: dict) -> dict:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 ...",  # Appear as real browser
            viewport={"width": 1920, "height": 1080}
        )
        page = await context.new_page()

        # Anti-bot evasion
        await page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined})
        """)

        await page.goto(url, wait_until="networkidle")
        content = await page.evaluate("document.body.innerText")
        await browser.close()

    # Use LLM to extract structured data
    extracted = llm.invoke(f"""
    Extract the following fields from this text as JSON: {json.dumps(schema)}
    Text: {content[:3000]}
    """)
    return json.loads(extracted)

# 2. Parallel scraping (for data collection at scale)
async def scrape_multiple(urls: list[str]) -> list[str]:
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        semaphore = asyncio.Semaphore(5)  # Max 5 concurrent pages

        async def scrape_one(url):
            async with semaphore:
                page = await browser.new_page()
                await page.goto(url)
                content = await page.content()
                await page.close()
                return content

        results = await asyncio.gather(*[scrape_one(url) for url in urls])
        await browser.close()
    return results

# 3. Screenshot → LLM visual analysis
async def analyze_page_visually(url: str) -> str:
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.goto(url)
        screenshot = await page.screenshot(full_page=True)
        await browser.close()

    # Send to vision LLM
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64encode(screenshot).decode()}"}},
                {"type": "text", "text": "Describe the main content and any UI issues"}
            ]
        }]
    )
    return response.choices[0].message.content

# 4. Automated form-filling (AI-driven)
async def fill_form_with_ai(page, form_data: dict):
    # Get form structure
    form_html = await page.eval_on_selector("form", "f => f.outerHTML")

    # AI decides how to fill each field
    fill_instructions = llm.invoke(f"""
    Given this form HTML: {form_html}
    And this data: {form_data}
    Return JSON: [{"selector": "css_selector", "value": "value_to_enter"}]
    """)

    for instruction in json.loads(fill_instructions):
        await page.fill(instruction["selector"], instruction["value"])
```

### Playwright Interview Questions

**Q: How do you handle dynamic content and SPAs?**
```python
# Wait for specific element
await page.wait_for_selector(".product-list")

# Wait for network idle
await page.wait_for_load_state("networkidle")

# Wait for custom condition
await page.wait_for_function("() => window.__dataLoaded === true")

# Intercept API calls
page.on("response", lambda resp: print(resp.url, resp.status))
```

**Q: How do you avoid being detected as a bot?**
```python
# 1. Randomize delays
import random
await page.wait_for_timeout(random.randint(1000, 3000))

# 2. Realistic mouse movement
await page.mouse.move(100, 100)
await page.mouse.move(250, 300)
await page.click("#button")

# 3. Use persistent context (real browser profile)
context = await browser.new_context(storage_state="auth.json")

# 4. Use playwright-extra with stealth plugin
from playwright_stealth import stealth_async
await stealth_async(page)
```
