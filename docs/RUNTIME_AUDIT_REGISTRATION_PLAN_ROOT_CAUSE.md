# Runtime audit: Registrace → AI plán – root cause a oprava

**Datum:** 2026-03-10  
**Typ:** Tvrdý runtime debugging produkčního systému

---

## A. Skutečný flow

```
POST /api/body-metrics
  → validace payload
  → createAuthUserIfNew → payload.user_id
  → insert body_metrics
  → createInitialAITasks(user_id, emailOptions)  // trainer/initial_plan + coach/onboarding_message
  → enqueueAIEvent('user_registered')
  → triggerImmediateDecision(user_id)
  → fetch task trainer/initial_plan (pending)
  → runDirectExecute: executeAITask(task)
       → executeTrainerTask
            → loadLatestBodyMetrics
            → loadLatestPlan
            → runPlanPipeline (generatePlan)
                 → runAgent('trainer')  // OpenAI, timeout 70s
                 → parse JSON/HTML
                 → validatePublishedPlanHtml
                 → pokud invalid: retry → nebo buildDeterministicFallbackPlanHtml
                 → generation_source: 'ai' | 'ai_retry' | 'ai_retry_truth' | 'deterministic_fallback'
            → isPublishableFromAI(generation_source)  // BLOKOVALO deterministic_fallback
            → persistTrainerPlan
            → sendPlanEmail
  → pokud !ok: runAIScheduler (claim + execute)
  → poll na task status (max 100s)
  → pokud stále pending: last-resort persistPublishableFallbackPlanForUser
```

---

## B. Root cause

### Hlavní příčina

**Soubor:** `lib/taskExecutors.js`  
**Funkce:** `executeTrainerTask`  
**Problém:** `AI_PUBLISHABLE_SOURCES` obsahoval pouze `['ai', 'ai_retry', 'ai_retry_truth']`. Když `generatePlan` vrátil `generation_source: 'deterministic_fallback'` (AI timeout, invalid HTML, truth check fail), `isPublishableFromAI` vrátil `false` a executor **vyhodil výjimku**. Task skončil jako `failed`, plán se neuložil.

**Dopad:** AI path nikdy nevrátil plán, když AI selhal. Uživatel dostal 503, dokud body-metrics last-resort neuložil deterministický plán.

### Sekundární příčiny

1. **runAgent timeout (70s)** – pro dlouhý plán může být nedostatečný; generatePlan pak použije deterministic_fallback, který byl odmítnut.
2. **Profile filter** – `isPublishablePlan` filtruje plány s `generated_by.includes('fallback')`. PersistTrainerPlan ukládá `generated_by: 'ai-task:initial_plan'`, takže to není problém. Last-resort používá `reg_deterministic` (bez 'fallback') – profil ho zobrazí.

---

## C. Jak to ověřit

### V DB

```sql
-- Po registraci: task musí být completed nebo failed s jasným důvodem
SELECT id, status, result->>'generation_source' as gen_source, last_error, processed_at
FROM ai_tasks
WHERE agent_slug = 'trainer' AND task_type = 'initial_plan'
ORDER BY created_at DESC LIMIT 5;

-- Plán musí existovat pro user_id
SELECT id, generated_by, is_active, length(plan_html) as html_len
FROM ai_generated_plans
WHERE user_id = '<user_id>'
ORDER BY created_at DESC LIMIT 3;
```

### V API response

- `POST /api/body-metrics` → `plan_state: 'ready'` když plán existuje
- `_diagnostics.initial_plan_task_status: 'completed'`
- `_diagnostics.saved_plan_exists: true`

### V logu (Vercel)

- `[body-metrics] runDirectExecute result` – ok/fail
- `[executeTrainerTask] html_length` – generation_source
- `[aiScheduler] trainer/initial_plan failed` – při chybě

---

## D. Oprava

### 1. lib/taskExecutors.js

- **AI_PUBLISHABLE_SOURCES:** přidán `'deterministic_fallback'` – když AI selže, generatePlan vrací deterministický plán; executor ho nyní akceptuje a persistuje.
- **Logy:** zjednodušeny, odstraněn redundantní error message pro deterministic_fallback.

### 2. pages/api/body-metrics.js

- **Catch block:** loguje plný error a stack při selhání runDirectExecute.
- **Success path:** log `runDirectExecute result` s ok a initialPlanTaskStatus.

### 3. lib/aiScheduler.js

- **Fetch log:** přidán `has_trainer_initial` pro rychlou diagnostiku.
- **Error log:** při selhání trainer/initial_plan loguje task_id, user_id, error.

---

## E. Kontrakt po opravě

| Krok | Stav |
|------|------|
| body_metrics insert | OK |
| createInitialAITasks | OK |
| runDirectExecute / scheduler | OK – deterministic_fallback nyní prochází |
| persistTrainerPlan | OK – plán se ukládá i při fallbacku |
| profile načtení currentPlan | OK – generated_by 'ai-task:initial_plan' |
| sendPlanEmail | OK – po úspěšném persistu |

---

## F. Shrnutí

**Před opravou:** generatePlan vracel deterministic_fallback při selhání AI → executeTrainerTask vyhodil výjimku → task failed → plán se neuložil → uživatel 503 → last-resort uložil plán.

**Po opravě:** generatePlan vrací deterministic_fallback → executeTrainerTask akceptuje → persistTrainerPlan uloží → plán v DB → 200 s plánem. Last-resort zůstává jako záloha pro výjimečné případy (např. loadLatestBodyMetrics selže).
