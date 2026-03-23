# RAG Evaluation — RAGAS & DeepEval

You cannot improve what you don't measure. LLM output quality requires specialized metrics — traditional accuracy doesn't work.

---

## The Core Problem

```
Question: "What is HNSW?"
Retrieved chunk: "HNSW stands for Hierarchical Navigable Small World..."
Generated answer: "HNSW is a type of database used for storing user profiles."

Traditional metrics:     BLEU=0.12, ROUGE=0.08  ← meaningless
What actually went wrong: hallucination + ignored the retrieved context
What we need:            faithfulness=0.0, answer_relevancy=0.2
```

---

## RAGAS — RAG-Specific Metrics

[RAGAS](https://docs.ragas.io) provides four key metrics for evaluating RAG pipelines.

### Metric 1: Faithfulness

Does the answer stick to the retrieved context? (Detects hallucinations)

Score: `claims supported by context / total claims in answer`

```python
from ragas import evaluate
from ragas.metrics import faithfulness
from datasets import Dataset

data = {
    "question": ["What is HNSW?", "What is RAG?"],
    "answer": [
        "HNSW is a graph-based index for approximate nearest neighbour search.",
        "RAG retrieves relevant documents and feeds them to an LLM to generate answers.",
    ],
    "contexts": [
        ["HNSW (Hierarchical Navigable Small World) is a graph algorithm for ANN search..."],
        ["Retrieval-Augmented Generation (RAG) combines a retrieval step with a generation model..."],
    ],
}
dataset = Dataset.from_dict(data)

results = evaluate(dataset, metrics=[faithfulness])
print(results["faithfulness"])  # 0.0 to 1.0
```

### Metric 2: Answer Relevancy

Is the answer actually addressing the question? (Detects off-topic answers)

```python
from ragas.metrics import answer_relevancy
results = evaluate(dataset, metrics=[answer_relevancy])
```

### Metric 3: Context Precision

Are the retrieved chunks actually relevant to the question?

```python
from ragas.metrics import context_precision
# Requires ground_truth in dataset
results = evaluate(dataset, metrics=[context_precision])
```

### Metric 4: Context Recall

Did we retrieve all the chunks needed to answer the question?

```python
from ragas.metrics import context_recall
results = evaluate(dataset, metrics=[context_recall])
```

### Full RAGAS Pipeline Evaluation

```python
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_precision, context_recall
from datasets import Dataset
import pandas as pd

# Build test dataset
test_cases = [
    {
        "question": "What is HNSW?",
        "answer": rag_pipeline("What is HNSW?"),   # your system's answer
        "contexts": retrieve("What is HNSW?"),      # chunks your system retrieved
        "ground_truth": "HNSW is a graph-based ANN index algorithm.",
    },
    # ... more test cases
]

dataset = Dataset.from_list(test_cases)

result = evaluate(
    dataset,
    metrics=[faithfulness, answer_relevancy, context_precision, context_recall],
    llm=ChatOpenAI(model="gpt-4o-mini"),   # judge model
)

df = result.to_pandas()
print(df[["faithfulness", "answer_relevancy", "context_precision", "context_recall"]])
```

---

## DeepEval — Test-Based Evaluation Framework

[DeepEval](https://docs.confident-ai.com) treats LLM evaluation like unit tests — metrics are assertions you can run in CI.

```python
from deepeval import assert_test
from deepeval.test_case import LLMTestCase
from deepeval.metrics import (
    FaithfulnessMetric,
    AnswerRelevancyMetric,
    ContextualRecallMetric,
    ContextualPrecisionMetric,
    HallucinationMetric,
    ToxicityMetric,
    BiasMetric,
)

# Single test case
def test_rag_answer():
    test_case = LLMTestCase(
        input="What is HNSW?",
        actual_output=rag_pipeline("What is HNSW?"),
        expected_output="HNSW is a graph-based ANN index algorithm.",
        retrieval_context=retrieve("What is HNSW?"),
    )

    faithfulness  = FaithfulnessMetric(threshold=0.8, model="gpt-4o-mini")
    relevancy     = AnswerRelevancyMetric(threshold=0.7, model="gpt-4o-mini")
    hallucination = HallucinationMetric(threshold=0.2, model="gpt-4o-mini")

    assert_test(test_case, [faithfulness, relevancy, hallucination])
```

**Run like pytest:**
```bash
deepeval test run test_rag.py
```

**Batch evaluation:**
```python
from deepeval import evaluate as deepeval_evaluate

test_cases = [
    LLMTestCase(input=q, actual_output=rag_pipeline(q), retrieval_context=retrieve(q))
    for q in questions
]

deepeval_evaluate(test_cases, metrics=[FaithfulnessMetric(threshold=0.8)])
```

---

## G-Eval — LLM as Judge (Reference-Free)

G-Eval uses an LLM to score outputs on custom criteria — useful when you don't have ground truth.

```python
from deepeval.metrics import GEval
from deepeval.test_case import LLMTestCaseParams

# Define your own rubric
coherence_metric = GEval(
    name="Coherence",
    criteria="Is the response logically coherent, well-structured, and easy to follow?",
    evaluation_params=[LLMTestCaseParams.ACTUAL_OUTPUT],
    threshold=0.7,
    model="gpt-4o",
)

conciseness_metric = GEval(
    name="Conciseness",
    criteria="Does the response directly answer the question without unnecessary padding?",
    evaluation_params=[
        LLMTestCaseParams.INPUT,
        LLMTestCaseParams.ACTUAL_OUTPUT,
    ],
    threshold=0.6,
    model="gpt-4o",
)
```

---

## LangSmith Evaluation

LangSmith integrates evaluation with tracing — run evaluations against datasets stored in LangSmith.

```python
from langsmith import Client
from langsmith.evaluation import evaluate, LangChainStringEvaluator

client = Client()

# Create test dataset once
dataset = client.create_dataset("rag-eval-v1")
client.create_examples(
    inputs=[{"question": "What is HNSW?"}],
    outputs=[{"answer": "HNSW is a graph-based approximate nearest neighbour algorithm."}],
    dataset_id=dataset.id,
)

# Evaluators
correctness_evaluator = LangChainStringEvaluator(
    "labeled_criteria",
    config={"criteria": "correctness"},
    prepare_data=lambda run, ex: {
        "prediction": run.outputs["answer"],
        "reference":  ex.outputs["answer"],
        "input":      ex.inputs["question"],
    },
)

# Run evaluation
results = evaluate(
    lambda inputs: {"answer": rag_pipeline(inputs["question"])},
    data="rag-eval-v1",
    evaluators=[correctness_evaluator],
    experiment_prefix="rag-v2",
)
```

---

## Building a Golden Dataset

A golden dataset is a set of questions with known-correct answers. It's the foundation of reliable evaluation.

```python
# Step 1: Generate questions from your documents automatically
from ragas.testset import TestsetGenerator
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

generator = TestsetGenerator.from_langchain(
    generator_llm=ChatOpenAI(model="gpt-4o"),
    critic_llm=ChatOpenAI(model="gpt-4o"),
    embeddings=OpenAIEmbeddings(),
)

testset = generator.generate_with_langchain_docs(
    documents,
    test_size=50,
    distributions={"simple": 0.5, "reasoning": 0.3, "multi_context": 0.2},
)
testset.to_pandas().to_csv("golden_dataset.csv", index=False)
```

---

## CI Integration

```yaml
# .github/workflows/eval.yml
name: RAG Evaluation
on: [push]

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pip install deepeval ragas
      - run: deepeval test run tests/test_rag_quality.py
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          DEEPEVAL_API_KEY: ${{ secrets.DEEPEVAL_API_KEY }}
```

---

## Metric Interpretation Guide

| Metric | < 0.5 | 0.5–0.7 | > 0.8 |
|---|---|---|---|
| **Faithfulness** | Frequent hallucinations | Occasionally strays | Sticks to context |
| **Answer Relevancy** | Off-topic often | Somewhat relevant | Directly on-point |
| **Context Precision** | Retrieving irrelevant chunks | Mixed quality | Highly precise retrieval |
| **Context Recall** | Missing key information | Partial coverage | Complete coverage |

---

## Links to Refer

- [RAGAS Documentation](https://docs.ragas.io/)
- [DeepEval Documentation](https://docs.confident-ai.com/)
- [LangSmith Evaluations](https://docs.smith.langchain.com/evaluation)
- [G-Eval Paper](https://arxiv.org/abs/2303.16634)
- [ARES — Automated RAG Evaluation](https://github.com/stanford-futuredata/ARES)
