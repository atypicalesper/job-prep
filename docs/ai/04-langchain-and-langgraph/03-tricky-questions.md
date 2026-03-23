# LangChain & LangGraph — Tricky Questions

### Q1: LangChain's documentation mentions "Runnable" everywhere. What exactly is a Runnable and why does it matter?

**Answer:**

Every component in LCEL implements the `Runnable` interface. This is the key abstraction.

```python
# The Runnable interface has 5 methods:
class Runnable:
    def invoke(self, input, config=None)           # Single call
    def batch(self, inputs, config=None)            # Multiple inputs
    def stream(self, input, config=None)            # Stream output
    async def ainvoke(self, input, config=None)     # Async single
    async def astream(self, input, config=None)     # Async stream

# EVERYTHING implements this:
prompt          # Runnable[dict, PromptValue]
chat_model      # Runnable[PromptValue, AIMessage]
output_parser   # Runnable[AIMessage, str]
retriever       # Runnable[str, list[Document]]
tool            # Runnable[dict, str]
your_function   # via RunnableLambda

# This means you can REPLACE any component with a compatible one:
chain1 = prompt | gpt4 | parser
chain2 = prompt | claude | parser    # Drop-in replacement
chain3 = prompt | mock_llm | parser  # For testing!

# The pipe operator just creates a RunnableSequence:
chain = prompt | model | parser
# is equivalent to:
chain = RunnableSequence(first=prompt, middle=[model], last=parser)
```

---

### Q2: You're using LangGraph and your agent is stuck in an infinite loop. How do you debug and prevent it?

**Answer:**

```python
# Why infinite loops happen:
# 1. tools_condition always returns "tools" (tool never returns a final answer)
# 2. Error in tool → model retries → error → retry...
# 3. should_continue logic bug (never returns END)

# Prevention 1: Add recursion limit
app = workflow.compile(
    checkpointer=checkpointer,
    # Hard limit on graph traversals
)
config = {"recursion_limit": 10}  # Default is 25
result = app.invoke(input, config=config)
# Raises GraphRecursionError if exceeded

# Prevention 2: Track attempts in state
class AgentState(TypedDict):
    messages: Annotated[list, operator.add]
    attempts: int

def should_continue(state: AgentState) -> str:
    if state["attempts"] >= 5:
        return END  # Force stop after 5 attempts
    if state["messages"][-1].tool_calls:
        return "tools"
    return END

def agent_node(state: AgentState) -> AgentState:
    return {
        "messages": [model.invoke(state["messages"])],
        "attempts": state["attempts"] + 1
    }

# Prevention 3: Tool result stops loop
@tool
def search(query: str) -> str:
    """Search. Call this at most once per question."""
    # Include in docstring: when to stop calling this tool
    result = actual_search(query)
    return result + "\n\nNote: You now have enough information to answer."

# Debugging: stream updates to see which node is looping
async for chunk in app.astream(input, stream_mode="updates"):
    print(chunk)  # See exactly which node fires each iteration
```

---

### Q3: What's the memory leak risk with LangChain's ConversationBufferMemory and how do you handle it at scale?

**Answer:**

```
The problem:
  ConversationBufferMemory stores ALL messages in memory.
  A 30-minute conversation with GPT-4o (128k context):
  = potentially 100,000+ tokens in one conversation
  = ~$0.50-2.50 per conversation in context costs
  = memory grows unbounded

  At scale: 10,000 concurrent users × 50,000 tokens average
  = 500M tokens in memory = impossible

Solutions in order of sophistication:
```

```python
# Solution 1: Window memory (keep last k messages)
from langchain.memory import ConversationBufferWindowMemory
memory = ConversationBufferWindowMemory(k=10)  # Last 10 exchanges
# Problem: forgets early context (user's name from turn 1)

# Solution 2: Summary memory (compress old messages with LLM)
from langchain.memory import ConversationSummaryBufferMemory
memory = ConversationSummaryBufferMemory(
    llm=ChatOpenAI(model="gpt-3.5-turbo"),  # Use cheap model for summary
    max_token_limit=1000,  # When history > 1000 tokens, summarize
    return_messages=True
)
# Problem: summary loses detail, extra LLM call

# Solution 3: External storage (production)
from langchain_community.chat_message_histories import RedisChatMessageHistory

# Store per user, expires automatically
history = RedisChatMessageHistory(
    session_id=f"user:{user_id}:session:{session_id}",
    url="redis://...",
    ttl=3600  # 1 hour expiry
)

# Solution 4: LangGraph with persistence (best for agents)
from langgraph.checkpoint.postgres import PostgresSaver
# State stored in Postgres, loaded only when needed
# Prune old checkpoints via database TTL or cleanup job
```

---

### Q4: Why does LangChain's async sometimes feel slower than synchronous? When is async NOT faster?

**Answer:**

```python
# Async is faster when: multiple INDEPENDENT operations run in parallel
async def parallel_rag(questions: list[str]) -> list[str]:
    return await asyncio.gather(*[rag_chain.ainvoke(q) for q in questions])
# 5 queries × 2s each = 2s total (vs 10s sequential)

# Async is NOT faster when: operations are sequential by nature
async def sequential_chain():
    summary = await llm.ainvoke("Summarize: " + doc)      # Wait 2s
    analysis = await llm.ainvoke("Analyze: " + summary)   # Wait 2s
    return analysis
# Total: 4s — same as sync! (can't parallelize dependencies)

# Async can be SLOWER when:
# 1. Single operation — async overhead adds ~1ms (negligible usually)
# 2. Tool calls share a rate-limited API
#    → gather(10 calls) all fire at once → rate limit errors → retries → slower
# 3. I/O bound vs CPU bound confusion
#    → asyncio doesn't parallelize CPU work (use multiprocessing for that)

# The hidden gotcha: LangChain callbacks aren't always async-safe
# If your callback writes to a shared dict without locks:
# → Race conditions in parallel async chains

# Fix: use thread-safe callback handlers
from langchain_core.callbacks.manager import AsyncCallbackManager
```

---

### Q5: You're debugging a LangChain chain. How do you see exactly what prompt was sent to the LLM?

**Answer:**

Multiple debugging approaches:

```python
# Method 1: LangSmith (recommended production approach)
os.environ["LANGCHAIN_TRACING_V2"] = "true"
# Now every run is visible at smith.langchain.com with full prompt

# Method 2: Verbose mode
chain = prompt | model | parser
result = chain.invoke({"question": "..."}, config={"verbose": True})
# Prints: prompt template, filled prompt, model response

# Method 3: Callbacks for custom logging
from langchain_core.callbacks import BaseCallbackHandler

class PromptLogger(BaseCallbackHandler):
    def on_llm_start(self, serialized, prompts, **kwargs):
        print("=== PROMPT SENT TO LLM ===")
        for p in prompts:
            print(p)

    def on_llm_end(self, response, **kwargs):
        print("=== LLM RESPONSE ===")
        print(response)

result = chain.invoke(
    {"question": "..."},
    config={"callbacks": [PromptLogger()]}
)

# Method 4: Intermediate inspection with RunnableLambda
def debug_print(x):
    print(f"DEBUG: {x}")
    return x

debug_chain = prompt | RunnableLambda(debug_print) | model | parser

# Method 5: .get_prompts() for template inspection
final_prompt = prompt.invoke({"question": "What is Paris?"})
print(final_prompt.to_string())  # See exactly what will be sent
```
