# LangChain & LangGraph — Advanced Patterns

## Advanced LCEL Patterns

### Parallel Execution with RunnableParallel

```python
from langchain_core.runnables import RunnableParallel, RunnablePassthrough, RunnableLambda
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o-mini")

# Run multiple chains simultaneously and combine results
analysis_chain = RunnableParallel({
    "sentiment": (
        RunnablePassthrough()
        | (lambda x: f"Analyze sentiment (positive/negative/neutral): {x['text']}")
        | llm
    ),
    "summary": (
        RunnablePassthrough()
        | (lambda x: f"Summarize in one sentence: {x['text']}")
        | llm
    ),
    "keywords": (
        RunnablePassthrough()
        | (lambda x: f"Extract top 5 keywords: {x['text']}")
        | llm
    ),
    "original_text": RunnablePassthrough() | (lambda x: x["text"]),
})

result = analysis_chain.invoke({"text": "The product launch was spectacular..."})
# All three LLM calls run concurrently → 3x faster than sequential
```

### Dynamic Routing

```python
from langchain_core.runnables import RunnableBranch
from langchain_core.output_parsers import StrOutputParser

# Route to different chains based on content
def classify_query(query: str) -> str:
    prompt = f"Classify as 'technical', 'billing', or 'general': {query}"
    return llm.invoke(prompt).content.strip().lower()

technical_chain = (
    ChatPromptTemplate.from_template("You are a senior engineer. Answer: {query}")
    | llm | StrOutputParser()
)
billing_chain = (
    ChatPromptTemplate.from_template("You are a billing specialist. Answer: {query}")
    | llm | StrOutputParser()
)
general_chain = (
    ChatPromptTemplate.from_template("You are a helpful assistant. Answer: {query}")
    | llm | StrOutputParser()
)

router = RunnableBranch(
    (lambda x: "technical" in x["category"], technical_chain),
    (lambda x: "billing" in x["category"], billing_chain),
    general_chain,  # default
)

full_chain = (
    RunnablePassthrough.assign(category=lambda x: classify_query(x["query"]))
    | router
)

result = full_chain.invoke({"query": "My API rate limit keeps hitting 429 errors"})
# → Routes to technical_chain
```

### Callbacks & Streaming Events

```python
from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.outputs import LLMResult

# Custom callback for logging/monitoring
class ProductionCallbackHandler(BaseCallbackHandler):
    def on_llm_start(self, serialized, prompts, **kwargs):
        print(f"LLM call started. Prompt tokens: ~{len(prompts[0].split())}")

    def on_llm_end(self, response: LLMResult, **kwargs):
        usage = response.llm_output.get("token_usage", {})
        print(f"Tokens used: {usage}")

    def on_llm_error(self, error: Exception, **kwargs):
        # Alert: send to Sentry/Datadog
        capture_exception(error)

    def on_chain_start(self, serialized, inputs, **kwargs):
        print(f"Chain {serialized['name']} started")

    def on_tool_start(self, serialized, input_str, **kwargs):
        print(f"Tool {serialized['name']} called with: {input_str[:100]}")

# Use in chain
chain = prompt | ChatOpenAI(
    callbacks=[ProductionCallbackHandler()],
    streaming=True
)

# Streaming with astream_events (most granular)
async def stream_with_events(query: str):
    async for event in chain.astream_events(
        {"question": query},
        version="v2"
    ):
        if event["event"] == "on_chat_model_stream":
            chunk = event["data"]["chunk"].content
            if chunk:
                yield chunk  # Send to frontend via SSE
        elif event["event"] == "on_retriever_end":
            docs = event["data"]["output"]
            print(f"Retrieved {len(docs)} docs")  # Log for monitoring
```

---

## Advanced LangGraph Patterns

### Streaming from LangGraph

```python
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode, tools_condition
from typing import TypedDict, Annotated
import operator

class AgentState(TypedDict):
    messages: Annotated[list, operator.add]

graph = StateGraph(AgentState)
# ... (add nodes) ...
app = graph.compile()

# Stream tokens as they generate
async def stream_agent(user_message: str):
    async for event in app.astream_events(
        {"messages": [{"role": "user", "content": user_message}]},
        version="v2"
    ):
        kind = event["event"]
        if kind == "on_chat_model_stream":
            content = event["data"]["chunk"].content
            if content:
                yield f"data: {content}\n\n"  # SSE format
        elif kind == "on_tool_start":
            tool_name = event["name"]
            yield f"data: [tool:{tool_name}]\n\n"

# FastAPI SSE endpoint
from fastapi import FastAPI
from fastapi.responses import StreamingResponse

app_http = FastAPI()

@app_http.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    return StreamingResponse(
        stream_agent(request.message),
        media_type="text/event-stream"
    )
```

### Persistent State with Checkpointers

```python
from langgraph.checkpoint.postgres import PostgresSaver
from psycopg_pool import ConnectionPool

# Production: PostgreSQL checkpointer
pool = ConnectionPool(conninfo=DATABASE_URL)
checkpointer = PostgresSaver(pool)
checkpointer.setup()  # Creates tables if needed

app = graph.compile(checkpointer=checkpointer)

# Multi-turn conversation — same thread_id resumes same conversation
config = {"configurable": {"thread_id": "user_123_session_456"}}

# Turn 1
result1 = await app.ainvoke(
    {"messages": [{"role": "user", "content": "My name is Alice"}]},
    config=config
)

# Turn 2 — agent remembers previous messages
result2 = await app.ainvoke(
    {"messages": [{"role": "user", "content": "What's my name?"}]},
    config=config
)
# → "Your name is Alice" (retrieved from checkpoint)

# View history
history = list(app.get_state_history(config))
print(f"Turns so far: {len(history)}")

# Replay from a specific checkpoint
app.update_state(
    config={"configurable": {"thread_id": "...", "checkpoint_id": history[2].config["configurable"]["checkpoint_id"]}},
    values={"messages": [{"role": "user", "content": "Actually ignore my last message"}]}
)
```

### Human-in-the-Loop Advanced Patterns

```python
from langgraph.graph import StateGraph
from langgraph.checkpoint.memory import MemorySaver
from typing import TypedDict, Annotated
import operator

class WorkflowState(TypedDict):
    messages: Annotated[list, operator.add]
    pending_action: dict | None
    approved: bool

# Pattern: Pause before ANY tool call, review, then continue
def route_after_agent(state: WorkflowState):
    last_msg = state["messages"][-1]
    if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
        action = last_msg.tool_calls[0]
        # Is this a sensitive action?
        if action["name"] in {"send_email", "delete_record", "charge_card"}:
            return "human_review"
    return "tools"

# Graph pauses at human_review node
app = workflow.compile(
    checkpointer=MemorySaver(),
    interrupt_before=["human_review"],
)

# In your API:
async def run_with_approval(user_input: str, thread_id: str):
    config = {"configurable": {"thread_id": thread_id}}

    # Run until pause
    async for event in app.astream(
        {"messages": [{"role": "user", "content": user_input}]},
        config=config
    ):
        pass  # Process events

    # Check if paused for review
    state = app.get_state(config)
    if state.next == ("human_review",):
        pending = state.values["messages"][-1].tool_calls[0]
        return {"status": "pending_approval", "action": pending}

    return {"status": "complete", "result": state.values["messages"][-1].content}

# User approves
async def approve_action(thread_id: str, approved: bool):
    config = {"configurable": {"thread_id": thread_id}}
    app.update_state(config, {"approved": approved})
    # Resume from where it paused
    async for event in app.astream(None, config=config):
        pass
```

### Multi-Agent Supervisor Pattern (Advanced)

```python
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from langgraph.graph import StateGraph, END
from langchain_core.messages import HumanMessage, SystemMessage
from typing import TypedDict, Annotated, Literal
import operator

# Specialized agents
research_agent = create_react_agent(
    ChatOpenAI(model="gpt-4o-mini"),
    tools=[web_search, read_url, arxiv_search]
)
code_agent = create_react_agent(
    ChatOpenAI(model="gpt-4o"),
    tools=[run_python, write_file, read_file, run_tests]
)
writer_agent = create_react_agent(
    ChatOpenAI(model="gpt-4o"),
    tools=[read_file, create_document, format_markdown]
)

AGENTS = {
    "researcher": research_agent,
    "coder": code_agent,
    "writer": writer_agent,
    "FINISH": None,
}

class SupervisorState(TypedDict):
    messages: Annotated[list, operator.add]
    next_agent: str

def supervisor_node(state: SupervisorState):
    """Supervisor decides which agent to call next."""
    supervisor_prompt = ChatPromptTemplate.from_messages([
        SystemMessage("""You coordinate a team of agents:
        - researcher: web search, reading, data gathering
        - coder: Python code, tests, file operations
        - writer: documents, markdown, reports
        Respond with ONLY one of: researcher, coder, writer, FINISH"""),
        MessagesPlaceholder("messages"),
        HumanMessage("Who should act next?")
    ])

    response = ChatOpenAI(model="gpt-4o-mini")(supervisor_prompt.format(
        messages=state["messages"]
    ))
    next_agent = response.content.strip()
    return {"next_agent": next_agent}

def agent_node(agent_name: str):
    def run_agent(state: SupervisorState):
        agent = AGENTS[agent_name]
        result = agent.invoke({"messages": state["messages"]})
        return {"messages": result["messages"][-1:]}
    return run_agent

# Build graph
workflow = StateGraph(SupervisorState)
workflow.add_node("supervisor", supervisor_node)
for name in ["researcher", "coder", "writer"]:
    workflow.add_node(name, agent_node(name))

# Supervisor always routes to next agent
workflow.add_conditional_edges(
    "supervisor",
    lambda s: s["next_agent"],
    {**{name: name for name in ["researcher", "coder", "writer"]}, "FINISH": END}
)

# Each agent reports back to supervisor
for name in ["researcher", "coder", "writer"]:
    workflow.add_edge(name, "supervisor")

workflow.set_entry_point("supervisor")
app = workflow.compile(checkpointer=MemorySaver())
```

### LangGraph with Subgraphs

```python
# Break complex workflows into composable subgraphs
# Each subgraph is independently testable

# Subgraph: RAG pipeline
rag_subgraph = StateGraph(RagState)
rag_subgraph.add_node("retrieve", retrieve_node)
rag_subgraph.add_node("grade", grade_docs_node)
rag_subgraph.add_node("generate", generate_node)
rag_subgraph.add_edge("retrieve", "grade")
rag_subgraph.add_conditional_edges("grade", route_grade)
rag_compiled = rag_subgraph.compile()

# Main graph uses the subgraph as a single node
main_graph = StateGraph(MainState)
main_graph.add_node("classify", classify_node)
main_graph.add_node("rag", rag_compiled)  # Entire subgraph as one node
main_graph.add_node("direct_answer", direct_answer_node)

main_graph.add_conditional_edges(
    "classify",
    lambda s: "rag" if s["needs_retrieval"] else "direct_answer"
)
```

---

## LangChain Memory Deep Dive

```python
# Memory type 1: ConversationBufferWindowMemory — keep last N turns
from langchain.memory import ConversationBufferWindowMemory

memory = ConversationBufferWindowMemory(k=5, return_messages=True)
# Only keeps last 5 human+AI turns. Prevents unbounded growth.

# Memory type 2: ConversationSummaryMemory — summarize old messages
from langchain.memory import ConversationSummaryMemory

memory = ConversationSummaryMemory(
    llm=ChatOpenAI(model="gpt-4o-mini"),
    return_messages=True
)
# Old messages are summarized into a single context message
# Older than last N turns → becomes: "So far: user asked about X, we resolved Y"

# Memory type 3: EntityMemory — track entities explicitly
from langchain.memory import ConversationEntityMemory

memory = ConversationEntityMemory(llm=llm)
# Tracks: "Alice is a customer who bought product X last Tuesday"
# Can answer: "What did Alice buy?" even many turns later

# Production memory: LangGraph + PostgresStore
from langgraph.store.postgres import PostgresStore

store = PostgresStore.from_conn_string(DATABASE_URL)

async def save_user_fact(user_id: str, fact: str):
    await store.aput(
        namespace=("users", user_id, "facts"),
        key=f"fact_{timestamp()}",
        value={"fact": fact, "created_at": datetime.now().isoformat()}
    )

async def get_user_context(user_id: str, query: str) -> list[dict]:
    # Semantic search over user's stored facts
    memories = await store.asearch(
        namespace=("users", user_id, "facts"),
        query=query,
        limit=5
    )
    return [m.value for m in memories]
```

---

## Debugging LangChain & LangGraph

```python
# 1. LangSmith tracing (best for production debugging)
import os
os.environ["LANGCHAIN_TRACING_V2"] = "true"
os.environ["LANGCHAIN_API_KEY"] = "ls__..."
os.environ["LANGCHAIN_PROJECT"] = "my-project"
# Now all chains/agents automatically traced at smith.langchain.com

# 2. Verbose logging (development)
chain = prompt | ChatOpenAI(verbose=True) | StrOutputParser()
# Prints full prompts and responses to console

# 3. Print intermediate values
from langchain_core.runnables import RunnableLambda

def debug_print(x):
    print(f"\n--- DEBUG ---\n{x}\n---\n")
    return x

chain = (
    prompt
    | RunnableLambda(debug_print)  # Inspect at this point
    | llm
    | RunnableLambda(debug_print)  # Inspect output
    | StrOutputParser()
)

# 4. Graph visualization (LangGraph)
from IPython.display import Image
Image(app.get_graph().draw_mermaid_png())

# 5. State inspection mid-run (LangGraph)
async def debug_agent(user_message: str):
    config = {"configurable": {"thread_id": "debug_session"}}
    async for event in app.astream(
        {"messages": [{"role": "user", "content": user_message}]},
        config=config
    ):
        for node_name, state_update in event.items():
            if node_name != "__end__":
                print(f"\n[{node_name}] State: {state_update}")

    # Final state
    final_state = app.get_state(config)
    print(f"\nFinal messages: {len(final_state.values['messages'])}")
```

---

## Performance Optimization

```python
# 1. Batch LLM calls
texts = ["Summary 1...", "Summary 2...", "Summary 3..."]
results = await llm.abatch([
    [{"role": "user", "content": f"Summarize: {t}"}]
    for t in texts
])
# 10x faster than sequential .invoke() calls

# 2. Cache LLM responses (same input → same output)
from langchain.cache import SQLiteCache
from langchain.globals import set_llm_cache

set_llm_cache(SQLiteCache(database_path=".langchain.db"))
# First call: sends to API (slow)
# Second call with same input: returns from cache instantly (free)

# 3. In-memory semantic cache (similar prompts share cached response)
from langchain_community.cache import GPTCache

set_llm_cache(GPTCache(init_func=init_gptcache))
# "What's the weather?" and "Can you tell me the weather?" → same cached response

# 4. Async throughout
async def process_documents_fast(docs: list[str]) -> list[str]:
    # Instead of sequential processing:
    # result = [await summarize(doc) for doc in docs]  # slow

    # Parallel processing with concurrency limit:
    semaphore = asyncio.Semaphore(5)  # Max 5 concurrent API calls
    async def limited_summarize(doc):
        async with semaphore:
            return await chain.ainvoke({"text": doc})

    return await asyncio.gather(*[limited_summarize(doc) for doc in docs])

# 5. Streaming to reduce perceived latency
# Without streaming: user waits 3s then gets full response
# With streaming: user sees first token in 200ms, response appears as it generates
async def stream_response(query: str):
    async for chunk in chain.astream({"question": query}):
        yield chunk  # Send each token as it arrives
```
