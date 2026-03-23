# Advanced RAG Retrieval Strategies

Basic RAG (embed query → nearest neighbours → generate) breaks down on complex questions, paraphrased queries, and long documents. These techniques fix that.

---

## 1. HyDE — Hypothetical Document Embeddings

**Problem:** Query embeddings and document embeddings live in different regions of the embedding space. "What is HNSW?" is semantically far from a paragraph that explains HNSW without ever quoting the question.

**Solution:** Ask the LLM to hallucinate an answer first, embed that hallucinated answer, then search with it.

```python
from openai import OpenAI
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings

client = OpenAI()
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
vectorstore = Chroma(embedding_function=embeddings, persist_directory="./chroma_db")

def hyde_retrieve(query: str, k: int = 5) -> list:
    # Step 1 — generate a hypothetical answer
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "Write a concise technical paragraph that would answer the following question. It may contain invented details; accuracy doesn't matter — only semantic style does."},
            {"role": "user", "content": query},
        ],
        max_tokens=200,
    )
    hypothetical_doc = resp.choices[0].message.content

    # Step 2 — embed the hypothetical doc and search
    return vectorstore.similarity_search(hypothetical_doc, k=k)

results = hyde_retrieve("What are the tradeoffs between HNSW and IVF indexes?")
```

**When to use:** Factual / technical Q&A where the query phrasing differs from the document phrasing. Adds ~1 LLM call latency.

---

## 2. Multi-Query Retrieval

**Problem:** A single query may miss relevant documents phrased differently.

**Solution:** Generate N paraphrases of the query, retrieve for each, deduplicate.

```python
from langchain.retrievers.multi_query import MultiQueryRetriever
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
retriever = vectorstore.as_retriever(search_kwargs={"k": 4})

multi_retriever = MultiQueryRetriever.from_llm(
    retriever=retriever,
    llm=llm,
)

# Under the hood it generates ~3 query variants, retrieves for each, deduplicates
docs = multi_retriever.invoke("How does HNSW index work?")

# Manual version if you want control:
def multi_query_retrieve(query: str, n_variants: int = 3, k: int = 4) -> list:
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{
            "role": "user",
            "content": f"Generate {n_variants} different phrasings of this question. Return only the questions, one per line.\n\nQuestion: {query}"
        }]
    )
    variants = [query] + resp.choices[0].message.content.strip().split("\n")

    seen, results = set(), []
    for q in variants:
        for doc in vectorstore.similarity_search(q, k=k):
            key = doc.page_content[:80]
            if key not in seen:
                seen.add(key)
                results.append(doc)
    return results
```

---

## 3. RAG Fusion — Reciprocal Rank Fusion

**Problem:** Different queries return different top docs. How do you merge the rankings?

**Solution:** Reciprocal Rank Fusion (RRF) — for each document, sum `1 / (rank + 60)` across all query result lists. Documents consistently appearing high across multiple queries score highest.

```python
from collections import defaultdict

def reciprocal_rank_fusion(result_lists: list[list], k: int = 60) -> list:
    """
    result_lists: list of lists of Documents (each list is results for one query)
    Returns merged list sorted by RRF score descending.
    """
    scores: dict[str, float] = defaultdict(float)
    doc_map: dict[str, any] = {}

    for results in result_lists:
        for rank, doc in enumerate(results):
            key = doc.page_content[:120]  # identity key
            scores[key] += 1.0 / (rank + k)
            doc_map[key] = doc

    sorted_keys = sorted(scores, key=lambda x: scores[x], reverse=True)
    return [doc_map[k] for k in sorted_keys]

# Usage
query_variants = [
    "HNSW index performance",
    "How fast is HNSW for approximate nearest neighbour search?",
    "HNSW vs brute force comparison",
]
all_results = [vectorstore.similarity_search(q, k=6) for q in query_variants]
fused = reciprocal_rank_fusion(all_results)
top_docs = fused[:5]
```

---

## 4. Parent-Child Chunking (Small-to-Big)

**Problem:** Small chunks are precise for retrieval but lack context for generation. Large chunks have context but are too coarse to retrieve accurately.

**Solution:** Index small chunks, but when retrieved, return their parent (larger) chunk for generation.

```python
from langchain.retrievers import ParentDocumentRetriever
from langchain.storage import InMemoryByteStore
from langchain_text_splitters import RecursiveCharacterTextSplitter

# Child splitter — small, precise for retrieval
child_splitter = RecursiveCharacterTextSplitter(chunk_size=200, chunk_overlap=20)
# Parent splitter — large, rich context for generation
parent_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)

store = InMemoryByteStore()  # swap for Redis in production

retriever = ParentDocumentRetriever(
    vectorstore=vectorstore,
    docstore=store,
    child_splitter=child_splitter,
    parent_splitter=parent_splitter,
)

# Index documents
retriever.add_documents(documents)

# Retrieve — searches small chunks, returns parent chunks
docs = retriever.invoke("What is HNSW?")
# Each doc is the parent chunk (~1000 chars), not the small matching chunk
```

---

## 5. Sentence Window Retrieval

**Problem:** A single sentence matches the query but one sentence alone is not enough context.

**Solution:** Index individual sentences, but retrieve a window of ±N sentences around the match.

```python
from llama_index.core.node_parser import SentenceWindowNodeParser
from llama_index.core.postprocessor import MetadataReplacementPostProcessor

# Parse documents into sentence nodes with window metadata
node_parser = SentenceWindowNodeParser.from_defaults(
    window_size=3,          # ±3 sentences
    window_metadata_key="window",
    original_text_metadata_key="original_text",
)

nodes = node_parser.get_nodes_from_documents(documents)

# After retrieval, replace node text with window text
postprocessor = MetadataReplacementPostProcessor(target_metadata_key="window")
# nodes_with_window = postprocessor.postprocess_nodes(retrieved_nodes)
```

---

## 6. Contextual Compression

**Problem:** Retrieved chunks contain irrelevant sentences. Stuffing 5 full chunks into the prompt wastes tokens and confuses the LLM.

**Solution:** After retrieval, use a fast LLM to extract only the parts of each chunk relevant to the query.

```python
from langchain.retrievers.document_compressors import LLMChainExtractor
from langchain.retrievers import ContextualCompressionRetriever
from langchain_openai import ChatOpenAI

compressor = LLMChainExtractor.from_llm(ChatOpenAI(model="gpt-4o-mini", temperature=0))

compression_retriever = ContextualCompressionRetriever(
    base_compressor=compressor,
    base_retriever=vectorstore.as_retriever(search_kwargs={"k": 6}),
)

compressed_docs = compression_retriever.invoke("What is HNSW?")
# Each doc is now only the relevant excerpt, not the full chunk
```

**Cheaper alternative — embeddings-based filtering (no LLM call):**

```python
from langchain.retrievers.document_compressors import EmbeddingsFilter

embeddings_filter = EmbeddingsFilter(
    embeddings=embeddings,
    similarity_threshold=0.76,  # drop chunks below this similarity to query
)

compression_retriever = ContextualCompressionRetriever(
    base_compressor=embeddings_filter,
    base_retriever=vectorstore.as_retriever(search_kwargs={"k": 10}),
)
```

---

## 7. Self-Query Retrieval (Metadata Filtering)

**Problem:** "Show me Python tutorials from 2024" — the date filter can't be expressed as a semantic similarity.

**Solution:** LLM parses the query into a semantic component + structured metadata filters.

```python
from langchain.retrievers.self_query.base import SelfQueryRetriever
from langchain.chains.query_constructor.base import AttributeInfo
from langchain_openai import ChatOpenAI

metadata_field_info = [
    AttributeInfo(name="year",     description="Year the document was written", type="integer"),
    AttributeInfo(name="topic",    description="Technical topic", type="string"),
    AttributeInfo(name="difficulty", description="beginner, intermediate, or advanced", type="string"),
]

self_query_retriever = SelfQueryRetriever.from_llm(
    llm=ChatOpenAI(model="gpt-4o-mini"),
    vectorstore=vectorstore,
    document_contents="Technical tutorials and articles",
    metadata_field_info=metadata_field_info,
)

# LLM automatically extracts: semantic="Python async", filter={year: 2024, difficulty: "beginner"}
docs = self_query_retriever.invoke("Show me beginner Python async tutorials from 2024")
```

---

## 8. Hybrid Search — Keyword + Semantic

**Problem:** Semantic search misses exact keyword matches (e.g., error codes, function names, product IDs).

**Solution:** Combine BM25 (keyword) + dense vector search, merge with RRF.

```python
from langchain_community.retrievers import BM25Retriever
from langchain.retrievers import EnsembleRetriever

# BM25 (keyword-based, no embeddings)
bm25_retriever = BM25Retriever.from_documents(documents, k=5)

# Dense vector retriever
dense_retriever = vectorstore.as_retriever(search_kwargs={"k": 5})

# Ensemble — weights sum to 1.0
hybrid_retriever = EnsembleRetriever(
    retrievers=[bm25_retriever, dense_retriever],
    weights=[0.4, 0.6],  # 40% keyword, 60% semantic
)

docs = hybrid_retriever.invoke("CUDA out of memory RuntimeError")
```

**pgvector hybrid search (SQL):**
```sql
-- Combine full-text search rank + vector similarity
SELECT id, content,
       ts_rank(to_tsvector('english', content), plainto_tsquery('HNSW index')) AS bm25,
       1 - (embedding <=> $1) AS semantic
FROM documents
ORDER BY (0.4 * ts_rank(...) + 0.6 * (1 - (embedding <=> $1))) DESC
LIMIT 10;
```

---

## Strategy Selection Guide

| Strategy | Best for | Extra latency | Extra cost |
|---|---|---|---|
| Basic similarity | Simple factual Q&A | 0 | 0 |
| **HyDE** | Technical docs, query phrasing mismatch | +1 LLM call | Low |
| **Multi-query** | Ambiguous or broad queries | +1 LLM call | Low |
| **RAG Fusion** | Multi-source retrieval | +N searches | 0 |
| **Parent-child** | Long documents, need context | 0 | 0 |
| **Sentence window** | Dense text, need surrounding context | 0 | 0 |
| **Contextual compression** | Token budget tight, noisy chunks | +N LLM calls | Medium |
| **Self-query** | Structured metadata + semantic | +1 LLM call | Low |
| **Hybrid BM25+dense** | Code, error messages, proper nouns | 0 | 0 |

**Production recommendation:** Start with hybrid search + parent-child chunking. Add HyDE if precision is low on technical queries.

---

## Links to Refer

- [LangChain Retrieval Docs](https://python.langchain.com/docs/modules/data_connection/retrievers/)
- [RAG Fusion paper](https://arxiv.org/abs/2402.03367)
- [HyDE paper](https://arxiv.org/abs/2212.10496)
- [LlamaIndex Sentence Window](https://docs.llamaindex.ai/en/stable/examples/node_postprocessor/MetadataReplacementDemo/)
