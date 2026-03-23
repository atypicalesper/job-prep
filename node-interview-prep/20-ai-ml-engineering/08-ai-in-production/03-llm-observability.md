# LLM Observability & Monitoring

LLMs fail silently — bad outputs don't throw exceptions. Observability is how you catch regressions, cost spikes, and quality drift before users do.

---

## What to Observe

| Metric | Why it matters |
|---|---|
| **Latency** (TTFT + total) | User experience — TTFT is first token, total is full response |
| **Token usage** | Directly maps to cost; detect prompt bloat |
| **Cost per request** | Unit economics — cost per user, per query type |
| **Error rate** | API failures, timeouts, context length exceeded |
| **Output quality** | Faithfulness, relevance — hardest to measure |
| **Retrieval quality** | Top-k hit rate, chunk relevance |
| **Guardrail triggers** | How often safety filters fire |

---

## 1. LangSmith — Tracing + Evaluation

LangSmith is the official LangChain observability platform. Traces every LLM call, retrieval, chain step.

```python
import os
os.environ["LANGCHAIN_TRACING_V2"] = "true"
os.environ["LANGCHAIN_API_KEY"]    = "your-langsmith-api-key"
os.environ["LANGCHAIN_PROJECT"]    = "rag-production"

# That's it — all LangChain calls are automatically traced
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

llm = ChatOpenAI(model="gpt-4o-mini")
chain = ChatPromptTemplate.from_template("Answer: {question}") | llm
chain.invoke({"question": "What is RAG?"})

# LangSmith captures: input, output, latency, token count, cost, model params
```

**Manual tracing (non-LangChain code):**

```python
from langsmith import traceable

@traceable(name="rag-pipeline", tags=["production"])
def rag_pipeline(query: str) -> str:
    docs   = retrieve(query)        # automatically traced as child span
    answer = generate(query, docs)  # automatically traced as child span
    return answer
```

**Datasets and evaluations:**

```python
from langsmith import Client
from langsmith.evaluation import evaluate

client = Client()

# Create a dataset of golden examples
dataset = client.create_dataset("rag-golden-set")
client.create_examples(
    inputs=[{"question": "What is HNSW?"}, {"question": "Explain RAG"}],
    outputs=[{"answer": "HNSW is..."}, {"answer": "RAG is..."}],
    dataset_id=dataset.id,
)

# Run evaluation
def correctness_evaluator(run, example):
    # compare run.outputs["answer"] to example.outputs["answer"]
    score = llm_judge(run.outputs["answer"], example.outputs["answer"])
    return {"score": score, "key": "correctness"}

results = evaluate(
    rag_pipeline,
    data=dataset.name,
    evaluators=[correctness_evaluator],
)
```

---

## 2. Helicone — Drop-in OpenAI Proxy

Helicone proxies OpenAI API calls with zero code changes. Just change the base URL.

```python
from openai import OpenAI

client = OpenAI(
    api_key="your-openai-key",
    base_url="https://oai.helicone.ai/v1",
    default_headers={
        "Helicone-Auth": f"Bearer your-helicone-key",
        "Helicone-Property-User-Id": "tarun",          # custom property
        "Helicone-Property-Feature": "rag-chat",        # tag by feature
        "Helicone-Cache-Enabled": "true",               # enable caching
    },
)

# Works exactly like normal OpenAI — all requests logged in Helicone dashboard
response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "What is RAG?"}],
)
```

**Dashboard shows:** cost per request, latency p50/p90/p99, token distribution, error rates, per-user breakdowns.

---

## 3. Weights & Biases (W&B) — Experiment Tracking

W&B is the standard for ML experiment tracking. The `weave` module handles LLM tracing.

```python
import weave
import wandb

wandb.init(project="rag-system")
weave.init("rag-system")

@weave.op()
def generate_answer(query: str, context: str) -> str:
    resp = openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": f"Context: {context}"},
            {"role": "user",   "content": query},
        ],
    )
    return resp.choices[0].message.content

# W&B automatically logs: inputs, outputs, latency, token usage, full trace
answer = generate_answer("What is HNSW?", context="HNSW is a graph-based...")
```

**Log custom metrics:**
```python
wandb.log({
    "retrieval_latency_ms": 45,
    "generation_latency_ms": 820,
    "context_length_tokens": 1200,
    "faithfulness_score": 0.87,
})
```

---

## 4. OpenTelemetry for LLMs (OTel + Jaeger)

For self-hosted, vendor-neutral tracing using the OpenTelemetry standard.

```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

provider = TracerProvider()
provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint="http://jaeger:4317")))
trace.set_tracer_provider(provider)
tracer = trace.get_tracer(__name__)

def rag_pipeline(query: str) -> str:
    with tracer.start_as_current_span("rag-pipeline") as span:
        span.set_attribute("query", query)

        with tracer.start_as_current_span("retrieval"):
            docs = retrieve(query)
            span.set_attribute("docs_retrieved", len(docs))

        with tracer.start_as_current_span("generation") as gen_span:
            answer = generate(query, docs)
            gen_span.set_attribute("output_length", len(answer))

        return answer
```

**OpenLLMetry** adds LLM-specific OTel instrumentation (token counts, model name, etc.):
```bash
pip install opentelemetry-instrumentation-openai
```
```python
from opentelemetry.instrumentation.openai import OpenAIInstrumentor
OpenAIInstrumentor().instrument()  # auto-instruments all openai calls
```

---

## 5. Custom Prometheus + Grafana

For production systems that already use Prometheus:

```python
from prometheus_client import Counter, Histogram, Gauge, start_http_server
import time

llm_requests   = Counter('llm_requests_total', 'Total LLM requests', ['model', 'status'])
llm_latency    = Histogram('llm_latency_seconds', 'LLM response latency', ['model'])
llm_tokens_in  = Counter('llm_tokens_input_total', 'Input tokens consumed', ['model'])
llm_tokens_out = Counter('llm_tokens_output_total', 'Output tokens generated', ['model'])
llm_cost       = Counter('llm_cost_usd_total', 'Estimated cost in USD', ['model'])

# $/1M token rates (update as prices change)
COST_PER_1M = {"gpt-4o": 5.0, "gpt-4o-mini": 0.15, "claude-sonnet-4-6": 3.0}

def tracked_llm_call(model: str, messages: list) -> str:
    start = time.time()
    try:
        resp = client.chat.completions.create(model=model, messages=messages)
        usage = resp.usage
        cost = (usage.prompt_tokens * COST_PER_1M.get(model, 1.0) / 1_000_000 +
                usage.completion_tokens * COST_PER_1M.get(model, 1.0) * 4 / 1_000_000)

        llm_requests.labels(model=model, status="ok").inc()
        llm_latency.labels(model=model).observe(time.time() - start)
        llm_tokens_in.labels(model=model).inc(usage.prompt_tokens)
        llm_tokens_out.labels(model=model).inc(usage.completion_tokens)
        llm_cost.labels(model=model).inc(cost)

        return resp.choices[0].message.content
    except Exception as e:
        llm_requests.labels(model=model, status="error").inc()
        raise

start_http_server(8001)  # Prometheus scrapes :8001/metrics
```

---

## Alerting Rules (Prometheus)

```yaml
# alerts.yml
groups:
  - name: llm
    rules:
      - alert: HighLLMErrorRate
        expr: rate(llm_requests_total{status="error"}[5m]) / rate(llm_requests_total[5m]) > 0.05
        for: 2m
        annotations:
          summary: "LLM error rate > 5%"

      - alert: LLMCostSpike
        expr: increase(llm_cost_usd_total[1h]) > 10
        annotations:
          summary: "LLM spend > $10 in the last hour"

      - alert: HighLLMLatency
        expr: histogram_quantile(0.95, llm_latency_seconds_bucket) > 10
        annotations:
          summary: "LLM p95 latency > 10s"
```

---

## Structured Logging Best Practices

```python
import structlog

log = structlog.get_logger()

def rag_pipeline(query: str, user_id: str) -> str:
    log.info("rag.start", query=query, user_id=user_id)

    t0 = time.perf_counter()
    docs = retrieve(query)
    retrieval_ms = (time.perf_counter() - t0) * 1000
    log.info("rag.retrieved", doc_count=len(docs), latency_ms=round(retrieval_ms, 1))

    t1 = time.perf_counter()
    answer = generate(query, docs)
    gen_ms = (time.perf_counter() - t1) * 1000
    log.info("rag.generated", latency_ms=round(gen_ms, 1), answer_len=len(answer))

    return answer

# Output (JSON):
# {"event": "rag.start", "query": "...", "user_id": "tarun", "timestamp": "..."}
# {"event": "rag.retrieved", "doc_count": 5, "latency_ms": 42.3, ...}
# {"event": "rag.generated", "latency_ms": 820.1, "answer_len": 312, ...}
```

---

## Links to Refer

- [LangSmith Docs](https://docs.smith.langchain.com/)
- [Helicone Docs](https://docs.helicone.ai/)
- [Weights & Biases Weave](https://wandb.ai/site/weave)
- [OpenLLMetry](https://github.com/traceloop/openllmetry)
- [Arize Phoenix](https://docs.arize.com/phoenix) — open-source LLM observability
