# AI runtime flow — Body & Mind ON

> Aktuální stav kódu (HEAD `bfb9651+`). Tento dokument popisuje **co se skutečně spouští v produkci**, ne historické návrhy.

## Rychlý přehled

| Otázka | Odpověď |
|--------|---------|
| Kdo generuje jídelníček? | `runUnifiedPlanPipeline` → katalog `recipes_catalog` + `scoreRecipeSimplicity` |
| Volá registrace `runAgent('trainer')`? | **Ne** |
| Co znamená task `trainer/initial_plan`? | **Task slug** — spouští `executeTrainerTask`, ne OpenAI trainer agenta |
| Kdo je aktivní OpenAI agent při START? | **`coach`** (`onboarding_message`) |
| Používá e-mail V8 AI? | **Ne** — jen HTML šablona |
| Kde jsou prompty agentů? | **`lib/agentPromptsForSync.js`** + `getAgentConfig()` (kód, ne DB) |

---

## 1. START registrace (produkční cesta)

```
POST /api/body-metrics
  → insert body_metrics + user_habits
  → createInitialAITasks(userId)
       ├─ ai_task: agent_slug=trainer, task_type=initial_plan
       └─ ai_task: agent_slug=coach, task_type=onboarding_message
  → enqueueAIEvent('user_registered')
  → executeAITask(initial_plan)  [sync v requestu nebo scheduler]
       → executeTrainerTask
       → runUnifiedPlanPipeline({ useOpenAI: false })
            → generateStructuredPlan
            → buildCatalogSkeletonPlan        [deterministický skeleton]
            → resolveMealsFromCatalog
            → scoreRecipeSimplicity           [výběr jednoduchých receptů]
            → wger resolveWorkouts
            → validateStructuredPlan
            → renderPlanHtmlFromStructured
       → persist ai_generated_plans
       → sendPlanEmail (V8 template, bez AI)
  → runAIScheduler
       → executeCoachTask
       → runAgent('coach')                   [OpenAI Responses API]
       → insert ai_messages
```

**Poznámky:**

- `useOpenAI: false` je default u `initial_plan` — primární cesta je **katalog**, ne GPT skeleton.
- Volitelný GPT skeleton běží jen při `OPENAI_PLAN_ENABLED=true` **a** explicitním `useOpenAI: true` (admin/API, ne START).
- `schedulePlanEnhancementAsync` může po doručení plánu doplnit texty (inline prompt, ne coach agent).

---

## 2. Coach zprávy

```
ai_task: coach / onboarding_message | motivation_message | recovery_message | positive_reinforcement
  → executeCoachTask
  → buildAgentContext('trainer_coach')
  → runAgent('coach')
  → ai_messages (+ volitelně user_ai_memory)
```

**Kontext coacha:** `body_metrics`, `latest_plan`, `user_habits`, `progress_analysis`, `shared_memory`.

**Source of truth instrukcí:** `AGENT_PROMPTS.coach` v `lib/agentPromptsForSync.js` (PROMPT_VERSION v kódu).

---

## 3. Týdenní / ruční plán

| Vstup | Cesta |
|-------|--------|
| `/api/generate-plan-next-week` | `generatePlanForEmailViaUnified` → `runUnifiedPlanPipeline` |
| `/api/generate-plan` | `runUnifiedPlanPipeline` |
| `/api/profile-preferences` | `generatePlanForEmail` → unified pipeline |
| Admin regenerate | `generatePlanForEmailViaUnified` |

**`weekly_plan_update` ai_task:** definován v registry, ale **automatická generace je FROZEN** (`generateAITasks()`). V produkci se týdenní plán typicky generuje ručně přes API.

---

## 4. E-mail plánu

```
sendPlanEmail (lib/mail.js)
  → weeklyPlanEmailV8.js + bmon_weekly_plan_email_v8.html
  → structured_plan_json z DB (stejná data jako profil)
```

Žádný AI agent. Default `EMAIL_TEMPLATE_VERSION=v8`.

---

## 5. Simple meal policy

| Vrstva | Soubor | Kdy |
|--------|--------|-----|
| Runtime scoring | `lib/recipeSimplicityScore.js` | Výběr z `recipes_catalog` |
| Zjednodušení názvů | `simplifyMealDisplayName` | Profil, e-mail, modal receptu |
| GPT skeleton (volitelně) | `SIMPLE_MEAL_POLICY_PROMPT_BLOCK` v `planOrchestrator.js` | Jen při `useOpenAI:true` |
| Kvalita dodání | `PLAN_DELIVERY_QUALITY_BLOCK` | Stejně — volitelný GPT skeleton |

Produkční START plán: **scoring + katalog**, ne GPT prompty.

---

## 6. Task slug vs skutečný agent

| Pojem | Význam |
|-------|--------|
| **Task slug** `trainer` | Historický název úkolu v `ai_tasks`. Executor = `executeTrainerTask` → pipeline. |
| **Skutečný agent** `coach` | Jediný aktivní OpenAI agent v registraci — `runAgent('coach')`. |
| **Legacy agent** `trainer` | `TRAINER_SYSTEM_PROMPT` + `runAgent('trainer')` — **nepoužívá se** pro plán. Sync do DB pro metadata. |
| **Plan orchestrator** | Není agent v `ai_agents` — inline prompty v `planOrchestrator.js`. |

---

## 7. Tabulka komponent

| Komponenta | Stav | Použití | Source of truth |
|------------|------|---------|-----------------|
| `runUnifiedPlanPipeline` | **ACTIVE** | Všechny plány | `lib/unifiedPlanPipeline.js` |
| `buildCatalogSkeletonPlan` | **ACTIVE** | Default skeleton | `lib/services/deterministicFallback.js` |
| `scoreRecipeSimplicity` | **ACTIVE** | Výběr jídel | `lib/recipeSimplicityScore.js` |
| `executeTrainerTask` | **ACTIVE** | Task slug `trainer` | `lib/taskExecutors.js` |
| `runAgent('coach')` | **ACTIVE** | Coach zprávy | `agentPromptsForSync.js` → `getAgentConfig` |
| `runAgent('trainer')` | **LEGACY** | Nepoužívá se pro plán | `assistantInstructions.js` |
| `planOrchestrator` GPT | **ACTIVE (volitelné)** | Skeleton při env flag | `planOrchestrator.js` |
| `nutrition_validator` | **UNUSED** | Dead code path | Definováno, nevoláno |
| `training_validator` | **UNUSED** | Dead code path | Definováno, nevoláno |
| `marketing` / `social` | **ADMIN ONLY** | `/api/ai/route` | Definováno, bez produkčních tasků |
| `runPlanValidators` | **LEGACY** | Nepoužívá se | `lib/planValidators.js` |
| `generateAITasks()` weekly | **FROZEN** | Vypnuto | `lib/generateAITasks.js` |
| `ai_agents.system_prompt` (DB) | **METADATA** | Admin/sync; runtime ignoruje text | `getAgentConfig.js` |
| `ai_config` (DB) | **UNUSED** | Není v kódu | — |
| E-mail V8 | **ACTIVE** | Odeslání plánu | `lib/mail.js`, `weeklyPlanEmailV8.js` |

---

## 8. Budoucí multi-agent architektura

Doporučený směr (bez breaking changes):

1. Ponechat **jeden plánovací orchestrátor** (`runUnifiedPlanPipeline`).
2. Coach jako **samostatný konverzační agent** s bohatým kontextem (plán, návyky, adherence).
3. Validátory buď **znovu zapojit** do structured validace, nebo **odstranit** z UI/docs.
4. Přejmenovat task slug `trainer` → `plan_generator` (jen dokumentačně / migrace task typu).
5. DB sync (`sync-agent-prompts-from-code.mjs`) jen pro admin konzistenci — runtime zůstává v kódu.

---

## Související soubory

- `lib/getAgentConfig.js` — prompty vždy z kódu, DB jen `enabled`
- `lib/createInitialAITasks.js` — registrace tasků
- `lib/aiTaskRegistry.js` — mapování task_type → executor
- `scripts/sync-agent-prompts-from-code.mjs` — volitelný sync do DB (vyžaduje schválení)
