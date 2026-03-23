# MCP — Tricky Questions

### Q1: "MCP is just function calling with extra steps." How do you respond?

**Answer:**

This is a common misconception. Key differences:

```
Function calling:
  ✗ Tied to one provider's API format
  ✗ Only "tools" concept — no resources or prompts
  ✗ Redefined per model
  ✗ No discoverability standard
  ✗ No transport standard

MCP:
  ✓ Provider-agnostic — works with Claude, GPT, Gemini, local models
  ✓ THREE primitives: Tools + Resources + Prompts
  ✓ Defined once, works everywhere
  ✓ Runtime discoverability (list_tools, list_resources)
  ✓ Standard transports (stdio, SSE, HTTP)
  ✓ Growing ecosystem (100s of open source servers)

Concrete example of what MCP enables but function calling can't:
  - A single MCP database server works with Claude Desktop,
    Cursor, your custom app, AND any future AI tool
  - Without MCP: you'd rewrite the same DB integration 3+ times
    in 3 different formats

MCP is to AI tools what REST was to APIs — a common language
that unlocks an ecosystem.
```

---

### Q2: Your MCP server tool is being called with malicious SQL injection. How do you handle it?

**Answer:**

```python
# The LLM generates tool calls based on user input.
# If user says: "show me orders for customer'; DROP TABLE orders; --"
# The LLM might pass that directly to your SQL tool.

# WRONG — vulnerable:
@mcp.tool()
def query_orders(customer_id: str) -> list:
    return db.execute(f"SELECT * FROM orders WHERE customer_id = '{customer_id}'")

# CORRECT — parameterized queries:
@mcp.tool()
def query_orders(customer_id: str) -> list:
    # Input validation
    if not customer_id.isalnum():
        raise ValueError("customer_id must be alphanumeric")
    # Parameterized query — safe
    return db.execute("SELECT * FROM orders WHERE customer_id = ?", (customer_id,))

# ALSO: validate input types with Pydantic
from pydantic import BaseModel, field_validator
import re

class OrderQuery(BaseModel):
    customer_id: str
    status: str | None = None

    @field_validator("customer_id")
    def validate_id(cls, v):
        if not re.match(r"^[a-zA-Z0-9_-]{1,50}$", v):
            raise ValueError("Invalid customer_id format")
        return v

@mcp.tool()
def query_orders(params: OrderQuery) -> list:
    return db.execute(
        "SELECT * FROM orders WHERE customer_id = ?",
        (params.customer_id,)
    )

# Defense layers:
# 1. Input validation (regex, type checks)
# 2. Parameterized queries (never string interpolation)
# 3. Least privilege (DB user has only SELECT on needed tables)
# 4. Whitelist allowed operations (no DROP, no CREATE, no INSERT for read-only tools)
```

---

### Q3: How do you handle MCP tool calls that fail or take too long?

**Answer:**

```python
import asyncio
from contextlib import asynccontextmanager

# Problem: AI might keep waiting for a failed/slow tool indefinitely

# Solution 1: Timeouts per tool
@mcp.tool()
async def call_external_api(endpoint: str) -> dict:
    """Call an external API endpoint."""
    try:
        async with asyncio.timeout(10):  # 10 second max
            async with httpx.AsyncClient() as client:
                resp = await client.get(endpoint)
                resp.raise_for_status()
                return resp.json()
    except asyncio.TimeoutError:
        return {"error": "Request timed out after 10s", "endpoint": endpoint}
    except httpx.HTTPError as e:
        return {"error": f"HTTP error: {e.response.status_code}", "endpoint": endpoint}

# Solution 2: Retry with backoff for transient failures
import tenacity

@tenacity.retry(
    stop=tenacity.stop_after_attempt(3),
    wait=tenacity.wait_exponential(multiplier=1, min=1, max=10),
    retry=tenacity.retry_if_exception_type(httpx.TransientError),
    reraise=True,
)
async def _fetch_with_retry(url: str) -> dict:
    async with httpx.AsyncClient() as client:
        return (await client.get(url)).json()

@mcp.tool()
async def get_data(url: str) -> dict:
    try:
        return await _fetch_with_retry(url)
    except Exception as e:
        return {"error": str(e), "retries_exhausted": True}

# Solution 3: Return partial results rather than failing completely
@mcp.tool()
async def get_all_metrics() -> dict:
    results = {}
    # Run all fetches, collect whatever succeeds
    tasks = {
        "cpu": fetch_cpu_metrics(),
        "memory": fetch_memory_metrics(),
        "disk": fetch_disk_metrics(),
    }
    for name, coro in tasks.items():
        try:
            results[name] = await asyncio.wait_for(coro, timeout=5)
        except Exception as e:
            results[name] = {"error": str(e)}
    return results
```

---

### Q4: Should you expose a "run_any_sql" tool or specific tools? What's the tradeoff?

**Answer:**

```python
# OPTION A: General purpose (dangerous)
@mcp.tool()
def run_any_sql(query: str) -> list:
    """Run any SQL query."""
    return db.execute(query)
# Pros: flexible, AI can answer any question
# Cons: AI might run expensive queries, update/delete data by accident,
#       expose sensitive tables, SQL injection risk

# OPTION B: Specific tools (safe but verbose)
@mcp.tool()
def get_sales_by_month(year: int, month: int) -> dict:
    """Get sales totals for a specific month."""
    return db.execute("SELECT SUM(total) FROM orders WHERE YEAR(date)=? AND MONTH(date)=?", (year, month))

@mcp.tool()
def get_top_customers(limit: int = 10) -> list:
    """Get top N customers by total spend."""
    if limit > 100:
        raise ValueError("Max limit is 100")
    return db.execute("SELECT customer_id, SUM(total) as spend FROM orders GROUP BY customer_id ORDER BY spend DESC LIMIT ?", (limit,))
# Pros: safe, clear intent, easy to audit, type-checked inputs
# Cons: need to predict what questions will be asked

# OPTION C: Constrained SQL (middle ground — best for most cases)
ALLOWED_TABLES = {"orders", "products", "customers"}

@mcp.tool()
def run_analytics_query(query: str) -> list:
    """Run a READ-ONLY analytics query against orders/products/customers tables."""
    query_upper = query.strip().upper()

    # Only SELECT allowed
    if not query_upper.startswith("SELECT"):
        raise ValueError("Only SELECT queries allowed")

    # Block dangerous keywords
    forbidden = {"DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "EXEC", "EXECUTE"}
    for word in forbidden:
        if word in query_upper.split():
            raise ValueError(f"Keyword '{word}' not allowed")

    # Parse and validate tables (basic check)
    # In production: use sqlparse library for proper parsing
    return db.execute(query)

# General rule: be as specific as possible, then expose constrained
# general tools for power users/AI with explicit safety checks.
```

---

### Q5: How do you test an MCP server?

**Answer:**

```python
# 1. MCP Inspector (official tool)
# npx @modelcontextprotocol/inspector python my_server.py
# Opens a UI to call tools, read resources, test prompts manually

# 2. Unit tests for tool logic
import pytest
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_search_customers_returns_results():
    mock_rows = [{"id": "1", "name": "Alice", "email": "alice@example.com"}]

    with patch("myserver.db_pool") as mock_pool:
        mock_conn = AsyncMock()
        mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.fetch = AsyncMock(return_value=mock_rows)

        result = await search_customers("Alice")
        assert len(result) == 1
        assert result[0]["name"] == "Alice"

@pytest.mark.asyncio
async def test_search_customers_validates_injection():
    with pytest.raises(ValueError, match="Invalid"):
        await search_customers("'; DROP TABLE customers; --")

# 3. Integration tests with in-process client
from mcp import ClientSession
from mcp.server.fastmcp import FastMCP
# Use in-memory transport for testing
from mcp.shared.memory import create_connected_server_and_client_session

async def test_tool_via_mcp_protocol():
    mcp = FastMCP("test")

    @mcp.tool()
    def add(a: int, b: int) -> int:
        return a + b

    async with create_connected_server_and_client_session(mcp._mcp_server) as (_, client_session):
        result = await client_session.call_tool("add", {"a": 2, "b": 3})
        assert result.content[0].text == "5"

# 4. Golden file tests for resources
async def test_schema_resource_matches_expected():
    result = get_crm_schema()
    assert "customers" in result
    assert "orders" in result
    assert "tier" in result  # Important field must be documented
```
