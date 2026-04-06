# Hallucination and Reliability

## What is Hallucination?

Hallucination is when an LLM generates **factually incorrect, fabricated, or unsupported content** with high confidence — stating things that sound plausible but are simply wrong.

```
Examples:
  ✗ "The Python requests library was created by Kenneth Reitz in 2008."
    (Actual year: 2011)
  
  ✗ "The Eiffel Tower is located in Berlin."
    (Wrong city — but model states it confidently)
  
  ✗ Citing a research paper with a real author but fabricated title/DOI
    (Plausible-sounding but entirely made up)
```

Hallucination is not a bug — it is a **fundamental property** of how LLMs work. They are trained to produce probable next tokens, not to verify truth.

---

## Why LLMs Hallucinate

```
Root Causes:

1. Training on pattern completion, not factual retrieval
   LLMs learn "what sounds like a good answer" not "what is true"
   
2. No external memory
   All "knowledge" is compressed into weights — imperfect compression
   
3. Overconfidence in ambiguous queries
   Model doesn't know what it doesn't know → fills gaps
   
4. Distribution shift
   Training data is static; world changes → knowledge becomes stale
   
5. Sycophancy
   RLHF optimizes for human approval → model agrees with leading 
   questions even when wrong
   
6. Tokenization artifacts
   Rare words, numbers, proper nouns tokenize poorly → model uncertain
   about exact values
```

---

## Types of Hallucination

```
Factual Hallucination
  Model asserts a false fact
  "The first iPhone was released in 2005" (actual: 2007)

Faithfulness Hallucination
  Model contradicts or goes beyond the provided context
  You give it a document; it adds facts not in the document
  
Source Fabrication
  Model invents plausible-sounding citations, URLs, names
  Common in research contexts

Instruction Hallucination  
  Model claims to have done something it didn't
  "I've sent the email" (no email was sent — no tool was called)

Temporal Hallucination
  Model applies outdated knowledge as if it's current
  "The CEO of Twitter is Jack Dorsey" (outdated)
```

---

## Mitigation Strategies

### 1. Retrieval-Augmented Generation (RAG)
Ground the model in retrieved, current documents.

```
Without RAG:
  User: "What is our refund policy?"
  Model: [makes up something plausible]

With RAG:
  1. Retrieve: find "refund-policy.md" from vector store
  2. Inject: "Use the following context to answer: [policy text]"
  3. Instruct: "Only answer based on the provided context."
  Model: [answers faithfully from document]
```

RAG reduces factual hallucination because the answer is **in the prompt** — the model is doing extraction, not recall.

---

### 2. Prompt Design

**Be specific about source constraints:**
```
Bad:  "What are the side effects of ibuprofen?"
Good: "Using only the provided drug information leaflet below, list 
       the side effects of ibuprofen. If the answer is not in the 
       leaflet, say 'I don't have that information.'
       
       [leaflet text]"
```

**Add explicit uncertainty instructions:**
```
"If you are not certain of an answer, say so explicitly. 
 Do not guess dates, names, or statistics."
```

**Few-shot examples with "I don't know":**
```
Showing examples where the correct answer is "I don't know" 
trains the model to refuse rather than fabricate.
```

---

### 3. Chain-of-Thought (CoT) + Self-Verification

Ask the model to reason step-by-step before answering:

```
"Think through this step by step, then provide your final answer."
```

Or verify its own output:
```
"Answer the question, then double-check your answer for accuracy 
 and correct any mistakes."
```

This works because the reasoning tokens give the model a "scratchpad" — errors in chain-of-thought are often caught in later steps.

---

### 4. Temperature Control

Lower temperature = less random sampling = less hallucination in factual contexts.

```
Factual Q&A:      temperature 0.0–0.2
Code generation:  temperature 0.0–0.3
Creative tasks:   temperature 0.7–1.0
```

---

### 5. Structured Output + Schema Enforcement

Force the model into a fixed schema — easier to detect when fields are missing vs. fabricated:

```json
{
  "answer": "...",
  "confidence": "high|medium|low",
  "sources_used": ["doc_id_1", "doc_id_2"],
  "cannot_answer": false
}
```

If `cannot_answer: true`, your application handles it gracefully instead of displaying a hallucinated response.

---

### 6. Tool Use / Function Calling

Give the model access to factual tools instead of relying on its parametric memory:

```
Without tools: "What is the stock price of Apple?" → model guesses
With tools:    model calls get_stock_price("AAPL") → returns real value
```

Use tools for: current data, calculations, database lookups, calendar/datetime queries.

---

### 7. Self-Consistency Sampling

Run the same query N times (e.g. N=5) and take the majority vote or aggregate.

```
Query: "What year was Python created?"
Run 1: 1991
Run 2: 1991
Run 3: 1989  ← outlier
Run 4: 1991
Run 5: 1991

Majority: 1991  ✓
```

Works well for factual Q&A and reasoning tasks. Expensive (N× inference cost).

---

### 8. Guardrails and Output Validation

Post-process model output before showing it to users:

```
┌────────────┐    ┌──────────────────┐    ┌──────────────┐
│  LLM call  │───►│  Output validator│───►│  User/app    │
└────────────┘    │                  │    └──────────────┘
                  │ • Schema check   │
                  │ • Claim grounding│
                  │ • URL validation │
                  │ • Citation check │
                  └──────────────────┘
```

Tools: Guardrails AI, LlamaIndex guardrails, custom validators.

---

## Measuring Hallucination

```
Evaluation Metrics:

ROUGE / BLEU          → overlap between output and reference (surface-level)
BERTScore             → semantic similarity between output and reference
FactScore             → breaks output into atomic claims, checks each vs. source
RAGAs                 → faithfulness, answer relevance, context precision/recall
G-Eval                → LLM-as-a-judge scoring on factuality dimensions
Human annotation      → ground truth, expensive, gold standard
```

### Key RAGAs Metrics (for RAG pipelines)
```
Faithfulness:         Are claims in the answer grounded in the retrieved context?
Answer Relevance:     Does the answer address the question asked?
Context Precision:    Is the retrieved context relevant? (not noisy)
Context Recall:       Did retrieval catch all information needed to answer?
```

---

## The Reliability Spectrum

```
Low reliability                              High reliability
        │                                           │
        ▼                                           ▼
  Base LLM alone  →  + Prompt constraints  →  + RAG + tools
                     + temperature tuning      + validation
                     + CoT                     + self-consistency
                                                + human review
```

No single technique eliminates hallucination. Production systems layer multiple defenses.

---

## When Hallucination is Acceptable vs. Unacceptable

```
Acceptable risk:
  ✓ Creative writing, brainstorming
  ✓ First drafts reviewed by humans
  ✓ Suggestions that users understand are AI-generated

Unacceptable risk:
  ✗ Medical diagnoses or drug interactions
  ✗ Legal advice or contract interpretation
  ✗ Financial decisions, tax/accounting
  ✗ Citations in published research
  ✗ Customer-facing product specifications
  ✗ Security configurations, permissions
```

For high-stakes domains: always RAG + citation + human in the loop.
