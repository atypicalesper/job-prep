# Advanced Prompt Engineering Patterns

## Chain of Thought (CoT) Deep Dive

```python
# Basic CoT — works well for reasoning, math, multi-step problems
basic_cot = """Solve this step by step:
A store has 120 apples. They sell 45 on Monday, restock with 30 on Tuesday,
then sell 60% of remaining on Wednesday. How many apples remain?

Think through each step before giving your final answer."""

# Zero-shot CoT trigger phrase
# "Let's think step by step." is the canonical trigger
# Works surprisingly well even without showing examples

# Few-shot CoT (more reliable for complex tasks)
few_shot_cot = """Q: Roger has 5 tennis balls. He buys 2 more cans of 3 balls each.
How many tennis balls does he have now?

A: Roger starts with 5 balls.
   He buys 2 cans × 3 balls = 6 new balls.
   Total = 5 + 6 = 11 balls.
   Answer: 11

Q: John has 3x more apples than Mary. Together they have 24.
How many does John have?

A: Let Mary have x apples. John has 3x.
   x + 3x = 24 → 4x = 24 → x = 6.
   John has 3 × 6 = 18 apples.
   Answer: 18

Q: {your_question}
A:"""

# Self-consistency CoT (more reliable, costly)
# Generate N answers with different reasoning paths → majority vote
async def self_consistent_answer(question: str, n: int = 5) -> str:
    answers = []
    for _ in range(n):
        response = await llm.ainvoke(f"{question}\nLet's think step by step.")
        # Extract final answer from reasoning
        answer = extract_final_answer(response)
        answers.append(answer)

    # Return most common answer
    from collections import Counter
    return Counter(answers).most_common(1)[0][0]
```

---

## Structured Output Patterns

```python
# Pattern 1: JSON mode + schema in prompt
json_extraction_prompt = """Extract the following information from the support ticket.
Return ONLY valid JSON matching the schema below. No explanation.

Schema:
{
  "issue_type": "billing | technical | shipping | other",
  "urgency": "low | medium | high | critical",
  "customer_id": "string or null",
  "summary": "one sentence description",
  "required_team": "billing | engineering | logistics | general"
}

Ticket:
{ticket_text}"""

# Pattern 2: XML for nested/complex structures
# Claude especially good with XML (trained on extensive XML data)
xml_prompt = """Analyze this code review.

Return your analysis in this XML structure:
<review>
  <overall_rating>1-10</overall_rating>
  <issues>
    <issue>
      <severity>critical|major|minor|suggestion</severity>
      <location>filename:linenum</location>
      <description>...</description>
      <suggested_fix>...</suggested_fix>
    </issue>
  </issues>
  <positives>
    <positive>...</positive>
  </positives>
  <summary>...</summary>
</review>

Code:
{code}"""

# Pattern 3: TypedDict / Pydantic schema enforcement
from pydantic import BaseModel
from langchain_anthropic import ChatAnthropic

class ProductReview(BaseModel):
    sentiment: str  # positive | negative | neutral
    rating: int     # 1-5
    key_points: list[str]
    would_recommend: bool

# Use structured_output (instructor-style)
llm = ChatAnthropic(model="claude-opus-4-6")
structured_llm = llm.with_structured_output(ProductReview)

result: ProductReview = structured_llm.invoke(
    "Analyze this review: 'Great product, fast shipping, would buy again!'"
)
# result.sentiment == "positive"
# result.rating == 5
# result.would_recommend == True
```

---

## Meta-Prompting

```python
# Meta-prompting: use the model to generate/improve its own prompts

# 1. Prompt refinement
def improve_prompt(draft_prompt: str, task_description: str) -> str:
    meta_prompt = f"""You are an expert prompt engineer.

Task I want to accomplish: {task_description}

Current draft prompt: {draft_prompt}

Improve this prompt to be:
1. More specific about the expected output format
2. Clear about edge cases
3. Includes a helpful example if needed
4. Has explicit instructions for what to do if unsure

Return the improved prompt only."""

    return llm.invoke(meta_prompt).content

# 2. Auto-generate few-shot examples
def generate_examples(task: str, n: int = 5) -> list[dict]:
    prompt = f"""Generate {n} diverse, high-quality input/output examples for this task:
{task}

Requirements:
- Vary the inputs significantly (don't repeat similar cases)
- Include at least 1 edge case
- Make outputs realistic and detailed

Return as JSON array: [{{"input": "...", "output": "..."}}]"""

    import json
    return json.loads(llm.invoke(prompt).content)

# 3. Adversarial prompt testing (find failure cases)
def generate_adversarial_tests(prompt: str) -> list[str]:
    meta = f"""Given this prompt template:
{prompt}

Generate 10 adversarial test inputs that might cause the model to fail.
Include: edge cases, ambiguous inputs, injection attempts, extreme values.

Return as JSON array of strings."""

    return json.loads(llm.invoke(meta).content)
```

---

## Role and Persona Prompting

```python
# Effective role prompts do 3 things:
# 1. Define WHO the model is
# 2. Define WHAT they know
# 3. Define HOW they respond

# Weak role prompt:
weak = "You are a helpful assistant."

# Strong role prompt:
strong = """You are a senior software engineer at a fintech company with 10 years experience.
You specialize in Python backend systems, distributed databases, and financial compliance (PCI-DSS, SOX).

Your communication style:
- Direct and technical — no hand-holding for basics
- Always consider security and compliance implications
- Prefer proven solutions over cutting-edge experimental ones
- If a question is ambiguous, ask for the specific constraint before answering

What you will NOT do:
- Recommend approaches that violate financial regulations
- Suggest solutions without noting relevant tradeoffs
- Skip error handling in code examples"""

# Persona consistency tip: add "Stay in character" at end of long prompts
# This prevents the model from breaking role after complex instructions

# Expert elicitation pattern (get depth, not breadth)
expert_pattern = """As a world-class {domain} expert who has:
- {credential_1}
- {credential_2}
- {relevant_experience}

Answer this question as you would for a professional peer, not a beginner.
Assume I know: {assumed_knowledge}.
I want to understand: {specific_aspect}.

Question: {question}"""
```

---

## Constitutional AI Prompting

```python
# Constitutional AI: guide the model's values through explicit principles

SYSTEM_PROMPT = """You are a customer support agent for a financial services company.

Core principles (in priority order):
1. ACCURACY: Only state what you know to be true. Say "I don't know" rather than guess.
2. SAFETY: If a user seems in financial distress, prioritize their wellbeing over product sales.
3. COMPLIANCE: Never give specific investment advice — recommend speaking with a financial advisor.
4. HELPFULNESS: Within the above constraints, be as helpful as possible.

When these principles conflict, always defer to the higher-priority one."""

# Self-critique pattern (model reviews its own output)
self_critique_prompt = """I'll generate a response, then critique it for accuracy and helpfulness.

Response draft:
{draft}

Critique:
- What did I get right?
- What did I get wrong or what could be misleading?
- What important information did I leave out?

Improved response (incorporating critique):"""
```

---

## Dynamic Prompt Construction

```python
# Building prompts programmatically based on context

def build_rag_prompt(
    query: str,
    retrieved_docs: list[str],
    user_tier: str,            # "free" | "pro" | "enterprise"
    conversation_history: list[dict],
    language: str = "en",
) -> list[dict]:
    """Dynamically construct the best prompt for the situation."""

    # Adjust verbosity based on user tier
    verbosity_instruction = {
        "free": "Keep responses concise (2-3 sentences max).",
        "pro": "Provide thorough responses with examples.",
        "enterprise": "Provide comprehensive technical responses with code examples where relevant.",
    }[user_tier]

    # Language instruction
    lang_instruction = f"Respond in {language}." if language != "en" else ""

    # Format context (most relevant first, with clear separation)
    context_block = "\n\n---\n\n".join([
        f"[Document {i+1}]\n{doc}"
        for i, doc in enumerate(retrieved_docs[:3])  # Top 3 only
    ])

    system_msg = {
        "role": "system",
        "content": f"""You are a helpful assistant. Answer using ONLY the provided documents.
If the answer isn't in the documents, say "I don't have information about that."
{verbosity_instruction}
{lang_instruction}

Documents:
{context_block}"""
    }

    # Include last 3 turns of conversation history (not full history)
    messages = [system_msg] + conversation_history[-6:] + [
        {"role": "user", "content": query}
    ]

    return messages
```

---

## Prompt Debugging Techniques

```python
# When a prompt isn't working, debug systematically:

# 1. Minimal reproduction — strip everything until failure isolated
def minimal_repro(failing_prompt: str, model_output: str):
    """Is the problem in the prompt or the model?"""
    # Try with GPT-4 and Claude — if both fail, it's likely the prompt
    # If only one fails, it's model-specific

# 2. Add explicit chain-of-thought to understand failures
debug_prefix = """Before answering, think aloud:
1. What is the user asking?
2. What information do I have available?
3. What are the key constraints I need to follow?
4. What is my answer?

Thinking:"""

# 3. Temperature ablation — rule out randomness
# Run same prompt 5x at temperature=0, check if outputs vary
# If consistent but wrong → problem is the prompt, not randomness
# If inconsistent → model is uncertain, need more specificity

# 4. Prompt diff testing
# Change one thing at a time, measure improvement
# Treat prompts like code: version them, test them, review them

# Common failure → fix mappings:
FAILURE_PATTERNS = {
    "model ignores instructions": "Move instructions to start AND end of prompt",
    "wrong output format": "Add 'Return ONLY...' and show an example",
    "too verbose": "Add 'Be concise. Maximum X sentences.'",
    "hallucinating": "Add 'Only use information from the provided context'",
    "inconsistent tone": "Add specific tone examples ('Say: X, not Y')",
    "ignores edge cases": "Add 'If X, then Y. If Z, then W.' rules explicitly",
}
```

---

## Prompt Patterns Cheat Sheet

```
Pattern               When to Use                 Key Element
─────────────────────────────────────────────────────────────────
Role + Domain         Expertise needed            "You are a [role] specializing in..."
Few-shot              Format/style teaching       3-5 input→output examples
Chain-of-Thought      Reasoning tasks             "Think step by step"
Self-consistency      High-stakes reasoning       Run N times, majority vote
JSON schema           Structured extraction       Schema in prompt + "ONLY valid JSON"
XML structure         Nested/hierarchical data    Explicit XML tags
Negative examples     Prevent common errors       "Do NOT...", "Avoid..."
Critique-revise       Quality improvement         Draft → critique → improve
Constitutional        Value alignment             Priority-ordered principles
Least-to-most         Complex decomposition       Solve simpler subproblems first
```
