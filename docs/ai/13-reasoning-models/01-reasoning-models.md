# Reasoning Models

Reasoning models (o1, o3, DeepSeek R1, Claude Extended Thinking) spend extra compute "thinking" before responding. They dramatically outperform standard models on problems requiring multi-step logic, math, and code.

---

## What Makes a Reasoning Model Different

Standard model:
```
User: "If I have 17 apples and give away 1/3, how many do I have?"
→ Immediately generates: "You have about 11 apples."  (wrong: 17/3 = 5.67, keep ≈ 11.33 ✓ — actually right)
```

Reasoning model:
```
User: same question
→ [internal chain of thought — not shown to user]
   <thinking>
   17 apples. Give away 1/3.
   1/3 × 17 = 5.666... ≈ 5 or 6 apples given away.
   Remaining: 17 - floor(17/3) = 17 - 5 = 12, or 17 - round(5.67) = 11
   The question says "give away 1/3" — exact: 17 × (2/3) = 11.33
   If integers: 11 apples remain after giving away 5 (floor of 17/3 = 5.67)
   </thinking>
→ "You have 11 apples remaining (17 − ⌊17/3⌋ = 17 − 5 = 12, or exactly 11.33 if fractional)."
```

The model allocates extra inference-time compute for complex reasoning rather than baking it into more training.

---

## OpenAI o-Series

### o1 / o3 / o4-mini

```python
from openai import OpenAI

client = OpenAI()

# o4-mini — fastest reasoning model, cost-effective
response = client.chat.completions.create(
    model="o4-mini",
    messages=[
        {"role": "user", "content": "Design a rate limiter that handles 100K RPS with burst tolerance. Give me the algorithm and data structures."},
    ],
    # NOTE: no temperature, no system role support on o1/o3 (o4-mini supports system)
)
print(response.choices[0].message.content)
print(f"Reasoning tokens: {response.usage.completion_tokens_details.reasoning_tokens}")

# o3 — best reasoning, most expensive
response = client.chat.completions.create(
    model="o3",
    messages=[{"role": "user", "content": "Prove that sqrt(2) is irrational."}],
    reasoning_effort="high",   # "low" | "medium" | "high"
)
```

**Reasoning effort levels:**
- `low`    — fastest, cheapest, ~1–2 reasoning steps
- `medium` — balanced (default)
- `high`   — most thorough, for hard problems

### Key Differences vs GPT-4o

| Aspect | GPT-4o | o-series |
|---|---|---|
| Response time | Fast (~1–3s) | Slower (5–30s+) |
| Cost per token | Lower | 2–10x higher |
| Multi-step reasoning | Good | Excellent |
| Creative writing | Excellent | Just OK |
| Simple Q&A | ✅ Fine | Overkill |
| Hard math/code | ❌ Often fails | ✅ Reliable |
| System prompt | ✅ | Partial (o1: `developer` role instead) |
| Streaming | ✅ | ✅ |
| Tool use | ✅ | ✅ |

---

## Claude Extended Thinking

Anthropic's answer to o-series reasoning. Works on Claude Sonnet 4.5+ and Opus models.

```python
import anthropic

client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=16000,
    thinking={
        "type": "enabled",
        "budget_tokens": 10000,    # how many tokens to spend thinking (1024–16000+)
    },
    messages=[{
        "role": "user",
        "content": "Implement a distributed consensus algorithm (Raft) in Python. Explain each part.",
    }],
)

# Response has two content blocks:
for block in response.content:
    if block.type == "thinking":
        print("=== Claude's Thinking ===")
        print(block.thinking)         # the internal CoT (can be hidden from users)
    elif block.type == "text":
        print("=== Final Answer ===")
        print(block.text)

print(f"Thinking tokens used: {response.usage.cache_read_input_tokens}")
```

**Streaming extended thinking:**
```python
with client.messages.stream(
    model="claude-sonnet-4-6",
    max_tokens=8000,
    thinking={"type": "enabled", "budget_tokens": 5000},
    messages=[{"role": "user", "content": "Solve this step by step: ..."}],
) as stream:
    for event in stream:
        if hasattr(event, 'type'):
            if event.type == 'content_block_start':
                if event.content_block.type == 'thinking':
                    print("[thinking...]")
            elif event.type == 'content_block_delta':
                if event.delta.type == 'text_delta':
                    print(event.delta.text, end='', flush=True)
```

---

## DeepSeek R1 — Open Source Reasoning

DeepSeek R1 is a fully open-source reasoning model that matches o1 on many benchmarks, with public weights.

```python
# Via DeepSeek API (same OpenAI-compatible interface)
from openai import OpenAI

client = OpenAI(
    api_key="your-deepseek-api-key",
    base_url="https://api.deepseek.com",
)

response = client.chat.completions.create(
    model="deepseek-reasoner",   # R1 reasoning model
    messages=[{"role": "user", "content": "What is the time complexity of building a heap?"}],
)

# The model exposes its chain-of-thought
print("Reasoning:", response.choices[0].message.reasoning_content)
print("Answer:   ", response.choices[0].message.content)
```

**Run R1 locally with Ollama:**
```bash
ollama pull deepseek-r1:7b     # 7B — runs on 8GB VRAM
ollama pull deepseek-r1:70b    # 70B — needs ~48GB VRAM or CPU offload
ollama run deepseek-r1:7b
```

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")

response = client.chat.completions.create(
    model="deepseek-r1:7b",
    messages=[{"role": "user", "content": "Implement quicksort and explain the recursion."}],
)
print(response.choices[0].message.content)
```

---

## When to Use Reasoning Models

### Use reasoning models for:
- **Hard algorithms** — DP, graph problems, recursive algorithms
- **Math / proofs** — symbolic math, step-by-step derivations
- **Complex debugging** — multi-file bugs with subtle logic errors
- **Architecture design** — system design tradeoff analysis
- **Multi-constraint optimization** — scheduling, planning, constraint satisfaction
- **Security audits** — finding subtle vulnerabilities in code

### Use standard models for:
- **Simple Q&A** — factual lookups, straightforward explanations
- **Summarization** — doesn't need deep reasoning
- **Creative writing** — standard models are actually better
- **Extraction** — parsing, formatting, classification
- **High-throughput, low-latency** — reasoning models are 5–30x slower

---

## Routing Pattern: Standard → Reasoning Fallback

```python
async def smart_generate(query: str, context: str) -> str:
    # Try fast model first
    answer = await call_llm("gpt-4o-mini", query, context)

    # If the answer contains uncertainty signals, escalate
    uncertainty_signals = [
        "i'm not sure", "i don't know", "it depends", "unclear",
        "could be", "might be", "possibly",
    ]
    if any(sig in answer.lower() for sig in uncertainty_signals):
        answer = await call_llm("o4-mini", query, context)

    return answer
```

---

## Chain-of-Thought Prompting (Standard Models)

If you can't afford reasoning models, CoT prompting improves standard model reasoning:

```python
# Zero-shot CoT
messages = [{"role": "user", "content": f"{question}\n\nLet's think step by step."}]

# Few-shot CoT
messages = [
    {"role": "user", "content": "Q: If I have 5 apples and buy 3 more, how many? Think step by step."},
    {"role": "assistant", "content": "Step 1: I start with 5 apples.\nStep 2: I buy 3 more.\nStep 3: 5 + 3 = 8.\nAnswer: 8 apples."},
    {"role": "user", "content": f"Q: {question} Think step by step."},
]

# Self-consistency — generate N answers, take majority vote
import asyncio
from collections import Counter

async def self_consistent_answer(question: str, n: int = 5) -> str:
    answers = await asyncio.gather(*[call_llm(question) for _ in range(n)])
    # Extract final answers and take majority
    return Counter(answers).most_common(1)[0][0]
```

---

## Interview Q&A

**Q: What is "inference-time scaling" and why does it matter?**

Traditional scaling = more training data + larger models. Inference-time scaling = allocating more compute *at inference time* (letting the model "think longer"). o1/o3 and Claude Extended Thinking are examples. The key insight from recent research is that spending more tokens on reasoning at inference time can match the quality of models that are 10x larger, at a fraction of the training cost.

**Q: When would you NOT use a reasoning model in production?**

1. **High-throughput APIs** — if you're serving 1000 requests/second, 10–30s latency per request kills your SLA
2. **Simple tasks** — extracting a date from a string doesn't need 5000 reasoning tokens
3. **Cost-sensitive applications** — o3 can be 50–100x more expensive than gpt-4o-mini per token
4. **Real-time chat** — users tolerate 2s response, not 20s

---

## Links to Refer

- [OpenAI Reasoning Models Guide](https://platform.openai.com/docs/guides/reasoning)
- [Claude Extended Thinking Docs](https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking)
- [DeepSeek R1 Paper](https://arxiv.org/abs/2501.12948)
- [Scaling LLM Test-Time Compute (Google)](https://arxiv.org/abs/2408.03314)
- [Chain-of-Thought Prompting Paper](https://arxiv.org/abs/2201.11903)
