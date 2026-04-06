# LangGraph Deep Dive

## Graph Anatomy

```
StateGraph
├── State          TypedDict — the shared data structure every node reads/writes
├── Nodes          Functions or Runnables that transform state
├── Edges          Static transitions between nodes
├── Conditional Edges  Routing functions that pick the next node at runtime
├── Entry Point    Which node runs first
├── Checkpointer   Optional persistence layer (memory/Postgres/Redis)
└── Store          Optional long-term memory (separate from checkpoint)
```

State flows through nodes. Nodes return **partial updates** — LangGraph merges them into the current state using reducers (the `Annotated[type, reducer]` syntax).

---

## State Reducers

Reducers define how new values merge with existing state when a node returns.

```python
from typing import TypedDict, Annotated
import operator

# Default: replace (no annotation = overwrite)
class State(TypedDict):
    status: str              # node returns {"status": "done"} → replaces

# operator.add: append to list
    messages: Annotated[list, operator.add]   # appends, never replaces

# Custom reducer: keep only unique items
def merge_unique(existing: list, new: list) -> list:
    return list(set(existing + new))

    tags: Annotated[list, merge_unique]

# Custom reducer: last-write-wins with timestamp
from datetime import datetime

def latest(existing: dict, new: dict) -> dict:
    if not existing or new.get("updated_at", "") > existing.get("updated_at", ""):
        return new
    return existing

    user_profile: Annotated[dict, latest]
```

---

## The Send API — Fan-out / Map-Reduce

`Send` lets you dynamically create parallel branches at runtime. Essential for map-reduce patterns where you don't know the number of parallel tasks at build time.

```python
from langgraph.graph import StateGraph, END
from langgraph.types import Send
from typing import TypedDict, Annotated
import operator

class OverallState(TypedDict):
    documents: list[str]          # Input: list of docs to process
    summaries: Annotated[list, operator.add]   # Accumulate results
    final_report: str

class DocState(TypedDict):
    document: str                 # Single doc for one branch
    summary: str

# Node that summarizes a single document
def summarize_doc(state: DocState) -> DocState:
    summary = llm.invoke(f"Summarize: {state['document']}").content
    return {"summary": summary}

# Collect all summaries into final state
def collect_summaries(state: DocState) -> OverallState:
    return {"summaries": [state["summary"]]}

# Fan-out: dynamically spawn one branch per document
def fan_out(state: OverallState):
    # Returns a list of Send objects — one per parallel branch
    return [
        Send("summarize_doc", {"document": doc})
        for doc in state["documents"]
    ]

# Reduce: combine all summaries
def write_report(state: OverallState) -> OverallState:
    combined = "\n\n".join(state["summaries"])
    report = llm.invoke(f"Write a final report from these summaries:\n{combined}").content
    return {"final_report": report}

# Build graph
graph = StateGraph(OverallState)
graph.add_node("summarize_doc", summarize_doc)
graph.add_node("collect_summaries", collect_summaries)
graph.add_node("write_report", write_report)

graph.set_entry_point("__start__")

# Conditional edge using Send — fan-out to N parallel nodes
graph.add_conditional_edges("__start__", fan_out, ["summarize_doc"])
graph.add_edge("summarize_doc", "collect_summaries")
graph.add_edge("collect_summaries", "write_report")
graph.add_edge("write_report", END)

app = graph.compile()

result = app.invoke({
    "documents": ["Doc A...", "Doc B...", "Doc C...", "Doc D..."],
    "summaries": [],
    "final_report": ""
})
# All 4 summarize_doc nodes run in parallel → collect → report
```

---

## Subgraphs and State Isolation

Subgraphs let you compose complex graphs from smaller, independently testable pieces. Each subgraph has its own state — you control what passes between parent and child.

```python
from langgraph.graph import StateGraph, END
from typing import TypedDict, Annotated
import operator

# Subgraph state — only what this subgraph needs
class ReviewState(TypedDict):
    document: str
    issues: Annotated[list, operator.add]
    score: int

# Subgraph nodes
def check_grammar(state: ReviewState) -> ReviewState:
    issues = lint_grammar(state["document"])
    return {"issues": issues}

def check_facts(state: ReviewState) -> ReviewState:
    issues = verify_facts(state["document"])
    return {"issues": issues}

def score_document(state: ReviewState) -> ReviewState:
    score = 100 - len(state["issues"]) * 5
    return {"score": max(0, score)}

# Build subgraph
review_graph = StateGraph(ReviewState)
review_graph.add_node("grammar", check_grammar)
review_graph.add_node("facts", check_facts)
review_graph.add_node("score", score_document)
review_graph.add_edge("grammar", "facts")
review_graph.add_edge("facts", "score")
review_graph.add_edge("score", END)
review_subgraph = review_graph.compile()

# Parent graph state
class MainState(TypedDict):
    raw_doc: str
    review_result: dict   # Will hold subgraph output

# Bridge: parent state → subgraph input
def prepare_review(state: MainState) -> ReviewState:
    return {"document": state["raw_doc"], "issues": [], "score": 0}

# Bridge: subgraph output → parent state update
def store_review(state: ReviewState) -> MainState:
    return {"review_result": {"score": state["score"], "issues": state["issues"]}}

main_graph = StateGraph(MainState)
main_graph.add_node("prepare", prepare_review)
main_graph.add_node("review", review_subgraph)  # Subgraph as a node
main_graph.add_node("store", store_review)
main_graph.add_edge("prepare", "review")
main_graph.add_edge("review", "store")
main_graph.add_edge("store", END)
```

---

## Time-Travel Debugging

Checkpointers save every state transition. You can replay, fork, and patch history — essential for debugging and experimentation.

```python
from langgraph.checkpoint.memory import MemorySaver

checkpointer = MemorySaver()
app = graph.compile(checkpointer=checkpointer)
config = {"configurable": {"thread_id": "debug_run_1"}}

# Run the graph
result = app.invoke({"messages": [HumanMessage("Plan a trip to Japan")]}, config=config)

# --- Inspect all history ---
history = list(app.get_state_history(config))
for i, state in enumerate(history):
    print(f"Step {i}: next={state.next}, checkpoint_id={state.config['configurable']['checkpoint_id']}")

# --- Jump back to step 2 ---
step_2 = history[-3]   # history is newest-first
fork_config = step_2.config

# --- Fork: replay from step 2 with a patched state ---
app.update_state(
    fork_config,
    {"messages": [HumanMessage("Actually, plan a trip to Korea instead")]}
)

# Resume from the patched checkpoint — creates a new branch
forked_result = app.invoke(None, config=fork_config)

# --- Compare branches ---
# Original thread: "debug_run_1" → Japan plan
# Forked thread:   fork_config   → Korea plan (diverges from step 2)
```

---

## Dynamic Breakpoints

Beyond `interrupt_before` / `interrupt_after` on nodes, you can trigger breakpoints from *inside* a node at runtime — based on content, not structure.

```python
from langgraph.types import interrupt

def agent_node(state: AgentState) -> AgentState:
    response = model.invoke(state["messages"])

    # Dynamic: only interrupt if the action is "high risk"
    if response.tool_calls:
        tool_name = response.tool_calls[0]["name"]
        if tool_name in {"send_email", "delete_file", "charge_card"}:
            # interrupt() pauses the graph here and returns a value to the caller
            human_decision = interrupt({
                "action": tool_name,
                "args": response.tool_calls[0]["args"],
                "message": f"Agent wants to call {tool_name}. Approve?"
            })
            if not human_decision.get("approved"):
                # Human rejected — stop execution
                return {"messages": [AIMessage("Action cancelled by user.")]}

    return {"messages": [response]}

# Caller side:
config = {"configurable": {"thread_id": "session_1"}}

# First invoke — may pause at interrupt()
result = app.invoke(input, config=config)
# result contains the interrupt payload: {"action": "send_email", ...}

# Human reviews, approves:
resumed = app.invoke(
    Command(resume={"approved": True}),  # Pass decision back in
    config=config
)
```

---

## LangGraph Platform

LangGraph Platform is the managed deployment layer for LangGraph graphs.

```
Local Dev:      langgraph dev          → hot-reload server at localhost:8123
Self-hosted:    langgraph build + Docker
Cloud:          LangGraph Cloud (managed, hosted by LangChain)

Exposes:
  POST /runs            — start a new run (sync or async)
  POST /runs/stream     — start a run with streaming
  GET  /runs/{run_id}   — poll run status/result
  GET  /threads/{id}/history  — full state history
  POST /threads/{id}/state    — patch state (time-travel)
```

```python
# langgraph.json — config file at project root
{
  "dependencies": ["./my_agent"],
  "graphs": {
    "agent": "./my_agent/graph.py:app"
  },
  "env": ".env"
}
```

```python
# Calling deployed graph via SDK
from langgraph_sdk import get_client

client = get_client(url="http://localhost:8123")

# Async streaming run
async for chunk in client.runs.stream(
    thread_id="thread_1",
    assistant_id="agent",
    input={"messages": [{"role": "user", "content": "Hello"}]},
    stream_mode="events"
):
    print(chunk.event, chunk.data)
```

---

## Command API — Routing with Side Effects

`Command` lets a node both update state AND specify the next node to go to — replacing the need for a separate routing function in many cases.

```python
from langgraph.types import Command
from typing import Literal

def triage_node(state: AgentState) -> Command[Literal["researcher", "coder", "done"]]:
    category = classify(state["messages"][-1].content)

    if category == "research":
        return Command(
            goto="researcher",
            update={"task_type": "research"}
        )
    elif category == "code":
        return Command(
            goto="coder",
            update={"task_type": "code"}
        )
    else:
        return Command(goto="done")

# No conditional_edges needed — routing is inside the node
graph.add_node("triage", triage_node)
graph.add_node("researcher", researcher_node)
graph.add_node("coder", coder_node)
graph.add_node("done", done_node)
graph.set_entry_point("triage")
# LangGraph infers edges from Command's Literal type annotation
```

---

## Long-Term Memory with LangGraph Store

Checkpointers handle within-thread memory. `Store` handles cross-thread, long-term memory — user preferences, facts, history across sessions.

```python
from langgraph.store.memory import InMemoryStore
from langgraph.store.postgres import PostgresStore

# Production: PostgresStore
store = PostgresStore.from_conn_string(DATABASE_URL)

# Namespace: hierarchical key space
# ("users", user_id, "preferences") → all prefs for a user
# ("docs", doc_id, "summaries")      → all summaries for a doc

# Write a memory
await store.aput(
    namespace=("users", "alice", "facts"),
    key="job_title",
    value={"text": "Alice is a senior backend engineer at Stripe", "created_at": "2025-01-10"}
)

# Semantic search over a namespace
results = await store.asearch(
    namespace=("users", "alice", "facts"),
    query="what does Alice do for work",   # Semantic similarity
    limit=3
)
# Returns closest matching stored facts

# Use inside a node
def personalize_response(state: AgentState, *, store: BaseStore) -> AgentState:
    user_id = state["user_id"]
    # Recall relevant context
    memories = store.search(
        namespace=("users", user_id, "facts"),
        query=state["messages"][-1].content,
        limit=5
    )
    context = "\n".join(m.value["text"] for m in memories)
    # Inject into prompt
    response = model.invoke([
        SystemMessage(f"User context:\n{context}"),
        *state["messages"]
    ])
    return {"messages": [response]}

# Inject store when compiling
app = graph.compile(store=store, checkpointer=checkpointer)
```
