# Fine-Tuning LLMs

## Fine-Tuning vs RAG vs Prompting

```
                  PROMPTING       RAG              FINE-TUNING
────────────────────────────────────────────────────────────────
When to use      Style/format    Facts/knowledge  Behavior/tone/format
                 Simple tasks    Live data        Consistent style
                                 Private data     Domain specialization

Update cost      Zero            Re-embed docs    Retrain (hours+GPU)
Knowledge        Static          Always current   Static (as of train date)
factual          cutoff
Latency          Adds tokens     +Retrieval time  Baseline (no extra tokens)
Cost/query       Context size    Context size     Smaller context → cheaper
Consistency      Variable        Variable         High (baked into weights)

Best for:
  Prompting:    "Answer in JSON", "Act as a pirate", "Be concise"
  RAG:          "What does our policy say?", "Latest product docs"
  Fine-tuning:  "Always respond like our brand", "Medical terminology",
                "Code in our internal style", "Classify with our taxonomy"
```

---

## When NOT to Fine-Tune

```
Don't fine-tune when:
  ✗ You need up-to-date information → use RAG
  ✗ Your dataset is small (<100 examples) → use few-shot prompting
  ✗ The task is simple → better prompting is faster and cheaper
  ✗ You need to debug/update quickly → retraining is slow
  ✗ Budget is tight → fine-tuning infra costs $$$

Do fine-tune when:
  ✓ You need consistent output format (e.g., always valid JSON with your schema)
  ✓ You have 1000+ high-quality examples
  ✓ The model needs domain-specific terminology (medical, legal, internal jargon)
  ✓ You need to reduce prompt length (compress few-shot examples into weights)
  ✓ Latency matters and shorter prompts help
  ✓ You want to remove capabilities (safety fine-tuning, RLHF)
```

---

## Fine-Tuning Methods

### Full Fine-Tuning
```
All model weights updated.
Requires: Multiple high-end GPUs (7B model = ~56GB VRAM)
Best for: Major capability changes, academic research
Cost: $$$$ — use cloud (Lambda Labs, vast.ai, RunPod)
```

### LoRA (Low-Rank Adaptation) — Most Common
```python
# LoRA: instead of updating all weights, add small trainable "adapter" matrices
# Original: Y = W·X (W = frozen 4096×4096 = 16M params)
# LoRA: Y = W·X + B·A·X (A = 4096×16, B = 16×4096 = only 131k params)

# Key insight: the "update" to model weights is low-rank (most useful changes
# can be represented in a small subspace)

from peft import get_peft_model, LoraConfig, TaskType
from transformers import AutoModelForCausalLM, AutoTokenizer

model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-3.1-8B")
tokenizer = AutoTokenizer.from_pretrained("meta-llama/Llama-3.1-8B")

lora_config = LoraConfig(
    task_type=TaskType.CAUSAL_LM,
    r=16,                    # Rank of the adapter matrices (lower = fewer params)
    lora_alpha=32,           # Scaling factor (usually 2x r)
    target_modules=["q_proj", "v_proj", "k_proj", "o_proj"],  # Which layers to adapt
    lora_dropout=0.05,
    bias="none",
)

peft_model = get_peft_model(model, lora_config)
peft_model.print_trainable_parameters()
# → trainable params: 8,388,608 (0.1% of total) ← only 0.1% need updating!

# After training: merge adapters back into base model for deployment
merged_model = peft_model.merge_and_unload()
```

### QLoRA — Fine-Tune on Consumer Hardware
```python
# QLoRA = Quantized LoRA
# Load model in 4-bit quantization (4x memory reduction)
# + apply LoRA adapters

from transformers import BitsAndBytesConfig
import torch

quantization_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_use_double_quant=True,     # Extra 0.4 bit per param
    bnb_4bit_quant_type="nf4",          # NormalFloat4 — best for LLMs
)

model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3.1-8B",
    quantization_config=quantization_config,
    device_map="auto",
)

# 8B model normally needs ~16GB VRAM (float16)
# QLoRA: needs ~5GB VRAM → fine-tune on a single RTX 3090!
```

---

## OpenAI Fine-Tuning (Easiest Path)

```python
from openai import OpenAI
import json

client = OpenAI()

# 1. Prepare training data (JSONL format)
training_data = [
    {
        "messages": [
            {"role": "system", "content": "You are a customer support agent for Acme Corp."},
            {"role": "user", "content": "How do I reset my password?"},
            {"role": "assistant", "content": "To reset your password: go to acme.com/login, click 'Forgot Password', enter your email, check your inbox for a reset link. The link expires in 1 hour."}
        ]
    },
    # ... 50+ more examples
]

with open("training.jsonl", "w") as f:
    for item in training_data:
        f.write(json.dumps(item) + "\n")

# 2. Upload training file
with open("training.jsonl", "rb") as f:
    file = client.files.create(file=f, purpose="fine-tune")

# 3. Start fine-tuning job
job = client.fine_tuning.jobs.create(
    training_file=file.id,
    model="gpt-4o-mini-2024-07-18",   # Base model
    hyperparameters={"n_epochs": 3},
)

# 4. Monitor training
while job.status not in ("succeeded", "failed"):
    time.sleep(60)
    job = client.fine_tuning.jobs.retrieve(job.id)
    print(f"Status: {job.status}")

# 5. Use your fine-tuned model
fine_tuned_model = job.fine_tuned_model  # e.g., "ft:gpt-4o-mini:acme:customer-support:abc123"

response = client.chat.completions.create(
    model=fine_tuned_model,
    messages=[
        {"role": "system", "content": "You are a customer support agent for Acme Corp."},
        {"role": "user", "content": "My order hasn't arrived"},
    ]
)
```

---

## Training Data Requirements

```python
# Minimum viable dataset sizes:
#   OpenAI fine-tuning:  50-100 examples (works but weak)
#   Good fine-tuning:    500-1000 examples
#   Strong fine-tuning:  1000-10000 examples
#   Full capability:     10000+ examples

# Data quality > quantity
# 100 perfect examples >> 1000 noisy examples

# Data collection strategies:
# 1. Manual curation (best quality, expensive)
# 2. Augmentation with GPT-4 (generate variations of good examples)
# 3. Distillation (use GPT-4 outputs to train smaller model)

# Augmentation example:
async def augment_example(example: dict) -> list[dict]:
    """Generate 5 variations of a training example."""
    prompt = f"""Given this training example, generate 5 similar but varied versions.
    Keep the same assistant response style and accuracy.

    Original:
    User: {example['user']}
    Assistant: {example['assistant']}

    Output as JSON array of {{"user": ..., "assistant": ...}} objects."""

    result = await llm.ainvoke(prompt)
    variations = json.loads(result.content)
    return variations

# Data validation
def validate_training_example(example: dict) -> bool:
    """Check training example quality."""
    msgs = example.get("messages", [])
    if len(msgs) < 2:
        return False
    last = msgs[-1]
    if last["role"] != "assistant":
        return False
    if len(last["content"]) < 10:
        return False  # Too short
    if len(last["content"]) > 4000:
        return False  # Probably too long for a single turn
    return True
```

---

## Evaluating Fine-Tuned Models

```python
# 1. Automated evaluation
from openai import OpenAI

def evaluate_response(question: str, model_response: str, expected_style: str) -> float:
    """Use GPT-4 to judge if response matches expected style."""
    judge_prompt = f"""Rate this response on a scale of 0-10.
    Criteria: {expected_style}

    Question: {question}
    Response: {model_response}

    Output only a number 0-10."""

    score = float(client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": judge_prompt}]
    ).choices[0].message.content.strip())
    return score

# 2. A/B comparison (base vs fine-tuned)
def ab_compare(questions: list[str]) -> dict:
    base_scores = []
    ft_scores = []

    for q in questions:
        base_resp = call_model("gpt-4o-mini", q)
        ft_resp = call_model(fine_tuned_model, q)

        base_scores.append(evaluate_response(q, base_resp, "matches our brand voice"))
        ft_scores.append(evaluate_response(q, ft_resp, "matches our brand voice"))

    return {
        "base_avg": sum(base_scores) / len(base_scores),
        "ft_avg": sum(ft_scores) / len(ft_scores),
        "improvement": (sum(ft_scores) - sum(base_scores)) / len(base_scores),
    }

# 3. Regression testing — fine-tuning shouldn't break general capabilities
REGRESSION_SUITE = [
    {"q": "What is 2+2?", "expected_contains": "4"},
    {"q": "Write a hello world in Python", "expected_contains": "print"},
    # ... general capability tests
]
```

---

## Fine-Tuning Cookbook (Practical Scenarios)

```
Scenario 1: Brand voice consistency
  Problem: LLM responds generically, not like your brand
  Solution: 200 examples of (customer query, ideal brand-voice response)
  Model: gpt-4o-mini (cheaper, consistent at style)
  Expected improvement: tone consistency 40% → 85%

Scenario 2: Internal tool extraction
  Problem: Need to extract structured data from support tickets
  Solution: 500 examples of (ticket text, JSON output)
  Model: gpt-4o-mini with JSON mode
  Expected: extraction accuracy 75% → 95%

Scenario 3: Code style
  Problem: AI generates Python that doesn't follow your internal patterns
  Solution: 1000 examples of (task, ideal code following your style guide)
  Model: gpt-4o-mini
  Expected: style compliance 30% → 80%

Scenario 4: Medical terminology
  Problem: General LLM doesn't know your domain-specific abbreviations
  Solution: 2000 examples with your clinical terminology
  Model: Start with full fine-tune of smaller Llama model
```
