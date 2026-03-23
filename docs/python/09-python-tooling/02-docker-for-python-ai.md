# Docker for Python AI Services

## Basic Dockerfile for FastAPI + AI

```dockerfile
# Dockerfile
FROM python:3.11-slim

# Prevent .pyc files and enable unbuffered stdout (important for logging)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install dependencies first (Docker layer cache — only rebuilds if requirements change)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY src/ ./src/

# Non-root user (security best practice)
RUN useradd --create-home appuser && chown -R appuser /app
USER appuser

EXPOSE 8000

CMD ["uvicorn", "src.api:app", "--host", "0.0.0.0", "--port", "8000"]
```

```bash
# Build & run
docker build -t my-ai-api .
docker run -p 8000:8000 --env-file .env my-ai-api

# Development with hot reload
docker run -p 8000:8000 -v $(pwd)/src:/app/src --env-file .env my-ai-api \
  uvicorn src.api:app --host 0.0.0.0 --port 8000 --reload
```

---

## Multi-stage Build (Smaller Production Image)

```dockerfile
# Stage 1: Build dependencies
FROM python:3.11-slim AS builder

WORKDIR /app
COPY requirements.txt .

# Install to a prefix directory (not system Python)
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Stage 2: Runtime (no build tools, smaller image)
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

# Copy only installed packages from builder
COPY --from=builder /install /usr/local

WORKDIR /app
COPY src/ ./src/

RUN useradd --create-home appuser && chown -R appuser /app
USER appuser

EXPOSE 8000
CMD ["uvicorn", "src.api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

Result: image goes from ~1.2GB → ~250MB for a typical FastAPI + OpenAI app.

---

## docker-compose for Local Dev (FastAPI + Chroma)

```yaml
# docker-compose.yml
services:
  api:
    build: .
    ports:
      - "8000:8000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - CHROMA_HOST=chromadb
      - CHROMA_PORT=8001
    volumes:
      - ./src:/app/src   # hot reload in dev
    depends_on:
      - chromadb
    command: uvicorn src.api:app --host 0.0.0.0 --port 8000 --reload

  chromadb:
    image: chromadb/chroma:latest
    ports:
      - "8001:8001"
    volumes:
      - chroma_data:/chroma/chroma    # persist embeddings between restarts

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  chroma_data:
```

```bash
# Start all services
docker compose up

# Rebuild after dependency changes
docker compose up --build

# Run in background
docker compose up -d

# View logs
docker compose logs -f api

# Stop
docker compose down

# Stop + remove volumes (reset all data)
docker compose down -v
```

---

## GPU Support (PyTorch / CUDA)

```dockerfile
# Use NVIDIA CUDA base image (for GPU inference)
FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04

RUN apt-get update && apt-get install -y python3.11 python3-pip && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cu121
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/
CMD ["python", "-m", "uvicorn", "src.api:app", "--host", "0.0.0.0", "--port", "8000"]
```

```yaml
# docker-compose for GPU
services:
  api:
    build: .
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

```bash
# Run with GPU access
docker run --gpus all my-gpu-api
```

---

## .dockerignore

```
# .dockerignore
**/__pycache__
**/*.pyc
**/.pytest_cache
**/.mypy_cache
**/.ruff_cache
.git
.venv
*.egg-info
.env
*.env
tests/
docs/
*.md
chroma_db/    # don't include local vector DB data
*.pt          # don't include model weights (too large)
```

---

## Environment Variables Pattern

```bash
# .env (never commit)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# .env.example (commit this as template)
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
```

```python
# In application — pydantic-settings reads from .env
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    openai_api_key: str
    anthropic_api_key: str = ""       # optional
    chroma_host: str = "localhost"
    chroma_port: int = 8001
    redis_url: str = "redis://localhost:6379"

    model_config = {"env_file": ".env"}

settings = Settings()
```

---

## Health Check

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1
```

```python
# FastAPI health endpoint
@app.get("/health")
async def health():
    return {"status": "ok", "model": settings.model_name}
```

---

## Common Commands Reference

```bash
# Images
docker images                     # list local images
docker pull python:3.11-slim       # pull from registry
docker rmi my-ai-api               # remove image
docker system prune                # clean dangling images

# Containers
docker ps                          # running containers
docker ps -a                       # all containers
docker stop <id>                   # stop container
docker rm <id>                     # remove container
docker logs <id> -f                # follow logs
docker exec -it <id> bash          # shell into running container

# Debugging
docker run --rm -it my-ai-api bash  # interactive shell in image
docker inspect <id>                 # full container metadata

# Build
docker build -t my-app:v1.2 .      # build with tag
docker build --no-cache .           # force full rebuild
```

---

## Interview Q&A

**Q: Why use `PYTHONUNBUFFERED=1` in Docker?**

Python buffers stdout by default for performance. In Docker, this means your `print()` and `logging` output may not appear in `docker logs` until the buffer flushes. `PYTHONUNBUFFERED=1` disables this so logs appear immediately — critical for debugging and observability.

**Q: Why copy `requirements.txt` before the rest of the code?**

Docker builds layer by layer and caches each layer. If you copy everything at once, any code change invalidates the layer that installs pip packages — causing a slow full reinstall on every build. By copying requirements.txt first and installing packages as a separate layer, only a `requirements.txt` change triggers package reinstallation. Normal code changes just rebuild the final code-copy layer.

**Q: What's the difference between `CMD` and `ENTRYPOINT`?**

`ENTRYPOINT` sets the executable that always runs — it can't be overridden by `docker run` arguments (only with `--entrypoint`). `CMD` sets default arguments to the entrypoint (or the default command if no ENTRYPOINT). Common pattern: `ENTRYPOINT ["uvicorn"]` + `CMD ["src.api:app", "--host", "0.0.0.0"]` — lets you override args while keeping uvicorn fixed.
