# FastAPI for AI Services

## Why FastAPI for AI?

- **Async-native** — perfect for concurrent LLM calls (non-blocking I/O)
- **Pydantic built-in** — request/response validation, auto-docs
- **Streaming support** — `StreamingResponse` for SSE token streaming
- **Auto OpenAPI docs** at `/docs` and `/redoc`
- **Python** — same language as your ML code

---

## Basic Setup

```python
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, AsyncGenerator
import asyncio
import os

app = FastAPI(
    title="AI API",
    description="RAG-powered Q&A service",
    version="1.0.0",
)

# ── Models ────────────────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=4000)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=1000, ge=1, le=4096)
    stream: bool = False

class QueryResponse(BaseModel):
    answer: str
    sources: list[str] = []
    tokens_used: int = 0

# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/ask", response_model=QueryResponse)
async def ask(req: QueryRequest):
    try:
        answer = await generate_answer(req.question, req.temperature)
        return QueryResponse(answer=answer, sources=[])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")
```

---

## Streaming SSE Responses

```python
from openai import AsyncOpenAI
import json

async_openai = AsyncOpenAI()

async def stream_tokens(question: str, temperature: float) -> AsyncGenerator[str, None]:
    """Generate SSE-formatted token stream."""
    try:
        async with async_openai.chat.completions.stream(
            model="gpt-4o",
            messages=[{"role": "user", "content": question}],
            temperature=temperature,
        ) as stream:
            async for chunk in stream:
                content = chunk.choices[0].delta.content
                if content:
                    # SSE format: data: {...}\n\n
                    yield f"data: {json.dumps({'token': content})}\n\n"

        yield f"data: {json.dumps({'done': True})}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


@app.post("/stream")
async def stream_answer(req: QueryRequest):
    return StreamingResponse(
        stream_tokens(req.question, req.temperature),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # disable nginx buffering
            "Connection": "keep-alive",
        },
    )
```

**Client-side (JavaScript):**
```javascript
const es = new EventSource("/stream?question=...");
es.onmessage = (e) => {
  const { token, done, error } = JSON.parse(e.data);
  if (done) { es.close(); return; }
  if (error) { console.error(error); return; }
  appendToken(token);
};
```

---

## Authentication & API Keys

```python
from fastapi import Security
from fastapi.security import APIKeyHeader

api_key_header = APIKeyHeader(name="X-API-Key")

async def verify_api_key(api_key: str = Security(api_key_header)):
    valid_keys = set(os.environ.get("VALID_API_KEYS", "").split(","))
    if api_key not in valid_keys:
        raise HTTPException(status_code=403, detail="Invalid API key")
    return api_key

# Protect routes
@app.post("/ask", dependencies=[Depends(verify_api_key)])
async def ask(req: QueryRequest):
    ...

# JWT auth
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt

bearer = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=["HS256"])
        return payload
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

@app.post("/ask")
async def ask(req: QueryRequest, user: dict = Depends(get_current_user)):
    ...
```

---

## Rate Limiting

```python
import time
from collections import defaultdict
import threading

class RateLimiter:
    def __init__(self, requests_per_minute: int = 60):
        self.rpm = requests_per_minute
        self.window = 60
        self.requests: dict[str, list[float]] = defaultdict(list)
        self.lock = threading.Lock()

    def is_allowed(self, key: str) -> bool:
        now = time.time()
        with self.lock:
            self.requests[key] = [t for t in self.requests[key] if now - t < self.window]
            if len(self.requests[key]) >= self.rpm:
                return False
            self.requests[key].append(now)
            return True

rate_limiter = RateLimiter(requests_per_minute=30)

async def check_rate_limit(request: Request):
    ip = request.client.host
    if not rate_limiter.is_allowed(ip):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

@app.post("/ask", dependencies=[Depends(check_rate_limit)])
async def ask(req: QueryRequest):
    ...
```

---

## Full RAG API

```python
from openai import AsyncOpenAI
import chromadb
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction

# Dependencies
openai_client = AsyncOpenAI()
chroma_client = chromadb.PersistentClient(path="./chroma_db")
embed_fn = OpenAIEmbeddingFunction(api_key=os.environ["OPENAI_API_KEY"])
collection = chroma_client.get_or_create_collection("docs", embedding_function=embed_fn)


class RAGRequest(BaseModel):
    question: str
    top_k: int = Field(default=3, ge=1, le=10)
    temperature: float = Field(default=0.3, ge=0.0, le=1.0)


class RAGResponse(BaseModel):
    answer: str
    sources: list[dict]
    context_used: int  # number of chars of context


@app.post("/rag/ask", response_model=RAGResponse)
async def rag_ask(req: RAGRequest):
    # 1. Retrieve relevant documents
    results = collection.query(query_texts=[req.question], n_results=req.top_k)
    docs = results["documents"][0]
    metadatas = results["metadatas"][0]

    # 2. Build context
    context = "\n\n---\n\n".join(
        f"[Source: {m.get('source', 'unknown')}]\n{doc}"
        for doc, m in zip(docs, metadatas)
    )

    # 3. Generate
    prompt = f"""Answer the question based ONLY on the context below.
If the answer is not in the context, say "I don't have enough information."

Context:
{context}

Question: {req.question}"""

    response = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are a helpful assistant. Be concise."},
            {"role": "user", "content": prompt}
        ],
        temperature=req.temperature,
    )

    return RAGResponse(
        answer=response.choices[0].message.content,
        sources=[{"text": d[:100], "meta": m} for d, m in zip(docs, metadatas)],
        context_used=len(context),
    )


@app.post("/rag/ingest")
async def ingest_documents(documents: list[str], source: str = "upload"):
    ids = [f"{source}-{i}" for i in range(len(documents))]
    metadatas = [{"source": source} for _ in documents]
    collection.add(documents=documents, ids=ids, metadatas=metadatas)
    return {"ingested": len(documents)}
```

---

## Middleware & CORS

```python
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
import time
import logging

logger = logging.getLogger(__name__)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://yourapp.com", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gzip compression
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Request logging + timing
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration = time.perf_counter() - start
    logger.info(f"{request.method} {request.url.path} {response.status_code} {duration:.3f}s")
    response.headers["X-Process-Time"] = str(duration)
    return response
```

---

## Background Tasks & Lifespan

```python
from fastapi import BackgroundTasks
from contextlib import asynccontextmanager

# Application lifespan (startup/shutdown)
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Loading models...")
    app.state.embedder = SentenceTransformer("BAAI/bge-small-en-v1.5")
    logger.info("Models loaded")
    yield
    # Shutdown
    logger.info("Shutting down...")

app = FastAPI(lifespan=lifespan)

# Background tasks (fire-and-forget)
def log_query(question: str, answer: str, user_id: str):
    # runs after response is sent
    db.insert({"question": question, "answer": answer, "user_id": user_id})

@app.post("/ask")
async def ask(req: QueryRequest, background_tasks: BackgroundTasks, user = Depends(get_current_user)):
    answer = await generate_answer(req.question)
    background_tasks.add_task(log_query, req.question, answer, user["id"])
    return {"answer": answer}
```

---

## Deployment

```dockerfile
# Dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

```bash
# Run locally
uvicorn main:app --reload --port 8000

# Production
uvicorn main:app --workers 4 --host 0.0.0.0 --port 8000

# With gunicorn (process manager)
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```
