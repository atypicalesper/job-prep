# RAG & Vector Databases — Interview Questions

### Q1: Explain the full RAG pipeline from document ingestion to response.

**Answer:**

```
OFFLINE (build once, update as docs change):

1. Load documents
   PDFLoader, WebLoader, CSVLoader, DatabaseLoader...

2. Split into chunks
   RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)

3. Embed each chunk
   OpenAI text-embedding-3-small → 1536-dim vector

4. Store in vector DB
   (vector, text, metadata) → ChromaDB / Pinecone / pgvector

──────────────────────────────────────────────────

ONLINE (every query):

1. Receive user query: "What's the return policy?"

2. Embed the query (same model as indexing!)
   "What's the return policy?" → [0.12, -0.45, ...]

3. Cosine similarity search in vector DB
   → Returns top-3 most similar chunks

4. Build prompt:
   """
   Answer based only on this context:
   [Chunk 1: "Returns accepted within 30 days..."]
   [Chunk 2: "Original packaging required..."]
   [Chunk 3: "Refunds processed in 5-7 business days..."]

   Question: What's the return policy?
   """

5. LLM generates response grounded in retrieved context

6. Return response (optionally with source citations)
```

---

### Q2: What is cosine similarity and why is it preferred over Euclidean distance for text embeddings?

**Answer:**

```
Cosine similarity = cos(θ) = (A · B) / (|A| × |B|)
  Range: -1 (opposite) to +1 (identical)
  = 1 when vectors point same direction regardless of magnitude

Euclidean distance = √(Σ(aᵢ - bᵢ)²)
  = 0 when vectors are identical

Why cosine for text:
─────────────────────────────────────────────────────────
"The cat sat" → [0.2, 0.8, 0.3]
"The cat sat on the mat" → [0.4, 1.6, 0.6]

Euclidean: different (longer text = different magnitude)
Cosine: similar! (same direction — same topic)

Text length shouldn't affect semantic similarity.
"Quick summary: X" and "Detailed explanation of X"
should be similar despite different lengths.

When to use L2/Euclidean:
- Image embeddings
- When magnitude carries meaning
- Some recommendation systems
```

---

### Q3: What's the difference between IVFFlat and HNSW indexes in vector databases? When do you use each?

**Answer:**

```
IVFFlat (Inverted File Index + Flat):
────────────────────────────────────
How it works:
  1. Clusters vectors into N groups (training step)
  2. Query: find nearest cluster centers, search those clusters only

Trade-offs:
  ✓ Low memory footprint
  ✓ Good for large-scale (millions of vectors)
  ✗ Requires training step (slow to build)
  ✗ Speed/recall tunable (nprobe parameter)
  ✗ Lower recall than HNSW at same speed

Use when: memory is constrained, dataset > 1M vectors

HNSW (Hierarchical Navigable Small World):
──────────────────────────────────────────
How it works:
  - Graph structure with multiple layers
  - Top layers: coarse navigation, bottom: fine search
  - Like skipping through chapters before reading pages

Trade-offs:
  ✓ Best recall/speed trade-off
  ✓ No training step (add vectors incrementally)
  ✓ Default in Pinecone, Weaviate, Qdrant
  ✗ Higher memory usage (stores graph edges)
  ✗ Slower inserts (must update graph)

Use when: recall matters, moderate scale (< 10M vectors)

In practice: Pinecone uses HNSW by default. pgvector uses IVFFlat.
For ChromaDB: HNSW by default.
```

---

### Q4: Your RAG system returns accurate chunks but the final answer is still wrong. What do you investigate?

**Answer — systematic debugging:**

```
Step 1: Verify retrieval quality
  - Log what chunks were retrieved
  - Manually check: are they actually relevant?
  - Check context_recall and context_precision metrics

  Fix if bad retrieval:
  ├── Improve chunking (too small → missing context)
  ├── Better embedding model
  ├── Add reranking step
  ├── Try hybrid search (BM25 + vector)
  └── Add metadata filtering

Step 2: Verify the prompt
  - Is context injected correctly?
  - Is the model instructed to use ONLY the context?
  - Is there a maximum context length being exceeded?
  - Print the full prompt sent to the model

  Fix if bad prompt:
  ├── Add: "Answer based ONLY on the provided context"
  ├── Add: "If the answer is not in the context, say 'Not found'"
  ├── Reduce chunk size if context window exceeded
  └── Add few-shot examples of correct responses

Step 3: Model generation issues
  - Is temperature too high?
  - Is the model ignoring the context?
  - Is the context contradicting itself?

  Fix:
  ├── Lower temperature (0.0-0.1 for factual RAG)
  ├── Check for conflicting chunks (different doc versions)
  └── Add metadata (date, version) and instruct model to prefer recent
```

---

### Q5: What is metadata filtering in vector databases and why is it important?

**Answer:**

Vector search finds semantically similar docs — but sometimes you need to constrain the search space.

```python
# Without metadata filtering:
# "What's the return policy?" retrieves chunks from ALL documents
# Could return: shipping policy, competitor docs, old policy versions

# With metadata filtering:
results = collection.query(
    query_texts=["return policy"],
    n_results=5,
    where={
        "$and": [
            {"category": {"$eq": "policy"}},
            {"language": {"$eq": "en"}},
            {"version": {"$gte": "2024-01-01"}}
        ]
    }
)
# Only searches within policy documents, English, from 2024+

# Common metadata to store:
metadata = {
    "source": "policy.pdf",         # Source document
    "page": 3,                      # Page number
    "category": "returns",          # Document category
    "tenant_id": "company_abc",     # Multi-tenant isolation (CRITICAL for security)
    "last_updated": "2024-06-15",   # For freshness filtering
    "language": "en",               # For multilingual systems
    "chunk_index": 5,               # Position in original document
}
```

**Multi-tenancy warning:** In SaaS systems, always filter by `tenant_id` — otherwise users could retrieve other tenants' data!

---

### Q6: How do you handle documents that change frequently in a RAG system?

**Answer:**

```python
# Strategy 1: Full re-index (simple, expensive)
# Delete all vectors for a document, re-chunk, re-embed, re-insert
def update_document(doc_id: str, new_content: str):
    collection.delete(where={"source": doc_id})  # Delete old chunks
    chunks = splitter.split_text(new_content)
    collection.add(
        documents=chunks,
        ids=[f"{doc_id}_chunk_{i}" for i in range(len(chunks))],
        metadatas=[{"source": doc_id, "updated_at": now()} for _ in chunks]
    )

# Strategy 2: Version tagging (keep history)
metadata = {
    "source": "policy.pdf",
    "version": "2024-06-15",
    "is_current": True
}
# Query only current: where={"is_current": True}
# On update: set old version is_current=False, add new version

# Strategy 3: Change detection
import hashlib
def needs_reindex(doc_id: str, new_content: str) -> bool:
    new_hash = hashlib.md5(new_content.encode()).hexdigest()
    stored_hash = get_stored_hash(doc_id)
    return new_hash != stored_hash

# Strategy 4: Webhook-triggered re-indexing
# Notion/Confluence webhook → Lambda/Cloud Function → re-index changed page
```
