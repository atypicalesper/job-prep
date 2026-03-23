# AI in Production — Interview Questions

### Q1: Your AI feature is costing $50k/month. The CEO asks you to cut it by 60%. Walk through your strategy.

**Answer:**

```
Start with measurement first:
  - Break down cost by: model, feature, user tier
  - Find the 80/20: usually 20% of queries cost 80% of money

Step 1: Model downgrade (biggest win)
  gpt-4o → gpt-4o-mini for simple queries = 16x cheaper
  Classify queries: simple (70%) vs complex (30%)
  Simple: gpt-4o-mini @ $0.15/M input
  Complex: gpt-4o @ $2.50/M input
  Blended savings: ~65% without quality loss on simple tasks

Step 2: Prompt caching
  Static system prompt + knowledge base cached = 90% discount on cached tokens
  For apps with long system prompts: 30-50% cost reduction

Step 3: Response caching
  Temperature=0 calls with same input → Redis cache
  Typical hit rate: 20-40% for FAQ-like workloads

Step 4: Context optimization
  Trim retrieved context to top-3 instead of top-10
  Summarize chat history instead of sending full history
  Typical: 40% token reduction

Step 5: Batching
  Async jobs (reports, summaries) → OpenAI Batch API = 50% discount
  Not applicable to real-time chat but useful for bulk processing

Result:
  Baseline:    $50k/month
  After step 1: ~$17k (model routing)
  After step 2: ~$12k (prompt caching)
  After step 3: ~$8k (response caching)
  After steps 4+5: ~$5-6k (context trim + batching)
  Total savings: ~88% — exceeds the 60% target
```

---

### Q2: Your RAG chatbot is suddenly responding very slowly (8+ seconds). How do you diagnose and fix it?

**Answer:**

```python
# Diagnosis — instrument the pipeline to find the bottleneck

import time

async def timed_rag(query: str) -> dict:
    timings = {}

    # 1. Embedding the query
    t0 = time.time()
    query_embedding = await embed_query(query)
    timings["embed"] = time.time() - t0

    # 2. Vector search
    t0 = time.time()
    docs = await vectorstore.asimilarity_search_by_vector(query_embedding, k=5)
    timings["retrieval"] = time.time() - t0

    # 3. Reranking
    t0 = time.time()
    reranked = await rerank(query, docs)
    timings["reranking"] = time.time() - t0

    # 4. LLM generation
    t0 = time.time()
    response = await llm.ainvoke(build_prompt(query, reranked))
    timings["generation"] = time.time() - t0

    print(timings)
    # Example output that reveals the bottleneck:
    # {"embed": 0.05, "retrieval": 6.2, "reranking": 0.3, "generation": 1.5}
    # → Retrieval is the problem!
    return {"response": response, "timings": timings}

# Fix based on bottleneck found:

# Bottleneck: Retrieval (slow vector search)
# - Check: is there a vector index? (HNSW or IVFFlat)
# - pgvector: CREATE INDEX ON embeddings USING ivfflat (embedding vector_cosine_ops)
# - Check: too many dimensions? Try dimensionality reduction
# - Check: too many documents? Add metadata pre-filter to reduce search space

# Bottleneck: LLM Generation (slow inference)
# - Use streaming (perceived faster, same actual latency)
# - Switch to faster model (gpt-4o-mini vs gpt-4o: 2x-3x faster)
# - Reduce context length (fewer tokens = faster response)
# - Consider Groq for 10x faster inference on open models

# Bottleneck: Embedding
# - Cache embeddings for common queries
# - Use smaller, faster embedding model (all-MiniLM vs text-embedding-ada)
# - Run embedding model locally (eliminates network roundtrip)

# Bottleneck: Network latency
# - Deploy LLM in same region as your API
# - Use connection pooling for vector DB
# - Pre-warm connections (cold start issue)
```

---

### Q3: How do you handle API key management for multiple LLM providers in production?

**Answer:**

```python
# WRONG: Hardcoded or in .env files committed to git
OPENAI_API_KEY = "sk-abc123"  # NEVER

# CORRECT: Secrets manager

# AWS Secrets Manager
import boto3
import json

def get_secret(secret_name: str) -> dict:
    client = boto3.client("secretsmanager", region_name="us-east-1")
    response = client.get_secret_value(SecretId=secret_name)
    return json.loads(response["SecretString"])

# Cached + refreshed
from functools import lru_cache
from datetime import datetime, timedelta

_secret_cache: dict = {}
_secret_expiry: dict = {}

def get_cached_secret(name: str, ttl_minutes: int = 5) -> str:
    now = datetime.now()
    if name not in _secret_cache or now > _secret_expiry.get(name, now):
        secrets = get_secret(name)
        _secret_cache[name] = secrets
        _secret_expiry[name] = now + timedelta(minutes=ttl_minutes)
    return _secret_cache[name]

# Best practices:
# 1. Separate key per service/environment (dev/staging/prod)
# 2. Least privilege: each service gets only the keys it needs
# 3. Rotation: rotate keys every 90 days (or immediately on breach)
# 4. Monitoring: alert on any key usage outside normal patterns
# 5. Never log API keys — scrub from all log outputs
# 6. Budget alerts: set spend limits on OpenAI / Anthropic dashboards
```

---

### Q4: How do you implement graceful degradation when the LLM API is down?

**Answer:**

```python
# Graceful degradation: always have a fallback

from enum import Enum

class AIMode(Enum):
    FULL = "full"          # All AI features active
    DEGRADED = "degraded"  # Fallback to simpler responses
    MAINTENANCE = "off"    # All AI off, show static message

# Circuit breaker pattern
class AICircuitBreaker:
    def __init__(self, failure_threshold: int = 5, recovery_seconds: int = 60):
        self.failures = 0
        self.threshold = failure_threshold
        self.recovery_seconds = recovery_seconds
        self.last_failure_time: float | None = None
        self.mode = AIMode.FULL

    def record_failure(self):
        self.failures += 1
        self.last_failure_time = time.time()
        if self.failures >= self.threshold:
            self.mode = AIMode.DEGRADED
            log.warning("AI circuit breaker OPEN — using fallback mode")

    def record_success(self):
        self.failures = 0
        if self.mode == AIMode.DEGRADED:
            self.mode = AIMode.FULL
            log.info("AI circuit breaker CLOSED — full mode restored")

    def should_try(self) -> bool:
        if self.mode == AIMode.FULL:
            return True
        # In degraded mode, try again after recovery_seconds
        if self.last_failure_time and time.time() - self.last_failure_time > self.recovery_seconds:
            self.mode = AIMode.FULL
            self.failures = 0
        return self.mode == AIMode.FULL

breaker = AICircuitBreaker()

async def smart_ai_response(query: str) -> str:
    if not breaker.should_try():
        # Fallback: use rule-based responses or cached FAQ
        return get_cached_faq_response(query) or "I'm having trouble right now. Please try again in a few minutes."

    try:
        response = await call_llm(query)
        breaker.record_success()
        return response
    except Exception as e:
        breaker.record_failure()
        log.error("AI call failed", error=str(e))
        return "I'm temporarily unavailable. Our team has been notified."
```

---

### Q5: What metrics do you monitor in a production AI system and what are your alert thresholds?

**Answer:**

```
Operational Metrics:
┌────────────────────────┬───────────────┬─────────────────────┐
│ Metric                 │ Normal Range  │ Alert Threshold     │
├────────────────────────┼───────────────┼─────────────────────┤
│ P50 latency            │ 0.5-1s        │ > 3s                │
│ P95 latency            │ 2-3s          │ > 8s                │
│ P99 latency            │ 4-6s          │ > 15s               │
│ Time-to-first-token    │ 100-300ms     │ > 1s                │
│ Error rate             │ < 0.1%        │ > 1% for 5min       │
│ Timeout rate           │ < 0.01%       │ > 0.5%              │
└────────────────────────┴───────────────┴─────────────────────┘

Cost Metrics:
┌────────────────────────┬───────────────┬─────────────────────┐
│ Cost per query         │ $0.001-0.02   │ > $0.10 (investigate)│
│ Total hourly spend     │ baseline ± 20%│ > 2x baseline       │
│ Token/query (input)    │ 500-2000      │ > 8000 (context leak)│
│ Token/query (output)   │ 100-500       │ > 2000              │
│ Cache hit rate         │ 20-40%        │ < 5% (cache broken?)│
└────────────────────────┴───────────────┴─────────────────────┘

Quality Metrics (sampled):
┌────────────────────────┬───────────────┬─────────────────────┐
│ Faithfulness score     │ > 0.85        │ < 0.70              │
│ User satisfaction      │ > 4.0/5       │ < 3.5/5             │
│ Thumbs up/down ratio   │ > 80% positive│ < 60% positive      │
│ Refusal rate           │ < 2%          │ > 10%               │
│ Hallucination rate     │ < 5%          │ > 15%               │
└────────────────────────┴───────────────┴─────────────────────┘

# Dashboard alert setup (pseudocode):
alerts = [
    Alert("p95_latency > 8s for 3/5 data points", "page oncall"),
    Alert("error_rate > 1% sustained 5min", "page oncall"),
    Alert("hourly_cost > 2x baseline", "notify team channel"),
    Alert("quality_score < 0.70 from 10-sample window", "notify team"),
]
```
