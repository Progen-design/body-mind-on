# E2E Test Matrix — Body & Mind ON

> End-to-end test scenarios for the production AI platform.
> Aligned with the real codebase as of 2026-03-10.
>
> Code paths:
>   Registration:   `pages/api/body-metrics.js`
>   Events:         `lib/aiEvents.js`
>   Decision:       `lib/aiDecisionEngine.js`
>   Tasks:          `lib/taskExecutors.js` → `lib/aiScheduler.js`
>   Context:        `lib/buildAgentContext.js`
>   Assets:         `lib/mealEnrichment.js`, `lib/exerciseEnrichment.js`

---

## SCENARIO 1 — New User Registration (Critical Path)

**Purpose:** Verify the full happy-path from form submit to plan email.

**Preconditions:**
- Email does not exist in Supabase Auth
- All required env vars set (`OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, Nodemailer)

**Trigger:** `POST /api/body-metrics` with complete user data

**Expected DB changes:**
| Table | Change |
|-------|--------|
| `auth.users` | New row with email |
| `body_metrics` | New row with `user_id`, all fields |
| `memberships` | Upserted with `tier`, `status: trial` |
| `ai_tasks` | Row: `agent_slug=trainer`, `task_type=initial_plan`, `status=completed` |
| `ai_tasks` | Row: `agent_slug=coach`, `task_type=onboarding_message`, `status=completed` |
| `ai_events` | Row: `event_type=user_registered`, `status=processed` |
| `ai_generated_plans` | Row: `is_active=true`, `plan_html` not null |
| `ai_messages` | Row: coach onboarding message with `task_id` |
| `user_habits` | Rows for selected habits (if any) |

**Expected API behavior:**
- `200 { ok: true, planSent: true }`
- `planSent: false` is acceptable if scheduler fails but not if task is `completed`

**Expected user-visible behavior:**
- Email received with plan HTML
- Login credentials in email
- Profile page shows plan

**Failure signs:**
- `planSent: false` and task status is `failed`
- `ai_generated_plans` empty for user
- Email not delivered
- `ai_tasks` row missing entirely

**Severity:** CRITICAL

---

## SCENARIO 2 — Duplicate Registration Attempt

**Purpose:** Verify idempotency for users who resubmit the form.

**Preconditions:**
- Email already exists in Supabase Auth

**Trigger:** `POST /api/body-metrics` with same email

**Expected behavior:**
- `400 { error: "S tímto e-mailem už máš účet..." }`
- No new auth user created
- No duplicate `body_metrics` entry for same user attempted via auth path

**Expected DB changes:**
- No new `auth.users` row
- A new `body_metrics` row IS inserted (user can update their metrics)
- The `createInitialAITasks` function creates tasks but `initial_plan` is idempotent (skips if plan exists)

**Failure signs:**
- Multiple `ai_generated_plans` rows created for same week
- Duplicate emails sent
- 500 error instead of 400

**Severity:** HIGH

---

## SCENARIO 3 — Weight Check-in

**Purpose:** Verify progress-based event and decision pipeline.

**Preconditions:**
- User exists with active plan
- `user_checkins` table exists

**Trigger:** POST to check-in API endpoint (weight/measurement submission)

**Expected DB changes:**
| Table | Change |
|-------|--------|
| `user_checkins` | New row with `user_id`, weight, date |
| `ai_events` | New row (if check-in triggers event) |
| `ai_tasks` | New task based on `analyzeUserProgress()` recommendation hint |

**Decision logic (`lib/aiDecisionEngine.js`):**
- `recommendation_hint = 'fat_loss_not_working'` → `trainer:adjust_plan`
- `recommendation_hint = 'low_adherence'` → `coach:motivation_message`
- `recommendation_hint = 'reduce_training_load'` → `trainer:reduce_training_load` + `coach:recovery_message`
- `recommendation_hint = 'fat_loss_progress_good'` → `coach:positive_reinforcement`

**Failure signs:**
- `ai_tasks` row not created despite new check-in
- Decision engine returns `decisions: []` for non-trivial progress state
- Task created but stays `pending` indefinitely

**Severity:** HIGH

---

## SCENARIO 4 — Diet / Preference Change

**Purpose:** Verify that preference changes correctly trigger plan adjustment.

**Preconditions:**
- User exists with active plan
- `POST /api/profile-preferences` or similar endpoint

**Trigger:** User updates workout frequency or diet type

**Expected DB changes:**
| Table | Change |
|-------|--------|
| `body_metrics` | Updated preference fields |
| `ai_events` | Row with `event_type=preferences_changed` (if implemented) |
| `ai_tasks` | `trainer:adjust_plan` task created |

**Failure signs:**
- Preferences saved but no plan adjustment triggered
- `workout_days` count mismatch vs `freq_choice` not validated server-side

**Severity:** MEDIUM

---

## SCENARIO 5 — Coach Task Execution

**Purpose:** Verify coach writes to canonical `ai_messages` table with full provenance.

**Preconditions:**
- Coach task exists in `ai_tasks` with `status=pending`
- `ai_messages` table exists with `task_id` and `payload` columns (migration `20260322`)

**Trigger:** `runAIScheduler()` picks up a `coach` task

**Expected DB changes:**
| Table | Change |
|-------|--------|
| `ai_messages` | Row with `agent_slug=coach`, `task_id` set, `payload` set, `content` not empty |
| `user_ai_memory` | Row: `memory_type = coach_{task_type}`, `agent_slug = coach` |
| `user_ai_memory` | Shared fact rows if task_type = `recovery_message` or `motivation_message` |
| `ai_logs` | Row with `action = task_type`, `status = completed` |
| `ai_tasks` | Row updated to `status = completed` |

**Critical check:** `ai_coach_messages` must NOT receive new writes (legacy table).

**Failure signs:**
- `ai_messages` empty for user after coach task completes
- `task_id = null` in `ai_messages` (provenance missing)
- Write going to `ai_coach_messages` instead of `ai_messages`

**Severity:** HIGH

---

## SCENARIO 6 — Shared Cross-Agent Memory

**Purpose:** Verify trainer and coach collaborate through shared memory, not direct calls.

**Preconditions:**
- Coach `recovery_message` task completed
- `user_ai_memory` has `source_agent_slug` column (migration `20260322`)

**Trigger:** Trainer task runs after coach task for same user

**Expected DB changes:**
| Table | Change |
|-------|--------|
| `user_ai_memory` | Row: `memory_type = shared_recovery_priority`, `source_agent_slug = coach` |
| `user_ai_memory` | If `motivation_message`: `shared_low_adherence_pattern` + `shared_plan_simplicity_needed` |

**Expected context:**
- `buildAgentContext('trainer_coach', userId)` returns `user_context.shared_memory` with these facts
- Trainer prompt receives shared facts in context

**Failure signs:**
- `shared_memory` array is empty in trainer context despite coach facts existing
- Shared memory writes fail silently (check `user_ai_memory` for `shared_` prefix rows)
- `source_agent_slug` column missing (run migration `20260322`)

**Severity:** MEDIUM

---

## SCENARIO 7 — Trusted Meal Assets (Spoonacular + Pexels)

**Purpose:** Verify trust model for meal images.

**Code path:** `lib/mealEnrichment.js` → `lib/mealNormalization.js`

**Preconditions:**
- `SPOONACULAR_API_KEY` or `RAPIDAPI_KEY` set
- `PEXELS_API_KEY` set
- `meal_metadata_cache` table exists (migration `20260321`)

**Test cases:**

| Meal name | Expected trust level | Reason |
|-----------|---------------------|--------|
| "Chicken breast" | `exact` (if Spoonacular score ≥ 0.75) | Good English match |
| "Kuřecí prsa na grilu s rýží a zeleninou (prsa, rýže)" | `exact` or `illustrative` | Normalized to simpler query |
| "Random nonsense dish XYZ123" | `illustrative` or `none` | Low confidence, Pexels fallback |

**Failure signs:**
- `image_trust_level = "exact"` for clearly wrong Spoonacular match (cliff, nature photo)
- Pexels image returned with `image_trust_level = "exact"`
- Confidence score > 0.75 for unrelated recipe

**Check via:** `POST /api/plan-enrichment` response `meal_trust` object.

**Severity:** HIGH

---

## SCENARIO 8 — Trusted Exercise Assets (ExerciseDB + Pexels)

**Purpose:** Verify canonical exercise resolution and consistent registry.

**Code path:** `lib/exerciseEnrichment.js` → `lib/exerciseCanonicalMap.js`

**Preconditions:**
- `exercise_asset_registry` table exists (migration `20260321`)
- `RAPIDAPI_KEY` set (for ExerciseDB) OR `exercisedb.dev` accessible

**Test cases:**

| Input | Expected canonical_key | Expected trust_level |
|-------|----------------------|---------------------|
| "Dřepy: 4×12" | `squat` | `exact` (after first resolution) |
| "Kliky s vlastní vahou" | `pushup` | `exact` |
| "Mrtvý tah: 3×8" | `deadlift` | `exact` |
| "Neznámý cvik X" | `null` | `fallback` or `none` |

**Consistency check:** Calling `enrichExercise("Dřepy: 4×12")` twice must return the same `gif_url` (from registry after first call).

**Failure signs:**
- Different `gif_url` for same exercise on different calls
- `trust_level = "fallback"` for canonical exercises after registry is populated
- Stone tablet / yoga / cliff images for strength exercises

**Severity:** HIGH

---

## SCENARIO 9 — Retry / DLQ Mechanism

**Purpose:** Verify failing tasks don't loop infinitely.

**Code path:** `lib/aiScheduler.js` → exponential backoff in `lib/aiOps.js`

**Preconditions:**
- Task that will fail (e.g. invalid agent slug, no OpenAI key)

**Expected behavior:**
- `attempts` increments on each failure
- `next_retry_at` set to `now + 2^(attempts-1)` minutes (1, 2, 4, 8, 16 min)
- After `max_attempts` (default 5): `status = dlq`, `dead_letter_at` set
- DLQ tasks not picked up by scheduler again

**Failure signs:**
- Task retries with no backoff (spamming OpenAI)
- Task stays in `processing` status without timeout recovery (`recoverStaleProcessingTasks`)
- `attempts` never increments

**Severity:** HIGH

---

## SCENARIO 10 — Logging / Audit Trail

**Purpose:** Verify task execution is traceable.

**Code path:** `lib/aiOps.js` → `writeAILog()` called in `lib/taskExecutors.js`

**Expected DB changes:**
- `ai_logs` row for every trainer task: `agent_slug=trainer`, `action=initial_plan`, `status=completed`
- `ai_logs` row for every coach task: `action=onboarding_message`, `status=completed`
- `task_id`, `user_id` set on every log row
- `result` jsonb contains meaningful outcome data

**Failure signs:**
- `ai_logs` empty
- Logs present but `task_id = null`
- Log status = `completed` but `ai_generated_plans` is empty

**Severity:** MEDIUM

---

## SCENARIO 11 — Mobile Critical Flow

**Purpose:** Verify core UX works on mobile viewport (375px).

**Preconditions:**
- User logged in with active plan

**Check:**
- `/profil` page renders without horizontal scroll
- Plan sections expand correctly
- Workout log overlay opens and closes
- Habit tracker shows today's date highlighted
- Meal images load correctly (or gracefully absent)

**Failure signs:**
- Layout broken below 400px
- Overlay covers entire viewport without scroll
- Images cause layout shift

**Severity:** HIGH

---

## SCENARIO 12 — No Duplicate Weekly Plan

**Purpose:** Verify idempotency of plan generation.

**Code path:** `lib/taskExecutors.js` → `executeTrainerTask` → `persistTrainerPlan`

**Expected behavior:**
- If `initial_plan` task runs and plan already exists → returns `skipped: true`, no new plan inserted
- `idempotency_key` on `ai_tasks` prevents duplicate tasks for same user+type+week

**Check:**
- `ai_generated_plans` count for user remains 1 after multiple scheduler runs
- `ai_tasks` duplicate creation returns `skipped > 0` not `created > 0`

**Failure signs:**
- Multiple `is_active = true` rows for same user
- Plan HTML overwritten unexpectedly

**Severity:** HIGH

---

## Severity Definitions

| Level | Meaning |
|-------|---------|
| CRITICAL | Blocks users from using the product. Fix before release. |
| HIGH | Degrades core value proposition. Fix before release. |
| MEDIUM | Affects quality or observability but not core flow. Fix post-release. |
| LOW | Minor issue. Track and fix in next iteration. |
