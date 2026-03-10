# Product and Monetization Gaps — Body & Mind ON

> **Status:** Active strategic document  
> **Last updated:** March 2026  
> **Purpose:** Describe honestly the current gap between technical capability, product packaging, monetization, and business readiness. This document exists so the team does not confuse building with shipping, or sophistication with value.

---

## 1. What Is Technically Strong Today

The technical platform is genuinely capable. These are the areas where the system is production-grade or close to it:

### Trainer Flow
- Autonomous plan generation triggered at registration
- Trainer agent produces a full weekly meal and training plan as HTML
- Plan is stored in `ai_generated_plans` with `is_active` flag
- Plan is delivered by email via Nodemailer immediately after generation
- Retry pipeline (exponential backoff, DLQ) ensures plans are not silently lost
- Validation agents (nutrition_validator, training_validator) run before delivery

### Event / Task Orchestration Architecture
- Full event-driven pipeline: `event → decision → task → agent → executor → artifact → UI`
- `ai_events` and `ai_tasks` tables with idempotency keys, retry logic, and DLQ
- DB-driven trigger rules in `ai_trigger_rules` — orchestration logic is not hardcoded
- Stale task recovery runs automatically at each scheduler cycle
- GitHub Actions + Vercel Cron provide near-continuous task processing

### Coach Message System
- Coach agent generates onboarding and motivational messages
- All outputs stored in canonical `ai_messages` table with `task_id` and `payload` for full provenance
- Coach writes grounded shared facts to `user_ai_memory` that trainer can consume

### Shared Cross-Agent Memory
- `user_ai_memory` supports both agent-specific memory and shared cross-agent facts (`shared_` prefix)
- Trainer reads shared facts written by coach at context build time
- Decision engine loads multiple shared facts into task payloads
- Memory provenance tracked via `source_agent_slug`

### Trusted Asset Resolution
- Spoonacular for meal images with confidence scoring (threshold: 0.75)
- Pexels as illustrative fallback, never marked as "exact"
- Canonical exercise mapping (17 canonical exercises) resolving Czech labels to consistent assets
- `exercise_asset_registry` for durable, consistent exercise media
- `image_trust_level` and `trust_level` fields expose data quality to the UI layer

### User Profile and Habit Tracking
- Workout logging with activity-specific calorie and load calculations
- Habit tracker with daily state and sticky hint
- Plan viewer rendering meal and training plan with enriched images
- Preferences overlay with validation (workout day count vs. frequency)

---

## 2. What Is Still Not Product-Complete

### Marketing Module
**Technical state:** Draft generation pipeline exists. Agent is wired into the task system. Outputs go to `ai_content_drafts` with `status: 'draft'`.

**Product-complete requires:**
- Defined content formats (post types, channel targets, brand voice constraints)
- A human review workflow before any draft reaches an external channel
- A clear definition of what a "shipped" marketing output looks like
- Measurement: what does a successful marketing output produce?

**Current gap:** None of the above exists. This is a pipeline without a delivery mechanism or a business definition.

### Social Module
**Technical state:** Same as marketing. Draft generation exists. No delivery or approval workflow.

**Product-complete requires:**
- Channel integrations or at minimum a defined export/publish workflow
- Content moderation before external publication
- Clear differentiation between what marketing produces vs. what social produces

**Current gap:** Identical to marketing. Both agents exist as technical wiring, not as business modules.

### Visible User-Facing Coach Workflow
**Technical state:** Coach messages are generated and stored. The architecture supports coach reactions to user events.

**Product-complete requires:**
- A clear, visible in-app surface where users see and interact with coach messages
- A defined rhythm (when does the coach message? what triggers it? what does the user do with it?)
- Coach message quality that a user would associate with real value (not just confirmation messages)

**Current gap:** The backend is ready. The user-facing experience around coach messages is not yet designed as a product flow.

### Admin / Business Workflow Around Content Outputs
**Technical state:** `ai_content_drafts` table exists. Admin page exists.

**Product-complete requires:**
- An admin interface to review, approve, reject, or edit AI-generated content drafts
- Workflow state management (draft → reviewed → approved → published)
- Audit trail for approvals

**Current gap:** The drafts exist in the database. There is no business workflow to action them.

---

## 3. Monetization Risks

### Risk 1: Building More AI Before Pricing Clarity
The platform currently has more technical capability than monetization clarity. Each new AI feature built before the pricing model is validated risks building in the wrong direction.

**The question that must be answered first:** What is the single feature that causes a user to pay 499 CZK/month? Until that is clearly identified and validated, every new feature is a bet without a baseline.

### Risk 2: Not Knowing the Real Paid Hero Feature
The current offer has three tiers (START, ON Club, VIP) but the differentiator between them is not strongly enforced in the application. A user on the free START plan and a user on ON Club see similar experiences.

The "hero feature" — the one thing that makes the upgrade feel obvious — is not identified, not designed, and not communicated.

### Risk 3: Weak Translation of Backend Sophistication into Customer Value
The platform has shared cross-agent memory, trusted asset resolution, idempotent task pipelines, and a retry/DLQ architecture. None of these are visible to the user. That is intentional for infrastructure — but there is a risk that the platform's real technical sophistication is not translating into perceptible user value at all.

A user who registers, gets a plan, and then sees a static profile page does not experience a sophisticated AI system. They experience a form and an email.

### Risk 4: Stripe Integration Not Confirmed as Live
Stripe is listed as a processor in `AI_PRODUCT_GUARDS.md`. The current platform handles registration and plan generation. It is not confirmed whether the paid subscription flow (START → ON Club → VIP upgrade) is implemented and tested end-to-end.

If payment processing is not live, the business model is theoretical.

---

## 4. Recommended Business Priorities

These are ordered by urgency, not importance. All are important.

### Priority 1: Define the Hero Feature
In one sentence: what does a user pay for?

This is not "an AI plan" — that is a feature. The hero feature is the transformation, outcome, or experience that a user cannot get elsewhere and that makes the monthly fee feel worth it.

Until this is defined, marketing copy, onboarding design, and feature prioritization have no anchor.

**Action:** Run a focused session. Write the hero feature as one sentence. Attach it to every future product decision.

### Priority 2: Define Which Modules Are Launch Modules vs. Future Modules
| Module | Status | Launch classification |
|--------|--------|----------------------|
| Trainer (plan generation) | Production-ready | **Launch module** |
| Coach (messaging, onboarding) | Operational | **Launch module (with UI investment)** |
| Marketing (draft generation) | Draft-stage | **Future module — do not position as live** |
| Social (draft generation) | Draft-stage | **Future module — do not position as live** |
| Habit tracker | Functional | **Launch module** |
| Workout logging | Functional | **Launch module** |
| Trusted assets | Operational | **Launch-supporting infrastructure** |

This classification must be explicit. Anything listed as a future module must not be presented externally as a delivered capability.

### Priority 3: Enforce Tier Differentiation in the Application
If START, ON Club, and VIP have different prices, they must have different experiences. Define what each tier includes at the feature level. Implement the gating. Make the upgrade trigger obvious.

Without this, the pricing model is decoration.

### Priority 4: Test the Full Conversion Funnel
Map and test: homepage → registration → plan receipt → profile engagement → upgrade prompt → payment → confirmation.

Every broken or missing step is a conversion failure. This should be mapped before any user acquisition investment.

### Priority 5: Close the Legal Gap Before Scaling
Before running any paid acquisition, the legal layer must be confirmed. See `docs/STRATEGIC_RISK_REGISTER.md` Risk B for the specific requirements.

---

> This document is a strategic reality check, not a criticism. The technical foundation is strong. The commercial layer needs to catch up before the platform can be scaled with confidence.
