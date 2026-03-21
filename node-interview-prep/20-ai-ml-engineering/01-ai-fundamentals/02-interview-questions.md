# AI Fundamentals — Interview Questions

## Common Questions

### Q1: What is the difference between AI, Machine Learning, and Deep Learning?

**Answer:**
```
AI ⊃ ML ⊃ Deep Learning

AI — any technique that enables machines to mimic human intelligence
     (rule-based systems count as AI too)

ML — a subset of AI where systems learn from data without being explicitly programmed
     (algorithm finds patterns in data to make predictions)

Deep Learning — a subset of ML using multi-layer neural networks
                (automatically extracts hierarchical features)

Example:
  Spam filter using hand-coded rules → AI (not ML)
  Spam filter using logistic regression on email features → ML
  Spam filter using BERT to understand email content → Deep Learning
```

---

### Q2: What is a transformer and why did it replace RNNs for language tasks?

**Answer:**

RNNs had two key problems:
1. **Sequential processing** — token N can't be processed until token N-1 is done → slow
2. **Vanishing gradients** — gradients shrink as they flow back through long sequences → forgets early context

Transformers solve both:
- **Parallel processing** — all tokens processed simultaneously (attention computed in parallel)
- **Self-attention** — every token directly attends to every other token → no vanishing gradient over distance

```python
# RNN (sequential — can't parallelize)
h_t = tanh(W_h * h_{t-1} + W_x * x_t)  # must wait for h_{t-1}

# Attention (parallel — all tokens at once)
Attention(Q, K, V) = softmax(QKᵀ / √d_k) * V
# Q, K, V computed for all tokens simultaneously
```

---

### Q3: What is hallucination and how do you mitigate it?

**Answer:**

Hallucination is when an LLM generates fluent-sounding but factually incorrect information. It happens because models are trained to produce probable next tokens, not verified facts.

**Mitigation strategies:**

| Strategy | How it works |
|----------|-------------|
| **RAG** | Ground answers in retrieved documents |
| **Lower temperature** | More deterministic outputs |
| **Chain-of-thought** | Prompt model to reason step-by-step |
| **Self-consistency** | Generate multiple answers, take majority |
| **Fact-checking layer** | Second LLM call to verify claims |
| **Structured output** | JSON schema forces specific format |
| **Prompt: "Say I don't know"** | Explicitly instruct model to express uncertainty |

```python
# Example: RAG to reduce hallucination
context = retrieve_relevant_docs(query)
prompt = f"""
Answer ONLY based on the following context.
If the answer is not in the context, say "I don't know."

Context: {context}
Question: {query}
"""
```

---

### Q4: Explain the difference between fine-tuning and RAG. When do you use each?

**Answer:**

```
Fine-tuning                         RAG
─────────────────────────────────   ─────────────────────────────────
Updates model weights               No weight updates
Learns style/behavior/format        Learns facts at query time
Static knowledge (point in time)    Dynamic — update docs anytime
Expensive to update                 Cheap to update
Good for: tone, format, domain      Good for: factual Q&A, up-to-date info
         vocabulary                          private knowledge bases

Example use cases:
Fine-tune: customer service tone,   RAG: "What's in our docs?",
           code style, legal        legal precedent lookup,
           document format          product FAQ, company policies
```

**Rule of thumb:** If you need the model to *know* something → RAG. If you need the model to *behave* differently → fine-tune.

---

### Q5: What is the context window and why does it matter in production?

**Answer:**

The context window is the maximum number of tokens an LLM can process in one request (input + output combined).

```
Model             Context Window
─────────────────────────────────
GPT-3.5           16k tokens
GPT-4o            128k tokens
Claude 3.5        200k tokens
Gemini 1.5 Pro    1M tokens

1 page of text ≈ 750 tokens
Full novel (300 pages) ≈ 225k tokens
```

**Why it matters:**
1. **Cost** — every token costs money (both input and output)
2. **Latency** — more tokens = slower response
3. **"Lost in the middle"** — LLMs recall beginning and end of context better than middle
4. **Chunking strategy** — determines how you split docs for RAG

---

### Q6: What is tokenization and why do some words cost more tokens than others?

**Answer:**

Tokenization splits text into subword units using algorithms like **BPE (Byte Pair Encoding)** or **SentencePiece**.

```python
# English - efficient
"Hello" → 1 token
"running" → 1 token

# Non-English - less efficient (less training data → smaller chunks)
"こんにちは" (Japanese: hello) → 3 tokens
"مرحبا" (Arabic: hello) → 4 tokens

# Rare words - split into subwords
"supercalifragilistic" → 6 tokens
"GPT-4o" → 4 tokens

# Numbers treated character by character
"12345" → 3 tokens
"1, 2, 3, 4, 5" → 9 tokens
```

**Production impact:** APIs price by token. A prompt with many numbers, special characters, or non-English text costs more than expected.

---

### Q7: What is temperature and when do you change it?

**Answer:**

Temperature controls the randomness of token sampling.

```
Temperature 0.0  → always pick highest-probability token (deterministic)
Temperature 0.7  → balanced (default for most tasks)
Temperature 1.0  → sample proportionally from distribution
Temperature 2.0  → very random / creative / incoherent

Use cases:
─────────────────────────────────────────────────
Task                           Recommended Temp
─────────────────────────────────────────────────
Code generation                0.0 - 0.2
Factual Q&A / RAG              0.0 - 0.3
Summarization                  0.3 - 0.5
General chat                   0.7
Creative writing               0.9 - 1.2
Brainstorming                  1.0 - 1.5
```

---

### Q8: What is the difference between embeddings and one-hot encoding?

**Answer:**

```
One-hot encoding:
"cat" → [0, 0, 1, 0, 0, 0, 0, ...] (50000 zeros, one 1)
"dog" → [0, 1, 0, 0, 0, 0, 0, ...]
Problem: no similarity — "cat" and "dog" are equally "different"
         high dimensional — one dimension per vocabulary word

Embeddings:
"cat" → [0.2, -0.4, 0.8, 0.1, ...]  (dense, 768-3072 dimensions)
"dog" → [0.3, -0.3, 0.7, 0.2, ...]  (similar vector!)
"car" → [-0.5, 0.9, -0.2, 0.8, ...]  (different direction)

Benefits:
- Capture semantic similarity (cosine similarity)
- Compress vocabulary into manageable dimensions
- Learnable — model learns what dimensions mean
- Transferable — pre-trained embeddings work across tasks
```

---

### Q9: What is RLHF and how does it make models like ChatGPT?

**Answer:**

RLHF (Reinforcement Learning from Human Feedback) is a 3-stage process:

```
Stage 1: Supervised Fine-tuning (SFT)
  - Human labelers write ideal responses to prompts
  - Base model fine-tuned on these (prompt, ideal response) pairs
  - Model learns the desired format/style

Stage 2: Reward Model Training
  - Given prompt + multiple responses, human ranks them
  - Reward model learns to predict human preference score
  - e.g. "Response A is better than B" → reward model learns why

Stage 3: PPO (Proximal Policy Optimization)
  - Use RL to maximize reward model score
  - Model generates responses → reward model scores them
  - Model updates toward higher-scoring behavior
  - KL divergence penalty: don't drift too far from SFT model
```

Without RLHF, base models complete text probabilistically and may produce harmful, biased, or unhelpful output. RLHF aligns the model to be **helpful, harmless, and honest**.
