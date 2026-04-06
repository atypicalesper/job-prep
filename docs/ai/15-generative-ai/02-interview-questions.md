# Generative AI — Interview Questions

## Core Concepts

**Q: What is the difference between a discriminative and a generative model?**

Discriminative models learn the boundary between classes — they model P(label | input). Generative models learn the full data distribution — they model P(data) or P(data | condition), letting them produce new samples.

Example: a spam classifier is discriminative; GPT-4 is generative.

---

**Q: How does a language model generate text?**

At each step, the model takes the input tokens (prompt + generated so far) and outputs a probability distribution over the entire vocabulary. A token is sampled from that distribution (influenced by temperature/top-p), appended to the sequence, and the process repeats until an EOS token or max length.

---

**Q: What is a token? Why does tokenization matter?**

A token is a subword unit — the atomic unit LLMs process. Tokenization matters because:
1. Context windows are token-limited (not character/word-limited)
2. Non-English text tokenizes less efficiently (same content = more tokens = higher cost/more context used)
3. Rare or technical words may be split into many tokens, affecting how the model understands them

---

**Q: What is the context window and what are its implications?**

The context window is the maximum number of tokens a model can process in one inference call (input + output combined). Implications:
- Long documents must be chunked or summarized before passing to the model
- Very long contexts degrade attention quality (lost-in-the-middle problem)
- Extending context increases quadratic attention cost

---

**Q: Explain the transformer architecture at a high level.**

Transformers process sequences through stacked blocks. Each block has two sub-layers:
1. **Multi-head self-attention** — each token attends to all others, computing weighted combinations of their values
2. **Feed-forward network** — a position-wise MLP applied to each token independently

Residual connections and layer normalization wrap each sub-layer. The model learns rich contextual representations because every layer re-mixes information across the entire sequence.

---

**Q: What is self-attention and why is it powerful?**

Self-attention computes `softmax(QK^T / √d_k) × V`. For each token, it computes a similarity score against every other token (via Q/K dot products), normalizes with softmax, and uses those weights to blend all value vectors. 

It's powerful because it captures long-range dependencies with constant path length — unlike RNNs where information decays over distance. Multiple heads let the model learn different types of relationships in parallel.

---

**Q: What are the differences between GPT-style (decoder-only), BERT-style (encoder-only), and T5-style (encoder-decoder) architectures?**

| | Decoder-only (GPT) | Encoder-only (BERT) | Encoder-decoder (T5) |
|---|---|---|---|
| Attention | Causal (past tokens only) | Bidirectional | Bidirectional enc, causal dec |
| Task fit | Generation | Classification, embeddings | Seq2seq (translation, summarization) |
| Examples | GPT-4, Claude, Llama | BERT, RoBERTa | T5, BART |

Decoder-only dominates generative use cases today.

---

**Q: What is RLHF and why is it used?**

Reinforcement Learning from Human Feedback:
1. Collect human preference rankings of model outputs
2. Train a **reward model** to predict human preference
3. Fine-tune the LLM using PPO to maximize reward model score

Why: pre-trained models complete text but aren't inherently helpful or safe. RLHF aligns model behavior with human values and desired response style.

---

**Q: What is the difference between RLHF and DPO?**

Both optimize on human preference data. RLHF trains a separate reward model first, then uses RL (PPO) — expensive and unstable. DPO (Direct Preference Optimization) reformulates the problem to optimize the LLM directly on preference pairs without a reward model. DPO is simpler, more stable, and has become increasingly popular (used in Llama 3, Mistral fine-tunes).

---

**Q: What is temperature in LLM inference? What value would you use for a customer-facing Q&A bot?**

Temperature scales logits before softmax sampling. Low temperature (0–0.3) makes output near-deterministic and focused. High temperature (1.0+) increases randomness.

For a Q&A bot: use low temperature (0.1–0.3). You want factual, consistent answers — not creative variation. For a creative writing assistant, 0.7–1.0 is appropriate.

---

**Q: What is the "lost in the middle" problem?**

Research shows that LLMs have weaker attention to information placed in the **middle** of long contexts compared to the beginning or end. If critical information is buried in the center of a 100K-token context, the model is more likely to ignore or miss it. Mitigation: re-rank retrieved chunks to place most relevant content at the start or end of the prompt.

---

## Advanced

**Q: How do diffusion models generate images?**

Training: progressively add Gaussian noise to images across T steps until the image is pure noise. A neural network (UNet or DiT) learns to predict and remove the noise at each step.

Inference: start from random noise, repeatedly apply the denoising network T times to recover a coherent image. Conditioning (text prompt via CLIP embeddings) guides what image emerges.

---

**Q: What is the difference between base models and instruction-tuned models? When would you use a base model?**

Base models are pre-trained on raw text — they complete text patterns but don't follow instructions. Instruction-tuned models (SFT + RLHF) are trained to respond helpfully to prompts.

Use a base model when: you want maximum control via few-shot prompting for a specific pattern completion task, or when you're doing your own fine-tuning and don't want instruction-tuning to interfere.

---

**Q: What is knowledge cutoff and how do you work around it?**

Models have a training cutoff — they have no knowledge of events after that date. Workarounds:
1. **RAG** — retrieve current documents and inject into context
2. **Tool use / function calling** — give model access to search APIs
3. **Fine-tuning** — expensive and becomes stale again; not ideal for dynamic knowledge
4. **System prompt injection** — paste recent relevant context directly

---

**Q: Why does longer context increase compute cost quadratically?**

Self-attention computes pairwise interactions between all tokens: O(n²) in sequence length. Doubling context length quadruples attention computation. This is why very long contexts are expensive and why alternatives like linear attention, sparse attention, and state-space models (Mamba) are active research areas.
