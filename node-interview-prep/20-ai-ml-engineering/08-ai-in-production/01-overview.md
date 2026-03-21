# AI in Production — Cost, Latency, Reliability & Monitoring

## The Production Reality

```
Dev environment:           Production environment:
  1 user                     1000+ concurrent users
  1 request at a time        Bursty traffic (10x spikes)
  No cost pressure           $0.01/query × 1M queries = $10,000/day
  Errors are fine            99.9% uptime required
  Slow is OK                 <2s response time expected
  No data isolation          Multi-tenant, PII concerns
```

---

## Cost Optimization

### Strategy 1: Model Routing

```python
# Route to the cheapest model that can handle the task

def select_model(query: str, context_length: int) -> str:
    # Simple queries → cheap model
    if len(query.split()) < 20 and context_length < 1000:
        return "gpt-4o-mini"      # $0.15/M input tokens

    # Complex reasoning → expensive model
    if needs_complex_reasoning(query):
        return "gpt-4o"           # $2.50/M input tokens

    # Very long context → Claude
    if context_length > 100_000:
        return "claude-opus-4-6"  # 200k context window

    return "gpt-4o-mini"  # default to cheap

# Cost comparison (approximate):
# gpt-4o-mini: $0.15/M input, $0.60/M output
# gpt-4o:      $2.50/M input, $10/M output    (16x more expensive)
# claude-3.5:  $3/M input,    $15/M output
# llama-3 (self-hosted): $0 per token, ~$2-5/hour server
```

### Strategy 2: Prompt Caching

```python
# Anthropic: cache static parts of your prompt (system prompt, docs)
import anthropic

client = anthropic.Anthropic()

# Without caching: pay for system prompt tokens EVERY request
# With caching: pay once, reuse for up to 5 minutes (90% discount)

response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=1024,
    system=[
        {
            "type": "text",
            "text": "You are an expert assistant for Acme Corp...",
        },
        {
            "type": "text",
            "text": LARGE_KNOWLEDGE_BASE,  # 50k tokens of docs
            "cache_control": {"type": "ephemeral"},  # Cache this!
        },
    ],
    messages=[{"role": "user", "content": user_query}],
)
# Input cost: first request pays full price
# Subsequent requests: 90% discount on cached tokens

# OpenAI: automatic caching for prompts > 1024 tokens (50% discount)
# No configuration needed — it's automatic
```

### Strategy 3: Response Caching

```python
import hashlib
import redis
import json

redis_client = redis.Redis(host="localhost", port=6379)

def cache_key(prompt: str, model: str, temperature: float) -> str:
    content = f"{model}:{temperature}:{prompt}"
    return f"llm:{hashlib.sha256(content.encode()).hexdigest()}"

async def cached_llm_call(
    prompt: str,
    model: str = "gpt-4o-mini",
    temperature: float = 0,
    ttl_seconds: int = 3600,
) -> str:
    # Only cache deterministic calls (temperature=0)
    if temperature > 0:
        return await _call_llm(prompt, model, temperature)

    key = cache_key(prompt, model, temperature)

    # Check cache
    cached = redis_client.get(key)
    if cached:
        return json.loads(cached)["response"]

    # Call LLM
    response = await _call_llm(prompt, model, temperature)

    # Store in cache
    redis_client.setex(key, ttl_seconds, json.dumps({"response": response}))
    return response

# Semantic cache (same meaning → same cache hit)
# "What's the weather?" and "Tell me the weather" → same key
from langchain_community.cache import GPTCache
```

### Strategy 4: Batching

```python
# OpenAI Batch API — 50% cheaper, up to 24h async processing
from openai import OpenAI
import jsonl

client = OpenAI()

# Create batch file
requests = [
    {
        "custom_id": f"request-{i}",
        "method": "POST",
        "url": "/v1/chat/completions",
        "body": {
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": f"Summarize: {doc}"}],
        }
    }
    for i, doc in enumerate(documents)
]

# Submit batch
batch_file = client.files.create(
    file=jsonl.dumps(requests).encode(),
    purpose="batch"
)
batch = client.batches.create(
    input_file_id=batch_file.id,
    endpoint="/v1/chat/completions",
    completion_window="24h",
)

# Poll for completion (or use webhook)
while batch.status not in ("completed", "failed"):
    time.sleep(60)
    batch = client.batches.retrieve(batch.id)

# Download results
results = client.files.content(batch.output_file_id)
```

---

## Rate Limiting & Retry Logic

```python
import asyncio
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
import openai

# Rate limit: OpenAI free tier = 3 RPM, tier 1 = 500 RPM
# Strategy: exponential backoff with jitter

@retry(
    retry=retry_if_exception_type(openai.RateLimitError),
    wait=wait_exponential(multiplier=1, min=1, max=60),
    stop=stop_after_attempt(5),
)
async def resilient_llm_call(messages: list) -> str:
    return await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
    )

# Token bucket rate limiter for your own API
import asyncio
from collections import deque
from datetime import datetime

class TokenBucket:
    def __init__(self, rate: int, per_seconds: int = 60):
        self.rate = rate
        self.per_seconds = per_seconds
        self.tokens = deque()

    async def acquire(self):
        now = datetime.now().timestamp()
        # Remove old tokens
        while self.tokens and self.tokens[0] < now - self.per_seconds:
            self.tokens.popleft()

        if len(self.tokens) >= self.rate:
            # Wait until oldest token expires
            sleep_time = self.per_seconds - (now - self.tokens[0])
            await asyncio.sleep(sleep_time)

        self.tokens.append(now)

# Per-user rate limiting
user_buckets: dict[str, TokenBucket] = {}

def get_user_bucket(user_id: str) -> TokenBucket:
    if user_id not in user_buckets:
        user_buckets[user_id] = TokenBucket(rate=10, per_seconds=60)  # 10/min per user
    return user_buckets[user_id]
```

---

## Fallback & Circuit Breaker

```python
# Fallback: try primary model, fall back to secondary on failure
async def llm_with_fallback(messages: list) -> str:
    providers = [
        ("gpt-4o-mini", call_openai),
        ("claude-haiku-4-5", call_anthropic),
        ("llama-3.3-70b-groq", call_groq),  # local/cheap fallback
    ]

    for model_name, call_fn in providers:
        try:
            return await asyncio.wait_for(
                call_fn(messages),
                timeout=10.0
            )
        except (openai.APIError, anthropic.APIError, asyncio.TimeoutError) as e:
            print(f"Provider {model_name} failed: {e}. Trying next...")
            continue

    raise RuntimeError("All LLM providers failed")

# Circuit breaker: stop calling a failing service
import circuitbreaker

@circuitbreaker.circuit(failure_threshold=5, recovery_timeout=30)
async def call_openai(messages: list) -> str:
    response = await openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages
    )
    return response.choices[0].message.content
# After 5 failures in a row: circuit opens, calls skip OpenAI for 30s
# After 30s: circuit half-opens, tries again
```

---

## Streaming in Production

```python
# FastAPI SSE streaming endpoint (production pattern)
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
import asyncio

app = FastAPI()
llm = ChatOpenAI(model="gpt-4o-mini", streaming=True)

@app.post("/chat/stream")
async def chat_stream(request: Request, body: ChatRequest):
    chain = ChatPromptTemplate.from_messages([
        ("system", "You are a helpful assistant."),
        ("user", "{message}")
    ]) | llm

    async def event_generator():
        try:
            async for chunk in chain.astream({"message": body.message}):
                if await request.is_disconnected():
                    break  # Client disconnected, stop generating
                content = chunk.content
                if content:
                    yield f"data: {json.dumps({'text': content})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        }
    )
```

---

## Observability & Monitoring

```python
# 1. LangSmith (LangChain native tracing)
import os
os.environ["LANGCHAIN_TRACING_V2"] = "true"
os.environ["LANGCHAIN_API_KEY"] = "ls__..."
# Automatic — just set env vars, all calls are traced

# 2. Custom structured logging
import structlog
from datetime import datetime

log = structlog.get_logger()

async def traced_llm_call(
    user_id: str,
    session_id: str,
    query: str,
    chain,
) -> str:
    start = datetime.now()

    try:
        result = await chain.ainvoke({"question": query})
        duration_ms = (datetime.now() - start).total_seconds() * 1000

        log.info(
            "llm_call.success",
            user_id=user_id,
            session_id=session_id,
            query_length=len(query),
            response_length=len(result),
            duration_ms=round(duration_ms),
            model=chain.steps[-1].model_name,
        )
        return result

    except Exception as e:
        log.error(
            "llm_call.error",
            user_id=user_id,
            session_id=session_id,
            error=str(e),
            error_type=type(e).__name__,
        )
        raise

# 3. Metrics to track
# - p50/p95/p99 latency per model
# - Token usage per user/session/day
# - Error rate per model/endpoint
# - Cache hit rate
# - Retrieval quality scores (faithfulness, relevancy)
# - Cost per user/feature

# 4. Langfuse (open-source alternative to LangSmith)
from langfuse.callback import CallbackHandler

langfuse_handler = CallbackHandler(
    public_key="pk-...",
    secret_key="sk-...",
    host="https://cloud.langfuse.com"
)

result = chain.invoke(
    {"question": query},
    config={"callbacks": [langfuse_handler]}
)
```

---

## Multi-Tenancy

```python
# Critical: tenant isolation prevents data leakage between customers

# 1. Vector store isolation (namespace-based)
async def get_user_vectorstore(tenant_id: str):
    # Option A: Separate collections per tenant (strong isolation)
    return Chroma(
        collection_name=f"tenant_{tenant_id}",
        embedding_function=embeddings
    )

    # Option B: Shared collection with metadata filter (resource-efficient)
    return vectorstore.as_retriever(
        search_kwargs={
            "k": 5,
            "filter": {"tenant_id": tenant_id}  # ALWAYS filter!
        }
    )

# 2. Never mix tenant data in context
async def rag_response(query: str, tenant_id: str, user_id: str) -> str:
    # Get tenant-specific retriever
    retriever = (await get_user_vectorstore(tenant_id)).as_retriever()

    # Verify retrieved docs belong to this tenant
    docs = retriever.invoke(query)
    for doc in docs:
        assert doc.metadata["tenant_id"] == tenant_id, "Tenant isolation violated!"

    return await generate_response(query, docs)

# 3. Rate limiting per tenant
class TenantRateLimiter:
    def __init__(self):
        self._buckets: dict[str, TokenBucket] = {}

    def get_bucket(self, tenant_id: str, plan: str) -> TokenBucket:
        limits = {"free": 100, "pro": 1000, "enterprise": 10000}
        if tenant_id not in self._buckets:
            self._buckets[tenant_id] = TokenBucket(
                rate=limits.get(plan, 100),
                per_seconds=60
            )
        return self._buckets[tenant_id]
```

---

## Key Production Numbers

```
Target metrics:
  P95 latency:  < 2 seconds (with streaming: time-to-first-token < 200ms)
  Error rate:   < 0.1% (with fallbacks)
  Cache hit rate: 20-40% for similar workloads
  Token efficiency: context < 4096 tokens for gpt-4o-mini (cost-optimal)

Cost targets:
  Simple Q&A:          $0.001-0.005 per query (gpt-4o-mini)
  RAG with reranking:  $0.005-0.02 per query
  Complex agent:       $0.05-0.50 per task (variable)
  Fine-tuned model:    $0.0003-0.001 per query (much cheaper at scale)

Alert thresholds:
  > $100/hour unexpected spend → alert
  > 5% error rate for 5 minutes → page on-call
  > 10s P95 latency → degraded service alert
  > 95% of token quota used → request limit increase
```
