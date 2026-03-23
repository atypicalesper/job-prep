# AI Fundamentals for Software Engineers

## The AI Landscape — What You Actually Need to Know

AI is not one thing. As a software engineer, you need to understand where LLMs sit in the bigger picture and why certain architectural decisions exist.

---

## Types of Artificial Intelligence

```
┌──────────────────────────────────────────────────────────┐
│                   Types of AI by Scope                   │
│                                                          │
│  Narrow AI (ANI)   →  does one thing very well          │
│  e.g. GPT-4, DALL-E, AlphaGo, Spotify recommendations   │
│                                                          │
│  General AI (AGI)  →  human-level reasoning             │
│  e.g. hypothetical — does NOT exist yet                  │
│                                                          │
│  Super AI (ASI)    →  beyond human intelligence         │
│  e.g. science fiction — does NOT exist yet               │
└──────────────────────────────────────────────────────────┘
```

**Everything you use today is Narrow AI.** GPT-4, Claude, Gemini — all narrow AI systems that are very good at language tasks.

---

## Types of Machine Learning

```
Machine Learning
├── Supervised Learning
│   ├── Labeled data (input → expected output)
│   ├── Examples: spam detection, image classification, price prediction
│   └── Algorithms: linear regression, decision trees, neural nets
│
├── Unsupervised Learning
│   ├── No labels — find patterns in raw data
│   ├── Examples: customer clustering, anomaly detection
│   └── Algorithms: k-means, DBSCAN, PCA, autoencoders
│
├── Semi-supervised Learning
│   ├── Small labeled set + large unlabeled set
│   └── Examples: GPT pre-training (predict next token — self-supervised)
│
├── Reinforcement Learning (RL)
│   ├── Agent takes actions in environment, gets reward/penalty
│   ├── Examples: game playing (AlphaGo), robot control, RLHF
│   └── Key: exploration vs exploitation tradeoff
│
└── Self-supervised Learning
    ├── Labels generated from the data itself
    └── Foundation of LLM training (next-token prediction)
```

---

## Neural Networks & Deep Learning

### The Neuron Analogy (simplified)

```
Input features × Weights + Bias → Activation Function → Output

x₁ ──w₁──┐
x₂ ──w₂──┤──[Σ + bias]──[ReLU/Sigmoid]──→ output
x₃ ──w₃──┘
```

### Key Concepts

| Term | Meaning | Why it matters |
|------|---------|----------------|
| **Layer** | Group of neurons processing together | Depth = more abstract features learned |
| **Weights** | Learnable parameters | What gets updated during training |
| **Backpropagation** | Gradient flows backward to update weights | How neural nets learn |
| **Gradient Descent** | Minimize loss by moving toward gradient | Optimization mechanism |
| **Overfitting** | Model memorizes training data | Use dropout, regularization, more data |
| **Epoch** | One full pass over training data | More epochs ≠ always better |
| **Batch Size** | Samples processed before weight update | Affects speed vs stability |
| **Learning Rate** | How big each update step is | Too high = diverge, too low = slow |
| **Loss Function** | Measures prediction error | Cross-entropy (classification), MSE (regression) |

---

## Transformers — The Architecture Behind LLMs

The 2017 paper "Attention Is All You Need" changed everything. Transformers replaced RNNs for language tasks.

```
Input Text: "The cat sat on the"
     ↓
Token IDs: [464, 3797, 3332, 319, 262]
     ↓
Embeddings: each token → dense vector (e.g. 768 dimensions)
     ↓
┌─────────────────────────────────────┐
│        Transformer Block ×N         │
│                                     │
│  Multi-Head Self-Attention          │
│  ↓  (which tokens relate to which) │
│  Feed-Forward Network               │
│  ↓  (learn complex transformations) │
│  Layer Norm + Residual Connection   │
└─────────────────────────────────────┘
     ↓
Output: probability distribution over vocabulary
     ↓
Next token: "mat" (highest probability)
```

### Self-Attention in Plain English

For each token, attention asks: *"How much should I care about every other token in the sequence?"*

```
"The bank can guarantee deposits will eventually cover future tuition costs"

bank → looks at: deposits (high), guarantee (high), tuition (medium)
       (understands "bank" means financial institution, not river bank)
```

This is **context-aware understanding** — why LLMs can disambiguate meaning.

---

## LLMs (Large Language Models)

### What They Are

LLMs are autoregressive transformers trained on massive text corpora to predict the next token. They learn statistical patterns so rich that emergent capabilities (reasoning, coding, translation) arise without being explicitly programmed.

### Key Models

| Model | Company | Notable for |
|-------|---------|-------------|
| GPT-4o | OpenAI | General purpose, multimodal |
| Claude 3.5/4 | Anthropic | Long context, instruction following |
| Gemini 1.5/2 | Google | Multimodal, 1M token context |
| Llama 3 | Meta | Open source, self-hostable |
| Qwen3 | Alibaba | Strong on Asian languages + code |
| Mistral | Mistral AI | Efficient, open weights |

### Token Economics

```
"Hello, world!" → ["Hello", ",", " world", "!"] → 4 tokens

Rule of thumb: 1 token ≈ 0.75 words ≈ 4 characters (English)

Why it matters:
- Pricing is per token (input + output)
- Context window limits (GPT-4: 128k, Claude 3.5: 200k, Gemini: 1M+)
- Longer context = more expensive + slower
```

---

## Training vs Fine-tuning vs Inference

```
TRAINING (pre-training)
  ─ Train from scratch on trillions of tokens
  ─ Cost: millions of dollars, months on 1000s of GPUs
  ─ Who does this: OpenAI, Google, Meta, Anthropic
  ─ Result: foundation model (base weights)

FINE-TUNING
  ─ Further train a pre-trained model on specific data
  ─ Cost: hundreds to thousands of dollars
  ─ Types:
    • Full fine-tuning: update all weights
    • LoRA/QLoRA: update small adapter matrices (PEFT)
    • RLHF: use human feedback to align behavior
    • DPO: direct preference optimization

INFERENCE
  ─ Run the trained model to generate output
  ─ Cost: per request (API) or GPU rental
  ─ Optimization: quantization (INT8/INT4), KV caching, batching
```

### RLHF (Reinforcement Learning from Human Feedback)

How ChatGPT gets its helpful, harmless behavior:

```
1. Pre-train base model on internet data
2. Supervised fine-tuning: train on (prompt, ideal response) pairs
3. Reward model: human raters rank multiple responses
4. PPO: optimize base model to maximize reward model score
```

---

## AI in Production — The Developer Perspective

```
User Request
    ↓
Application Layer (Node.js/Python)
    ↓
Prompt Construction
    ↓
LLM API Call (OpenAI/Anthropic/Gemini)
    ↓
Response Parsing + Validation
    ↓
Post-Processing (tool calls? RAG? memory?)
    ↓
Response to User
```

### Latency vs Quality Trade-offs

| Optimization | Trade-off |
|-------------|-----------|
| Smaller model (GPT-3.5 vs GPT-4) | Faster & cheaper, but less capable |
| Streaming responses | Better UX, same total latency |
| Caching identical prompts | Zero latency repeat queries, staleness risk |
| Shorter prompts | Faster + cheaper, less context |
| Parallel LLM calls | Faster multi-step pipelines, higher cost |

---

## Evaluation Metrics

| Metric | Use Case |
|--------|---------|
| **BLEU** | Machine translation quality |
| **ROUGE** | Summarization quality |
| **Perplexity** | How well model predicts test data (lower = better) |
| **Human eval** | Gold standard for LLM outputs |
| **LLM-as-judge** | Use GPT-4 to evaluate other model outputs |
| **Faithfulness** | RAG: answer supported by retrieved context? |
| **Relevance** | RAG: context retrieved actually relevant? |

---

## Key Terms Cheat Sheet

| Term | Definition |
|------|-----------|
| **Hallucination** | Model confidently states false information |
| **Context window** | Max tokens model can process at once |
| **Temperature** | Randomness of output (0=deterministic, 2=chaotic) |
| **Top-p (nucleus sampling)** | Sample from top-p probability mass |
| **Top-k** | Sample from top-k most likely tokens |
| **Embeddings** | Dense vector representation of text/data |
| **Token** | Smallest unit of text an LLM processes |
| **Tokenizer** | Splits text into tokens (BPE, WordPiece) |
| **Quantization** | Reduce model precision (FP32→INT8) to save memory |
| **KV Cache** | Cache attention keys/values to speed up inference |
| **Grounding** | Connecting model output to verified facts/sources |
| **Guardrails** | Rules/classifiers to prevent harmful outputs |
