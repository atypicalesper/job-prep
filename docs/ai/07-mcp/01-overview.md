# MCP — Model Context Protocol

## What is MCP?

MCP (Model Context Protocol) is an **open standard** created by Anthropic that defines how AI models connect to external tools, data sources, and services. Think of it as USB-C for AI — a universal connector so any AI model can use any tool without custom integration code.

```
Without MCP:
  Claude uses "tool_use"  ──┐
  OpenAI uses "function_calling" ──┤  Each needs custom glue code
  Gemini uses "function_declarations" ──┘

With MCP:
  Any model ──────────► MCP Protocol ──────────► Any tool/data source
                        (universal standard)
```

---

## Core Architecture

```
┌─────────────────────────────────────────────────────┐
│                   MCP HOST                           │
│  (Claude Desktop, Cursor, your app)                 │
│                                                     │
│   ┌─────────────┐      ┌─────────────────────────┐ │
│   │  MCP Client  │◄────►│   LLM (Claude/GPT/etc)  │ │
│   └──────┬──────┘      └─────────────────────────┘ │
└──────────┼──────────────────────────────────────────┘
           │ (stdio / SSE / HTTP)
           ▼
┌─────────────────────────────────────────────────────┐
│                   MCP SERVER                         │
│  (your tool implementation)                         │
│                                                     │
│  ┌──────────┐  ┌───────────┐  ┌─────────────────┐  │
│  │  Tools   │  │ Resources │  │    Prompts       │  │
│  │(actions) │  │  (data)   │  │  (templates)     │  │
│  └──────────┘  └───────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Three MCP Primitives

```
1. TOOLS — functions the AI can call (like function calling)
   Example: get_weather(city), create_issue(title, body), query_db(sql)

2. RESOURCES — data the AI can read (like context injection)
   Example: file://project/README.md, db://customers/table, git://repo/diff

3. PROMPTS — reusable templates the AI can request
   Example: "code_review" prompt, "explain_error" prompt
```

---

## Transport Mechanisms

```
1. stdio (local):
   Host spawns server as subprocess, communicates via stdin/stdout
   Best for: local tools, dev tools, CLI integrations

2. HTTP + SSE (remote):
   Server runs as HTTP endpoint, events streamed via SSE
   Best for: remote services, web integrations, shared tools

3. Streamable HTTP (new, v2024-11):
   Single HTTP endpoint for both request and response streaming
   Best for: cloud deployments
```

---

## Building an MCP Server (Python)

```python
# pip install mcp

from mcp.server.fastmcp import FastMCP
from typing import Annotated
import httpx
import sqlite3

# Create the MCP server
mcp = FastMCP("My Dev Tools")

# ── TOOL: Simple function the AI can call ────────────────────────────────
@mcp.tool()
def get_weather(city: str) -> str:
    """Get current weather for a city."""
    resp = httpx.get(f"https://wttr.in/{city}?format=3")
    return resp.text

# ── TOOL: With complex input schema ──────────────────────────────────────
@mcp.tool()
def run_sql(
    query: Annotated[str, "SQL SELECT query to execute"],
    database: Annotated[str, "Database name"] = "main"
) -> list[dict]:
    """Execute a read-only SQL query against the database."""
    if not query.strip().upper().startswith("SELECT"):
        raise ValueError("Only SELECT queries allowed")  # Safety!

    conn = sqlite3.connect(f"{database}.db")
    conn.row_factory = sqlite3.Row
    cursor = conn.execute(query)
    return [dict(row) for row in cursor.fetchall()]

# ── RESOURCE: Data the AI can read ───────────────────────────────────────
@mcp.resource("docs://{topic}")
def get_docs(topic: str) -> str:
    """Get internal documentation for a topic."""
    docs = {
        "api": "# API Docs\nBase URL: https://api.example.com/v1...",
        "auth": "# Auth Docs\nUse Bearer token in Authorization header...",
    }
    return docs.get(topic, f"No docs found for: {topic}")

# ── PROMPT: Reusable template ──────────────────────────────────────────
@mcp.prompt()
def code_review(language: str, code: str) -> str:
    """Standard code review prompt."""
    return f"""You are a senior {language} developer.
Review this code for: bugs, security issues, performance, style.
Be specific and actionable.

```{language}
{code}
```"""

# Run the server
if __name__ == "__main__":
    mcp.run()  # stdio by default
    # mcp.run(transport="sse", host="0.0.0.0", port=8000)  # HTTP+SSE
```

---

## Building an MCP Client (connecting to servers)

```python
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
import anthropic

async def run_with_mcp():
    # Connect to your MCP server
    server_params = StdioServerParameters(
        command="python",
        args=["my_server.py"],
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            # List available tools
            tools = await session.list_tools()
            print([t.name for t in tools.tools])
            # → ['get_weather', 'run_sql']

            # Convert MCP tools to Anthropic tool format
            anthropic_tools = [
                {
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.inputSchema,
                }
                for t in tools.tools
            ]

            # Use Claude with MCP tools
            client = anthropic.Anthropic()
            response = client.messages.create(
                model="claude-opus-4-6",
                max_tokens=1024,
                tools=anthropic_tools,
                messages=[{"role": "user", "content": "What's the weather in Tokyo?"}]
            )

            # Handle tool call
            if response.stop_reason == "tool_use":
                tool_use = next(b for b in response.content if b.type == "tool_use")
                result = await session.call_tool(tool_use.name, tool_use.input)
                print(result.content)
```

---

## MCP with LangChain

```python
from langchain_mcp_adapters.tools import load_mcp_tools
from langchain_anthropic import ChatAnthropic
from langgraph.prebuilt import create_react_agent
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def build_agent_with_mcp():
    server_params = StdioServerParameters(
        command="python",
        args=["my_server.py"],
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            # Load MCP tools directly into LangChain format
            tools = await load_mcp_tools(session)

            model = ChatAnthropic(model="claude-opus-4-6")
            agent = create_react_agent(model, tools)

            result = await agent.ainvoke({
                "messages": [{"role": "user", "content": "What's the weather in Paris?"}]
            })
            print(result["messages"][-1].content)
```

---

## MCP Server Examples (Real-World)

```python
# 1. GitHub MCP Server (already exists officially)
# npx @modelcontextprotocol/server-github
# Tools: create_issue, list_prs, get_file, create_branch, etc.

# 2. PostgreSQL MCP Server
@mcp.tool()
async def query_database(sql: str) -> list[dict]:
    """Query the production database (read-only)."""
    async with asyncpg.connect(DATABASE_URL) as conn:
        rows = await conn.fetch(sql)
        return [dict(row) for row in rows]

@mcp.resource("schema://{table}")
async def get_table_schema(table: str) -> str:
    """Get the schema for a database table."""
    # Returns CREATE TABLE statement
    ...

# 3. Internal API MCP Server
@mcp.tool()
async def get_customer(customer_id: str) -> dict:
    """Fetch customer details from CRM."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{CRM_BASE_URL}/customers/{customer_id}",
            headers={"Authorization": f"Bearer {API_KEY}"}
        )
        return resp.json()

# 4. File System MCP Server
@mcp.resource("file://{path}")
def read_file(path: str) -> str:
    """Read a file from the project directory."""
    safe_path = Path(BASE_DIR) / path
    if not safe_path.resolve().is_relative_to(BASE_DIR):
        raise ValueError("Path traversal not allowed")  # Security!
    return safe_path.read_text()
```

---

## MCP Configuration (.mcp.json / claude_desktop_config.json)

```json
{
  "mcpServers": {
    "my-tools": {
      "command": "python",
      "args": ["/path/to/my_server.py"],
      "env": {
        "DATABASE_URL": "postgresql://...",
        "API_KEY": "sk-..."
      }
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..."
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/project"]
    }
  }
}
```

---

## MCP vs Traditional Function Calling

| | MCP | Function Calling |
|---|---|---|
| **Standard** | Open protocol (any model) | Provider-specific |
| **Reuse** | One server, many clients | Rebuild per integration |
| **Discoverability** | Auto via `list_tools` | Manually defined each time |
| **Resources** | Built-in concept | No equivalent |
| **Prompts** | Built-in concept | No equivalent |
| **Transport** | stdio, SSE, HTTP | API calls only |
| **Ecosystem** | Growing fast (100s of servers) | Fragmented |
| **Best for** | Production, shared tools | Simple one-off use |

---

## Official MCP Servers to Know

```
@modelcontextprotocol/server-github     — GitHub issues, PRs, code
@modelcontextprotocol/server-filesystem — File system operations
@modelcontextprotocol/server-postgres   — PostgreSQL queries
@modelcontextprotocol/server-slack      — Slack messages
@modelcontextprotocol/server-puppeteer — Web scraping/browser
@modelcontextprotocol/server-google-drive — Drive file access
mcp-server-sqlite                       — SQLite databases
mcp-server-docker                       — Docker container management
```

---

## Security Considerations

```python
# 1. Input validation — ALWAYS validate tool inputs
@mcp.tool()
def delete_record(table: str, id: str) -> str:
    """Delete a record."""
    # Whitelist allowed tables
    ALLOWED_TABLES = {"orders", "sessions", "temp_data"}
    if table not in ALLOWED_TABLES:
        raise ValueError(f"Table '{table}' not allowed")
    # Use parameterized queries
    conn.execute("DELETE FROM ? WHERE id = ?", (table, id))

# 2. Scope limitation — tools should do one thing
# BAD: general "execute_code" tool
# GOOD: specific "run_unit_tests", "format_code", "lint_check"

# 3. No secrets in tool output
@mcp.tool()
def get_user(user_id: str) -> dict:
    user = db.get_user(user_id)
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        # "password_hash": user.password_hash,  # NEVER include
        # "api_key": user.api_key,              # NEVER include
    }

# 4. Rate limiting
from functools import lru_cache
import time

_last_call: dict[str, float] = {}

def rate_limit(tool_name: str, min_interval: float = 1.0):
    now = time.time()
    if tool_name in _last_call:
        elapsed = now - _last_call[tool_name]
        if elapsed < min_interval:
            raise RuntimeError(f"Rate limit: wait {min_interval - elapsed:.1f}s")
    _last_call[tool_name] = now
```
