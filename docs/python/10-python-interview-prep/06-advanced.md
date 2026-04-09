# Advanced Python

## Decorators

A decorator is a function that takes another function, wraps it with extra behaviour, and returns the wrapper. The `@decorator` syntax is just shorthand for `func = decorator(func)`. Always use `@functools.wraps(func)` inside the wrapper to preserve the original function's `__name__` and `__doc__` — without it, introspection and tooling breaks. Decorators with arguments require an extra level of nesting: a function that returns a decorator that returns a wrapper. Stacking decorators applies them bottom-up.

```python
import functools

# Basic decorator
def log(func):
    @functools.wraps(func)   # preserve __name__, __doc__
    def wrapper(*args, **kwargs):
        print(f"Calling {func.__name__}")
        result = func(*args, **kwargs)
        print(f"Done {func.__name__}")
        return result
    return wrapper

@log
def add(a, b):
    return a + b

add(1, 2)  # "Calling add" → 3 → "Done add"
# equivalent to: add = log(add)

# Decorator with arguments
def retry(times=3, exceptions=(Exception,)):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(times):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    if attempt == times - 1:
                        raise
                    print(f"Retrying ({attempt+1}/{times})...")
        return wrapper
    return decorator

@retry(times=3, exceptions=(ConnectionError,))
def fetch(url):
    ...

# Class decorator
def singleton(cls):
    instances = {}
    @functools.wraps(cls)
    def get_instance(*args, **kwargs):
        if cls not in instances:
            instances[cls] = cls(*args, **kwargs)
        return instances[cls]
    return get_instance

@singleton
class Config:
    def __init__(self):
        self.debug = False

# Stacking decorators (bottom-up application)
@log
@retry(3)
def risky():   # applied as: log(retry(3)(risky))
    ...
```

---

## Context Managers

A context manager is any object that implements `__enter__` and `__exit__`. The `with` statement calls `__enter__` on entry and guarantees `__exit__` is called on exit — even if an exception occurs. `__exit__` receives the exception info; returning `True` suppresses the exception, `False` (or `None`) lets it propagate. The `@contextmanager` decorator from `contextlib` lets you write a context manager as a generator with a single `yield`, eliminating the need for a class entirely.

```python
# Using with — ensures __exit__ runs even on exception
with open("file.txt") as f:
    data = f.read()
# f.close() called automatically

# Custom context manager — class-based
class Timer:
    def __enter__(self):
        import time
        self.start = time.perf_counter()
        return self   # as target

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.elapsed = time.perf_counter() - self.start
        print(f"Elapsed: {self.elapsed:.3f}s")
        return False  # False = don't suppress exceptions

with Timer() as t:
    expensive_operation()
print(t.elapsed)

# Custom context manager — contextlib (simpler)
from contextlib import contextmanager

@contextmanager
def managed_resource(name):
    print(f"Acquiring {name}")
    resource = acquire(name)
    try:
        yield resource         # body of with block runs here
    finally:
        release(resource)      # always runs
        print(f"Released {name}")

with managed_resource("db") as db:
    db.query(...)

# Suppress exceptions
from contextlib import suppress

with suppress(FileNotFoundError):
    os.remove("nonexistent.txt")   # no error raised

# Async context manager
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app):
    await db.connect()
    yield
    await db.disconnect()
```

---

## Metaclasses

A metaclass is the class of a class — it controls how a class itself is created, not how its instances are created. By default, every class is an instance of `type`. You can intercept class creation by subclassing `type` and overriding `__call__` or `__new__`. Real-world uses include ORMs (where field declarations are auto-collected), plugin registries, and validation frameworks. In practice, reach for `__init_subclass__` or class decorators first — they handle most cases with far less complexity.

```python
# type() creates classes dynamically
Dog = type("Dog", (object,), {"sound": "woof", "speak": lambda self: self.sound})
Dog().speak()   # "woof"

# Custom metaclass
class SingletonMeta(type):
    _instances = {}

    def __call__(cls, *args, **kwargs):
        if cls not in cls._instances:
            cls._instances[cls] = super().__call__(*args, **kwargs)
        return cls._instances[cls]

class Database(metaclass=SingletonMeta):
    def __init__(self):
        self.connection = None

db1 = Database()
db2 = Database()
db1 is db2   # True

# __init_subclass__ — lighter alternative for subclass hooks
class Plugin:
    _registry = {}

    def __init_subclass__(cls, name=None, **kwargs):
        super().__init_subclass__(**kwargs)
        if name:
            Plugin._registry[name] = cls

class JSONPlugin(Plugin, name="json"):
    def parse(self, data): ...

Plugin._registry["json"]   # <class 'JSONPlugin'>

# When to use metaclasses:
# - ORMs (Django models auto-register fields)
# - Plugin systems / registries
# - API validation frameworks
# Real-world: use __init_subclass__ or class decorators first — metaclasses are complex
```

---

## Monkey Patching

Monkey patching is replacing or extending a method or attribute on a class or module at runtime. It's occasionally useful in testing (patching out network calls) but dangerous in production — it applies globally, silently, and makes code hard to reason about. The right tool for testing is `unittest.mock.patch`, which restores the original after the `with` block exits. In production, prefer dependency injection over patching.

```python
# Patching a method
class Dog:
    def speak(self):
        return "woof"

def new_speak(self):
    return "WOOF WOOF"

Dog.speak = new_speak       # all instances affected
Dog().speak()   # "WOOF WOOF"

# Patching a module function
import os
original_getcwd = os.getcwd
os.getcwd = lambda: "/fake/path"
os.getcwd()    # "/fake/path"
os.getcwd = original_getcwd  # restore

# The right way: unittest.mock
from unittest.mock import patch, MagicMock

with patch("requests.get") as mock_get:
    mock_get.return_value = MagicMock(status_code=200, json=lambda: {"ok": True})
    result = fetch_data()   # uses mock
```

---

## Modules & Packages

A module is any `.py` file. A package is a directory with an `__init__.py`. When Python imports a module, it runs it top to bottom and caches it in `sys.modules` — subsequent imports return the cached version. The `if __name__ == "__main__"` guard is how you write code that runs only when a file is executed directly, not when it's imported. Relative imports (`.utils`, `..models`) only work inside packages and keep internal structure portable.

```python
# Import variants
import os                       # access as os.path.join
from os import path             # access as path.join
from os.path import join        # access as join
from os import *                # pollutes namespace — avoid
import numpy as np              # alias

# __init__.py makes directory a package
# mypackage/
#   __init__.py     # can be empty or set up public API
#   utils.py
#   models/
#     __init__.py
#     user.py

# __init__.py controls what `from mypackage import *` exposes
__all__ = ["User", "query"]

# Relative imports (within package)
from . import utils             # same package
from ..models import User       # parent package

# __name__ guard
if __name__ == "__main__":
    main()   # only runs when script executed directly, not when imported

# sys.path — where Python looks for modules
import sys
sys.path.append("/custom/path")

# Virtual environments — isolate dependencies
# python -m venv venv
# source venv/bin/activate  (Unix) / venv\Scripts\activate (Windows)
# pip install package
# pip freeze > requirements.txt
# pip install -r requirements.txt
```

---

## Logging (Production Pattern)

Python's `logging` module is the right tool for any output that isn't user-facing. It's hierarchical (loggers inherit from parent loggers), configurable at runtime, and can route to multiple handlers (stdout, file, external service) simultaneously. The critical rule: use `logger = logging.getLogger(__name__)` in every module — this creates a named logger that participates in the hierarchy and can be silenced or configured without touching the module. For production, prefer structured logging (e.g., `structlog`) so log lines are machine-parseable.

```python
import logging
import sys

def setup_logger(name: str, level=logging.INFO) -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(level)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    ))
    logger.addHandler(handler)
    return logger

log = setup_logger(__name__)

log.debug("detailed info")
log.info("normal operation")
log.warning("something unexpected")
log.error("operation failed", exc_info=True)   # includes traceback
log.critical("system down")

# Structured logging (preferred for prod)
import structlog
log = structlog.get_logger()
log.info("request received", method="POST", path="/api/items", user_id=42)
```

---

## Python vs JavaScript — Deeper Comparison

Python and JavaScript are both dynamically typed, garbage-collected, and support async programming — but their execution models differ fundamentally. Node.js runs on an event loop that's always on; Python is synchronous by default and you opt into async with `asyncio`. Python's answer to CPU parallelism is `multiprocessing` (separate processes); Node's is `worker_threads` (shared memory). Python's `self` is explicit and unambiguous; JavaScript's `this` is famously context-dependent. Both now support type annotations — Python via type hints + mypy, JavaScript via TypeScript.

| | Python | JavaScript |
|---|---|---|
| **Runtime model** | Synchronous by default, opt-in async | Event loop always on |
| **Async** | `asyncio` event loop, `async/await` | Built-in event loop, `Promise`/`async-await` |
| **Concurrency** | GIL limits threads; use multiprocessing or asyncio | Single-threaded event loop + Worker threads |
| **Parallelism** | `multiprocessing` (separate processes) | Worker threads (shared memory) |
| **Type system** | Dynamic + optional type hints (mypy) | Dynamic + TypeScript |
| **`null` equiv** | `None` (single null concept) | `null` AND `undefined` |
| **Prototypes** | Class-based only | Prototype chain |
| **Modules** | `import` (CommonJS-like semantics) | ESM or CommonJS |
| **Error handling** | `try/except` | `try/catch` |
| **Hoisting** | No hoisting | `var` and function declarations hoisted |
| **Closures** | Yes — `nonlocal` to mutate | Yes — `let`/`const` captured by ref |
| **`this`** | `self` (explicit, always clear) | `this` (context-dependent, complex) |
| **Package manager** | `pip` + `venv` | `npm`/`yarn`/`pnpm` |

```python
# Python async vs Node event loop — key mental model difference

# Node: event loop runs always, everything is non-blocking by default
# Python: you opt in to async, synchronous code blocks

# Node equivalent of Python asyncio
# Python                         # Node.js equivalent
async def main():                 # async function main() {
    r = await fetch("url")        #   const r = await fetch("url");
    print(r)                      #   console.log(r);
asyncio.run(main())               # } main();

# Python multiprocessing ≈ Node cluster module / worker_threads
# Python threading ≈ Node worker_threads (both share GIL equivalent issues)
# Python asyncio ≈ Node event loop (single thread, concurrent I/O)
```
