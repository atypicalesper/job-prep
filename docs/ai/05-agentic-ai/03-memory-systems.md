# Agent Memory Systems

Memory is what separates a stateless chatbot from an intelligent agent. Without memory, every conversation starts from zero. With the right memory architecture, agents learn, adapt, and maintain context across sessions.

---

## The Four Types of Memory

| Type | What it stores | Duration | Analogy |
|---|---|---|---|
| **Sensory / In-context** | Current conversation messages | One session | Working memory |
| **Episodic** | Past conversation summaries | Long-term | Diary |
| **Semantic** | Facts, preferences, knowledge | Long-term | Knowledge base |
| **Procedural** | How to do things (system prompt) | Persistent | Muscle memory |

---

## 1. In-Context Memory (Conversation Buffer)

The simplest form — keep the raw message history in the context window.

```python
from langchain_openai import ChatOpenAI
from langchain.memory import ConversationBufferMemory
from langchain.chains import ConversationChain

llm = ChatOpenAI(model="gpt-4o-mini")
memory = ConversationBufferMemory(return_messages=True)
chain = ConversationChain(llm=llm, memory=memory, verbose=False)

chain.predict(input="My name is Tarun and I work with RAG systems.")
chain.predict(input="What's my name?")  # Remembers: "Your name is Tarun."
```

**Problem:** Context window fills up quickly. A 128K window holds ~90K tokens — fine for a session, but not for multi-session persistence.

---

## 2. Conversation Buffer Window Memory

Only keep the last N turns — older messages are dropped.

```python
from langchain.memory import ConversationBufferWindowMemory

memory = ConversationBufferWindowMemory(k=10, return_messages=True)  # last 10 turns
```

**Use when:** The conversation is ephemeral and you only need recent context (e.g., a support chat).

---

## 3. Summary Memory — Summarize Old Turns

When the buffer gets long, summarize older turns into a condensed memory block.

```python
from langchain.memory import ConversationSummaryBufferMemory

memory = ConversationSummaryBufferMemory(
    llm=ChatOpenAI(model="gpt-4o-mini"),
    max_token_limit=500,        # summarize when buffer exceeds 500 tokens
    return_messages=True,
)

# Older turns get compressed: "User said they're building a RAG system with Chroma..."
# Recent turns remain verbatim
```

---

## 4. Vector Store Memory — Semantic Long-Term Memory

Store all memories as embeddings. At each turn, retrieve the most relevant past memories.

```python
from langchain.memory import VectorStoreRetrieverMemory
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings

vectorstore = Chroma(embedding_function=OpenAIEmbeddings(), collection_name="agent_memory")

memory = VectorStoreRetrieverMemory(
    retriever=vectorstore.as_retriever(search_kwargs={"k": 4}),
)

# Saves each turn as a vector
memory.save_context(
    {"input": "I prefer concise code with type hints"},
    {"output": "Noted."},
)

# Retrieves semantically relevant memories at each turn
memory.load_memory_variables({"prompt": "Write me a Python function"})
# Returns: "User prefers concise code with type hints"
```

---

## 5. Entity Memory — Track Named Entities

Track specific entities (people, projects, concepts) mentioned in conversation.

```python
from langchain.memory import ConversationEntityMemory

memory = ConversationEntityMemory(llm=ChatOpenAI(model="gpt-4o-mini"))

memory.save_context(
    {"input": "I'm working on a project called Helios using LangGraph."},
    {"output": "Tell me more about Helios."}
)

# Internal entity store:
# { "Helios": "A project by the user, uses LangGraph" }
print(memory.entity_store.store)
```

---

## 6. mem0 — Production Memory Layer

[mem0](https://mem0.ai) is a managed memory layer that handles extraction, deduplication, and retrieval across sessions automatically.

```python
from mem0 import MemoryClient

client = MemoryClient(api_key="your-mem0-api-key")

# Add memory (auto-extracts entities and preferences)
client.add(
    messages=[
        {"role": "user", "content": "I'm building a RAG app with FastAPI and prefer async code."},
        {"role": "assistant", "content": "I'll keep that in mind."},
    ],
    user_id="tarun",
)

# Retrieve relevant memories for a new query
memories = client.search("Write a FastAPI endpoint", user_id="tarun")
# Returns: ["User prefers async code", "User is building a RAG app with FastAPI"]

# Build the system prompt with injected memories
memory_context = "\n".join(f"- {m['memory']}" for m in memories)
system = f"You are a helpful assistant. Here's what you know about the user:\n{memory_context}"
```

**Self-hosted mem0 with Qdrant:**
```python
from mem0 import Memory

config = {
    "vector_store": {
        "provider": "qdrant",
        "config": {"host": "localhost", "port": 6333},
    },
    "llm": {"provider": "openai", "config": {"model": "gpt-4o-mini"}},
    "embedder": {"provider": "openai", "config": {"model": "text-embedding-3-small"}},
}
memory = Memory.from_config(config)
memory.add("I prefer Python over JavaScript", user_id="tarun")
```

---

## 7. Zep — Conversation History with Auto-Summary

[Zep](https://www.getzep.com) provides persistent conversation storage with automatic summarization and entity extraction.

```python
from zep_cloud.client import Zep
from zep_cloud import Message

zep = Zep(api_key="your-zep-api-key")

# Add a session
session_id = "session-001"
zep.memory.add_session(session_id=session_id, user_id="tarun")

# Add messages
zep.memory.add(session_id, messages=[
    Message(role_type="user", content="What's the difference between RAG and fine-tuning?"),
    Message(role_type="assistant", content="RAG retrieves context at inference time; fine-tuning bakes knowledge into weights."),
])

# Retrieve memory (includes summary of older turns)
memory = zep.memory.get(session_id)
print(memory.summary.content)    # auto-generated summary of the conversation
print(memory.context)            # formatted context string for injection into prompt
```

---

## 8. Memory Architecture Patterns

### Multi-tier Memory (recommended for production agents)

```python
class AgentMemory:
    def __init__(self, user_id: str):
        self.user_id = user_id
        self.short_term: list[dict] = []          # last N turns (in-context)
        self.semantic_memory = vectorstore         # long-term facts
        self.episodic_memory = episodic_store      # past conversation summaries

    def add_turn(self, role: str, content: str):
        self.short_term.append({"role": role, "content": content})
        if len(self.short_term) > 20:             # summarize old turns
            self._compress_to_episodic()

    def _compress_to_episodic(self):
        old_turns = self.short_term[:10]
        summary = summarize_with_llm(old_turns)
        self.episodic_memory.add_texts([summary], metadatas=[{"user_id": self.user_id}])
        self.short_term = self.short_term[10:]

    def get_context(self, current_query: str) -> str:
        # Retrieve relevant episodic memories
        past = self.episodic_memory.similarity_search(current_query, k=3)
        past_text = "\n".join(d.page_content for d in past)

        # Combine: episodic context + recent turns
        return f"Relevant past context:\n{past_text}\n\nRecent conversation:\n{self._format_short_term()}"
```

---

## Memory and Privacy

- **PII stripping**: Before storing to long-term memory, strip names, emails, phone numbers (use `presidio-analyzer`)
- **TTL**: Set expiry on user memories (e.g., 90 days)
- **User opt-out**: Always support `DELETE /memory?user_id=X`
- **Encryption at rest**: Encrypt vector store metadata fields

---

## Interview Q&A

**Q: What's the difference between RAG and memory in agents?**

RAG retrieves knowledge about the *world* (documents, code, knowledge bases). Memory retrieves knowledge about the *user and conversation history* — their preferences, past questions, identity. In practice, a production agent uses both: RAG for domain knowledge, memory for personalization and continuity.

**Q: How do you prevent an agent's memory from becoming stale or incorrect?**

1. **Versioning** — tag memories with timestamp, prefer recent over old when conflicting
2. **Contradiction detection** — before storing a new memory, check if it contradicts an existing one; if so, update or flag it
3. **Explicit forgetting** — expose a `/forget` command so the user can delete memories
4. **Confidence scores** — down-weight memories extracted from low-confidence LLM outputs

---

## Links to Refer

- [mem0 Documentation](https://docs.mem0.ai/)
- [Zep Documentation](https://help.getzep.com/)
- [LangChain Memory Types](https://python.langchain.com/docs/modules/memory/)
- [MemGPT Paper](https://arxiv.org/abs/2310.08560) — paging memories in/out of context
