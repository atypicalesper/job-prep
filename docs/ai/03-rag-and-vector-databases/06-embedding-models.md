# Embedding Models — OpenAI, HuggingFace, Gemini, Qwen3, Cohere

## What are Embeddings?

An embedding is a **dense vector** (array of floats) representing the semantic meaning of text. Similar texts produce vectors that are geometrically close.

```
"The dog sat on the mat" → [0.12, -0.34, 0.89, ...]  (1536 dims)
"A canine rested on a rug" → [0.11, -0.35, 0.88, ...] (very close!)
"The stock market crashed"  → [-0.45, 0.21, -0.12, ...] (far away)
```

Critical rule: **always use the same model for indexing and querying**. Mixing models produces garbage similarity scores.

---

## OpenAI Embeddings

```python
from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

# Single text
response = client.embeddings.create(
    model="text-embedding-3-small",  # or text-embedding-3-large, text-embedding-ada-002
    input="Your text here"
)
embedding = response.data[0].embedding  # list of floats

# Batch (much more efficient — up to 2048 inputs per request)
texts = ["text 1", "text 2", "text 3"]
response = client.embeddings.create(
    model="text-embedding-3-small",
    input=texts
)
embeddings = [d.embedding for d in response.data]

# Truncate dimensions (Matryoshka — smaller = faster + cheaper retrieval)
response = client.embeddings.create(
    model="text-embedding-3-small",
    input="text",
    dimensions=512  # reduce from 1536 to 512 with minimal quality loss
)
```

### OpenAI Embedding Models

| Model | Dimensions | Max Tokens | Cost (per 1M tokens) | Notes |
|---|---|---|---|---|
| text-embedding-3-small | 1536 (or truncated) | 8191 | $0.02 | Best price/performance |
| text-embedding-3-large | 3072 (or truncated) | 8191 | $0.13 | Best quality |
| text-embedding-ada-002 | 1536 | 8191 | $0.10 | Legacy, superseded |

**Matryoshka representation learning** — text-embedding-3 models can be truncated to fewer dimensions with minimal accuracy loss. You can store 256-dim vectors and still get 87% of the quality of 1536-dim.

---

## HuggingFace Embeddings

Free, run locally, hundreds of models available.

```python
# Via sentence-transformers library (most common)
from sentence_transformers import SentenceTransformer

model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
# Other popular models:
# 'BAAI/bge-large-en-v1.5'          — top performer on MTEB
# 'intfloat/multilingual-e5-large'  — multilingual
# 'thenlper/gte-large'              — strong for RAG

embeddings = model.encode(
    ["text 1", "text 2"],
    batch_size=32,
    normalize_embeddings=True  # normalize for cosine similarity
)
# Returns numpy array, shape: (2, 384) for MiniLM

# With GPU
model = SentenceTransformer('BAAI/bge-large-en-v1.5', device='cuda')
```

### Via HuggingFace Inference API

```python
import requests

API_URL = "https://api-inference.huggingface.co/models/BAAI/bge-large-en-v1.5"
headers = {"Authorization": f"Bearer {os.environ['HF_API_TOKEN']}"}

response = requests.post(API_URL, headers=headers, json={"inputs": ["text here"]})
embeddings = response.json()
```

### Via LangChain

```python
from langchain_huggingface import HuggingFaceEmbeddings

embeddings = HuggingFaceEmbeddings(
    model_name="BAAI/bge-large-en-v1.5",
    model_kwargs={"device": "cpu"},
    encode_kwargs={"normalize_embeddings": True}
)
vector = embeddings.embed_query("your text")
vectors = embeddings.embed_documents(["doc1", "doc2"])
```

### Popular HuggingFace Models for RAG

| Model | Dims | Size | Notes |
|---|---|---|---|
| all-MiniLM-L6-v2 | 384 | 22M params | Tiny + fast, good for dev |
| BAAI/bge-large-en-v1.5 | 1024 | 335M params | Top MTEB, best for prod |
| intfloat/e5-large-v2 | 1024 | 335M params | Strong for passages |
| multilingual-e5-large | 1024 | 560M params | 100+ languages |
| nomic-ai/nomic-embed-text-v1 | 768 | 137M params | Open, competitive with OpenAI small |

---

## Google Gemini Embeddings

```python
import google.generativeai as genai

genai.configure(api_key=os.environ["GEMINI_API_KEY"])

# Single embedding
result = genai.embed_content(
    model="models/text-embedding-004",
    content="Your text here",
    task_type="RETRIEVAL_DOCUMENT"  # or RETRIEVAL_QUERY, SEMANTIC_SIMILARITY, CLASSIFICATION
)
embedding = result['embedding']  # 768-dim vector

# Batch
texts = ["text 1", "text 2"]
result = genai.embed_content(
    model="models/text-embedding-004",
    content=texts,
    task_type="RETRIEVAL_DOCUMENT"
)
embeddings = result['embedding']  # list of 768-dim vectors
```

### Task types matter for Gemini

```python
# Use RETRIEVAL_DOCUMENT when indexing documents
doc_embedding = genai.embed_content(
    model="models/text-embedding-004",
    content="Document text to index",
    task_type="RETRIEVAL_DOCUMENT"
)

# Use RETRIEVAL_QUERY when embedding a user's search query
query_embedding = genai.embed_content(
    model="models/text-embedding-004",
    content="User's question",
    task_type="RETRIEVAL_QUERY"
)
```

**Note:** Asymmetric embeddings — document and query embeddings are in different spaces optimized for retrieval, not symmetric similarity.

| Model | Dims | Pricing |
|---|---|---|
| text-embedding-004 | 768 (fixed) | $0.025 per 1M chars (not tokens) |
| embedding-001 | 768 | Legacy |

---

## Cohere Embeddings

```python
import cohere

co = cohere.Client(api_key=os.environ["COHERE_API_KEY"])

# Embed (must specify input_type)
response = co.embed(
    texts=["text 1", "text 2"],
    model="embed-english-v3.0",
    input_type="search_document"  # or "search_query", "classification", "clustering"
)
embeddings = response.embeddings  # list of 1024-dim vectors

# int8 and binary embeddings (much cheaper to store)
response = co.embed(
    texts=["text 1"],
    model="embed-english-v3.0",
    input_type="search_document",
    embedding_types=["float", "int8", "binary"]
)
float_emb  = response.embeddings.float
int8_emb   = response.embeddings.int8    # 4x cheaper to store
binary_emb = response.embeddings.binary  # 32x cheaper to store
```

### Cohere Models

| Model | Dims | Languages |
|---|---|---|
| embed-english-v3.0 | 1024 | English |
| embed-multilingual-v3.0 | 1024 | 100+ |
| embed-english-light-v3.0 | 384 | English (fast) |
| embed-multilingual-light-v3.0 | 384 | 100+ (fast) |

**Cohere's advantage:** Binary quantization with almost no quality loss — 32x storage reduction.

---

## Qwen3 Embeddings

Alibaba's Qwen3 embedding models — strong multilingual, especially CJK (Chinese/Japanese/Korean).

```python
from sentence_transformers import SentenceTransformer

# Via sentence-transformers (local)
model = SentenceTransformer('Alibaba-NLP/gte-Qwen2-7B-instruct', trust_remote_code=True)
embeddings = model.encode(["text"], convert_to_tensor=True)

# Via HuggingFace Inference API
import requests
API_URL = "https://api-inference.huggingface.co/models/Alibaba-NLP/gte-Qwen2-7B-instruct"
# Note: 7B model — needs GPU inference, use Inference Endpoints for production

# Smaller variant
model = SentenceTransformer('Alibaba-NLP/gte-Qwen2-1.5B-instruct', trust_remote_code=True)
```

| Model | Dims | Notes |
|---|---|---|
| gte-Qwen2-7B-instruct | 3584 | SOTA on MTEB, excellent multilingual |
| gte-Qwen2-1.5B-instruct | 1536 | Good quality, smaller |
| gte-large-en-v1.5 | 1024 | Older, still solid |

**Best for:** Chinese/Japanese/Korean content, multilingual RAG, when you need top MTEB scores without OpenAI.

---

## Choosing an Embedding Model

```
Cost sensitive + English only?    → text-embedding-3-small (OpenAI)
Best quality, cost OK?            → text-embedding-3-large (OpenAI)
Self-hosted / no external API?    → BAAI/bge-large-en-v1.5 (HuggingFace)
Multilingual (100+ languages)?    → multilingual-e5-large or Cohere multilingual-v3
CJK languages priority?           → Qwen3/GTE
Storage cost critical?            → Cohere with int8/binary quantization
Google ecosystem?                 → Gemini text-embedding-004
Tiny + fast (mobile, edge)?       → all-MiniLM-L6-v2 (22M params, 384 dims)
```

---

## Production Best Practices

```python
# 1. Batch embedding — never embed one at a time
def batch_embed(texts: list[str], model, batch_size: int = 100) -> list[list[float]]:
    all_embeddings = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        embeddings = model.encode(batch, show_progress_bar=True)
        all_embeddings.extend(embeddings.tolist())
    return all_embeddings

# 2. Cache embeddings — same text = same vector, don't re-embed
import hashlib, json
from functools import lru_cache

@lru_cache(maxsize=10000)
def get_embedding_cached(text: str) -> tuple:
    return tuple(embed_single(text))

# 3. Normalize when using cosine similarity
import numpy as np
def normalize(v: list[float]) -> list[float]:
    arr = np.array(v)
    return (arr / np.linalg.norm(arr)).tolist()

# 4. Track model version — changing models invalidates ALL stored vectors
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_VERSION = "v1"  # bump when you change models, trigger re-indexing

# 5. Handle rate limits with exponential backoff
import time
def embed_with_retry(client, text, model, max_retries=3):
    for attempt in range(max_retries):
        try:
            return client.embeddings.create(model=model, input=text)
        except Exception as e:
            if attempt == max_retries - 1: raise
            time.sleep(2 ** attempt)
```

---

## MTEB Benchmark (Massive Text Embedding Benchmark)

The standard benchmark for comparing embedding models. Covers retrieval, clustering, classification, semantic similarity across 56 datasets.

**Links to refer:**
- [MTEB Leaderboard](https://huggingface.co/spaces/mteb/leaderboard) — live rankings
- [OpenAI Embedding Docs](https://platform.openai.com/docs/guides/embeddings)
- [Cohere Embedding Docs](https://docs.cohere.com/reference/embed)
- [sentence-transformers docs](https://www.sbert.net/docs/pretrained_models.html)
- [BAAI/bge model card](https://huggingface.co/BAAI/bge-large-en-v1.5)

---

## Interview Q&A

**Q: Why must you use the same embedding model for indexing and querying?**

Each model has its own learned vector space — the geometry of vectors is model-specific. text-embedding-3-small's vector for "dog" is a completely different set of numbers than BAAI/bge's vector for "dog". If you index with model A and query with model B, the cosine similarity scores are meaningless — you're measuring distance in two different coordinate systems.

**Q: What are Matryoshka embeddings?**

A training technique (from OpenAI's text-embedding-3 models) where the model learns to pack the most important semantic information into the first N dimensions. You can truncate from 1536 to 256 dimensions and retain ~90% of the retrieval quality at 6x lower storage cost and faster similarity computation. Useful when operating at scale.

**Q: How does Cohere's binary quantization work and what's the trade-off?**

Cohere's int8/binary embeddings represent each float32 as 1 byte (int8) or 1 bit (binary). 1536 float32 values = 6144 bytes → int8: 1536 bytes (4x reduction) → binary: 192 bytes (32x reduction). The vectors are less precise but for retrieval tasks the quality loss is small (~5–10% accuracy drop) because the overall directional information is preserved. Great when you're storing hundreds of millions of vectors and RAM/disk cost is significant.

**Q: What is the `task_type` parameter in Gemini embeddings and why does it matter?**

Gemini uses asymmetric (bi-encoder) training — the model learns different representations for queries vs documents, optimized for retrieval. Using `RETRIEVAL_QUERY` for your user's question and `RETRIEVAL_DOCUMENT` for your indexed chunks puts them in compatible spaces. Using the wrong task type degrades retrieval quality. OpenAI's models don't require this — they use symmetric embeddings — but Gemini and some HuggingFace models benefit from it.
