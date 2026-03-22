# NumPy for AI/ML

## Why NumPy?

Pure Python loops are ~100x slower than NumPy vectorized operations. All ML frameworks (PyTorch, TensorFlow, scikit-learn) use NumPy arrays or tensors built on the same concepts.

```python
import numpy as np

# Pure Python — slow
result = [x**2 for x in range(1_000_000)]  # ~0.3s

# NumPy — fast (C under the hood)
result = np.arange(1_000_000) ** 2  # ~0.003s (100x faster)
```

---

## Array Creation

```python
# From Python
a = np.array([1, 2, 3])                  # 1D: shape (3,)
m = np.array([[1, 2], [3, 4]])           # 2D: shape (2, 2)
t = np.array([[[1,2],[3,4]],[[5,6],[7,8]]])  # 3D

# Built-in creators
np.zeros((3, 4))            # 3×4 zeros (float64 by default)
np.ones((2, 3), dtype=int)  # 2×3 ones as ints
np.eye(3)                   # 3×3 identity matrix
np.full((2, 3), 7)          # 2×3 filled with 7
np.empty((2, 2))            # uninitialized (fast, values random)

np.arange(0, 10, 2)         # [0, 2, 4, 6, 8]
np.linspace(0, 1, 5)        # [0.0, 0.25, 0.5, 0.75, 1.0]

# Random
np.random.seed(42)
np.random.rand(3, 4)        # uniform [0, 1)
np.random.randn(3, 4)       # standard normal (mean=0, std=1)
np.random.randint(0, 10, size=(3,))    # [7, 2, 5]
np.random.choice([1,2,3,4], size=5, replace=True)
np.random.shuffle(arr)      # in-place shuffle

# AI-specific patterns
embeddings = np.random.randn(100, 1536)   # 100 embeddings of dim 1536
batch      = np.zeros((32, 224, 224, 3))  # batch of 32 RGB images 224×224
```

---

## Shape & Reshaping

```python
a = np.arange(24)
a.shape       # (24,)
a.ndim        # 1
a.size        # 24 (total elements)
a.dtype       # dtype('int64')

# Reshape — total elements must match
a.reshape(4, 6)        # shape (4, 6)
a.reshape(2, 3, 4)     # shape (2, 3, 4)
a.reshape(-1, 6)       # -1 = "figure it out" → shape (4, 6)
a.reshape(4, -1)       # shape (4, 6)

# Flatten
m.flatten()            # always returns a copy
m.ravel()             # returns view when possible (faster)

# Add/remove dimensions
a = np.array([1, 2, 3])   # shape (3,)
np.expand_dims(a, axis=0)  # shape (1, 3) — add batch dim
np.expand_dims(a, axis=1)  # shape (3, 1)
a[np.newaxis, :]           # shape (1, 3)
a[:, np.newaxis]           # shape (3, 1)

m = np.ones((1, 3, 1))
m.squeeze()               # shape (3,) — remove size-1 dims
m.squeeze(axis=0)         # shape (3, 1)

# Transpose
m = np.random.randn(3, 4)
m.T                       # shape (4, 3)
m.transpose(1, 0)         # same as .T for 2D
```

---

## Broadcasting — The Key Concept

NumPy automatically expands smaller arrays to match larger ones:

```python
# Rules: align shapes from the right, 1s can be broadcast to any size
a = np.array([[1, 2, 3],   # shape (2, 3)
              [4, 5, 6]])

b = np.array([10, 20, 30]) # shape (3,) → broadcast to (2, 3)

a + b  # [[11, 22, 33], [14, 25, 36]]

# Practical AI use case: normalize embeddings
embeddings = np.random.randn(100, 1536)  # (100, 1536)
mean = embeddings.mean(axis=0)           # (1536,)
std  = embeddings.std(axis=0)           # (1536,)
normalized = (embeddings - mean) / std  # (100, 1536) - (1536,) → broadcast!

# Cosine similarity between query and all docs
query = np.random.randn(1536)                        # (1536,)
docs  = np.random.randn(100, 1536)                   # (100, 1536)

# Normalize
query_norm = query / np.linalg.norm(query)
docs_norm  = docs / np.linalg.norm(docs, axis=1, keepdims=True)

# Dot product
similarities = docs_norm @ query_norm  # shape (100,) — similarity to each doc
top5 = np.argsort(similarities)[::-1][:5]  # indices of top 5
```

---

## Indexing & Slicing

```python
a = np.arange(10)  # [0, 1, 2, ..., 9]

# Basic
a[3]        # 3
a[-1]       # 9
a[2:5]      # [2, 3, 4]
a[::2]      # [0, 2, 4, 6, 8]
a[::-1]     # [9, 8, ..., 0]

# 2D
m = np.arange(12).reshape(3, 4)
m[1, 2]      # element at row 1, col 2
m[1, :]      # entire row 1
m[:, 2]      # entire col 2
m[0:2, 1:3]  # submatrix rows 0-1, cols 1-2

# Boolean indexing (masking)
a = np.array([1, -2, 3, -4, 5])
mask = a > 0
a[mask]       # [1, 3, 5]
a[a > 0] = 0  # set positives to zero: [-0, -2, -0, -4, -0]

# Fancy indexing
indices = np.array([0, 2, 4])
a[indices]    # [a[0], a[2], a[4]]

# np.where (vectorized if/else)
np.where(a > 0, a, 0)  # keep positive, zero out negative
np.where(a > 0, "pos", "neg")  # string labels
```

---

## Math Operations

```python
a = np.array([1.0, 4.0, 9.0])

# Element-wise
a + 1; a * 2; a ** 2; a / 2
np.sqrt(a)   # [1.0, 2.0, 3.0]
np.log(a)    # natural log
np.log2(a); np.log10(a)
np.exp(a)    # e^x
np.abs(a)
np.sign(a)   # -1, 0, 1
np.clip(a, 0, 5)   # clamp values to [0, 5]

# Aggregation
a.sum(); a.mean(); a.std(); a.var()
a.min(); a.max()
a.argmin(); a.argmax()  # index of min/max

# Axis-wise
m = np.random.randn(3, 4)
m.sum(axis=0)   # shape (4,) — sum each column
m.sum(axis=1)   # shape (3,) — sum each row
m.mean(axis=0, keepdims=True)  # shape (1, 4) — keeps dims

# Linear algebra
np.dot(a, b)           # dot product
a @ b                  # same (preferred)
np.linalg.norm(v)      # L2 norm
np.linalg.norm(m, axis=1)  # L2 norm per row
np.linalg.inv(m)       # inverse
np.linalg.det(m)       # determinant
U, S, Vt = np.linalg.svd(m)  # SVD decomposition

# Sorting
np.sort(a)              # sorted copy
np.argsort(a)           # indices that would sort a
np.argsort(a)[::-1]     # descending (top-k pattern)
```

---

## AI/ML Patterns in NumPy

```python
# Softmax (neural network output layer)
def softmax(x: np.ndarray) -> np.ndarray:
    x = x - x.max()  # numerical stability
    e = np.exp(x)
    return e / e.sum()

logits = np.array([2.0, 1.0, 0.1])
probs = softmax(logits)  # [0.659, 0.242, 0.099]

# Sigmoid
def sigmoid(x): return 1 / (1 + np.exp(-x))

# ReLU
def relu(x): return np.maximum(0, x)

# One-hot encoding
def one_hot(labels, num_classes):
    return np.eye(num_classes)[labels]

labels = np.array([0, 2, 1])
one_hot(labels, 3)
# [[1,0,0], [0,0,1], [0,1,0]]

# Batch matrix multiply
# X: (batch, seq, d_model), W: (d_model, d_out)
# Result: (batch, seq, d_out)
result = X @ W   # broadcasting handles batch dim

# Cosine similarity matrix (all vs all)
def cosine_similarity_matrix(A, B):
    A_norm = A / np.linalg.norm(A, axis=1, keepdims=True)
    B_norm = B / np.linalg.norm(B, axis=1, keepdims=True)
    return A_norm @ B_norm.T  # shape (len(A), len(B))
```

---

## Memory & Performance

```python
# dtype controls memory usage
arr_float64 = np.ones((1000, 1000))           # 8MB (default)
arr_float32 = np.ones((1000, 1000), dtype=np.float32)  # 4MB
arr_int8    = np.ones((1000, 1000), dtype=np.int8)     # 1MB

# ML models use float32 (GPU default), not float64
embeddings = embeddings.astype(np.float32)

# Views vs copies — views share memory (no copy, fast)
a = np.arange(10)
b = a[2:5]  # view — modifying b modifies a
c = a[2:5].copy()  # explicit copy

# Check if view or copy
b.base is a  # True → b is a view of a

# Memory usage
arr.nbytes  # total bytes
arr.itemsize  # bytes per element

# Memmap — work with arrays larger than RAM
fp = np.memmap("big_array.dat", dtype=np.float32, mode="w+", shape=(1_000_000, 1536))
fp[0] = embeddings[0]  # writes to disk, only loads what's needed
```
