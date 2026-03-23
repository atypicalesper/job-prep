# Prompt Engineering — Tricky Questions

### Q1: You need the LLM to output ONLY valid JSON. Even with "json_mode=true", it still sometimes outputs invalid JSON. Why and how do you fix it?

**Answer:**

Causes:
1. **Truncation** — Output token limit hit mid-JSON → `{"key": "val` (incomplete)
2. **Nested quotes** — Model outputs `{"text": "He said "hello""}` (unescaped quotes)
3. **Comments** — Model adds `// this is the name` inside JSON
4. **Trailing commas** — `{"a": 1, "b": 2,}` — valid in JS, invalid in JSON
5. **Large numbers** — Model writes `{"id": 12345678901234567}` → precision loss when parsed

**Fixes:**
```python
import json
import re

def robust_json_parse(raw: str) -> dict:
    # 1. Extract JSON block if model wrapped it in markdown
    json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', raw, re.DOTALL)
    if json_match:
        raw = json_match.group(1)

    # 2. Try direct parse
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # 3. Try to find JSON object in response
    match = re.search(r'\{[^{}]*\}', raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except:
            pass

    # 4. Use repair library as last resort
    from json_repair import repair_json
    return json.loads(repair_json(raw))

# Prevention: use structured output with explicit schema
# OpenAI: response_format={"type": "json_object"}
# Better: use Pydantic with instructor library
from pydantic import BaseModel
import instructor

class UserInfo(BaseModel):
    name: str
    age: int

client = instructor.from_openai(openai_client)
user = client.chat.completions.create(
    model="gpt-4o",
    response_model=UserInfo,  # Guaranteed type-safe output
    messages=[{"role": "user", "content": "Extract: John is 28 years old"}]
)
# user.name = "John", user.age = 28 — always valid
```

---

### Q2: Your prompt works perfectly in testing but degrades after you add "Be concise." Why?

**Answer:**

"Be concise" is one of the most dangerous instruction words. It causes:

1. **Omission of key reasoning steps** — Model skips CoT steps it previously included
2. **Truncated JSON** — "Be concise" can cause JSON fields to be omitted
3. **Loss of nuance** — Complex situations get oversimplified
4. **Format violations** — Model drops required fields to be "concise"

Instead, specify the format precisely:
```python
# BAD:
"Answer concisely."

# GOOD:
"Return only a JSON object with fields: {result: string, confidence: 0-1}. No other text."
"Answer in exactly one sentence of 20 words or fewer."
"Return a bulleted list of exactly 3 items."
```

The model interprets "concise" differently per context. Explicit format constraints are deterministic.

---

### Q3: How would you handle a prompt that needs to work across GPT-4, Claude, and Gemini?

**Answer:**

Models have different quirks:

```
GPT-4:        Strong instruction following, supports JSON mode
Claude:       Better at long context, doesn't like "pretend you are..."
Gemini:       Different safety filters, multimodal first

Cross-model prompt best practices:
```

```python
class ModelAdapter:
    def adapt_prompt(self, prompt: str, model: str) -> str:
        if "claude" in model:
            # Claude doesn't support system role in same way — use Human/Assistant format
            # Also: Claude responds better to XML tags for structure
            return prompt.replace("JSON format:", "<output_format>JSON</output_format>")

        if "gemini" in model:
            # Gemini has stricter safety filters — avoid certain medical/legal phrasing
            # Also: Gemini Pro has different max output limits
            pass

        return prompt

    def get_fallback_chain(self, primary: str) -> list[str]:
        fallbacks = {
            "gpt-4o": ["gpt-3.5-turbo", "claude-3-haiku"],
            "claude-3-5-sonnet": ["claude-3-haiku", "gpt-3.5-turbo"],
        }
        return fallbacks.get(primary, [])
```

**Key insight:** Write prompts against an abstraction layer, not directly against provider SDKs. Use LangChain, LiteLLM, or your own adapter.

---

### Q4: If you have a 10-step process and ask the LLM to do it all at once vs. in steps, what are the trade-offs?

**Answer:**

```
Single prompt (all 10 steps):
  ✓ Fewer API calls → lower latency, lower cost
  ✓ Model has full context throughout
  ✗ Error propagation — mistake in step 3 affects all subsequent steps
  ✗ Harder to debug — where did it go wrong?
  ✗ Longer output → more likely to hit context limits or truncate
  ✗ Can't parallelize independent steps

Chained prompts (one per step):
  ✓ Can validate/correct each step before proceeding
  ✓ Can run independent steps in parallel
  ✓ Shorter contexts → cheaper and more focused
  ✓ Easy to cache intermediate results
  ✗ More API calls → higher baseline latency
  ✗ Context can get lost between steps (must explicitly pass)

Hybrid approach (best practice):
```

```python
async def process_document(doc: str) -> dict:
    # Step 1: Extract entities (prerequisite for all)
    entities = await llm_call("Extract entities from: " + doc)

    # Steps 2-4: Run in parallel (independent)
    sentiment, summary, topics = await asyncio.gather(
        llm_call(f"Sentiment of: {doc}"),
        llm_call(f"Summarize: {doc}"),
        llm_call(f"Topics in: {doc}"),
    )

    # Step 5: Final synthesis (depends on all above)
    result = await llm_call(f"""
    Entities: {entities}
    Sentiment: {sentiment}
    Summary: {summary}
    Topics: {topics}

    Generate final report:
    """)

    return result
```

---

### Q5: "Prompt caching" sounds useful but what are the hidden gotchas?

**Answer:**

```python
# OpenAI automatic prompt caching:
# Caches prefix of prompt if identical across requests
# 50% cost reduction on cache hits

# GOTCHA 1: Cache invalidation is time-based
# Cache expires after 5-10 minutes of inactivity
# Bursty traffic = many cache misses

# GOTCHA 2: Only prefix caching
# The ENTIRE prefix must match exactly — even 1 character difference = cache miss
bad_prompt = f"Today is {datetime.now()}. You are a helpful assistant..."  # Cache miss every second!
good_prompt = f"You are a helpful assistant... [STATIC CONTENT]"  # Cache hit

# GOTCHA 3: Order matters
# Put the STATIC part (system prompt, few-shot examples) FIRST
# Put DYNAMIC part (user query, retrieved docs) LAST

# GOTCHA 4: Model version changes bust cache
# "gpt-4o" might be silently updated — different model = cache miss

# GOTCHA 5: Doesn't help with output caching
# If you need to cache the full response (same question → same answer),
# use semantic caching (GPTCache, Redis with embedding similarity):

from gptcache import cache
cache.init()  # Returns cached response for semantically similar queries
```
