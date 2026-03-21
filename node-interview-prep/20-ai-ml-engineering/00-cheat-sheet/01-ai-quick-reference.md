# AI/ML Engineering — Quick Reference Cheat Sheet

## The Stack at a Glance

```
USER QUERY
    ↓
API / Application Layer (Node.js / FastAPI)
    ↓
┌───────────────────────────────────────────┐
│           ORCHESTRATION LAYER             │
│  LangChain / LangGraph / LlamaIndex       │
│  n8n / Step Functions                     │
└───────────────────────────────────────────┘
    ↓                    ↓
┌──────────────┐   ┌──────────────────────┐
│   RETRIEVAL  │   │    LLM GENERATION    │
│  Vector DB   │   │  GPT-4 / Claude /    │
│  + Embeddings│   │  Gemini / Llama      │
└──────────────┘   └──────────────────────┘
    ↑
Documents / Knowledge Base
```

---

## Model Selection Quick Guide

| Use Case | Recommended | Why |
|----------|-------------|-----|
| General coding/chat | GPT-4o or Claude 3.5 | Best quality |
| High volume / cheap | GPT-4o-mini or Claude Haiku | 10x cheaper |
| Long documents | Claude 3.5 (200k) or Gemini 1.5 Pro (1M) | Largest context |
| Open source / private | Llama 3 70B via Ollama | No data leaves your infra |
| Multilingual | Qwen3 or Gemini | Strong non-English |
| Embeddings | text-embedding-3-small | Cost/quality balance |
| Free embeddings | all-MiniLM-L6-v2 (HuggingFace) | Local, fast |

---

## RAG Implementation Checklist

```
□ Choose embedding model (match for indexing AND querying)
□ Chunk size: start with 500 tokens, 50 overlap
□ Index creation: IVFFlat (large scale) or HNSW (fast recall)
□ Metadata: source, date, tenant_id, category
□ Retrieval: top-k=5, consider reranking for better precision
□ Prompt: "Answer ONLY from context. If not found, say I don't know."
□ Evaluation: measure faithfulness + context recall (RAGAS)
□ Update strategy: plan for when docs change
□ Multi-tenancy: always filter by tenant_id
```

---

## Vector Database Decision Tree

```
Do you want managed/hosted?
  YES → Pinecone (best managed) or Weaviate
  NO  ↓
Already using Postgres?
  YES → pgvector (easiest integration)
  NO  ↓
Need max speed, local-only?
  YES → FAISS
  NO  → ChromaDB (simplest to start)
```

---

## LangChain Patterns

```python
# RAG chain (copy-paste ready)
chain = (
    {"context": retriever | format_docs, "question": RunnablePassthrough()}
    | ChatPromptTemplate.from_template("Context: {context}\nQ: {question}")
    | ChatOpenAI(model="gpt-4o-mini", temperature=0)
    | StrOutputParser()
)

# Streaming
async for chunk in chain.astream({"question": "..."}):
    yield chunk

# With memory
chain_with_history = RunnableWithMessageHistory(
    chain,
    get_session_history,  # Returns BaseChatMessageHistory
    input_messages_key="question",
    history_messages_key="history",
)
```

---

## LangGraph Agent Template

```python
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode, tools_condition
from typing import TypedDict, Annotated
import operator

class State(TypedDict):
    messages: Annotated[list, operator.add]

model_with_tools = ChatOpenAI().bind_tools(tools)
graph = StateGraph(State)
graph.add_node("agent", lambda s: {"messages": [model_with_tools.invoke(s["messages"])]})
graph.add_node("tools", ToolNode(tools))
graph.set_entry_point("agent")
graph.add_conditional_edges("agent", tools_condition)
graph.add_edge("tools", "agent")

app = graph.compile()
```

---

## Prompt Engineering Cheat Sheet

| Technique | When to use | Template |
|-----------|-------------|----------|
| Zero-shot | Simple, well-known tasks | Just the task |
| Few-shot | Format/style consistency | Show 3-5 examples |
| CoT | Multi-step reasoning | "Think step by step" |
| ReAct | Agent with tools | "Thought/Action/Observation" |
| Structured output | Machine-readable | + JSON schema |
| Role | Domain expertise | "You are a [expert]..." |

**Temperature guide:**
- `0.0` → code, math, factual Q&A
- `0.3` → summarization, classification
- `0.7` → general chat, RAG responses
- `1.0` → creative writing, brainstorming

---

## AI System Design Trade-offs

| Decision | Option A | Option B |
|----------|----------|----------|
| Knowledge freshness | RAG (always current) | Fine-tuning (static) |
| Cost per query | Smaller model | Better quality |
| Latency | Streaming (perceived faster) | Batch (true throughput) |
| Accuracy | Multi-agent verify | Single agent fast |
| Control | Rule-based + LLM | Pure LLM |
| Privacy | Local model (Ollama) | Cloud API |
| Cost model | Self-hosted GPU | Pay-per-token API |

---

## Interview Rapid-Fire Answers

**Hallucination fix?** → RAG, lower temperature, fact-checking layer

**RAG vs fine-tuning?** → RAG for facts + live data; fine-tune for behavior/style

**Context window exhausted?** → Summarize history, chunk + retrieve, hierarchical summaries

**Agent in infinite loop?** → recursion_limit, attempts counter, exit condition in routing

**Multi-tenant RAG?** → Always filter by tenant_id at query time; use namespaces

**Embedding model changed?** → Re-index entire collection — mixing models = garbage results

**Slow vector search?** → Wrong index type (use HNSW), missing index, too many dimensions

**LLM ignores context?** → Put context BEFORE question, explicit "answer ONLY from context" instruction

**Flaky E2E tests?** → Race conditions → use `wait_for_selector` not `wait_for_timeout`

**n8n at scale?** → Queue mode + Redis + horizontal worker scaling

---

## Key Numbers to Remember

```
Token costs (approximate):
  GPT-4o:      input $2.50/M,  output $10/M tokens
  GPT-4o-mini: input $0.15/M,  output $0.60/M tokens
  Claude 3.5:  input $3/M,     output $15/M tokens
  Embeddings:  $0.02-0.13/M tokens (tiny vs generation)

Conversion:
  1 token ≈ 0.75 words (English)
  1 page ≈ 750 tokens
  1k tokens ≈ $0.001-0.015 depending on model

Context windows:
  GPT-4o: 128k | Claude 3.5: 200k | Gemini 1.5 Pro: 1M

Chunk sizes:
  Q&A: 200-500 tokens | Summarization: 500-1500 tokens
  Overlap: 10-15% of chunk size

RAG retrieval:
  k=3-5 chunks (don't over-retrieve — noise hurts quality)
  Reranker: re-score top 20, return top 5
```

---

## Crownstack COMET Q1 FY26-27 Focus Areas

```
Category                Tools/Technologies
─────────────────────────────────────────────────────────────
Building AI Agents       LangChain, LangGraph
RAG & Vector DBs         OpenAI/HuggingFace/Gemini/Qwen3/Cohere Embeddings
                         ChromaDB, Pinecone, pgvector, FAISS
                         LangChain, LlamaIndex
Workflow Automation      n8n, AWS Step Functions, Playwright (Advanced)

LlamaIndex (vs LangChain):
  - LlamaIndex: specialized for RAG/data ingestion (simpler for pure RAG)
  - LangChain: broader ecosystem (agents, chains, memory, tools)
  - LlamaIndex's Query Engine ≈ LangChain's RAG chain
  - Use LlamaIndex when: complex document hierarchies, query routing
  - Use LangChain when: agents, complex chains, broader tool ecosystem
```
