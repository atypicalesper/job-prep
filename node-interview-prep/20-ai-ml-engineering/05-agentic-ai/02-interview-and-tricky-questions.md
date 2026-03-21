# Agentic AI — Interview & Tricky Questions

### Q1: What's the difference between a chain and an agent?

```
Chain:
  - Fixed sequence of steps decided at design time
  - Deterministic: same path every time
  - Fast: no overhead for decision-making
  - Predictable cost (fixed number of LLM calls)
  - Example: prompt | llm | parser

Agent:
  - LLM decides which steps to take at runtime
  - Non-deterministic: path varies based on task
  - Slower: LLM must reason before each action
  - Variable cost (unknown number of LLM calls)
  - Example: ReAct loop with tool calling

Rule of thumb:
  If you know exactly what steps are needed → use a chain
  If the steps depend on the input/result → use an agent
```

---

### Q2: How do you ensure an agent doesn't take destructive actions?

**Answer:**

```python
# Layer 1: Tool design — explicit descriptions with warnings
@tool
def delete_record(record_id: str) -> str:
    """
    PERMANENT: Delete a record. This cannot be undone.
    Only call this when the user has EXPLICITLY confirmed deletion
    with the exact record ID they want to delete.
    """
    db.delete(record_id)

# Layer 2: Human-in-the-loop before dangerous tools
from langgraph.graph import StateGraph
from langgraph.checkpoint.memory import MemorySaver

DANGEROUS_TOOLS = {"delete_record", "send_email", "deploy_code"}

def route_to_human(state):
    last_message = state["messages"][-1]
    if last_message.tool_calls:
        for tc in last_message.tool_calls:
            if tc["name"] in DANGEROUS_TOOLS:
                return "human_review"  # Pause here
    return "tools"

# interrupt_before causes the graph to pause
app = workflow.compile(
    checkpointer=MemorySaver(),
    interrupt_before=["human_review"]
)

# Layer 3: Confirmation token in tool args
@tool
def delete_record(record_id: str, confirmation: str) -> str:
    """
    Delete a record. The confirmation field must be "DELETE:{record_id}".
    Ask the user to confirm by providing this exact string.
    """
    if confirmation != f"DELETE:{record_id}":
        return "Error: Incorrect confirmation. Ask user to confirm with 'DELETE:{record_id}'"
    db.delete(record_id)
    return "Deleted"

# Layer 4: Separate read and write permissions
read_only_tools = [search_db, get_record, list_records]
write_tools = [create_record, update_record, delete_record]

# Different agents with different tool access
readonly_agent = build_agent(tools=read_only_tools)    # Safe for any user
admin_agent = build_agent(tools=read_only_tools + write_tools)  # Admin only
```

---

### Q3: What is the "context stuffing" problem in agents and how do you solve it?

**Answer:**

As an agent runs more steps, its context grows. Each tool call adds:
- The tool call request
- The tool result
- Potentially large amounts of data

```
After 10 steps:
  - System prompt: 500 tokens
  - Original task: 50 tokens
  - Turn 1 messages: 300 tokens
  - Tool call 1 result: 2000 tokens (e.g., search result)
  - Turn 2 messages: 200 tokens
  - Tool call 2 result: 1500 tokens
  - ...
  Total: 15,000+ tokens per request, growing each iteration

Problems:
  1. Cost: each iteration becomes more expensive
  2. "Lost in the middle": early context forgotten
  3. Context window limits hit

Solutions:
```

```python
# Solution 1: Summarize tool results
def truncate_tool_result(result: str, max_tokens: int = 500) -> str:
    if count_tokens(result) <= max_tokens:
        return result
    # Summarize the result
    return llm.invoke(f"Summarize this in 200 words:\n{result}")

# Solution 2: Rolling summary of old messages
def compress_history(messages: list, keep_last_n: int = 4) -> list:
    if len(messages) <= keep_last_n:
        return messages

    old_messages = messages[:-keep_last_n]
    summary = llm.invoke(f"Summarize this conversation:\n{format_messages(old_messages)}")

    return [SystemMessage(content=f"Previous conversation: {summary}")] + messages[-keep_last_n:]

# Solution 3: Store large results externally
@tool
def search_web(query: str) -> str:
    results = actual_search(query)
    # Store full result in state, return only summary
    result_id = store.put(results)
    summary = results[:500]  # First 500 chars
    return f"[Result ID: {result_id}] {summary}... (use get_result({result_id}) for full content)"

# Solution 4: LangGraph with summarization node
def summarize_if_too_long(state: AgentState) -> AgentState:
    if count_tokens(state["messages"]) > 8000:
        state["messages"] = compress_history(state["messages"])
    return state
```

---

### Q4: Why is agentic AI harder to test than traditional APIs?

**Answer:**

Traditional API test:
```python
# Deterministic — same input → same output every time
def test_calculate_tax():
    assert calculate_tax(100, 0.1) == 10.0  # Always passes or always fails
```

Agent test:
```python
# Non-deterministic — agent may take different paths
def test_research_agent():
    result = agent.invoke("Research the top 3 AI companies")
    # What exactly do you assert here?
    # The exact wording will differ every run
    # The order of companies might differ
    # Which tools were called might differ
```

**Testing strategies for agents:**

```python
# 1. Outcome-based testing (not implementation)
def test_research_agent():
    result = agent.invoke("What are the top 3 AI companies?")
    # Check outcome, not exact text
    assert "NVIDIA" in result or "Nvidia" in result  # Flexible
    assert len(result) > 100  # At least substantial
    assert not contains_hallucination_markers(result)

# 2. Tool call assertion
def test_uses_search_tool():
    with tool_call_recorder() as recorder:
        agent.invoke("What's the current stock price of Apple?")
    # Should have called search, not just used training data
    assert "get_stock_price" in [call.tool_name for call in recorder.calls]

# 3. Trace-based testing with LangSmith
from langsmith import Client, expect

@pytest.mark.langsmith
def test_agent_trace():
    result = agent.invoke("Book a flight to Paris")
    expect.edit_distance(result, "flight booked").to_be_less_than(0.5)

# 4. LLM judge for quality
def assert_factual_accuracy(response: str, ground_truth: str) -> None:
    score = llm_judge(f"Is this response factually consistent with: {ground_truth}\nResponse: {response}")
    assert score > 0.8, f"Factual accuracy too low: {score}"

# 5. Fixed seed + deterministic mock for unit tests
with patch("tools.search_web") as mock_search:
    mock_search.return_value = "AAPL: $189.43"
    result = agent.invoke("What's Apple's stock price?")
    assert "189" in result
    assert mock_search.called
```

---

### Q5: What's the difference between multi-agent and single-agent systems? When do you need multiple agents?

**Answer:**

```
Single-agent with many tools:
  1 LLM decides everything
  All tools visible in context (limited by context window)
  Simple, less overhead
  Context gets bloated with all tool descriptions

Multi-agent:
  Each agent specializes → smaller context, better focus
  Parallel execution of independent subtasks
  Different models per agent (cheap model for simple tasks)
  Isolation: researcher doesn't need coding tools

When to use multi-agent:
  1. Task is too complex for single context window
     → Orchestrator breaks it into parallel subtasks
  2. Different specializations needed
     → Research agent (web search) + Coding agent (code execution) + Writer agent
  3. Independent subtasks that can run in parallel
     → Analyze 10 documents simultaneously with 10 agents
  4. Quality via adversarial agents
     → Generator agent + Critic agent + Refiner agent

Multi-agent patterns:
```

```python
# Pattern 1: Supervisor (orchestrator + workers)
from langgraph.prebuilt import create_react_agent

research_agent = create_react_agent(model, [search_web, read_url])
code_agent = create_react_agent(model, [run_python, write_file])

def supervisor_node(state):
    # Supervisor decides which agent to call
    decision = supervisor_model.invoke(state["messages"])
    return {"next": decision.content}  # "research" or "code" or "FINISH"

# Pattern 2: Parallel execution
from langgraph.constants import Send

def fan_out(state):
    # Send same task to multiple agents in parallel
    return [Send("analyze_agent", {"doc": doc}) for doc in state["documents"]]

# Pattern 3: Debate (adversarial)
# Generator → produces answer
# Critic → finds flaws
# Generator → revises
# (repeat N rounds)
```
