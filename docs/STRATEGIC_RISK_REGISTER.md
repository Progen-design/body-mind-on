# Strategic Risk Register — Body & Mind ON

> **Status:** Active  
> **Last updated:** March 2026  
> **Purpose:** Document the critical strategic realities of the project — not as warnings to be filed and forgotten, but as operational facts that must inform every release, business, and product decision.

This document is intentionally blunt. It does not market the platform. It describes where the project stands today relative to where it needs to be for a safe, credible, and sustainable commercial launch.

---

## RISK A — Marketing and Social Are Not Finished Business Modules

### Description

The platform includes a `marketing` agent and a `social` agent. These agents are technically wired into the task pipeline, can receive task assignments, and produce `ai_content_drafts` stored in the database.

However, technical wiring does not equal a finished business module.

**What exists today:**
- Technical draft generation pipeline via `executeMarketingTask` and `executeSocialTask`
- Output written to `ai_content_drafts` with `status: 'draft'`
- Agent configurations in the `ai_agents` table
- Task routing logic in the decision engine

**What does not exist today:**
- A defined commercial workflow for publishing marketing content
- A human review interface for drafts before external use
- Measurable value definition (what business outcome does each draft produce?)
- Delivery logic (where does content go? which channel? who approves it?)
- Brand guidelines enforced at generation time
- A clear definition of what a "finished" marketing or social output looks like

### Why It Matters

Shipping an agent that produces drafts is not the same as shipping a marketing capability. If these agents are treated as finished, it creates three risks:
1. Unreviewed AI-generated content could reach channels without appropriate oversight
2. The business may build on a capability that has not been validated for real-world use
3. Internal confusion about what is "live" versus what is "draft-stage wiring"

### Current Status

**Draft-stage.** The technical foundation exists. The business layer — workflow, delivery, approval, value measurement — has not been designed or built.

### Risk Severity

**Medium-High.** Low probability of immediate user harm. High probability of wasted effort or reputational risk if positioned as a mature capability.

### Business Impact

If marketed or treated as production-ready, these modules could:
- Produce content that misrepresents the brand
- Create legal exposure around AI-generated promotional material
- Distract from the stronger, more complete product core (trainer + coach)

### Recommended Mitigation

- Do not position marketing/social agents as production-ready in any external communication
- Define a clear product spec for each agent before investing further
- Implement a mandatory human review step before any draft reaches an external channel
- Evaluate whether these modules belong in the v1 commercial offer at all

### Suggested Owner

Product / Business lead

### Suggested Next Step

Write a one-page product spec for the marketing module: what does a finished marketing output look like, who triggers it, who reviews it, and what is the measurable outcome?

---

## RISK B — Legal Layer Is Lagging Behind the Technical Layer

### Description

The platform processes highly sensitive personal data and generates autonomous behavioral recommendations. The technical architecture is significantly more mature than the legal and compliance layer.

**Data being processed today:**
- Body metrics (height, weight, age, gender)
- Health-related goals (fat loss, muscle gain, medical restrictions)
- Behavioral patterns (habits, stress level, activity level, workout history)
- Dietary preferences and restrictions (some of which are medically significant)
- Progress and adherence data over time
- AI-generated coaching messages and recommendations per user

**Legal layer current state:**
- Privacy policy status: unknown / not verified as legally complete
- Terms of service: exist but not verified for AI-specific obligations
- AI disclaimer: exists technically in `AI_PRODUCT_GUARDS.md`, not confirmed as user-facing
- User data deletion/export flow: exists in API (`/api/delete-account`) but not confirmed as GDPR-complete
- Data retention policy: referenced in docs (90-day recommendation for `ai_logs`) but not formally defined
- Third-party processor visibility: partially documented in `AI_PRODUCT_GUARDS.md` but not reviewed by legal counsel
- AI-generated recommendations disclaimer: not confirmed as visible to users before receiving recommendations

### Why It Matters

The EU GDPR, Czech data protection law, and emerging AI regulation (EU AI Act) impose obligations on platforms that:
- Process health-related behavioral data
- Use AI to generate personalized recommendations
- Rely on third-party data processors (OpenAI, Supabase, Stripe, etc.)

A platform at this level of data processing sophistication cannot treat legal readiness as a backlog item. It is a release-critical dependency.

### Current Status

**Behind.** Technical architecture is production-grade. Legal readiness is not confirmed. This gap widens with every new feature.

### Risk Severity

**High.** Legal non-compliance with GDPR or AI Act carries financial penalties, regulatory action, and reputational damage that cannot be fixed after the fact.

### Business Impact

- Inability to scale to external users without legal exposure
- Risk of regulatory investigation triggered by a complaint
- Inability to partner with enterprises or regulated entities without demonstrated compliance
- Potential for user trust erosion if a data subject request is handled incorrectly

### Recommended Mitigation

Treat legal readiness as a parallel workstream, not a post-launch item. Specifically:

1. **Privacy policy** — Have it reviewed by legal counsel. Ensure it explicitly covers AI-generated recommendations and third-party processors.
2. **Terms of service** — Ensure they cover AI output limitations, user data usage, and subscription terms.
3. **AI disclaimer** — Make it user-facing. Not just in internal docs.
4. **Delete/export flow** — Test the full account deletion flow. Verify data is removed from all systems (Supabase, AI logs, plan storage).
5. **Data retention** — Define formal retention periods for `ai_logs`, `ai_tasks`, `ai_messages`, `user_ai_memory`, and `ai_generated_plans`.
6. **Processor agreements** — Confirm DPAs (Data Processing Agreements) exist with OpenAI, Supabase, Vercel, and Stripe.

### Suggested Owner

Legal counsel + platform operator

### Suggested Next Step

Commission a one-session legal review focused on: GDPR compliance for AI-driven wellness data, processor visibility, and AI disclaimer obligations under Czech/EU law.

---

## RISK C — Product Definition and Monetization Are Behind the Technical System

### Description

The technical platform is more sophisticated than the current product packaging. There is a working AI pipeline, a trusted asset resolver, shared agent memory, a coach system, a habit tracker, and a full event/task orchestration layer. However, the product surface visible to potential customers has not caught up with this technical maturity.

**Technical capabilities that exist today:**
- Fully autonomous plan generation (trainer)
- Coach messaging and onboarding flow
- Shared cross-agent memory (trainer reads what coach writes)
- Trusted meal and exercise asset resolution
- Habit tracker with daily state
- Workout logging with calculation
- Retry and DLQ pipeline
- Event-driven orchestration

**Product and monetization layer today:**
- Three tiers (START, ON Club, VIP) defined on the homepage
- Pricing defined (START: 7 days free → 499 CZK/month, ON Club: 1499, VIP: 3999)
- Paid differentiator between tiers is not clearly enforced at the feature level
- It is not clear which features are gated to which tier in the application itself
- The "hero feature" — the single thing a user pays for — is not sharply defined
- Target customer clarity is moderate (wellness-motivated individual) but not sharp enough to drive focused product decisions
- Conversion funnel from registration to paid is not defined or tracked

### Why It Matters

Technology is not a product. A sophisticated AI pipeline that users do not understand, cannot feel, and do not pay for is not a business. The risk is building more technical capability while the gap between backend sophistication and frontend value grows.

### Current Status

**Behind.** The technical stack is ahead of the offer, communication, and monetization design. This is a normal pattern for engineering-first teams, but it must be recognized and addressed before further feature investment.

### Risk Severity

**Medium-High.** Not an immediate operational risk. A significant commercial risk that grows with every new technical feature built without a corresponding product/market validation.

### Business Impact

- Technical investment not converting to user acquisition or revenue
- Difficulty explaining the platform to potential users or investors
- Risk of building the wrong thing in the right way
- Reduced ability to prioritize correctly without a clear paid value proposition

### Recommended Mitigation

1. Define the single paid "hero feature" — the one thing a user would pay 499 CZK/month for
2. Define which features are START, which are ON Club, and which are VIP — and enforce it in the app
3. Map the user journey from registration to first paid conversion
4. Test whether the current onboarding promise matches the real product experience

### Suggested Owner

Founder / Product lead

### Suggested Next Step

Run a 2-hour product strategy session: define the hero feature, the conversion trigger, and the clearest customer segment. Write it down and attach it to every future feature decision.

---

## RISK D — Without Discipline the System Becomes Hard to Govern

### Description

The Body & Mind ON platform has a genuinely complex AI architecture:
- Multiple specialized agents (trainer, coach, marketing, social, validators)
- A shared cross-agent memory layer (`user_ai_memory` with `shared_` prefix types)
- A DB-driven decision engine with trigger rules
- An event/task pipeline with retry, backoff, and dead letter queue
- Trusted asset resolution with canonical mapping and confidence scoring
- External API dependencies (OpenAI, Spoonacular, ExerciseDB, Pexels, Stripe)
- Multiple migration layers that must stay in sync

This complexity is not a problem today. It becomes a problem when:
- New features are added without evaluating their interaction with existing behavior
- New shared memory types are introduced without formal documentation
- New agents are added without defined business contracts
- New enrichment behavior is layered without considering failure modes
- The system grows without corresponding growth in operational discipline

### Why It Matters

AI system complexity compounds. A system that works with 3 agents, 5 event types, and 2 memory layers does not automatically work correctly with 6 agents, 12 event types, and 8 memory types. Each new component adds interaction surface.

### Current Status

**Manageable today. Requires active governance to stay manageable.** The current architecture is well-designed. The risk is not the current state — it is the trajectory if discipline is not maintained.

### Risk Severity

**Medium.** Currently low operational risk. High long-term risk without explicit governance.

### Business Impact

- Debugging becomes expensive and slow
- New developers (or future AI assistants) cannot understand system behavior from the codebase alone
- Incidents become harder to trace and fix
- Feature velocity slows as side effects become unpredictable

### Recommended Mitigation

- Apply the complexity governance framework from `docs/COMPLEXITY_GOVERNANCE.md` to every new feature decision
- Require documentation for every new shared memory type, every new agent, and every new event type before code is written
- Resist "AI feature sprawl" — adding AI capabilities that do not serve a defined user or business need
- Maintain the rule: one developer must be able to trace any user's AI pipeline state from the DB alone in under 10 minutes

### Suggested Owner

Technical lead / Platform operator

### Suggested Next Step

Before adding any new agent or shared memory type, complete the complexity governance checklist in `docs/COMPLEXITY_GOVERNANCE.md`. Make this non-optional.

---

## Risk Summary Table

| Risk | Severity | Current Status | Business Impact | Owner |
|------|----------|---------------|-----------------|-------|
| A — Marketing/Social not finished | Medium-High | Draft-stage | Reputational, wasted investment | Product lead |
| B — Legal layer behind | High | Not confirmed | Regulatory, GDPR, trust | Legal counsel |
| C — Product/monetization behind | Medium-High | Lagging | Commercial, conversion, prioritization | Founder |
| D — Complexity without discipline | Medium | Manageable now | Operational, velocity, debuggability | Technical lead |

---

> This register should be reviewed before every significant release and before any new AI module or business capability is approved for development.
