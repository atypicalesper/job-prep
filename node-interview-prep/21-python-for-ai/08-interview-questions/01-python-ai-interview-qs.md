# Python for AI — Interview Questions

## Python Fundamentals (AI Context)

**Q: What is the GIL and how does it affect AI/ML workloads?**

The Global Interpreter Lock is a mutex in CPython that allows only one thread to execute Python bytecode at a time. For CPU-bound ML code (NumPy, PyTorch), the GIL doesn't matter — NumPy/PyTorch release the GIL during C/CUDA operations, so they run in true parallel. For pure Python code (data preprocessing loops), threading is limited — use `multiprocessing` instead. For I/O-bound work (LLM API calls), `asyncio` or threading works fine since threads yield the GIL while waiting for network.

```python
# GIL doesn't affect NumPy (NumPy releases GIL for C operations)
import numpy as np
from concurrent.futures import ThreadPoolExecutor

def compute(arr):
    return np.sum(arr ** 2)  # releases GIL during this

# These truly run in parallel:
with ThreadPoolExecutor(max_workers=4) as exe:
    results = list(exe.map(compute, [np.random.randn(10_000) for _ in range(4)]))

# Pure Python loops — GIL is a bottleneck, use multiprocessing
from concurrent.futures import ProcessPoolExecutor
with ProcessPoolExecutor(max_workers=4) as exe:
    results = list(exe.map(slow_python_fn, data))
```

---

**Q: Write a Python function to chunk a list of documents for RAG — fixed size with overlap.**

```python
def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    """Split text into overlapping chunks of roughly `chunk_size` characters."""
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i : i + chunk_size])
        chunks.append(chunk)
        i += chunk_size - overlap  # step back by overlap amount
    return chunks

# Sentence-aware version (don't split mid-sentence)
import re
def chunk_sentences(text: str, max_chars: int = 500, overlap_sentences: int = 1) -> list[str]:
    sentences = re.split(r'(?<=[.!?])\s+', text)
    chunks = []
    current = []
    current_len = 0
    for sent in sentences:
        if current_len + len(sent) > max_chars and current:
            chunks.append(" ".join(current))
            current = current[-overlap_sentences:] if overlap_sentences else []
            current_len = sum(len(s) for s in current)
        current.append(sent)
        current_len += len(sent)
    if current:
        chunks.append(" ".join(current))
    return chunks
```

---

**Q: How do you implement a simple in-memory vector store in Python (for interviews)?**

```python
import numpy as np
from typing import NamedTuple

class Document(NamedTuple):
    id: str
    text: str
    embedding: np.ndarray
    metadata: dict

class SimpleVectorStore:
    def __init__(self):
        self.docs: list[Document] = []

    def add(self, id: str, text: str, embedding: list[float], metadata: dict = {}):
        emb = np.array(embedding, dtype=np.float32)
        emb = emb / np.linalg.norm(emb)  # normalize for cosine similarity
        self.docs.append(Document(id, text, emb, metadata))

    def search(self, query_embedding: list[float], top_k: int = 5) -> list[tuple[Document, float]]:
        q = np.array(query_embedding, dtype=np.float32)
        q = q / np.linalg.norm(q)
        # Compute cosine similarity to all docs at once (vectorized)
        embeddings = np.stack([d.embedding for d in self.docs])  # shape (N, dim)
        scores = embeddings @ q  # shape (N,) — cosine similarity
        top_indices = np.argsort(scores)[::-1][:top_k]
        return [(self.docs[i], float(scores[i])) for i in top_indices]

# Usage
store = SimpleVectorStore()
store.add("1", "Python is great", [0.1, 0.2, 0.3, ...])
results = store.search(query_embedding=[0.1, 0.2, 0.3, ...], top_k=3)
```

---

**Q: What is the difference between `@staticmethod`, `@classmethod`, and instance methods?**

```python
class EmbeddingModel:
    DEFAULT_DIM = 1536

    def __init__(self, model_name: str):
        self.model_name = model_name

    # Instance method — has access to self (instance)
    def embed(self, text: str) -> list[float]:
        return self._call_api(text)

    # Class method — has access to cls (class, not instance)
    # Used for alternative constructors
    @classmethod
    def from_env(cls) -> "EmbeddingModel":
        return cls(model_name=os.environ["EMBED_MODEL"])

    # Static method — no access to instance or class
    # Pure utility function that happens to live here
    @staticmethod
    def normalize(embedding: list[float]) -> list[float]:
        arr = np.array(embedding)
        return (arr / np.linalg.norm(arr)).tolist()
```

---

**Q: How would you implement an LRU cache from scratch in Python?**

```python
from collections import OrderedDict

class LRUCache:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.cache = OrderedDict()  # maintains insertion order

    def get(self, key: str) -> str | None:
        if key not in self.cache:
            return None
        self.cache.move_to_end(key)  # mark as most recently used
        return self.cache[key]

    def put(self, key: str, value: str):
        if key in self.cache:
            self.cache.move_to_end(key)
        self.cache[key] = value
        if len(self.cache) > self.capacity:
            self.cache.popitem(last=False)  # evict least recently used (first item)

# Use case: cache LLM responses (same prompt = same response)
response_cache = LRUCache(capacity=1000)

def cached_llm(prompt: str) -> str:
    cached = response_cache.get(prompt)
    if cached:
        return cached
    result = call_llm(prompt)
    response_cache.put(prompt, result)
    return result

# Built-in alternative for pure functions
from functools import lru_cache

@lru_cache(maxsize=1000)
def get_embedding(text: str) -> tuple:  # must be hashable → use tuple
    return tuple(embed(text))
```

---

**Q: How do you handle rate limits when calling OpenAI/Anthropic APIs in Python?**

```python
import asyncio
import time
import random
from openai import AsyncOpenAI, RateLimitError

async def call_with_backoff(
    client: AsyncOpenAI,
    prompt: str,
    max_retries: int = 5,
    base_delay: float = 1.0,
) -> str:
    for attempt in range(max_retries):
        try:
            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}]
            )
            return response.choices[0].message.content
        except RateLimitError as e:
            if attempt == max_retries - 1:
                raise
            # Exponential backoff with jitter
            delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
            print(f"Rate limited. Waiting {delay:.1f}s (attempt {attempt+1}/{max_retries})")
            await asyncio.sleep(delay)

# Semaphore limits concurrent requests
sem = asyncio.Semaphore(10)  # max 10 concurrent calls

async def process_all(prompts: list[str]) -> list[str]:
    client = AsyncOpenAI()

    async def safe_call(prompt: str) -> str:
        async with sem:
            return await call_with_backoff(client, prompt)

    return await asyncio.gather(*[safe_call(p) for p in prompts], return_exceptions=True)
```

---

**Q: Explain generators and how they help with large-scale data processing in ML.**

```python
# Memory problem: loading entire dataset at once
dataset = [load_document(path) for path in all_paths]  # 10GB in RAM

# Generator solution: lazy evaluation, one item at a time
def load_documents(paths: list[str]):
    for path in paths:
        yield load_document(path)  # loads one, frees previous from memory

# Pipeline of generators (each transforms on-the-fly)
def tokenize_stream(docs):
    for doc in docs:
        yield tokenize(doc)

def embed_stream(tokens, batch_size=32):
    batch = []
    for token_list in tokens:
        batch.append(token_list)
        if len(batch) == batch_size:
            yield embed_batch(batch)
            batch = []
    if batch:
        yield embed_batch(batch)

# The full pipeline — processes data WITHOUT loading all into memory
docs = load_documents(all_paths)         # generator
tokens = tokenize_stream(docs)           # generator
embeddings = embed_stream(tokens, 32)    # generator

# Only materializes in memory during iteration
for batch_embeddings in embeddings:
    store_in_vector_db(batch_embeddings)
```

---

**Q: What is `__slots__` and when would you use it in an ML codebase?**

```python
# Normal class — each instance has a __dict__ (hash map for attributes)
# Heavy when you have millions of instances

class Embedding:
    def __init__(self, id: str, vector: list):
        self.id = id
        self.vector = vector
# sys.getsizeof(Embedding("a", [1,2,3])) ≈ 48 bytes + __dict__ overhead

# __slots__ — replaces __dict__ with fixed-size structure
class EmbeddingSlots:
    __slots__ = ("id", "vector")  # no __dict__
    def __init__(self, id: str, vector: list):
        self.id = id
        self.vector = vector
# 30-50% less memory, 20-30% faster attribute access
# Tradeoff: can't add new attributes, no __dict__, no multiple inheritance easily

# When to use: when creating millions of lightweight objects
# e.g., storing 1M document metadata objects alongside a vector index
```

---

**Q: How do you profile and optimize slow Python AI code?**

```python
# 1. cProfile — function-level profiling
import cProfile
cProfile.run("my_function()")

# 2. line_profiler — line-by-line (pip install line_profiler)
from line_profiler import LineProfiler
lp = LineProfiler()
lp.add_function(my_function)
lp.run("my_function(data)")
lp.print_stats()

# 3. memory_profiler — memory usage per line (pip install memory_profiler)
from memory_profiler import profile

@profile
def process_data(df):
    ...

# 4. timeit — micro benchmarks
import timeit
timeit.timeit("sum(range(1000))", number=10_000)

# 5. Quick wins for AI code
# ❌ Loop over rows
for i, row in df.iterrows():
    result = row["a"] + row["b"]

# ✅ Vectorize
result = df["a"] + df["b"]

# ❌ Python for loop over tensor
for i in range(len(tensor)):
    result = tensor[i] * 2

# ✅ Vectorized PyTorch
result = tensor * 2

# ❌ One API call per item
results = [call_llm(p) for p in prompts]

# ✅ Async batch
results = await asyncio.gather(*[call_llm(p) for p in prompts])
```

---

## Links to Refer

- [Python Official Docs](https://docs.python.org/3/)
- [Real Python — Python for Data Science](https://realpython.com/learning-paths/data-science-python/)
- [NumPy Documentation](https://numpy.org/doc/stable/)
- [Pandas Documentation](https://pandas.pydata.org/docs/)
- [scikit-learn User Guide](https://scikit-learn.org/stable/user_guide.html)
- [PyTorch Tutorials](https://pytorch.org/tutorials/)
- [HuggingFace Transformers Docs](https://huggingface.co/docs/transformers)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [OpenAI Python SDK](https://github.com/openai/openai-python)
- [Anthropic Python SDK](https://github.com/anthropics/anthropic-sdk-python)
- [asyncio — Python Docs](https://docs.python.org/3/library/asyncio.html)
- [sentence-transformers](https://www.sbert.net/)
