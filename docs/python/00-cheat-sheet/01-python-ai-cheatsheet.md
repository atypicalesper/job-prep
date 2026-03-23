# Python for AI — Quick Reference Cheat Sheet

## Python vs JavaScript — Key Differences for JS Devs

```python
# Variables — no let/const, just assign
name = "Tarun"
count = 0

# Types — dynamic like JS, but no coercion surprises
type(42)        # int
type(42.0)      # float
type("hello")   # str
type(True)      # bool (capital!)
type([1,2,3])   # list  (like Array)
type({"a":1})   # dict  (like Object)
type((1,2))     # tuple (immutable list)
type({1,2,3})   # set

# None (not null/undefined)
x = None
x is None       # True (use `is`, not `==`)

# String formatting
name = "Tarun"
f"Hello {name}"            # f-string (like template literals)
f"Score: {score:.2f}"      # format floats
f"Value: {2**10:,}"        # 1,024

# Truthy/Falsy — same concept, cleaner
# Falsy: None, False, 0, 0.0, "", [], {}, set()
# No implicit coercion: 1 + "1" raises TypeError

# Functions
def greet(name: str, greeting: str = "Hello") -> str:
    return f"{greeting}, {name}!"

# Lambda (arrow function equivalent)
square = lambda x: x ** 2
double = lambda x: x * 2

# Unpacking (like destructuring)
a, b, c = [1, 2, 3]
first, *rest = [1, 2, 3, 4]  # rest = [2, 3, 4]
x, y = y, x  # swap (no temp variable needed)
```

## Core Data Structures

```python
# List (Array) — ordered, mutable
nums = [1, 2, 3]
nums.append(4)          # push
nums.pop()              # pop last
nums.pop(0)             # pop first
nums.insert(0, 0)       # insert at index
nums[1:3]               # slice [2, 3]
nums[-1]                # last element
nums[::-1]              # reverse

# List comprehension (the Python superpower)
squares = [x**2 for x in range(10)]
evens   = [x for x in range(20) if x % 2 == 0]
flat    = [n for row in matrix for n in row]

# Dict (Object)
person = {"name": "Tarun", "age": 28}
person.get("email", "default")   # safe access
person.items()                   # [(k,v), ...]
person.keys()                    # dict_keys
{k: v*2 for k,v in d.items()}   # dict comprehension

# Tuple — immutable, hashable (can be dict key or set element)
point = (3, 4)
x, y = point

# Set — unique values, O(1) lookup
seen = set()
seen.add(1)
1 in seen  # True
s1 & s2    # intersection
s1 | s2    # union
s1 - s2    # difference
```

## NumPy Quick Reference

```python
import numpy as np

a = np.array([1, 2, 3])
m = np.array([[1,2],[3,4]])

# Creation
np.zeros((3, 4))          # 3×4 zeros
np.ones((2, 3))           # 2×3 ones
np.eye(3)                 # 3×3 identity
np.arange(0, 10, 2)       # [0,2,4,6,8]
np.linspace(0, 1, 5)      # 5 evenly spaced 0→1
np.random.randn(3, 4)     # standard normal

# Shape
a.shape     # (3,)
m.shape     # (2, 2)
m.reshape(4, 1)
m.flatten()
np.expand_dims(a, axis=0)  # (1, 3)

# Math — all vectorized (no loops needed)
a + 1        # [2, 3, 4]
a * 2        # [2, 4, 6]
a ** 2       # [1, 4, 9]
np.sqrt(a)
np.log(a)
np.exp(a)
a @ b        # matrix multiplication (dot product)
a.T          # transpose

# Aggregation
a.sum(); a.mean(); a.std(); a.min(); a.max()
m.sum(axis=0)   # column sums
m.sum(axis=1)   # row sums

# Indexing / masking
m[0, 1]          # row 0, col 1
m[:, 1]          # all rows, col 1
mask = a > 2
a[mask]          # elements where condition is True
```

## Pandas Quick Reference

```python
import pandas as pd

df = pd.read_csv("data.csv")
df.shape           # (rows, cols)
df.head(5)         # first 5 rows
df.info()          # dtypes + nulls
df.describe()      # stats summary
df.dtypes

# Selection
df["col"]                   # Series
df[["col1","col2"]]         # DataFrame
df.iloc[0]                  # first row by position
df.loc[0, "col"]            # by label
df[df["age"] > 25]          # filter rows
df.query("age > 25 and city == 'Delhi'")

# Cleaning
df.isnull().sum()            # null counts per column
df.dropna()                  # drop rows with any null
df.fillna(0)                 # fill nulls with 0
df.fillna(df.mean())         # fill with column means
df.drop_duplicates()
df.rename(columns={"old": "new"})
df["col"].astype(float)

# Transform
df["new_col"] = df["a"] + df["b"]
df.apply(lambda row: row["a"] * 2, axis=1)
pd.get_dummies(df["category"])  # one-hot encode

# Groupby + agg
df.groupby("city")["salary"].mean()
df.groupby("city").agg({"salary": "mean", "age": "max"})

# Merge / Join
pd.merge(df1, df2, on="user_id", how="left")
df1.join(df2, how="inner")
pd.concat([df1, df2], axis=0)   # stack rows
```

## scikit-learn Quick Reference

```python
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report
from sklearn.pipeline import Pipeline

# Split
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# Pipeline (preprocessing + model)
pipe = Pipeline([
    ("scaler", StandardScaler()),
    ("model", LogisticRegression(max_iter=1000))
])
pipe.fit(X_train, y_train)
y_pred = pipe.predict(X_test)
print(classification_report(y_test, y_pred))

# Cross-validation
from sklearn.model_selection import cross_val_score
scores = cross_val_score(pipe, X, y, cv=5, scoring="accuracy")
print(f"CV accuracy: {scores.mean():.3f} ± {scores.std():.3f}")
```

## OpenAI SDK Quick Reference

```python
from openai import OpenAI
client = OpenAI()   # reads OPENAI_API_KEY from env

# Chat
resp = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user",   "content": "Explain RAG in one sentence."}
    ],
    temperature=0.7, max_tokens=200
)
print(resp.choices[0].message.content)

# Streaming
with client.chat.completions.stream(model="gpt-4o", messages=[...]) as stream:
    for chunk in stream:
        print(chunk.choices[0].delta.content or "", end="", flush=True)

# Embeddings
emb = client.embeddings.create(model="text-embedding-3-small", input="text")
vector = emb.data[0].embedding  # list of 1536 floats

# Function calling
tools = [{"type":"function","function":{"name":"get_weather","description":"...","parameters":{...}}}]
resp = client.chat.completions.create(model="gpt-4o", messages=[...], tools=tools)
tool_call = resp.choices[0].message.tool_calls[0]
```

## FastAPI Quick Reference

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import asyncio

app = FastAPI()

class QueryRequest(BaseModel):
    question: str
    temperature: float = 0.7

@app.post("/ask")
async def ask(req: QueryRequest):
    result = await llm_call(req.question, req.temperature)
    return {"answer": result}

# SSE streaming
from fastapi.responses import StreamingResponse

@app.post("/stream")
async def stream(req: QueryRequest):
    async def generate():
        async for chunk in llm_stream(req.question):
            yield f"data: {chunk}\n\n"
    return StreamingResponse(generate(), media_type="text/event-stream")
```

## Async Python Quick Reference

```python
import asyncio

# Basic async/await
async def fetch_data():
    await asyncio.sleep(1)
    return "data"

asyncio.run(fetch_data())

# Parallel — gather (like Promise.all)
results = await asyncio.gather(fetch_a(), fetch_b(), fetch_c())

# Semaphore — rate limiting concurrent calls
sem = asyncio.Semaphore(5)
async def limited(url):
    async with sem:
        return await fetch(url)

# Run many tasks with limit
tasks = [limited(url) for url in urls]
results = await asyncio.gather(*tasks)
```
