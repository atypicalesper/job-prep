# Python Tooling — Environments, Testing, and Dev Setup

## Environment Management

### venv (built-in, simplest)

```bash
# Create
python -m venv .venv

# Activate
source .venv/bin/activate    # Mac/Linux
.venv\Scripts\activate       # Windows

# Install & freeze
pip install fastapi openai
pip freeze > requirements.txt
pip install -r requirements.txt

# Deactivate
deactivate
```

### uv (2024+ — fastest, recommended)

`uv` is written in Rust and replaces pip + venv in one tool. 10–100x faster than pip.

```bash
# Install uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# New project
uv init my-project
cd my-project

# Add dependencies (like npm install)
uv add fastapi openai anthropic

# Add dev dependencies
uv add --dev pytest ruff mypy

# Run in the project's venv
uv run python main.py
uv run pytest

# Sync from pyproject.toml (like npm ci)
uv sync

# Generate lock file
uv lock
```

### pyproject.toml (modern standard)

```toml
[project]
name = "my-ai-app"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115",
    "openai>=1.0",
    "anthropic>=0.40",
    "langchain>=0.3",
    "chromadb>=0.5",
    "sentence-transformers>=3.0",
    "numpy>=1.26",
    "pandas>=2.0",
    "torch>=2.2",
]

[project.optional-dependencies]
dev = ["pytest", "ruff", "mypy", "httpx"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.ruff]
line-length = 100
target-version = "py311"
```

---

## Code Quality Tools

### ruff (fast linter + formatter, replaces flake8/black/isort)

```bash
# Install
uv add --dev ruff

# Lint
ruff check .

# Fix auto-fixable issues
ruff check . --fix

# Format (like black)
ruff format .

# Config in pyproject.toml
```

```toml
[tool.ruff.lint]
select = ["E", "F", "I", "N", "W", "UP"]  # errors, pyflakes, isort, naming, warnings, upgrades
ignore = ["E501"]  # line too long (handled by formatter)
```

### mypy (static type checking)

```bash
mypy src/         # check types
mypy --strict src/  # strict mode — recommended for new projects
```

```python
# Type hints (essential for production AI code)
from typing import Optional, Union
from collections.abc import Iterator, AsyncIterator

def chunk_text(text: str, size: int = 500) -> list[str]: ...
async def stream_tokens(prompt: str) -> AsyncIterator[str]: ...
def get_embedding(text: str) -> list[float]: ...
```

---

## pytest — Testing AI Code

### Basic Structure

```python
# tests/test_chunking.py
import pytest
from src.chunking import chunk_text

def test_basic_chunking():
    text = " ".join(["word"] * 100)
    chunks = chunk_text(text, chunk_size=20, overlap=5)
    assert len(chunks) > 1
    assert all(len(c.split()) <= 20 for c in chunks)

def test_empty_text():
    assert chunk_text("") == []

def test_single_chunk():
    chunks = chunk_text("hello world", chunk_size=100)
    assert len(chunks) == 1
    assert chunks[0] == "hello world"
```

### Fixtures — Shared Setup

```python
# conftest.py (auto-loaded by pytest)
import pytest
from unittest.mock import AsyncMock, MagicMock

@pytest.fixture
def sample_documents():
    return [
        {"id": "1", "text": "Python is great for AI", "label": 1},
        {"id": "2", "text": "JavaScript runs in browsers", "label": 0},
    ]

@pytest.fixture
def mock_openai_client():
    client = AsyncMock()
    client.chat.completions.create.return_value = MagicMock(
        choices=[MagicMock(message=MagicMock(content="Mocked response"))]
    )
    return client

# Use in test
def test_with_docs(sample_documents):
    assert len(sample_documents) == 2

async def test_llm_call(mock_openai_client):
    result = await call_llm(mock_openai_client, "test prompt")
    assert result == "Mocked response"
```

### Parametrize — Run Test with Multiple Inputs

```python
@pytest.mark.parametrize("text, chunk_size, expected_count", [
    ("word " * 100, 20, 6),     # 100 words / (20 - 5 overlap) = 6ish
    ("short text", 100, 1),      # fits in one chunk
    ("", 50, 0),                 # empty text
])
def test_chunk_count(text, chunk_size, expected_count):
    chunks = chunk_text(text.strip(), chunk_size=chunk_size, overlap=5)
    assert len(chunks) == expected_count
```

### Mocking External APIs

```python
from unittest.mock import patch, AsyncMock, MagicMock
import pytest

# Patch at the import location (where it's used, not where it's defined)
@patch('src.llm.openai_client')
async def test_rag_pipeline(mock_client):
    mock_client.chat.completions.create = AsyncMock(return_value=MagicMock(
        choices=[MagicMock(message=MagicMock(content="answer"))]
    ))
    result = await rag_answer("What is Python?")
    assert "answer" in result
    mock_client.chat.completions.create.assert_called_once()

# Context manager style (preferred in many cases)
def test_embedding():
    with patch('src.embeddings.get_embedding') as mock_embed:
        mock_embed.return_value = [0.1, 0.2, 0.3]
        result = search("query")
        mock_embed.assert_called_with("query")
```

### Testing Async Code

```python
import pytest
import asyncio

# Mark as async — requires pytest-asyncio
@pytest.mark.asyncio
async def test_async_function():
    result = await some_async_function()
    assert result is not None

# conftest.py — set asyncio mode
# Or in pyproject.toml:
```

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"  # automatically treat async tests as async
testpaths = ["tests"]
```

### Testing ML Models (Smoke Tests)

```python
import pytest
import numpy as np

@pytest.fixture(scope="module")
def trained_model():
    """Load once per test module — expensive models."""
    from sklearn.ensemble import RandomForestClassifier
    import joblib
    return joblib.load("model.pkl")

def test_model_output_shape(trained_model):
    X = np.random.randn(10, 20)  # 10 samples, 20 features
    preds = trained_model.predict(X)
    assert preds.shape == (10,)

def test_model_probabilities(trained_model):
    X = np.random.randn(5, 20)
    probs = trained_model.predict_proba(X)
    assert probs.shape == (5, 2)         # binary classification
    assert np.allclose(probs.sum(axis=1), 1.0)  # probabilities sum to 1

def test_model_output_range(trained_model):
    X = np.random.randn(100, 20)
    preds = trained_model.predict(X)
    assert set(preds).issubset({0, 1})  # only valid classes
```

### pytest Commands

```bash
# Run all tests
pytest

# Verbose
pytest -v

# Run specific file
pytest tests/test_chunking.py

# Run specific test
pytest tests/test_chunking.py::test_basic_chunking

# Stop on first failure
pytest -x

# Show stdout (print statements)
pytest -s

# Coverage
pytest --cov=src --cov-report=term-missing

# Parallel execution (pip install pytest-xdist)
pytest -n 4
```

---

## Project Structure Best Practice

```
my-ai-project/
├── pyproject.toml          # dependencies, tool config
├── uv.lock                 # lockfile (commit this)
├── src/
│   └── my_app/
│       ├── __init__.py
│       ├── chunking.py
│       ├── embeddings.py
│       ├── rag.py
│       └── api.py         # FastAPI app
├── tests/
│   ├── conftest.py        # shared fixtures
│   ├── test_chunking.py
│   ├── test_embeddings.py
│   └── test_api.py        # FastAPI TestClient tests
├── scripts/
│   └── ingest.py          # one-off scripts
├── .env                   # API keys (never commit!)
├── .env.example           # template (commit this)
└── Dockerfile
```

### Environment Variables (python-dotenv)

```python
# .env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
CHROMA_HOST=localhost

# config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    openai_api_key: str
    anthropic_api_key: str
    chroma_host: str = "localhost"

    class Config:
        env_file = ".env"

settings = Settings()
```

### FastAPI TestClient

```python
from fastapi.testclient import TestClient
from src.api import app

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_ask_endpoint():
    response = client.post("/ask", json={"question": "What is Python?"})
    assert response.status_code == 200
    assert "answer" in response.json()

# Async endpoints — use httpx.AsyncClient
import pytest
import httpx

@pytest.mark.asyncio
async def test_streaming():
    async with httpx.AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post("/stream", json={"question": "test"})
        assert response.status_code == 200
```

---

## Interview Q&A

**Q: How do you test code that makes LLM API calls?**

Mock the API client so tests don't make real calls (slow + cost money). Use `unittest.mock.patch` to replace the client at the import path. Assert that the mock was called with the expected arguments, and set `return_value` to a realistic response object.

**Q: What is `conftest.py` in pytest?**

A special file pytest automatically discovers. It contains fixtures that are shared across multiple test files without explicit imports. Fixtures in `conftest.py` at the project root are available to all tests. You can have multiple `conftest.py` files at different directory levels.

**Q: What's the difference between `scope="function"` and `scope="module"` for fixtures?**

`scope="function"` (default) — fixture created fresh for every test function. `scope="module"` — created once per test file, shared across all tests in that file. For expensive setup like loading ML models, use `scope="module"` or `scope="session"` (once for the entire test run). The tradeoff is test isolation vs speed.

---

## Links to Refer

- [uv Documentation](https://docs.astral.sh/uv/)
- [pytest Documentation](https://docs.pytest.org/)
- [pytest-asyncio](https://pytest-asyncio.readthedocs.io/)
- [Ruff Documentation](https://docs.astral.sh/ruff/)
- [pydantic-settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/)
- [Real Python — pytest Guide](https://realpython.com/pytest-python-testing/)
