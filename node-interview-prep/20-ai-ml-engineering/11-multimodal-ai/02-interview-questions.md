# Multimodal AI — Interview Questions

### Q1: A client wants to process 10,000 PDF invoices per day and extract structured data. Design the system.

**Answer:**

```python
# Scale: 10k PDFs/day = ~7 PDFs/minute — async batch processing is the right approach

from pydantic import BaseModel
from anthropic import AsyncAnthropic
import asyncio
import base64

client = AsyncAnthropic()

class InvoiceData(BaseModel):
    invoice_number: str
    vendor_name: str
    date: str
    line_items: list[dict]  # [{description, quantity, unit_price, total}]
    subtotal: float
    tax: float
    total: float
    currency: str = "USD"

async def process_single_invoice(pdf_path: str, semaphore: asyncio.Semaphore) -> InvoiceData | None:
    async with semaphore:  # Rate limit concurrent API calls
        try:
            with open(pdf_path, "rb") as f:
                pdf_data = base64.standard_b64encode(f.read()).decode("utf-8")

            response = await client.messages.create(
                model="claude-opus-4-6",
                max_tokens=2048,
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
                            "text": f"""Extract invoice data and return ONLY valid JSON matching this schema:
{InvoiceData.model_json_schema()}

Important:
- If a field is missing from the invoice, use null
- Amounts must be numeric (not strings)
- Date format: YYYY-MM-DD"""
                        }
                    ],
                }],
            )

            import json
            data = json.loads(response.content[0].text)
            return InvoiceData(**data)

        except Exception as e:
            # Log failure, return None for retry queue
            await log_failure(pdf_path, str(e))
            return None

async def process_batch(pdf_paths: list[str]) -> dict:
    # Limit to 20 concurrent requests (respect API rate limits)
    semaphore = asyncio.Semaphore(20)
    tasks = [process_single_invoice(p, semaphore) for p in pdf_paths]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    successful = [r for r in results if isinstance(r, InvoiceData)]
    failed = [p for p, r in zip(pdf_paths, results) if r is None or isinstance(r, Exception)]

    return {"extracted": successful, "failed": failed}

# Architecture:
# 1. S3 bucket → SQS queue (new file trigger)
# 2. ECS workers poll queue → call process_single_invoice
# 3. Results → PostgreSQL (structured data for querying)
# 4. Failed → retry queue (max 3 attempts → dead letter queue)

# Cost estimate (10k PDFs/day, avg 2 pages):
# Claude Opus 4.6 PDF: ~$0.008/page
# 10k × 2 pages = $160/day
# Consider Claude Sonnet for smaller invoices: ~$0.05/day
```

---

### Q2: How do you handle images that are too large or in formats the API doesn't support?

**Answer:**

```python
from PIL import Image
import io
import base64
from pathlib import Path

def prepare_image_for_api(
    image_path: str,
    max_size_bytes: int = 5_000_000,   # 5MB limit
    max_dimension: int = 2000,          # Max width or height
) -> tuple[str, str]:
    """
    Returns (base64_data, media_type) ready for Claude/OpenAI API.
    Handles format conversion, resize, compression.
    """
    path = Path(image_path)

    # Step 1: Convert unsupported formats
    # Supported: JPEG, PNG, GIF, WebP
    unsupported = {'.bmp', '.tiff', '.tif', '.svg', '.ico', '.heic', '.heif'}

    img = Image.open(image_path)

    # Convert to RGB (handles RGBA, P, L modes)
    if img.mode not in ('RGB', 'RGBA'):
        img = img.convert('RGB')

    # Step 2: Resize if too large (preserve aspect ratio)
    if max(img.size) > max_dimension:
        img.thumbnail((max_dimension, max_dimension), Image.LANCZOS)

    # Step 3: Compress to fit size limit
    output = io.BytesIO()
    quality = 95
    media_type = "image/jpeg"  # JPEG for photos, good compression

    # Keep PNG for screenshots/diagrams (sharp lines, text)
    if path.suffix.lower() == '.png' and _has_sharp_lines(img):
        media_type = "image/png"
        img.save(output, format='PNG', optimize=True)
    else:
        while quality > 40:
            output.seek(0)
            output.truncate()
            img.save(output, format='JPEG', quality=quality, optimize=True)
            if output.tell() <= max_size_bytes:
                break
            quality -= 10

    output.seek(0)
    return base64.standard_b64encode(output.read()).decode('utf-8'), media_type

def _has_sharp_lines(img: Image.Image) -> bool:
    """Detect if image is a screenshot/diagram (use PNG) vs photo (use JPEG)."""
    import numpy as np
    arr = np.array(img.convert('L'))
    # High ratio of pure black/white pixels → screenshot
    unique_vals = np.unique(arr)
    extreme_pixels = np.sum((arr < 10) | (arr > 245))
    return extreme_pixels / arr.size > 0.3

# Multi-image handling (for before/after comparison, document pages)
def prepare_multi_page_pdf_as_images(pdf_path: str, max_pages: int = 10) -> list[dict]:
    """Convert PDF pages to images for models without native PDF support."""
    import fitz  # PyMuPDF

    doc = fitz.open(pdf_path)
    images = []

    for page_num in range(min(len(doc), max_pages)):
        page = doc[page_num]
        mat = fitz.Matrix(2, 2)  # 2x zoom = 144 DPI
        pix = page.get_pixmap(matrix=mat)

        img_data = pix.tobytes("jpeg", jpg_quality=85)
        b64 = base64.standard_b64encode(img_data).decode('utf-8')

        images.append({
            "type": "image",
            "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}
        })

    return images
```

---

### Q3: You're building a meeting assistant that records and summarizes meetings. Walk through the architecture.

**Answer:**

```python
# Full pipeline: audio → transcript → structured summary → action items

from openai import AsyncOpenAI
from anthropic import AsyncAnthropic
import asyncio

openai_client = AsyncOpenAI()
claude_client = AsyncAnthropic()

async def process_meeting(audio_file_path: str) -> dict:
    """End-to-end meeting processing pipeline."""

    # Stage 1: Transcription (Whisper — fastest, cheapest for audio)
    transcript = await transcribe_audio(audio_file_path)

    # Stage 2: Diarization (who said what) — optional but valuable
    # transcript_with_speakers = await diarize(transcript)

    # Stage 3: Parallel extraction (run all at once for speed)
    summary, action_items, decisions = await asyncio.gather(
        extract_summary(transcript),
        extract_action_items(transcript),
        extract_decisions(transcript),
    )

    return {
        "transcript": transcript,
        "summary": summary,
        "action_items": action_items,
        "decisions": decisions,
    }

async def transcribe_audio(file_path: str) -> str:
    """Handle files up to 25MB; chunk larger files."""
    import os

    file_size = os.path.getsize(file_path)

    if file_size < 24_000_000:  # Under 24MB → direct API
        with open(file_path, "rb") as f:
            result = await openai_client.audio.transcriptions.create(
                model="whisper-1",
                file=f,
                response_format="verbose_json",
                timestamp_granularities=["segment"],
            )
        return result.text

    else:  # Large file → chunk by 10 min segments
        from pydub import AudioSegment
        audio = AudioSegment.from_file(file_path)
        chunk_ms = 10 * 60 * 1000
        chunks = [audio[i:i+chunk_ms] for i in range(0, len(audio), chunk_ms)]

        async def transcribe_chunk(chunk: AudioSegment, idx: int) -> str:
            import io
            buf = io.BytesIO()
            chunk.export(buf, format="mp3")
            buf.name = f"chunk_{idx}.mp3"
            buf.seek(0)
            result = await openai_client.audio.transcriptions.create(
                model="whisper-1", file=buf
            )
            return result.text

        transcripts = await asyncio.gather(
            *[transcribe_chunk(c, i) for i, c in enumerate(chunks)]
        )
        return " ".join(transcripts)

async def extract_action_items(transcript: str) -> list[dict]:
    """Extract structured action items."""
    response = await claude_client.messages.create(
        model="claude-opus-4-6",
        max_tokens=2048,
        messages=[{
            "role": "user",
            "content": f"""Extract all action items from this meeting transcript.
For each action item identify: owner (person responsible), task description, and deadline if mentioned.
If no specific person mentioned, use "Team".

Return ONLY valid JSON array:
[{{"owner": "...", "task": "...", "deadline": "..." or null, "priority": "high/medium/low"}}]

Transcript:
{transcript[:8000]}"""  # Truncate for very long meetings
        }],
    )
    import json
    return json.loads(response.content[0].text)
```

---

### Q4: What are the limitations of vision models and how do you work around them?

**Answer:**

```
Known limitations and workarounds:

1. Small text / low resolution
   Problem: Handwritten text, tiny labels, blurry scans
   Workaround:
     - Upscale image before sending (Pillow resize to 2x)
     - Use specialized OCR (Tesseract, AWS Textract) for pure text extraction
     - Pre-process: increase contrast, convert to grayscale for text-heavy docs
     - Prompt engineering: "zoom in mentally on the bottom-right section"

2. Counting objects precisely
   Problem: "How many items in this image?" → often off by 1-3
   Workaround:
     - Use object detection models (YOLO, Detectron2) for precise counting
     - Vision LLMs are better at categories than exact counts
     - Break image into regions and count per region

3. Reading complex tables/charts
   Problem: Multi-level headers, merged cells, axis values in charts
   Workaround:
     - For structured docs: use table-aware parsers (Camelot for PDFs, AWS Textract tables)
     - For charts: ask for ranges not exact numbers ("approximately 40-50%")
     - Ask for reasoning: "describe the trend in the data, then estimate peak value"

4. Spatial reasoning (positions/coordinates)
   Problem: "Is the button above or below the logo?"
   Workaround:
     - Use object detection + bounding boxes for precise layout analysis
     - Grid overlay: "divide into 9 zones (3×3), describe what's in each zone"
     - For UI automation: use specialized tools (SoM/Set-of-Mark prompting)

5. Context window limits for many images
   Problem: 100 product images → too many tokens
   Workaround:
     - Pre-filter with CLIP embeddings (find most relevant images first)
     - Process in batches, summarize each batch
     - Store image descriptions in vector DB (search text, not pixels)

6. Privacy / sensitive content
   Problem: Medical images, faces, PII
   Workaround:
     - Blur/redact faces before sending to API
     - Use on-premise vision models (LLaVA, InternVL) for sensitive data
     - Check API ToS for your data type
```

---

### Q5: Tricky: "Claude says it sees things in images that aren't there — how do you handle vision hallucinations?"

**Answer:**

```
Vision hallucinations happen when the model fills in gaps with plausible-but-wrong content.
Common examples:
  - "Reading" text that's blurry (invents words that look plausible)
  - Describing UI elements that almost exist (imagines a button)
  - Wrong brand logos (sees a swoosh → assumes Nike)
  - Wrong numbers in charts (rounds or misreads axis labels)

Detection and mitigation:

1. Confidence calibration via prompt engineering
   Bad:  "What does this label say?"
   Good: "What does this label say? If you cannot read it clearly, say UNCLEAR."

   Bad:  "List all items in this image"
   Good: "List only items you can clearly identify. For anything uncertain, skip it."

2. Multi-region asking (catch if model is confabulating)
   Ask about a region that definitely has no text:
   "What text appears in the top-left white space?"
   If model invents text → it's hallucinating; treat all output with caution

3. Redundant extraction
   Ask twice with different prompts, compare results
   Disagreement = low confidence → flag for human review

4. Structured output with confidence scores
   Prompt: "For each extracted value, also provide confidence: high/medium/low.
            If confidence is low, explain why."
   Filter out low-confidence extractions for downstream processing

5. Fallback to specialized tools for high-stakes data
   Invoice amounts → AWS Textract (purpose-built OCR, higher accuracy)
   Medical text → specialized medical OCR
   Use vision LLM for understanding/context, specialized tools for extraction

6. Ground truth validation where possible
   If you know the invoice total from another source (ERP, email) → verify
   Flag mismatches for human review

Rule of thumb:
  Vision LLMs are excellent at: understanding, context, classification, general description
  Vision LLMs struggle with: exact text, precise numbers, pixel-perfect coordinates
  For precision tasks → pair with specialized tools
```
