# Multi-Agent Systems

## Why Multi-Agent?

A single LLM call has a context window limit. A single agent with 20 tools makes poor decisions because the model gets overwhelmed. Multi-agent systems solve this by decomposing work.

```
Single agent problems:
  - Context fills up with long tasks
  - Too many tools → poor tool selection
  - One model doing everything → bottleneck
  - No specialization
  - Hard to parallelize

Multi-agent benefits:
  - Each agent has a focused role + minimal tools
  - Tasks run in parallel
  - Different models per agent (cheap for simple, expensive for complex)
  - Easier to test and debug individual agents
  - Failure in one agent doesn't corrupt global state
```

---

## Pattern 1: Supervisor (Orchestrator)

A central LLM routes work to specialized worker agents. Workers report back to supervisor. Supervisor decides next step or terminates.

```python
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import create_react_agent
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage, BaseMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from typing import TypedDict, Annotated, Literal
import operator

# --- Specialized agents (each with focused tools) ---
research_agent = create_react_agent(
    ChatOpenAI(model="gpt-4o-mini"),
    tools=[web_search, read_url]
)
analysis_agent = create_react_agent(
    ChatOpenAI(model="gpt-4o"),
    tools=[run_python, read_csv, plot_chart]
)
writer_agent = create_react_agent(
    ChatOpenAI(model="gpt-4o-mini"),
    tools=[read_file, write_file]
)

WORKERS = {"researcher": research_agent, "analyst": analysis_agent, "writer": writer_agent}
MEMBERS = list(WORKERS.keys()) + ["FINISH"]

# --- Shared state ---
class SupervisorState(TypedDict):
    messages: Annotated[list[BaseMessage], operator.add]
    next: str    # Which agent to call next (set by supervisor)

# --- Supervisor node ---
supervisor_prompt = ChatPromptTemplate.from_messages([
    SystemMessage(f"""You manage a team: {MEMBERS}.
    Given the conversation, decide who acts next.
    - researcher: needs external information
    - analyst: needs data analysis or code
    - writer: needs to produce a document
    - FINISH: task is complete
    Respond with ONLY the name."""),
    MessagesPlaceholder("messages"),
    HumanMessage("Who should act next?"),
])

def supervisor_node(state: SupervisorState) -> SupervisorState:
    chain = supervisor_prompt | ChatOpenAI(model="gpt-4o-mini") | StrOutputParser()
    next_agent = chain.invoke({"messages": state["messages"]}).strip()
    return {"next": next_agent}

# --- Worker wrapper ---
def make_worker_node(name: str, agent):
    def run(state: SupervisorState) -> SupervisorState:
        result = agent.invoke({"messages": state["messages"]})
        # Append agent's last message, tagged with who sent it
        last = result["messages"][-1]
        last.name = name
        return {"messages": [last]}
    return run

# --- Build graph ---
graph = StateGraph(SupervisorState)
graph.add_node("supervisor", supervisor_node)

for name, agent in WORKERS.items():
    graph.add_node(name, make_worker_node(name, agent))
    graph.add_edge(name, "supervisor")   # Every worker reports back

graph.add_conditional_edges(
    "supervisor",
    lambda s: s["next"],
    {**{n: n for n in WORKERS}, "FINISH": END}
)
graph.set_entry_point("supervisor")
app = graph.compile()
```

---

## Pattern 2: Hierarchical (Supervisor of Supervisors)

For very complex tasks, nest supervisor graphs — a top-level orchestrator delegates to sub-supervisors that manage their own teams.

```
Top Supervisor
├── Research Supervisor
│   ├── Web Search Agent
│   ├── PDF Reader Agent
│   └── Academic Search Agent
├── Engineering Supervisor
│   ├── Backend Agent
│   └── Frontend Agent
└── QA Supervisor
    ├── Test Writer Agent
    └── Code Reviewer Agent
```

```python
# Each sub-supervisor is itself a compiled StateGraph used as a node in the parent
research_supervisor_app = build_research_supervisor()  # Returns compiled graph
engineering_supervisor_app = build_engineering_supervisor()

class TopState(TypedDict):
    messages: Annotated[list[BaseMessage], operator.add]
    next_team: str

def top_supervisor_node(state: TopState):
    # Decide: research, engineering, qa, or FINISH
    ...

top_graph = StateGraph(TopState)
top_graph.add_node("top_supervisor", top_supervisor_node)
top_graph.add_node("research_team", research_supervisor_app)   # Subgraph as node
top_graph.add_node("engineering_team", engineering_supervisor_app)

top_graph.add_conditional_edges("top_supervisor", lambda s: s["next_team"], ...)
# Each team node routes back to top_supervisor after completion
```

---

## Pattern 3: Peer-to-Peer (Network/Swarm)

Agents are peers — any agent can hand off to any other agent. No central coordinator. Good for creative pipelines where the next step isn't predictable.

```python
from langgraph.types import Command
from typing import Literal

# Each agent decides who gets the baton next
def researcher(state: AgentState) -> Command[Literal["analyst", "writer", "__end__"]]:
    result = research_agent.invoke(state)
    # Agent decides who should handle results
    if "data" in result["messages"][-1].content:
        return Command(goto="analyst", update={"messages": result["messages"][-1:]})
    return Command(goto="writer", update={"messages": result["messages"][-1:]})

def analyst(state: AgentState) -> Command[Literal["researcher", "writer", "__end__"]]:
    result = analysis_agent.invoke(state)
    if needs_more_data(result):
        return Command(goto="researcher", update={"messages": result["messages"][-1:]})
    return Command(goto="writer", update={"messages": result["messages"][-1:]})

def writer(state: AgentState) -> Command[Literal["researcher", "__end__"]]:
    result = writer_agent.invoke(state)
    if result["needs_verification"]:
        return Command(goto="researcher", update={"messages": result["messages"][-1:]})
    return Command(goto="__end__", update={"messages": result["messages"][-1:]})

graph = StateGraph(AgentState)
graph.add_node("researcher", researcher)
graph.add_node("analyst", analyst)
graph.add_node("writer", writer)
graph.set_entry_point("researcher")
# No add_conditional_edges needed — Command handles routing
```

---

## Pattern 4: Handoff via Tools

Agents hand off work to each other by "calling a tool" — the tool is actually a transfer to another agent. This works well in swarm architectures.

```python
from langchain_core.tools import tool

# Handoff tool — transfers control to another agent
def make_handoff_tool(target_agent: str):
    @tool
    def transfer_to(message: str) -> str:
        f"""Transfer to the {target_agent} agent.
        Use when you need {target_agent} expertise.
        Args:
            message: What you need the {target_agent} to do.
        """
        # The actual routing happens in the graph
        # This tool signals "go to target_agent with this message"
        return f"Transferring to {target_agent}: {message}"
    transfer_to.__name__ = f"transfer_to_{target_agent}"
    return transfer_to

# Each agent has its own set of handoffs available
researcher_tools = [web_search, read_url, make_handoff_tool("analyst")]
analyst_tools = [run_python, plot_chart, make_handoff_tool("writer"), make_handoff_tool("researcher")]
writer_tools = [write_file, format_doc, make_handoff_tool("researcher")]

researcher_agent = create_react_agent(ChatOpenAI(model="gpt-4o"), researcher_tools)
analyst_agent = create_react_agent(ChatOpenAI(model="gpt-4o"), analyst_tools)
writer_agent = create_react_agent(ChatOpenAI(model="gpt-4o-mini"), writer_tools)

# Graph router: detect handoff tool calls and route accordingly
def route_after_agent(state):
    last_msg = state["messages"][-1]
    if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
        tool_name = last_msg.tool_calls[0]["name"]
        if tool_name.startswith("transfer_to_"):
            return tool_name.replace("transfer_to_", "")
    return END
```

---

## Pattern 5: Parallel Fan-out with Aggregation

Dispatch the same task to multiple specialist agents simultaneously, then merge results.

```python
from langgraph.types import Send

class PipelineState(TypedDict):
    query: str
    specialist_results: Annotated[list[dict], operator.add]
    final_answer: str

class SpecialistState(TypedDict):
    query: str
    specialist: str
    result: str

SPECIALISTS = ["legal", "financial", "technical"]

def dispatch_to_specialists(state: PipelineState):
    # Fan out — all specialists run in parallel
    return [
        Send("run_specialist", {"query": state["query"], "specialist": s})
        for s in SPECIALISTS
    ]

def run_specialist(state: SpecialistState) -> PipelineState:
    system = SPECIALIST_PROMPTS[state["specialist"]]
    result = ChatOpenAI(model="gpt-4o-mini").invoke([
        SystemMessage(system),
        HumanMessage(state["query"])
    ]).content
    return {"specialist_results": [{"specialist": state["specialist"], "result": result}]}

def aggregate(state: PipelineState) -> PipelineState:
    combined = "\n\n".join(
        f"[{r['specialist'].upper()}]\n{r['result']}"
        for r in state["specialist_results"]
    )
    final = ChatOpenAI(model="gpt-4o").invoke(
        f"Synthesize these expert opinions into a final answer:\n{combined}"
    ).content
    return {"final_answer": final}

graph = StateGraph(PipelineState)
graph.add_node("run_specialist", run_specialist)
graph.add_node("aggregate", aggregate)
graph.add_conditional_edges("__start__", dispatch_to_specialists, ["run_specialist"])
graph.add_edge("run_specialist", "aggregate")
graph.add_edge("aggregate", END)
```

---

## Agent Communication Patterns

```
Message-based (most common):
  Agents communicate via the shared messages list.
  Each agent reads full conversation history.
  Simple but context grows unbounded.

State-based:
  Agents write to specific state fields, not just messages.
  class State:
      research_results: list[str]    ← researcher writes here
      analysis: dict                  ← analyst writes here
      draft: str                      ← writer writes here
  Clean separation, no context bloat.

Handoff with context:
  Agent summarizes what it did before handing off.
  Prevents next agent from re-doing work.
  Include: what was tried, what worked, what's needed next.

Shared memory (Store):
  Long-term facts accessible to all agents.
  agent_memory = store.search(("project", project_id, "context"), query)
  Agents can leave notes for future agents.
```

---

## Practical Considerations

```
Model selection per agent:
  Supervisor / orchestrator → gpt-4o (needs strong reasoning)
  Specialist workers        → gpt-4o-mini (faster, cheaper)
  Simple formatters/parsers → haiku or gpt-3.5

Token cost at scale:
  Each agent in a multi-agent pipeline sees the growing message history.
  Mitigation: summarize at handoff, use state fields instead of messages,
  prune messages in intermediate nodes.

Error propagation:
  One agent failing can cascade.
  Add a retry node or error recovery path in the graph.
  class State:
      error: str | None
      retry_count: int
  
  def error_handler(state) -> Command:
      if state["retry_count"] < 3:
          return Command(goto="agent", update={"retry_count": state["retry_count"] + 1})
      return Command(goto="fail_gracefully")

Testing multi-agent graphs:
  Test each agent/subgraph in isolation first.
  Use MemorySaver for deterministic test runs.
  Mock expensive tool calls with RunnableLambda returns.
  Replay failing runs with time-travel (checkpoint + update_state).
```
