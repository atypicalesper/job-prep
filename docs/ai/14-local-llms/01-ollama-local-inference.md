# Local LLMs — Ollama, Quantization & Self-Hosted Inference

Running LLMs locally means no API costs, no data leaving your machine, and no rate limits. Essential for privacy-sensitive workloads and for experimenting with open-source models.

---

## Why Run Locally?

| Factor | Cloud API | Local |
|---|---|---|
| Cost | Per token (can be expensive) | Hardware cost (one-time) |
| Privacy | Data sent to vendor | Stays on-device |
| Latency | Network round trip | Low (VRAM limited) |
| Rate limits | Yes | No |
| Model choice | Provider's models only | Any open-source model |
| Offline use | ❌ | ✅ |

---

## Ollama — The Easiest Local LLM Server

[Ollama](https://ollama.ai) is a CLI + server that manages local model downloads and serves an OpenAI-compatible REST API.

### Setup

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Start the server
ollama serve    # runs on http://localhost:11434
```

### Pull and Run Models

```bash
# List available models
ollama list

# Pull models
ollama pull llama3.3          # Meta Llama 3.3 70B (4-bit quantized, ~40GB)
ollama pull llama3.2:3b       # 3B — runs on 4GB RAM
ollama pull mistral           # Mistral 7B
ollama pull qwen2.5:7b        # Qwen 2.5 7B — excellent for code
ollama pull deepseek-r1:7b    # DeepSeek R1 reasoning model
ollama pull phi4              # Microsoft Phi-4 14B — strong reasoning, small size
ollama pull nomic-embed-text  # Embedding model for RAG
ollama pull mxbai-embed-large # Better embeddings

# Interactive chat
ollama run llama3.2:3b

# One-shot
ollama run mistral "Explain RAG in 3 sentences"
```

### Use via OpenAI SDK (Drop-in)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:11434/v1",
    api_key="ollama",   # required by SDK but ignored by Ollama
)

# Chat
response = client.chat.completions.create(
    model="llama3.2:3b",
    messages=[{"role": "user", "content": "Explain HNSW index"}],
)
print(response.choices[0].message.content)

# Embeddings
emb = client.embeddings.create(
    model="nomic-embed-text",
    input="What is HNSW?",
)
print(emb.data[0].embedding[:5])
```

### Streaming with Ollama

```python
stream = client.chat.completions.create(
    model="qwen2.5:7b",
    messages=[{"role": "user", "content": "Write a FastAPI SSE endpoint"}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)
```

### Ollama in Docker (for servers)

```yaml
# docker-compose.yml
services:
  ollama:
    image: ollama/ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    # For GPU:
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

volumes:
  ollama_data:
```

```bash
docker compose up -d
docker exec -it ollama-ollama-1 ollama pull llama3.2:3b
```

---

## LangChain + Ollama for Local RAG

```python
from langchain_ollama import ChatOllama, OllamaEmbeddings
from langchain_chroma import Chroma
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

# Local LLM
llm = ChatOllama(model="llama3.2:3b", temperature=0)

# Local embeddings
embeddings = OllamaEmbeddings(model="nomic-embed-text")
vectorstore = Chroma(embedding_function=embeddings, persist_directory="./local_db")

# Local RAG chain — $0 per query
prompt = ChatPromptTemplate.from_template(
    "Answer using only this context:\n\n{context}\n\nQuestion: {question}"
)

chain = (
    {"context": vectorstore.as_retriever(), "question": RunnablePassthrough()}
    | prompt
    | llm
    | StrOutputParser()
)

print(chain.invoke("What is HNSW?"))
```

---

## Quantization — Run Bigger Models on Less Hardware

Quantization reduces model weights from 32-bit floats to 4-bit integers. A 7B model goes from ~14GB to ~4GB at negligible quality loss.

### Quantization Formats

| Format | Creator | Quality | Speed | Use case |
|---|---|---|---|---|
| **GGUF** | llama.cpp | Good | CPU+GPU | Ollama, LM Studio |
| **GPTQ** | AutoGPTQ | Excellent | GPU only | Production GPU |
| **AWQ** | MIT HAN Lab | Best quality | GPU only | Production GPU |
| **bitsandbytes** | HuggingFace | Good | GPU only | HF transformers |
| **GGML** | (legacy) | — | — | Superseded by GGUF |

### Precision Comparison

| Bits | Size (7B model) | Quality loss |
|---|---|---|
| fp32 | ~28GB | Baseline |
| fp16 | ~14GB | Negligible |
| int8 | ~7GB | Very small |
| **int4 (Q4_K_M)** | **~4.1GB** | **Small — recommended** |
| int3 | ~3GB | Moderate |
| int2 | ~2GB | Significant |

### HuggingFace bitsandbytes (4-bit)

```python
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
import torch

bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",           # NF4 quantization (best for LLMs)
    bnb_4bit_use_double_quant=True,       # nested quantization
    bnb_4bit_compute_dtype=torch.bfloat16,
)

model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3.2-3B-Instruct",
    quantization_config=bnb_config,
    device_map="auto",
)
tokenizer = AutoTokenizer.from_pretrained("meta-llama/Llama-3.2-3B-Instruct")

inputs = tokenizer("Explain RAG:", return_tensors="pt").to("cuda")
outputs = model.generate(**inputs, max_new_tokens=200)
print(tokenizer.decode(outputs[0], skip_special_tokens=True))
```

### AWQ (better quality than bitsandbytes)

```python
from awq import AutoAWQForCausalLM
from transformers import AutoTokenizer

model_path = "Qwen/Qwen2.5-7B-Instruct-AWQ"   # pre-quantized AWQ model from HF Hub

model = AutoAWQForCausalLM.from_quantized(model_path, fuse_layers=True, device_map="cuda")
tokenizer = AutoTokenizer.from_pretrained(model_path)
```

---

## Hardware Requirements

### CPU-only (Ollama GGUF Q4)

| Model | RAM needed | Speed (approx) |
|---|---|---|
| 1–3B | 4GB | ~20 tok/s on M1 |
| 7–8B | 8GB | ~10 tok/s on M1 |
| 13B | 16GB | ~5 tok/s on M1 |
| 70B | 48GB | ~1–2 tok/s on M1 Ultra |

### GPU (bitsandbytes/AWQ int4)

| Model | VRAM needed |
|---|---|
| 7–8B | 6–8GB (3090/4070) |
| 13B | 10–12GB (3080 Ti) |
| 70B | 40–48GB (2×A100) |

**Apple Silicon (Unified Memory):** macOS with MLX or Ollama can use the full unified memory pool — a MacBook Pro M3 Max with 128GB can run 70B models.

---

## MLX — Apple Silicon Optimized

[MLX](https://github.com/ml-explore/mlx) is Apple's ML framework for M-series chips, optimized for unified memory.

```bash
pip install mlx-lm
```

```python
from mlx_lm import load, generate

model, tokenizer = load("mlx-community/Llama-3.2-3B-Instruct-4bit")
response = generate(model, tokenizer, prompt="Explain HNSW", max_tokens=200)
print(response)
```

---

## vLLM — Production-Grade Self-Hosted Server

[vLLM](https://docs.vllm.ai) is the standard for high-throughput LLM serving with PagedAttention.

```bash
pip install vllm

# Serve a model
vllm serve meta-llama/Llama-3.2-3B-Instruct \
    --dtype auto \
    --max-model-len 8192 \
    --port 8000
```

```python
# Drop-in OpenAI compatible
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8000/v1", api_key="vllm")

response = client.chat.completions.create(
    model="meta-llama/Llama-3.2-3B-Instruct",
    messages=[{"role": "user", "content": "Hello!"}],
)
```

**vLLM advantages:** continuous batching (processes multiple requests simultaneously), PagedAttention (efficient KV cache), tensor parallelism across multiple GPUs.

---

## Choosing a Local Model (2025)

| Task | Recommended model | Size |
|---|---|---|
| General Q&A | Llama 3.3 70B (Q4) | ~40GB |
| Code generation | Qwen2.5-Coder 7B | ~4GB |
| Reasoning | DeepSeek-R1:7B | ~4.7GB |
| Small device / fast | Phi-4-mini | ~2.5GB |
| Embeddings (RAG) | nomic-embed-text | ~275MB |
| Multilingual | Qwen2.5:7B | ~4GB |

---

## Links to Refer

- [Ollama Documentation](https://ollama.ai/docs)
- [HuggingFace Model Hub](https://huggingface.co/models)
- [GGUF format explained](https://github.com/ggerganov/llama.cpp)
- [MLX Documentation](https://ml-explore.github.io/mlx/)
- [vLLM Documentation](https://docs.vllm.ai/)
- [TheBloke on HuggingFace](https://huggingface.co/TheBloke) — huge library of quantized GGUF models
