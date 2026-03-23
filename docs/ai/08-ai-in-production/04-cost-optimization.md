# AI Cost Optimization

At scale, LLM costs explode fast. A RAG app with 10K daily users at ~$0.01/query = $3,000/month. These techniques reduce that by 60–90%.

---

## Where the Money Goes

```
Typical RAG request cost breakdown:
├── Embedding query               ~$0.00002  (tiny)
├── Embedding for indexing        one-time   (amortized)
├── LLM input tokens (context)    ~$0.003    (BIGGEST cost)
│   ├── System prompt             ~200 tokens
│   ├── Retrieved chunks          ~800 tokens
│   └── Chat history              ~200 tokens
└── LLM output tokens             ~$0.006    (~300 tokens)
Total per request: ~$0.009
```

---

## 1. Token Counting with tiktoken

Know exactly what you're sending before you send it.

```python
import tiktoken

enc = tiktoken.encoding_for_model("gpt-4o")

def count_tokens(text: str, model: str = "gpt-4o") -> int:
    enc = tiktoken.encoding_for_model(model)
    return len(enc.encode(text))

def count_messages_tokens(messages: list[dict], model: str = "gpt-4o") -> int:
    enc = tiktoken.encoding_for_model(model)
    tokens = 3  # every reply primed with <|start|>assistant<|message|>
    for m in messages:
        tokens += 4  # role + message overhead
        tokens += len(enc.encode(m.get("content", "")))
    return tokens

# Budget-aware retrieval: only retrieve as many chunks as fit in your token budget
def budget_chunks(chunks: list, budget: int = 2000) -> list:
    kept, total = [], 0
    for chunk in chunks:
        t = count_tokens(chunk.page_content)
        if total + t > budget:
            break
        kept.append(chunk)
        total += t
    return kept
```

---

## 2. Model Routing — Use Small Models When Possible

Route simple queries to cheap models, complex ones to expensive models.

```python
from openai import OpenAI
import re

client = OpenAI()

COMPLEX_SIGNALS = [
    r'\b(analyze|compare|design|architect|tradeoff|explain.*detail)\b',
    r'\b(step.by.step|comprehensive|in.depth)\b',
]

def route_model(query: str, context_length: int) -> str:
    """Choose model based on query complexity and context size."""
    is_complex = any(re.search(p, query, re.I) for p in COMPLEX_SIGNALS)
    is_long_context = context_length > 3000

    if is_complex or is_long_context:
        return "gpt-4o"           # $5/1M input
    return "gpt-4o-mini"          # $0.15/1M input — 33x cheaper

def generate(query: str, context: str) -> str:
    model = route_model(query, len(context.split()))
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": f"Context:\n{context}"},
            {"role": "user",   "content": query},
        ],
        max_tokens=512,
    )
    return resp.choices[0].message.content

# Result: ~80% of queries go to gpt-4o-mini, saving ~90% of LLM cost
```

---

## 3. Prompt Compression — LLMLingua

[LLMLingua](https://github.com/microsoft/LLMLingua) uses a small model to compress prompts by 2–10x while preserving semantics.

```python
from llmlingua import PromptCompressor

compressor = PromptCompressor(
    model_name="microsoft/llmlingua-2-bert-base-multilingual-cased-meetingbank",
    use_llmlingua2=True,
    device_map="cpu",
)

long_context = "..." * 50  # your retrieved chunks

compressed = compressor.compress_prompt(
    context=[long_context],
    question="What is HNSW?",
    ratio=0.5,               # compress to 50% of original tokens
)

# compressed["compressed_prompt"] — use this instead of the full context
print(f"Original: {compressed['origin_tokens']} tokens")
print(f"Compressed: {compressed['compressed_tokens']} tokens")
print(f"Ratio: {compressed['ratio']:.1f}x")
```

---

## 4. Exact Caching — Cache Identical Requests

Hash the prompt and cache the response. Even a 20% cache hit rate cuts costs significantly.

```python
import hashlib
import json
import redis

r = redis.Redis(host="localhost", port=6379, db=0)
CACHE_TTL = 60 * 60 * 24  # 24 hours

def cache_key(model: str, messages: list) -> str:
    payload = json.dumps({"model": model, "messages": messages}, sort_keys=True)
    return "llm:" + hashlib.sha256(payload.encode()).hexdigest()

def cached_llm_call(model: str, messages: list) -> str:
    key = cache_key(model, messages)
    cached = r.get(key)
    if cached:
        return cached.decode()

    resp = client.chat.completions.create(model=model, messages=messages)
    answer = resp.choices[0].message.content
    r.setex(key, CACHE_TTL, answer)
    return answer
```

---

## 5. Semantic Caching — Cache Similar Questions

Embed the query and check if a semantically similar question was already answered.

```python
import numpy as np
from dataclasses import dataclass

@dataclass
class CachedQuery:
    query: str
    answer: str
    embedding: np.ndarray

class SemanticCache:
    def __init__(self, threshold: float = 0.92):
        self.cache: list[CachedQuery] = []
        self.threshold = threshold

    def _embed(self, text: str) -> np.ndarray:
        resp = client.embeddings.create(model="text-embedding-3-small", input=text)
        emb = np.array(resp.data[0].embedding)
        return emb / np.linalg.norm(emb)

    def get(self, query: str) -> str | None:
        if not self.cache:
            return None
        q_emb = self._embed(query)
        matrix = np.stack([c.embedding for c in self.cache])
        sims = matrix @ q_emb
        best_idx = np.argmax(sims)
        if sims[best_idx] >= self.threshold:
            return self.cache[best_idx].answer
        return None

    def set(self, query: str, answer: str):
        self.cache.append(CachedQuery(
            query=query,
            answer=answer,
            embedding=self._embed(query),
        ))

# Production: use GPTCache or a vector DB for persistent semantic cache
cache = SemanticCache(threshold=0.92)

def answer_with_cache(query: str) -> str:
    cached = cache.get(query)
    if cached:
        return cached  # free!
    answer = rag_pipeline(query)
    cache.set(query, answer)
    return answer
```

**GPTCache (production-grade semantic cache):**
```python
from gptcache import cache
from gptcache.adapter import openai as gptcache_openai

cache.init()  # uses SQLite + FAISS by default

# Drop-in replacement for openai
resp = gptcache_openai.ChatCompletion.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "What is RAG?"}],
)
# Second identical or similar call is served from cache — $0 cost
```

---

## 6. Streaming for Perceived Performance (Not Cost)

Streaming doesn't reduce cost but dramatically improves perceived latency — users see text flowing instead of waiting.

```python
def stream_answer(query: str, context: str):
    stream = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": f"Context:\n{context}"},
            {"role": "user",   "content": query},
        ],
        stream=True,
        max_tokens=512,
    )
    for chunk in stream:
        if chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content

# FastAPI SSE endpoint
from fastapi.responses import StreamingResponse

@app.get("/answer")
async def answer(q: str):
    context = retrieve(q)
    return StreamingResponse(stream_answer(q, context), media_type="text/event-stream")
```

---

## 7. Anthropic Prompt Caching

Anthropic caches the first N tokens of your prompt at 90% discount if reused within 5 minutes.

```python
import anthropic

client = anthropic.Anthropic()

# Mark the system prompt (static part) for caching
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    system=[
        {
            "type": "text",
            "text": "You are a helpful assistant for a RAG system.",
        },
        {
            "type": "text",
            "text": long_document_context,  # large static context
            "cache_control": {"type": "ephemeral"},  # cache this block
        },
    ],
    messages=[{"role": "user", "content": "What is HNSW?"}],
)

# usage.cache_read_input_tokens — tokens served from cache (90% cheaper)
# usage.cache_creation_input_tokens — tokens used to populate cache
print(response.usage)
```

---

## Cost Dashboard Query

```sql
-- PostgreSQL: daily LLM spend by model
SELECT
    date_trunc('day', created_at) AS day,
    model,
    SUM(input_tokens)  AS total_input_tokens,
    SUM(output_tokens) AS total_output_tokens,
    SUM(cost_usd)      AS total_cost_usd
FROM llm_requests
GROUP BY 1, 2
ORDER BY 1 DESC, 4 DESC;
```

---

## Cost Reduction Checklist

| Optimization | Expected saving |
|---|---|
| Route 80% traffic to gpt-4o-mini | ~80% |
| Semantic cache with 0.92 threshold | 20–40% of remaining |
| Trim context to 1500 tokens max | 30% on input |
| Prompt caching (Anthropic) | 90% on cached tokens |
| LLMLingua compression (0.5 ratio) | 50% on context tokens |
| Exact cache for FAQ queries | 100% for matched queries |

**Stack these and a $3,000/month bill becomes ~$200–400/month.**

---

## Links to Refer

- [tiktoken](https://github.com/openai/tiktoken)
- [LLMLingua](https://github.com/microsoft/LLMLingua)
- [GPTCache](https://github.com/zilliztech/GPTCache)
- [Anthropic Prompt Caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- [OpenAI Pricing](https://openai.com/pricing)
