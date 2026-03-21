# Vector Databases Deep Dive — ChromaDB, Pinecone, pgvector, FAISS

## Why Vector Databases?

Traditional databases search by exact match or range. Vector databases search by **semantic similarity** — finding items that mean the same thing even when worded differently.

```
Query: "car repair cost"
Matches: "vehicle maintenance pricing", "auto service fees"  ← same meaning, different words
```

They store **embeddings** (high-dimensional float vectors, typically 384–3072 dims) and run **Approximate Nearest Neighbor (ANN)** search — fast enough for production (milliseconds, not seconds).

---

## Core Concepts

### Distance metrics

```python
# Cosine similarity — angle between vectors (ignores magnitude, best for text)
# Result: 1.0 = identical, 0 = orthogonal, -1 = opposite
cosine_sim = dot(A, B) / (|A| * |B|)

# Euclidean (L2) — absolute distance (good for image features)
l2_dist = sqrt(sum((a - b)² for a, b in zip(A, B)))

# Dot product — fast, but magnitude-sensitive (use when vectors are normalized)
dot_product = sum(a * b for a, b in zip(A, B))
```

Most RAG systems use **cosine similarity** with normalized embeddings.

### ANN Algorithms

| Algorithm | Index Type | Speed | Accuracy | Memory |
|---|---|---|---|---|
| HNSW (Hierarchical NSW) | Graph-based | Very fast | Very high | High |
| IVF (Inverted File) | Cluster-based | Fast | Medium-high | Medium |
| PQ (Product Quantization) | Compression | Fast | Lower | Low |
| Flat/Exact | Brute force | Slow | Perfect | Medium |

HNSW is the default for most production systems — best speed/accuracy trade-off.

---

## ChromaDB

**Open-source, Python-native, zero infrastructure for prototyping.**

```python
import chromadb
from chromadb.utils import embedding_functions

# Ephemeral (in-memory, for testing)
client = chromadb.Client()

# Persistent (local disk)
client = chromadb.PersistentClient(path="/data/chroma")

# HTTP client (connect to running Chroma server)
client = chromadb.HttpClient(host="localhost", port=8000)

# Create collection
openai_ef = embedding_functions.OpenAIEmbeddingFunction(
    api_key=os.environ["OPENAI_API_KEY"],
    model_name="text-embedding-3-small"
)

collection = client.create_collection(
    name="documents",
    embedding_function=openai_ef,
    metadata={"hnsw:space": "cosine"}  # or "l2", "ip"
)

# Add documents (Chroma handles embedding)
collection.add(
    documents=["Machine learning is a subset of AI", "Python is a programming language"],
    metadatas=[{"source": "wiki", "category": "AI"}, {"source": "wiki", "category": "PL"}],
    ids=["doc-1", "doc-2"]
)

# Query
results = collection.query(
    query_texts=["What is deep learning?"],
    n_results=3,
    where={"category": "AI"},                       # metadata filter
    where_document={"$contains": "machine learning"} # document content filter
)
print(results["documents"], results["distances"])

# Upsert (add or update)
collection.upsert(documents=["Updated doc"], ids=["doc-1"])

# Delete
collection.delete(ids=["doc-1"])
```

### ChromaDB with LangChain

```python
from langchain_community.vectorstores import Chroma
from langchain_openai import OpenAIEmbeddings

# Create/load
vectorstore = Chroma(
    collection_name="rag_docs",
    embedding_function=OpenAIEmbeddings(),
    persist_directory="./chroma_db"
)

# Add docs
vectorstore.add_documents(docs)

# Similarity search
results = vectorstore.similarity_search("query text", k=5)
results_with_scores = vectorstore.similarity_search_with_score("query text", k=5)

# As retriever
retriever = vectorstore.as_retriever(
    search_type="mmr",               # or "similarity", "similarity_score_threshold"
    search_kwargs={"k": 5, "fetch_k": 20, "lambda_mult": 0.5}  # MMR diversity
)
```

**Best for:** Local development, prototyping, small-scale production (<1M docs).
**Limitations:** Not distributed, no built-in auth, limited filtering vs Pinecone.

---

## Pinecone

**Managed, cloud-native, built for scale (billions of vectors).**

```python
from pinecone import Pinecone, ServerlessSpec

pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])

# Create serverless index
pc.create_index(
    name="rag-index",
    dimension=1536,                    # must match your embedding model output
    metric="cosine",                   # or "euclidean", "dotproduct"
    spec=ServerlessSpec(cloud="aws", region="us-east-1")
)

index = pc.Index("rag-index")

# Upsert vectors
index.upsert(vectors=[
    {
        "id": "doc-1",
        "values": embedding_vector,  # list of floats, length = dimension
        "metadata": {"text": "original text", "source": "wiki", "date": "2024-01-01"}
    },
])

# Batch upsert (much faster)
BATCH_SIZE = 100
for i in range(0, len(embeddings), BATCH_SIZE):
    batch = [
        {"id": ids[j], "values": embeddings[j], "metadata": metadata[j]}
        for j in range(i, min(i + BATCH_SIZE, len(embeddings)))
    ]
    index.upsert(vectors=batch)

# Query
results = index.query(
    vector=query_embedding,
    top_k=5,
    include_metadata=True,
    filter={
        "source": {"$eq": "wiki"},
        "date": {"$gte": "2024-01-01"}
    }
)
for match in results.matches:
    print(match.id, match.score, match.metadata)

# Namespaces — isolate data per tenant
index.upsert(vectors=[...], namespace="tenant-123")
results = index.query(vector=q, top_k=5, namespace="tenant-123")

# Stats
print(index.describe_index_stats())
```

### Pinecone with LangChain

```python
from langchain_pinecone import PineconeVectorStore

vectorstore = PineconeVectorStore.from_documents(
    documents=docs,
    embedding=OpenAIEmbeddings(),
    index_name="rag-index",
    namespace="production"
)

# Or connect to existing
vectorstore = PineconeVectorStore(
    index_name="rag-index",
    embedding=OpenAIEmbeddings(),
    namespace="production"
)
```

**Best for:** Production at scale, multi-tenant SaaS, teams that don't want to manage infra.
**Limitations:** Cost at scale, vendor lock-in, data leaves your infrastructure.

---

## pgvector (PostgreSQL Extension)

**Vectors stored in your existing Postgres — no extra infra.**

```sql
-- Enable extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create table
CREATE TABLE documents (
  id        BIGSERIAL PRIMARY KEY,
  content   TEXT NOT NULL,
  metadata  JSONB DEFAULT '{}',
  embedding VECTOR(1536)  -- dimension must match model
);

-- Insert (from app code: send precomputed embedding)
INSERT INTO documents (content, metadata, embedding)
VALUES ('Machine learning text', '{"source":"wiki"}', '[0.1, 0.2, ...]');

-- Cosine similarity search
SELECT id, content, metadata,
       1 - (embedding <=> '[0.1, 0.2, ...]') AS similarity
FROM documents
ORDER BY embedding <=> '[0.1, 0.2, ...]'  -- <=> = cosine distance
LIMIT 5;

-- L2 distance: <->
-- Inner product: <#> (negate for similarity, returns negative of dot product)

-- Create HNSW index (recommended for cosine)
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Create IVFFlat index (lower memory, faster build for large datasets)
CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);  -- sqrt(rows) is a good starting point

-- Set ef_search at query time (higher = more accurate, slower)
SET hnsw.ef_search = 100;

-- Hybrid search: vector + keyword (BM25 via pg_trgm or full text)
SELECT id, content,
       ts_rank(to_tsvector(content), query) AS text_rank,
       1 - (embedding <=> '[...]') AS vector_rank
FROM documents, to_tsquery('machine & learning') query
WHERE to_tsvector(content) @@ query
ORDER BY vector_rank DESC
LIMIT 10;
```

### pgvector with Python (asyncpg)

```python
import asyncpg
import numpy as np

async def search(pool, query_embedding: list[float], limit: int = 5):
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, content, metadata,
                   1 - (embedding <=> $1::vector) AS similarity
            FROM documents
            ORDER BY embedding <=> $1::vector
            LIMIT $2
        """, str(query_embedding), limit)
    return [dict(r) for r in rows]
```

### pgvector with LangChain

```python
from langchain_community.vectorstores import PGVector

CONNECTION_STRING = "postgresql+psycopg2://user:pass@localhost:5432/mydb"

vectorstore = PGVector.from_documents(
    documents=docs,
    embedding=OpenAIEmbeddings(),
    connection_string=CONNECTION_STRING,
    collection_name="documents",
    pre_delete_collection=False,
)
```

**Best for:** Teams already on Postgres, want ACID + vectors together, need SQL joins on metadata.
**Limitations:** Not as fast as dedicated vector DBs at billions of vectors; HNSW index is in-memory.

---

## FAISS (Facebook AI Similarity Search)

**In-memory library — fastest option, not a database.**

```python
import faiss
import numpy as np

d = 1536  # dimension

# Flat index (exact search, no approximation)
index = faiss.IndexFlatL2(d)

# Add vectors
vectors = np.random.random((1000, d)).astype('float32')
index.add(vectors)

# Search
query = np.random.random((1, d)).astype('float32')
distances, indices = index.search(query, k=5)  # returns k nearest

# HNSW (approximate, faster)
index_hnsw = faiss.IndexHNSWFlat(d, 32)  # 32 = M parameter
index_hnsw.hnsw.efConstruction = 40
index_hnsw.add(vectors)

# IVF (inverted file, good for 100K–10M vectors)
quantizer = faiss.IndexFlatL2(d)
index_ivf = faiss.IndexIVFFlat(quantizer, d, 100)  # 100 clusters
index_ivf.train(vectors)  # must train before adding
index_ivf.add(vectors)
index_ivf.nprobe = 10  # how many clusters to check at query time

# Save/load
faiss.write_index(index, "index.faiss")
index = faiss.read_index("index.faiss")

# GPU acceleration
res = faiss.StandardGpuResources()
index_gpu = faiss.index_cpu_to_gpu(res, 0, index)

# Cosine similarity: normalize first, then use IndexFlatIP
faiss.normalize_L2(vectors)
index_cosine = faiss.IndexFlatIP(d)  # inner product on normalized = cosine
index_cosine.add(vectors)
```

**Best for:** Research, offline batch processing, embedding into your own service without external deps.
**Limitations:** Not a database — no persistence, no metadata, no filtering, manual ID management.

---

## Choosing the Right Vector DB

| Requirement | Best Choice |
|---|---|
| Prototype / local dev | ChromaDB |
| Production SaaS, need managed infra | Pinecone |
| Already on Postgres, < 10M vectors | pgvector |
| Maximum performance, in-process | FAISS |
| Multi-tenant isolation | Pinecone (namespaces) or pgvector (schemas) |
| Hybrid search (vector + BM25) | pgvector + full text, or Elasticsearch |
| Self-hosted, open-source production | Weaviate, Qdrant, Milvus |

---

## Interview Q&A

**Q: How does HNSW work?**

HNSW (Hierarchical Navigable Small World) builds a layered graph where each node connects to its nearest neighbors. The top layers have long-range connections (skip-list-like navigation), lower layers have short-range connections. Search starts at the top layer and greedily descends, using local neighbors to navigate toward the query. O(log n) query time vs O(n) for brute force. Trade-off: high memory usage (graph stored in RAM).

**Q: What's the difference between HNSW and IVF indexes?**

HNSW: graph-based, no training required, excellent accuracy, high memory. IVF: clusters vectors into lists (k-means), searches only a few clusters at query time (controlled by `nprobe`). IVF needs training, lower memory than HNSW, accuracy depends on `nprobe`. Rule of thumb: HNSW for quality, IVF for memory-constrained production.

**Q: Why would you choose pgvector over Pinecone?**

Control and integration: vectors live in your existing Postgres, you get ACID transactions, can JOIN vector results with other tables, no data leaves your infrastructure, no extra service to manage. pgvector is slower than Pinecone at very large scale (>50M vectors) but for most products it's fast enough and far simpler operationally.

**Q: How do you handle multi-tenancy in a vector database?**

Pinecone: use namespaces — each tenant gets an isolated namespace, queries are scoped to a namespace. pgvector: separate schemas or a `tenant_id` column with a WHERE clause and composite index. ChromaDB: separate collections per tenant. Security-wise: never mix tenant data in the same collection/namespace if they're different customers.
