# AI Fundamentals — Tricky Questions

## Questions That Trip People Up

---

### Q1: If temperature=0 makes output deterministic, why do you sometimes get different responses with temperature=0?

**Answer:**

Several reasons output can still vary at temperature=0:

1. **Floating-point non-determinism** — GPU parallel computation order can vary between runs due to floating-point rounding differences. Different hardware, different results.
2. **Model versioning** — OpenAI silently updates model versions. `gpt-4` today ≠ `gpt-4` next month.
3. **Streaming vs non-streaming** — Different code paths can produce slightly different outputs.
4. **Seed parameter** — Some APIs have a separate `seed` parameter for true reproducibility (OpenAI added this). Temperature alone isn't enough.
5. **Top-p interaction** — If both temperature and top-p are set, they interact in non-obvious ways.

```python
# For reproducibility, use seed + temperature=0
response = client.chat.completions.create(
    model="gpt-4o",
    temperature=0,
    seed=42,  # Added for reproducibility
    messages=[...]
)
```

---

### Q2: "LLMs don't understand language — they just predict tokens." Do you agree?

**Answer (nuanced):**

This is a genuinely contested question. The honest answer is: *we don't know*.

**Arguments for "just predicting tokens":**
- LLMs are trained purely on next-token prediction
- They fail on tasks that require true logical reasoning consistently
- They can be fooled by surface-level patterns (adversarial inputs)
- No grounded perception of the world (no sensory input)

**Arguments against "just predicting":**
- Emergent capabilities (in-context learning, arithmetic, code) weren't programmed
- GPT-4 passes bar exams, medical licensing exams — is that "just" prediction?
- Representations in the model encode factual relationships about the world
- Self-consistency and chain-of-thought *improve* reasoning → something reasoning-like is happening

**The practical engineering answer:** Treat LLMs as very powerful pattern matchers with emergent reasoning capabilities. Design your systems with the assumption they *can* reason but *will* make mistakes — use verification, structured outputs, and retrieval to compensate.

---

### Q3: Why can't you just increase context window to solve RAG?

**Answer:**

Even with 1M token context, RAG is still better because:

1. **Cost** — GPT-4o charges per token. Sending a 1M token context costs ~$10/query. RAG retrieves only the relevant 1-5% of knowledge.

2. **"Lost in the middle" problem** — LLMs recall beginning and end of context well, but performance degrades for information in the middle of long contexts. Retrieved chunks put relevant info at the top.

3. **Latency** — Processing 1M tokens takes several seconds. RAG retrieves <5 chunks in milliseconds.

4. **Dynamic knowledge** — You can update your vector store without changing the model. You can't update a stuffed context.

5. **Citation and traceability** — RAG shows you *which* documents were used. Stuffed context makes attribution impossible.

```
1M token context window:
  Cost per query: ~$10 (if full)
  Latency: 10-30 seconds
  Recall @ middle: degrades

RAG (top-5 chunks, ~2000 tokens):
  Cost per query: ~$0.02
  Latency: 200ms retrieval + 1-2s generation
  Recall: high (relevant chunks at top)
```

---

### Q4: A model scores 95% accuracy on your test set but fails in production. Why?

**Answer — this is a classic ML gotcha:**

1. **Train-test distribution shift** — Test set doesn't represent production data. Model memorized test patterns.

2. **Data leakage** — Test data accidentally leaked into training (e.g., chronological split not respected, or test set derived from same source as train).

3. **Label quality** — If test labels were produced by the same process that produced training labels (e.g., another model), accuracy measures how well you mimic that process, not ground truth.

4. **Metric mismatch** — Accuracy is a bad metric for imbalanced classes. 95% accuracy on 95/5 class split = model just predicts majority class.

5. **Overfitting** — Model memorized training data patterns that don't generalize.

6. **Production edge cases** — Real users query in ways your test set never captured (typos, unusual phrasing, adversarial inputs).

**Mitigation:**
- Use proper train/val/test splits with temporal awareness
- Monitor production distribution (data drift)
- Use LLM-as-judge on a random sample of production outputs
- A/B test before full rollout

---

### Q5: What's the difference between `top_p=0.1` and `temperature=0.1`? Which should you use?

**Answer:**

Both reduce randomness but work differently:

```
Temperature scales the logit distribution before sampling:
  low temp → peaks sharpen → top tokens dominate

Top-p (nucleus sampling) samples from smallest set of tokens
  that together have probability ≥ p:
  top_p=0.1 → sample only from top 10% of probability mass

Temperature changes the shape of the distribution.
Top-p truncates the tail of the distribution.

Practical difference:
─────────────────────────────────────────────────────
Scenario: token distribution is flat (model uncertain)
  temp=0.1 → still picks from flat, but with less randomness
  top_p=0.1 → only considers top 10% — highly restrictive

Scenario: one token dominates (model confident)
  temp=0.1 → picks that token
  top_p=0.1 → effectively same result
─────────────────────────────────────────────────────

Recommendation:
  Use temperature alone for most tasks.
  Use top_p=0.9 with temperature=1 for creative tasks (OpenAI's recommended approach).
  Do NOT use both temperature reduction + top_p reduction simultaneously — double-constrains output.
```

---

### Q6: Why do LLMs fail at arithmetic but pass math exams?

**Answer:**

LLMs fail at *pure arithmetic* because:
- They tokenize numbers non-intuitively ("1234" → 3 tokens)
- They learned math reasoning from text, not from a calculator
- No symbolic manipulation — just pattern matching on digit strings

But pass *math exams* because:
- Exams test conceptual understanding + problem setup, not just arithmetic
- Chain-of-thought prompting lets them reason through steps
- They can recall formulas, theorems, and approaches from training data
- Final arithmetic errors sometimes don't affect the exam score

**In production:** Use tool calling (code interpreter) for any actual arithmetic:

```python
# Don't: "What is 17 × 23 × 41?"
# LLM might say 16081 (wrong)

# Do: have the LLM call a calculator tool
tools = [{"name": "calculate", "function": eval_math_expression}]
# LLM outputs: calculate("17 * 23 * 41")
# Tool returns: 16031 (correct)
```

---

### Q7: Can you explain why "bigger model is always better" is wrong?

**Answer:**

Common counterexamples:

1. **Task simplicity** — GPT-4o for spam detection is overkill. A fine-tuned small model (BERT, DistilBERT) is faster, cheaper, and can be more accurate for that specific task.

2. **Latency constraints** — Real-time applications (autocomplete, voice) need <200ms. Smaller quantized models run locally, larger models require API round-trips.

3. **Cost at scale** — At 1M requests/day, GPT-4o ($5/M tokens input) vs GPT-3.5 ($0.50/M tokens) = 10x cost difference. A fine-tuned small model can be hosted for fixed cost.

4. **Distillation can match** — GPT-4-generated synthetic data used to fine-tune smaller models can approach GPT-4 quality on specific domains.

5. **Diminishing returns** — On many benchmarks, GPT-4 → GPT-3.5 is a small quality gap vs a 10x cost gap.

**The right question:** What's the smallest model that meets quality requirements at acceptable cost/latency for this specific task?
