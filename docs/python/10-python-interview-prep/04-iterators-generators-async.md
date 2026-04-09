# Iterators, Generators & Async

## Iterators Protocol

Any object with `__iter__` + `__next__` is an iterator.

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

A function with `yield` — returns values lazily, suspends execution between yields.

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

Python's async model is **single-threaded cooperative concurrency** — tasks yield control at `await` points.

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
