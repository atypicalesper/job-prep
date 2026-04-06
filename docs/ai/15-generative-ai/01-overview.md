# Generative AI

## What is Generative AI?

Generative AI is a class of ML models that **learn to produce new content** — text, images, audio, video, code — by learning the statistical patterns of training data.

```
Discriminative AI (classic ML):
  Input → Classify / Predict a label
  e.g. "Is this email spam?" → Yes / No

Generative AI:
  Input (prompt/noise) → Generate new data
  e.g. "Write a product description" → novel text output
```

The key insight: generative models learn the **probability distribution** of training data, then sample from it.

---

## Types of Generative Models

```
Generative Models
├── Language Models (LLMs)
│   ├── Generate text token-by-token
│   ├── Examples: GPT-4, Claude, Gemini, Llama 3
│   └── Architecture: Transformer (decoder-only)
│
├── Diffusion Models
│   ├── Generate images/audio by iteratively denoising
│   ├── Examples: Stable Diffusion, DALL-E 3, Sora (video)
│   └── Process: add noise → learn to reverse it
│
├── GANs (Generative Adversarial Networks)
│   ├── Generator vs Discriminator in competition
│   ├── Examples: StyleGAN, early deepfakes
│   └── Status: largely replaced by diffusion for images
│
├── VAEs (Variational Autoencoders)
│   ├── Encode to latent space, decode to output
│   └── Used in image compression, style transfer
│
└── Flow Models
    ├── Invertible transformations on data
    └── Used in audio (WaveGlow), density estimation
```

---

## The Transformer: Foundation of Modern GenAI

The transformer architecture (2017, "Attention is All You Need") powers virtually every modern LLM.

```
Input Tokens
     │
     ▼
┌─────────────────────────────────────┐
│         Embedding Layer              │
│  token IDs → dense vectors (d_model) │
└─────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────┐
│     Positional Encoding              │
│  adds position info (sin/cos or RoPE)│
└─────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────┐
│     N × Transformer Blocks           │
│  ┌─────────────────────────────┐    │
│  │  Multi-Head Self-Attention   │    │
│  │  + Residual + LayerNorm      │    │
│  ├─────────────────────────────┤    │
│  │  Feed-Forward Network (FFN)  │    │
│  │  + Residual + LayerNorm      │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────┐
│     Output Head (LM head)            │
│  hidden state → vocab logits → token │
└─────────────────────────────────────┘
```

### Self-Attention in Plain English

For each token, attention asks: **"which other tokens in this sequence should I pay attention to?"**

```
Query (Q): "What am I looking for?"
Key   (K): "What do I contain?"
Value (V): "What do I pass forward if matched?"

Attention(Q, K, V) = softmax(QK^T / √d_k) × V
```

Multi-head attention runs this in parallel across H heads — each head learns different types of relationships (syntax, coreference, long-range dependencies).

---

## LLM Training Pipeline

```
Stage 1: Pre-training
  Data: trillions of tokens (web, books, code)
  Task: next-token prediction (self-supervised)
  Cost: millions of dollars, weeks of compute
  Output: a base model (knows language, not instructions)

Stage 2: Supervised Fine-Tuning (SFT)
  Data: curated (prompt, ideal response) pairs
  Task: train model to follow instructions
  Output: instruction-following model

Stage 3: RLHF (Reinforcement Learning from Human Feedback)
  Data: human preference rankings of model outputs
  Reward model: learns to score outputs like a human would
  RL loop: optimize model against reward model (PPO)
  Output: aligned, helpful, less harmful model

Alternative to RLHF: DPO (Direct Preference Optimization)
  No reward model needed — directly optimizes on preference pairs
  More stable, cheaper, increasingly common (Llama 3, Mistral)
```

---

## Key Concepts and Parameters

### Tokens
LLMs don't process characters — they process **tokens** (subword units).

```
"Hello, world!"  →  ["Hello", ",", " world", "!"]   = 4 tokens
"unbelievable"   →  ["un", "believ", "able"]         = 3 tokens

Rules of thumb:
  1 token ≈ 4 characters (English)
  1 token ≈ 0.75 words
  100 tokens ≈ 75 words
```

Tokenization matters because:
- Context windows are measured in tokens, not words
- Non-English text is often tokenized less efficiently
- Pricing is per-token

### Context Window
The maximum number of tokens the model can process at once (input + output combined).

```
GPT-3.5:     4K  → 16K tokens
GPT-4:      8K  → 128K tokens  
Claude 3:  200K tokens
Gemini 1.5: 1M tokens
```

Longer context ≠ better attention. Models often struggle with information in the **middle** of very long contexts (lost-in-the-middle problem).

### Temperature
Controls randomness in output sampling.

```
temperature = 0.0   →  deterministic, always picks highest-probability token
temperature = 0.7   →  balanced, good for most tasks
temperature = 1.0   →  sampling from full distribution
temperature = 2.0   →  very random, often incoherent

Use low temp for: factual Q&A, code, structured output
Use high temp for: creative writing, brainstorming
```

### Top-P (Nucleus Sampling)
Only sample from tokens that together account for top P% of probability mass.

```
top_p = 0.9  →  consider tokens until cumulative prob = 90%
               cuts off the long tail of unlikely tokens
               
Often used with temperature (both together, not just one)
```

---

## Generative AI vs Traditional Software

| Aspect | Traditional Software | Generative AI |
|---|---|---|
| Output | Deterministic | Probabilistic |
| Debugging | Read the code | Prompt engineering + eval |
| Correctness | Binary (right/wrong) | Spectrum (quality varies) |
| Versioning | Code versions | Model versions + prompts |
| Testing | Unit/integration tests | Evals, human preference |
| Failure mode | Errors/exceptions | Hallucinations, drift |

---

## Generative AI Applications by Domain

```
Text Generation
  ├── Chatbots and assistants (customer support, coding)
  ├── Summarization, translation, classification
  ├── Content generation (marketing, documentation)
  └── Code generation (GitHub Copilot, Cursor)

Image Generation
  ├── Text-to-image (Midjourney, DALL-E, Stable Diffusion)
  ├── Image editing, inpainting, style transfer
  └── Product photography, design mockups

Audio / Video
  ├── Text-to-speech (ElevenLabs, OpenAI TTS)
  ├── Music generation (Suno, Udio)
  └── Video generation (Sora, Runway)

Code
  ├── Autocomplete (Copilot, Cursor, Codeium)
  ├── Test generation, refactoring
  └── SQL, regex, shell script generation
```
