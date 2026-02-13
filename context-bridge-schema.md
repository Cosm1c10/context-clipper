# Context Bridge File Format — v1.0

> **Purpose:** Transfer conversation context between LLMs with maximum signal, minimum tokens.
> **Principle:** Briefing document, not a tape recording.

---

## File Structure

```yaml
# ===========================
# SECTION 1: METADATA
# ===========================
meta:
  source_platform: "Google Gemini"            # Where the conversation happened
  source_url: "https://gemini.google.com/..." # Link back to original
  exported_at: "2026-02-13T15:17:39Z"        # When this file was generated
  conversation_started: "2026-02-13T10:00:00Z"
  total_turns: 24                             # How long the convo was
  target_platform: "Claude"                   # Where this is going (optional)
  bridge_version: "1.0"

# ===========================
# SECTION 2: USER IDENTITY
# (Who am I talking to?)
# ===========================
user:
  name: "Hemanth"
  role: "AI Automation Agency Founder (AgenticFloww)"
  context: "4th-year ECE student, Vasavi College, Hyderabad"
  skills:
    - n8n (Verified Creator)
    - Make.com
    - Python / PostgreSQL / Supabase
    - AI Agent Architecture
  communication_style: "Direct, action-oriented, dislikes fluff"

# ===========================
# SECTION 3: SITUATION BRIEF
# (What's happening right now?)
# ===========================
situation:
  summary: |
    Hemanth is pursuing an internship/role at Neeman's (D2C footwear brand)
    through their AI Golden Ticket Challenge. He has direct contact with the
    founder (Taran Singh Chhabra) who invited him to a trial on Feb 2.
    Instead of waiting, Hemanth proactively built an AdSpy & ORM Agent
    and sent it to Taran. He also DMed the recruiter (Shruthi) on LinkedIn.
    Currently waiting for responses.

  current_status: "WAITING — All outreach sent, no replies yet (< 24 hours)"
  urgency: "Medium — Follow-up window opens Tuesday if no response"
  sentiment: "Anxious but hopeful"

# ===========================
# SECTION 4: KEY ENTITIES
# (People, companies, products involved)
# ===========================
entities:
  people:
    - name: "Taran Singh Chhabra"
      role: "Founder & CEO, Neeman's"
      relationship: "Direct DM contact via AI Challenge"
      last_interaction: "Email sent Feb 13 with AdSpy agent demo"
      status: "No reply yet"

    - name: "Shruthi"
      role: "Recruiter / HR, Neeman's"
      relationship: "Cold outreach via LinkedIn DM"
      last_interaction: "LinkedIn DM sent Feb 13 ~5:50 PM"
      status: "No reply yet"

    - name: "Nikita"
      role: "HR Team, Neeman's"
      relationship: "Identified but NOT contacted"
      status: "Backup contact — only reach out if Shruthi doesn't respond by Tuesday"

  companies:
    - name: "Neeman's"
      type: "D2C Footwear Brand (India)"
      stage: "Growth-stage startup"
      relevance: "Target employer / client"

  products_built:
    - name: "AdSpy & ORM Agent"
      description: "Autonomous competitor Facebook ad monitoring system"
      status: "Built and sent to Taran via email"
      platform: "n8n"

# ===========================
# SECTION 5: TIMELINE
# (Key events in chronological order)
# ===========================
timeline:
  - date: "2026-02-02"
    event: "Taran DMs Hemanth: 'Drop me a note... We will give you a problem to solve'"
    significance: "Verbal commitment to a trial"

  - date: "2026-02-02 to 2026-02-12"
    event: "Hemanth sends note; Taran gets busy, no response"
    significance: "Gap period — no rejection, just silence"

  - date: "2026-02-13 (morning)"
    event: "Hemanth builds AdSpy agent and emails it to Taran proactively"
    significance: "Proof of execution without being asked"

  - date: "2026-02-13 (~5:50 PM)"
    event: "Hemanth DMs Shruthi on LinkedIn asking for Team Lead intro"
    significance: "Multi-channel approach to bypass founder bottleneck"

# ===========================
# SECTION 6: DECISIONS MADE
# (What has already been decided?)
# ===========================
decisions:
  - decision: "Do NOT message Nikita until Tuesday"
    reason: "Preserve as backup; avoid looking desperate"

  - decision: "Do NOT message Taran again"
    reason: "Already sent email + prior DMs. Ball is in his court"

  - decision: "Skip the careers@ formal application"
    reason: "Shruthi's post said 'DM me or email careers@' — chose DM route"

  - decision: "Wait until Tuesday for follow-up"
    reason: "< 24 hours since outreach. Monday is chaotic. Tuesday is optimal"

  - decision: "Position as AI Infrastructure Builder, not just developer"
    reason: "Differentiation — department-by-department agent deployment strategy"

# ===========================
# SECTION 7: OPEN QUESTIONS
# (What still needs to be figured out?)
# ===========================
open_questions:
  - "Will Taran or Shruthi respond by Tuesday?"
  - "Should Hemanth pursue this as a job (Founder's Office) or agency contract?"
  - "Salary expectations: ₹10-15 LPA range discussed, ROI-based negotiation preferred"
  - "If no response by Tuesday, what's the follow-up message to Shruthi/Nikita?"

# ===========================
# SECTION 8: STRATEGIC CONTEXT
# (The bigger picture the LLM should understand)
# ===========================
strategic_context:
  positioning: |
    Hemanth frames himself as a "Process Automation Architect" who builds
    AI infrastructure across departments — not a chatbot developer.
    His approach: pick a department → build 2-3 agents → save time/money →
    repeat across all departments → becomes company-wide AI infrastructure.

  negotiation_stance: |
    Negotiate on ROI, not market standards. Tie compensation to money saved.
    Discussed range: ₹10-15 LPA base with variable component tied to
    operational savings. ESOPs important if taking a full-time role.

  agency_vs_job: |
    Running AgenticFloww (agency) simultaneously. Open to either:
    - Agency model: ₹50k-1L setup + ₹20-40k/month maintenance per agent
    - Job model: ₹10-15L base + ESOPs as Head of Automation / AI Ops

# ===========================
# SECTION 9: CONVERSATION HIGHLIGHTS
# (Only if specific quotes/exchanges matter)
# ===========================
key_exchanges:
  - speaker: "Taran (Feb 2)"
    quote: "Drop me a note... We will give you a problem to solve"
    significance: "This is the anchor — proof of invitation"

  - speaker: "Gemini (advisor)"
    quote: "You cannot force them to grow by yelling at the soil"
    significance: "Core advice — patience, don't over-follow-up"

# ===========================
# SECTION 10: INSTRUCTIONS FOR RECEIVING LLM
# ===========================
instructions_for_llm: |
  - Hemanth is waiting on Neeman's. Do NOT suggest he message them again
    unless it's past Tuesday Feb 18.
  - He prefers direct, no-fluff responses.
  - He values strategic thinking over generic motivation.
  - If he asks about Neeman's, pick up from the "current_status" above.
  - If he asks about something unrelated, don't force Neeman's context
    into the conversation.
```

---

## Design Principles

### Why This Format Works

| Problem with Raw Transcripts | How This Schema Fixes It |
|---|---|
| Duplicate responses waste tokens | Deduplicated — each fact appears once |
| Buried context forces LLM to "search" | Front-loaded situation brief |
| No distinction between facts and opinions | Separated into decisions, questions, strategy |
| LLM doesn't know what NOT to do | Explicit `instructions_for_llm` section |
| Entities scattered across conversation | Structured `entities` block with status |
| Timeline unclear | Chronological `timeline` with significance |

### Token Efficiency

| Format | Approximate Tokens | Context Transferred |
|---|---|---|
| Raw transcript (your current file) | ~4,000-6,000 | Everything + noise |
| This schema (same conversation) | ~1,200-1,500 | Everything that matters |

**That's a 70-75% reduction in tokens with zero information loss.**

### Implementation Notes

1. **YAML over JSON** — More human-readable, easier to debug, and LLMs parse it equally well. JSON works too if you prefer programmatic generation.

2. **Sections are modular** — Not every conversation needs all 10 sections. A simple "help me write an email" conversation might only need Sections 1-3.

3. **The `instructions_for_llm` section is the secret weapon** — This is where you tell the receiving model what NOT to do, which is often more important than what to do.

4. **Keep `key_exchanges` to 2-5 max** — Only include direct quotes that fundamentally change how the LLM should respond. Everything else should be summarized.

5. **`current_status` should be one line** — If the receiving LLM reads nothing else, this single line should orient it.
