# Browser & Computer Use Agents

Agents that can operate a browser or full desktop — the frontier of agentic AI.

---

## What Is Computer Use?

Traditional agents call APIs. Computer use agents interact with **visual interfaces** — clicking, typing, scrolling, reading screenshots — just like a human.

```
LLM
 ├── Tool: take_screenshot() → sees current screen state
 ├── Tool: click(x, y)       → clicks at coordinates
 ├── Tool: type(text)        → types text
 ├── Tool: scroll(direction) → scrolls page
 └── Tool: key(combo)        → keyboard shortcuts
```

Use cases: web scraping that requires login/interaction, testing UI flows, automating legacy software, filling forms, research agents that browse the web.

---

## Anthropic Computer Use API

Claude models (claude-3-5-sonnet-20241022+) natively support computer use tools.

```python
import anthropic

client = anthropic.Anthropic()

# System prompt sets up the task
response = client.beta.messages.create(
    model="claude-opus-4-6",
    max_tokens=4096,
    tools=[
        {
            "type": "computer_20241022",
            "name": "computer",
            "display_width_px": 1280,
            "display_height_px": 800,
            "display_number": 1,
        },
        {"type": "text_editor_20241022", "name": "str_replace_editor"},
        {"type": "bash_20241022", "name": "bash"},
    ],
    messages=[{
        "role": "user",
        "content": "Go to github.com and star the anthropics/anthropic-sdk-python repo"
    }],
    betas=["computer-use-2024-10-22"],
)

# Agent loop — keep calling until no more tool use
while response.stop_reason == "tool_use":
    tool_uses = [b for b in response.content if b.type == "tool_use"]
    tool_results = []

    for tool_use in tool_uses:
        result = execute_tool(tool_use.name, tool_use.input)  # your implementation
        tool_results.append({
            "type": "tool_result",
            "tool_use_id": tool_use.id,
            "content": result,
        })

    response = client.beta.messages.create(
        model="claude-opus-4-6",
        max_tokens=4096,
        tools=[...],
        messages=[
            {"role": "user", "content": "..."},
            {"role": "assistant", "content": response.content},
            {"role": "user", "content": tool_results},
        ],
        betas=["computer-use-2024-10-22"],
    )
```

### Executing Computer Tools

```python
import subprocess
import base64
from PIL import ImageGrab  # or pyautogui

def execute_tool(name: str, input: dict) -> dict:
    if name == "computer":
        action = input["action"]

        if action == "screenshot":
            img = ImageGrab.grab()
            img.save("/tmp/screenshot.png")
            with open("/tmp/screenshot.png", "rb") as f:
                b64 = base64.standard_b64encode(f.read()).decode()
            return {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64}}

        elif action == "left_click":
            import pyautogui
            pyautogui.click(input["coordinate"][0], input["coordinate"][1])
            return {"type": "text", "text": "clicked"}

        elif action == "type":
            import pyautogui
            pyautogui.typewrite(input["text"], interval=0.05)
            return {"type": "text", "text": "typed"}

    elif name == "bash":
        result = subprocess.run(input["command"], shell=True, capture_output=True, text=True)
        return {"type": "text", "text": result.stdout + result.stderr}
```

---

## Playwright-based Browser Agents

For browser-only tasks, Playwright gives precise control without requiring a full desktop:

```python
from playwright.async_api import async_playwright
from anthropic import Anthropic
import base64, asyncio

client = Anthropic()

async def browser_agent(task: str):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page(viewport={"width": 1280, "height": 800})

        messages = [{"role": "user", "content": task}]

        while True:
            # Screenshot → base64
            screenshot = await page.screenshot()
            b64 = base64.standard_b64encode(screenshot).decode()

            # Include screenshot in next message
            messages[-1]["content"] = [
                {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64}},
                {"type": "text", "text": task if len(messages) == 1 else "Continue."},
            ]

            response = client.messages.create(
                model="claude-opus-4-6",
                max_tokens=1024,
                system="You are a browser automation agent. Analyze the screenshot and take the next action.",
                messages=messages,
                tools=[
                    {"name": "click", "description": "Click at coordinates",
                     "input_schema": {"type": "object", "properties": {
                         "x": {"type": "number"}, "y": {"type": "number"}
                     }, "required": ["x", "y"]}},
                    {"name": "type_text", "description": "Type text",
                     "input_schema": {"type": "object", "properties": {
                         "text": {"type": "string"}
                     }, "required": ["text"]}},
                    {"name": "navigate", "description": "Go to URL",
                     "input_schema": {"type": "object", "properties": {
                         "url": {"type": "string"}
                     }, "required": ["url"]}},
                    {"name": "done", "description": "Task complete",
                     "input_schema": {"type": "object", "properties": {
                         "result": {"type": "string"}
                     }, "required": ["result"]}},
                ],
            )

            messages.append({"role": "assistant", "content": response.content})

            if response.stop_reason != "tool_use":
                break

            tool_results = []
            for block in response.content:
                if block.type != "tool_use":
                    continue

                if block.name == "click":
                    await page.mouse.click(block.input["x"], block.input["y"])
                    tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": "clicked"})

                elif block.name == "type_text":
                    await page.keyboard.type(block.input["text"])
                    tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": "typed"})

                elif block.name == "navigate":
                    await page.goto(block.input["url"])
                    await page.wait_for_load_state("networkidle")
                    tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": "navigated"})

                elif block.name == "done":
                    print(f"Done: {block.input['result']}")
                    await browser.close()
                    return block.input["result"]

            messages.append({"role": "user", "content": tool_results})

        await browser.close()

asyncio.run(browser_agent("Go to news.ycombinator.com and find the top 3 stories"))
```

---

## LangChain Browser Tools

```python
from langchain_community.tools import PlayWrightBrowserTools
from langchain_anthropic import ChatAnthropic
from langgraph.prebuilt import create_react_agent
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        tools = PlayWrightBrowserTools.from_browser(async_browser=browser)

        # Tools: NavigateTool, ClickTool, ExtractTextTool, ExtractHyperlinksTool...
        agent = create_react_agent(
            model=ChatAnthropic(model="claude-opus-4-6"),
            tools=tools.get_tools(),
        )

        result = await agent.ainvoke({
            "messages": [("user", "Find the current price of BTC on coinmarketcap.com")]
        })
        print(result["messages"][-1].content)
```

---

## OpenAI Computer Use (Operator)

OpenAI's CUA (Computer Use Agent) model — similar to Anthropic but via Responses API:

```python
from openai import OpenAI

client = OpenAI()

response = client.responses.create(
    model="computer-use-preview",
    tools=[{"type": "computer_use_preview", "display_width": 1280, "display_height": 800, "environment": "browser"}],
    input=[{"role": "user", "content": "Check the weather in Mumbai"}],
    truncation="auto",
)

# Same agentic loop — keep feeding tool results back
```

---

## Safety & Reliability Patterns

### Human-in-the-loop Checkpoints

```python
SENSITIVE_ACTIONS = ["submit", "purchase", "delete", "send", "post"]

def safe_execute(action: str, params: dict) -> dict:
    if any(kw in action.lower() for kw in SENSITIVE_ACTIONS):
        confirm = input(f"⚠️  About to {action} with {params}. Confirm? (y/n): ")
        if confirm.lower() != 'y':
            return {"error": "User cancelled"}

    return execute_action(action, params)
```

### Bounding Box Detection

Instead of raw coordinates, use accessibility tree or element selectors when possible — more robust than pixel coordinates that break when layout changes:

```python
# Playwright — better than (x, y)
await page.click("button:has-text('Submit')")
await page.fill("input[name='email']", "user@example.com")
await page.locator("[data-testid='checkout-btn']").click()
```

### Sandboxing

Always run computer use agents in isolated environments:
- Docker container with Xvfb (virtual display)
- VM snapshot (can revert)
- Browser context isolation (separate `browser.new_context()` per session)
- Network policies blocking internal services

```dockerfile
FROM python:3.12
RUN apt-get install -y xvfb chromium
ENV DISPLAY=:99
CMD ["Xvfb", ":99", "-screen", "0", "1280x800x24", "&"]
```

---

## Interview Questions

**Q: What makes computer use agents different from traditional web scrapers?**

Traditional scrapers: parse HTML, call APIs directly, brittle when UI changes but fast. Computer use agents: see screenshots, click UI elements, type text — can handle any interface including those without APIs, captchas (via human fallback), login flows, and complex multi-step UIs. Trade-offs: much slower (screenshot → LLM → action cycle), expensive (many LLM calls), non-deterministic. Use computer use when no API exists or the automation would be too complex to code explicitly.

**Q: How do you prevent a browser agent from taking destructive actions?**

Defense in depth: (1) human-in-the-loop for sensitive actions (purchase, delete, send), (2) read-only mode — start without ability to submit/post and require explicit elevation, (3) sandbox — isolated browser context/VM with no access to real accounts, (4) action whitelist — define allowed actions explicitly, (5) confirmation prompts — show user what the agent is about to do, (6) audit log — record every action for review. For production: prefer agents that confirm before acting over fully autonomous agents.
