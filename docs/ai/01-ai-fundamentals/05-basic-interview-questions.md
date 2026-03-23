# AI Basics — Foundational Interview Questions

Entry-level and mid-level questions that come up in every AI/ML engineering interview. Know these cold before the advanced topics.

---

## What is AI / ML / Deep Learning?

```
AI  ⊃  Machine Learning  ⊃  Deep Learning  ⊃  LLMs

AI          — any technique making machines mimic intelligence
              (rule-based systems, search algorithms, etc.)
ML          — systems that learn patterns from data automatically
Deep Learning — ML using multi-layer neural networks
LLMs        — Deep Learning on massive text data → language understanding
```

---

## What is a neural network?

Layers of "neurons" (weighted nodes) connected together. Input passes through layers, each applying a linear transformation + activation function, until the output layer produces a prediction.

```
Input Layer → Hidden Layers → Output Layer
  [x1, x2]  →  [weights, activation]  →  [prediction]

Activation functions:
  ReLU: max(0, x)           — most common in hidden layers
  Sigmoid: 1/(1+e^-x)       — binary classification output
  Softmax: e^xi / Σe^xj     — multi-class classification output
```

Training = adjusting weights to minimize loss via gradient descent + backpropagation.

---

## What is training vs inference?

| | Training | Inference |
|---|---|---|
| What happens | Model learns from data, weights updated via gradient descent | Model makes predictions using fixed weights |
| Hardware | GPU-intensive (days/weeks) | Can run on CPU, lighter GPU |
| Cost | Very expensive | Much cheaper per request |
| When | Offline, one-time (or periodic) | Real-time, per request |

GPT-4 training cost ~$100M. Running one query costs fractions of a cent.

---

## What are tokens?

Tokens are the units an LLM processes — roughly a word or word-piece:

```
"Hello world"     → ["Hello", " world"]           = 2 tokens
"unhappiness"     → ["un", "happiness"]            = 2 tokens
"ChatGPT is great"→ ["Chat", "G", "PT", " is", " great"] = 5 tokens

Rule of thumb:  1 token ≈ 4 characters ≈ ¾ of a word
                100 tokens ≈ 75 words
                1,000 tokens ≈ 750 words
```

Everything in the prompt + response costs tokens. LLMs have a **context window** = max tokens they can see at once.

---

## What is the context window?

The maximum number of tokens an LLM can process in a single call (input + output combined):

| Model | Context Window |
|---|---|
| GPT-4o | 128K tokens (~100K words) |
| Claude 3.5 Sonnet | 200K tokens |
| Gemini 1.5 Pro | 1M tokens |
| Llama 3.1 70B | 128K tokens |

**Important:** Larger context ≠ better. Models struggle with information in the middle of very long contexts ("lost in the middle" problem). For RAG, retrieve only what's relevant rather than dumping everything.

---

## What is a Large Language Model (LLM)?

A neural network (transformer architecture) trained on huge amounts of text to predict the next token. The model learns grammar, facts, reasoning patterns, and code through self-supervised learning — no human labels needed.

Key properties:
- **Emergent abilities** — capabilities that appear at scale (reasoning, code generation) that smaller models don't have
- **Few-shot learning** — can perform new tasks just from examples in the prompt
- **Not a knowledge base** — knowledge is baked into weights at training time (cutoff date)

---

## What is temperature and how does it affect output?

Controls randomness in token selection:

```
temperature = 0    → always pick the highest-probability token (deterministic)
temperature = 0.7  → balanced creativity and coherence (good default)
temperature = 1.0  → more random, creative
temperature = 2.0  → very random, often incoherent

Use cases:
  Code generation:    temperature = 0 – 0.2  (want deterministic)
  Creative writing:   temperature = 0.8 – 1.0
  Factual Q&A:        temperature = 0
  RAG answers:        temperature = 0.1 – 0.3
```

**top_p (nucleus sampling)** — alternative to temperature. Only considers top tokens whose cumulative probability ≥ p. Set either temperature OR top_p, not both.

---

## What is prompt engineering?

Designing the text you send to an LLM to get better outputs. Core techniques:

```python
# 1. System prompt — sets role and constraints
system = "You are a senior Python developer. Be concise. Only answer coding questions."

# 2. Few-shot examples — show the model what you want
prompt = """
Convert to JSON:
Input: "Name: Tarun, Age: 28"
Output: {"name": "Tarun", "age": 28}

Input: "Name: Alice, Age: 32"
Output:"""

# 3. Chain-of-thought — ask for step-by-step reasoning
prompt = "Solve this step by step: [problem]"

# 4. Output format constraints
prompt = "Return ONLY valid JSON with keys: {name, score, reason}. No explanation."

# 5. Role + task + format
prompt = """
Role: You are a code reviewer.
Task: Review this Python function for bugs.
Format: List each bug as: [LINE] [SEVERITY] [DESCRIPTION]
Code: {code}
"""
```

---

## What is RAG (Retrieval-Augmented Generation)?

A pattern where you:
1. **Retrieve** relevant documents from a knowledge base
2. **Inject** them into the prompt
3. **Generate** a grounded answer

Solves: hallucination (model invents facts), knowledge cutoff (model has stale training data), proprietary data (model was never trained on your docs).

```python
# Simple RAG flow
def rag_answer(question: str) -> str:
    # 1. Embed the question
    query_vector = embed(question)

    # 2. Search vector DB for relevant docs
    docs = vector_db.search(query_vector, top_k=3)

    # 3. Build prompt with context
    context = "\n\n".join(d.text for d in docs)
    prompt = f"Answer based on context only:\n\n{context}\n\nQ: {question}"

    # 4. Call LLM
    return llm.complete(prompt)
```

---

## What is a vector embedding?

A fixed-size numerical representation of text (or images, audio) where semantic similarity = geometric closeness:

```python
"dog"             → [0.12, -0.34, 0.87, ...]  # 1536 numbers
"puppy"           → [0.11, -0.35, 0.88, ...]  # very close to "dog"
"quantum physics" → [-0.45, 0.21, -0.12, ...] # far from "dog"

# Similarity measured by cosine distance (angle between vectors)
```

Embeddings are the foundation of semantic search, RAG, recommendation systems, and duplicate detection.

---

## What is fine-tuning?

Taking a pretrained model and continuing to train it on your specific dataset to adapt its behavior:

```
Pretrained LLM (general knowledge)
       ↓
Fine-tune on your data (customer support tickets, medical records, legal docs)
       ↓
Specialized model (better at your specific task, domain-aware)
```

**When to fine-tune vs RAG:**

| Scenario | Use RAG | Use Fine-tuning |
|---|---|---|
| Need up-to-date info | ✅ | ❌ |
| Custom behavior/style | ❌ | ✅ |
| Large knowledge base | ✅ | ❌ (too much to bake in) |
| Consistent output format | Prompt engineering first | Fine-tune if prompting fails |
| Latency sensitive | ❌ (extra retrieval step) | ✅ |

---

## What is an AI agent?

An LLM that can take actions to complete multi-step goals — not just respond in one turn:

```
Agent loop:
1. Receive goal
2. Think: "What tool do I need?"
3. Call tool (search web, run code, query DB, call API)
4. Observe result
5. Decide: goal reached? → return answer | else → go to step 2
```

```python
# ReAct agent pattern
while not done:
    thought = llm("Think step by step. What should I do next?")
    action  = llm("What tool to call? Format: tool_name(args)")
    result  = call_tool(action)
    observation = f"Tool returned: {result}"
    # feed observation back into context
```

Key components: LLM brain, tools (functions it can call), memory (context window or external), orchestrator (LangGraph, LangChain AgentExecutor).

---

## What is LangChain?

A Python/JS framework for building LLM-powered apps. Core abstractions:

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# Basic chain (LCEL — LangChain Expression Language)
llm = ChatOpenAI(model="gpt-4o")
prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant."),
    ("user", "{question}")
])
chain = prompt | llm | StrOutputParser()
result = chain.invoke({"question": "What is RAG?"})

# RAG chain
from langchain_core.runnables import RunnablePassthrough
rag_chain = (
    {"context": retriever, "question": RunnablePassthrough()}
    | prompt
    | llm
    | StrOutputParser()
)
```

---

## What is the difference between OpenAI, Anthropic, and open-source LLMs?

| Provider | Models | Key Strengths | Notes |
|---|---|---|---|
| OpenAI | GPT-4o, o1, o3 | Widest ecosystem, function calling | Proprietary, usage-based pricing |
| Anthropic | Claude 3.5 Sonnet/Opus | Long context (200K), safety, coding | Proprietary |
| Google | Gemini 1.5 Pro/Flash | 1M context, multimodal | Proprietary |
| Meta | Llama 3.1 (8B/70B/405B) | Open weights, self-hostable | Open source (custom license) |
| Mistral | Mistral 7B, Mixtral | Efficient MoE, open weights | Open source |

**Self-hosted (Ollama):**
```bash
ollama run llama3.1  # run locally
curl http://localhost:11434/api/generate -d '{"model":"llama3.1","prompt":"Hello"}'
```

---

## Common AI interview gotchas

**Q: What's the difference between parameters and hyperparameters?**
Parameters = weights the model learns during training (billions of floats). Hyperparameters = settings YOU choose before training (learning rate, batch size, number of layers, temperature at inference).

**Q: What does "GPT-4 has 1.7 trillion parameters" mean?**
The model has 1.7T numbers (float16) stored as its weights. More parameters generally = more capacity to learn patterns = larger model size in memory. GPT-4 @ float16 ≈ 3.4TB RAM.

**Q: What is the difference between generative and discriminative models?**
Discriminative models (classifiers) learn to distinguish between classes — output is a label (spam/not spam). Generative models learn the underlying data distribution and can generate new samples — LLMs generate text, diffusion models generate images.

**Q: What is overfitting?**
Model memorizes training data too well — performs great on training examples, poorly on new data. Signs: training loss low, validation loss high. Fixes: more data, regularization (dropout, weight decay), early stopping, simpler model.

**Q: What is zero-shot vs few-shot learning?**
Zero-shot: model performs a task with no examples in the prompt — relies purely on training. Few-shot: provide 2–5 examples in the prompt showing input→output pairs — dramatically improves performance on specific formats/tasks. In-context learning (few-shot) is a core LLM superpower.
