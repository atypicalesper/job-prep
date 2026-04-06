# AI Ethics and Safety

## Why This Matters for Engineers

AI ethics is not just a policy concern — engineers make decisions that embed values into systems. Choosing training data, designing reward functions, setting content filters, deciding who gets access — these are ethical choices, not purely technical ones.

---

## Core Concerns

```
AI Ethics Landscape

┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐
│   FAIRNESS      │  │    SAFETY       │  │  PRIVACY         │
│                 │  │                 │  │                  │
│ Bias in outputs │  │ Harmful content │  │ Training data    │
│ Unequal perf    │  │ Misuse / abuse  │  │ PII leakage      │
│ Discrimination  │  │ Autonomy risks  │  │ Memorization     │
└─────────────────┘  └─────────────────┘  └──────────────────┘

┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐
│ TRANSPARENCY    │  │  ACCOUNTABILITY │  │  AUTONOMY        │
│                 │  │                 │  │                  │
│ Explainability  │  │ Who is liable?  │  │ AI replacing jobs│
│ Audit trails    │  │ Redress for     │  │ Manipulation     │
│ Model cards     │  │ AI-caused harm  │  │ Consent          │
└─────────────────┘  └─────────────────┘  └──────────────────┘
```

---

## Bias in AI Systems

### Types of Bias

```
Data Bias
  Training data over/under-represents certain groups
  e.g. facial recognition trained mostly on lighter-skinned faces
       → higher error rate on darker skin tones

Label Bias
  Human annotators carry cultural assumptions into labeled data
  e.g. sentiment labels reflect annotator's cultural norms

Historical Bias
  Training data encodes past discrimination
  e.g. resume screening trained on historical hires
       → perpetuates past hiring biases

Representation Bias
  Certain languages, dialects, or regions appear rarely in training data
  → LLMs perform worse in low-resource languages

Aggregation Bias
  Model trained on aggregate data performs poorly on subgroups
  e.g. medical model trained on average population
       → inaccurate predictions for specific demographic groups
```

### Mitigating Bias

```
Data level:
  → Audit and balance training data
  → Use inclusive data collection
  → Remove personally identifiable proxies

Model level:
  → Fairness constraints in training objective
  → Differential performance testing across groups
  → Red-teaming for biased outputs

Deployment level:
  → Human review for high-stakes decisions
  → Regular bias audits on production outputs
  → Disaggregated evaluation metrics (not just aggregate accuracy)
```

---

## AI Safety Techniques

### RLHF and Alignment

RLHF (Reinforcement Learning from Human Feedback) is the primary method current models use to align behavior with human values:

```
1. Collect preference data: human ranks model outputs A vs B
2. Train reward model to predict human preference
3. Fine-tune LLM via PPO to maximize reward model score
4. Result: model that is more helpful, less harmful, less deceptive
```

Limitation: reward model learns human preferences of annotators — which may not represent all users, cultures, or stakeholders.

### Constitutional AI (Anthropic)

```
Instead of pure human feedback:
1. Define a "constitution" — a set of ethical principles
2. Model critiques its own outputs against the constitution
3. Model revises outputs to conform to principles
4. Fewer human labels needed; principles are explicit and auditable
```

### RLAIF (RL from AI Feedback)

AI model provides preference labels instead of humans. Cheaper to scale, but risk: AI preferences may diverge from human values if the judge model is itself flawed.

---

## Harmful Content Categories

```
Content Safety Taxonomy:

Direct harm:
  ├── CSAM (child sexual abuse material)
  ├── Instructions for weapons (biological, chemical, nuclear)
  ├── Detailed suicide/self-harm methods
  └── Violence against specific real people

Indirect / contextual harm:
  ├── Hate speech and discrimination
  ├── Misinformation and disinformation
  ├── Manipulation and social engineering scripts
  ├── Surveillance and stalking tools
  └── Copyright and intellectual property violations

Misuse risks:
  ├── Phishing/spam generation at scale
  ├── Academic dishonesty
  ├── Deepfake generation
  └── Automated influence operations
```

### Content Safety Implementation

```
Multi-layer approach:

Input filters
  → Prompt injection detection
  → Classifier to detect harmful intent before LLM call
  → Rate limiting to prevent automated abuse

Model-level
  → Safety fine-tuning (don't answer certain queries)
  → System prompt constraints
  → Refusal training

Output filters
  → Toxicity classifier on generated text
  → PII detection and redaction
  → Domain-specific validators (medical, legal, financial disclaimers)

Human review
  → Sample auditing of flagged outputs
  → Feedback loop back to training data
```

---

## Privacy Concerns in LLMs

### Training Data Privacy

```
Problem: LLMs memorize training data
  → Can reproduce verbatim text from training data on targeted prompts
  → Includes: email addresses, phone numbers, code, personal writing

Real incident: GPT-2 could be prompted to reproduce specific text
              from training data including PII

Mitigations:
  → Data deduplication reduces memorization
  → Differential privacy in training (adds noise to gradients)
  → Post-training PII filtering
  → System prompts: "Do not reproduce personal information verbatim"
```

### Inference-Time Privacy

```
Risks:
  → Users send PII to model APIs (names, addresses, medical info)
  → Enterprise data sent to cloud APIs may be used for training
  → Conversation history may be retained

Mitigations:
  → Use self-hosted / on-premise models for sensitive data
  → PII detection + redaction before API calls
  → Review provider's data retention and training policies
  → Encrypt sensitive fields; only send anonymized versions
```

---

## Transparency and Explainability

### Model Cards

A model card is documentation that ships with an ML model:

```
Model Card Contents (ML Model documentation standard):
  ├── Intended use cases
  ├── Out-of-scope uses
  ├── Training data description
  ├── Evaluation results (overall + per demographic group)
  ├── Known biases and limitations
  └── Ethical considerations and recommendations
```

### Explainability vs. Interpretability

```
Interpretability: Understanding HOW the model works
  → What features does it rely on?
  → Why did this input produce this output?
  → Techniques: attention visualization, probing classifiers, activation patching

Explainability: Providing post-hoc explanations users can understand
  → "This loan was denied because of X, Y, Z factors"
  → Techniques: LIME, SHAP, counterfactual explanations
  → LLMs: Chain-of-Thought as explanation of reasoning
```

LLMs are largely black boxes — CoT provides reasoning transparency, but models can hallucinate reasoning too (reasoning steps don't always reflect internal computation).

---

## Regulatory Landscape

```
EU AI Act (2024 — phased enforcement)
  Risk-based classification:
  ├── Unacceptable risk → BANNED
  │   e.g. social scoring, real-time biometric surveillance in public
  ├── High risk → strict requirements
  │   e.g. CV screening, credit scoring, medical devices, law enforcement
  │   Requires: risk management, data governance, transparency, human oversight
  ├── Limited risk → transparency obligations
  │   e.g. chatbots must disclose they're AI
  └── Minimal risk → no obligations
      e.g. spam filters, AI in video games

US: No federal AI law yet
  → Executive orders and sector-specific guidance (FDA, FTC, NIST AI RMF)
  → NIST AI Risk Management Framework (voluntary)

China: Generative AI regulations (2023)
  → Must register GenAI products with government
  → Training data must be licensed
  → Must label AI-generated content
```

---

## Responsible AI Principles (Summary)

```
Principle           What it means in practice
──────────────────────────────────────────────────────────────
Fairness            Test disaggregated performance; audit for bias
Reliability         Evaluate, monitor, maintain — not set and forget
Safety              Red-team, filter, rate-limit; human review for risk
Privacy             Minimize data collection; anonymize; respect consent
Inclusiveness       Test across languages, cultures, ability levels
Transparency        Document data, methods, limitations (model cards)
Accountability      Clear ownership; human in the loop for high-stakes
```

---

## Agentic AI Safety Considerations

As AI systems gain autonomy (agents, multi-step tasks, tool use), new safety concerns emerge:

```
Prompt injection
  Malicious content in environment (web pages, files) hijacks agent behavior
  Mitigation: sandbox tool execution, validate tool outputs before acting

Unintended side effects
  Agent takes irreversible actions (delete files, send emails, API calls)
  Mitigation: minimal permissions, confirm-before-act for destructive operations

Goal misgeneralization
  Agent pursues proxy metric, not true objective
  e.g. "maximize clicks" → generates sensationalist content

Cascading failures
  Multi-agent systems: one hallucination propagates through all downstream agents
  Mitigation: cross-agent validation checkpoints

Resource acquisition
  Agent acquires more resources/permissions than needed for the task
  Mitigation: principle of least privilege; capability limits per task
```
