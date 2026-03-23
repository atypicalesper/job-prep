# Agentic AI

## What is an AI Agent?

An AI agent is a system where an LLM **autonomously decides** what actions to take, executes them, and uses the results to determine next steps — repeating until the goal is complete.

```
Traditional LLM call:
  User input → LLM → Output   (single step)

AI Agent:
  User goal → LLM thinks → chooses action → executes action
           ↑                                      ↓
           └──────── observes result ←────────────┘
                     (repeats until done)
```

---

## Agent Architecture

```
┌─────────────────────────────────────────────────────┐
│                    AI AGENT                          │
│                                                     │
│  ┌─────────────┐    ┌──────────────────────────┐   │
│  │   MEMORY    │    │        BRAIN (LLM)        │   │
│  │             │    │                           │   │
│  │ Short-term  │◄──►│  Receives: goal + context │   │
│  │ (context)   │    │  Decides: what to do next │   │
│  │             │    │  Outputs: action or answer│   │
│  │ Long-term   │    └──────────────────────────┘   │
│  │ (vector DB) │              │                     │
│  └─────────────┘              ▼                     │
│                    ┌──────────────────────────┐     │
│                    │         TOOLS            │     │
│                    │  search, code, database  │     │
│                    │  APIs, file system, etc. │     │
│                    └──────────────────────────┘     │
└─────────────────────────────────────────────────────┘
```

---

## Agent Types

### 1. ReAct Agent (Reason + Act)

The most common pattern. LLM alternates between thinking and acting.

```
Thought: I need to find the current price of AAPL
Action: search("AAPL stock price")
Observation: AAPL is $189.43

Thought: Now I need to calculate 10% of that
Action: calculate("189.43 * 0.1")
Observation: 18.943

Thought: I have everything I need to answer
Answer: 10% of AAPL ($189.43) is $18.94
```

### 2. Plan-and-Execute Agent

Agent first creates a full plan, then executes each step.

```python
from langchain_experimental.plan_and_execute import PlanAndExecute, load_agent_executor, load_chat_planner

planner = load_chat_planner(ChatOpenAI(model="gpt-4o"))
executor = load_agent_executor(ChatOpenAI(model="gpt-4o-mini"), tools)
agent = PlanAndExecute(planner=planner, executor=executor)

# Agent output:
# Plan: 1. Search for top 5 AI companies, 2. Get their stock prices,
#        3. Calculate average, 4. Compare to S&P 500
# Execute step 1: search_web("top 5 AI companies 2024")
# Execute step 2: get_stock_price("NVDA"), get_stock_price("MSFT"), ...
# ...
```

**When to use:** Complex multi-step tasks where upfront planning prevents wasted work.

### 3. Tool-Calling Agent (Function Calling)

Modern LLMs natively support parallel tool calling.

```python
# GPT-4o can call multiple tools in one response:
# User: "What's the weather in Tokyo AND Paris?"
# Model: [
#   ToolCall(name="get_weather", args={"city": "Tokyo"}),
#   ToolCall(name="get_weather", args={"city": "Paris"}),
# ]
# Execute both in parallel, return results
```

### 4. Multi-Agent Systems

Multiple specialized agents collaborate.

```
┌───────────────────────────────────────────────┐
│              Orchestrator Agent               │
│  (receives task, delegates to specialists)   │
└──────┬──────────────────────────┬────────────┘
       │                          │
       ▼                          ▼
┌─────────────┐          ┌─────────────────┐
│  Research   │          │   Code Writer   │
│   Agent     │          │     Agent       │
│  (web, RAG) │          │ (Python, tests) │
└─────────────┘          └─────────────────┘
```

---

## Memory Types in Agents

```
┌─────────────────────────────────────────────────┐
│                 AGENT MEMORY                     │
│                                                  │
│  In-Context (Short-term)                        │
│  ─────────────────────────                       │
│  • Current conversation messages                 │
│  • Tool call history this session               │
│  • Scraped in this run                          │
│  • Limited by context window                    │
│                                                  │
│  External (Long-term)                           │
│  ─────────────────────────                       │
│  • Vector DB: semantic search over past info    │
│  • Key-value (Redis): quick fact lookup         │
│  • SQL: structured data, user preferences       │
│  • File system: large docs, code files          │
│                                                  │
│  Episodic (Procedural)                          │
│  ─────────────────────────                       │
│  • Past successful approaches stored            │
│  • Retrieved when facing similar task           │
│  • "Last time I solved X, I did Y"              │
└─────────────────────────────────────────────────┘
```

```python
# Long-term memory with LangGraph
from langgraph.store.memory import InMemoryStore
from langgraph.store.base import BaseStore

store = InMemoryStore()  # Use PostgresStore in production

# Save to memory
await store.aput(
    namespace=("user", user_id, "preferences"),
    key="coding_style",
    value={"language": "TypeScript", "style": "functional"}
)

# Retrieve in future sessions
memories = await store.asearch(
    namespace=("user", user_id, "preferences"),
    query="coding preferences"
)
```

---

## Agent Tools — Production Patterns

```python
from langchain_core.tools import tool, StructuredTool
from pydantic import BaseModel, Field

# 1. Simple tool
@tool
def get_user_orders(user_id: str) -> list[dict]:
    """Get all orders for a user from the database."""
    return db.query("SELECT * FROM orders WHERE user_id = ?", user_id)

# 2. Structured tool with input validation
class SearchInput(BaseModel):
    query: str = Field(description="Search query")
    max_results: int = Field(default=5, description="Maximum results to return", ge=1, le=20)

search_tool = StructuredTool.from_function(
    func=search_web,
    name="web_search",
    description="Search the web for current information",
    args_schema=SearchInput,
    return_direct=False,  # Model sees result, can continue reasoning
)

# 3. Async tool
@tool
async def send_email(to: str, subject: str, body: str) -> str:
    """Send an email. Use only when user explicitly requests it."""
    await email_client.send(to=to, subject=subject, body=body)
    return f"Email sent to {to}"

# 4. Tool with error handling
@tool
def safe_calculator(expression: str) -> str:
    """Safely evaluate a math expression."""
    try:
        # Whitelist approach — only allow math operations
        import ast
        tree = ast.parse(expression, mode='eval')
        # Validate all nodes are safe math operations
        allowed_nodes = {ast.Expression, ast.BinOp, ast.UnaryOp, ast.Num, ast.Constant,
                         ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow}
        for node in ast.walk(tree):
            if type(node) not in allowed_nodes:
                return f"Error: Expression contains disallowed operations"
        result = eval(compile(tree, '<string>', 'eval'))
        return str(result)
    except Exception as e:
        return f"Error calculating: {str(e)}"
```

---

## Agent Evaluation & Reliability

```
Reliability challenges with agents:
  1. Non-deterministic — same input, different tool call sequence
  2. Compounding errors — mistake in step 2 cascades through all steps
  3. Tool failures — external APIs fail, timeout, return unexpected format
  4. Cost unpredictability — more reasoning steps = more tokens

Evaluation approaches:
  1. Task completion rate — did agent complete the goal?
  2. Steps to completion — fewer is better (efficiency)
  3. Tool call accuracy — correct tools called with correct args?
  4. Error recovery rate — does agent recover from tool failures?
  5. Cost per task — total tokens used

Production patterns:
  - Always set max_iterations / recursion_limit
  - Implement circuit breakers for expensive tools
  - Log every tool call and result (LangSmith)
  - Test with adversarial inputs (what if tool returns garbage?)
  - Human-in-the-loop for irreversible actions (send email, delete record)
```

---

## Common Agent Failure Modes

| Failure | Cause | Fix |
|---------|-------|-----|
| Infinite loop | No exit condition | Set recursion_limit, track attempts |
| Wrong tool called | Ambiguous tool descriptions | More specific tool names + docstrings |
| Hallucinated tool args | Poor arg type hints | Use Pydantic schemas with descriptions |
| Ignores tool output | Context too long | Summarize tool outputs, compress history |
| Over-calling tools | Model unsure | Better system prompt: "use minimum tool calls" |
| Unsafe actions | No guardrails | Human-in-the-loop, require confirmation |
