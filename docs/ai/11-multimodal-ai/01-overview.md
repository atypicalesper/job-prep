# Multimodal AI — Vision, Documents & Audio

## What is Multimodal AI?

```
Traditional LLM:  text in → text out
Multimodal LLM:   text + image + audio + video + PDF → text (or image) out

Current capabilities (2025):
  Vision:     Analyze images, screenshots, charts, UI wireframes
  Documents:  Read PDFs, invoices, forms, scanned documents
  Audio:      Transcribe speech, analyze tone, translate
  Video:      Describe video frames, analyze recordings
  Output:     Text + (DALL-E/Stable Diffusion for image generation)
```

---

## Vision: Image Understanding

```python
import anthropic
import base64
from pathlib import Path

client = anthropic.Anthropic()

# 1. URL-based (easiest)
response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=1024,
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "url",
                        "url": "https://example.com/chart.png",
                    },
                },
                {
                    "type": "text",
                    "text": "Analyze this chart. What are the key trends? What conclusions can you draw?"
                }
            ],
        }
    ],
)

# 2. Base64 (local files, private images)
def encode_image(image_path: str) -> tuple[str, str]:
    """Returns (base64_data, media_type)"""
    path = Path(image_path)
    media_types = {".jpg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp"}
    media_type = media_types.get(path.suffix.lower(), "image/jpeg")
    with open(image_path, "rb") as f:
        return base64.standard_b64encode(f.read()).decode("utf-8"), media_type

image_data, media_type = encode_image("invoice.png")

response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=2048,
    messages=[{
        "role": "user",
        "content": [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": image_data,
                },
            },
            {
                "type": "text",
                "text": "Extract all line items from this invoice as JSON: {items: [{description, quantity, unit_price, total}], subtotal, tax, grand_total}"
            }
        ],
    }],
)

# 3. OpenAI Vision
from openai import OpenAI

openai_client = OpenAI()

response = openai_client.chat.completions.create(
    model="gpt-4o",
    messages=[{
        "role": "user",
        "content": [
            {
                "type": "image_url",
                "image_url": {"url": f"data:{media_type};base64,{image_data}"}
            },
            {"type": "text", "text": "Describe any UI issues in this screenshot"}
        ],
    }],
)
```

---

## Document Understanding (PDFs)

```python
# Option 1: Native PDF support (Claude)
with open("contract.pdf", "rb") as f:
    pdf_data = base64.standard_b64encode(f.read()).decode("utf-8")

response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=4096,
    messages=[{
        "role": "user",
        "content": [
            {
                "type": "document",
                "source": {
                    "type": "base64",
                    "media_type": "application/pdf",
                    "data": pdf_data,
                },
            },
            {
                "type": "text",
                "text": "List all parties to this contract, the key obligations of each, and any penalty clauses."
            }
        ],
    }],
)

# Option 2: Document parsing libraries (for long/complex docs)
from unstructured.partition.pdf import partition_pdf
from unstructured.chunking.title import chunk_by_title

# Extract structured elements from PDF
elements = partition_pdf(
    filename="annual_report.pdf",
    strategy="hi_res",           # Use OCR for scanned PDFs
    extract_images_in_pdf=True,   # Also extract embedded images
    infer_table_structure=True,   # Detect tables
)

# Chunk by logical sections (maintains heading hierarchy)
chunks = chunk_by_title(elements, max_characters=1000)

# Option 3: LlamaParse (cloud service, very accurate)
from llama_parse import LlamaParse

parser = LlamaParse(
    api_key="llx-...",
    result_type="markdown",  # or "text"
    parsing_instruction="Extract all tables and financial figures accurately",
)

documents = await parser.aload_data("financial_report.pdf")

# Option 4: Docling (open source, local)
from docling.document_converter import DocumentConverter

converter = DocumentConverter()
result = converter.convert("complex_report.pdf")
markdown_output = result.document.export_to_markdown()
```

---

## Audio: Speech-to-Text

```python
from openai import OpenAI

client = OpenAI()

# 1. Transcription (Whisper)
with open("meeting_recording.mp3", "rb") as audio_file:
    transcript = client.audio.transcriptions.create(
        model="whisper-1",
        file=audio_file,
        response_format="verbose_json",  # Includes timestamps
        timestamp_granularities=["segment", "word"],
    )

# Access segments with timestamps
for segment in transcript.segments:
    print(f"[{segment.start:.1f}s - {segment.end:.1f}s] {segment.text}")

# 2. Translation to English
with open("german_call.mp3", "rb") as audio_file:
    translation = client.audio.translations.create(
        model="whisper-1",
        file=audio_file,
    )
print(translation.text)  # English translation of German audio

# 3. Process audio in chunks (for long recordings)
from pydub import AudioSegment
import io

def transcribe_long_audio(file_path: str, chunk_minutes: int = 10) -> str:
    audio = AudioSegment.from_file(file_path)
    chunk_ms = chunk_minutes * 60 * 1000
    transcripts = []

    for i, start in enumerate(range(0, len(audio), chunk_ms)):
        chunk = audio[start:start + chunk_ms]
        buffer = io.BytesIO()
        chunk.export(buffer, format="mp3")
        buffer.name = f"chunk_{i}.mp3"  # Required for file type detection
        buffer.seek(0)

        result = client.audio.transcriptions.create(
            model="whisper-1",
            file=buffer,
        )
        transcripts.append(result.text)

    return " ".join(transcripts)

# 4. Text-to-speech
speech_response = client.audio.speech.create(
    model="tts-1-hd",
    voice="alloy",      # alloy, echo, fable, onyx, nova, shimmer
    input="Welcome to our AI assistant. How can I help you today?",
    response_format="mp3",
    speed=1.0,          # 0.25 to 4.0
)
speech_response.stream_to_file("output.mp3")
```

---

## Production Patterns

### Screenshot → Bug Report

```python
async def analyze_screenshot_for_bugs(screenshot_path: str) -> dict:
    """Automatically detect UI issues from screenshot."""
    image_data, media_type = encode_image(screenshot_path)

    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=2048,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image_data}},
                {"type": "text", "text": """Analyze this UI screenshot for issues.
Return JSON: {
  "issues": [{"severity": "critical/high/medium/low", "type": "layout/text/accessibility/data", "description": "...", "location": "..."}],
  "overall_quality": "good/needs_improvement/broken",
  "summary": "..."
}"""}
            ],
        }],
    )

    return json.loads(response.content[0].text)

# Usage in automated testing
async def visual_regression_test(page_url: str, baseline_path: str) -> bool:
    # Capture current screenshot
    current_screenshot = await capture_screenshot(page_url)

    # Ask AI to compare with baseline
    prompt = """Compare these two UI screenshots (baseline vs current).
Are there any visual regressions? Return JSON: {
  "has_regression": bool,
  "changes": ["description of change"],
  "severity": "none/minor/major/breaking"
}"""
    # Pass both images to Claude for comparison
    ...
```

### Invoice/Receipt Processing Pipeline

```python
from pydantic import BaseModel

class LineItem(BaseModel):
    description: str
    quantity: float
    unit_price: float
    total: float

class InvoiceData(BaseModel):
    invoice_number: str
    vendor_name: str
    date: str
    line_items: list[LineItem]
    subtotal: float
    tax: float
    total: float

async def process_invoice(image_path: str) -> InvoiceData:
    """Extract structured data from invoice image."""
    image_data, media_type = encode_image(image_path)

    # Use structured output
    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=2048,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image_data}},
                {"type": "text", "text": f"Extract invoice data as JSON matching this schema: {InvoiceData.model_json_schema()}"}
            ],
        }],
    )

    data = json.loads(response.content[0].text)
    return InvoiceData(**data)
```

### Meeting Transcription + Action Items

```python
async def process_meeting_recording(audio_path: str) -> dict:
    """Transcribe meeting and extract action items."""

    # Step 1: Transcribe
    transcript = await transcribe_long_audio(audio_path)

    # Step 2: Extract structure
    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=4096,
        messages=[{
            "role": "user",
            "content": f"""Analyze this meeting transcript and extract:
1. Key decisions made
2. Action items (owner + deadline if mentioned)
3. Open questions requiring follow-up
4. Summary (3-5 sentences)

Transcript:
{transcript}

Return as JSON: {{
  "summary": "...",
  "decisions": ["..."],
  "action_items": [{{"owner": "...", "task": "...", "deadline": "..."}}],
  "open_questions": ["..."]
}}"""
        }],
    )
    return json.loads(response.content[0].text)
```

---

## Multimodal Models Comparison

| Model | Images | PDFs | Audio | Video | Context | Best For |
|-------|--------|------|-------|-------|---------|----------|
| **Claude 3.5/4** | ✓ | ✓ | ✗ | ✗ | 200k | Documents, code, analysis |
| **GPT-4o** | ✓ | ✓* | ✓ (via API) | ✗ | 128k | General vision, audio |
| **Gemini 1.5 Pro** | ✓ | ✓ | ✓ | ✓ | 1M | Long video, multimodal |
| **Gemini 2.0 Flash** | ✓ | ✓ | ✓ | ✓ | 1M | Speed + multimodal |
| **Whisper** | ✗ | ✗ | ✓ | ✗ | – | Audio transcription only |

*GPT-4o with PDF: requires text extraction first (not native PDF)
