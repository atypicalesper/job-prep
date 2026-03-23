# Async Python for AI — asyncio Deep Dive

## Why Async Matters for AI

LLM API calls are I/O-bound (waiting for network). Sync code wastes that wait time:

```python
# Sync — sequential, slow (100 prompts × 2s each = 200s)
results = [call_llm(prompt) for prompt in prompts]

# Async — concurrent (100 prompts × 2s each, all in parallel ≈ 2s)
results = await asyncio.gather(*[async_call_llm(p) for p in prompts])
```

---

## asyncio Fundamentals

```python
import asyncio

# Coroutine — defined with async def, doesn't run until awaited
async def fetch_data() -> str:
    await asyncio.sleep(1)  # non-blocking sleep (like setTimeout)
    return "result"

# Run a coroutine (entry point)
result = asyncio.run(fetch_data())  # Python 3.7+

# await — suspend current coroutine, let event loop run others
async def main():
    data = await fetch_data()   # suspends main, resumes when done
    print(data)

# Tasks — schedule a coroutine to run concurrently
async def main():
    task1 = asyncio.create_task(fetch_data())  # starts immediately
    task2 = asyncio.create_task(fetch_data())  # starts immediately
    result1 = await task1
    result2 = await task2
```

---

## gather vs create_task vs wait

```python
import asyncio

# gather — run all, return all results in order (like Promise.all)
results = await asyncio.gather(
    call_llm("prompt 1"),
    call_llm("prompt 2"),
    call_llm("prompt 3"),
)
# Returns [result1, result2, result3] in original order

# gather with return_exceptions=True (don't fail on partial errors)
results = await asyncio.gather(
    call_llm("prompt 1"),
    call_llm("bad prompt"),  # might raise
    call_llm("prompt 3"),
    return_exceptions=True,
)
# results = ["answer1", RateLimitError(...), "answer3"]
for r in results:
    if isinstance(r, Exception):
        print(f"Failed: {r}")
    else:
        print(f"Success: {r}")

# wait — more control over done/pending sets
done, pending = await asyncio.wait(
    [asyncio.create_task(call_llm(p)) for p in prompts],
    timeout=30,                           # overall timeout
    return_when=asyncio.FIRST_COMPLETED,  # or ALL_COMPLETED, FIRST_EXCEPTION
)

# as_completed — process results as they arrive (fastest response first)
tasks = [asyncio.create_task(call_llm(p)) for p in prompts]
async for coro in asyncio.as_completed(tasks):
    result = await coro
    process_immediately(result)  # don't wait for all to finish
```

---

## Semaphore — Rate Limiting Concurrent LLM Calls

```python
import asyncio
from openai import AsyncOpenAI

async_client = AsyncOpenAI()

# Without semaphore — all 1000 calls fire simultaneously → rate limit errors
# With semaphore — max 10 concurrent at any time
sem = asyncio.Semaphore(10)

async def safe_llm_call(prompt: str) -> str:
    async with sem:  # acquire on enter, release on exit (even if exception)
        response = await async_client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}]
        )
        return response.choices[0].message.content

async def process_all(prompts: list[str]) -> list[str]:
    tasks = [safe_llm_call(p) for p in prompts]
    return await asyncio.gather(*tasks)

results = asyncio.run(process_all(prompts))
```

---

## Retry with Backoff (Async)

```python
import asyncio
import random
from openai import RateLimitError

async def with_retry(coro_fn, *args, max_retries=3, **kwargs):
    """Retry a coroutine with exponential backoff."""
    for attempt in range(max_retries):
        try:
            return await coro_fn(*args, **kwargs)
        except RateLimitError as e:
            if attempt == max_retries - 1:
                raise
            wait = (2 ** attempt) + random.uniform(0, 1)
            print(f"Rate limited, waiting {wait:.1f}s...")
            await asyncio.sleep(wait)
        except asyncio.TimeoutError:
            if attempt == max_retries - 1:
                raise
            await asyncio.sleep(2 ** attempt)

# Usage
result = await with_retry(async_client.chat.completions.create,
    model="gpt-4o",
    messages=[{"role": "user", "content": prompt}]
)
```

---

## Async Generators — Token Streaming

```python
from typing import AsyncGenerator

async def stream_llm(prompt: str) -> AsyncGenerator[str, None]:
    async with async_client.chat.completions.stream(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}]
    ) as stream:
        async for chunk in stream:
            content = chunk.choices[0].delta.content
            if content:
                yield content

# Consume the async generator
async def main():
    full_response = ""
    async for token in stream_llm("Tell me about Python"):
        print(token, end="", flush=True)
        full_response += token
    print()
    return full_response

# Collect all tokens
async def collect_stream(prompt: str) -> str:
    return "".join([token async for token in stream_llm(prompt)])
```

---

## Async Context Managers

```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def managed_connection(url: str):
    conn = await create_connection(url)
    try:
        yield conn
    finally:
        await conn.close()

async def main():
    async with managed_connection("postgresql://...") as conn:
        result = await conn.fetch("SELECT * FROM docs")

# Multiple async context managers
async with (
    managed_connection("db://...") as db,
    aiohttp.ClientSession() as session,
):
    # both available here
    ...
```

---

## Async Queue — Pipeline Pattern

```python
import asyncio

async def producer(queue: asyncio.Queue, items: list):
    """Put items into the queue."""
    for item in items:
        await queue.put(item)
    # Signal consumers to stop
    await queue.put(None)

async def consumer(queue: asyncio.Queue, results: list, worker_id: int):
    """Process items from the queue."""
    while True:
        item = await queue.get()
        if item is None:
            await queue.put(None)  # pass poison pill to next consumer
            break
        result = await call_llm(item)
        results.append(result)
        queue.task_done()

async def pipeline(prompts: list[str], num_workers: int = 5) -> list[str]:
    queue = asyncio.Queue(maxsize=10)  # backpressure: max 10 items buffered
    results = []

    # Start workers
    workers = [asyncio.create_task(consumer(queue, results, i)) for i in range(num_workers)]
    await producer(queue, prompts)

    await asyncio.gather(*workers)
    return results
```

---

## Combining Async + ThreadPoolExecutor (for CPU-bound / sync libs)

```python
import asyncio
from concurrent.futures import ThreadPoolExecutor

executor = ThreadPoolExecutor(max_workers=4)

async def run_sync_in_thread(sync_fn, *args):
    """Run a blocking function without blocking the event loop."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, sync_fn, *args)

# Use case: embedding with sentence-transformers (sync, CPU-bound)
from sentence_transformers import SentenceTransformer
model = SentenceTransformer("BAAI/bge-small-en-v1.5")

async def embed_async(texts: list[str]) -> list:
    # model.encode is blocking — run in thread pool so we don't block the event loop
    return await run_in_executor(None, model.encode, texts)

# Use case: pandas operations in async FastAPI route
async def process_data(df_path: str) -> dict:
    import pandas as pd
    def sync_work():
        df = pd.read_csv(df_path)
        return df.describe().to_dict()
    return await run_sync_in_thread(sync_work)
```

---

## Timeouts

```python
import asyncio

# Per-call timeout
async def call_with_timeout(prompt: str, timeout: float = 30) -> str:
    try:
        return await asyncio.wait_for(call_llm(prompt), timeout=timeout)
    except asyncio.TimeoutError:
        raise TimeoutError(f"LLM call timed out after {timeout}s")

# Timeout for a group
async def batch_with_timeout(prompts: list[str]) -> list[str | None]:
    async def safe_call(p: str):
        try:
            return await asyncio.wait_for(call_llm(p), timeout=20)
        except asyncio.TimeoutError:
            return None  # return None instead of raising

    return await asyncio.gather(*[safe_call(p) for p in prompts])
```

---

## Interview Q&A

**Q: What's the difference between `asyncio.gather` and `asyncio.create_task`?**

`create_task` schedules a coroutine to run and returns a Task immediately — the coroutine starts running on the next event loop iteration. `gather` takes multiple coroutines or Tasks, schedules them all, and waits for all to complete, returning results in order. Use `create_task` when you need the task object (to cancel, check status). Use `gather` when you just want results from multiple concurrent operations.

**Q: Why doesn't `async def` with `asyncio` use multiple CPU cores?**

Python's GIL (Global Interpreter Lock) prevents true parallelism for CPU-bound work. asyncio is single-threaded — the event loop runs one coroutine at a time, switching between them at `await` points. This is great for I/O-bound tasks (LLM calls, HTTP requests, DB queries) but won't speed up CPU-bound work (matrix math, image processing). For CPU parallelism: use `multiprocessing` or `ProcessPoolExecutor`.

**Q: How do you prevent the event loop from being blocked by a synchronous library like scikit-learn?**

Use `loop.run_in_executor(executor, sync_fn, *args)` with a `ThreadPoolExecutor` (for I/O-bound sync code) or `ProcessPoolExecutor` (for CPU-bound). This runs the synchronous function in a separate thread/process without blocking the event loop. The calling coroutine awaits the result transparently.

**Q: What is a Semaphore and when would you use it with LLM APIs?**

`asyncio.Semaphore(n)` limits the number of concurrent coroutines in a section to `n`. Use it to prevent hitting API rate limits: if you have 1000 prompts and fire them all as tasks simultaneously, you'll get rate limit errors. With `async with sem:`, only `n` calls are active at any moment — others wait. This also prevents overwhelming downstream services with too many connections at once.
