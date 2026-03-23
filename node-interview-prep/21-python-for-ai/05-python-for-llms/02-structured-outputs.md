# Structured Outputs & Instructor

Getting LLMs to return consistent, type-safe structured data — instead of freeform text you have to parse.

---

## Why Structured Output Matters

```python
# ❌ The fragile way
response = llm.call("Extract the name and age from: 'John is 30 years old'")
# Returns: "The name is John and the age is 30."
# Or: "Name: John, Age: 30"
# Or: "{'name': 'John', 'age': 30}"
# You never know the format — parsing is a nightmare

# ✅ The structured way
class Person(BaseModel):
    name: str
    age: int

person = extract(Person, "John is 30 years old")
print(person.name)  # "John"
print(person.age)   # 30  — guaranteed int, not "30"
```

---

## 1. OpenAI JSON Mode

Forces the model to always return valid JSON, but no schema enforcement.

```python
from openai import OpenAI
import json

client = OpenAI()

response = client.chat.completions.create(
    model="gpt-4o-mini",
    response_format={"type": "json_object"},
    messages=[
        {"role": "system", "content": "Return JSON only."},
        {"role": "user",   "content": "Extract: name, age, and skills from 'Alice is 28, knows Python and React'"},
    ],
)

data = json.loads(response.choices[0].message.content)
# {"name": "Alice", "age": 28, "skills": ["Python", "React"]}
```

**Limitation:** You get valid JSON but no schema guarantee — the model decides the keys.

---

## 2. OpenAI Structured Outputs (with Pydantic schema)

OpenAI's `response_format` with `json_schema` enforces the exact structure.

```python
from pydantic import BaseModel
from openai import OpenAI

client = OpenAI()

class PersonInfo(BaseModel):
    name: str
    age: int
    skills: list[str]
    is_senior: bool

response = client.beta.chat.completions.parse(
    model="gpt-4o-mini",
    messages=[
        {"role": "user", "content": "Extract info: 'Alice is 28, knows Python and React. She's been coding for 6 years.'"},
    ],
    response_format=PersonInfo,  # pass the Pydantic model directly
)

person = response.choices[0].message.parsed  # already a PersonInfo object!
print(person.name)      # "Alice"
print(person.age)       # 28
print(person.skills)    # ["Python", "React"]
print(person.is_senior) # False (model inferred)
```

---

## 3. Instructor — Best Library for Structured LLM Outputs

[Instructor](https://python.useinstructor.com) wraps any LLM client and handles schema injection, retries on validation failure, and streaming.

```bash
pip install instructor
```

### Basic Usage

```python
import instructor
from openai import OpenAI
from pydantic import BaseModel, Field
from typing import Literal

client = instructor.from_openai(OpenAI())

class Sentiment(BaseModel):
    label: Literal["positive", "negative", "neutral"]
    score: float = Field(ge=0, le=1, description="Confidence 0–1")
    reason: str = Field(description="One sentence explaining the classification")

result = client.chat.completions.create(
    model="gpt-4o-mini",
    response_model=Sentiment,
    messages=[{"role": "user", "content": "Analyze: 'The product is great but shipping was slow'"}],
)
print(result.label)   # "positive" or "neutral"
print(result.score)   # 0.65
print(result.reason)  # "Mixed sentiment — positive product, negative shipping"
```

### Complex Nested Schemas

```python
from pydantic import BaseModel, Field
from typing import Optional
import instructor
from openai import OpenAI

client = instructor.from_openai(OpenAI())

class Technology(BaseModel):
    name: str
    version: Optional[str] = None
    purpose: str

class ProjectAnalysis(BaseModel):
    name: str
    description: str = Field(description="One sentence project description")
    tech_stack: list[Technology]
    complexity: Literal["low", "medium", "high"]
    estimated_hours: int = Field(ge=1, le=10000)
    risks: list[str] = Field(max_length=5, description="Top risks, max 5")

text = """
We're building a real-time multiplayer game using Next.js 14 for the frontend,
NestJS with Socket.io for the backend, PostgreSQL for persistence, and Redis for
session management. The game supports up to 1000 concurrent players.
"""

analysis = client.chat.completions.create(
    model="gpt-4o",
    response_model=ProjectAnalysis,
    messages=[{"role": "user", "content": f"Analyze this project:\n{text}"}],
)

print(analysis.name)          # "Real-time Multiplayer Game"
print(analysis.complexity)    # "high"
for tech in analysis.tech_stack:
    print(f"  {tech.name}: {tech.purpose}")
```

### Instructor with Anthropic

```python
import anthropic
import instructor

client = instructor.from_anthropic(anthropic.Anthropic())

result = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    response_model=ProjectAnalysis,
    messages=[{"role": "user", "content": "Analyze: ..."}],
)
```

### Validation and Retries

Instructor automatically retries when Pydantic validation fails — the error is sent back to the LLM as feedback.

```python
from pydantic import BaseModel, field_validator
import instructor

client = instructor.from_openai(OpenAI(), max_retries=3)

class PositiveInt(BaseModel):
    value: int

    @field_validator("value")
    @classmethod
    def must_be_positive(cls, v):
        if v <= 0:
            raise ValueError(f"Must be positive, got {v}")
        return v

# If model returns -5, instructor feeds the validation error back:
# "value must be positive, got -5. Please correct and return valid JSON."
result = client.chat.completions.create(
    model="gpt-4o-mini",
    response_model=PositiveInt,
    messages=[{"role": "user", "content": "How many items? Context says none were sold."}],
    max_retries=3,  # retry up to 3 times on validation failure
)
```

### Streaming Partial Results

```python
from instructor import Partial

# Stream partial objects as they arrive
for partial_result in client.chat.completions.create_partial(
    model="gpt-4o",
    response_model=ProjectAnalysis,
    messages=[{"role": "user", "content": "Analyze this project..."}],
):
    # partial_result is populated as tokens arrive
    if partial_result.name:
        print(f"Name: {partial_result.name}")
```

---

## 4. Anthropic Tool Use for Structured Output

Using Anthropic's `tools` API to force structured extraction:

```python
import anthropic
import json

client = anthropic.Anthropic()

tools = [{
    "name": "extract_person",
    "description": "Extract person information from text",
    "input_schema": {
        "type": "object",
        "properties": {
            "name":   {"type": "string"},
            "age":    {"type": "integer"},
            "skills": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["name", "age", "skills"],
    },
}]

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    tools=tools,
    tool_choice={"type": "tool", "name": "extract_person"},  # force tool use
    messages=[{"role": "user", "content": "Alice is 28 and knows Python and React."}],
)

tool_use = next(b for b in response.content if b.type == "tool_use")
data = tool_use.input  # already a dict
print(data["name"])    # "Alice"
print(data["age"])     # 28
```

---

## 5. Outlines — Guaranteed Structured Generation

[Outlines](https://github.com/dottxt-ai/outlines) modifies the sampling process itself — the model physically cannot produce tokens that violate the schema.

```python
import outlines
from pydantic import BaseModel

model = outlines.models.transformers("Qwen/Qwen2.5-1.5B-Instruct")

class Character(BaseModel):
    name: str
    age: int
    weapon: str

generator = outlines.generate.json(model, Character)
character = generator("Create a fantasy character.")
print(character)  # Character(name='Arden', age=27, weapon='longsword')
# GUARANTEED to be valid Character — no retries needed
```

---

## Common Structured Output Patterns

### Information Extraction Pipeline

```python
class ExtractedInfo(BaseModel):
    entities: list[str]
    dates: list[str]
    key_facts: list[str] = Field(max_length=5)
    summary: str = Field(max_length=200, description="2-sentence summary")

def extract_from_document(text: str) -> ExtractedInfo:
    return client.chat.completions.create(
        model="gpt-4o-mini",
        response_model=ExtractedInfo,
        messages=[
            {"role": "system", "content": "Extract structured information accurately."},
            {"role": "user", "content": f"Extract from:\n{text}"},
        ],
    )
```

### Classification with Confidence

```python
from pydantic import BaseModel, Field
from typing import Literal

class ClassificationResult(BaseModel):
    category: Literal["bug", "feature", "question", "spam"]
    confidence: float = Field(ge=0.0, le=1.0)
    needs_human_review: bool
    tags: list[str] = Field(max_length=5)
```

### RAG Answer with Citations

```python
class Citation(BaseModel):
    source: str
    quote: str = Field(description="Exact quote from source that supports this claim")

class AnswerWithCitations(BaseModel):
    answer: str
    citations: list[Citation]
    confidence: Literal["high", "medium", "low"]
    unanswered_aspects: list[str] = Field(
        default=[],
        description="Parts of the question that couldn't be answered from context"
    )
```

---

## Interview Q&A

**Q: What's the difference between JSON mode and structured outputs?**

JSON mode guarantees valid JSON syntax but lets the model choose any keys. Structured outputs (OpenAI's `response_format` with `json_schema`) enforce the exact schema — correct keys, types, required fields. Instructor adds automatic retry-on-validation on top of either.

**Q: When would you use Outlines instead of Instructor?**

When you're running a local model (Llama, Qwen, Mistral) and need 100% schema compliance with zero retries. Outlines modifies the token sampling to make invalid JSON physically ungenerable. Instructor works with any API but relies on the model following instructions + retry logic.

---

## Links to Refer

- [Instructor Documentation](https://python.useinstructor.com/)
- [OpenAI Structured Outputs Guide](https://platform.openai.com/docs/guides/structured-outputs)
- [Outlines GitHub](https://github.com/dottxt-ai/outlines)
- [Pydantic Documentation](https://docs.pydantic.dev/)
