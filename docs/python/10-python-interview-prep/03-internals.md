# Python Internals

## Memory Management

Python uses **reference counting** as primary mechanism + **cyclic garbage collector** for cycles.

```python
import sys

a = [1, 2, 3]
sys.getrefcount(a)   # 2 — one from 'a', one for the getrefcount call

b = a
sys.getrefcount(a)   # 3 — a, b, getrefcount arg

del b
sys.getrefcount(a)   # 2 — back to 2

# When ref count hits 0 → object destroyed immediately
a = None             # [1,2,3] freed (if no other references)
```

**Cyclic GC** handles reference cycles which refcounting alone can't free:

```python
import gc

class Node:
    def __init__(self):
        self.next = None

a = Node()
b = Node()
a.next = b
b.next = a   # cycle — neither reaches 0 naturally

del a, b
gc.collect()  # explicit cycle collection (runs automatically too)
gc.get_count()      # (gen0, gen1, gen2) object counts
gc.disable()        # disable GC (risky — cycles won't be freed)
```

**Generations**: objects promoted through gen0 → gen1 → gen2 as they survive collection cycles. Long-lived objects (module-level, class definitions) sit in gen2.

---

## Stack vs Heap

| | Stack | Heap |
|---|---|---|
| Stores | Function frames, local variable names | All Python objects |
| Managed by | Python interpreter | Python memory allocator + GC |
| Size | Limited | Dynamic |
| Speed | Faster (LIFO) | Slower |

```python
# Every function call pushes a frame onto the call stack
def foo():
    x = 10          # 'x' is name on stack, 10 is object on heap
    return x

# CPython's frame objects live on heap, but logically form a stack
import traceback
traceback.print_stack()   # see call stack
```

**Key insight**: In Python, variables are always *names* (references/pointers) to heap objects — there's no stack-allocated value like in C/Java.

---

## GIL — Global Interpreter Lock

The GIL is a mutex that ensures **only one thread executes Python bytecode at a time** in CPython.

```python
# CPU-bound — GIL hurts, use multiprocessing
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
import time

def cpu_work(n):
    return sum(i**2 for i in range(n))

# Threading — NOT parallel for CPU work (GIL blocks)
with ThreadPoolExecutor(4) as ex:
    results = list(ex.map(cpu_work, [1_000_000]*4))

# Multiprocessing — truly parallel (separate GILs per process)
with ProcessPoolExecutor(4) as ex:
    results = list(ex.map(cpu_work, [1_000_000]*4))

# I/O-bound — GIL released during I/O wait, threading is fine
import urllib.request

def fetch(url):
    return urllib.request.urlopen(url).read()

with ThreadPoolExecutor(10) as ex:   # threads work well here
    pages = list(ex.map(fetch, urls))

# C extensions (NumPy, PyTorch) release the GIL → true parallelism
import numpy as np
# This runs in parallel threads — NumPy releases GIL during C operations
```

**GIL in Python 3.13+**: Python is adding a "no-GIL" build mode (experimental). Watch this space.

---

## Deep Copy vs Shallow Copy

```python
import copy

original = {"name": "Tarun", "scores": [95, 87, 92]}

# Assignment — same object
ref = original
ref["name"] = "X"
print(original["name"])   # "X" — same dict!

# Shallow copy — new container, shared nested objects
shallow = original.copy()          # or copy.copy(original)
shallow = {**original}             # dict spread
shallow = original | {}            # Python 3.9+ merge

shallow["name"] = "Y"             # original unaffected
shallow["scores"].append(100)     # original["scores"] also changed! (shared list)

# Deep copy — fully independent
deep = copy.deepcopy(original)
deep["scores"].append(999)        # original unaffected

# List equivalents
a = [[1, 2], [3, 4]]
shallow = a.copy()
shallow[0].append(99)   # a[0] also changed

deep = copy.deepcopy(a)
deep[0].append(99)      # a unaffected
```

**Interview gotcha**: Default argument mutation

```python
# Bug — mutable default shared across calls
def append_to(item, lst=[]):
    lst.append(item)
    return lst

append_to(1)   # [1]
append_to(2)   # [1, 2] ← surprise! same list

# Fix
def append_to(item, lst=None):
    if lst is None:
        lst = []
    lst.append(item)
    return lst
```

---

## String Interning

```python
# Small integers (-5 to 256) and short strings are cached
a = 256; b = 256
a is b   # True  — same object

a = 257; b = 257
a is b   # False (CPython impl detail)

# String interning
s1 = "hello"
s2 = "hello"
s1 is s2   # True — interned (compile-time constant)

s1 = "hello world!"
s2 = "hello world!"
s1 is s2   # may be False — not always interned

import sys
sys.intern("my_string")  # force interning
```

---

## `__slots__`

```python
# Default: instance dict for every object (flexible but memory-heavy)
class Normal:
    def __init__(self, x, y):
        self.x = x
        self.y = y

# __slots__: no instance dict — lower memory, faster attribute access
class Slotted:
    __slots__ = ("x", "y")

    def __init__(self, x, y):
        self.x = x
        self.y = y

import sys
sys.getsizeof(Normal(1, 2))    # ~48 bytes + dict overhead (~232)
sys.getsizeof(Slotted(1, 2))   # ~56 bytes — no dict

# Downside: can't add arbitrary attributes, no __dict__, no weak refs by default
```
