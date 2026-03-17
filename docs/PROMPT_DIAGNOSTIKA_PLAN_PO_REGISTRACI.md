# Prompt: Zjištění příčiny negenerování plánu po registraci

**Účel:** Tento dokument slouží jako návod pro zkušeného vývojáře nebo AI agenta k systematickému nalezení a opravě příčiny, proč se po registraci negeneruje plán (jídelníček + trénink). Bez fungujícího generování plánu je produkt k ničemu.

---

## 1. Role a kontext

**Chovej se jako senior vývojář s 10+ let praxe:**
- Systematická diagnostika – čtení kódu, logů a dat, žádné hádání.
- Postupuj podle tohoto promptu krok za krokem; na konci identifikuj příčinu a proveď opravu.

**Produktová pravda:**
Po registraci musí vzniknout plán (jídelníček + trénink) z AI asistenta. Jediná cesta je:

```
trainer / initial_plan task → executeAITask → runPlanPipeline → generatePlan → persist → e-mail
```

Pokud se plán negeneruje, najdi **konkrétní** místo selhání a oprav ho.

---

## 2. Odkazy na strukturu repozitáře

### Kanonický flow
- [docs/CORE_FLOW_REGISTRACE_AI_PLAN.md](CORE_FLOW_REGISTRACE_AI_PLAN.md) – 6 kroků od formuláře po zobrazení a e-mail.

### Klíčové soubory (v pořadí flow)

| Pořadí | Soubor | Úloha |
|--------|--------|-------|
| 1 | [pages/api/body-metrics.js](../pages/api/body-metrics.js) | Insert body_metrics, createInitialAITasks, enqueueAIEvent, triggerImmediateDecision, fire-and-forget fetch na `/api/ai/run-scheduler` – vždy vrací processing |
| 2 | [lib/createInitialAITasks.js](../lib/createInitialAITasks.js) | Vytvoření `trainer/initial_plan` a `coach/onboarding_message` |
| 3 | [lib/aiScheduler.js](../lib/aiScheduler.js) | Načtení pending tasků, executeAITask, update status completed/failed |
| 4 | [lib/taskExecutors.js](../lib/taskExecutors.js) | executeTrainerTask: loadLatestBodyMetrics, runPlanPipeline, validace, isPublishableFromAI (pouze ai/ai_retry/ai_retry_truth), persistTrainerPlan, sendPlanEmail |
| 5 | [lib/aiOrchestrator.js](../lib/aiOrchestrator.js) | runPlanPipeline volá generatePlan |
| 6 | [lib/generatePlan.js](../lib/generatePlan.js) | buildUserPrompt, runAssistantWithPrompt (runAgent), validace HTML, truth check, fallback (deterministic_fallback) |
| 7 | [lib/runAgent.js](../lib/runAgent.js) | getAgentConfig, buildAgentContext, volání OpenAI Responses API |
| 8 | [lib/getAgentConfig.js](../lib/getAgentConfig.js) | Konfigurace trainera (prompt, model, enabled) |
| 9 | [lib/buildAgentContext.js](../lib/buildAgentContext.js) | Sestavení runtime kontextu pro agenta |
| 10 | [lib/loadAgentDocumentsContext.js](../lib/loadAgentDocumentsContext.js) | Načtení supporting_documents ze Supabase |

### Profil a debug
- [pages/api/profile.js](../pages/api/profile.js) – vrací `plans`, `plan_state`, `_diagnostics`
- [pages/api/debug/latest-plan-status.js](../pages/api/debug/latest-plan-status.js) – GET `?email=...`, vyžaduje `Authorization: Bearer ADMIN_TOKEN`

---

## 3. Známé body selhání (z historie projektu)

| Příčina | Projev | Kde hledat |
|---------|--------|------------|
| **OpenAI 429 / quota** | Trainer volá OpenAI; při 429 task končí failed, plán se neuloží | Env: OPENAI_API_KEY, limity účtu; ai_tasks.last_error |
| **Vercel timeout** | Funkce 60 s (nebo 120 s při maxDuration); runPlanGeneration běží až 48 s + scheduler. Při timeoutu request skončí dřív než AI – task zůstane pending | vercel.json maxDuration; PLAN_GENERATION_TIMEOUT_MS |
| **AI vrátí fallback** | generatePlan vrací generation_source = deterministic_fallback (validace nebo truth check selhaly). taskExecutors plán **nepublikuje** (isPublishableFromAI = false), task se označí failed | taskExecutors: isPublishableFromAI; generatePlan: validatePublishedPlanHtml, validatePlanTruth |
| **Agent disabled** | getAgentConfig(trainer) vrátí enabled: false – runAgent hodí výjimku | ai_agents tabulka; getAgentConfig |
| **Chybějící body_metrics** | loadLatestBodyMetrics(user_id) hodí – task selže. Možné při race | Pořadí: insert body_metrics → createInitialAITasks |
| **E-mail / persist selže** | Plán je v DB, ale uživatel nedostane e-mail – může vypadat jako „plán se negeneruje“ | sendPlanEmail; ai_generated_plans insert |
| **CRON_SECRET chybí** | body-metrics nevolá scheduler (fetch selže) – pending tasky zpracuje až cron | Env: CRON_SECRET nebo AI_SCHEDULER_SECRET |

---

## 4. Krokový diagnostický postup

### Krok 1: Ověřit vstup
- Máš konkrétní e-mail po neúspěšné registraci? Pokud ano → krok 2.
- Pokud ne: simuluj registraci (POST `/api/body-metrics` s platnými údaji), zachyť odpověď a případně logy.

### Krok 2: Debug endpoint
```
GET /api/debug/latest-plan-status?email=USER_EMAIL
Authorization: Bearer ADMIN_TOKEN
```

Z odpovědi zapiš:
- `trainer_task.status` (pending / processing / completed / failed / dlq)
- `trainer_task.last_error`
- `trainer_task.result`: generation_source, outcome_type, fallback_used, root_failure_stage
- `ai_generated_plan`: existuje?, html_length
- `body_metrics`: existuje?

### Krok 3: DB (pokud máš přístup)
- Dotaz na `ai_tasks` (agent_slug = 'trainer', task_type = 'initial_plan') – status, last_error, result
- Dotaz na `ai_generated_plans` pro user_id
- Dotaz na `body_metrics` pro user_id

Skript:
```
node scripts/check-recent-failures.mjs <SUPABASE_PAT> [hours=24]
```
Vypíše nedávné failed/DLQ tasky.

### Krok 4: Logy (Vercel / runtime)
Hledat řetězce:
- `[body-metrics]`
- `[executeTrainerTask]`
- `[generatePlan]`
- `runAgent`
- `429`, `quota`
- `fallback`, `AI-first`, `missing core sections`

### Krok 5: Env
- `OPENAI_API_KEY` nastaven
- Případně `OPENAI_*` limity nebo budget (lib/aiOps.js)

### Krok 6: Ověření po opravě
- Znovu registrace (nebo POST `/api/retry-initial-plan` pro existujícího uživatele)
- GET `/api/profile` s Bearer tokenem – očekávat `plan_state: 'ready'` a `plans[0].plan_html` vyplněný
- GET `/api/debug/latest-plan-status?email=...` – očekávat `trainer_task.status: 'completed'`, `ai_generated_plan` existuje

---

## 5. Checklist možných oprav

| Příčina | Možná oprava |
|---------|---------------|
| **429 / quota** | Zvýšit kvótu OpenAI účtu; nebo dočasně retry s backoff v runAgent/aiOps |
| **Timeout** | Snížit PLAN_GENERATION_TIMEOUT_MS; zkrátit prompt/kontext; zajistit, že cron `/api/ai/run-scheduler` běží a dokončí pending task |
| **Fallback not publishable** | Zlepšit prompt nebo validaci tak, aby AI častěji vracela platný plán; přidat další retry v generatePlan; **neodstraňovat** pravidlo „pouze AI plán“ |
| **Agent disabled** | Zapnout trainera v DB (ai_agents.enabled = true) nebo opravit getAgentConfig |
| **Chybějící body_metrics** | Zajistit, že createInitialAITasks běží až po úspěšném insertu body_metrics; user_id konzistentní |

---

## 6. Výstup od executora

Po provedení diagnostiky a opravy uveď:

1. **Co byla příčina** – konkrétní místo a důvod selhání
2. **Které soubory byly změněny** – seznam souborů a stručný popis úprav
3. **Jak ověřit, že plán se po registraci generuje** – kroky pro manuální nebo automatické ověření
