# Hallucination and Reliability — Interview Questions

**Q: What is LLM hallucination and why does it happen?**

Hallucination is when an LLM generates factually incorrect or fabricated content stated with confidence. It happens because LLMs are trained to predict probable next tokens — they optimize for "sounds right" not "is factually correct." All knowledge is compressed into weights, so the model fills gaps with statistically plausible-sounding content rather than admitting uncertainty.

---

**Q: What are the main types of hallucination?**

1. **Factual** — incorrect facts ("Python was created in 1988")
2. **Faithfulness** — contradicts or goes beyond the provided context
3. **Source fabrication** — invents citations, URLs, author names
4. **Instruction** — claims to have done something it didn't (e.g. "I sent the email")
5. **Temporal** — applies outdated knowledge as current

---

**Q: How does RAG reduce hallucination?**

RAG grounds the model in retrieved documents injected into the prompt. Instead of relying on parametric memory (compressed in weights), the model extracts answers from text that's literally in the context. Combined with instructions like "answer only from the provided context," the model is doing extraction rather than recall — a much easier task with fewer failure modes.

---

**Q: If you had to pick one technique to reduce hallucination in a production Q&A system, what would it be and why?**

RAG. It's the most impactful single change because it attacks the root cause — the model has no ground truth to refer to. With RAG, answers are grounded in source documents, you get citation support, and stale knowledge isn't an issue. Other techniques (temperature tuning, CoT) are complements, not substitutes.

---

**Q: What is the faithfulness metric and how do you measure it?**

Faithfulness measures whether all claims in the model's answer are supported by the retrieved context. It's typically computed by:
1. Breaking the answer into atomic claims
2. Checking each claim against the source documents (via another LLM or NLI model)
3. Score = supported claims / total claims

RAGAs framework computes this automatically for RAG pipelines.

---

**Q: What is sycophancy in LLMs?**

Sycophancy is the tendency of RLHF-trained models to agree with the user's stated or implied preference, even when incorrect. If you tell the model "I think Python was created in 1985, right?", a sycophantic model may confirm this rather than correct it. It's an artifact of optimizing for human approval — humans often prefer validation over correction.

Mitigation: use prompts that explicitly request pushback ("If I'm wrong, correct me"), use adversarial system prompts, or fine-tune with preference data that rewards accuracy over agreement.

---

**Q: When would you use self-consistency sampling?**

When accuracy is critical and you can afford higher inference cost. Run the query N times (N=3-10), then aggregate (majority vote, average, or LLM to synthesize). Most useful for:
- Multi-hop reasoning questions
- Math problems
- Factual trivia where the model might be uncertain

Not worth it for: deterministic tasks (set temperature=0), creative tasks, latency-sensitive applications.

---

**Q: What is the "lost in the middle" problem and how does it affect RAG design?**

Research shows LLMs have weaker attention to content in the middle of long contexts — they recall the beginning and end more reliably. For RAG, if you retrieve 10 chunks, the most relevant should be placed first (or last), not buried in the middle. Re-ranking retrieved results to surface the most relevant chunk to position 1 in the context improves faithfulness.

---

**Q: How do you detect hallucination at runtime without human review?**

1. **LLM-as-judge** — use a second LLM call to assess whether the answer is grounded in the retrieved context
2. **NLI-based scoring** — use a Natural Language Inference model to check entailment between answer claims and source docs
3. **Citation checking** — extract cited document IDs and verify the claim exists in those documents
4. **Schema validation** — if using structured output, check for missing/null required fields (often a proxy for uncertainty)
5. **Confidence field** — instruct model to self-report confidence; flag low-confidence outputs for review

---

**Q: What is the difference between RAG hallucination and generation hallucination?**

- **Retrieval hallucination**: wrong documents are retrieved (context precision failure) → model answers from irrelevant or contradictory context
- **Generation hallucination**: correct documents are retrieved but the model still fabricates beyond them (faithfulness failure) → model adds information not in the context

Both require different fixes: better retrieval (re-ranking, hybrid search) vs. stricter generation prompts and faithfulness validators.

---

**Q: What is FactScore?**

FactScore is an evaluation framework that:
1. Breaks generated text into atomic facts (e.g., "X was born in 1990", "X graduated from MIT")
2. Checks each atomic fact against a knowledge source (Wikipedia, retrieved docs, etc.)
3. Computes a score = fraction of facts that are supported

It's more granular than ROUGE/BERTScore because it identifies which specific claims are hallucinated rather than giving a single similarity score.

---

**Q: A user reports that your AI assistant fabricated a legal case citation. What went wrong and how do you fix it?**

What went wrong: the model relied on parametric memory for a specific fact (case citation) that either doesn't exist or was recalled incorrectly. Legal citations are high-risk for hallucination because they're precise and rare in training data.

Fix:
1. Add a system prompt rule: "Do not invent citations. If you cannot provide a verified citation, say so."
2. Integrate a legal database search tool — model must call the tool to retrieve a citation rather than recalling from memory
3. Add output validation: regex-check citation format, then look it up in a real database before returning to user
4. Add a disclaimer for all legal content generated without verified sources

---

**Q: Can fine-tuning eliminate hallucination?**

No. Fine-tuning can reduce hallucination on specific domains (by reinforcing accurate facts in weights) but it:
1. Adds a static knowledge snapshot that becomes stale
2. Can introduce new hallucinations on out-of-distribution queries
3. Doesn't solve the fundamental gap between "probable" and "true"

Fine-tuning is best for: style, format, tone, domain vocabulary. For factual accuracy, RAG + tool use is more reliable than trying to stamp all facts into weights.
