# Contributing to dev-atlas

Thanks for wanting to add to dev-atlas. This guide covers everything you need — from forking the repo to opening a PR.

> **Important:** All topic content must be generated or heavily assisted by an AI agent. We recommend **Claude** (via [Claude Code](https://claude.ai/code) or the API). This keeps content quality high and consistent across the knowledge base.

---

## Before You Start

- Check the [open issues](https://github.com/atypicalesper/dev-atlas/issues) — your topic might already be planned or in progress.
- Open an issue first if you're adding an entirely new section (top-level category). For topics within an existing section, just go ahead.

---

## Step 1 — Fork and Clone

```bash
# Fork on GitHub, then:
git clone https://github.com/YOUR_USERNAME/dev-atlas.git
cd dev-atlas/web
npm install
npm run dev   # localhost:3333
```

---

## Step 2 — Understand the Folder Structure

All content lives under `docs/`. The path maps directly to the URL:

```
docs/
└── {section}/                        e.g. ai/
    └── {chapter-slug}/               e.g. 05-agentic-ai/
        └── {topic-slug}/             e.g. 03-memory-systems/    (optional)
            └── 01-overview.md
            └── 02-interview-questions.md
```

**Naming rules:**
- Prefix directories and files with a two-digit number: `01-`, `02-`, `03-`
- Use lowercase kebab-case: `my-new-topic`, not `MyNewTopic`
- Files inside a topic: `01-overview.md`, `02-interview-questions.md`, `03-deep-dive.md`, etc.

**Existing sections:**

| Slug | Title |
|---|---|
| `javascript` | JavaScript |
| `node` | Node.js |
| `react` | React & Frontend |
| `engineering` | Engineering |
| `databases` | Databases |
| `cloud` | Cloud |
| `python` | Python |
| `ai` | AI / ML |
| `networks` | Networks |
| `cheatsheets` | Cheatsheets |

---

## Step 3 — Generate Content with an AI Agent

**Do not write topic content entirely by hand.** Use an AI agent to draft it — this is a hard requirement. We recommend Claude Code.

### Using Claude Code (recommended)

Install Claude Code if you haven't:

```bash
npm install -g @anthropic-ai/claude-code
claude
```

Then give it a prompt like:

```
Write a dev-atlas topic file for "WebSockets" under the node section.

Requirements:
- Format: markdown, no frontmatter
- Start with a clear h1 heading
- Cover: what it is, how the protocol works, server/client implementation in Node.js, 
  common patterns (rooms, broadcasting), error handling, scaling concerns
- Include ASCII diagrams where useful
- Include realistic code examples (TypeScript preferred)
- Second file: interview questions and answers, structured as Q: / A: pairs
- Tone: technical, direct — aimed at mid-to-senior engineers preparing for interviews

Output two files:
1. docs/node/{next-chapter-number}-websockets/01-overview.md
2. docs/node/{next-chapter-number}-websockets/02-interview-questions.md
```

Adjust the prompt for your topic. The more specific you are about depth, subtopics, and audience, the better the output.

### Using the Claude API directly

If you prefer a script:

```python
import anthropic

client = anthropic.Anthropic()
message = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=8096,
    messages=[
        {
            "role": "user",
            "content": "Write a dev-atlas overview page for ..."
        }
    ]
)
print(message.content[0].text)
```

### Other agents

Other agents (GPT-4, Gemini, etc.) are fine too — but Claude tends to produce the cleanest technical markdown in our experience.

---

## Step 4 — Quality Check

Before committing, verify:

- [ ] File is valid markdown — headings, code blocks, and tables render correctly (`npm run dev` and navigate to your new page)
- [ ] The content is accurate — run factual claims past a second model or your own knowledge
- [ ] Code examples are syntactically correct and representative
- [ ] No hallucinated citations, fake library names, or made-up API signatures
- [ ] Naming and numbering follow the conventions in Step 2
- [ ] At least one file per topic — `01-overview.md` is the minimum

---

## Step 5 — Commit and Open a PR

```bash
git checkout -b topic/node-websockets   # descriptive branch name
git add docs/node/XX-websockets/
git commit -m "feat(node): add WebSockets topic — overview and interview questions"
git push origin topic/node-websockets
```

Then open a PR on GitHub. Use this format for the PR title:

```
feat({section}): add {topic} — {files added}
```

Examples:
- `feat(ai): add transformer architecture deep dive`
- `feat(databases): add connection pooling overview and interview questions`

---

## Content Standards

| Standard | Detail |
|---|---|
| Audience | Mid-to-senior engineers, interview prep focus |
| Tone | Technical, direct, no fluff |
| Code | TypeScript preferred; Python for AI/ML topics |
| Diagrams | ASCII preferred (renders in all themes) |
| Length | Enough to be useful — no padding, no truncation |
| Hallucination check | Verify any specific facts, versions, or citations |

---

## What Makes a Good Topic

- Covers the "what", "why", and "how" — not just definitions
- Has at least 3–5 interview Q&As that a real interviewer would ask
- Includes a working code example, not just pseudocode
- Mentions trade-offs and failure modes — not just the happy path
- Is scoped to one thing — don't cram an entire section into one file

---

## Questions

Open a GitHub issue or start a discussion. 
