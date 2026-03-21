# AI Developer Roadmap — 2025/2026

## Where to Start (Choose Your Path)

```
Are you already a software developer?
  YES → You're halfway there. Focus on: LLM APIs → RAG → Agents → Production
  NO  → Start with Python basics + ML fundamentals first

What's your goal?
  Build AI features into apps    → Path A: Applied AI Engineer
  Research/train models          → Path B: ML Engineer / Research
  Build AI infrastructure        → Path C: AI Platform Engineer
  All of the above (Crownstack)  → Path A first, expand to B/C
```

---

## Path A: Applied AI Engineer (Recommended First Path)

### Phase 1 — Foundations (Weeks 1–4)
```
□ Python proficiency (async, type hints, pydantic)
□ How LLMs work conceptually (tokens, context, temperature)
□ OpenAI / Anthropic API basics
  - Chat completions
  - Streaming responses
  - Tool/function calling
□ Prompt engineering fundamentals
  - Zero-shot, few-shot, CoT
  - System vs user prompts
  - Structured output (JSON mode)
```

### Phase 2 — RAG & Vector Search (Weeks 5–8)
```
□ Embeddings — what they are, how to generate
□ Vector databases — ChromaDB → pgvector → Pinecone
□ Basic RAG pipeline (ingest → embed → store → retrieve → generate)
□ Chunking strategies (fixed, semantic, document-aware)
□ Retrieval evaluation (RAGAS basics)
□ Multi-tenant RAG (tenant_id filtering)
```

### Phase 3 — Orchestration (Weeks 9–12)
```
□ LangChain LCEL (pipe operator, Runnables, chains)
□ LangGraph (StateGraph, agents, human-in-the-loop)
□ Memory systems (in-context, Redis, PostgresStore)
□ Tool calling patterns (@tool decorator, StructuredTool)
□ MCP (Model Context Protocol) — tools as a standard
□ n8n for workflow automation
```

### Phase 4 — Production (Weeks 13–16)
```
□ Streaming (SSE, WebSocket patterns)
□ Cost optimization (caching, smaller models, batching)
□ Rate limiting and retry logic
□ Observability (LangSmith, Langfuse, structured logging)
□ Evaluation pipelines (offline evals, online monitoring)
□ Security (prompt injection prevention, data isolation)
```

### Phase 5 — Advanced (Weeks 17–24)
```
□ Fine-tuning (LoRA, QLoRA — when and why)
□ Multi-agent systems (supervisor, debate, fan-out patterns)
□ Advanced RAG (reranking, hybrid search, HyDE, RAPTOR)
□ Multimodal (vision, document parsing, audio)
□ AI security (red teaming, guardrails, NeMo)
□ AI deployment (vLLM, Ollama, BentoML, Modal)
```

---

## Technology Stack by Role

| Layer | Beginner | Intermediate | Advanced |
|-------|----------|-------------|---------|
| **LLM Provider** | OpenAI GPT-4o | Claude + Gemini | Local Llama via Ollama |
| **Orchestration** | LangChain LCEL | LangGraph agents | Custom agent loops |
| **Vector DB** | ChromaDB | pgvector + FAISS | Pinecone + Weaviate |
| **Embeddings** | text-embedding-3-small | Cohere + Qwen3 | Custom fine-tuned |
| **Workflow** | n8n | Step Functions | Custom DAGs |
| **Memory** | In-context | Redis + PostgresStore | Hierarchical memory |
| **Eval** | Manual review | RAGAS | LangSmith + custom evals |
| **Deploy** | API endpoint | Docker + FastAPI | vLLM + Kubernetes |

---

## The Technologies in Detail

### Must-Know APIs
```python
# 1. OpenAI (most common in industry)
from openai import AsyncOpenAI
client = AsyncOpenAI()
# - Chat completions, streaming, tool calling, structured output
# - Embeddings, moderation, vision
# - Assistants API (for state management)
# - Batch API (50% cheaper, async)

# 2. Anthropic Claude
import anthropic
client = anthropic.Anthropic()
# - Longest context (200k tokens)
# - Tool use (function calling)
# - Computer use (beta — controls browser/desktop)
# - Prompt caching (cache static parts of prompts)

# 3. Google Gemini
# - Largest context (1M tokens with Gemini 1.5 Pro)
# - Native multimodal (images, video, audio, PDF)
# - Grounding with Google Search

# 4. Groq (for speed)
# - Fastest inference (GroqCloud) — for low-latency apps
# - llama-3.3-70b, mixtral-8x7b

# 5. Ollama (for privacy/local)
# - Run Llama, Mistral, Qwen locally
# - No data leaves your infra
```

### LangChain Ecosystem
```
LangChain Core
├── LCEL (LangChain Expression Language) — pipe operator chains
├── Runnables (RunnablePassthrough, RunnableParallel, RunnableLambda)
├── Prompts (ChatPromptTemplate, MessagesPlaceholder)
├── Output parsers (StrOutputParser, PydanticOutputParser, JsonOutputParser)
└── Memory (RunnableWithMessageHistory, InMemoryChatMessageHistory)

LangChain Community
├── Document loaders (PDF, web, CSV, database)
├── Text splitters (recursive, semantic, code)
├── Vector stores (Chroma, Pinecone, pgvector, FAISS, Weaviate)
└── LLM integrations (OpenAI, Anthropic, Groq, Ollama, Bedrock)

LangGraph (agents + stateful workflows)
├── StateGraph — define workflow as a graph
├── ToolNode — execute tool calls
├── Checkpointers — persist state (MemorySaver, PostgresSaver)
└── Interrupt — human-in-the-loop

LangSmith (observability)
├── Trace every chain/agent call
├── Dataset management for evals
└── Online monitoring
```

### MCP (Model Context Protocol)
```
The emerging standard for connecting AI models to tools.
- Defined by Anthropic, adopted by OpenAI, Google
- Replaces ad-hoc function calling with a universal protocol
- Tools, Resources (data), Prompts (templates) as standard entities
- Used by Claude Desktop, Cursor, Windsurf, custom AI apps

Why it matters: in 2025, every serious AI app will use MCP
```

---

## Crownstack COMET Q1 FY26-27 Priorities

```
Priority 1 (Immediate): LangChain LCEL + LangGraph agents
  → Build production RAG chains
  → Build agentic workflows with human-in-the-loop

Priority 2 (This Quarter): RAG & Vector DBs
  → ChromaDB, pgvector in production
  → Embedding model selection + evaluation
  → Advanced retrieval (reranking, hybrid)

Priority 3 (This Quarter): Workflow Automation
  → n8n for non-technical users
  → Step Functions for AWS-native workflows
  → Playwright for data collection

Priority 4 (Next Quarter): MCP + Advanced Agents
  → Build MCP servers for internal tools
  → Multi-agent systems for complex workflows
```

---

## Learning Resources (Ranked by Quality)

```
Documentation (best):
  https://python.langchain.com/docs/
  https://langchain-ai.github.io/langgraph/
  https://modelcontextprotocol.io/
  https://docs.anthropic.com/
  https://platform.openai.com/docs/

Courses:
  DeepLearning.AI — LangChain for LLM App Development (free)
  DeepLearning.AI — Building Agentic RAG with LlamaIndex (free)
  DeepLearning.AI — Multi AI Agent Systems (free)
  Fast.ai — Practical Deep Learning (free)

GitHub repos to study:
  langchain-ai/langchain
  langchain-ai/langgraph
  modelcontextprotocol/servers (official MCP examples)
  run-llama/llama_index

YouTube:
  Sam Witteveen — LangChain/LangGraph deep dives
  AI Explained — research paper breakdowns
  Andrej Karpathy — fundamentals (makemore, nanoGPT)
```

---

## 6-Month AI Developer Plan

```
Month 1: APIs + Prompt Engineering
  Week 1-2: OpenAI + Anthropic API, chat completions, streaming
  Week 3-4: Prompt engineering (all patterns), structured output

Month 2: RAG Foundations
  Week 5-6: Embeddings + ChromaDB basic RAG
  Week 7-8: Advanced chunking, retrieval, RAGAS evaluation

Month 3: LangChain + LangGraph
  Week 9-10: LCEL chains, RAG chains, memory
  Week 11-12: LangGraph agents, tools, human-in-the-loop

Month 4: Production + MCP
  Week 13-14: MCP servers, n8n workflows
  Week 15-16: Cost optimization, monitoring, LangSmith

Month 5: Advanced Topics
  Week 17-18: Fine-tuning (LoRA) + custom embeddings
  Week 19-20: Multi-agent systems, advanced RAG patterns

Month 6: Portfolio + Specialization
  Week 21-22: Build a production AI app (deploy it)
  Week 23-24: AI security, evals, contribute to open source
```

---

## Interview Readiness Checklist

```
Can you explain:
  □ How a transformer works (attention is all you need — conceptually)
  □ Why RAG beats fine-tuning for most use cases
  □ How you'd build a multi-tenant RAG system
  □ The difference between LangChain and LangGraph
  □ What MCP is and why it exists
  □ How you'd evaluate an AI system in production
  □ Three ways to reduce LLM API costs
  □ How to prevent prompt injection in a production app
  □ When to use streaming vs batch
  □ How to handle an agent that loops infinitely

Can you build:
  □ A RAG chat API (FastAPI + LangChain + ChromaDB)
  □ A LangGraph agent with tool calling
  □ An n8n workflow with AI nodes
  □ An MCP server with custom tools
  □ An eval pipeline with RAGAS
```
