# Prompt Caching

Prompt caching lets API providers reuse the KV (key-value) cache for repeated prompt prefixes — slashing latency and cost for requests that share a large system prompt or context.

---

## How It Works

Without caching, every request re-processes the entire prompt from scratch:
```
Request 1: [system: 5000 tokens][user: "Q1"] → process 5000+1 = 5001 tokens
Request 2: [system: 5000 tokens][user: "Q2"] → process 5000+1 = 5001 tokens  ← waste!
```

With caching, the repeated prefix is computed once and reused:
```
Request 1: [system: 5000 tokens][user: "Q1"] → compute 5001 tokens, cache 5000
Request 2: [CACHED: 5000 tokens][user: "Q2"] → compute 1 token + cache read  ← 5000 tokens free
```

---

## 1. Anthropic Prompt Caching

### How to Use

Mark the parts of your prompt you want cached with `"cache_control": {"type": "ephemeral"}`.

```python
import anthropic

client = anthropic.Anthropic()

# Large document you'll query many times
with open("large_codebase.txt") as f:
    codebase = f.read()  # ~50,000 tokens

def ask_about_code(question: str) -> str:
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=[
            {
                "type": "text",
                "text": "You are an expert code reviewer. Analyze the codebase thoroughly.",
            },
            {
                "type": "text",
                "text": codebase,
                "cache_control": {"type": "ephemeral"},  # ← cache this block
            },
        ],
        messages=[{"role": "user", "content": question}],
    )

    usage = response.usage
    print(f"Input tokens:          {usage.input_tokens}")
    print(f"Cache write tokens:    {usage.cache_creation_input_tokens}")
    print(f"Cache read tokens:     {usage.cache_read_input_tokens}")  # ← free (90% off)
    # Cost: cache_write=full price, cache_read=0.1× price

    return response.content[0].text

# First call: writes cache (full price for 50K tokens)
answer1 = ask_about_code("What are the main modules in this codebase?")

# Second call: reads from cache (10% price for 50K tokens)
answer2 = ask_about_code("Are there any security vulnerabilities?")
```

### Cache Rules

- **Minimum cacheable block:** 1024 tokens (shorter blocks are ignored)
- **Cache TTL:** 5 minutes (ephemeral) — resets with each cache hit
- **Cache write cost:** 1.25× normal input price
- **Cache read cost:** 0.1× normal input price (90% discount)
- **Max cache blocks:** 4 per request (place `cache_control` on up to 4 blocks)

### Multi-Turn with Cached System Prompt

```python
conversation_history = []

SYSTEM_WITH_CACHE = [
    {"type": "text", "text": "You are a helpful coding assistant."},
    {
        "type": "text",
        "text": large_documentation,
        "cache_control": {"type": "ephemeral"},  # cached across turns
    },
]

def chat(user_message: str) -> str:
    conversation_history.append({"role": "user", "content": user_message})

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=SYSTEM_WITH_CACHE,       # same cached system every turn
        messages=conversation_history,
    )

    assistant_message = response.content[0].text
    conversation_history.append({"role": "assistant", "content": assistant_message})
    return assistant_message
```

### Cache Multi-Turn History

For long conversations, cache the history too:

```python
def chat_with_cached_history(user_message: str, history: list) -> str:
    # Mark older history for caching, keep latest turns uncached
    messages = []
    for i, msg in enumerate(history):
        if i < len(history) - 4:  # cache all but last 4 turns
            messages.append({
                "role": msg["role"],
                "content": [
                    {"type": "text", "text": msg["content"],
                     "cache_control": {"type": "ephemeral"}}
                ],
            })
        else:
            messages.append(msg)

    messages.append({"role": "user", "content": user_message})

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=messages,
    )
    return response.content[0].text
```

---

## 2. OpenAI Prompt Caching

OpenAI caches automatically — no opt-in needed. Any prompt prefix ≥ 1024 tokens is eligible.

```python
from openai import OpenAI

client = OpenAI()

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[
        {"role": "system", "content": large_system_prompt},  # ← auto-cached if ≥1024 tokens
        {"role": "user",   "content": "Question 1"},
    ],
)

# Check cache usage
usage = response.usage
print(f"Total input tokens:  {usage.prompt_tokens}")
print(f"Cached tokens:       {usage.prompt_tokens_details.cached_tokens}")  # free
# Cached tokens: 0 cost — full discount (unlike Anthropic's 90%)
```

**OpenAI cache rules:**
- **Automatic** — no opt-in, no `cache_control` headers needed
- **Minimum:** 1024 tokens prefix
- **Cache TTL:** 5–10 minutes of inactivity
- **Cache read cost:** $0 — completely free
- **Cache write cost:** normal pricing (no surcharge unlike Anthropic)
- **Granularity:** 128-token increments

---

## 3. Cost Comparison

Scenario: 100 requests/hour, each with 10K token system prompt + 200 token user message

**Without caching (gpt-4o @ $2.50/1M input):**
```
100 × 10,200 tokens = 1,020,000 tokens/hr
Cost: $2.55/hr = $61.20/day
```

**With OpenAI caching (first request full price, rest free for cached prefix):**
```
First request: 10,200 tokens = $0.026
Next 99 requests: 200 tokens each = $0.005 total
Total: ~$0.031/hr = $0.74/day  ← 98% saving
```

**With Anthropic caching (claude-sonnet-4-6 @ $3/1M input, $0.30/1M cache read):**
```
Write (once per 5 min, 12×/hr): 12 × 10,000 × $3.75/1M = $0.45/hr
Read (remaining 88 requests): 88 × 10,000 × $0.30/1M = $0.26/hr
User tokens: 100 × 200 × $3/1M = $0.06/hr
Total: $0.77/hr vs $30.60/hr without cache = 97.5% saving
```

---

## 4. Best Practices

### Structure your prompt for maximum cache hits

```python
# ✅ GOOD: Static, large content first — small dynamic content last
messages = [
    {"role": "system", "content": static_system_prompt},      # large, never changes
    # Cached by both OpenAI and Anthropic
    {"role": "user", "content": large_doc_for_analysis},      # large, changes per doc
    # Can be cached with Anthropic cache_control
    {"role": "user", "content": user_question},               # small, unique per request
]

# ❌ BAD: Dynamic content interspersed — breaks cache prefix
messages = [
    {"role": "system", "content": f"Today is {datetime.now()}. " + static_prompt},  # changes every second!
    {"role": "user",   "content": user_question},
]
```

### Don't put timestamps or request IDs in cacheable blocks

```python
# ❌ Breaks caching — unique per request
system = f"Request ID: {uuid4()}. You are a helpful assistant..."

# ✅ Put dynamic info in the user message only
system = "You are a helpful assistant..."  # static → cached
user   = f"[Request: {request_id}] {user_question}"  # dynamic → not cached
```

### Warm the cache before traffic spike

```python
import asyncio

async def warm_cache(questions: list[str]):
    """Send a dummy request to pre-populate the cache before load hits."""
    await ask_about_code("warm up cache")  # populates cache for large system prompt
    print("Cache warmed — subsequent requests will use cached prefix")

# Call this at server startup
asyncio.run(warm_cache([]))
```

---

## 5. When Caching Doesn't Help

- **Short system prompts** (< 1024 tokens) — below the minimum threshold
- **Unique prompts per request** — if every request has a different document, cache miss rate is 100%
- **Low request rate** — if you get < 1 request per 5 minutes, cache expires before it's useful
- **Streaming first token** — caching reduces total cost but doesn't improve TTFT (first token latency) unless the cache hit eliminates GPU processing time

---

## Interview Q&A

**Q: What's the difference between semantic caching and prompt caching?**

- **Prompt caching** (Anthropic/OpenAI): Provider-side KV cache for repeated prompt prefixes. Works at the token level — the exact prefix bytes must match. Zero code required for OpenAI; `cache_control` header for Anthropic.
- **Semantic caching** (GPTCache, your own): Application-side cache that stores past (query → answer) pairs and returns cached answers for semantically similar new queries. Doesn't reduce per-token cost but eliminates the LLM call entirely for near-duplicate questions.

Use both: prompt caching reduces cost on every request; semantic caching eliminates the LLM call entirely for repeated questions.

---

## Links to Refer

- [Anthropic Prompt Caching Guide](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- [OpenAI Prompt Caching](https://platform.openai.com/docs/guides/prompt-caching)
- [GPTCache — Semantic Caching](https://github.com/zilliztech/GPTCache)
