# RAG & Vector Databases

## What is RAG?

**Retrieval-Augmented Generation** — a pattern where you retrieve relevant documents from a knowledge base and inject them into the LLM prompt before generating a response.

```
Without RAG:
  User: "What is our refund policy?"
  LLM: (makes something up from training data — hallucination)

With RAG:
  User: "What is our refund policy?"
  → Embed query → Search vector DB → Retrieve top 3 policy docs
  → LLM: "Based on your docs: 30-day returns, original packaging required..."
```

---

## RAG Architecture

```
INDEXING PIPELINE (offline)
─────────────────────────────────────────────────────────────────
Documents (PDF, HTML, MD, DB)
    ↓
Chunking (split into ~500 token pieces)
    ↓
Embedding Model (text → vector)
    ↓
Vector Store (store vectors + metadata)

QUERY PIPELINE (online, per request)
─────────────────────────────────────────────────────────────────
User Query
    ↓
Embed Query (same embedding model!)
    ↓
Vector Search (cosine similarity / ANN)
    ↓
Top-K Retrieved Chunks (k=3-5 typically)
    ↓
Prompt Construction (system + context + query)
    ↓
LLM Generation
    ↓
Response (grounded in retrieved docs)
```

---

## Chunking Strategies

Chunking is how you split documents before embedding. It's one of the most impactful decisions in RAG.

```python
# 1. Fixed-size chunking (simple, often good enough)
from langchain.text_splitter import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,       # ~500 tokens
    chunk_overlap=50,     # Overlap prevents context loss at boundaries
    separators=["\n\n", "\n", " ", ""]  # Try to split at natural boundaries
)
chunks = splitter.split_text(document)

# 2. Semantic chunking (split where meaning changes)
from langchain_experimental.text_splitter import SemanticChunker
from langchain_openai import OpenAIEmbeddings

splitter = SemanticChunker(OpenAIEmbeddings(), breakpoint_threshold_type="percentile")
chunks = splitter.split_text(document)

# 3. Document-aware chunking (respect structure)
# - Markdown: split at headers (##, ###)
# - Code: split at function/class boundaries
# - Tables: keep entire table as one chunk
```

**Chunk size trade-offs:**

| Small chunks (200 tokens) | Large chunks (1000 tokens) |
|--------------------------|---------------------------|
| More precise retrieval | More context per chunk |
| More chunks to retrieve | Fewer API calls |
| May miss context | May include noise |
| Better for Q&A | Better for summarization |

---

## Embedding Models

Embeddings convert text to dense vectors where semantic similarity = geometric proximity.

```
"I love dogs" → [0.12, -0.45, 0.78, 0.23, ...]  (1536 dimensions for OpenAI)
"I adore puppies" → [0.14, -0.41, 0.76, 0.25, ...]  (similar!)
"I hate Mondays" → [-0.67, 0.89, -0.12, 0.56, ...] (different direction)
```

### Embedding Model Comparison

| Model | Dimensions | Max tokens | Cost | Notes |
|-------|-----------|-----------|------|-------|
| `text-embedding-3-small` (OpenAI) | 1536 | 8191 | $0.02/M | Good default |
| `text-embedding-3-large` (OpenAI) | 3072 | 8191 | $0.13/M | Better quality |
| `text-embedding-ada-002` (OpenAI) | 1536 | 8191 | $0.10/M | Legacy |
| `all-MiniLM-L6-v2` (HuggingFace) | 384 | 256 | Free | Fast, local |
| `BAAI/bge-large-en-v1.5` (HuggingFace) | 1024 | 512 | Free | Best open-source |
| Gemini embedding | 768 | 2048 | ~$0.025/M | Google ecosystem |
| Qwen3 embedding | 1024+ | 8192 | Free (local) | Strong multilingual |
| `embed-english-v3.0` (Cohere) | 1024 | 512 | $0.10/M | Strong reranking |

```python
# OpenAI embeddings
from openai import OpenAI
client = OpenAI()

def embed(text: str) -> list[float]:
    response = client.embeddings.create(
        input=text,
        model="text-embedding-3-small"
    )
    return response.data[0].embedding

# HuggingFace (free, local)
from sentence_transformers import SentenceTransformer
model = SentenceTransformer('all-MiniLM-L6-v2')
embedding = model.encode("Hello world")
```

---

## Vector Databases

### How They Work

```
Store: document text + embedding vector + metadata
Query: embed search query → find nearest vectors → return documents

Distance metrics:
  Cosine similarity: angle between vectors (most common for text)
  Dot product: similar to cosine but magnitude matters
  Euclidean distance (L2): straight-line distance (for normalized vectors = cosine)
```

### ChromaDB (Local / Easy to start)

```python
import chromadb
from chromadb.utils import embedding_functions

# In-memory (development)
client = chromadb.Client()

# Persistent (production)
client = chromadb.PersistentClient(path="./chroma_db")

# Create collection
embed_fn = embedding_functions.OpenAIEmbeddingFunction(
    api_key="...",
    model_name="text-embedding-3-small"
)
collection = client.create_collection("docs", embedding_function=embed_fn)

# Add documents
collection.add(
    documents=["Refund policy: 30 days...", "Shipping: 3-5 business days..."],
    ids=["doc1", "doc2"],
    metadatas=[{"source": "policy.pdf"}, {"source": "shipping.pdf"}]
)

# Query
results = collection.query(
    query_texts=["How long for refunds?"],
    n_results=3,
    where={"source": "policy.pdf"}  # Metadata filtering
)
```

### Pinecone (Managed, Production-grade)

```python
from pinecone import Pinecone, ServerlessSpec

pc = Pinecone(api_key="...")

# Create index
pc.create_index(
    name="my-index",
    dimension=1536,  # Must match embedding model!
    metric="cosine",
    spec=ServerlessSpec(cloud="aws", region="us-east-1")
)

index = pc.Index("my-index")

# Upsert vectors
vectors = [
    {"id": "doc1", "values": embed("text 1"), "metadata": {"source": "pdf1"}},
    {"id": "doc2", "values": embed("text 2"), "metadata": {"source": "pdf2"}},
]
index.upsert(vectors=vectors, namespace="my-namespace")

# Query
results = index.query(
    vector=embed("search query"),
    top_k=5,
    include_metadata=True,
    filter={"source": {"$eq": "pdf1"}}  # Metadata filter
)
```

### pgvector (PostgreSQL Extension)

```sql
-- Enable extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create table with vector column
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    content TEXT,
    embedding vector(1536),
    source VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create IVFFlat index for ANN search
CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);  -- sqrt(num_rows) is a good starting point

-- Insert
INSERT INTO documents (content, embedding, source)
VALUES ('Refund policy...', '[0.12, -0.45, ...]'::vector, 'policy.pdf');

-- Cosine similarity search
SELECT content, source,
       1 - (embedding <=> query_embedding) AS similarity
FROM documents
ORDER BY embedding <=> '[0.11, -0.42, ...]'::vector  -- <=> = cosine distance
LIMIT 5;

-- Combined filter + vector search
SELECT * FROM documents
WHERE source = 'policy.pdf'
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY embedding <=> query_embedding
LIMIT 5;
```

### FAISS (Facebook AI Similarity Search — Local, Fast)

```python
import faiss
import numpy as np

# Create index
dimension = 1536
index = faiss.IndexFlatIP(dimension)  # Inner product (cosine if normalized)

# Normalize and add vectors
embeddings = np.array([embed(text) for text in texts]).astype('float32')
faiss.normalize_L2(embeddings)  # Normalize for cosine similarity
index.add(embeddings)

# Search
query_vec = np.array([embed("search query")]).astype('float32')
faiss.normalize_L2(query_vec)
distances, indices = index.search(query_vec, k=5)

# For production: use IndexIVFFlat for large datasets (approximate, faster)
quantizer = faiss.IndexFlatIP(dimension)
index = faiss.IndexIVFFlat(quantizer, dimension, 100)  # 100 clusters
index.train(embeddings)  # Must train first!
index.add(embeddings)
```

---

## Advanced RAG Patterns

### Reranking

After vector search, use a cross-encoder to re-score retrieved chunks.

```python
from sentence_transformers import CrossEncoder

reranker = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')

# Initial retrieval (fast, approximate)
candidates = vector_store.search(query, k=20)

# Reranking (slower, more accurate)
scores = reranker.predict([(query, doc.content) for doc in candidates])
reranked = sorted(zip(candidates, scores), key=lambda x: x[1], reverse=True)
top_k = [doc for doc, score in reranked[:5]]
```

### Hybrid Search (BM25 + Vector)

```python
# BM25: keyword-based (good for exact matches, acronyms)
# Vector: semantic (good for paraphrases, synonyms)
# Hybrid: best of both

from langchain.retrievers import BM25Retriever, EnsembleRetriever

bm25_retriever = BM25Retriever.from_documents(docs)
bm25_retriever.k = 10

vector_retriever = vector_store.as_retriever(search_kwargs={"k": 10})

ensemble = EnsembleRetriever(
    retrievers=[bm25_retriever, vector_retriever],
    weights=[0.5, 0.5]  # Tune based on your data
)
```

### Contextual Compression

```python
from langchain.retrievers.document_compressors import LLMChainExtractor
from langchain.retrievers import ContextualCompressionRetriever

# Instead of returning entire chunks, extract only relevant sentences
compressor = LLMChainExtractor.from_llm(llm)
retriever = ContextualCompressionRetriever(
    base_compressor=compressor,
    base_retriever=vector_store.as_retriever()
)
```

---

## RAG Evaluation Metrics

| Metric | What it measures | Tool |
|--------|-----------------|------|
| **Context Precision** | Retrieved chunks relevant? | RAGAS |
| **Context Recall** | All relevant info retrieved? | RAGAS |
| **Faithfulness** | Answer supported by context? | RAGAS |
| **Answer Relevancy** | Answer actually answers question? | RAGAS |

```python
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_recall

results = evaluate(
    dataset,
    metrics=[faithfulness, answer_relevancy, context_recall]
)
print(results)
# {'faithfulness': 0.87, 'answer_relevancy': 0.91, 'context_recall': 0.79}
```
