# Standard Library, Builtins & Concurrency

## map, filter, reduce

`map`, `filter`, and `reduce` are functional programming tools that operate on iterables. `map` applies a function to every element and returns a lazy iterator. `filter` keeps only elements where the function returns truthy. `reduce` folds a sequence down to a single value by repeatedly applying a binary function left-to-right. In modern Python, list comprehensions are usually preferred over `map`/`filter` for readability — but `map` still shines when the function already exists (e.g., `map(str, nums)`), and `reduce` has no direct comprehension equivalent.

```python
from functools import reduce

nums = [1, 2, 3, 4, 5]

# map — apply function to each item → lazy iterator
doubled = list(map(lambda x: x * 2, nums))         # [2, 4, 6, 8, 10]
strs    = list(map(str, nums))                      # ['1','2','3','4','5']

# filter — keep items where function returns True → lazy iterator
evens = list(filter(lambda x: x % 2 == 0, nums))   # [2, 4]
truthy = list(filter(None, [0, 1, "", "a", False])) # [1, 'a']

# reduce — fold list to single value (left to right)
total   = reduce(lambda acc, x: acc + x, nums)      # 15
product = reduce(lambda acc, x: acc * x, nums, 1)   # 120 (initial=1)

# Modern preference: comprehensions are usually cleaner
doubled = [x * 2 for x in nums]
evens   = [x for x in nums if x % 2 == 0]
```

---

## zip & enumerate

`zip` pairs up elements from multiple iterables, stopping at the shortest. It's the idiomatic way to iterate two lists in parallel or to build a dict from two lists. `enumerate` adds an index to any iterable, eliminating the need for a manual counter variable. Both return lazy iterators. Use `itertools.zip_longest` when you need to handle iterables of different lengths without truncating.

```python
names  = ["Alice", "Bob", "Carol"]
scores = [90, 85, 92]

# zip — pair elements from iterables (stops at shortest)
for name, score in zip(names, scores):
    print(f"{name}: {score}")

paired = list(zip(names, scores))     # [('Alice', 90), ...]
as_dict = dict(zip(names, scores))    # {'Alice': 90, ...}

# zip_longest — pads with fillvalue
from itertools import zip_longest
list(zip_longest([1,2,3], [4,5], fillvalue=0))  # [(1,4),(2,5),(3,0)]

# enumerate — index + value
for i, name in enumerate(names):
    print(f"{i}: {name}")

for i, name in enumerate(names, start=1):  # start from 1
    print(f"{i}: {name}")
```

---

## collections

The `collections` module provides specialised container types that cover the most common gaps in the built-in dict, list, and set. `Counter` counts hashable elements and supports arithmetic. `defaultdict` eliminates `KeyError` by providing a factory for missing keys. `deque` is a double-ended queue with O(1) append and pop from both ends — use it instead of a list when you need a queue or sliding window. `namedtuple` gives you a lightweight immutable record with named fields and no overhead compared to a plain tuple.

```python
from collections import Counter, defaultdict, OrderedDict, deque, namedtuple

# Counter — count hashable elements
words = ["apple", "banana", "apple", "cherry", "banana", "apple"]
c = Counter(words)
c["apple"]           # 3
c.most_common(2)     # [('apple', 3), ('banana', 2)]
c + Counter(["apple"])          # combine counts
c - Counter(["apple", "apple"]) # subtract counts

# Counter for string
Counter("abracadabra")   # {'a':5, 'b':2, 'r':2, 'c':1, 'd':1}

# defaultdict — default value for missing keys
dd = defaultdict(list)
dd["fruits"].append("apple")   # no KeyError
dd["fruits"].append("banana")
dict(dd)  # {'fruits': ['apple', 'banana']}

dd = defaultdict(int)
for word in words:
    dd[word] += 1   # no KeyError, defaults to 0

# deque — O(1) append/pop from both ends
dq = deque([1, 2, 3])
dq.appendleft(0)    # [0, 1, 2, 3]
dq.popleft()        # 0 → [1, 2, 3]
dq.rotate(1)        # [3, 1, 2]
dq = deque(maxlen=3)  # auto-evicts oldest when full

# namedtuple — lightweight immutable record
Point = namedtuple("Point", ["x", "y"])
p = Point(3, 4)
p.x        # 3
p._asdict()  # {'x': 3, 'y': 4}
```

---

## itertools

`itertools` is a collection of building blocks for working with iterators in a memory-efficient, composable way. Infinite iterators like `count` and `cycle` produce values forever. Combinatoric iterators like `combinations` and `product` generate all possible groupings without building an intermediate list. `groupby` is powerful but requires sorted input — it groups *consecutive* equal keys, not global ones. Chain these together to build efficient lazy pipelines.

```python
import itertools as it

# Infinite iterators
it.count(10, 2)          # 10, 12, 14, 16, ...
it.cycle([1,2,3])        # 1, 2, 3, 1, 2, 3, ...
it.repeat("x", 3)        # 'x', 'x', 'x'

# Combinatorics
list(it.combinations([1,2,3], 2))      # [(1,2),(1,3),(2,3)]
list(it.permutations([1,2,3], 2))      # [(1,2),(1,3),(2,1),...]
list(it.product([0,1], repeat=3))      # all 3-bit combos

# Grouping/slicing
data = sorted([("a",1),("b",2),("a",3),("b",4)], key=lambda x: x[0])
for key, group in it.groupby(data, key=lambda x: x[0]):
    print(key, list(group))  # a [(a,1),(a,3)]  b [(b,2),(b,4)]

list(it.islice(range(100), 5, 15, 2))  # [5, 7, 9, 11, 13]
list(it.chain([1,2], [3,4], [5]))      # [1, 2, 3, 4, 5]
list(it.chain.from_iterable([[1,2],[3,4]]))  # [1, 2, 3, 4]

# Accumulate
list(it.accumulate([1,2,3,4], lambda acc, x: acc+x))  # [1,3,6,10]
```

---

## Exception Handling

Python's exception model follows a "better to ask forgiveness than permission" (EAFP) style — try the operation, catch the failure. The `else` clause runs only when no exception occurs, which is useful for separating the happy-path code from the error handling. `finally` always runs and is the right place for teardown (though `with` statements handle most cleanup more cleanly). Chain exceptions with `raise X from Y` to preserve the original traceback while wrapping it in a domain error.

```python
# Basic
try:
    result = 10 / 0
except ZeroDivisionError as e:
    print(f"Error: {e}")
except (TypeError, ValueError) as e:
    print(f"Type/Value error: {e}")
except Exception as e:
    print(f"Unexpected: {e}")
    raise   # re-raise
else:
    print("No exception occurred")   # runs if no exception
finally:
    print("Always runs")             # cleanup — runs even on return

# Custom exceptions
class AppError(Exception):
    """Base exception for this app."""

class ValidationError(AppError):
    def __init__(self, field: str, message: str):
        self.field = field
        super().__init__(f"{field}: {message}")

class NotFoundError(AppError):
    def __init__(self, resource: str, id):
        super().__init__(f"{resource} with id={id} not found")

# Raising with chaining
try:
    db.query(...)
except DatabaseError as e:
    raise ServiceError("DB unavailable") from e   # preserves original traceback

# Exception groups (Python 3.11+)
try:
    async with asyncio.TaskGroup() as tg:
        tg.create_task(failing_task())
except* ValueError as eg:
    for exc in eg.exceptions:
        print(exc)
```

**Best practices:**
- Catch specific exceptions, not bare `except:`
- Don't swallow exceptions silently — log or re-raise
- `finally` for resource cleanup (prefer `with` for this)
- Custom exceptions for domain errors

---

## Multithreading & Multiprocessing

Python offers three concurrency primitives: `threading` (OS threads, shared memory, GIL-limited for CPU), `multiprocessing` (separate processes, separate GIL, true parallelism for CPU work), and `asyncio` (single thread, cooperative, best for I/O). `concurrent.futures` provides a unified high-level interface over both threads and processes — prefer it over managing raw threads or processes directly. Shared mutable state between threads requires locks; between processes you need explicit shared memory (`Value`, `Array`) or queues.

```python
import threading
import multiprocessing
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor

# Threading — shared memory, GIL-limited for CPU work
def worker(n):
    print(f"Thread {n}")

t = threading.Thread(target=worker, args=(1,))
t.start()
t.join()

# Thread-safe shared state
lock = threading.Lock()
counter = 0

def safe_increment():
    global counter
    with lock:
        counter += 1

# ThreadPoolExecutor — preferred over raw threads
with ThreadPoolExecutor(max_workers=10) as ex:
    futures = [ex.submit(worker, i) for i in range(10)]
    results = [f.result() for f in futures]

# Multiprocessing — separate processes, true parallelism
def cpu_task(x):
    return x ** 2

with ProcessPoolExecutor(max_workers=4) as ex:
    results = list(ex.map(cpu_task, range(100)))

# Pool — lower level
with multiprocessing.Pool(4) as pool:
    results = pool.map(cpu_task, range(100))

# Shared state between processes (requires explicit shared memory)
from multiprocessing import Value, Array
counter = Value('i', 0)    # shared integer
arr = Array('d', [1.0, 2.0, 3.0])  # shared float array
```

| | `threading` | `multiprocessing` | `asyncio` |
|---|---|---|---|
| GIL | Bound | Free (separate) | N/A |
| Memory | Shared | Separate | Shared |
| Overhead | Low | High (spawn) | Very low |
| Best for | I/O-bound | CPU-bound | I/O-bound |

---

## File I/O & Serialization

Always open files with a `with` statement — it guarantees the file is closed even if an exception occurs. For text files, specify `encoding="utf-8"` explicitly to avoid platform-specific defaults. JSON is the standard format for structured data exchange; `json.dumps`/`json.loads` work with strings, while `json.dump`/`json.load` work with file objects. Pickle can serialise arbitrary Python objects but is Python-specific and unsafe to unpickle from untrusted sources.

```python
# Text files
with open("data.txt", "r", encoding="utf-8") as f:
    content = f.read()          # all at once
    lines   = f.readlines()     # list of lines
    for line in f:              # line by line (lazy)
        process(line.strip())

with open("out.txt", "w") as f:
    f.write("hello\n")
    f.writelines(["a\n", "b\n"])

# JSON
import json

data = {"name": "Tarun", "scores": [95, 87]}
json_str = json.dumps(data, indent=2)          # dict → str
data     = json.loads(json_str)                 # str → dict

with open("data.json", "w") as f:
    json.dump(data, f, indent=2)               # dict → file

with open("data.json") as f:
    data = json.load(f)                         # file → dict

# CSV
import csv

with open("data.csv", "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["name", "score"])
    writer.writeheader()
    writer.writerow({"name": "Tarun", "score": 95})

with open("data.csv") as f:
    reader = csv.DictReader(f)
    rows = list(reader)   # [{'name': 'Tarun', 'score': '95'}]

# Pickle — Python object serialization (binary)
import pickle

data = {"model": [1,2,3], "weights": (0.5, 0.3)}
with open("model.pkl", "wb") as f:
    pickle.dump(data, f)

with open("model.pkl", "rb") as f:
    data = pickle.load(f)

# Warning: only unpickle trusted data — arbitrary code execution risk
```
