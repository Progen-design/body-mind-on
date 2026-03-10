# Go / No-Go Release Check — Body & Mind ON

> Complete this checklist before every production release.
> Each item must be explicitly verified — not assumed.
>
> Date: ___________  Release: ___________  Operator: ___________

---

## SECTION 1 — Core AI Flow

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1.1 | Registration flow completes end-to-end (Step 1 of smoke test) | [ ] Pass / [ ] Fail / [ ] Review | |
| 1.2 | `ai_tasks` trainer task reaches `status=completed` | [ ] Pass / [ ] Fail / [ ] Review | |
| 1.3 | `ai_generated_plans` row created with non-empty `plan_html` | [ ] Pass / [ ] Fail / [ ] Review | |
| 1.4 | Coach `ai_messages` row created with `task_id` not null | [ ] Pass / [ ] Fail / [ ] Review | |
| 1.5 | No duplicate plans for same user (idempotency confirmed) | [ ] Pass / [ ] Fail / [ ] Review | |
| 1.6 | Decision engine produces correct tasks for each trigger state | [ ] Pass / [ ] Fail / [ ] Review | |
| 1.7 | Shared memory facts written by coach after `recovery_message` or `motivation_message` | [ ] Pass / [ ] Fail / [ ] Review | |
| 1.8 | Trainer context includes `shared_memory` from `buildAgentContext` | [ ] Pass / [ ] Fail / [ ] Review | |

**Section Result:** [ ] GO  [ ] NO-GO

---

## SECTION 2 — Scheduler Health

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 2.1 | Vercel cron at `30 7 * * *` is configured in `vercel.json` | [ ] Pass / [ ] Fail / [ ] Review | |
| 2.2 | GitHub Actions workflow runs every 5 minutes | [ ] Pass / [ ] Fail / [ ] Review | |
| 2.3 | `AI_SCHEDULER_SECRET` env var is set in Vercel | [ ] Pass / [ ] Fail / [ ] Review | |
| 2.4 | Manual scheduler trigger returns `{ completed: N }` without errors | [ ] Pass / [ ] Fail / [ ] Review | |
| 2.5 | No tasks stuck in `processing` status for > 15 minutes | [ ] Pass / [ ] Fail / [ ] Review | |
| 2.6 | `stale task recovery` runs at start of each scheduler cycle | [ ] Pass / [ ] Fail / [ ] Review | |
| 2.7 | DLQ task count = 0 (or all DLQ tasks are known and explained) | [ ] Pass / [ ] Fail / [ ] Review | |
| 2.8 | Retry/backoff working: `next_retry_at` is set on failed tasks | [ ] Pass / [ ] Fail / [ ] Review | |

**Section Result:** [ ] GO  [ ] NO-GO

---

## SECTION 3 — Email Health

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 3.1 | `NODEMAILER_HOST`, `NODEMAILER_PORT`, `NODEMAILER_USER`, `NODEMAILER_PASS` set in Vercel | [ ] Pass / [ ] Fail / [ ] Review | |
| 3.2 | Sender is `info@bodyandmindon.cz` (verified in SMTP config) | [ ] Pass / [ ] Fail / [ ] Review | |
| 3.3 | Smoke test email received in inbox (not spam) | [ ] Pass / [ ] Fail / [ ] Review | |
| 3.4 | Email contains plan HTML and login credentials | [ ] Pass / [ ] Fail / [ ] Review | |
| 3.5 | `result->>'email_sent' = 'true'` in `ai_tasks` for initial_plan | [ ] Pass / [ ] Fail / [ ] Review | |

**Section Result:** [ ] GO  [ ] NO-GO

---

## SECTION 4 — Trusted Assets Acceptable

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 4.1 | `SPOONACULAR_API_KEY` or `RAPIDAPI_KEY` + `RAPIDAPI_SPOONACULAR_HOST` set | [ ] Pass / [ ] Fail / [ ] Review | |
| 4.2 | `PEXELS_API_KEY` set | [ ] Pass / [ ] Fail / [ ] Review | |
| 4.3 | `RAPIDAPI_KEY` set (for ExerciseDB) | [ ] Pass / [ ] Fail / [ ] Review | |
| 4.4 | `meal_metadata_cache` table exists with `image_trust_level` column | [ ] Pass / [ ] Fail / [ ] Review | |
| 4.5 | `exercise_asset_registry` table exists | [ ] Pass / [ ] Fail / [ ] Review | |
| 4.6 | Pexels does not return `image_trust_level = exact` (it must be `illustrative`) | [ ] Pass / [ ] Fail / [ ] Review | |
| 4.7 | Canonical exercise resolves to consistent asset on repeated calls | [ ] Pass / [ ] Fail / [ ] Review | |
| 4.8 | No obviously wrong images in profile view (cliff for chicken, yoga for squats) | [ ] Pass / [ ] Fail / [ ] Review | |

**Section Result:** [ ] GO  [ ] NO-GO

---

## SECTION 5 — Logging Sufficient

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 5.1 | `ai_logs` contains rows for recent trainer and coach task executions | [ ] Pass / [ ] Fail / [ ] Review | |
| 5.2 | `ai_logs` rows have `task_id`, `user_id`, `action`, `status` set | [ ] Pass / [ ] Fail / [ ] Review | |
| 5.3 | `ai_logs.result` contains meaningful outcome data (e.g. `plan_id`, `email_sent`) | [ ] Pass / [ ] Fail / [ ] Review | |
| 5.4 | Error rows in `ai_logs` are either expected or resolved | [ ] Pass / [ ] Fail / [ ] Review | |

**Section Result:** [ ] GO  [ ] NO-GO

---

## SECTION 6 — DB Migrations Applied

| # | Migration | Status | Notes |
|---|-----------|--------|-------|
| 6.1 | `20260320_ai_domain_tables_v2.sql` applied | [ ] Pass / [ ] Fail / [ ] Review | |
| 6.2 | `20260321_trusted_asset_resolution.sql` applied | [ ] Pass / [ ] Fail / [ ] Review | |
| 6.3 | `20260322_ai_messages_extended.sql` applied | [ ] Pass / [ ] Fail / [ ] Review | |
| 6.4 | `ai_messages.task_id` column exists | [ ] Pass / [ ] Fail / [ ] Review | |
| 6.5 | `user_ai_memory.source_agent_slug` column exists | [ ] Pass / [ ] Fail / [ ] Review | |
| 6.6 | Unique index on `user_ai_memory(user_id, memory_type)` exists | [ ] Pass / [ ] Fail / [ ] Review | |

**Verify:**
```sql
select column_name from information_schema.columns
where table_name in ('ai_messages', 'user_ai_memory')
  and column_name in ('task_id', 'payload', 'source_agent_slug');
```

**Section Result:** [ ] GO  [ ] NO-GO

---

## SECTION 7 — No Critical Unresolved Issues

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 7.1 | No open P0/P1 bugs known | [ ] Pass / [ ] Fail / [ ] Review | |
| 7.2 | Vercel last deployment = Ready (no build errors) | [ ] Pass / [ ] Fail / [ ] Review | |
| 7.3 | Login page works (no "Legacy API keys" error) | [ ] Pass / [ ] Fail / [ ] Review | |
| 7.4 | Profile page renders on mobile (375px) | [ ] Pass / [ ] Fail / [ ] Review | |
| 7.5 | Workout log overlay opens and saves correctly | [ ] Pass / [ ] Fail / [ ] Review | |
| 7.6 | Habit tracker shows today's date as active | [ ] Pass / [ ] Fail / [ ] Review | |

**Section Result:** [ ] GO  [ ] NO-GO

---

## FINAL DECISION

| Section | Result |
|---------|--------|
| 1. Core AI Flow | [ ] GO / [ ] NO-GO |
| 2. Scheduler Health | [ ] GO / [ ] NO-GO |
| 3. Email Health | [ ] GO / [ ] NO-GO |
| 4. Trusted Assets | [ ] GO / [ ] NO-GO |
| 5. Logging | [ ] GO / [ ] NO-GO |
| 6. DB Migrations | [ ] GO / [ ] NO-GO |
| 7. No Critical Issues | [ ] GO / [ ] NO-GO |

**OVERALL:**  [ ] **GO — release approved**   [ ] **NO-GO — do not release**

> All sections must be GO for overall GO.
> A single NO-GO blocks release unless explicitly accepted with documented reason.

**Approved by:** _________________________  **Date:** ___________
