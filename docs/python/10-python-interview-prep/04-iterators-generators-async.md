# Iterators, Generators & Async

## Iterators Protocol

An iterator is any object that implements two methods: `__iter__` (returns itself) and `__next__` (returns the next value or raises `StopIteration`). Every `for` loop is syntactic sugar over this protocol — Python calls `iter()` to get an iterator, then calls `next()` repeatedly until `StopIteration` is raised. Understanding this makes it clear why you can iterate over custom classes, files, databases, or any object — as long as it implements the protocol.

```python
# iter() returns iterator, next() advances it
nums = [1, 2, 3]
it = iter(nums)     # list.__iter__() → list_iterator
next(it)            # 1
next(it)            # 2
next(it)            # 3
next(it)            # StopIteration

# for loop is syntactic sugar for:
it = iter(iterable)
while True:
    try:
        item = next(it)
    except StopIteration:
        break

# Custom iterator class
class Countdown:
    def __init__(self, n):
        self.n = n

    def __iter__(self):
        return self          # self is the iterator

    def __next__(self):
        if self.n <= 0:
            raise StopIteration
        self.n -= 1
        return self.n + 1

list(Countdown(3))  # [3, 2, 1]
```

---

## Generator Functions

A generator function uses `yield` instead of `return`. When called, it doesn't execute immediately — it returns a generator object. Each call to `next()` runs the function until the next `yield`, suspends there, and hands the yielded value back to the caller. This makes generators ideal for large sequences you don't want to materialise in memory all at once, or infinite sequences. They can also receive values back via `send()`, enabling coroutine-like two-way communication.

```python
# Generator function
def fibonacci():
    a, b = 0, 1
    while True:
        yield a
        a, b = b, a + b

gen = fibonacci()
next(gen)   # 0
next(gen)   # 1
next(gen)   # 1
next(gen)   # 2

# Finite generator
def range_gen(start, stop, step=1):
    current = start
    while current < stop:
        yield current
        current += step

# Using in for loop (StopIteration caught automatically)
for n in range_gen(0, 10, 2):
    print(n)   # 0 2 4 6 8

# Generator with send() — coroutine-like
def accumulator():
    total = 0
    while True:
        value = yield total   # yield sends total out, receives value in
        total += value

acc = accumulator()
next(acc)        # prime the generator → 0
acc.send(10)     # → 10
acc.send(5)      # → 15
```

---

## Generator Expressions

Generator expressions look like list comprehensions but use parentheses instead of brackets. The key difference is laziness — a list comprehension builds the entire list in memory immediately, while a generator expression produces values one at a time on demand. Use generator expressions whenever you're passing a sequence directly into a function like `sum()`, `max()`, or `any()` — no intermediate list is built, and memory usage stays flat regardless of input size.

```python
# List comprehension — eager, builds full list
squares_list = [x**2 for x in range(1_000_000)]   # 8MB in memory

# Generator expression — lazy, yields one at a time
squares_gen = (x**2 for x in range(1_000_000))    # ~200 bytes

# Use directly in functions that accept iterables
total = sum(x**2 for x in range(1_000_000))
maximum = max(len(line) for line in open("file.txt"))

# Chaining generators — fully lazy pipeline
numbers = range(1_000_000)
evens   = (n for n in numbers if n % 2 == 0)
squared = (n**2 for n in evens)
result  = list(squared)    # only materialized here
```

---

## `yield from`

`yield from` delegates to a sub-generator, transparently passing all values through — including `send()` values and exceptions. Without it you'd need a `for item in subgen: yield item` loop. It's cleaner and also wires up the two-way communication channel so `send()` reaches the inner generator directly. The most common use is recursive delegation, like a tree-flattening function that calls itself.

```python
# Delegating to sub-generator
def flatten(nested):
    for item in nested:
        if isinstance(item, list):
            yield from flatten(item)   # delegate
        else:
            yield item

list(flatten([1, [2, [3, 4]], 5]))   # [1, 2, 3, 4, 5]

# yield from also passes send() and throw() through
```

---

## Async / Await

Python's async model is **single-threaded cooperative concurrency** — tasks yield control at `await` points, allowing other tasks to run while waiting for I/O. An `async def` function is a coroutine — calling it returns a coroutine object, not a result. You need to either `await` it or pass it to `asyncio.run()`. The critical distinction from threads: only one coroutine runs at a time, and it runs until it explicitly yields at an `await`. There's no preemption.

```python
import asyncio

# Coroutine — defined with async def
async def fetch_data(url: str) -> str:
    print(f"Fetching {url}")
    await asyncio.sleep(1)     # yield control — other tasks run here
    return f"data from {url}"

# Running coroutines
asyncio.run(fetch_data("https://api.example.com"))

# Concurrent execution — run multiple at once
async def main():
    # Sequential — 2 seconds total
    r1 = await fetch_data("url1")
    r2 = await fetch_data("url2")

    # Concurrent — 1 second total (both run "simultaneously")
    r1, r2 = await asyncio.gather(
        fetch_data("url1"),
        fetch_data("url2"),
    )

asyncio.run(main())
```

---

## Event Loop

The event loop is the engine that drives async Python. It maintains a queue of tasks and runs them one at a time. When a task hits an `await`, the loop suspends it and picks up the next ready task. When the awaited I/O completes, the loop wakes the suspended task back up. `asyncio.create_task()` schedules a coroutine to run concurrently with the current task, while plain `await` runs it inline and blocks until done.

```python
import asyncio

# Get the current event loop
loop = asyncio.get_event_loop()

# The loop runs tasks — when one awaits, next task runs
async def task(name, delay):
    print(f"{name} started")
    await asyncio.sleep(delay)
    print(f"{name} done")

async def main():
    await asyncio.gather(
        task("A", 2),
        task("B", 1),
    )
    # Output: A started → B started → B done → A done

# Tasks vs coroutines
async def main():
    # Schedule without awaiting immediately
    t1 = asyncio.create_task(task("A", 2))
    t2 = asyncio.create_task(task("B", 1))
    await t1
    await t2

# Timeout
async def with_timeout():
    try:
        result = await asyncio.wait_for(fetch_data("url"), timeout=5.0)
    except asyncio.TimeoutError:
        print("Timed out")
```

---

## Async Patterns

Beyond basic `await`, async Python has `async with` for async context managers (e.g., async HTTP sessions, database connections) and `async for` for async generators (e.g., streaming data). `asyncio.Queue` is the standard producer/consumer primitive — both producer and consumer are coroutines that await the queue rather than blocking a thread.

```python
# Async context manager
async def main():
    async with aiohttp.ClientSession() as session:
        async with session.get("https://api.example.com") as resp:
            data = await resp.json()

# Async generator
async def stream_data():
    for i in range(10):
        await asyncio.sleep(0.1)
        yield i

async def main():
    async for item in stream_data():
        print(item)

# asyncio.Queue — producer/consumer
async def producer(queue):
    for i in range(5):
        await queue.put(i)
        await asyncio.sleep(0.1)

async def consumer(queue):
    while True:
        item = await queue.get()
        print(f"consumed {item}")
        queue.task_done()

async def main():
    q = asyncio.Queue()
    await asyncio.gather(producer(q), consumer(q))
```

---

## Concurrency vs Parallelism

Concurrency means tasks make progress by interleaving — only one runs at a time but they take turns. Parallelism means tasks literally run simultaneously on different CPU cores. Python's GIL makes true parallelism impossible within a single process for pure Python code, which is why CPU-bound work needs `multiprocessing`. For I/O-bound work the distinction barely matters — `asyncio` is fastest (lowest overhead), threading works fine, and multiprocessing is overkill.

| | Concurrency | Parallelism |
|---|---|---|
| Definition | Tasks make progress by interleaving | Tasks run simultaneously |
| Python tool | `asyncio`, `threading` | `multiprocessing` |
| GIL | Still applies | Each process has its own GIL |
| Best for | I/O-bound | CPU-bound |
| Overhead | Low | High (process spawn) |

```python
# I/O-bound: async is fastest (no thread overhead)
# 1000 HTTP requests:

# asyncio — best
async def fetch_all(urls):
    async with aiohttp.ClientSession() as s:
        return await asyncio.gather(*[s.get(u) for u in urls])

# threading — OK
from concurrent.futures import ThreadPoolExecutor
with ThreadPoolExecutor(50) as ex:
    results = list(ex.map(requests.get, urls))

# multiprocessing — overkill for I/O
from concurrent.futures import ProcessPoolExecutor
with ProcessPoolExecutor(4) as ex:
    results = list(ex.map(requests.get, urls))  # slow — spawn overhead

# CPU-bound: multiprocessing only true parallel option
def crunch(data):
    return sum(x**2 for x in data)

with ProcessPoolExecutor() as ex:
    results = list(ex.map(crunch, chunks))
```
