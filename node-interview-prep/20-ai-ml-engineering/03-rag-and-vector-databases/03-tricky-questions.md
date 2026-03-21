# RAG & Vector Databases — Tricky Questions

### Q1: You index 10,000 documents. Searches feel slow. You add more replicas but latency doesn't improve. Why?

**Answer:**

Replicas improve **throughput** (queries per second), not **latency per query**.

```
Slow query latency causes:
1. Index type: Flat (brute-force) search is O(n) — use HNSW or IVFFlat (ANN)
2. Vector dimension: 3072-dim is 2x slower to search than 1536-dim
3. No index: pgvector without CREATE INDEX = full table scan
4. Too many results: k=100 is slower than k=5
5. Network: embedding model call adds latency to query pipeline
6. Missing GPU: FAISS on CPU vs GPU can be 10-100x difference

Fixes by root cause:
├── Switch from Flat → HNSW index
├── Use smaller embedding model (all-MiniLM: 384-dim vs ada-002: 1536-dim)
├── Create index in pgvector: CREATE INDEX USING ivfflat...
├── Reduce k (top-k results)
├── Pre-compute query embeddings asynchronously
└── Use Pinecone/Qdrant (purpose-built, GPU-accelerated)

Replicas only help when:
- Many concurrent users cause queueing
- Single server is CPU-saturated
```

---

### Q2: Your RAG system's retrieval is perfect but the LLM "ignores" the context and answers from its training data. Why?

**Answer:**

This is a real phenomenon called **parametric vs non-parametric knowledge conflict**.

```
Causes:
1. Context is at the END of a long prompt
   → LLMs are recency-biased AND primacy-biased
   → "Lost in the middle" — middle context gets ignored

2. Model's training data strongly contradicts your context
   → Model has high confidence in its wrong answer

3. Context is too long
   → Model focuses on most prominent parts, skips redundant-looking sections

4. Prompt doesn't clearly instruct to prefer context over internal knowledge

Fixes:
```

```python
# Fix 1: Put context BEFORE the question, not after
prompt = f"""
Context information:
{context}

─────────────────────

Based ONLY on the context above, answer this question.
Do not use any other knowledge.
If the answer is not in the context, say "Not found."

Question: {question}
"""

# Fix 2: Strong instruction to use context
"You MUST cite specific parts of the context in your answer."
"The context supersedes your training knowledge."

# Fix 3: Split retrieval and generation — validate context is used
verification_prompt = f"""
Does this response: "{response}"
cite or use information from this context: "{context}"?
Answer YES or NO.
"""

# Fix 4: Use smaller, more focused context
# Don't send 5000 tokens — send only the 200 most relevant tokens
from langchain.retrievers import ContextualCompressionRetriever
```

---

### Q3: Explain the difference between dense retrieval and sparse retrieval. Which is better?

**Answer:**

```
Sparse Retrieval (BM25, TF-IDF):
  Represents docs as sparse bag-of-words vectors
  Exact keyword matching with frequency weighting
  "What is the capital of France?"
  → good at finding docs containing "capital", "France"
  ✓ Fast, deterministic, no training needed
  ✓ Great for: proper nouns, exact phrases, product codes, IDs
  ✗ "car" and "automobile" are completely different
  ✗ Synonym blindness

Dense Retrieval (embeddings):
  Represents docs as dense semantic vectors
  Semantic similarity matching
  "What is the capital of France?"
  → also finds docs about "Paris", "French government seat"
  ✓ Handles synonyms, paraphrases
  ✓ Cross-lingual similarity
  ✗ Poor at exact matches, numbers, rare words
  ✗ Requires expensive embedding computation

Which is better?
  Neither — they're complementary. Use HYBRID:

from langchain.retrievers import EnsembleRetriever
hybrid = EnsembleRetriever(
    retrievers=[bm25_retriever, dense_retriever],
    weights=[0.3, 0.7]  # Tune based on query type
)

Real example:
  Query: "AWS S3 bucket policy ACL"
  BM25: finds docs with those exact terms (accurate)
  Dense: finds docs about "cloud storage permissions" (broader)
  Hybrid: best of both
```

---

### Q4: You're building a multi-tenant RAG system for 500 companies. What are the data isolation approaches and trade-offs?

**Answer:**

```
Option 1: Separate vector DB per tenant
  ✓ Complete isolation — no cross-tenant leakage possible
  ✓ Can delete tenant's data by dropping their DB
  ✗ 500 databases = massive operational overhead
  ✗ Cold start latency for inactive tenants
  Use when: strict compliance requirements (HIPAA, SOC2), large tenants

Option 2: Separate namespace per tenant (Pinecone/ChromaDB)
  ✓ Logical isolation within one DB
  ✓ Easy to query only within namespace
  ✓ Tenant deletion = delete namespace
  ✗ Not true isolation — same infrastructure
  ✗ Noisy neighbor: busy tenant affects others
  Use when: medium-scale SaaS, standard compliance

Option 3: Metadata filtering per tenant (simple, risky)
  Implementation:
  ├── Store tenant_id in metadata
  ├── Always filter: where={"tenant_id": current_tenant}
  ✓ Simple, single DB
  ✗ Security depends on never forgetting the filter
  ✗ One bug = data leak across tenants
  ✗ Can't easily delete tenant data (delete by metadata = scan)
  Use only when: low-risk, internal tools, trusted users

Option 4: Hybrid (recommended for SaaS)
  - Small tenants: namespace-based isolation
  - Enterprise tenants: dedicated DB/cluster
  - Always enforce tenant_id at API layer, not just DB layer

Security rule: The filter must happen at the application layer,
not rely on the caller to pass tenant_id correctly.
Never expose raw vector search to untrusted input.
```

---

### Q5: What is the "embedding dimension mismatch" problem and how do you guard against it in production?

**Answer:**

```
Problem:
  You index with: text-embedding-ada-002 → 1536 dimensions
  Someone later queries with: text-embedding-3-small → also 1536 dims
  "Great, same dimensions!" — but different semantic spaces

  Query: "What's the return policy?"
  ada-002 embedding: [0.12, -0.45, 0.78, ...]
  3-small embedding: [0.34, 0.21, -0.56, ...] (completely different space!)

  Cosine similarity will be meaningless — you're comparing apples to oranges.

This also happens with:
  - Different versions of same model
  - Different normalization
  - Different tokenizers

Prevention:
```

```python
# 1. Store embedding model info in vector DB metadata
collection.create_collection(
    name="docs_v2",
    metadata={
        "embedding_model": "text-embedding-3-small",
        "embedding_dimensions": 1536,
        "created_at": "2024-06-15",
        "version": "1"
    }
)

# 2. Validate at query time
def validate_embedding_config(collection_name: str):
    metadata = get_collection_metadata(collection_name)
    assert metadata["embedding_model"] == CURRENT_EMBEDDING_MODEL, \
        f"Mismatch! Collection uses {metadata['embedding_model']}, query uses {CURRENT_EMBEDDING_MODEL}"

# 3. If you must switch models → full re-index
# Never incrementally add documents with a new model to an existing collection

# 4. Name collections by model
# "docs_ada002_v1" vs "docs_3small_v1" — obvious mismatch prevention
```
