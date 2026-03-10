# Production Smoke Test — Body & Mind ON

> Fast manual verification for release day. Target time: ~10 minutes.
> Run after every deployment to production.

---

## Prerequisites

- Access to Supabase SQL Editor (production project `ipfyavvmmxmsjupmfnes`)
- A test email address you can check (use a `+test` alias)
- Vercel deployment status = Ready

---

## STEP 1 — Register a Test User

```bash
curl -X POST https://app.bodyandmindon.cz/api/body-metrics \
  -H "Content-Type: application/json" \
  -d '{
    "email": "smoketest+RUN_ID@bodyandmindon.cz",
    "name": "Smoke Test",
    "gender": "male",
    "age": 30,
    "height": 178,
    "weight": 82,
    "activity": "moderate",
    "stress": "medium",
    "worktype": "sedentary",
    "goal": "redukce",
    "frequency": "3x tydne",
    "program": "START"
  }'
```

> Replace `RUN_ID` with current date+time, e.g. `smoketest+20260310@bodyandmindon.cz`

**Expected:** `{ "ok": true, "planSent": true }`

**Fail signal:** `planSent: false` or any non-200 status → check Vercel function logs.

---

## STEP 2 — Confirm body_metrics Saved

```sql
select user_id, email, goal, weight_kg, created_at
from body_metrics
where email = 'smoketest+RUN_ID@bodyandmindon.cz'
order by created_at desc
limit 1;
```

**Expected:** 1 row with correct data.
**Fail signal:** 0 rows → DB write failed, check Supabase RLS policies.

---

## STEP 3 — Confirm Trainer Task Exists

```sql
select id, status, result, attempts, created_at
from ai_tasks
where user_id = (select user_id from body_metrics where email = 'smoketest+RUN_ID@bodyandmindon.cz' limit 1)
  and agent_slug = 'trainer'
  and task_type = 'initial_plan'
order by created_at desc
limit 1;
```

**Expected:** 1 row, `status = 'completed'`
**Fail signal:** `status = 'failed'` → check `result` jsonb for error detail.
**Fail signal:** 0 rows → `createInitialAITasks` failed.

---

## STEP 4 — Confirm user_registered Event Exists

```sql
select id, status, result, created_at
from ai_events
where user_id = (select user_id from body_metrics where email = 'smoketest+RUN_ID@bodyandmindon.cz' limit 1)
  and event_type = 'user_registered'
order by created_at desc
limit 1;
```

**Expected:** 1 row, `status = 'processed'`
**Fail signal:** `status = 'pending'` → event pipeline stalled, rerun scheduler.

---

## STEP 5 — Confirm Plan Generated

```sql
select id, plan_type, is_active, length(plan_html) as html_len, created_at
from ai_generated_plans
where user_id = (select user_id from body_metrics where email = 'smoketest+RUN_ID@bodyandmindon.cz' limit 1)
order by created_at desc
limit 1;
```

**Expected:** 1 row, `is_active = true`, `html_len > 1000`
**Fail signal:** 0 rows → trainer task failed, check `ai_tasks.result`.
**Fail signal:** `html_len < 500` → truncated plan, check OpenAI response.

---

## STEP 6 — Confirm Email Sent

```sql
select result->>'email_sent' as email_sent
from ai_tasks
where user_id = (select user_id from body_metrics where email = 'smoketest+RUN_ID@bodyandmindon.cz' limit 1)
  and agent_slug = 'trainer'
  and task_type = 'initial_plan'
order by created_at desc
limit 1;
```

**Expected:** `email_sent = 'true'`
**Fail signal:** `email_sent = 'false'` → SMTP issue, check `NODEMAILER_*` env vars.

Also: **check the actual email inbox** for plan HTML content.

---

## STEP 7 — Confirm Coach ai_messages Entry

```sql
select id, task_type, task_id, length(content) as content_len, created_at
from ai_messages
where user_id = (select user_id from body_metrics where email = 'smoketest+RUN_ID@bodyandmindon.cz' limit 1)
order by created_at desc
limit 3;
```

**Expected:** At least 1 row with `task_id` not null.
**Fail signal:** 0 rows → coach task may not be scheduled yet (async), check `ai_tasks`.
**Fail signal:** `task_id = null` → migration `20260322` may not have applied.

---

## STEP 8 — Confirm Trusted Asset Enrichment

```bash
# Get auth token first (use test user credentials)
TOKEN="your-bearer-token-here"
PLAN_HTML="<p>Snídaně: Ovesná kaše s borůvkami</p><p><b>Trénink tento den:</b></p><ul><li>Dřepy: 4×12</li></ul>"

curl -X POST https://app.bodyandmindon.cz/api/plan-enrichment \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"html\": \"$PLAN_HTML\"}"
```

**Expected response contains:**
- `meal_trust["ovesna kase s boruvkami"].image_trust_level` = `"exact"` or `"illustrative"` (not null)
- `exercise_media["drepy"].canonical_key` = `"squat"`
- `exercise_media["drepy"].trust_level` = `"exact"` or `"fallback"` (not `null`)

---

## STEP 9 — Confirm Profile Renders on Mobile

1. Open https://app.bodyandmindon.cz/profil in Chrome DevTools → device = iPhone 12 (375px)
2. Confirm plan sections are visible
3. Confirm "Zapsat trénink" opens and closes
4. Confirm habit tracker shows today's date

**Fail signal:** Broken layout, overflow, or missing sections.

---

## STEP 10 — Confirm No Duplicate Plan

```sql
select count(*) as plan_count
from ai_generated_plans
where user_id = (select user_id from body_metrics where email = 'smoketest+RUN_ID@bodyandmindon.cz' limit 1)
  and is_active = true;
```

**Expected:** `plan_count = 1`
**Fail signal:** `plan_count > 1` → duplicate plan issue, check `persistTrainerPlan` idempotency.

---

## Post-Smoke Cleanup

```sql
-- Optionally soft-delete smoke test data
update ai_generated_plans set is_active = false
where user_id = (select user_id from body_metrics where email like 'smoketest+%');
```

> Do NOT delete `auth.users` rows — use Supabase Auth dashboard for that.

---

## Quick Pass/Fail Summary

| Step | Check | Pass if |
|------|-------|---------|
| 1 | Registration API | `ok: true, planSent: true` |
| 2 | body_metrics | 1 row with correct data |
| 3 | Trainer task | `status = completed` |
| 4 | user_registered event | `status = processed` |
| 5 | Plan generated | `is_active=true, html_len>1000` |
| 6 | Email sent | `email_sent = true` + inbox check |
| 7 | Coach ai_messages | row exists with `task_id` |
| 8 | Trusted assets | `canonical_key` and `trust_level` set |
| 9 | Mobile render | No layout issues |
| 10 | No duplicate plan | `plan_count = 1` |
