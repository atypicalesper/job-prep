# Fine-Tuning — Interview Questions

### Q1: When would you choose fine-tuning over RAG? Walk through your decision process.

**Answer:**

```
Decision framework — ask these questions in order:

1. Is the problem about KNOWLEDGE or BEHAVIOR?
   Knowledge (facts, documents, latest info) → RAG
   Behavior (tone, format, style, domain vocabulary) → Fine-tuning

2. How often does the data change?
   Frequently (daily/weekly) → RAG (re-embed, no retraining)
   Rarely (stable taxonomy, brand voice) → Fine-tuning

3. How many examples do you have?
   < 100 → Few-shot prompting
   100-1000 → Fine-tuning becomes viable
   1000+ → Fine-tuning shines

4. What's your latency budget?
   RAG adds retrieval overhead (100-500ms for vector search)
   Fine-tuned models skip retrieval → lower latency, shorter prompts

Concrete examples:
  Use RAG:       "What does our refund policy say?"
                 "Summarize this uploaded contract"
                 "What changed in v3.2 of our API?"

  Use fine-tune: "Always respond in our brand voice"
                 "Generate SQL that follows our internal style"
                 "Classify support tickets with our custom taxonomy"
                 "Use our medical abbreviations correctly"

  Use both:      Fine-tune for behavior/style, RAG for knowledge
                 = consistent tone + up-to-date facts
```

---

### Q2: You have 200 customer support examples. How do you build and validate a fine-tuned model?

**Answer:**

```python
# Step 1: Data preparation and validation
import json
from openai import OpenAI

client = OpenAI()

def validate_and_prepare(raw_examples: list[dict]) -> list[dict]:
    valid = []
    for ex in raw_examples:
        # Quality checks
        if len(ex.get("response", "")) < 20:
            continue  # Too short
        if len(ex.get("response", "")) > 2000:
            continue  # Probably too long for a turn
        if not ex.get("query"):
            continue  # Missing input

        valid.append({
            "messages": [
                {"role": "system", "content": "You are a helpful support agent for Acme Corp."},
                {"role": "user", "content": ex["query"]},
                {"role": "assistant", "content": ex["response"]},
            ]
        })
    return valid

# Step 2: Split train/eval (80/20)
import random

random.shuffle(examples)
split = int(len(examples) * 0.8)
train_data = examples[:split]  # 160 examples
eval_data = examples[split:]   # 40 examples (held out)

# Step 3: Augment to increase volume (optional but helpful with small datasets)
async def augment_example(ex: dict) -> list[dict]:
    """Generate 3 variations using GPT-4."""
    prompt = f"""Generate 3 varied versions of this support interaction.
Keep the same topic, quality, and tone. Vary the wording.

Original:
User: {ex['messages'][1]['content']}
Assistant: {ex['messages'][2]['content']}

Return JSON array of 3 objects with keys "user" and "assistant"."""

    result = await gpt4.ainvoke(prompt)
    variations = json.loads(result.content)
    return [
        {"messages": [ex["messages"][0],
                      {"role": "user", "content": v["user"]},
                      {"role": "assistant", "content": v["assistant"]}]}
        for v in variations
    ]
# After augmentation: 160 * 4 = 640 training examples

# Step 4: Upload and train
with open("train.jsonl", "w") as f:
    for item in train_data:
        f.write(json.dumps(item) + "\n")

file = client.files.create(file=open("train.jsonl", "rb"), purpose="fine-tune")

job = client.fine_tuning.jobs.create(
    training_file=file.id,
    model="gpt-4o-mini-2024-07-18",
    hyperparameters={"n_epochs": 3},
    validation_file=eval_file.id,  # Track val loss
)

# Step 5: Evaluate on held-out eval set
def evaluate_fine_tuned(ft_model: str, eval_data: list) -> dict:
    base_scores, ft_scores = [], []

    for ex in eval_data[:20]:  # Sample 20 for cost
        query = ex["messages"][1]["content"]
        expected = ex["messages"][2]["content"]

        ft_response = client.chat.completions.create(
            model=ft_model,
            messages=ex["messages"][:2]  # system + user only
        ).choices[0].message.content

        base_response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=ex["messages"][:2]
        ).choices[0].message.content

        # LLM judge: does it match brand voice?
        ft_scores.append(judge_brand_voice(query, ft_response))
        base_scores.append(judge_brand_voice(query, base_response))

    return {
        "base_avg": sum(base_scores) / len(base_scores),
        "ft_avg": sum(ft_scores) / len(ft_scores),
        "improvement": f"{(sum(ft_scores) - sum(base_scores)) / len(base_scores) * 100:.1f}%"
    }

# Typical result: base 5.8/10 → fine-tuned 8.2/10 for brand voice
```

---

### Q3: What is LoRA and why is it the dominant fine-tuning approach?

**Answer:**

```
Full fine-tuning problem:
  7B model = ~14GB in float16
  Updating all weights requires:
    - Multiple A100 GPUs ($$$)
    - 40+ GB VRAM
    - Hours to days of training

LoRA insight: most of the useful "change" in weights can be approximated
by a low-rank matrix decomposition.

Instead of:
  W_new = W_original + ΔW
  Where ΔW is the same size as W (e.g., 4096 × 4096 = 16M params)

LoRA decomposes ΔW into two small matrices:
  ΔW = B × A
  Where A is (4096 × r) and B is (r × 4096), r = 8 or 16

  r=16: A = 4096×16 = 65k params
        B = 16×4096 = 65k params
  Total adapter: 130k params vs 16M params original = 0.8% the size!

Benefits:
  ✓ Trains in hours on a single GPU (even consumer RTX 3090)
  ✓ Base model frozen → no catastrophic forgetting
  ✓ Multiple adapters → swap behavior without reloading base model
  ✓ Merge adapters at inference → zero overhead

QLoRA extends this:
  Load base model in 4-bit (NF4 quantization)
  Apply LoRA adapters in float16
  7B model: 16GB → 4GB VRAM
  Fine-tune a 7B model on a single 8GB GPU!

When to set r higher:
  r=4:  Style, tone (very simple task)
  r=8:  Standard recommendation for most tasks
  r=16: Domain adaptation, complex behavior change
  r=64: Major capability changes (rare, close to full fine-tune)
```

---

### Q4: Your fine-tuned model passes your eval benchmarks but production users complain it "sounds wrong." What happened?

**Answer:**

```
This is the train/eval distribution mismatch problem.

Root causes to investigate:

1. Eval set wasn't representative
   - You evaluated on "nice" handpicked examples
   - Production has messy, typo-filled, ambiguous queries
   - Fix: Build eval set by sampling from real production traffic

2. Training data had implicit patterns the model picked up
   - All examples from one support agent's style
   - Examples from one product category only
   - "Sounds wrong" on queries that fall outside the training distribution
   - Fix: Audit training data distribution; ensure it covers the full query space

3. Catastrophic forgetting (less common with LoRA)
   - Full fine-tuning can overwrite general language capabilities
   - Model "over-fits" to training distribution
   - Fix: Add regularization; reduce epochs; use LoRA instead of full FT

4. System prompt drift
   - Training used a different system prompt than production
   - The fine-tuned "personality" conflicts with the runtime system prompt
   - Fix: Always fine-tune with the exact system prompt used in production

5. Hallucination shift
   - Fine-tuning on confident, assertive responses
   - Model learned to assert things confidently even when wrong
   - Fix: Include "I don't know" examples in training data for out-of-scope queries

Diagnosis process:
  1. Collect 20 "sounds wrong" examples from production
  2. Label what specifically is wrong (tone? factual? format?)
  3. Check if those query types appear in training data
  4. If not → add more training examples of that type
  5. If yes → the model didn't learn from them → improve example quality
```

---

### Q5: Tricky: Someone says "just use more few-shot examples in the prompt instead of fine-tuning." When are they right and when are they wrong?

**Answer:**

```
They're RIGHT when:
  - You have < 50 examples → not enough data to fine-tune anyway
  - The task is straightforward (structured output, simple classification)
  - You need to iterate quickly (prompt change = instant, FT = hours)
  - Cost isn't a concern (context window cost is acceptable)
  - The task changes frequently

Example: "Format responses as JSON with these 3 fields"
→ 3 shot examples in the prompt works perfectly fine

They're WRONG when:
  - You have hundreds of high-quality examples
  - The "style" or "behavior" is subtle and hard to show in 5-10 examples
  - Context window is filling up with examples (expensive, slower)
  - Consistency is critical — few-shot can drift across conversations
  - Latency matters — 30 shot examples = 3000+ extra tokens = slower + $$$
  - The behavior needs to generalize across many novel input types

The key insight:
  Few-shot = showing the model AT INFERENCE TIME
  Fine-tuning = teaching the model BEFORE inference

  Cost comparison (at scale, 100k queries/day):
    Few-shot (10 examples, ~1500 tokens): +$45/day on gpt-4o-mini
    Fine-tuned model: $0 extra (shorter prompts, may cost less)
    Fine-tuning pays off after: ~few weeks of the few-shot cost

Reality in production:
  Correct answer = "use prompting first, fine-tune when it's not enough"
  Treat fine-tuning as an optimization step, not a first resort
```
