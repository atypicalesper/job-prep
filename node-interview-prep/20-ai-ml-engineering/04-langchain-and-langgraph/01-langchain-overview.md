# LangChain & LangGraph

## LangChain Overview

LangChain is a framework for building LLM-powered applications. It provides abstractions for common patterns: chains, prompts, retrieval, memory, tools, and agents.

```
LangChain Components:
├── Models          (chat models, embeddings)
├── Prompts         (templates, few-shot, output parsers)
├── Chains          (sequences of LLM + processing steps)
├── Retrievers      (vector stores, hybrid search)
├── Memory          (conversation history management)
├── Tools           (functions the agent can call)
├── Agents          (LLM decides what tools to call)
├── Callbacks       (logging, tracing, streaming)
└── LCEL            (LangChain Expression Language — pipe operator)
```

---

## LCEL — LangChain Expression Language

LCEL uses the `|` pipe operator to compose components declaratively.

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# Build a chain
prompt = ChatPromptTemplate.from_template("Summarize: {text}")
model = ChatOpenAI(model="gpt-4o-mini")
parser = StrOutputParser()

chain = prompt | model | parser

# Invoke
result = chain.invoke({"text": "Long document..."})

# Async
result = await chain.ainvoke({"text": "..."})

# Stream
async for chunk in chain.astream({"text": "..."}):
    print(chunk, end="", flush=True)

# Batch
results = chain.batch([{"text": "doc1"}, {"text": "doc2"}])
```

---

## RAG Chain

```python
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_chroma import Chroma
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableParallel, RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser

# Setup
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
vectorstore = Chroma(persist_directory="./db", embedding_function=embeddings)
retriever = vectorstore.as_retriever(search_kwargs={"k": 5})

# Prompt
prompt = ChatPromptTemplate.from_template("""
Answer based only on the following context:
{context}

Question: {question}
If not in context, say "I don't know."
""")

# Format retrieved docs
def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)

# Chain with parallel retrieval + passthrough
rag_chain = (
    RunnableParallel({"context": retriever | format_docs, "question": RunnablePassthrough()})
    | prompt
    | ChatOpenAI(model="gpt-4o-mini")
    | StrOutputParser()
)

answer = rag_chain.invoke("What is the return policy?")
```

---

## Memory in LangChain

```python
from langchain.memory import ConversationBufferMemory, ConversationSummaryMemory
from langchain_core.messages import HumanMessage, AIMessage

# Option 1: Buffer Memory (keep all messages — gets expensive)
memory = ConversationBufferMemory(return_messages=True)

# Option 2: Summary Memory (LLM summarizes old messages)
memory = ConversationSummaryMemory(llm=ChatOpenAI(), return_messages=True)

# Option 3: Buffer Window (keep last k messages)
from langchain.memory import ConversationBufferWindowMemory
memory = ConversationBufferWindowMemory(k=5, return_messages=True)

# Option 4: Modern approach — manage history explicitly
from langchain_core.chat_history import BaseChatMessageHistory
from langchain_community.chat_message_histories import RedisChatMessageHistory

def get_session_history(session_id: str) -> BaseChatMessageHistory:
    return RedisChatMessageHistory(session_id, url="redis://localhost:6379")

from langchain_core.runnables.history import RunnableWithMessageHistory

chain_with_history = RunnableWithMessageHistory(
    chain,
    get_session_history,
    input_messages_key="question",
    history_messages_key="history",
)

# Invoke with session
result = chain_with_history.invoke(
    {"question": "What did we talk about earlier?"},
    config={"configurable": {"session_id": "user_123"}}
)
```

---

## Tools and Tool Calling

Tools are functions the LLM can call to interact with the world.

```python
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI

@tool
def get_weather(city: str) -> str:
    """Get current weather for a city."""
    # Real implementation calls a weather API
    return f"Weather in {city}: 72°F, sunny"

@tool
def search_database(query: str, limit: int = 5) -> list[dict]:
    """Search the product database for items matching the query."""
    return db.search(query, limit=limit)

# Bind tools to model
model = ChatOpenAI(model="gpt-4o-mini")
model_with_tools = model.bind_tools([get_weather, search_database])

# Model decides when to call tools
response = model_with_tools.invoke("What's the weather in Tokyo?")
# response.tool_calls = [{"name": "get_weather", "args": {"city": "Tokyo"}}]

# Execute tool calls
for tool_call in response.tool_calls:
    tool_result = globals()[tool_call["name"]](**tool_call["args"])
```

---

## LangGraph — Stateful Workflows

LangGraph extends LangChain with **stateful graph-based workflows**. Instead of simple chains, you define a graph of nodes (processing steps) and edges (transitions).

### Why LangGraph?

```
Chain: A → B → C (fixed, linear)

Graph:
  A → B → C
       ↓
       D (conditional)
       ↓
  B ← (loop back)

Real use cases:
- Agents that retry on error
- Workflows that branch based on LLM decisions
- Multi-step reasoning with validation
- Human-in-the-loop approval flows
```

### Basic LangGraph Agent

```python
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from langchain_openai import ChatOpenAI
from typing import TypedDict, Annotated
from langchain_core.messages import BaseMessage
import operator

# 1. Define state
class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], operator.add]
    # operator.add means: append new messages to list (not replace)

# 2. Define nodes
model = ChatOpenAI(model="gpt-4o-mini").bind_tools([get_weather, search_database])

def agent_node(state: AgentState) -> AgentState:
    """Call the LLM."""
    response = model.invoke(state["messages"])
    return {"messages": [response]}

tool_node = ToolNode([get_weather, search_database])

# 3. Define routing logic
def should_continue(state: AgentState) -> str:
    last_message = state["messages"][-1]
    if last_message.tool_calls:
        return "tools"   # → execute tool
    return END            # → done

# 4. Build graph
workflow = StateGraph(AgentState)
workflow.add_node("agent", agent_node)
workflow.add_node("tools", tool_node)

workflow.set_entry_point("agent")
workflow.add_conditional_edges("agent", should_continue)
workflow.add_edge("tools", "agent")  # After tools → back to agent

app = workflow.compile()

# 5. Run
result = app.invoke({
    "messages": [HumanMessage(content="What's the weather in Tokyo and London?")]
})
```

### Human-in-the-Loop with LangGraph

```python
from langgraph.checkpoint.memory import MemorySaver

# Add checkpointing for pause/resume
checkpointer = MemorySaver()
app = workflow.compile(checkpointer=checkpointer, interrupt_before=["tools"])

config = {"configurable": {"thread_id": "session_1"}}

# Run until interrupt
result = app.invoke(input, config=config)
# Paused at "tools" node — waiting for human approval

# Human reviews: result["messages"][-1].tool_calls
# If approved:
app.invoke(None, config=config)  # Resume from where it stopped
```

### LangGraph vs Simple Chains

| Use Case | Use Chain | Use LangGraph |
|----------|-----------|--------------|
| Single LLM call | ✓ | |
| RAG pipeline | ✓ | |
| Linear multi-step | ✓ | |
| Conditional branching | | ✓ |
| Loop until condition | | ✓ |
| Parallel execution | | ✓ |
| Human approval needed | | ✓ |
| Multi-agent coordination | | ✓ |
| Long-running state | | ✓ |

---

## LangSmith — Observability

```python
import os
os.environ["LANGCHAIN_TRACING_V2"] = "true"
os.environ["LANGCHAIN_API_KEY"] = "..."
os.environ["LANGCHAIN_PROJECT"] = "my-project"

# All LangChain calls are now traced automatically
# View at: smith.langchain.com
# See: prompts sent, tokens used, latency, errors, evals
```

LangSmith is essential for:
- Debugging why a chain failed
- Comparing prompt versions
- Cost tracking per chain
- Running automated evals on datasets
