# Finální refaktor: PLAN ALWAYS FROM AI

## 1. Proč současný systém ještě není čistě AI-only

- **V registračním requestu** se synchronně volal `executeAITask()` → `runPlanPipeline()` → `generatePlan()`. Když AI vrátila fallback (nebo validace/truth check selhaly), `taskExecutors` označil task jako `failed` a vyhodil výjimku. Odpověď pak nesla `plan_state: 'failed'` a uživatel viděl hlášku „Plán se nepodařilo dokončit“.
- **Fallback** byl v `generatePlan.js` stále generován a vracen; v `taskExecutors` byl správně odmítnut (AI-first guard), ale tím pádem task skončil jako `failed` v rámci téhož HTTP požadavku.
- **Čekání na AI** v jednom requestu (až 48 s) znamenalo, že při timeoutu nebo při selhání AI uživatel dostal buď fail zprávu, nebo závislost na tom, že „timeout proběhl dřív než fail“.

## 2. Co se změnilo

### pages/api/body-metrics.js
- **Odstraněno:** celé synchronní volání `runPlanGeneration()` (přímé `executeAITask`, scheduler v requestu, poll loop, fallback execution po chybě scheduleru) a `Promise.race` s 48s timeoutem.
- **Přidáno:** po `createInitialAITasks` + `enqueueAIEvent` + `triggerImmediateDecision` se načte řádek tasku jen pro diagnostiku; **scheduler se spustí na pozadí** (`runAIScheduler()` bez await). Odpověď se vždy sestaví s `planPending = true`, `initialPlanTaskStatus = 'pending'`, takže `plan_state` vychází jako `processing` a zpráva je vždy „Plán se dokončuje na pozadí“.
- **Důsledek:** uživatel po registraci **nikdy nevidí** „Plán se nepodařilo dokončit“ z tohoto endpointu; vždy dostane úspěch a přesměrování na login. Plán dokončí scheduler (v pozadí v témže procesu) nebo cron (`/api/ai/run-scheduler`).
- Odstraněn import `executeAITask`.
- `onboardingResult` je při `planPending` nastaven na `'processing'`.

### lib/taskExecutors.js
- Do **úspěšného** výsledku trainer tasku doplněna diagnostika: `trainer_ai_attempted`, `trainer_ai_succeeded`, `trainer_ai_failed`, `trainer_ai_failure_reason`, `published_to_user`, `email_attempted`, `email_sent`, `email_error`, `fallback_used`, `fallback_internal_only`, `profile_plan_returned`, `root_failure_stage`.
- Při neúspěchu (fallback not publishable) se do result ukládá `email_sent: false`, `email_error` atd. (již dříve).

### pages/api/profile.js
- Do `_diagnostics` doplněna pole: `trainer_ai_attempted`, `trainer_ai_succeeded`, `trainer_ai_failed`, `trainer_ai_failure_reason`, `published_to_user`, `email_attempted`, `email_sent`, `email_error`, `fallback_internal_only`, `profile_plan_returned`, `root_failure_stage` (čteno z `initialPlanResult`).

### Beze změny (pravidla již platí)
- **lib/generatePlan.js** – stále vrací `generation_source: 'deterministic_fallback'` při fallbacku; publikace se řeší v taskExecutors.
- **lib/taskExecutors.js** – `isPublishableFromAI()`: publikace jen při `ai` / `ai_retry` / `ai_retry_truth`; při fallbacku task končí jako `failed`, e-mail s plánem se neposílá.
- **lib/mail.js** – nevolá se s fallbackem, protože taskExecutors fallback nepublikuje.
- **pages/api/profile.js** – plány s `generated_by` obsahujícím `fallback` se z `plansData` filtrují (již dříve).

## 3. Jak teď funguje registrace

1. Uložení vstupů do `body_metrics`, vytvoření/auth uživatele.
2. `createInitialAITasks(userId, emailOptions)` – vloží `trainer / initial_plan` a `coach / onboarding_message` (pending).
3. `enqueueAIEvent('user_registered', userId, …)` a `triggerImmediateDecision(userId)`.
4. Načtení řádku trainer tasku (pro diagnostiku).
5. **Spuštění `runAIScheduler()` na pozadí** (bez await) – zpracuje pending tasky včetně `initial_plan`.
6. Sestavení odpovědi: **vždy** `plan_state = 'processing'`, `planPending = true`, `message` = „Plán se dokončuje na pozadí“ (pokud účet vznikl).
7. Uložení memberships, user_habits, writeOnboardingEvent, návrat 200 s `planSent: false`, `planPending: true`, `plan_state: 'processing'`.
8. Frontend zobrazí úspěch a přesměruje na login; plán dokončí scheduler na pozadí nebo cron.

## 4. Jak teď funguje AI generování plánu

1. **Vytvoření tasku:** `createInitialAITasks` vloží `trainer / initial_plan` se statusem `pending`.
2. **Zpracování:** `runAIScheduler()` (z body-metrics na pozadí nebo z cronu `/api/ai/run-scheduler`) načte pending tasky, označí je jako `processing`, volá `executeAITask(task)`.
3. **executeTrainerTask:** načte body_metrics, volá `runPlanPipeline()` (→ `generatePlan()`). Pokud `generation_source` není jeden z `ai` / `ai_retry` / `ai_retry_truth`, task se označí jako `failed` a vyhodí se výjimka (plán se neukládá, e-mail neposílá).
4. Pokud je plán od AI platný: `persistTrainerPlan()` uloží do `ai_generated_plans` s `is_active: true`, pro `initial_plan` se zavolá `sendPlanEmail()`.
5. Task se označí jako `completed`, result obsahuje `plan_id`, `email_sent`, diagnostiku.

## 5. Jak teď funguje e-mail

- E-mail s plánem se volá **jen** v `taskExecutors.executeTrainerTask` po úspěšném `persistTrainerPlan()` a pouze pro `initial_plan`, když je plán validní a `generation_source` je z AI (jinak se do této větve vůbec nedostane).
- Při fallbacku nebo selhání AI se e-mail v taskExecutors nevolá; uživatel nedostane falešný plán.

## 6. Jak teď funguje profil

- Načte `body_metrics`, `ai_generated_plans` (s `generated_by`), `ai_tasks` (trainer, initial_plan), atd.
- Plány s `generated_by` obsahujícím `fallback` se z `plansData` vyfiltrují – nejsou vráceny jako produkční.
- `plan_state`: `processing` (task pending/processing), `ready` (validní AI plán), `failed` (task failed/dlq), `invalid` (completed bez validního plánu), `missing` (žádný task/plán).
- V `_diagnostics` jsou `trainer_ai_attempted`, `trainer_ai_succeeded`, `email_sent`, `generation_source`, `fallback_used`, atd.

## 7. Jak to otestovat

1. **Registrace (ON Club / START / VIP):** odeslat formulář, ověřit že odpověď je 200, `plan_state === 'processing'`, `planPending === true`, zpráva typu „Plán se dokončuje na pozadí“ a přesměrování na login. **Nesmí** se zobrazit „Plán se nepodařilo dokončit“.
2. **Po přihlášení:** otevřít profil; pokud scheduler/cron stihl dokončit task, měl by být `plan_state: 'ready'` a zobrazen plán. Pokud ještě ne, `plan_state: 'processing'`.
3. **Cron:** volat `POST /api/ai/run-scheduler` s `CRON_SECRET` (nebo `AI_SCHEDULER_SECRET`) a ověřit, že pending `initial_plan` se zpracuje.
4. **Debug:** `GET /api/debug/latest-plan-status?email=...` s ADMIN_TOKEN – zkontrolovat `trainer_task.status`, `result_generation_source`, `debug_plan_state`.

## 8. Je to safe pustit na main?

**Ano.** Registrace už nezávisí na tom, že AI stihne odpovědět v jednom requestu; vždy vrací `processing` a plán se dokončí asynchronně. Uživatel nevidí chybovou hlášku „Plán se nepodařilo dokončit“ z registračního flow. Pravidlo „plán jen z AI“ zůstává (fallback se nepublikuje, e-mail jen u AI plánu). Cron / run-scheduler musí nadále běžet, aby pending tasky doběhly.
