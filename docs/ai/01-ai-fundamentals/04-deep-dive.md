# AI Fundamentals — Deep Dive

## How Transformers Actually Work

```
The attention mechanism (the core of every modern LLM):

For each token in the input:
1. Create Q (query), K (key), V (value) vectors
2. Compute attention scores: Q × K^T / √d_k
3. Softmax → attention weights (sum to 1)
4. Weighted sum of V vectors = attended output

Intuition:
  Q = "what am I looking for?"
  K = "what information do I have?"
  V = "what information do I give?"

  "The cat sat because it was tired"
  When processing "it" → high attention to "cat"
  Q("it") has high similarity with K("cat")

Multi-head attention:
  Run attention multiple times in parallel with different learned projections
  Each "head" can learn different types of relationships:
    Head 1: syntactic (subject-verb)
    Head 2: semantic (synonyms)
    Head 3: positional (nearby tokens)
  Concatenate all heads → linear transform

Why this matters in interviews:
  "Transformers can attend to all positions simultaneously" (vs RNNs, sequential)
  "Attention is O(n²) in context length" (why long context is expensive)
  "KV cache stores K,V for previous tokens, so each new token is fast"
```

---

## Tokenization in Depth

```python
# Tokens ≠ words. Understanding tokenization prevents real bugs.

import tiktoken

enc = tiktoken.get_encoding("cl100k_base")  # GPT-4 tokenizer

# Words → tokens (not 1:1)
examples = {
    "hello": 1,           # Common word = 1 token
    "tokenization": 3,    # ["token", "ization"] = 3 tokens
    "supercalifragilistic": 5,  # Rare = many tokens
    "2024-01-15": 5,      # Dates are expensive
    " hello": 1,          # Space is part of the token (GPT uses byte-pair encoding)
    "hello ": 2,          # Trailing space = separate token
}

# Token counting — critical for cost estimation
def count_tokens(text: str, model: str = "gpt-4") -> int:
    encoding = tiktoken.encoding_for_model(model)
    return len(encoding.encode(text))

# Code is tokenized differently than prose
code_snippet = "def add(a, b):\n    return a + b"
# → ~10 tokens (common keywords = fewer tokens)

# Non-English is MORE expensive
chinese_text = "你好世界"  # → 5 tokens (vs 2 tokens for "hello world")
arabic_text = "مرحبا"     # → 6 tokens

# Practical implications:
# 1. Cost: 1M tokens ≠ 1M words (divide word count by ~0.75 for rough token estimate)
# 2. Context limits: "128k context" ≠ "128k words"
# 3. Some operations inflate token count (JSON has lots of quotes, brackets)

# Reduce token count:
# ✓ Remove whitespace/formatting in prompts where not needed
# ✓ Use abbreviations in system prompts
# ✓ Prefer "Respond in JSON" over repeating schema twice
```

---

## Context Windows — What They Really Mean

```
Context window = total tokens the model "sees" at once
= input tokens + output tokens

Model                Context Window   Effective Use
─────────────────────────────────────────────────────
GPT-4o               128k             ~100k pages of text
Claude 3.5/4         200k             ~150k pages of text
Gemini 1.5 Pro       1M               ~750k pages of text
GPT-4o-mini          128k             Same as GPT-4o

Why context limits matter:

1. Cost: you pay for EVERY token in context on EVERY request
   Chat with 10 turns of 500 tokens each + system prompt = 5500 input tokens per message
   At 100k messages/day: 550M tokens/day = ~$1,375/day at $2.50/M

2. The "lost in the middle" problem
   LLMs pay less attention to information in the middle of context
   Put critical info at start AND end, not buried in middle

3. Context ≠ memory
   LLM has no persistent memory between separate API calls
   Every call starts fresh — you must re-inject conversation history

4. KV cache (key-value cache)
   After processing tokens, their K and V matrices are cached
   Subsequent tokens are fast (O(1) per new token, not O(n²))
   Prompt caching exploits this: static content cached = cheaper

Strategies for long contexts:
  Short context (<8k):   Send everything
  Medium (8k-32k):       Summarize older history
  Long (>32k):           RAG — retrieve relevant sections only
  Very long (>128k):     Map-reduce (process in chunks, combine summaries)
```

---

## Temperature, Top-p, and Sampling

```python
# These control randomness in generation

# Temperature:
# temperature = 0: deterministic (always pick highest probability token)
# temperature = 0.7: balanced — typical for chat
# temperature = 1.0: default distribution
# temperature = 2.0: very random, often incoherent

# Intuition: divides logits before softmax
# Low temp → probabilities become more peaked (winner takes more)
# High temp → probabilities flatten (more randomness)

USE_CASES = {
    "factual Q&A": {"temperature": 0},
    "code generation": {"temperature": 0.1},
    "customer support": {"temperature": 0.3},
    "creative writing": {"temperature": 0.8},
    "brainstorming": {"temperature": 1.0},
}

# Top-p (nucleus sampling):
# Only sample from tokens whose cumulative probability ≥ p
# top_p=0.9: only consider tokens in the top 90% probability mass
# More adaptive than temperature (dynamically adjusts vocab size)

# In practice:
# Change temperature OR top_p, not both
# temperature=0 overrides top_p (deterministic)
# Default: temperature=1, top_p=1 → normal sampling

# Max tokens (max_completion_tokens):
# Hard cap on output length
# Set for cost control AND to prevent runaway responses
# For JSON extraction: set low (500-1000)
# For long-form generation: set appropriately (2000-4000)
# For reasoning (Claude extended thinking): set high (16000+)

from anthropic import Anthropic

client = Anthropic()

response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=1024,
    temperature=0,       # Deterministic for factual extraction
    messages=[{"role": "user", "content": "What is 2+2?"}]
)
```

---

## Model Architecture Trade-offs

```
Scaling laws (Chinchilla, 2022):
  Optimal training: use (model_params × 20) tokens of training data
  GPT-3 (175B params) was undertrained — should have used 3.5T tokens
  This motivated training larger datasets, not just larger models

Model size vs capability:
  7B  models: fast, cheap, good for simple tasks (classification, extraction)
  13B models: better reasoning, still fits on consumer GPU
  70B models: near GPT-4 quality on many tasks, needs multi-GPU
  >100B: state of the art, massive infrastructure

Mixture of Experts (MoE) — how GPT-4 likely works:
  Instead of one dense network, use many smaller "expert" networks
  Router decides which experts to activate per token
  GPT-4 rumored: 8 experts of 220B params each → 1.8T total
  But only 2 experts activate per token → actual compute = ~440B

  Benefits:
    More parameters (capacity) for same compute
    Can specialize experts for different types of content
  Drawbacks:
    Communication overhead in distributed training
    Load balancing (some experts overloaded, others idle)

Quantization:
  float32: 4 bytes per param (32 bits)
  float16/bfloat16: 2 bytes per param → 2x memory savings
  int8: 1 byte per param → 4x memory, slight quality loss
  int4 (GPTQ/AWQ): 0.5 bytes → 8x memory, visible quality loss
  NF4 (QLoRA): 0.5 bytes, better for activations

  7B model memory requirements:
    float32:  28 GB
    float16:  14 GB (standard deployment)
    int8:      7 GB
    int4:      3.5 GB (fine-tunable on consumer GPU)
```

---

## Embedding Models — What You Need to Know

```python
# Embeddings convert text → dense numerical vectors
# Semantically similar text → geometrically close vectors

# Comparing text via cosine similarity:
import numpy as np

def cosine_similarity(a: list[float], b: list[float]) -> float:
    a, b = np.array(a), np.array(b)
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

# Why cosine similarity (not euclidean distance)?
# Cosine measures angle → direction of meaning
# Euclidean measures magnitude → affected by text length
# "cat" and "cat cat cat" → same direction, different magnitude
# Cosine: 1.0 (identical meaning)  Euclidean: large distance

# Popular embedding models:
MODELS = {
    "text-embedding-3-small": {
        "dims": 1536,        # Or truncate to 256/512
        "tokens_limit": 8191,
        "cost": "$0.02/M tokens",  # Very cheap
        "use_for": "General purpose, RAG"
    },
    "text-embedding-3-large": {
        "dims": 3072,
        "tokens_limit": 8191,
        "cost": "$0.13/M tokens",
        "use_for": "Higher accuracy for complex domains"
    },
    "nomic-embed-text": {
        "dims": 768,
        "tokens_limit": 8192,
        "cost": "Free (local)",
        "use_for": "Local/private deployment"
    },
    "BAAI/bge-m3": {
        "dims": 1024,
        "tokens_limit": 8192,
        "cost": "Free (local)",
        "use_for": "Multilingual, best open-source"
    },
}

# Matryoshka embeddings (text-embedding-3 models):
# Can truncate dimensions without re-embedding!
# 1536 → 256 dimensions: 6x smaller, 90% of the quality
# Use for: high-volume scenarios where storage cost matters

from openai import OpenAI

client = OpenAI()
response = client.embeddings.create(
    model="text-embedding-3-small",
    input="The quick brown fox",
    dimensions=256,  # Truncate to 256 dims (Matryoshka)
)
embedding = response.data[0].embedding  # List of 256 floats
```

---

## Key Numbers to Know in Interviews

```
Model Pricing (approximate, as of 2025):
  GPT-4o:           $2.50/M input,  $10.00/M output
  GPT-4o-mini:      $0.15/M input,   $0.60/M output
  Claude Opus 4.6:  $15.00/M input,  $75.00/M output
  Claude Sonnet 4.6: $3.00/M input,  $15.00/M output
  Claude Haiku 4.5:  $0.80/M input,   $4.00/M output
  Groq Llama-3-70b:  $0.59/M input,   $0.79/M output (fastest)

Latency (typical, non-streaming):
  GPT-4o-mini:  500ms-2s
  GPT-4o:       1-4s
  Claude Sonnet: 1-3s
  Claude Opus:   2-8s
  Groq Llama-3: 200-800ms (10x faster inference)

Context windows:
  GPT-4o:          128k tokens
  Claude 3.5+:     200k tokens
  Gemini 1.5 Pro:  1M tokens

Approximate token-to-word ratio: 1 token ≈ 0.75 words

Embedding dimensions:
  OpenAI small: 1536 (or 256-512 truncated)
  OpenAI large: 3072
  Most open source: 384-1024

RAG performance benchmarks (good system):
  Faithfulness: > 0.85
  Answer relevancy: > 0.80
  Context precision: > 0.75
  Retrieval latency (pgvector + HNSW): < 50ms for 1M docs
```
