# Production Operations Checklist — Body & Mind ON

> Practical operator reference. Run this before every release and during daily monitoring.

---

## A. BEFORE RELEASE

### A1. Required Environment Variables

Verify all these are set in Vercel production environment:

```
NEXT_PUBLIC_SUPABASE_URL            ✓ Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY       ✓ sb_publishable_... key (new format)
SUPABASE_SERVICE_ROLE_KEY           ✓ Service role key for server-side ops
OPENAI_API_KEY                      ✓ OpenAI API key for agent execution
SPOONACULAR_API_KEY                 ✓ OR RAPIDAPI_KEY + RAPIDAPI_SPOONACULAR_HOST
PEXELS_API_KEY                      ✓ Pexels image fallback
RAPIDAPI_KEY                        ✓ ExerciseDB (RapidAPI)
NODEMAILER_HOST                     ✓ SMTP host
NODEMAILER_PORT                     ✓ SMTP port
NODEMAILER_USER                     ✓ SMTP user (info@bodyandmindon.cz)
NODEMAILER_PASS                     ✓ SMTP password
NEXT_PUBLIC_APP_URL                 ✓ https://app.bodyandmindon.cz
AI_SCHEDULER_SECRET                 ✓ Secret for cron auth
```

**Check:** Settings → Environment Variables in Vercel dashboard.

### A2. Database Migrations Applied

Confirm these migrations ran successfully in production Supabase:

| Migration file | Status | Key tables/columns created |
|----------------|--------|---------------------------|
| `20260304_ai_performance_indexes.sql` | ✓ | `user_ai_memory`, `user_checkins`, base indexes |
| `20260312_ai_agent_side_effects.sql` | ✓ | `ai_coach_messages` (legacy), `ai_content_drafts` |
| `20260315_ai_governance_db_first.sql` | ✓ | `ai_agents`, `ai_task_types`, `ai_trigger_rules`, `ai_executor_bindings` |
| `20260320_ai_domain_tables_v2.sql` | ✓ | `ai_messages`, `ai_logs` extended, `ai_tasks.max_attempts` |
| `20260321_trusted_asset_resolution.sql` | ✓ | `meal_metadata_cache`, `exercise_asset_registry` |
| `20260322_ai_messages_extended.sql` | ✓ | `ai_messages.task_id`, `ai_messages.payload`, `user_ai_memory.source_agent_slug` |

**Verify via SQL Editor:**
```sql
-- Check ai_messages has task_id and payload
select column_name from information_schema.columns
where table_name = 'ai_messages' and column_name in ('task_id', 'payload');

-- Check exercise_asset_registry exists
select count(*) from exercise_asset_registry;

-- Check user_ai_memory has source_agent_slug
select column_name from information_schema.columns
where table_name = 'user_ai_memory' and column_name = 'source_agent_slug';
```

### A3. Scheduler Cron Auth

- Vercel cron runs `/api/ai/run-scheduler` at `30 7 * * *` (daily)
- GitHub Actions workflow `.github/workflows/ai-scheduler.yml` runs every 5 minutes
- Both must pass `Authorization: Bearer {AI_SCHEDULER_SECRET}` header
- Check: `pages/api/ai/run-scheduler.js` reads `AI_SCHEDULER_SECRET` from env

### A4. API Keys Verified

Run the check script:
```bash
node scripts/check-ai-pipeline.mjs <SUPABASE_PAT>
```

Manual checks:
- Test Spoonacular: `curl "https://api.spoonacular.com/recipes/complexSearch?apiKey=KEY&query=chicken&number=1"`
- Test Pexels: `curl -H "Authorization: PEXELS_KEY" "https://api.pexels.com/v1/search?query=chicken+food&per_page=1"`

### A5. Email Delivery Verified

```bash
# Send a test email manually
node -e "
const nodemailer = require('nodemailer');
const t = nodemailer.createTransport({ host: process.env.NODEMAILER_HOST, port: process.env.NODEMAILER_PORT, auth: { user: process.env.NODEMAILER_USER, pass: process.env.NODEMAILER_PASS }});
t.sendMail({ from: 'info@bodyandmindon.cz', to: 'test@example.com', subject: 'SMTP test', text: 'ok' }, console.log);
"
```

### A6. Vercel Deployment Status

- Go to: https://vercel.com/progen-designs-projects/body-mind-on
- Last deployment must show `Ready`
- Check build logs for any errors

---

## B. AFTER DEPLOYMENT

### B1. Registration Smoke Test

```bash
curl -X POST https://app.bodyandmindon.cz/api/body-metrics \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke-test@bodyandmindon.cz","name":"Test","gender":"male","age":30,"height":180,"weight":80,"activity":"moderate","stress":"low","worktype":"sedentary","goal":"redukce","frequency":"3x tydne","program":"START"}'
```

Expected: `200 { ok: true, planSent: true }`

### B2. Verify AI Tasks

```sql
-- Check last 10 tasks
select user_id, agent_slug, task_type, status, attempts, created_at
from ai_tasks
order by created_at desc
limit 10;

-- Check for pending tasks older than 30 minutes (potential stall)
select count(*) as stalled_tasks
from ai_tasks
where status = 'pending'
  and created_at < now() - interval '30 minutes';
```

### B3. Verify AI Events

```sql
select event_type, status, attempts, created_at
from ai_events
order by created_at desc
limit 10;

-- DLQ events
select count(*) from ai_events where status = 'dlq';
```

### B4. Verify AI Generated Plans

```sql
select user_id, plan_type, is_active, created_at
from ai_generated_plans
order by created_at desc
limit 5;
```

### B5. Verify AI Messages (Coach)

```sql
select user_id, agent_slug, task_type, task_id, created_at
from ai_messages
order by created_at desc
limit 10;

-- Ensure task_id is always set (provenance check)
select count(*) as messages_without_task_id
from ai_messages
where task_id is null and created_at > now() - interval '1 day';
```

### B6. Verify AI Content Drafts

```sql
select agent_slug, task_type, status, created_at
from ai_content_drafts
order by created_at desc
limit 5;
```

### B7. Verify AI Logs

```sql
select agent_slug, action, status, created_at
from ai_logs
order by created_at desc
limit 20;

-- Check for errors in last 24h
select count(*) as error_count
from ai_logs
where status = 'error'
  and created_at > now() - interval '24 hours';
```

### B8. Verify Trusted Assets

```sql
-- Check exercise registry is being populated
select canonical_key, trust_level, source, updated_at
from exercise_asset_registry
order by updated_at desc
limit 10;

-- Check meal cache trust levels
select image_trust_level, count(*)
from meal_metadata_cache
group by image_trust_level;
```

---

## C. DAILY MONITORING

Run these queries every day (or set up Supabase alerts):

```sql
-- C1. Failed tasks count (last 24h)
select count(*) as failed_tasks
from ai_tasks
where status = 'failed'
  and created_at > now() - interval '24 hours';

-- C2. DLQ count (all time, should be low)
select count(*) as dlq_tasks from ai_tasks where status = 'dlq';
select count(*) as dlq_events from ai_events where status = 'dlq';

-- C3. Pending tasks backlog (should be near 0 between scheduler runs)
select count(*) as pending_tasks
from ai_tasks
where status = 'pending';

-- C4. Budget deferrals (tasks deferred due to budget limits)
select count(*) as deferred_tasks
from ai_tasks
where result->>'deferred_budget' = 'true'
   or status = 'deferred';

-- C5. Plan generation failures (last 24h)
select count(*) as plan_failures
from ai_tasks
where agent_slug = 'trainer'
  and status = 'failed'
  and created_at > now() - interval '24 hours';

-- C6. Email failures (check ai_logs for email errors)
select count(*) as email_failures
from ai_logs
where action = 'initial_plan'
  and result->>'email_sent' = 'false'
  and created_at > now() - interval '24 hours';

-- C7. Trusted asset fallback frequency (high fallback ratio = API issue)
select
  image_trust_level,
  round(count(*) * 100.0 / sum(count(*)) over (), 1) as pct
from meal_metadata_cache
where created_at > now() - interval '7 days'
group by image_trust_level;
```

---

## D. INCIDENT RESPONSE

### D1. No plans being generated

1. Check `ai_tasks` — do pending tasks exist?
2. Check `ai_logs` for recent errors
3. Check OpenAI API key: `curl -H "Authorization: Bearer $OPENAI_API_KEY" https://api.openai.com/v1/models`
4. Check Vercel function logs for `[executeTrainerTask]` errors
5. Check `ai_events` — are they processing?
6. Manually trigger scheduler: `POST /api/ai/run-scheduler` with correct auth

### D2. Emails stop sending

1. Check Nodemailer env vars in Vercel
2. Check `ai_logs` where `action='initial_plan'` and `result->>'email_sent'='false'`
3. Check SMTP provider status / rate limits
4. Check `lib/mail.js` for any configuration issues
5. Test SMTP manually (see section A5)

### D3. Coach messages stop appearing

1. Check `ai_messages` for recent rows
2. Check `ai_tasks` for coach task status
3. Check `ai_logs` for coach errors
4. Verify `ai_messages` table has `task_id` and `payload` columns (migration `20260322`)
5. Check that writes are not falling back to `ai_coach_messages`

### D4. Enrichment images look wrong

1. Check `meal_metadata_cache` — what `image_trust_level` is stored?
2. Check `exercise_asset_registry` — is the relevant canonical_key populated?
3. Verify `PEXELS_API_KEY` and `RAPIDAPI_KEY` are set
4. Check `CONFIDENCE_THRESHOLD` in `lib/mealEnrichment.js` (default: 0.75)
5. Clear cache row: `DELETE FROM meal_metadata_cache WHERE name_key = 'specific_key';`
6. Clear exercise registry: `DELETE FROM exercise_asset_registry WHERE canonical_key = 'squat';`

### D5. Scheduler stalls (tasks stay processing)

1. Check for tasks stuck in `processing` status:
   ```sql
   select id, agent_slug, task_type, processing_started_at
   from ai_tasks
   where status = 'processing'
     and processing_started_at < now() - interval '15 minutes';
   ```
2. `recoverStaleProcessingTasks()` runs automatically at start of each scheduler run
3. If stuck, manually reset:
   ```sql
   update ai_tasks set status = 'pending', processing_started_at = null
   where status = 'processing'
     and processing_started_at < now() - interval '15 minutes';
   ```

---

## E. RECOVERY ACTIONS

### E1. Rerun scheduler safely

```bash
curl -X POST https://app.bodyandmindon.cz/api/ai/run-scheduler \
  -H "Authorization: Bearer $AI_SCHEDULER_SECRET"
```

Or: Trigger GitHub Actions workflow manually in GitHub UI.

### E2. Inspect stuck processing tasks

```sql
select id, user_id, agent_slug, task_type, attempts, processing_started_at, last_error
from ai_tasks
where status in ('processing', 'failed', 'dlq')
order by created_at desc
limit 20;
```

### E3. Inspect AI logs for a specific user

```sql
select action, status, result, error, created_at
from ai_logs
where user_id = 'USER_UUID'
order by created_at desc
limit 20;
```

### E4. Inspect recent AI events

```sql
select event_type, status, attempts, last_error, created_at
from ai_events
where created_at > now() - interval '1 hour'
order by created_at desc;
```

### E5. Force retry a DLQ task

```sql
-- Move DLQ task back to pending for manual retry
update ai_tasks
set status = 'pending',
    attempts = 0,
    next_retry_at = null,
    dead_letter_at = null
where id = 'TASK_UUID';
```

### E6. Check shared memory state for a user

```sql
select memory_type, content, source_agent_slug, created_at
from user_ai_memory
where user_id = 'USER_UUID'
  and memory_type like 'shared_%'
order by created_at desc;
```
