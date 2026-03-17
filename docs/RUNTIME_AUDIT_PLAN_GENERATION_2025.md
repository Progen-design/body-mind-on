# Runtime audit: generování plánu po registraci (2025)

## A. Skutečný flow

```
POST /api/body-metrics
  → validace, createAuthUserIfNew
  → insert body_metrics (s user_id)
  → createInitialAITasks(user_id, emailOptions)  → insert trainer/initial_plan + coach/onboarding_message
  → enqueueAIEvent('user_registered')
  → triggerImmediateDecision(user_id)
  → fetch(POST /api/ai/run-scheduler) s CRON_SECRET  [AWAIT + 2.5s timeout]
  → return 200 { plan_state: 'processing', planPending: true }

/api/ai/run-scheduler (samostatná invokace)
  → generateAITasks, processAIEvents, runAIDecisionEngine
  → runAIScheduler()
    → fetch pending ai_tasks (status=pending, next_retry_at null nebo lte now)
    → pro každý task: claim (processing), executeAITask(task)
      → trainer/initial_plan: executeTrainerTask
        → loadLatestBodyMetrics(user_id)
        → runPlanPipeline (generatePlan) → runAgent('trainer')
        → persistTrainerPlan → insert ai_generated_plans
        → sendPlanEmail
    → update task status completed/failed
```

## B. Root cause

**Hlavní příčina: Fire-and-forget fetch na Vercelu**

- Vercel serverless funkce zamrzne po odeslání HTTP response.
- Nečekaný (fire-and-forget) `fetch()` nemusí být nikdy odeslán – event loop může být ukončen dříve.
- Důsledek: `/api/ai/run-scheduler` se nikdy nevolá, tasky zůstávají `pending`, plán se negeneruje.
- Cron (denní) by tasky zpracoval později, ale uživatel čeká hodiny.

**Vedlejší příčiny (možné):**
- CRON_SECRET chybí → fetch vrací 401, scheduler se nespustí
- ai_tasks primary fetch selže na `.or(next_retry_at)` při chybějící sloupci → fallback fetch bez filtru funguje
- OpenAI 429, timeout, fallback → task failed, ale flow je korektní

## C. Jak to ověřit

1. **V DB:** `ai_tasks` pro user_id – status (pending/completed/failed), last_error, result
2. **V API:** GET `/api/debug/latest-plan-status?email=...` s ADMIN_TOKEN – trainer_task.status, result_generation_source
3. **V logu:** `[body-metrics] scheduler triggered ok` nebo `scheduler trigger sent (timeout)` – potvrzuje, že fetch proběhl
4. **V logu:** `[aiScheduler] processing tasks` – potvrzuje, že scheduler načetl tasky

## D. Oprava

1. **body-metrics.js:** Fire-and-forget fetch nahrazen za `await fetch()` s AbortController (2.5 s timeout). Request se odesílá, po 2.5 s se abortuje čekání – run-scheduler běží dál v samostatné invokaci.
2. **run-scheduler.js:** Přidán log `[run-scheduler] completed`
3. **aiScheduler.js:** Přidány logy při fetch fail a při zpracování tasků

## E. Kontrakt po opravě

- body_metrics insert ✓
- createInitialAITasks ✓
- Scheduler trigger: await fetch s timeout ✓
- runAIScheduler → executeTrainerTask ✓
- persistTrainerPlan → ai_generated_plans ✓
- profile načtení currentPlan ✓
- sendPlanEmail po persist ✓
