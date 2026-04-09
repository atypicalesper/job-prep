# Core Python — Basics to Intermediate

## Data Types & Mutability

| Type | Mutable | Notes |
|---|---|---|
| `int`, `float`, `bool`, `str` | No | Immutable — reassignment creates new object |
| `tuple`, `frozenset` | No | Hashable, usable as dict keys |
| `list`, `dict`, `set` | Yes | Changed in-place |

```python
# Immutable — new object on every "change"
a = "hello"
b = a
a += " world"
print(b)  # "hello" — b still points to original

# Mutable — shared reference
a = [1, 2, 3]
b = a
a.append(4)
print(b)  # [1, 2, 3, 4] — same object!

# Safe copy
b = a.copy()       # shallow copy
b = a[:]           # also shallow
import copy
b = copy.deepcopy(a)  # deep copy — fully independent

# id() checks object identity
x = (1, 2)
print(id(x))  # some address
x = x + (3,)  # new tuple created
print(id(x))  # different address
```

---

## LEGB Rule — Variable Scope

Python resolves names in this order: **L**ocal → **E**nclosing → **G**lobal → **B**uilt-in.

```python
x = "global"

def outer():
    x = "enclosing"

    def inner():
        x = "local"
        print(x)      # "local"   (L)

    def inner_no_local():
        print(x)      # "enclosing" (E)

    inner()
    inner_no_local()

outer()
print(x)  # "global" (G)

# Modifying enclosing/global scope
def counter():
    count = 0
    def increment():
        nonlocal count   # modify enclosing
        count += 1
        return count
    return increment

# global keyword
total = 0
def add(n):
    global total
    total += n
```

---

## Truthy & Falsy Values

```python
# Falsy
bool(0)          # False
bool(0.0)        # False
bool("")         # False
bool([])         # False
bool({})         # False
bool(set())      # False
bool(None)       # False
bool(False)      # False

# Truthy — everything else
bool(1)          # True
bool("0")        # True  ← gotcha
bool([0])        # True  ← gotcha — list with one element
bool(" ")        # True  ← space is not empty

# Practical uses
items = []
if not items:          # idiomatic empty-check
    print("empty")

name = input() or "default"   # short-circuit default
```

---

## Functions — All Argument Types

```python
# Positional
def greet(name, greeting):
    return f"{greeting}, {name}!"

# Default values
def greet(name, greeting="Hello"):
    return f"{greeting}, {name}!"

# *args — variable positional (tuple inside function)
def total(*args):
    return sum(args)

total(1, 2, 3)   # 6

# **kwargs — variable keyword (dict inside function)
def show(**kwargs):
    for k, v in kwargs.items():
        print(f"{k} = {v}")

show(name="Tarun", role="backend")

# Combining — order matters: positional → *args → keyword-only → **kwargs
def mixed(a, b, *args, flag=False, **kwargs):
    print(a, b, args, flag, kwargs)

mixed(1, 2, 3, 4, flag=True, x=10)
# a=1, b=2, args=(3,4), flag=True, kwargs={'x':10}

# Keyword-only (after bare *)
def config(*, host, port=8080):
    return f"{host}:{port}"

config(host="localhost")        # OK
config("localhost")             # TypeError

# Positional-only (before /)
def add(x, y, /):
    return x + y

add(1, 2)         # OK
add(x=1, y=2)     # TypeError

# Unpacking at call site
args = [1, 2]
kwargs = {"flag": True}
mixed(*args, **kwargs)
```

---

## Lambda, First-Class Functions & Closures

```python
# Lambda — anonymous, single-expression function
square = lambda x: x ** 2
sort_key = lambda item: item["score"]

items = [{"name": "a", "score": 3}, {"name": "b", "score": 1}]
items.sort(key=lambda x: x["score"])

# First-class: functions are objects
def double(x): return x * 2

fn = double          # assign
funcs = [double]     # store in list
def apply(fn, x):    # pass as argument
    return fn(x)

apply(double, 5)  # 10

# Higher-order function — returns function
def multiplier(n):
    def inner(x):
        return x * n
    return inner

triple = multiplier(3)
triple(4)  # 12

# Closure — inner function captures enclosing scope
def make_counter():
    count = 0
    def increment():
        nonlocal count
        count += 1
        return count
    return increment

c = make_counter()
c()  # 1
c()  # 2
```

---

## Comprehensions

```python
# List
squares = [x**2 for x in range(10) if x % 2 == 0]

# Dict
word_len = {word: len(word) for word in ["hello", "world"]}

# Set
unique = {x % 3 for x in range(10)}

# Generator (lazy — no list built)
total = sum(x**2 for x in range(1_000_000))  # memory efficient

# Nested
matrix = [[i * j for j in range(3)] for i in range(3)]
```

---

## Python vs JavaScript — Quick Ref

| Concept | Python | JavaScript |
|---|---|---|
| Scope | LEGB + `nonlocal`/`global` | Closure + `let`/`var` hoisting |
| Mutability | Baked into type | Everything mutable except primitives |
| Falsy | `0`, `""`, `[]`, `{}`, `None`, `False` | Also `NaN`, `undefined` |
| `==` | Value equality, no coercion | Value + type coercion (`===` is strict) |
| Default args | `def f(x=0)` | `function f(x = 0)` |
| Spread/pack | `*args`, `**kwargs` | `...args` |
| Arrow fn equiv | `lambda x: x*2` | `x => x*2` |
