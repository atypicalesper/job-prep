# AI Evaluation — Interview Questions

### Q1: How do you know if your RAG system is actually good? Walk through your evaluation approach.

**Answer:**

```python
# A complete RAG evaluation uses 4 RAGAS metrics + human review

# The 4 metrics cover different failure modes:

# 1. Faithfulness — is the answer grounded in the retrieved docs?
#    Low score = hallucination (model made things up)
#    Target: > 0.85

# 2. Answer Relevancy — does the answer actually address the question?
#    Low score = off-topic answers
#    Target: > 0.80

# 3. Context Precision — are the retrieved docs relevant to the question?
#    Low score = retrieval is noisy (fetching irrelevant docs)
#    Target: > 0.75

# 4. Context Recall — did we retrieve all needed information?
#    Low score = retrieval is missing key docs
#    Target: > 0.75

from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_precision, context_recall
from datasets import Dataset

# Build your eval dataset (50-200 examples is enough to start)
# Source: Sample real user queries + have domain expert write ground truth answers
eval_data = Dataset.from_dict({
    "question": ["What is the return policy?", ...],
    "answer": [rag_chain.invoke(q) for q in questions],  # RAG responses
    "contexts": [rag_chain.get_context(q) for q in questions],  # Retrieved docs
    "ground_truth": ["Items can be returned within 30 days...", ...],  # Human-written
})

results = evaluate(eval_data, metrics=[faithfulness, answer_relevancy, context_precision, context_recall])
print(results)
# {'faithfulness': 0.91, 'answer_relevancy': 0.84,
#  'context_precision': 0.68, 'context_recall': 0.72}

# Diagnosis from scores:
# faithfulness=0.91 ✓ — model is using retrieved docs
# answer_relevancy=0.84 ✓ — answers are on-topic
# context_precision=0.68 ✗ — retrieval adding noise → reduce k, add metadata filter
# context_recall=0.72 ✗ — missing some docs → try hybrid search, increase k

# Beyond automated metrics:
# Sample 20 responses per week for human review
# Ask: is this answer correct? Would you trust it?
# Track user thumbs up/down in production
```

---

### Q2: Your LLM judge is giving inconsistent scores — same input, different scores each run. How do you fix this?

**Answer:**

```python
# Problem: LLM judges are probabilistic → temperature > 0 = variance

# Fix 1: Always use temperature=0 for judges
from langchain_openai import ChatOpenAI

judge_llm = ChatOpenAI(
    model="gpt-4o",
    temperature=0,  # CRITICAL: deterministic scoring
)

# Fix 2: Use structured numeric output (avoid free-form reasoning first)
# BAD — model reasons its way to a score, reasoning affects score:
bad_prompt = "Evaluate this response and give a score: {response}"

# GOOD — force score first, reasoning second (prevents anchoring):
good_prompt = """Score this response on factual correctness.

First line must be ONLY a number 1-10.
Second line: one sentence reason.

Response to evaluate: {response}
Reference answer: {reference}"""

# Fix 3: Use reference-anchored rubrics (removes subjectivity)
rubric_prompt = """Compare the response against these anchors:
10: Identical meaning to reference
7-9: Same key facts, minor wording difference
4-6: Some correct, some missing or wrong
1-3: Mostly wrong but some overlap
0: Completely wrong

Reference: {reference}
Response: {response}

Score (0-10):"""

# Fix 4: Multi-judge ensemble (reduces single-judge variance)
def ensemble_judge(question: str, answer: str, ground_truth: str, n: int = 3) -> float:
    scores = []
    for _ in range(n):
        score = float(judge_llm.invoke(rubric_prompt.format(...)).content.strip())
        scores.append(score)
    # Use median (robust to outliers) instead of mean
    scores.sort()
    return scores[len(scores) // 2]

# Fix 5: Calibration — test your judge against human labels
# Collect 50 human-scored pairs → check correlation with judge scores
# If Spearman correlation < 0.7 → your rubric needs work
```

---

### Q3: How would you set up a CI/CD pipeline for an AI feature?

**Answer:**

```yaml
# .github/workflows/ai-eval.yml
# Runs on every PR that touches AI code or prompts

name: AI Eval Gate
on:
  pull_request:
    paths:
      - 'src/ai/**'
      - 'prompts/**'
      - 'src/rag/**'

jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # 1. Regression tests — must-pass behaviors
      - name: Regression tests
        run: python -m pytest tests/ai/regression/ -v --tb=short
        # Tests like: "always returns JSON", "never reveals system prompt",
        #             "handles empty input", "returns in < 5 seconds"

      # 2. RAGAS quality gate
      - name: RAG quality gate
        run: |
          python scripts/eval_rag.py \
            --faithfulness-min 0.85 \
            --context-precision-min 0.75 \
            --fail-fast
        # Fails the PR if quality drops below threshold

      # 3. Adversarial/safety tests
      - name: Safety tests
        run: python scripts/adversarial_tests.py
        # Test: prompt injection resilience, PII leakage, refusal rate

      # 4. Cost estimation — prevent cost regressions
      - name: Cost check
        run: python scripts/estimate_cost.py --max-cost-per-query 0.05
        # Fails if the PR makes each query cost more than $0.05

      # 5. Compare to baseline (A/B)
      - name: Compare to main
        run: |
          python scripts/ab_compare.py \
            --baseline origin/main \
            --candidate HEAD \
            --min-improvement -0.05  # Allow max 5% regression
        # Posts score comparison as PR comment via GitHub API

# Key insight: treat prompt changes like code changes
# Version prompts in git, review in PRs, gate on quality metrics
# If eval scores drop → PR is blocked until fixed
```

---

### Q4: A product manager asks: "Is our AI getting better or worse over time?" How do you answer this?

**Answer:**

```python
# You need: longitudinal quality tracking in production

# 1. Implicit signals (always available, no extra work)
from dataclasses import dataclass
from datetime import datetime

@dataclass
class SessionMetrics:
    session_id: str
    timestamp: datetime
    thumbs_up: bool | None           # User feedback
    follow_up_query: bool             # Did user ask for clarification?
    session_length: int               # Longer = more engaged (usually)
    copied_response: bool             # User copied = response was useful

# 2. Explicit signals (ask users)
@app.post("/feedback")
async def collect_feedback(session_id: str, rating: int, comment: str = ""):
    # Track 1-5 star ratings or thumbs up/down
    # Even 3-5% response rate gives meaningful signal at scale

# 3. Automated sampling (proactive quality monitoring)
import random

async def monitored_query(user_query: str, user_id: str) -> str:
    response = await rag_chain.ainvoke({"question": user_query})

    # Sample 2% of traffic for automated quality scoring
    if random.random() < 0.02:
        asyncio.create_task(
            score_and_store(user_query, response, user_id)
        )

    return response

async def score_and_store(query: str, response: str, user_id: str):
    scores = {
        "relevancy": await llm_judge_relevancy(query, response),
        "faithfulness": await check_faithfulness_against_sources(query, response),
        "timestamp": datetime.now().isoformat(),
    }
    await metrics_store.insert(scores)

# 4. Weekly trend report (answer the PM's question)
def weekly_ai_health_report():
    # Compare this week vs last week vs 4 weeks ago
    metrics = {
        "avg_faithfulness_7d": query_avg("faithfulness", days=7),
        "avg_faithfulness_28d": query_avg("faithfulness", days=28),
        "user_satisfaction_7d": query_thumbs_ratio(days=7),
        "p95_latency_7d": query_p95_latency(days=7),
        "cost_per_query_7d": query_cost_avg(days=7),
    }
    # Alert if any metric degrades > 10% week-over-week
    return metrics

# What "better" means concretely:
# ✓ Higher faithfulness (fewer hallucinations)
# ✓ Higher user satisfaction scores
# ✓ Lower follow-up rate (fewer "can you clarify?")
# ✓ Stable/lower cost per query
# ✓ Lower p95 latency
```

---

### Q5: Tricky: "LLM-as-judge is circular — you're using an LLM to evaluate an LLM. Why trust it?"

**Answer:**

```
This is a legitimate concern. Here's how to think about it:

The circularity problem:
  If GPT-4 judges GPT-4's output → it might systematically agree with itself
  If Claude judges Claude → same issue
  Both miss the same types of errors

Mitigations:

1. Use a DIFFERENT model as judge
   - If your app uses gpt-4o-mini → judge with gpt-4o or Claude
   - Different models have different failure modes → less correlated errors
   - Anthropic uses Claude to judge GPT outputs for fair benchmarking

2. Calibrate your judge against human labels
   - Collect 100 human-judged examples
   - Compare judge scores to human scores
   - If Spearman rank correlation > 0.75 → judge is trustworthy
   - Studies show: calibrated LLM judges reach ~0.8 correlation with humans
     (comparable to human-human inter-annotator agreement ~0.75-0.85)

3. Use judges for relative, not absolute scoring
   - "Is A better than B?" is more reliable than "Score A from 1-10"
   - Pairwise preference is more stable than point scoring
   - Used in LMSYS Chatbot Arena rankings

4. LLM judges are BETTER than nothing:
   - Alternative: no evaluation (flying blind)
   - Alternative: pure human eval (expensive, slow, doesn't scale)
   - LLM judge at 2% traffic sampling = thousands of evals/day
   - You'd never get that volume from human raters

5. Where LLM judges fail (know the limits):
   - Complex math or code correctness → use execution-based eval instead
   - Highly domain-specific accuracy (medical, legal) → need expert humans
   - Detecting subtle bias → specialized bias benchmarks

Bottom line: LLM-as-judge is a pragmatic tool, not a perfect solution.
Trust it when calibrated, use it alongside human review, and don't use it
where code execution or domain expertise is needed.
```
