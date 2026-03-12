# SDE3 / Senior Behavioral Questions

Senior roles are evaluated differently from IC2/SDE2. The bar shifts from "can you build it?" to "can you lead, influence, and set direction?"

## What Interviewers Look For at Senior Level

| Dimension | Junior | Senior |
|---|---|---|
| Scope | My task, my PR | My team's outcome, cross-team impact |
| Ambiguity | Needs clear spec | Creates clarity from vague problems |
| Conflict | Avoids or escalates | Navigates and resolves |
| Technical decisions | Follows patterns | Defines patterns, evaluates tradeoffs |
| Failure | Rare, small scale | Has failed at scale, learned |
| Growth | Personal skills | Grows the people around them |

---

## Category 1: Technical Leadership & Decision-Making

### "Tell me about a significant technical decision you made that others disagreed with."

**Framework:** Decision → Disagreement → How you resolved it → Outcome → What you'd do differently

**Example structure:**
- **Situation:** We were building our real-time notification system. I proposed switching from polling to WebSockets + Redis Pub/Sub. Two senior engineers preferred SSE (simpler) and one preferred staying with polling (least risky).
- **Tension:** Polling was already working. WebSockets required infrastructure changes and added complexity.
- **How I resolved it:** I wrote a technical proposal comparing all three on: connection overhead, horizontal scaling, browser compatibility, ops complexity, and our actual use case. Key insight: we needed bidirectional communication for future features. I ran a 1-day spike with each approach.
- **Outcome:** We went with WebSockets. I was right about bidirectional needs — 6 months later we used the same channel for client-initiated ack messages.
- **What I'd do differently:** Should have framed the proposal around product roadmap requirements from day one, rather than the technical merits alone.

---

### "Describe a time you had to make a decision with incomplete information."

**What they're testing:** Comfort with uncertainty; can you set a decision deadline and commit?

**STAR answer elements:**
- What information was missing and why you couldn't wait for it
- How you framed the risk and articulated what "reversible" decisions you could make
- What reversibility/escape hatch you built in
- How you communicated confidence level to stakeholders

---

### "Tell me about a time you had to say no to a feature or technical request."

**Key points:**
- Say no to the request, not to the person
- Explain the cost of saying yes (tech debt, velocity, reliability)
- Offer an alternative or a later timeline

**Example:** Product wanted to add an analytics export feature before a compliance deadline. I said no to the full feature, but proposed a minimal version — CSV download with a 24hr delay — that we could ship in 2 days. The full feature went on the roadmap for Q2. Product was unhappy initially but the tradeoff was clear and documented.

---

## Category 2: Conflict & Cross-Team Influence

### "Tell me about a time you disagreed with your manager."

**What NOT to say:**
- Your manager was just wrong and you were right (shows lack of nuance)
- You deferred without pushback (shows lack of spine)
- The disagreement was about something trivial

**Good structure:**
1. The disagreement and your position
2. How you raised it (privately, data-backed, respectful)
3. How you listened to their reasoning
4. What happened — either you changed your mind (and why) or they did (and why)
5. The relationship post-disagreement

---

### "Tell me about a time you influenced a team you had no authority over."

**SDE3 reality:** Most of your impact comes through influence, not authority.

**Tactics to highlight:**
- Building credibility with data, not just opinion
- Making it easy for the other team to say yes (doing the legwork yourself)
- Finding a shared goal or metric both teams care about
- Escalating as a last resort and framing it as "I need alignment" not "they're wrong"

---

### "Describe a conflict with a peer engineer that you had to resolve."

**Framework:** the disagreement → understanding their perspective → what you had in common → how you reached resolution

**Red flags to avoid:**
- Winning by going over their head without trying to resolve directly
- "We just agreed to disagree" (shows conflict avoidance)
- Making the other person look bad

---

## Category 3: Failure & Growth

### "Tell me about your biggest technical failure."

**What they're testing:** Self-awareness, ability to learn, psychological safety with failure

**Non-negotiables:**
- Must be genuinely significant (not "I had a typo in a PR")
- Must be something you were responsible for
- Must have a clear lesson and behavioral change

**Example structure:**
- What failed, and what the impact was (quantify: outage duration, users affected, revenue impact)
- What your role was
- Root cause — be specific, not vague
- What you changed: process, technical pattern, monitoring
- What you'd tell your past self

---

### "Tell me about a time you missed a deadline."

**Don't:** claim you've never missed one (they won't believe you)
**Do:** own it, explain the root cause, describe what you changed

**Elements:** What was the deadline, what caused the miss, how you communicated early (or why you didn't, and the cost of that), what the outcome was, process change.

---

## Category 4: People & Growing Others

### "Tell me about a time you mentored someone."

**SDE3 expectation:** You should have concrete examples of making peers better, not just finishing your own work.

**Elements:**
- What their gap was
- How you identified it (observation, feedback, asking)
- Your approach (pair programming, code review style, design review)
- How you measured improvement
- Their growth outcome

---

### "Tell me about a time you gave difficult feedback."

**Framework:**
1. What was the behavior and why it mattered
2. How you prepared and delivered it (SBI: Situation, Behavior, Impact)
3. Their reaction
4. Outcome — did behavior change?

**Good SBI example:**
- *Situation:* During our last two architecture reviews
- *Behavior:* You dismissed other engineers' design suggestions before they finished speaking
- *Impact:* Two people stopped participating, and I think we missed a better design as a result
- (Then listen — don't lecture)

---

## Category 5: Ambiguity & Ownership

### "Tell me about a project where the requirements were unclear. How did you handle it?"

**What they want to see:**
- You drive clarity rather than waiting for it
- You time-box discovery and set a decision point
- You communicate uncertainty upfront to stakeholders
- You build incrementally to validate assumptions

---

### "Tell me about a time you took ownership of something outside your job description."

**Examples:**
- Noticing and fixing an operational gap (alerting, runbook, oncall rotation)
- Improving a process no one owned (code review standards, incident process)
- Volunteering for a cross-team initiative

**Key:** Show the business impact, not just that you did extra work.

---

## Preparation Framework

### Build a bank of 8-10 stories

Each story should cover:
- Situation (brief, 1-2 sentences)
- Your specific role and actions
- Outcome (quantified where possible)
- Lesson or process change

Tag each story with which dimensions it can address:

| Story | Leadership | Conflict | Failure | Growth | Ambiguity |
|---|---|---|---|---|---|
| Database migration incident | ✓ | | ✓ | ✓ | |
| Microservices refactor | ✓ | ✓ | | | ✓ |
| Mentored junior engineer | | | | ✓ | |
| Said no to feature | ✓ | ✓ | | | |

### Questions to ask your interviewer

- What does a great SDE3 look like here vs an SDE2 who's just more experienced?
- What's the hardest part of the role that the job description doesn't capture?
- Can you tell me about a recent technical decision the team debated? How did you resolve it?
- What's the on-call culture like? How many pages per week on average?
- How does the team handle tech debt vs feature work?
