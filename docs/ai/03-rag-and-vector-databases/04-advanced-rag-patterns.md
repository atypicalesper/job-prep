# Advanced RAG Patterns

## Why Basic RAG Fails

```
Basic RAG problems:
  1. Retrieval misses — user asks "What's the refund policy?"
     but doc says "Return & Exchange Guidelines" (semantic mismatch)
  2. Lost in the middle — model ignores chunks in the middle of context
  3. Conflicting chunks — retrieved docs contradict each other
  4. No temporal awareness — old docs retrieved for current questions
  5. Cross-document reasoning — answer requires combining 3+ docs
  6. Short queries — "Why?" doesn't provide enough signal to retrieve well
```

---

## Pattern 1: HyDE (Hypothetical Document Embeddings)

Instead of embedding the query, generate a hypothetical answer and embed that.

```python
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_core.prompts import ChatPromptTemplate

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

def hyde_retrieve(query: str, vectorstore, k: int = 5) -> list:
    # Step 1: Generate a hypothetical answer
    hyde_prompt = ChatPromptTemplate.from_template("""
    Write a paragraph that would directly answer this question.
    Be specific and detailed. This is a hypothetical answer for search purposes.

    Question: {question}
    Hypothetical Answer:""")

    hypothetical_answer = llm.invoke(hyde_prompt.format(question=query)).content

    # Step 2: Embed the hypothetical answer (not the query!)
    hyp_embedding = embeddings.embed_query(hypothetical_answer)

    # Step 3: Search using the hypothetical embedding
    docs = vectorstore.similarity_search_by_vector(hyp_embedding, k=k)
    return docs

# Why it works:
# Short query "refund policy" → embedding is sparse
# Hypothetical answer "Customers may return items within 30 days..."
# → embedding is dense and close to the actual policy document
```

---

## Pattern 2: Reranking

Retrieve more candidates, then rerank them with a cross-encoder for precision.

```python
from sentence_transformers import CrossEncoder
from langchain_openai import OpenAIEmbeddings
from langchain_chroma import Chroma

# Two-stage retrieval:
# Stage 1: Fast approximate search (top-20 candidates)
# Stage 2: Slow but accurate reranking (pick top-5)

reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")

def retrieve_and_rerank(query: str, vectorstore, initial_k=20, final_k=5) -> list:
    # Stage 1: Retrieve 20 candidates (recall-optimized)
    candidates = vectorstore.similarity_search(query, k=initial_k)

    # Stage 2: Score each candidate against the query
    pairs = [(query, doc.page_content) for doc in candidates]
    scores = reranker.predict(pairs)

    # Stage 3: Sort by score, return top-5 (precision-optimized)
    ranked = sorted(zip(scores, candidates), key=lambda x: x[0], reverse=True)
    return [doc for _, doc in ranked[:final_k]]

# Cohere reranker (API-based, higher quality):
import cohere
co = cohere.Client(api_key="...")

def cohere_rerank(query: str, docs: list, top_n: int = 5) -> list:
    texts = [doc.page_content for doc in docs]
    results = co.rerank(
        model="rerank-english-v3.0",
        query=query,
        documents=texts,
        top_n=top_n,
    )
    return [docs[r.index] for r in results.results]
```

---

## Pattern 3: Hybrid Search (Dense + Sparse)

Combine semantic search (vectors) with keyword search (BM25) for best of both worlds.

```python
from langchain_community.retrievers import BM25Retriever
from langchain.retrievers import EnsembleRetriever
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings

# Dense retriever (semantic — finds conceptually similar docs)
vectorstore = Chroma(embedding_function=OpenAIEmbeddings())
dense_retriever = vectorstore.as_retriever(search_kwargs={"k": 10})

# Sparse retriever (keyword — finds exact term matches)
bm25_retriever = BM25Retriever.from_documents(all_documents, k=10)

# Hybrid: combine both with Reciprocal Rank Fusion
hybrid_retriever = EnsembleRetriever(
    retrievers=[bm25_retriever, dense_retriever],
    weights=[0.4, 0.6],  # Slightly favor semantic
)

results = hybrid_retriever.invoke("JWT token expiration")
# Dense: finds docs about "authentication" and "session management"
# Sparse: finds docs containing exact string "JWT" and "expiration"
# Hybrid: best of both

# pgvector hybrid search (production-grade):
# SELECT id, content, embedding <=> $1 AS semantic_distance
# FROM documents
# WHERE to_tsvector('english', content) @@ plainto_tsquery($2)  -- BM25 filter
# ORDER BY semantic_distance
# LIMIT 10;
```

---

## Pattern 4: Self-Query / Metadata Filtering

Let the LLM generate structured filters from natural language queries.

```python
from langchain.retrievers.self_query.base import SelfQueryRetriever
from langchain.chains.query_constructor.base import AttributeInfo
from langchain_openai import ChatOpenAI
from langchain_chroma import Chroma

# Define metadata schema
metadata_field_info = [
    AttributeInfo(name="source", description="Document source file", type="string"),
    AttributeInfo(name="date", description="Document date (YYYY-MM-DD)", type="string"),
    AttributeInfo(name="category", description="Category: policy, technical, hr, legal", type="string"),
    AttributeInfo(name="department", description="Owning department", type="string"),
]

retriever = SelfQueryRetriever.from_llm(
    llm=ChatOpenAI(model="gpt-4o-mini", temperature=0),
    vectorstore=vectorstore,
    document_contents="Internal company documents",
    metadata_field_info=metadata_field_info,
)

# User asks: "What are the HR policies from 2024?"
# LLM generates filter: {"category": "hr", "date": {"$gte": "2024-01-01"}}
# Retriever applies filter before semantic search

results = retriever.invoke("What are the HR policies from 2024?")
# Returns only HR docs from 2024, not all docs about policies
```

---

## Pattern 5: Contextual Compression

Compress retrieved chunks to only include the relevant parts.

```python
from langchain.retrievers import ContextualCompressionRetriever
from langchain.retrievers.document_compressors import LLMChainExtractor
from langchain_openai import ChatOpenAI

# Problem: retrieved chunk is 500 tokens but only 50 tokens are relevant
# Solution: LLM extracts only the relevant portion

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
compressor = LLMChainExtractor.from_llm(llm)

compression_retriever = ContextualCompressionRetriever(
    base_compressor=compressor,
    base_retriever=vectorstore.as_retriever(search_kwargs={"k": 5}),
)

# Before compression: returns 5 full chunks (~2500 tokens total)
# After compression: returns only relevant sentences from each chunk (~300 tokens)
docs = compression_retriever.invoke("What is the cancellation policy?")
```

---

## Pattern 6: Multi-Query Retrieval

Generate multiple reformulations of the query to catch more relevant docs.

```python
from langchain.retrievers.multi_query import MultiQueryRetriever
from langchain_openai import ChatOpenAI

retriever = MultiQueryRetriever.from_llm(
    retriever=vectorstore.as_retriever(),
    llm=ChatOpenAI(model="gpt-4o-mini", temperature=0.3),
)

# User: "How do I cancel my subscription?"
# Generates:
#   1. "subscription cancellation process"
#   2. "how to end my plan"
#   3. "unsubscribe account termination"
# Retrieves for ALL three, deduplicates results
# Finds more relevant docs than any single query
results = retriever.invoke("How do I cancel my subscription?")
```

---

## Pattern 7: RAPTOR (Recursive Abstractive Processing)

Build a hierarchy of summaries for multi-level retrieval.

```python
# RAPTOR = bottom-up: summarize clusters of docs, then summarize those summaries
# Creates a "tree" of information at different abstraction levels

# Level 0: Raw documents (specific details)
# Level 1: Cluster summaries (topic-level)
# Level 2: Section summaries (high-level)
# Level 3: Document-level summary (overview)

# At query time: retrieve from ALL levels
# "Give me a high-level overview" → hits Level 2-3
# "What's the exact threshold for X?" → hits Level 0

# Implementation sketch:
from sklearn.cluster import KMeans
import numpy as np

def build_raptor_tree(documents: list, levels: int = 3):
    current_docs = documents

    for level in range(levels):
        # 1. Embed current docs
        embeddings = embed_documents(current_docs)

        # 2. Cluster into N groups
        n_clusters = max(2, len(current_docs) // 5)
        kmeans = KMeans(n_clusters=n_clusters)
        labels = kmeans.fit_predict(embeddings)

        # 3. Summarize each cluster
        summaries = []
        for cluster_id in range(n_clusters):
            cluster_docs = [d for d, l in zip(current_docs, labels) if l == cluster_id]
            combined = "\n\n".join([d.page_content for d in cluster_docs])
            summary = llm.invoke(f"Summarize these documents: {combined[:4000]}")
            summaries.append(Document(page_content=summary.content,
                                       metadata={"level": level + 1}))

        # 4. Add summaries to vector store
        vectorstore.add_documents(summaries)
        current_docs = summaries  # Next level summarizes the summaries
```

---

## Pattern 8: Corrective RAG (CRAG)

Evaluate retrieved docs and fall back to web search if they're not good enough.

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from langchain_community.tools.tavily_search import TavilySearchResults

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

def grade_document(query: str, document: str) -> str:
    """Grade if document is relevant to the query. Returns 'relevant' or 'irrelevant'."""
    grading_prompt = ChatPromptTemplate.from_template("""
    Is this document relevant to answering the question?
    Answer only 'relevant' or 'irrelevant'.

    Question: {question}
    Document: {document}
    """)
    result = llm.invoke(grading_prompt.format(question=query, document=document))
    return result.content.strip().lower()

def corrective_rag(query: str, vectorstore) -> str:
    # Step 1: Retrieve docs
    docs = vectorstore.similarity_search(query, k=4)

    # Step 2: Grade each doc
    relevant_docs = []
    has_irrelevant = False
    for doc in docs:
        grade = grade_document(query, doc.page_content)
        if grade == "relevant":
            relevant_docs.append(doc)
        else:
            has_irrelevant = True

    # Step 3: If docs are poor quality, supplement with web search
    if not relevant_docs or has_irrelevant:
        web_search = TavilySearchResults(max_results=3)
        web_results = web_search.invoke(query)
        web_docs = [Document(page_content=r["content"]) for r in web_results]
        relevant_docs.extend(web_docs)

    # Step 4: Generate answer from best available context
    context = "\n\n".join([d.page_content for d in relevant_docs])
    return llm.invoke(f"Answer based on context:\n{context}\n\nQuestion: {query}").content
```

---

## Advanced Chunking Strategies

```python
# 1. Semantic chunking (splits at topic boundaries, not fixed size)
from langchain_experimental.text_splitter import SemanticChunker
from langchain_openai import OpenAIEmbeddings

splitter = SemanticChunker(
    OpenAIEmbeddings(),
    breakpoint_threshold_type="percentile",
    breakpoint_threshold_amount=95,  # Split when similarity drops below 95th percentile
)
docs = splitter.split_text(long_document)

# 2. Document-aware chunking (respects headers, sections)
from langchain.text_splitter import MarkdownHeaderTextSplitter

headers_to_split_on = [
    ("#", "h1"),
    ("##", "h2"),
    ("###", "h3"),
]
splitter = MarkdownHeaderTextSplitter(headers_to_split_on=headers_to_split_on)
docs = splitter.split_text(markdown_content)
# Each chunk has metadata: {"h1": "Chapter 3", "h2": "Section 2.1"}

# 3. Sentence window retrieval (embed sentences, retrieve with surrounding context)
# Index: embed individual sentences
# Retrieve: return sentence + N sentences before/after for context
def sentence_window_retrieval(query, vectorstore, window=2):
    # Find the most relevant sentence
    relevant = vectorstore.similarity_search(query, k=3)
    expanded = []
    for doc in relevant:
        # Expand with surrounding context from original document
        start = max(0, doc.metadata["sentence_idx"] - window)
        end = doc.metadata["sentence_idx"] + window + 1
        window_text = " ".join(all_sentences[start:end])
        expanded.append(Document(page_content=window_text))
    return expanded

# 4. Late chunking (embed whole doc first, then chunk the embeddings)
# Preserves full document context in each chunk's embedding
# Better than chunking then embedding (each chunk is context-aware)
# Requires a model that supports it (Jina AI, some Cohere models)
```

---

## RAG Evaluation Deep Dive (RAGAS)

```python
from ragas import evaluate
from ragas.metrics import (
    faithfulness,          # Is answer grounded in retrieved context?
    answer_relevancy,      # Does answer address the question?
    context_precision,     # Are retrieved chunks actually relevant?
    context_recall,        # Did we retrieve all needed info? (needs ground truth)
    context_entity_recall, # Did we retrieve the right entities?
    answer_correctness,    # Is the answer factually correct? (needs ground truth)
)
from datasets import Dataset

# Build evaluation dataset
eval_data = {
    "question": ["What is the refund policy?", "How do I reset my password?"],
    "answer": ["You can refund within 30 days.", "Click Forgot Password on login."],
    "contexts": [
        ["Refund Policy: All items can be returned within 30 days..."],
        ["To reset: go to login page, click Forgot Password, enter email..."],
    ],
    "ground_truth": [  # Optional but enables more metrics
        "Items can be returned within 30 days for a full refund.",
        "Use the Forgot Password link on the login page.",
    ],
}

dataset = Dataset.from_dict(eval_data)

results = evaluate(
    dataset=dataset,
    metrics=[faithfulness, answer_relevancy, context_precision, context_recall],
)

print(results)
# {
#   "faithfulness": 0.92,      # 92% of claims are in the context
#   "answer_relevancy": 0.88,  # 88% of answer addresses the question
#   "context_precision": 0.85, # 85% of retrieved chunks are relevant
#   "context_recall": 0.79,    # Missed 21% of needed information
# }

# Low faithfulness → LLM is hallucinating despite good context
# Low context_precision → retrieval returning too much noise
# Low context_recall → missing relevant chunks (chunking/embedding issue)
# Low answer_relevancy → answer is off-topic despite good retrieval
```

---

## Production RAG Architecture

```
                    USER QUERY
                        │
              ┌─────────▼──────────┐
              │  Query Analysis    │  ← Classify: simple / complex / out-of-scope
              └─────────┬──────────┘
                        │
              ┌─────────▼──────────┐
              │  Query Expansion   │  ← Multi-query, HyDE, spelling correction
              └─────────┬──────────┘
                        │
           ┌────────────▼────────────┐
           │    Hybrid Retrieval     │  ← Dense + Sparse, metadata filter
           │  (initial k=20 docs)    │
           └────────────┬────────────┘
                        │
              ┌─────────▼──────────┐
              │    Reranking       │  ← Cross-encoder, pick top-5
              └─────────┬──────────┘
                        │
              ┌─────────▼──────────┐
              │  Context Assembly  │  ← Dedup, sort by relevance, format
              └─────────┬──────────┘
                        │
              ┌─────────▼──────────┐
              │  LLM Generation    │  ← With citations, streaming
              └─────────┬──────────┘
                        │
              ┌─────────▼──────────┐
              │  Response Check    │  ← Faithfulness check (optional)
              └─────────┬──────────┘
                        │
                    RESPONSE + CITATIONS
```

---

## Tricky RAG Interview Scenarios

**"Your RAG retrieves correctly but the LLM still gives wrong answers"**
```
Causes:
1. Context too long → lost in the middle (important info in middle is ignored)
   Fix: put most relevant chunk FIRST and LAST in context
2. Conflicting chunks → LLM hedges or picks wrong one
   Fix: deduplicate, or ask LLM to resolve conflicts explicitly
3. System prompt overriding context → trust issues
   Fix: explicit "Answer ONLY from the provided context below"
4. LLM training data conflicts with retrieved content
   Fix: stronger instruction: "Your training knowledge is outdated, use ONLY this context"
```

**"RAG works in testing but fails in production with real user queries"**
```
Distribution shift: test queries ≠ real queries
  - Test with a representative sample of real queries
  - Use LangSmith to capture and analyze production traces
  - A/B test retrieval strategies in production
  - Monitor context_precision metric over time
```
