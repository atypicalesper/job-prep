# Object-Oriented Programming in Python

## Classes & Objects

A class is a blueprint. An object is an instance of that blueprint with its own state. Class attributes are shared across all instances; instance attributes (set on `self`) are per-object. Python's `__init__` is the initializer (not a constructor — the object already exists by the time `__init__` runs).

```python
class Dog:
    species = "Canis familiaris"   # class attribute — shared by all instances

    def __init__(self, name: str, age: int):
        self.name = name           # instance attribute — unique per object
        self.age = age

    def __str__(self) -> str:      # called by print() — human-readable
        return f"Dog({self.name}, {self.age})"

    def __repr__(self) -> str:     # called by repr() — unambiguous, for devs
        return f"Dog(name={self.name!r}, age={self.age!r})"

d = Dog("Rex", 3)
print(d)          # Dog(Rex, 3)
repr(d)           # Dog(name='Rex', age=3)
```

---

## Dunder (Magic) Methods

Dunder methods (double-underscore) let your class plug into Python's built-in syntax and protocols. Implement `__add__` and `+` works. Implement `__iter__` and your object works in a `for` loop. They're what makes Python's "duck typing" possible — you don't inherit from a list, you just implement the same interface.

```python
class Vector:
    def __init__(self, x, y):
        self.x, self.y = x, y

    def __add__(self, other):         # v1 + v2
        return Vector(self.x + other.x, self.y + other.y)

    def __len__(self):                # len(v)
        return int((self.x**2 + self.y**2) ** 0.5)

    def __eq__(self, other):          # v1 == v2
        return self.x == other.x and self.y == other.y

    def __getitem__(self, idx):       # v[0]
        return (self.x, self.y)[idx]

    def __iter__(self):               # for val in v
        yield self.x
        yield self.y

    def __contains__(self, val):      # 3 in v
        return val in (self.x, self.y)

    def __bool__(self):               # if v:
        return bool(self.x or self.y)

    def __call__(self, scale):        # v(2) — makes instance callable
        return Vector(self.x * scale, self.y * scale)
```

| Dunder | Triggered by |
|---|---|
| `__init__` | `ClassName()` |
| `__str__` | `print()`, `str()` |
| `__repr__` | `repr()`, REPL |
| `__len__` | `len()` |
| `__eq__` | `==` |
| `__lt__`, `__gt__` | `<`, `>` |
| `__add__`, `__mul__` | `+`, `*` |
| `__getitem__` | `obj[key]` |
| `__iter__`, `__next__` | `for` loops |
| `__enter__`, `__exit__` | `with` statement |
| `__call__` | `obj()` |

---

## Encapsulation

Encapsulation means hiding implementation details and controlling access to an object's state. Python doesn't enforce access control at the language level — instead it uses naming conventions. A single underscore `_attr` signals "protected by convention, don't touch from outside". A double underscore `__attr` triggers name-mangling, making it harder (but not impossible) to access from subclasses. Use `@property` to add validation or computed attributes while keeping clean attribute syntax.

```python
class BankAccount:
    def __init__(self, balance: float):
        self._balance = balance       # "protected" — convention only
        self.__pin = "1234"           # name-mangled to _BankAccount__pin

    @property
    def balance(self) -> float:       # getter — accessed like an attribute
        return self._balance

    @balance.setter
    def balance(self, value: float):  # setter — validates before writing
        if value < 0:
            raise ValueError("Balance cannot be negative")
        self._balance = value

acc = BankAccount(1000)
acc.balance        # 1000  (via getter, no parentheses)
acc.balance = 500  # calls setter — validates
acc.__pin          # AttributeError — name was mangled
acc._BankAccount__pin  # "1234" — still reachable, but you shouldn't
```

---

## Abstraction

Abstraction means defining *what* a class must do without specifying *how*. Python's `abc.ABC` + `@abstractmethod` creates an interface contract — any class that inherits must implement all abstract methods or it can't be instantiated. This is how you enforce a consistent API across different implementations (e.g., multiple payment providers, storage backends).

```python
from abc import ABC, abstractmethod

class Shape(ABC):
    @abstractmethod
    def area(self) -> float: ...       # subclass must implement

    @abstractmethod
    def perimeter(self) -> float: ...  # subclass must implement

    def describe(self):                # concrete — available to all subclasses
        return f"Area: {self.area():.2f}"

class Circle(Shape):
    def __init__(self, r): self.r = r
    def area(self): return 3.14159 * self.r ** 2
    def perimeter(self): return 2 * 3.14159 * self.r

Shape()    # TypeError — cannot instantiate abstract class
Circle(5)  # OK — implements all abstract methods
```

---

## Inheritance

Inheritance lets a subclass reuse and extend the behaviour of a parent class. Python supports single and multiple inheritance. With multiple inheritance, Python uses the **MRO (Method Resolution Order)** — C3 linearization — to decide which parent's method to call. Always use `super()` rather than calling the parent class directly, so the MRO is respected.

```python
# Single inheritance
class Animal:
    def __init__(self, name):
        self.name = name

    def speak(self):
        return "..."

class Dog(Animal):
    def speak(self):                    # overrides Animal.speak
        return f"{self.name} says woof"

# super() — calls the next class in the MRO, not necessarily the direct parent
class Cat(Animal):
    def __init__(self, name, indoor):
        super().__init__(name)          # runs Animal.__init__
        self.indoor = indoor

    def speak(self):
        base = super().speak()          # gets Animal's version
        return f"{self.name} meows (was: {base})"

# Multiple inheritance — Python resolves method calls left to right depth-first
class A:
    def hello(self): return "A"

class B(A):
    def hello(self): return "B"

class C(A):
    def hello(self): return "C"

class D(B, C):    # MRO: D → B → C → A → object
    pass

D().hello()       # "B" — B comes before C in MRO
D.__mro__         # (<class 'D'>, <class 'B'>, <class 'C'>, <class 'A'>, <class 'object'>)
```

**MRO (Method Resolution Order)** — Python uses C3 linearization to build a consistent, predictable method lookup chain. Check it with `ClassName.__mro__`.

---

## Polymorphism

Polymorphism means the same call works differently depending on the object. Python achieves this through duck typing — if an object has the right method, it works, regardless of its class. You never need to declare what interface a class implements; you just implement the methods.

```python
# Same method call, different behaviour per type
animals = [Dog("Rex"), Cat("Luna", True)]
for a in animals:
    print(a.speak())   # calls Dog.speak or Cat.speak — decided at runtime

# Duck typing — Robot is unrelated to Animal, but still works
class Robot:
    def speak(self):
        return "beep boop"

def make_speak(entity):   # no type annotation needed — works with anything that has .speak()
    return entity.speak()

make_speak(Dog("Rex"))    # "Rex says woof"
make_speak(Robot())       # "beep boop"

# Type checking when needed
isinstance(Dog("x"), Animal)   # True — is-a relationship
issubclass(Dog, Animal)        # True — class relationship
```

---

## Class Methods & Static Methods

Regular methods receive `self` (the instance). Class methods receive `cls` (the class itself) and can be called on the class without an instance — useful for alternative constructors. Static methods receive neither; they're just namespaced functions attached to the class for organisational clarity.

```python
class User:
    _count = 0

    def __init__(self, name):
        self.name = name
        User._count += 1

    @classmethod
    def get_count(cls):            # cls = User (or subclass if called from one)
        return cls._count

    @classmethod
    def from_dict(cls, data):      # alternative constructor — common pattern
        return cls(data["name"])

    @staticmethod
    def validate_name(name):       # no self or cls — pure utility function
        return len(name) > 0

User.get_count()                   # 0 — called on class, not instance
u = User.from_dict({"name": "Tarun"})
User.validate_name("Tarun")        # True
```

---

## Dataclasses (Modern Python OOP)

Dataclasses (`@dataclass`, Python 3.7+) auto-generate `__init__`, `__repr__`, and `__eq__` from type-annotated fields. They eliminate boilerplate for data-holding classes. Add `frozen=True` for immutability (and a free `__hash__`). Use `field(default_factory=...)` for mutable defaults — never use a bare `[]` or `{}` as a default.

```python
from dataclasses import dataclass, field

@dataclass
class Point:
    x: float
    y: float
    label: str = "origin"
    tags: list = field(default_factory=list)   # correct way to default a mutable

    def distance(self) -> float:
        return (self.x**2 + self.y**2) ** 0.5

p1 = Point(3, 4)
p2 = Point(3, 4)
p1 == p2    # True — __eq__ auto-generated
repr(p1)    # Point(x=3, y=4, label='origin', tags=[])

@dataclass(frozen=True)   # immutable — auto __hash__, usable as dict key
class ImmutablePoint:
    x: float
    y: float
```
