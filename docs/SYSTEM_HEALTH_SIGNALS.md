# System Health Signals — Body & Mind ON

> Core observability signals for the AI platform.
> Use these to understand system health at a glance.

---

## 1. Task Throughput

**Why it matters:** The AI pipeline only delivers value when tasks complete.
A throughput drop means users aren't receiving plans or coach messages.

**Measure:** Tasks completed per scheduler run (returned by `runAIScheduler()`)

**Acceptable range:**
- 0–10 tasks/run = normal for steady state
- >30 tasks/run = backlog clearing
- 0 consistently over multiple runs with users registered = problem

**Bad signal means:** Scheduler not running, OpenAI quota exceeded, DB connection issue.

**Query:**
```sql
select
  date_trunc('hour', created_at) as hour,
  count(*) filter (where status = 'completed') as completed,
  count(*) filter (where status = 'failed') as failed,
  count(*) filter (where status = 'pending') as pending
from ai_tasks
where created_at > now() - interval '24 hours'
group by 1 order by 1;
```

---

## 2. Event Throughput

**Why it matters:** Events trigger decisions which create tasks. Stalled events = no new task creation.

**Measure:** Events processed per hour / Events in `pending` status

**Acceptable range:**
- `pending` count = 0 between runs = healthy
- `failed` events > 5/day = investigate

**Bad signal means:** Decision engine failing, DB issue, malformed event payload.

**Query:**
```sql
select status, count(*) from ai_events
where created_at > now() - interval '24 hours'
group by status;
```

---

## 3. Plan Generation Success Rate

**Why it matters:** Plan generation is the core product value. Failure = user gets no plan.

**Measure:** `completed` trainer tasks / total trainer tasks

**Acceptable range:**
- ≥ 95% completion rate = healthy
- < 90% = investigate
- < 75% = critical

**Bad signal means:** OpenAI API key invalid, token budget exceeded, prompt too long,
`generatePlan` function throwing, DB write failure.

**Query:**
```sql
select
  count(*) filter (where status = 'completed') as completed,
  count(*) filter (where status = 'failed') as failed,
  round(count(*) filter (where status = 'completed') * 100.0 / count(*), 1) as success_pct
from ai_tasks
where agent_slug = 'trainer'
  and created_at > now() - interval '7 days';
```

---

## 4. Coach Message Success Rate

**Why it matters:** Coach messages affect user engagement and shared memory.

**Measure:** `completed` coach tasks / total coach tasks

**Acceptable range:**
- ≥ 90% = healthy
- Coach failures are less critical than trainer failures

**Bad signal means:** Same as trainer — OpenAI issue, `ai_messages` table schema mismatch.

**Query:**
```sql
select status, count(*) from ai_tasks
where agent_slug = 'coach'
  and created_at > now() - interval '7 days'
group by status;
```

---

## 5. Email Delivery Success Rate

**Why it matters:** Users receive their plan via email. Failed delivery = frustrated user.

**Measure:** `email_sent = true` in `ai_tasks.result` for initial_plan tasks

**Acceptable range:**
- ≥ 95% delivery = healthy
- < 90% = SMTP issue

**Bad signal means:** SMTP credentials expired, email provider rate-limited, DKIM/SPF issue.

**Query:**
```sql
select
  count(*) filter (where result->>'email_sent' = 'true') as email_ok,
  count(*) filter (where result->>'email_sent' = 'false') as email_failed
from ai_tasks
where agent_slug = 'trainer'
  and task_type = 'initial_plan'
  and created_at > now() - interval '7 days';
```

---

## 6. Retry Rate

**Why it matters:** High retry rate = something is flaky. Usually OpenAI timeouts or DB issues.

**Measure:** Tasks with `attempts > 1` / total tasks

**Acceptable range:**
- < 5% retry rate = healthy
- 5–15% = warning
- > 15% = investigate

**Bad signal means:** External API instability, scheduler running too fast (SIGTERM), DB contention.

**Query:**
```sql
select
  count(*) filter (where attempts > 1) as retried,
  count(*) as total,
  round(count(*) filter (where attempts > 1) * 100.0 / count(*), 1) as retry_pct
from ai_tasks
where created_at > now() - interval '7 days';
```

---

## 7. DLQ Rate

**Why it matters:** DLQ tasks = permanently failed work. These represent users who never got their plan.

**Measure:** Tasks/events with `status = 'dlq'`

**Acceptable range:**
- 0 DLQ = ideal
- 1–3/week = acceptable (intermittent API failure)
- >5/week = systematic issue

**Bad signal means:** Permanent external API failure, bad task payload, schema mismatch.

**Query:**
```sql
select 'tasks' as type, count(*) from ai_tasks where status = 'dlq'
union all
select 'events', count(*) from ai_events where status = 'dlq';
```

---

## 8. Trusted Asset Exact vs Illustrative Ratio

**Why it matters:** Ratio shows whether meal images are trustworthy (exact) or fallback (illustrative/none).
A drop in exact ratio means Spoonacular is underperforming or queries are too noisy.

**Measure:** Count by `image_trust_level` in `meal_metadata_cache`

**Acceptable range:**
- ≥ 40% exact = healthy Spoonacular integration
- < 20% exact = Spoonacular key may be down or threshold too high

**Query:**
```sql
select image_trust_level, count(*),
  round(count(*) * 100.0 / sum(count(*)) over (), 1) as pct
from meal_metadata_cache
group by image_trust_level;
```

**Exercise registry:**
```sql
select trust_level, count(*) from exercise_asset_registry group by trust_level;
```

---

## 9. Time from Registration to Plan Ready

**Why it matters:** Users expect a plan immediately after registration.
If this is too slow, they think the product is broken.

**Measure:** Time between `body_metrics.created_at` and `ai_generated_plans.created_at`

**Acceptable range:**
- < 60 seconds = excellent (synchronous scheduler in registration flow)
- 1–5 minutes = acceptable (async scheduler run)
- > 10 minutes = problem

**Query:**
```sql
select
  bm.email,
  bm.created_at as registered_at,
  p.created_at as plan_ready_at,
  extract(epoch from (p.created_at - bm.created_at)) / 60 as minutes_to_plan
from body_metrics bm
join ai_generated_plans p on p.user_id = bm.user_id
where bm.created_at > now() - interval '7 days'
order by bm.created_at desc
limit 20;
```

---

## 10. Time from Event to Task Creation

**Why it matters:** Delayed event processing = delayed autonomous reactions.

**Measure:** Time between `ai_events.created_at` and `ai_tasks.created_at` (via `source_event_id`)

**Acceptable range:**
- < 5 minutes = healthy
- < 30 minutes = acceptable
- > 1 hour = scheduler not running often enough

---

## 11. Time from Task Creation to Completion

**Why it matters:** Shows OpenAI response times and scheduler throughput.

**Measure:** Time between `ai_tasks.created_at` and `ai_tasks.updated_at` (when status changed to completed)

**Acceptable range:**
- < 30 seconds = normal (synchronous execution in registration)
- < 5 minutes = acceptable (async)
- > 30 minutes = stuck queue

**Query:**
```sql
select
  agent_slug,
  task_type,
  avg(extract(epoch from (updated_at - created_at))) as avg_seconds,
  max(extract(epoch from (updated_at - created_at))) as max_seconds
from ai_tasks
where status = 'completed'
  and created_at > now() - interval '7 days'
group by agent_slug, task_type;
```

---

## Summary Dashboard (copy to Supabase SQL Editor)

```sql
-- One-query health summary
select
  (select count(*) from ai_tasks where status = 'pending') as pending_tasks,
  (select count(*) from ai_tasks where status = 'failed' and created_at > now() - interval '24h') as failed_24h,
  (select count(*) from ai_tasks where status = 'dlq') as dlq_tasks,
  (select count(*) from ai_events where status = 'pending') as pending_events,
  (select count(*) from ai_events where status = 'dlq') as dlq_events,
  (select count(*) from ai_generated_plans where created_at > now() - interval '24h') as plans_24h,
  (select count(*) from ai_messages where created_at > now() - interval '24h') as messages_24h,
  (select count(*) from ai_tasks where agent_slug='trainer' and result->>'email_sent'='false' and created_at > now() - interval '24h') as email_failures_24h;
```
