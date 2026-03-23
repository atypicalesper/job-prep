# MCP — Interview Questions

### Q1: What problem does MCP solve that function calling doesn't?

**Answer:**

Function calling is provider-specific — OpenAI's format differs from Anthropic's, which differs from Google's. Every new tool integration requires rewriting glue code for each provider.

MCP solves this with a universal protocol:

```
Problem without MCP:
  My database tool → OpenAI format  (custom code)
  My database tool → Anthropic format (different custom code)
  My database tool → Gemini format   (yet more custom code)

With MCP:
  My MCP database server → works with any MCP-compatible host

  Claude Desktop uses it ✓
  Cursor uses it ✓
  Your custom app uses it ✓
  Future model supports it ✓
```

Additional things MCP provides that function calling doesn't:
- **Resources** — structured read-only data access (files, DB rows, API responses)
- **Prompts** — reusable prompt templates
- **Discoverability** — `list_tools()`, `list_resources()`, `list_prompts()` at runtime
- **Transport layer** — stdio for local, SSE/HTTP for remote

---

### Q2: What are the three MCP primitives and when do you use each?

**Answer:**

```python
# 1. TOOLS — for actions / side effects
# Use when: AI needs to DO something (write, delete, call API, run code)
@mcp.tool()
def create_github_issue(title: str, body: str, labels: list[str]) -> dict:
    """Create a GitHub issue."""
    return github_client.create_issue(title=title, body=body, labels=labels)

# 2. RESOURCES — for read-only data access
# Use when: AI needs to READ/observe something (files, database state, API data)
@mcp.resource("customer://{customer_id}")
def get_customer(customer_id: str) -> str:
    """Read customer record."""
    customer = db.query(f"SELECT * FROM customers WHERE id = '{customer_id}'")
    return json.dumps(customer)

# 3. PROMPTS — for reusable prompt templates
# Use when: you have standard tasks with known best-practice prompts
@mcp.prompt()
def debug_error(language: str, error: str, stack_trace: str) -> str:
    """Standard debugging prompt."""
    return f"""Debug this {language} error.
Error: {error}
Stack trace:
{stack_trace}
Provide: root cause, fix, and how to prevent it."""

# Rule of thumb:
# Tools = verbs (create, delete, send, run)
# Resources = nouns (customer record, file, schema)
# Prompts = templates (standard workflows)
```

---

### Q3: How would you design an MCP server for an internal CRM system?

**Answer:**

```python
from mcp.server.fastmcp import FastMCP
from typing import Annotated
import asyncpg

mcp = FastMCP("CRM Server")

# ── Resources (read-only views) ──────────────────────────────────────────

@mcp.resource("crm://customer/{customer_id}")
async def get_customer(customer_id: str) -> str:
    """Full customer record including orders and interactions."""
    async with db_pool.acquire() as conn:
        customer = await conn.fetchrow(
            "SELECT id, name, email, tier, created_at FROM customers WHERE id = $1",
            customer_id
        )
        orders = await conn.fetch(
            "SELECT id, total, status FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 5",
            customer_id
        )
        return json.dumps({
            "customer": dict(customer),
            "recent_orders": [dict(o) for o in orders]
        })

@mcp.resource("crm://schema")
async def get_crm_schema() -> str:
    """Database schema for context."""
    return """
    customers: id, name, email, tier (bronze/silver/gold), created_at
    orders: id, customer_id, total, status, items (JSON), created_at
    interactions: id, customer_id, type, notes, agent_id, created_at
    """

# ── Tools (actions) ──────────────────────────────────────────────────────

@mcp.tool()
async def search_customers(
    query: Annotated[str, "Search by name or email"],
    limit: Annotated[int, "Max results"] = 10
) -> list[dict]:
    """Search for customers."""
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, name, email, tier FROM customers WHERE name ILIKE $1 OR email ILIKE $1 LIMIT $2",
            f"%{query}%", limit
        )
        return [dict(r) for r in rows]

@mcp.tool()
async def log_interaction(
    customer_id: str,
    interaction_type: Annotated[str, "Type: call, email, chat, meeting"],
    notes: str,
    agent_id: str
) -> dict:
    """Log a customer interaction."""
    VALID_TYPES = {"call", "email", "chat", "meeting"}
    if interaction_type not in VALID_TYPES:
        raise ValueError(f"Invalid type. Must be one of: {VALID_TYPES}")

    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO interactions (customer_id, type, notes, agent_id) VALUES ($1, $2, $3, $4) RETURNING id, created_at",
            customer_id, interaction_type, notes, agent_id
        )
        return {"success": True, "interaction_id": str(row["id"])}

@mcp.tool()
async def update_customer_tier(
    customer_id: str,
    new_tier: Annotated[str, "New tier: bronze, silver, or gold"],
    reason: Annotated[str, "Reason for tier change"]
) -> dict:
    """Update a customer's tier level."""
    VALID_TIERS = {"bronze", "silver", "gold"}
    if new_tier not in VALID_TIERS:
        raise ValueError(f"Invalid tier. Must be: {VALID_TIERS}")

    async with db_pool.acquire() as conn:
        await conn.execute(
            "UPDATE customers SET tier = $1 WHERE id = $2",
            new_tier, customer_id
        )
        # Audit log
        await conn.execute(
            "INSERT INTO tier_changes (customer_id, new_tier, reason) VALUES ($1, $2, $3)",
            customer_id, new_tier, reason
        )
        return {"success": True, "customer_id": customer_id, "new_tier": new_tier}

# ── Prompt template ───────────────────────────────────────────────────────

@mcp.prompt()
def customer_summary(customer_id: str) -> str:
    """Prompt for generating a customer summary."""
    return f"""Read the customer record at crm://customer/{customer_id}.
Provide a brief summary covering:
1. Customer profile (tier, tenure)
2. Recent order history
3. Notable interaction patterns
4. Recommended next action"""
```

---

### Q4: What's the difference between MCP stdio and SSE transport? When do you use each?

**Answer:**

```
STDIO transport:
  - Host spawns server as subprocess
  - Communicates via stdin/stdout pipes
  - Process lifecycle tied to host application
  - No network, no port, no auth needed
  - Fast (no network overhead)

  Best for:
    ✓ Local developer tools (filesystem, local DB)
    ✓ CLI-based tools
    ✓ Claude Desktop integrations
    ✓ Cursor / IDE plugins

SSE (Server-Sent Events) transport:
  - Server runs as HTTP server (separate process/machine)
  - Client connects via HTTP, events stream via SSE
  - Long-lived connection per session
  - Requires auth (API keys, JWT)
  - Can be shared across multiple clients

  Best for:
    ✓ Remote/cloud services
    ✓ Shared organizational tools (deployed once, used by many)
    ✓ Tools that need to be available to multiple AI agents
    ✓ Production deployments

Example:
  # stdio (local)
  {
    "mcpServers": {
      "local-db": {
        "command": "python",
        "args": ["./db_server.py"]
      }
    }
  }

  # SSE (remote)
  {
    "mcpServers": {
      "prod-crm": {
        "url": "https://mcp.company.com/crm",
        "transport": "sse",
        "headers": { "Authorization": "Bearer token" }
      }
    }
  }
```

---

### Q5: How does MCP handle authentication and authorization?

**Answer:**

```python
# MCP itself doesn't define auth — it's handled at the transport layer.

# For stdio: OS-level security (who can run the server process)

# For SSE/HTTP: standard HTTP auth
# The host passes auth headers when connecting:
{
  "mcpServers": {
    "my-server": {
      "url": "https://mcp.example.com",
      "headers": {
        "Authorization": "Bearer ${MCP_API_KEY}"
      }
    }
  }
}

# In the server, you validate in a middleware:
from mcp.server.fastmcp import FastMCP
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

mcp = FastMCP("Secure Server")

async def auth_middleware(request: Request, call_next):
    token = request.headers.get("authorization", "").replace("Bearer ", "")
    if not is_valid_token(token):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    return await call_next(request)

# Authorization within tools:
@mcp.tool()
async def delete_record(record_id: str, user_context: dict) -> dict:
    """Delete a record. Requires admin role."""
    # In practice, user_context comes from the JWT claims
    if "admin" not in user_context.get("roles", []):
        raise PermissionError("Only admins can delete records")
    db.delete(record_id)
    return {"deleted": record_id}
```

---

### Q6: How do you make an MCP server production-ready?

```python
# 1. Error handling — return structured errors, not stack traces
@mcp.tool()
async def get_data(id: str) -> dict:
    try:
        return await db.fetch(id)
    except asyncpg.PostgresError as e:
        # Don't leak internal error details
        raise RuntimeError(f"Database error fetching {id}") from None
    except ValueError as e:
        raise  # User errors are OK to pass through

# 2. Logging
import structlog
log = structlog.get_logger()

@mcp.tool()
async def create_item(data: dict) -> dict:
    log.info("create_item.called", data_keys=list(data.keys()))
    result = await db.insert(data)
    log.info("create_item.success", item_id=result["id"])
    return result

# 3. Health check (for SSE servers)
from starlette.routing import Route
from starlette.responses import JSONResponse

async def health(request):
    return JSONResponse({"status": "ok", "tools": len(mcp._tools)})

app = mcp.get_app()  # Get Starlette app
app.routes.append(Route("/health", health))

# 4. Timeouts
import asyncio

@mcp.tool()
async def slow_operation(data: str) -> str:
    try:
        return await asyncio.wait_for(
            _actual_operation(data),
            timeout=30.0
        )
    except asyncio.TimeoutError:
        raise RuntimeError("Operation timed out after 30 seconds")

# 5. Versioning — use tool descriptions to indicate version
@mcp.tool()
def process_data(input: str) -> str:
    """[v2] Process data using the new pipeline. Use this instead of process_data_legacy."""
    ...
```
