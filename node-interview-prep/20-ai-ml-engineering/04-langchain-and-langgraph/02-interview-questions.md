# LangChain & LangGraph — Interview Questions

### Q1: What is LCEL and why does LangChain recommend it over the older Chain classes?

**Answer:**

LCEL (LangChain Expression Language) is a declarative composition API using the `|` pipe operator.

```python
# Old style (LLMChain — deprecated):
from langchain.chains import LLMChain
chain = LLMChain(llm=model, prompt=prompt)
result = chain.run("input text")

# LCEL (modern):
chain = prompt | model | StrOutputParser()
result = chain.invoke({"input": "input text"})
```

**Why LCEL is better:**

1. **Streaming built-in** — `chain.astream()` works on any LCEL chain without extra code
2. **Async support** — `chain.ainvoke()` for every component automatically
3. **Batch processing** — `chain.batch([...])` parallelizes calls automatically
4. **Schema introspection** — `chain.input_schema` / `chain.output_schema` for validation
5. **Composability** — Chains are just Runnables — any can be substituted
6. **Tracing** — LangSmith traces LCEL chains automatically, step by step

---

### Q2: How does LangGraph handle state across multiple LLM calls?

**Answer:**

```python
# State is explicitly defined as a TypedDict
class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], operator.add]
    context: str
    attempts: int

# The Annotated[list, operator.add] means:
# When a node returns {"messages": [new_message]},
# it APPENDS to existing messages (not replaces)

# State flows through every node:
def researcher_node(state: AgentState) -> AgentState:
    # Read from state
    question = state["messages"][-1].content
    attempts = state["attempts"]

    # Generate response
    response = model.invoke(state["messages"])

    # Return ONLY the changes (LangGraph merges these)
    return {
        "messages": [response],  # Will be appended via operator.add
        "attempts": attempts + 1  # Will replace
    }

# Persistence across sessions: use checkpointers
from langgraph.checkpoint.postgres import PostgresSaver
checkpointer = PostgresSaver.from_conn_string("postgresql://...")
app = workflow.compile(checkpointer=checkpointer)

# Same thread_id = same state resumes
result = app.invoke(input, config={"configurable": {"thread_id": "user_123_session_1"}})
# Later:
result = app.invoke(new_input, config={"configurable": {"thread_id": "user_123_session_1"}})
# State from previous call is loaded automatically
```

---

### Q3: What's the difference between LangChain tools and OpenAI function calling?

**Answer:**

LangChain tools are abstractions built *on top of* provider function calling:

```
OpenAI Function Calling (low level):
  - Send JSON schema of functions with message
  - Model returns JSON: {"name": "func", "arguments": {...}}
  - You execute the function manually
  - Provider-specific API

LangChain @tool (high level):
  - Decorate Python function → auto-generates JSON schema from docstring + type hints
  - model.bind_tools([tool1, tool2]) → adds to API call
  - ToolNode → automatically routes tool calls to correct function
  - Works across OpenAI, Anthropic, Google (same interface)
  - Integrates with LangGraph agent loop

Anthropic tool use, Gemini function calling → same pattern, different API syntax
LangChain normalizes all of them.
```

```python
@tool
def calculate_tax(amount: float, rate: float) -> float:
    """Calculate tax amount.

    Args:
        amount: The base amount in dollars
        rate: Tax rate as decimal (e.g., 0.08 for 8%)
    """
    return amount * rate

# LangChain auto-generates:
# {
#   "name": "calculate_tax",
#   "description": "Calculate tax amount.",
#   "parameters": {
#     "type": "object",
#     "properties": {
#       "amount": {"type": "number", "description": "The base amount in dollars"},
#       "rate": {"type": "number", "description": "Tax rate as decimal..."}
#     },
#     "required": ["amount", "rate"]
#   }
# }
```

---

### Q4: How do you implement a ReAct agent using LangGraph?

**Answer:**

```python
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
from typing import TypedDict, Annotated
import operator

@tool
def search_web(query: str) -> str:
    """Search the web for information."""
    # Implementation
    return f"Results for {query}: ..."

@tool
def calculate(expression: str) -> str:
    """Evaluate a math expression."""
    try:
        return str(eval(expression))  # Use safe_eval in production!
    except:
        return "Invalid expression"

tools = [search_web, calculate]
model = ChatOpenAI(model="gpt-4o").bind_tools(tools)

class State(TypedDict):
    messages: Annotated[list, operator.add]

# ReAct loop:
# agent → think + decide action
# tools → execute action
# agent → observe + think again
# (repeat until no tool calls)

graph = StateGraph(State)
graph.add_node("agent", lambda s: {"messages": [model.invoke(s["messages"])]})
graph.add_node("tools", ToolNode(tools))
graph.set_entry_point("agent")
graph.add_conditional_edges("agent", tools_condition)
graph.add_edge("tools", "agent")

app = graph.compile()

result = app.invoke({
    "messages": [HumanMessage(content="What's 15% of the current Bitcoin price?")]
})
# Agent: "I need to search for Bitcoin price, then calculate 15%"
# Tool call: search_web("Bitcoin price USD")
# Observation: "$67,000"
# Tool call: calculate("67000 * 0.15")
# Observation: "10050.0"
# Agent: "15% of the current Bitcoin price ($67,000) is $10,050"
```

---

### Q5: How do you add streaming support to a LangGraph agent so the UI updates in real-time?

**Answer:**

```python
# Method 1: Stream events (recommended)
async for event in app.astream_events(
    {"messages": [HumanMessage(content="Tell me about Paris")]},
    version="v2"
):
    if event["event"] == "on_chat_model_stream":
        # Streaming token from LLM
        chunk = event["data"]["chunk"].content
        if chunk:
            yield chunk  # SSE to frontend

    if event["event"] == "on_tool_start":
        # Notify which tool is being called
        yield f"\n[Calling tool: {event['name']}]\n"

    if event["event"] == "on_tool_end":
        # Notify tool result
        yield f"\n[Tool result: {event['data']['output'][:100]}]\n"

# Method 2: Stream state updates
async for chunk in app.astream(input, stream_mode="updates"):
    for node_name, node_output in chunk.items():
        print(f"Node '{node_name}' produced: {node_output}")

# FastAPI SSE endpoint
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
app_api = FastAPI()

@app_api.post("/chat")
async def chat(request: ChatRequest):
    async def generate():
        async for event in langgraph_app.astream_events(
            {"messages": [HumanMessage(content=request.message)]},
            version="v2"
        ):
            if event["event"] == "on_chat_model_stream":
                chunk = event["data"]["chunk"].content
                if chunk:
                    yield f"data: {json.dumps({'token': chunk})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
```
