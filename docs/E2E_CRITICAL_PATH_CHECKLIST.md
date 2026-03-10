# E2E Critical Path Checklist – Body & Mind ON

> Run this checklist after every production deployment that touches the AI pipeline.

---

## 1. User Registration

- [ ] POST `/api/body-metrics` with valid data returns `{ ok: true, planSent: true }`
- [ ] Response message is user-friendly (Czech, no technical errors)
- [ ] Auth user created in Supabase (`auth.users` table)
- [ ] Body metrics row present in `body_metrics` with correct `user_id`

---

## 2. AI Task Pipeline Initialization

- [ ] `ai_tasks` table contains `trainer:initial_plan` row with `status: pending`
- [ ] `ai_tasks` table contains `coach:onboarding_message` row with `status: pending`
- [ ] `ai_events` table contains `user_registered` event row
- [ ] Both tasks have `idempotency_key` set (format: `registration:{userId}:trainer:initial_plan`)

---

## 3. Trainer Plan Generated

- [ ] After scheduler runs: trainer task `status: completed`
- [ ] `ai_tasks.result.outcome_type === "plan_generated"`
- [ ] `ai_tasks.result.plan_id` is a valid UUID
- [ ] `ai_generated_plans` row exists for `user_id` with `is_active: true`
- [ ] `plan_html` is non-empty and contains `<h2>` or `<h3>` sections
- [ ] `valid_from` and `valid_until` are correct dates (current week)
- [ ] Previous plans for the same user have `is_active: false`

---

## 4. Email Delivery

- [ ] `ai_tasks.result.email_sent === true` for `initial_plan` task
- [ ] User receives email at registered address
- [ ] Email contains the plan HTML (rendered, not raw HTML tags)
- [ ] Email contains login URL and credentials (if new account)
- [ ] Sender is `info@bodyandmindon.cz`

---

## 5. Coach Message Generated

- [ ] After scheduler runs: coach task `status: completed`
- [ ] `ai_tasks.result.outcome_type === "message_generated"`
- [ ] `ai_tasks.result.message_id` is a valid UUID
- [ ] `ai_messages` table contains row for `user_id` with `task_type: onboarding_message`
- [ ] `content` is non-empty Czech text
- [ ] `status: generated`, `delivery_channel: in_app`

---

## 6. No Duplicate Plan

- [ ] Submitting registration with the same email a second time returns error about existing account
- [ ] OR if re-registration is permitted: trainer `initial_plan` task is skipped (`result.skipped: true`)
- [ ] No duplicate `is_active: true` plan for the same user

---

## 7. Mobile Profile Flow

- [ ] User can log in at `/login`
- [ ] Profile page (`/profil`) loads without error
- [ ] Plan section displays the generated plan content
- [ ] Habit tracker shows today's date as active
- [ ] Quick nav buttons (Můj plán, Denní návyky, Statistiky) open correct sections

---

## 8. Scheduler Health

- [ ] GET `/api/ai/run-scheduler` returns 200 with scheduler stats
- [ ] No tasks stuck in `status: processing` for more than 15 minutes
- [ ] `ai_events` with `status: pending` are processed within 1 scheduler cycle
- [ ] DLQ entries (`status: dlq`) are checked and investigated

---

## 9. Retry / DLQ Verification

- [ ] If a task fails: `attempts` increments on each failure
- [ ] `next_retry_at` follows exponential backoff: 1m, 2m, 4m, 8m, 16m
- [ ] After `max_attempts` (default 5): task moves to `status: dlq`
- [ ] `dead_lettered_at` is set for DLQ tasks
- [ ] `ai_logs` contains error entry for each failed attempt

---

## 10. AI Logs Audit Trail

- [ ] Each task execution creates an entry in `ai_logs`
- [ ] `ai_logs` entry contains: `user_id`, `task_id`, `agent_slug`, `action`, `status`, `result`
- [ ] Failed tasks have `error` populated in `ai_logs`

---

## 11. Preferences Change → Replan

- [ ] User updates preferences via `/profil` → Preferences form
- [ ] PATCH `/api/profile-preferences` returns 200
- [ ] New `ai_task` of type `adjust_plan` or `weekly_plan_update` created
- [ ] Scheduler processes it; new plan created or current plan updated
- [ ] Email NOT sent on replan (only on initial_plan)

---

## 12. Admin

- [ ] `/admin` page loads for admin users
- [ ] AI agents section shows current agent configs
- [ ] Agent prompt can be viewed (edit in DB via `ai_agents` table)

---

## Database Spot Check Queries

```sql
-- Check latest plan
SELECT user_id, valid_from, valid_until, is_active, created_at
FROM ai_generated_plans
ORDER BY created_at DESC
LIMIT 5;

-- Check pending tasks
SELECT id, user_id, agent_slug, task_type, status, attempts, next_retry_at
FROM ai_tasks
WHERE status IN ('pending', 'processing', 'dlq')
ORDER BY created_at DESC
LIMIT 20;

-- Check recent coach messages
SELECT id, user_id, task_type, title, status, created_at
FROM ai_messages
ORDER BY created_at DESC
LIMIT 10;

-- Check recent logs
SELECT task_id, user_id, agent_slug, action, status, error, created_at
FROM ai_logs
ORDER BY created_at DESC
LIMIT 20;
```
