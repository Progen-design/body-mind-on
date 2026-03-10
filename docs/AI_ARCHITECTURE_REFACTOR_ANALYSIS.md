# Analýza současného stavu AI architektury a cíl refaktoru

## 1. Jak dnes funguje registrace → AI plán

- **Vstup:** `/on-club`, `/start`, `/chci-vip` → formulář odešle na `POST /api/body-metrics`.
- **body-metrics.js:** Validace → `createAuthUserIfNew` → insert do `body_metrics` → `createInitialAITasks(user_id, emailOptions)` (vytvoří úlohy `trainer/initial_plan`, `coach/onboarding_message`) → `enqueueAIEvent('user_registered')` → `triggerImmediateDecision(user_id)` → **`runAIScheduler()`** v rámci téhož requestu.
- **Scheduler:** Načte pending `ai_tasks`, claim (status → `processing`), pro každou volá `executeAITask(task)`.
- **executeTrainerTask:** Načte `body_metrics`, volá `generatePlan(...)` (lib/generatePlan.js → `runAgent('trainer', …)`), pak `persistTrainerPlan` (insert do `ai_generated_plans`), pak `sendPlanEmail`.
- **Profil:** `GET /api/profile` načte `ai_generated_plans` jako `plans`; `profil.js` zobrazuje `currentPlan.plan_html`.

**Závěr:** Jediná hlavní cesta je event → decision → task → agent → executor → artifact. Žádné paralelní volání `generatePlanForEmail` v body-metrics.

---

## 2. Legacy / paralelní flow

- **profile-preferences.js:** Při změně preferencí volá přímo **`generatePlanForEmail(email, { bmOverride, … })`** – tedy obchází ai_tasks a píše přímo do `ai_generated_plans` a posílá e-mail. Toto je druhá, „přímá“ cesta k plánu. Refaktor ji má zachovat jako orchestration-compatible (event preference_change → lze v budoucnu routovat na task adjust_plan), ale funkčně nesmí zmizet.
- **generatePlan.js:** Exportuje `generatePlanForEmail()` – používá se z profile-preferences a případně z jiných míst (send-plan-again, generate-plan-next-week). Používá `runAgent('trainer')` a přímý insert do `ai_generated_plans`.
- **assistant-intake.js:** Samostatný tok (tabulka `registrations`, jiný e-mail). Není součástí core flow registrace → AI plán; refaktor ho nemusí měnit.

---

## 3. Kde je AI řízena DB a kde je hardcoded

| Oblast | DB | Hardcoded v JS |
|--------|----|----------------|
| Agent config (model, prompt, temperature) | `ai_agents` (slug, name, model, system_prompt, temperature, enabled) | Fallback v `getAgentConfig`: když řádek chybí, vrací `enabled: true` a preset z `FALLBACK_BY_SLUG`. |
| Verze agenta | Sloupce `version`, `prompt_version` v ai_agents (migrace 20260310) | V getAgentConfig se nečtou, v kódu default 1. |
| Task typy (side_effect, output_schema) | Chybí | Celý `aiTaskRegistry.js` – TASK_REGISTRY podle agent_slug/task_type. |
| Trigger / decision pravidla | Chybí | `aiDecisionEngine.js` – pravidla (missing_plan → initial_plan, fat_loss_not_working → adjust_plan, …) natvrdo v kódu. |
| Kontext pro agenta | Chybí | `buildAgentContext.js` – větvení podle `agentSlug === 'trainer'|'coach'|'marketing'|'social'`. |
| Executor routing | Chybí | `executeAITask` – větvení `if (agent_slug === 'trainer')` atd. |
| Cache key | — | `buildAgentCacheKey`: model, systemPrompt, userContent, temperature, agentVersion, promptVersion. Chybí task_type a contract_version. |

---

## 4. Co brání autonomii a soběstačnosti

- Agent bez záznamu v DB se stále spustí (fallback s `enabled: true`).
- Přidání nového task typu nebo triggeru vyžaduje změnu JS, ne jen DB.
- Kontext a executor jsou vázané na slug v kódu.
- Žádná idempotence na úrovni tasku (idempotency_key).
- Task ve stavu `processing` bez časového limitu může viset napořád (chybí `processing_started_at` a recovery).

---

## 5. Cílová architektura (po refaktoru)

- **DB jako control plane:** Agent bez platného záznamu v `ai_agents` s `enabled = true` se v production nespustí. Fallback jen pro development.
- **Jediný orchestration model:** event → decision → task → agent → executor → artifact.
- **DB-driven:** `ai_agents` (rozšířené o context_profile_slug, artifact_type, version, …), `ai_task_types`, `ai_trigger_rules`, `ai_context_profiles`, `ai_executor_bindings`, `ai_agent_versions`.
- **Task:** idempotency_key, source_event_id, processing_started_at, artifact_id.
- **Validace plánu:** trainer → (volitelně) nutrition_validator, training_validator → publish do `ai_generated_plans`. Pro registraci zůstává zaručeno: plán se vždy uloží a uživatel ho uvidí (validátory mohou běžet jako post-step nebo async; při selhání validace plán stejně publikujeme a označíme stav).
- **profile-preferences:** Zachovat stávající chování (generatePlanForEmail); připraveno na budoucí přepnutí na event + task adjust_plan.

---

## 6. Co refaktor nemění (core flow)

- `POST /api/body-metrics`: pořadí insert body_metrics → createInitialAITasks → enqueueAIEvent → triggerImmediateDecision → runAIScheduler.
- `createInitialAITasks`: vytváří trainer/initial_plan a coach/onboarding_message.
- `executeTrainerTask`: generatePlan → persistTrainerPlan → sendPlanEmail pro initial_plan.
- `GET /api/profile`: vrací `plans` z `ai_generated_plans`.
- Zobrazení plánu na profilu z `profile.plans` a `currentPlan.plan_html`.

Tento dokument slouží jako referenční analýza před a po refaktoru.
