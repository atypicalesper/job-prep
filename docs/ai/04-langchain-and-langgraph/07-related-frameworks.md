# Related AI Frameworks

## Framework Landscape

```
LangChain / LangGraph   General-purpose LLM pipelines + stateful agents
LlamaIndex              RAG-first, data connectors, query engines
DSPy                    Programmatic prompt optimization (compile prompts, not write them)
CrewAI                  Multi-agent teams with roles, built on LangChain
AutoGen (Microsoft)     Multi-agent conversations, code execution focus
Haystack                Production NLP pipelines, strong enterprise features
Semantic Kernel         Microsoft's SDK — .NET first, Python/Java support
Pydantic AI             Type-safe agent framework using Pydantic
```

---

## LlamaIndex

LlamaIndex (formerly GPT Index) is optimized for **RAG and data ingestion**. Where LangChain is a general framework, LlamaIndex is laser-focused on querying your data.

### Core Concepts

```
Data Connectors (Readers)   Load data from 100+ sources (PDF, Notion, Slack, SQL...)
Node Parser                 Chunk documents into Nodes (with metadata preserved)
Index                       Store/index nodes (VectorStore, Summary, Knowledge Graph...)
Query Engine                Answer questions over an index
Retriever                   Fetch relevant nodes for a query
Response Synthesizer        Turn retrieved nodes into a final response
```

### Basic RAG with LlamaIndex

```python
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader, Settings
from llama_index.llms.openai import OpenAI
from llama_index.embeddings.openai import OpenAIEmbedding

# Configure globally
Settings.llm = OpenAI(model="gpt-4o-mini")
Settings.embed_model = OpenAIEmbedding(model="text-embedding-3-small")

# Load and index
documents = SimpleDirectoryReader("./docs").load_data()
index = VectorStoreIndex.from_documents(documents)

# Query
query_engine = index.as_query_engine(similarity_top_k=5)
response = query_engine.query("What is the refund policy?")

print(response.response)        # Answer
print(response.source_nodes)    # Retrieved chunks with scores
```

### Advanced Query Engines

```python
from llama_index.core.query_engine import SubQuestionQueryEngine
from llama_index.core.tools import QueryEngineTool

# Tool wrapping a query engine
tool = QueryEngineTool.from_defaults(
    query_engine=index.as_query_engine(),
    name="docs_search",
    description="Searches company documentation"
)

# Sub-question engine: breaks complex queries into sub-questions
sub_question_engine = SubQuestionQueryEngine.from_defaults(
    query_engine_tools=[tool],
    use_async=True
)

response = sub_question_engine.query(
    "Compare the refund policy and the shipping policy"
)
# Internally generates:
# - "What is the refund policy?"
# - "What is the shipping policy?"
# Then synthesizes a combined answer
```

### LlamaIndex vs LangChain for RAG

```
LlamaIndex strengths:
  - Richer index types (Knowledge Graph, Summary, Tree index)
  - Better metadata filtering (filter by date, source, author)
  - Sub-question decomposition built-in
  - Node-level citation tracking out of the box
  - 100+ data connectors via LlamaHub

LangChain strengths:
  - Better for agentic workflows beyond RAG
  - LangGraph for stateful multi-step agents
  - More LLM provider integrations
  - Better memory abstractions
  - Larger ecosystem overall

In practice: combine them — LlamaIndex for retrieval/indexing, LangChain/LangGraph for the agent loop.
```

---

## DSPy

DSPy (Declarative Self-improving Python) takes a different approach: instead of writing prompts, you write **programs** and DSPy **compiles** (optimizes) the prompts for you.

### Core Idea

```
Traditional approach:
  You: "Here is the question: {question}\nThink step by step and answer:"
  Problem: prompt quality depends on your intuition. Brittle to model changes.

DSPy approach:
  You: define input/output fields + examples (a dataset)
  DSPy: runs an optimizer to find the best prompts/few-shots automatically
  Output: a compiled program where prompts are optimized for your task + model
```

### Basic DSPy

```python
import dspy

# Configure LLM
lm = dspy.LM("openai/gpt-4o-mini")
dspy.configure(lm=lm)

# Define a signature (input → output spec)
class SentimentAnalysis(dspy.Signature):
    """Classify the sentiment of text."""
    text: str = dspy.InputField()
    sentiment: Literal["positive", "negative", "neutral"] = dspy.OutputField()
    confidence: float = dspy.OutputField(desc="0.0 to 1.0")

# Use a module (Chain of Thought wraps signature in step-by-step reasoning)
analyzer = dspy.ChainOfThought(SentimentAnalysis)

result = analyzer(text="The product broke after two days. Terrible.")
print(result.sentiment)    # "negative"
print(result.confidence)   # 0.95
print(result.rationale)    # The reasoning trace
```

### Compilation (the key differentiator)

```python
from dspy.teleprompt import BootstrapFewShot

# Your dataset (input + expected output)
trainset = [
    dspy.Example(text="Amazing product!", sentiment="positive").with_inputs("text"),
    dspy.Example(text="Never buying again", sentiment="negative").with_inputs("text"),
    # ... more examples
]

# Metric: is the prediction correct?
def sentiment_metric(example, prediction, trace=None) -> bool:
    return prediction.sentiment == example.sentiment

# Compile: DSPy runs experiments to find best few-shots / prompt format
teleprompter = BootstrapFewShot(metric=sentiment_metric, max_bootstrapped_demos=4)
compiled_analyzer = teleprompter.compile(analyzer, trainset=trainset)

# compiled_analyzer now has auto-selected few-shot examples baked in
# It will perform better than the un-compiled version on your task
result = compiled_analyzer(text="Exceeded my expectations!")
```

### When to use DSPy

```
Good for:
  - Classification tasks with labeled data
  - Structured extraction (consistent schema)
  - Tasks where you have eval metrics
  - Optimizing prompts across model versions

Not for:
  - Free-form generation (creative writing, chat)
  - Tasks with no measurable output
  - When you want full control over the prompt
```

---

## CrewAI

CrewAI is a high-level multi-agent framework built on LangChain. You define Agents with roles and goals, assign Tasks, form a Crew, and kick it off.

```python
from crewai import Agent, Task, Crew, Process
from crewai_tools import SerperDevTool, WebsiteSearchTool

# Define agents with roles
researcher = Agent(
    role="Senior Research Analyst",
    goal="Find accurate, up-to-date information on the given topic",
    backstory="Expert at synthesizing complex information from multiple sources",
    tools=[SerperDevTool(), WebsiteSearchTool()],
    llm="gpt-4o-mini",
    verbose=True,
    max_iter=5,         # Max tool call loops
    allow_delegation=True,  # Can delegate to other agents
)

writer = Agent(
    role="Technical Writer",
    goal="Write clear, well-structured technical content",
    backstory="Experienced at turning complex research into readable prose",
    llm="gpt-4o-mini",
)

# Define tasks (order matters for sequential process)
research_task = Task(
    description="Research the current state of {topic}. Focus on trends and key players.",
    expected_output="Bullet-point summary with 5-7 key findings and sources",
    agent=researcher,
)

writing_task = Task(
    description="Write a 500-word article based on the research.",
    expected_output="Well-structured article with title, intro, body, conclusion",
    agent=writer,
    context=[research_task],   # Writer gets researcher's output as context
)

# Assemble and run
crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, writing_task],
    process=Process.sequential,   # or Process.hierarchical (uses a manager LLM)
    verbose=True,
)

result = crew.kickoff(inputs={"topic": "AI agents in 2025"})
print(result.raw)
```

### CrewAI vs LangGraph

```
CrewAI:
  Pros: Fast to set up, readable role-based config, good for role-play style pipelines
  Cons: Less control over flow, limited state management, fixed process types,
        hard to add custom routing logic, less debuggable

LangGraph:
  Pros: Full control over graph structure, explicit state, time-travel, streaming,
        dynamic routing, subgraphs, production-grade checkpointing
  Cons: More verbose, steeper learning curve

Rule: CrewAI for quick prototypes / demos. LangGraph for production.
```

---

## AutoGen (Microsoft)

AutoGen is Microsoft's multi-agent framework focused on **conversational agents** — particularly code-generating agents with execution.

```python
import autogen

config_list = [{"model": "gpt-4o", "api_key": "..."}]

# Assistant agent — generates code/solutions
assistant = autogen.AssistantAgent(
    name="assistant",
    llm_config={"config_list": config_list},
    system_message="You are a Python expert. Write clean, tested code.",
)

# User proxy — executes code, provides feedback
user_proxy = autogen.UserProxyAgent(
    name="user_proxy",
    human_input_mode="NEVER",   # NEVER / ALWAYS / TERMINATE
    max_consecutive_auto_reply=10,
    is_termination_msg=lambda msg: "DONE" in msg.get("content", ""),
    code_execution_config={
        "executor": autogen.coding.LocalCommandLineCodeExecutor(work_dir="coding/")
    },
)

# Start conversation
user_proxy.initiate_chat(
    assistant,
    message="Write a Python script to scrape Hacker News top stories and save to CSV"
)
# AutoGen loop:
# assistant generates code → user_proxy executes it → sends output back → assistant refines → ...
```

### AutoGen Key Concepts

```
AssistantAgent   LLM-powered — generates text, code, plans
UserProxyAgent   Can execute code, represent the human, or both
GroupChat        Multiple agents in one conversation, manager routes turns
ConversableAgent Base class — any agent that can send/receive messages

Termination conditions:
  is_termination_msg    function that returns True to stop
  max_consecutive_auto_reply   hard limit on auto replies
  human_input_mode=ALWAYS      pause for human input every turn
```

---

## Haystack

Haystack (deepset) is enterprise-focused with strong **pipelines and evaluation** tooling.

```python
from haystack import Pipeline
from haystack.components.retrievers.in_memory import InMemoryBM25Retriever
from haystack.components.generators import OpenAIGenerator
from haystack.components.builders import RAGPromptBuilder
from haystack.dataclasses import Document
from haystack.document_stores.in_memory import InMemoryDocumentStore

# Setup document store
store = InMemoryDocumentStore()
store.write_documents([
    Document(content="Python was created by Guido van Rossum."),
    Document(content="LangChain was founded in 2022."),
])

# Build pipeline
pipeline = Pipeline()
pipeline.add_component("retriever", InMemoryBM25Retriever(document_store=store))
pipeline.add_component("prompt_builder", RAGPromptBuilder())
pipeline.add_component("llm", OpenAIGenerator(model="gpt-4o-mini"))

# Connect components
pipeline.connect("retriever", "prompt_builder.documents")
pipeline.connect("prompt_builder", "llm")

# Run
result = pipeline.run({
    "retriever": {"query": "Who created Python?"},
    "prompt_builder": {"query": "Who created Python?"},
})
print(result["llm"]["replies"][0])
```

---

## Pydantic AI

Type-safe agent framework. Agents are defined with strict input/output schemas. Works well when you need strong typing and validation in agentic loops.

```python
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIModel
from pydantic import BaseModel

class SearchResult(BaseModel):
    title: str
    summary: str
    relevance_score: float

# Agent with typed output
agent = Agent(
    OpenAIModel("gpt-4o-mini"),
    result_type=SearchResult,
    system_prompt="You are a research assistant. Return structured results.",
)

@agent.tool
async def search_web(query: str) -> str:
    """Search the web for information."""
    return await actual_web_search(query)

# Typed response guaranteed
result = await agent.run("Find information about LangGraph")
print(result.data.title)            # str — type-safe
print(result.data.relevance_score)  # float — type-safe
```

---

## Comparison Summary

| Framework | Best For | Avoid When |
|---|---|---|
| LangChain | General LLM pipelines, RAG, tool use | You need complex stateful agents |
| LangGraph | Stateful agents, multi-step, production | Simple single-call chains |
| LlamaIndex | RAG-heavy apps, complex data sources | General agentic workflows |
| DSPy | Optimizing prompts with labeled data | No eval metrics, creative tasks |
| CrewAI | Quick role-based agent prototypes | Production, custom routing |
| AutoGen | Code-gen agents, execute-and-iterate | Non-code tasks, strict control |
| Haystack | Enterprise NLP pipelines, evaluation | Rapid prototyping |
| Pydantic AI | Typed, validated agent I/O | Flexible/dynamic schemas |
