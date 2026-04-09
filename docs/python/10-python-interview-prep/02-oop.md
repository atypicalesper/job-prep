# Object-Oriented Programming in Python

## Classes & Objects

```python
class Dog:
    species = "Canis familiaris"   # class attribute (shared)

    def __init__(self, name: str, age: int):
        self.name = name           # instance attribute
        self.age = age

    def __str__(self) -> str:      # print(dog) → human-readable
        return f"Dog({self.name}, {self.age})"

    def __repr__(self) -> str:     # repr(dog) → unambiguous, for devs
        return f"Dog(name={self.name!r}, age={self.age!r})"

d = Dog("Rex", 3)
print(d)          # Dog(Rex, 3)
repr(d)           # Dog(name='Rex', age=3)
```

---

## Dunder (Magic) Methods

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

    def __call__(self, scale):        # v(2) → scale vector
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

```python
class BankAccount:
    def __init__(self, balance: float):
        self._balance = balance       # convention: "protected" (1 underscore)
        self.__pin = "1234"           # name-mangled: "private" (2 underscores)

    @property
    def balance(self) -> float:       # getter
        return self._balance

    @balance.setter
    def balance(self, value: float):  # setter with validation
        if value < 0:
            raise ValueError("Balance cannot be negative")
        self._balance = value

acc = BankAccount(1000)
acc.balance        # 1000  (via getter)
acc.balance = 500  # calls setter
acc.__pin          # AttributeError — name-mangled to _BankAccount__pin
acc._BankAccount__pin  # "1234" — accessible but convention says don't
```

---

## Abstraction

```python
from abc import ABC, abstractmethod

class Shape(ABC):
    @abstractmethod
    def area(self) -> float: ...

    @abstractmethod
    def perimeter(self) -> float: ...

    def describe(self):               # concrete method
        return f"Area: {self.area():.2f}"

class Circle(Shape):
    def __init__(self, r): self.r = r
    def area(self): return 3.14159 * self.r ** 2
    def perimeter(self): return 2 * 3.14159 * self.r

Shape()    # TypeError — can't instantiate abstract class
Circle(5)  # OK
```

---

## Inheritance

```python
# Single
class Animal:
    def __init__(self, name):
        self.name = name

    def speak(self):
        return "..."

class Dog(Animal):
    def speak(self):                    # method override
        return f"{self.name} says woof"

    def fetch(self):
        return "fetching!"

# super() — call parent method
class Cat(Animal):
    def __init__(self, name, indoor):
        super().__init__(name)          # call Animal.__init__
        self.indoor = indoor

    def speak(self):
        parent_sound = super().speak()  # call Animal.speak
        return f"{self.name} meows (parent: {parent_sound})"

# Multiple inheritance
class A:
    def hello(self): return "A"

class B(A):
    def hello(self): return "B"

class C(A):
    def hello(self): return "C"

class D(B, C):    # MRO: D → B → C → A
    pass

D().hello()       # "B" — follows MRO
D.__mro__         # (<class 'D'>, <class 'B'>, <class 'C'>, <class 'A'>, <class 'object'>)
```

**MRO (Method Resolution Order)** — Python uses C3 linearization. `ClassName.__mro__` shows the lookup chain.

---

## Polymorphism

```python
# Same interface, different behavior
animals = [Dog("Rex"), Cat("Luna", True)]
for a in animals:
    print(a.speak())   # each calls its own speak()

# Duck typing — no explicit interface needed
class Robot:
    def speak(self):
        return "beep boop"

def make_speak(entity):   # works with anything that has .speak()
    return entity.speak()

make_speak(Dog("Rex"))    # "Rex says woof"
make_speak(Robot())       # "beep boop"

# isinstance / issubclass checks
isinstance(Dog("x"), Animal)   # True
issubclass(Dog, Animal)        # True
```

---

## Class Methods & Static Methods

```python
class User:
    _count = 0

    def __init__(self, name):
        self.name = name
        User._count += 1

    @classmethod
    def get_count(cls):          # receives class, not instance
        return cls._count

    @classmethod
    def from_dict(cls, data):    # alternative constructor pattern
        return cls(data["name"])

    @staticmethod
    def validate_name(name):     # no self or cls — pure utility
        return len(name) > 0

User.get_count()                 # 0
u = User.from_dict({"name": "Tarun"})
User.validate_name("Tarun")     # True
```

---

## Dataclasses (Modern Python OOP)

```python
from dataclasses import dataclass, field

@dataclass
class Point:
    x: float
    y: float
    label: str = "origin"
    tags: list = field(default_factory=list)   # mutable default

    def distance(self) -> float:
        return (self.x**2 + self.y**2) ** 0.5

p1 = Point(3, 4)
p2 = Point(3, 4)
p1 == p2    # True — auto __eq__
repr(p1)    # Point(x=3, y=4, label='origin', tags=[])

@dataclass(frozen=True)   # immutable — auto __hash__
class ImmutablePoint:
    x: float
    y: float
```
