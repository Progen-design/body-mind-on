# Complexity Governance — Body & Mind ON

> **Status:** Active governance document  
> **Last updated:** March 2026  
> **Purpose:** Define how decisions about new AI features, agents, memory types, and enrichment behaviors are evaluated and approved. This document is a governance tool, not a suggestion.

---

## Why This Document Exists

The Body & Mind ON platform is architecturally powerful and deliberately complex:

- Multiple specialized AI agents (trainer, coach, marketing, social, validators)
- A shared cross-agent memory layer (`user_ai_memory` with agent-specific and shared fact types)
- A DB-driven event/task pipeline with idempotency, retry, backoff, and dead letter queue
- Trusted asset resolution with confidence scoring, canonical exercise mapping, and two external APIs
- External dependency chain: OpenAI, Supabase, Vercel, Spoonacular, ExerciseDB, Pexels, Stripe, Nodemailer

This architecture works well today because it was built with discipline. It will continue to work only if that discipline is maintained.

**Complexity in AI systems compounds.** Each new agent, memory type, event type, or enrichment behavior:
- Adds interaction surface with every existing component
- Increases the number of possible failure modes
- Increases monitoring overhead
- Increases cognitive load for anyone maintaining or debugging the system
- May introduce new legal exposure

The purpose of this document is to make complexity decisions explicit, not accidental.

---

## The Complexity Governance Checklist

Apply this checklist to **every proposed new AI feature** before any code is written.

A "feature" includes: new agents, new task types, new event types, new shared memory types, new enrichment integrations, and new external API dependencies.

---

### Question 1: Does it improve user value clearly?

**What this means:**  
Is there a specific user behavior, outcome, or experience that this feature enables — and is it clearly better than what exists without it?

**Acceptable answers:**
- "Yes — the user sees X that they currently cannot see"
- "Yes — the user's plan quality improves measurably because of Y"
- "Yes — onboarding conversion improves because of Z"

**Not acceptable:**
- "It's more sophisticated"
- "It completes the architecture"
- "It would be cool"

**If the answer is unclear:** Do not proceed. Define the user value first.

---

### Question 2: Does it increase operational burden?

**What this means:**  
How much harder does this feature make it to monitor, debug, and operate the system?

**Evaluate:**
- Does it add a new external API call that can fail?
- Does it add a new table or column that must stay in sync?
- Does it add a new cron schedule or background process?
- Does it require a new Vercel environment variable?
- Does it add a new row type to `ai_logs` or `ai_tasks` that operators must understand?

**Rule:**  
If operational burden is high and user value is moderate, the feature should wait or be simplified. Do not build operational complexity for marginal value.

---

### Question 3: Does it introduce new legal exposure?

**What this means:**  
Does this feature process new types of personal data, use a new third-party processor, generate new types of AI recommendations, or change the data retention profile?

**Examples of legal exposure:**
- Adding a new external API (new data processor → DPA required)
- Storing new behavioral data types (expanded GDPR obligations)
- Generating AI recommendations in a new health-adjacent domain
- Automated decision-making that affects user experience (EU AI Act relevance)

**Rule:**  
Any feature that introduces new legal exposure must be reviewed against the legal readiness checklist in `docs/STRATEGIC_RISK_REGISTER.md` Risk B before shipping.

---

### Question 4: Does it create a new truth source?

**What this means:**  
Does this feature create a new place where authoritative data is stored, generated, or cached?

**Examples:**
- A new memory type in `user_ai_memory` (new truth source for agent behavior)
- A new cache table (new truth source for asset resolution)
- A new `ai_generated_plans` column (new truth source for plan state)
- A new agent that writes to `ai_messages` (new truth source for coach communication)

**Rule:**  
Every new truth source must be documented. Who writes to it? Who reads from it? What is the retention policy? What happens if it contains stale or incorrect data? If these questions are not answered before code is written, the feature introduces undocumented state.

**Document new truth sources in:**
- `docs/AI_SYSTEM_ARCHITECTURE.md` — for new tables or major data flows
- `docs/AI_SHARED_MEMORY.md` — for new shared memory types
- `docs/TRUSTED_ASSET_RESOLUTION.md` — for new asset resolution behavior

---

### Question 5: Can it be monitored and debugged?

**What this means:**  
When this feature misbehaves in production, how will an operator know, and how will they diagnose it?

**Required before shipping:**
- At least one observable signal in `ai_logs`, `ai_tasks`, or `ai_events`
- A SQL query that shows whether the feature is working or not
- A defined "failure state" — what does broken look like and how do you recover?
- An entry in `docs/PRODUCTION_OPERATIONS_CHECKLIST.md` D (Incident Response) or E (Recovery) if the feature can stall

**Rule:**  
If you cannot write the monitoring SQL query before building the feature, you are not ready to build the feature.

---

### Question 6: Is it launch-critical or should it wait?

**What this means:**  
Does this feature need to be in the next release, or can it wait?

**Launch-critical criteria:**
- Without it, the core product promise is broken
- Without it, a real user cannot complete the core flow
- Without it, a critical safety or legal requirement is unmet

**Should wait criteria:**
- It adds sophistication to something that already works
- It improves a metric that is not yet being measured
- It requires significant new infrastructure for moderate user value
- It corresponds to a business module (marketing, social) that is not yet product-defined

**Rule:**  
Default to wait. Every feature added before launch is a feature that must be tested, monitored, and potentially debugged under live conditions. Restraint is a product decision.

---

## Evaluation Summary Table

Use this table to record the evaluation for any proposed feature before approval:

| Feature / Module | Q1: User value | Q2: Operational burden | Q3: Legal exposure | Q4: New truth source | Q5: Monitorable | Q6: Launch-critical | Decision |
|-----------------|---------------|----------------------|-------------------|---------------------|----------------|--------------------|-|
| _(feature name)_ | Clear / Unclear | Low / Medium / High | None / Low / High | Yes / No | Yes / No | Yes / No | Approve / Wait / Reject |

---

## Complexity Budget Principles

These are standing rules that apply to all development decisions:

### 1. One new agent requires a product spec
Before a new agent is created, there must be a written product spec defining: what it does, what user value it creates, what it writes to the DB, and what its failure behavior is.

### 2. Every new shared memory type must be documented
Before a new `shared_` memory type is added to `user_ai_memory`, it must be added to `docs/AI_SHARED_MEMORY.md` with: which agent writes it, which agent reads it, what it means, and how long it remains valid.

### 3. Every new event type must be traceable
Before a new event type is added to `ai_events`, it must be traceable end-to-end: what triggers it, what decision it produces, what tasks it creates, and what outcome it drives.

### 4. External APIs are operational dependencies
Every new external API added is a new failure mode. Before adding a new API:
- Confirm a fallback exists if the API is unavailable
- Confirm the API has acceptable rate limits and cost profile
- Add monitoring for API-related failures in `ai_logs`
- Document the API in `docs/AI_PRODUCT_GUARDS.md` Section 3

### 5. "AI feature sprawl" is a named anti-pattern
AI feature sprawl is the pattern of adding AI capabilities that are technically impressive but do not correspond to a defined, validated user need. It is the primary way a well-designed AI platform becomes difficult to govern.

**Signs of feature sprawl:**
- Agents that generate content that no user has ever asked for
- Memory types that are written but never read
- Event types that fire but produce no task
- Enrichment behavior that runs on every request but whose output is never displayed

**Response to feature sprawl:** Remove or disable the capability. Do not add more.

---

## Application of This Framework

This framework applies to:
- The founding technical team
- Any future contributors or contractors
- Any AI coding assistant used in development

**Non-optional:** Any new AI feature must complete the six-question checklist before code is written. If the checklist cannot be completed, the feature is not ready to be built.

**Review cadence:** This document should be reviewed whenever a new agent, memory type, event type, or major enrichment integration is proposed. It does not need to be reviewed for bug fixes, UI changes, or documentation updates.

---

> Complexity is not a measure of quality. A simpler system that works reliably and can be operated by one person is more valuable than a sophisticated system that requires constant firefighting. Build deliberately.
