# Core Python — Basics to Intermediate

## Data Types & Mutability

Every Python object is either mutable (can be changed in place) or immutable (any "change" creates a new object). This matters because mutable objects passed into functions can be modified by the callee — something that catches many devs off guard when coming from JavaScript, where primitives are copied but objects are referenced.

| Type | Mutable | Notes |
|---|---|---|
| `int`, `float`, `bool`, `str` | No | Reassignment creates a new object |
| `tuple`, `frozenset` | No | Hashable — safe to use as dict keys |
| `list`, `dict`, `set` | Yes | Changed in-place; assignments share the reference |

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

When Python sees a name, it searches four scopes in order — **L**ocal → **E**nclosing (outer function) → **G**lobal (module level) → **B**uilt-in (e.g. `len`, `print`). It uses the first match it finds. By default you can *read* from any outer scope, but you need `nonlocal` or `global` to *write* to one.

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

# Modifying enclosing scope — requires nonlocal
def counter():
    count = 0
    def increment():
        nonlocal count
        count += 1
        return count
    return increment

# Modifying global scope — requires global
total = 0
def add(n):
    global total
    total += n
```

---

## Truthy & Falsy Values

Python evaluates any object in a boolean context — useful for idiomatic empty checks and short-circuit defaults. The rule is simple: empty containers, zero values, `None`, and `False` are falsy. Everything else is truthy. The gotchas are `"0"` (non-empty string → truthy) and `[0]` (list with one item → truthy).

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
bool("0")        # True  ← gotcha — non-empty string
bool([0])        # True  ← gotcha — list with one element
bool(" ")        # True  ← a space is not an empty string

# Idiomatic uses
items = []
if not items:               # cleaner than: if len(items) == 0
    print("empty")

name = input() or "default"  # short-circuit fallback
```

---

## Functions — All Argument Types

Python's argument system is unusually rich. You can define required positional args, defaults, variadic `*args` (collected into a tuple), keyword-only args (after `*`), positional-only args (before `/`), and variadic `**kwargs` (collected into a dict). The interview trap is the order: `positional → *args → keyword-only → **kwargs`. Also watch out for mutable default argument bugs.

```python
# Positional + default
def greet(name, greeting="Hello"):
    return f"{greeting}, {name}!"

# *args — variable positional (arrives as tuple)
def total(*args):
    return sum(args)

total(1, 2, 3)   # 6

# **kwargs — variable keyword (arrives as dict)
def show(**kwargs):
    for k, v in kwargs.items():
        print(f"{k} = {v}")

show(name="Tarun", role="backend")

# Combining all types — order matters
def mixed(a, b, *args, flag=False, **kwargs):
    print(a, b, args, flag, kwargs)

mixed(1, 2, 3, 4, flag=True, x=10)
# a=1, b=2, args=(3,4), flag=True, kwargs={'x':10}

# Keyword-only (after bare *) — must be passed by name
def config(*, host, port=8080):
    return f"{host}:{port}"

config(host="localhost")        # OK
config("localhost")             # TypeError

# Positional-only (before /) — Python 3.8+
def add(x, y, /):
    return x + y

add(1, 2)         # OK
add(x=1, y=2)     # TypeError

# Unpacking at call site
args   = [1, 2]
kwargs = {"flag": True}
mixed(*args, **kwargs)
```

---

## Lambda, First-Class Functions & Closures

In Python, functions are first-class objects — you can assign them to variables, store them in lists, and pass or return them. A lambda is just a shorthand for a simple anonymous function. A closure is an inner function that "closes over" variables from its enclosing scope, keeping them alive even after the outer function returns.

```python
# Lambda — anonymous single-expression function
square   = lambda x: x ** 2
sort_key = lambda item: item["score"]

items = [{"name": "a", "score": 3}, {"name": "b", "score": 1}]
items.sort(key=lambda x: x["score"])

# First-class: functions are objects
def double(x): return x * 2

fn    = double          # assign to variable
funcs = [double]        # store in list
def apply(fn, x):       # pass as argument
    return fn(x)

apply(double, 5)  # 10

# Higher-order function — returns a function
def multiplier(n):
    def inner(x):
        return x * n
    return inner

triple = multiplier(3)
triple(4)  # 12

# Closure — inner function remembers its enclosing scope
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
# c's `count` is independent from any other counter's `count`
```

---

## Comprehensions

Comprehensions are the Pythonic way to build collections from iterables — more readable than `map`/`filter` and often faster than explicit loops. Generator expressions look identical but use `()` and are lazy — no list is built in memory, values are produced one at a time.

```python
# List comprehension
squares = [x**2 for x in range(10) if x % 2 == 0]

# Dict comprehension
word_len = {word: len(word) for word in ["hello", "world"]}

# Set comprehension
unique = {x % 3 for x in range(10)}

# Generator expression — lazy, memory efficient
total = sum(x**2 for x in range(1_000_000))  # never builds a list

# Nested — reads left to right like nested for loops
matrix = [[i * j for j in range(3)] for i in range(3)]
```

---

## Python vs JavaScript — Quick Ref

| Concept | Python | JavaScript |
|---|---|---|
| Scope | LEGB + `nonlocal`/`global` | Closure + `let`/`var` hoisting |
| Mutability | Baked into the type | Everything mutable except primitives |
| Falsy | `0`, `""`, `[]`, `{}`, `None`, `False` | Same + `NaN`, `undefined` |
| `==` | Value equality, no coercion | Value + type coercion (`===` is strict) |
| Default args | `def f(x=0)` | `function f(x = 0)` |
| Spread/pack | `*args`, `**kwargs` | `...args` |
| Arrow fn equiv | `lambda x: x*2` | `x => x*2` |
