# Python Essentials for JavaScript Developers

## Mental Model Shift

Python is not JavaScript. Key mindset changes:

| JS/TS | Python | Notes |
|---|---|---|
| `const`/`let`/`var` | Just assign | `x = 5` |
| `null` / `undefined` | `None` | Use `is None`, not `== None` |
| `===` | `==` | Python `==` doesn't do coercion, `is` checks identity |
| `&&` / `\|\|` / `!` | `and` / `or` / `not` | English keywords |
| `{}` blocks | Indentation | 4 spaces, no braces |
| Semicolons optional | No semicolons | Just newline |
| Arrow functions | `lambda` | `lambda x: x*2` |
| `Array` | `list` | `[1, 2, 3]` |
| `Object` | `dict` | `{"key": "value"}` |
| `Map` | `dict` | Same thing |
| `Set` | `set` | `{1, 2, 3}` |
| Promises | `async/await` | Same concept, `asyncio` library |
| `try/catch` | `try/except` | `except ValueError as e:` |
| Classes | Classes | `class Foo:` + `self` instead of `this` |

---

## Variables & Types

```python
# Type hints (optional but strongly recommended for AI/ML code)
from typing import Optional, Union, List, Dict, Tuple, Any

name: str = "Tarun"
age: int = 28
score: float = 9.5
active: bool = True
tags: List[str] = ["python", "ai"]
config: Dict[str, Any] = {"model": "gpt-4o", "temp": 0.7}
result: Optional[str] = None

# Type checking at runtime (for debugging)
isinstance(x, str)      # True/False
isinstance(x, (str, int))  # multiple types

# Type conversion
int("42")         # 42
float("3.14")     # 3.14
str(42)           # "42"
bool(0)           # False
list((1,2,3))     # [1, 2, 3]
```

## Functions

```python
# Default args
def create_model(name: str, temperature: float = 0.7, max_tokens: int = 1000):
    ...

# *args and **kwargs (like ...rest and spread)
def log(*args, **kwargs):
    print(args)    # tuple of positional args
    print(kwargs)  # dict of keyword args

log(1, 2, 3, level="INFO", source="api")
# args = (1, 2, 3)
# kwargs = {"level": "INFO", "source": "api"}

# Unpacking when calling (like spread operator)
def add(a, b, c): return a + b + c
nums = [1, 2, 3]
add(*nums)          # = add(1, 2, 3)
add(**{"a":1, "b":2, "c":3})

# Decorators (like higher-order functions / middleware)
import functools

def retry(max_attempts=3):
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            for attempt in range(max_attempts):
                try:
                    return fn(*args, **kwargs)
                except Exception as e:
                    if attempt == max_attempts - 1:
                        raise
                    print(f"Attempt {attempt+1} failed: {e}")
        return wrapper
    return decorator

@retry(max_attempts=3)
def call_llm(prompt: str) -> str:
    ...
```

## Classes

```python
from dataclasses import dataclass, field
from typing import Optional

# Traditional class
class LLMClient:
    def __init__(self, model: str, temperature: float = 0.7):
        self.model = model
        self.temperature = temperature
        self._client = None  # private by convention (no true private)

    def connect(self):
        self._client = create_connection()

    def chat(self, prompt: str) -> str:
        return self._client.complete(prompt)

    def __repr__(self):   # like toString()
        return f"LLMClient(model={self.model})"

    def __enter__(self):  # context manager protocol
        self.connect()
        return self

    def __exit__(self, *args):
        self._client.close()

# Dataclass — boilerplate-free (like TypeScript interface with defaults)
@dataclass
class Message:
    role: str
    content: str
    timestamp: float = field(default_factory=lambda: time.time())
    metadata: dict = field(default_factory=dict)

msg = Message(role="user", content="Hello")

# Inheritance
class StreamingClient(LLMClient):
    def __init__(self, model: str, chunk_size: int = 10):
        super().__init__(model)
        self.chunk_size = chunk_size
```

## Context Managers

```python
# The `with` statement — auto cleanup (like finally blocks)
with open("data.txt") as f:
    content = f.read()
# file automatically closed

# Custom context manager
from contextlib import contextmanager

@contextmanager
def timer(label: str):
    import time
    start = time.perf_counter()
    try:
        yield
    finally:
        elapsed = time.perf_counter() - start
        print(f"{label}: {elapsed:.3f}s")

with timer("LLM call"):
    result = call_llm("...")
```

## Generators & Iterators

```python
# Generator function — lazy evaluation
def token_stream(text: str):
    for token in tokenize(text):
        yield token  # pauses here, resumes on next()

# Generator expression (like lazy list comprehension)
squares_gen = (x**2 for x in range(1_000_000))  # doesn't compute yet

# Use case: streaming LLM responses
def stream_llm(prompt: str):
    for chunk in client.chat.completions.create(model="gpt-4o", stream=True, messages=[...]):
        if content := chunk.choices[0].delta.content:
            yield content

for token in stream_llm("Hello"):
    print(token, end="", flush=True)
```

## Error Handling

```python
# try/except/else/finally
try:
    result = call_api()
except ValueError as e:
    print(f"Bad input: {e}")
except (TimeoutError, ConnectionError) as e:
    print(f"Network error: {e}")
except Exception as e:
    print(f"Unexpected: {type(e).__name__}: {e}")
    raise  # re-raise
else:
    # runs only if no exception
    process(result)
finally:
    cleanup()

# Custom exceptions
class LLMError(Exception):
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.status_code = status_code

class RateLimitError(LLMError):
    pass

raise RateLimitError("Too many requests", status_code=429)
```

## File I/O

```python
import json
import csv
import pathlib

# JSON
data = json.loads('{"key": "value"}')
text = json.dumps(data, indent=2)

with open("config.json") as f:
    config = json.load(f)

with open("output.json", "w") as f:
    json.dump(data, f, indent=2)

# CSV with pandas (preferred for AI/ML)
import pandas as pd
df = pd.read_csv("data.csv")
df.to_csv("output.csv", index=False)

# Path handling (like Node path module)
from pathlib import Path
p = Path("data/files/doc.txt")
p.parent          # Path("data/files")
p.stem            # "doc"
p.suffix          # ".txt"
p.exists()        # bool
p.mkdir(parents=True, exist_ok=True)
list(p.parent.glob("*.txt"))  # glob files
```

## Environment Variables

```python
import os
from dotenv import load_dotenv

load_dotenv()  # loads .env file

api_key = os.environ["OPENAI_API_KEY"]           # raises if missing
api_key = os.getenv("OPENAI_API_KEY", "default") # safe with default

# python-decouple (type-safe, like zod for env vars)
from decouple import config
DATABASE_URL = config("DATABASE_URL")
DEBUG = config("DEBUG", default=False, cast=bool)
MAX_TOKENS = config("MAX_TOKENS", default=1000, cast=int)
```

## Comprehensions — The Python Superpower

```python
# List comprehension (replaces map/filter)
doubled = [x * 2 for x in range(10)]
evens   = [x for x in range(20) if x % 2 == 0]
pairs   = [(x, y) for x in range(3) for y in range(3)]

# Dict comprehension
word_len = {word: len(word) for word in ["hello", "world"]}
filtered = {k: v for k, v in d.items() if v > 0}

# Set comprehension
unique_chars = {c.lower() for c in "Hello World" if c.isalpha()}

# Generator expression (lazy — use for large data)
total = sum(x**2 for x in range(1_000_000))  # no list created in memory

# Walrus operator := (Python 3.8+, assign inside expression)
if (n := len(data)) > 10:
    print(f"Too many items: {n}")

while chunk := f.read(8192):
    process(chunk)
```

## Useful Standard Library Modules

```python
import os, sys, time, json, re, math, random, hashlib
from pathlib import Path
from collections import defaultdict, Counter, deque, OrderedDict
from itertools import chain, islice, product, combinations
from functools import partial, lru_cache, reduce
from typing import Optional, Union, List, Dict, Any, Callable, Generator
from dataclasses import dataclass, field
from contextlib import contextmanager, suppress
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
import threading, asyncio, multiprocessing
from datetime import datetime, timedelta
import logging

# Collections
from collections import Counter
word_counts = Counter("the quick brown fox the the".split())
word_counts.most_common(3)  # [("the", 3), ...]

from collections import defaultdict
graph = defaultdict(list)
graph["a"].append("b")  # no KeyError if "a" doesn't exist

# lru_cache (memoization)
from functools import lru_cache

@lru_cache(maxsize=128)
def expensive_computation(n: int) -> int:
    return sum(range(n))

# Logging (use instead of print in production)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)
logger.info("Processing %d documents", len(docs))
logger.error("Failed to call LLM: %s", str(e))
```
