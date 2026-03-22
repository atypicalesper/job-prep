# Python for LLMs — OpenAI, Anthropic & HuggingFace SDKs

## OpenAI SDK

```python
from openai import OpenAI, AsyncOpenAI

# Sync client
client = OpenAI(
    api_key=os.environ["OPENAI_API_KEY"],
    # base_url="https://api.openai.com/v1",  # custom endpoint / proxy
    # timeout=30,
    # max_retries=3,
)

# Basic chat
def chat(prompt: str, system: str = "You are a helpful assistant.") -> str:
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": prompt},
        ],
        temperature=0.7,
        max_tokens=1000,
        top_p=1.0,
        frequency_penalty=0.0,
        presence_penalty=0.0,
    )
    return response.choices[0].message.content

# Multi-turn conversation
def multi_turn():
    messages = [{"role": "system", "content": "You are a helpful assistant."}]

    while True:
        user_input = input("You: ")
        if user_input == "quit": break

        messages.append({"role": "user", "content": user_input})

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages
        )
        assistant_msg = response.choices[0].message.content
        messages.append({"role": "assistant", "content": assistant_msg})
        print(f"AI: {assistant_msg}")
```

### Streaming

```python
# Sync streaming
def stream_chat(prompt: str):
    stream = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        stream=True,
    )
    for chunk in stream:
        content = chunk.choices[0].delta.content
        if content:
            print(content, end="", flush=True)

# Async streaming (for FastAPI / web servers)
async def async_stream(prompt: str):
    async_client = AsyncOpenAI()
    async with async_client.chat.completions.stream(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}]
    ) as stream:
        async for chunk in stream:
            content = chunk.choices[0].delta.content
            if content:
                yield content
```

### Function Calling / Tool Use

```python
import json

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get the current weather in a city",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {"type": "string", "description": "The city name"},
                    "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]},
                },
                "required": ["city"],
            },
        }
    }
]

def get_weather(city: str, unit: str = "celsius") -> dict:
    return {"city": city, "temp": 22, "unit": unit, "condition": "sunny"}

def chat_with_tools(user_message: str) -> str:
    messages = [{"role": "user", "content": user_message}]

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        tools=tools,
        tool_choice="auto",  # "none", "auto", or specific tool
    )

    msg = response.choices[0].message

    # If the model wants to call a tool
    if msg.tool_calls:
        messages.append(msg)  # add assistant message with tool_calls

        for tool_call in msg.tool_calls:
            fn_name = tool_call.function.name
            fn_args = json.loads(tool_call.function.arguments)

            # Call the actual function
            if fn_name == "get_weather":
                result = get_weather(**fn_args)

            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": json.dumps(result),
            })

        # Second call with tool results
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=tools,
        )

    return response.choices[0].message.content
```

### Structured Output (JSON Mode)

```python
from pydantic import BaseModel
from typing import List

class SentimentResult(BaseModel):
    sentiment: str           # positive, negative, neutral
    confidence: float
    key_phrases: List[str]

# Option 1: JSON mode (any valid JSON)
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": f"Analyze sentiment: {text}"}],
    response_format={"type": "json_object"},
)
result = json.loads(response.choices[0].message.content)

# Option 2: Structured output with Pydantic (gpt-4o-mini and above)
response = client.beta.chat.completions.parse(
    model="gpt-4o",
    messages=[{"role": "user", "content": f"Analyze: {text}"}],
    response_format=SentimentResult,
)
parsed = response.choices[0].message.parsed
print(parsed.sentiment, parsed.confidence)
```

---

## Anthropic (Claude) SDK

```python
import anthropic

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

# Basic message
def ask_claude(prompt: str) -> str:
    message = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    )
    return message.content[0].text

# With system prompt
def ask_claude_with_system(prompt: str, system: str) -> str:
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=system,  # system is a top-level param, not a message
        messages=[{"role": "user", "content": prompt}]
    )
    return message.content[0].text

# Streaming
def stream_claude(prompt: str):
    with client.messages.stream(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    ) as stream:
        for text in stream.text_stream:
            print(text, end="", flush=True)

# Async
async def async_claude(prompt: str) -> str:
    async_client = anthropic.AsyncAnthropic()
    message = await async_client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    )
    return message.content[0].text

# Tool use (Claude's version of function calling)
tools = [{
    "name": "search_docs",
    "description": "Search internal documentation",
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "max_results": {"type": "integer", "default": 5}
        },
        "required": ["query"]
    }
}]

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    tools=tools,
    messages=[{"role": "user", "content": "What does our docs say about auth?"}]
)

if response.stop_reason == "tool_use":
    for block in response.content:
        if block.type == "tool_use":
            result = search_docs(block.input["query"])
            # Continue conversation with tool result
```

### Multi-modal (Images)

```python
import base64

def analyze_image(image_path: str, question: str) -> str:
    with open(image_path, "rb") as f:
        image_data = base64.standard_b64encode(f.read()).decode("utf-8")

    message = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": image_data,
                    }
                },
                {"type": "text", "text": question}
            ]
        }]
    )
    return message.content[0].text

# URL-based image
message = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=1024,
    messages=[{
        "role": "user",
        "content": [
            {"type": "image", "source": {"type": "url", "url": "https://..."}},
            {"type": "text", "text": "What is in this image?"}
        ]
    }]
)
```

---

## HuggingFace Transformers

```python
from transformers import pipeline, AutoTokenizer, AutoModelForCausalLM
import torch

# High-level pipeline API (easiest)
# Text generation
generator = pipeline("text-generation", model="gpt2")
result = generator("Once upon a time", max_new_tokens=50, num_return_sequences=3)
for r in result:
    print(r["generated_text"])

# Text classification
classifier = pipeline("text-classification", model="distilbert-base-uncased-finetuned-sst-2-english")
result = classifier("This movie is amazing!")
# [{"label": "POSITIVE", "score": 0.9998}]

# Named entity recognition
ner = pipeline("ner", model="dbmdz/bert-large-cased-finetuned-conll03-english", aggregation_strategy="simple")
result = ner("Tarun Singh works at Crownstack in Delhi")
# [{"entity_group": "PER", "word": "Tarun Singh"}, ...]

# Zero-shot classification (no fine-tuning needed)
classifier = pipeline("zero-shot-classification", model="facebook/bart-large-mnli")
result = classifier(
    "I love playing cricket",
    candidate_labels=["sports", "politics", "technology", "food"]
)
print(result["labels"][0])  # "sports"

# Sentence embeddings
embedder = pipeline("feature-extraction", model="BAAI/bge-small-en-v1.5")
embeddings = embedder(["Hello world", "Hi there"], return_tensors=True)
```

### Low-level API (for fine-tuning / custom models)

```python
model_name = "microsoft/phi-2"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype=torch.float16,  # fp16 saves memory
    device_map="auto",          # auto-assign to GPU/CPU
)

# Inference
inputs = tokenizer("The capital of France is", return_tensors="pt")
with torch.no_grad():
    outputs = model.generate(
        **inputs,
        max_new_tokens=50,
        temperature=0.7,
        do_sample=True,
        pad_token_id=tokenizer.eos_token_id,
    )
print(tokenizer.decode(outputs[0], skip_special_tokens=True))
```

### HuggingFace Inference API (no local GPU needed)

```python
import requests

API_URL = "https://api-inference.huggingface.co/models/gpt2"
headers = {"Authorization": f"Bearer {os.environ['HF_API_TOKEN']}"}

def query(payload):
    response = requests.post(API_URL, headers=headers, json=payload)
    return response.json()

output = query({"inputs": "The answer to life is", "parameters": {"max_new_tokens": 50}})
```

### sentence-transformers (for embeddings in RAG)

```python
from sentence_transformers import SentenceTransformer, util

model = SentenceTransformer("BAAI/bge-large-en-v1.5")

# Encode documents
docs = ["Machine learning is great", "Python is awesome", "I like coffee"]
doc_embeddings = model.encode(docs, normalize_embeddings=True, convert_to_tensor=True)

# Encode query
query = "What programming languages are good?"
query_embedding = model.encode(query, normalize_embeddings=True, convert_to_tensor=True)

# Semantic search
hits = util.semantic_search(query_embedding, doc_embeddings, top_k=2)
for hit in hits[0]:
    print(f"{docs[hit['corpus_id']]}: {hit['score']:.3f}")

# Batch encoding (much faster for large datasets)
batch_size = 64
all_embeddings = model.encode(large_doc_list, batch_size=batch_size, show_progress_bar=True)
```

---

## Production Patterns

```python
# 1. Retry with exponential backoff
import time
from openai import RateLimitError, APITimeoutError

def robust_chat(prompt: str, max_retries: int = 3) -> str:
    for attempt in range(max_retries):
        try:
            return client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}]
            ).choices[0].message.content
        except RateLimitError:
            wait = 2 ** attempt + random.uniform(0, 1)
            time.sleep(wait)
        except APITimeoutError:
            if attempt == max_retries - 1: raise
    raise Exception("Max retries exceeded")

# 2. Async batch processing with semaphore
import asyncio

async def process_batch(prompts: list[str], concurrency: int = 5) -> list[str]:
    sem = asyncio.Semaphore(concurrency)
    async_client = AsyncOpenAI()

    async def process_one(prompt: str) -> str:
        async with sem:
            resp = await async_client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}]
            )
            return resp.choices[0].message.content

    return await asyncio.gather(*[process_one(p) for p in prompts])

# 3. Token counting before calling API (avoid expensive overflows)
import tiktoken

enc = tiktoken.encoding_for_model("gpt-4o")
def count_tokens(text: str) -> int:
    return len(enc.encode(text))

def safe_chat(messages: list[dict], max_context: int = 100_000) -> str:
    total_tokens = sum(count_tokens(m["content"]) for m in messages)
    if total_tokens > max_context:
        raise ValueError(f"Context too large: {total_tokens} tokens")
    return client.chat.completions.create(model="gpt-4o", messages=messages).choices[0].message.content
```
