# Advanced Interview Questions — LangGraph & Multi-Agent

### Q1: What is the difference between a checkpointer and a store in LangGraph? When do you use each?

**Answer:**

```
Checkpointer:
  - Saves the full graph state at every step (per thread)
  - Scoped to a single thread (conversation)
  - Enables: pause/resume, time-travel, multi-turn memory
  - Backends: MemorySaver (dev), PostgresSaver, RedisSaver
  - Automatically used — compile(checkpointer=...) is enough

Store:
  - Long-term key/value memory, shared across threads
  - Scoped to namespaces you define, not threads
  - Enables: user preferences across sessions, cross-agent knowledge sharing,
             semantic search over past facts
  - Backends: InMemoryStore (dev), PostgresStore
  - Must be explicitly read/written by nodes

Rule of thumb:
  "What did this agent do in this conversation?" → checkpointer
  "What do I know about this user across all conversations?" → store
```

```python
# Together in production:
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.store.postgres import PostgresStore

checkpointer = PostgresSaver.from_conn_string(DB_URL)
store = PostgresStore.from_conn_string(DB_URL)

app = graph.compile(checkpointer=checkpointer, store=store)

# Node accesses store via injected dependency
def personalize(state, *, store: BaseStore):
    memories = store.search(("users", state["user_id"]), query=state["query"])
    ...
```

---

### Q2: How does `operator.add` as a reducer work under the hood? What happens when two parallel branches both write to the same field?

**Answer:**

```python
# operator.add is called with (existing_value, new_value)
# For lists: existing + new = concatenated list

class State(TypedDict):
    results: Annotated[list, operator.add]

# Scenario: two parallel nodes both return {"results": [...]}

# Node A returns: {"results": ["result_a"]}
# Node B returns: {"results": ["result_b"]}

# LangGraph collects both partial updates, then reduces:
# operator.add(operator.add([], ["result_a"]), ["result_b"])
# = ["result_a", "result_b"]

# ORDER IS NOT GUARANTEED in parallel branches
# If order matters, include a sort key in the values

class State(TypedDict):
    results: Annotated[list, operator.add]

# Node A:
return {"results": [{"data": "A", "order": 1}]}
# Node B:
return {"results": [{"data": "B", "order": 2}]}

# Then sort in the aggregation node:
def aggregate(state):
    sorted_results = sorted(state["results"], key=lambda x: x["order"])
```

---

### Q3: Your LangGraph agent works fine in development but loses state between requests in production. What's likely wrong?

**Answer:**

```
Root cause: MemorySaver stores state in Python process memory.
When you deploy behind a load balancer with multiple instances,
requests for the same thread_id land on different processes.
Each process has its own MemorySaver — state doesn't cross instances.

Fix: use an external checkpointer.
```

```python
# Development (in-process, single instance):
from langgraph.checkpoint.memory import MemorySaver
app = graph.compile(checkpointer=MemorySaver())

# Production (shared across all instances):
from langgraph.checkpoint.postgres import PostgresSaver
from psycopg_pool import ConnectionPool

pool = ConnectionPool(conninfo=os.environ["DATABASE_URL"], min_size=2, max_size=10)
checkpointer = PostgresSaver(pool)
checkpointer.setup()   # One-time: creates langgraph_checkpoints table

app = graph.compile(checkpointer=checkpointer)

# Same thread_id will load the same state from Postgres
# regardless of which instance handles the request
```

---

### Q4: Describe the Send API and give a scenario where it's the right tool.

**Answer:**

`Send` is a way to dynamically spawn parallel nodes at runtime — you return a list of `Send` objects from a conditional edge, each targeting the same node with different inputs.

```
When to use Send:
  - Number of parallel branches is determined by data, not graph structure
  - Classic map-reduce: process N items, then aggregate
  - Fan-out where N varies per run (10 docs one time, 50 the next)

Without Send: you'd need to either:
  a) Pre-define N parallel nodes in the graph (can't do this for variable N)
  b) Process sequentially in a loop (slow)

With Send: LangGraph creates N temporary branches, all run in parallel,
results accumulate via reducer, aggregation node fires when all complete.
```

```python
# Scenario: evaluate a candidate's code submission across 5 criteria in parallel

class ReviewState(TypedDict):
    code: str
    scores: Annotated[list[dict], operator.add]
    final_verdict: str

CRITERIA = ["correctness", "efficiency", "readability", "edge_cases", "tests"]

def fan_out_review(state: ReviewState):
    return [
        Send("evaluate_criterion", {"code": state["code"], "criterion": c})
        for c in CRITERIA
    ]

def evaluate_criterion(state: dict) -> ReviewState:
    score = llm.invoke(f"Score this code for {state['criterion']} (0-10):\n{state['code']}").content
    return {"scores": [{"criterion": state["criterion"], "score": score}]}

def final_verdict(state: ReviewState) -> ReviewState:
    summary = "\n".join(f"{s['criterion']}: {s['score']}" for s in state["scores"])
    verdict = llm.invoke(f"Give a final hiring recommendation:\n{summary}").content
    return {"final_verdict": verdict}
# All 5 criteria evaluated simultaneously → 5x faster than sequential
```

---

### Q5: How would you implement a reflection pattern in LangGraph — where an agent reviews its own output and improves it?

**Answer:**

```python
from langgraph.graph import StateGraph, END
from typing import TypedDict, Annotated
import operator

class ReflectionState(TypedDict):
    task: str
    draft: str
    critique: str
    revision: str
    iterations: int
    final: str

MAX_ITERATIONS = 3

def generate_draft(state: ReflectionState) -> ReflectionState:
    draft = llm.invoke(f"Complete this task:\n{state['task']}").content
    return {"draft": draft}

def critique_draft(state: ReflectionState) -> ReflectionState:
    critique = llm.invoke(f"""
    Review this draft and identify weaknesses, gaps, and improvements needed:
    
    Task: {state['task']}
    Draft: {state['draft']}
    
    Be specific and critical. List 3-5 concrete issues.
    """).content
    return {"critique": critique}

def revise_draft(state: ReflectionState) -> ReflectionState:
    revision = llm.invoke(f"""
    Revise the draft based on this critique:
    
    Original draft: {state['draft']}
    Critique: {state['critique']}
    
    Produce an improved version that addresses each issue.
    """).content
    return {
        "revision": revision,
        "draft": revision,   # Replace draft with revision for next iteration
        "iterations": state["iterations"] + 1
    }

def should_continue(state: ReflectionState) -> str:
    if state["iterations"] >= MAX_ITERATIONS:
        return "finalize"
    # Could also ask LLM: "Is this draft good enough?"
    quality_check = llm.invoke(f"Is this draft ready? Answer YES or NO only:\n{state['draft']}").content
    return "finalize" if "YES" in quality_check else "critique"

def finalize(state: ReflectionState) -> ReflectionState:
    return {"final": state["draft"]}

graph = StateGraph(ReflectionState)
graph.add_node("generate", generate_draft)
graph.add_node("critique", critique_draft)
graph.add_node("revise", revise_draft)
graph.add_node("finalize", finalize)

graph.set_entry_point("generate")
graph.add_edge("generate", "critique")
graph.add_edge("critique", "revise")
graph.add_conditional_edges("revise", should_continue)
graph.add_edge("finalize", END)

app = graph.compile()
```

---

### Q6: What is the difference between `interrupt_before` and the `interrupt()` function? When do you use each?

**Answer:**

```
interrupt_before / interrupt_after (compile-time):
  - Declared when compiling the graph
  - Pauses EVERY run at that node, unconditionally
  - Use for: fixed review steps (e.g., always approve before "send_email" node)
  - Can't be triggered conditionally based on content

interrupt() (runtime, inside a node):
  - Called from within a node's code
  - Pauses only when that line executes (conditional logic possible)
  - The value passed to interrupt() is returned to the caller
  - The graph resumes when .invoke(Command(resume=...)) is called
  - Use for: content-dependent pauses ("pause only if amount > $1000")
```

```python
# interrupt_before: always pause before "payment" node
app = graph.compile(
    checkpointer=checkpointer,
    interrupt_before=["payment"]
)

# interrupt(): pause only for high-value transactions
from langgraph.types import interrupt, Command

def process_transaction(state):
    amount = state["transaction"]["amount"]
    if amount > 1000:
        # Dynamic pause — value sent to caller
        approval = interrupt({
            "amount": amount,
            "description": "High-value transaction requires approval"
        })
        if not approval.get("approved"):
            return {"status": "rejected"}
    # Continue normally for small transactions
    execute_payment(state["transaction"])
    return {"status": "completed"}

# Resuming after interrupt():
result = app.invoke(Command(resume={"approved": True}), config=config)
```

---

### Q7: How do you share state between a parent graph and a subgraph in LangGraph?

**Answer:**

Subgraphs have isolated state. You control the boundary explicitly with input/output transformation nodes.

```python
# Parent state
class ParentState(TypedDict):
    user_query: str
    retrieved_docs: list[str]
    answer: str

# Subgraph state (different schema)
class RAGState(TypedDict):
    query: str
    docs: list[str]
    response: str

# Bridge: parent → subgraph input
def enter_rag(state: ParentState) -> RAGState:
    return {
        "query": state["user_query"],
        "docs": [],
        "response": ""
    }

# Bridge: subgraph output → parent update
def exit_rag(state: RAGState) -> ParentState:
    return {
        "retrieved_docs": state["docs"],
        "answer": state["response"]
    }

# Subgraph
rag_graph = StateGraph(RAGState)
# ... add rag nodes ...
rag_compiled = rag_graph.compile()

# Parent graph
parent = StateGraph(ParentState)
parent.add_node("enter_rag", enter_rag)
parent.add_node("rag", rag_compiled)
parent.add_node("exit_rag", exit_rag)

parent.add_edge("enter_rag", "rag")
parent.add_edge("rag", "exit_rag")
```

---

### Q8: How would you test a LangGraph agent without calling real LLMs?

**Answer:**

```python
from unittest.mock import patch, MagicMock
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
import pytest

# Strategy 1: Mock the LLM inside the node
def test_agent_calls_tool():
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = AIMessage(
        content="",
        tool_calls=[{
            "name": "search_web",
            "args": {"query": "Python version"},
            "id": "call_1"
        }]
    )

    with patch("myagent.agent_node.model", mock_llm):
        app = build_graph()
        result = app.invoke({"messages": [HumanMessage("What Python version is current?")]})

    assert mock_llm.invoke.called
    # Assert tool call was made
    tool_calls = result["messages"][1].tool_calls
    assert tool_calls[0]["name"] == "search_web"

# Strategy 2: Fake LLM (deterministic responses)
from langchain_core.language_models.fake import FakeListChatModel

def test_rag_retrieval():
    # Returns responses in order
    fake_llm = FakeListChatModel(responses=[
        "I need to search for this information",  # First call
        "Based on the retrieved context, the answer is 42",  # Second call
    ])

    app = build_rag_graph(llm=fake_llm)
    result = app.invoke({"question": "What is the answer?"})
    assert "42" in result["answer"]

# Strategy 3: Test individual nodes directly
def test_retrieval_node_formats_docs():
    state = {
        "question": "test query",
        "documents": [],
        "context": ""
    }
    result = retrieval_node(state)  # Call node directly, no graph needed
    assert len(result["documents"]) > 0

# Strategy 4: Replay from checkpoint (integration test)
def test_resume_from_checkpoint():
    checkpointer = MemorySaver()
    app = build_graph(checkpointer=checkpointer, interrupt_before=["tools"])
    config = {"configurable": {"thread_id": "test_1"}}

    # Run to interrupt
    app.invoke({"messages": [HumanMessage("Search for X")]}, config=config)

    # Verify it paused
    state = app.get_state(config)
    assert "tools" in state.next

    # Resume
    final = app.invoke(None, config=config)
    assert final["messages"][-1].content != ""
```
