# Refaktor: Jediná kanonická větev generování plánů

## 1. Root problémy (před refaktorem)

| # | Problém | Dopad |
|---|---------|-------|
| 1 | **Dvě paralelní větve** – `generatePlan` (HTML-first) vs `generateStructuredPlan` (JSON) | Duplicita, nekonzistence, různé zdroje pravdy |
| 2 | **OpenAI generoval finální HTML** – vymyšlené recepty a cviky | Nespolehlivost, nedůvěryhodnost dat |
| 3 | **Legacy flow obcházel orchestrátor** – `generatePlanForEmail` volal přímo `runAssistantWithPrompt` | Žádné Spoonacular/wger, žádné strukturované validace |
| 4 | **Validátory na HTML** – `runPlanValidators` parsoval HTML, ne JSON | Křehké, těžko rozšiřitelné |
| 5 | **Různé vstupní body** – body-metrics, profile-preferences, generate-plan-next-week, assistant-intake, send-plan-again – každý jinak | Žádná jednotná pipeline |
| 6 | **Chybějící structured_plan_json** – DB pouze `plan_html` | Nelze renderovat z JSON, nelze regenerovat části |

## 2. Finální cílové flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    JEDINÝ ORCHESTRÁTOR: runUnifiedPlanPipeline              │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. body_metrics → bodyMetricsToPlanInput() → planInput                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. generateStructuredPlan(planInput)                                        │
│    - OpenAI: pouze JSON (search queries, targets, workout_days)            │
│    - Spoonacular: resolve meals                                             │
│    - wger: resolve exercises                                                 │
│    - fallback: deterministic meal/workout plan                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. validateStructuredPlan(planJson, bm)                                     │
│    - diet_type, foods_to_avoid, calories/protein rozsahy                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. renderPlanHtmlFromStructured(planJson, bm) → planHtml                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 5. Persist: ai_generated_plans (plan_html + structured_plan_json)           │
│ 6. Email: sendPlanEmail(email, planHtml, opts)                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Vstupní body → všechny vedou do runUnifiedPlanPipeline

| Endpoint / Job | Jak volá |
|----------------|----------|
| **body-metrics** (registrace) | createInitialAITasks → executeAITask → executeTrainerTask → **runUnifiedPlanPipeline** |
| **profile-preferences** | generatePlanForEmail → **generatePlanForEmailViaUnified** |
| **generate-plan-next-week** | generatePlanForEmail → **generatePlanForEmailViaUnified** |
| **assistant-intake** | generatePlanAndSendFromParams → generatePlanForEmail → **generatePlanForEmailViaUnified** |
| **send-plan-again** | Čte plan_html z DB, ne generuje |
| **generate-plan** (API) | **runUnifiedPlanPipeline** |
| **onboarding/generate-plan** | generateStructuredPlan (už existuje, vrací JSON, ne persistuje) |

## 3. Seznam změněných souborů

### Nové soubory

| Soubor | Účel |
|--------|------|
| `lib/planRenderer.js` | `renderPlanHtmlFromStructured(planJson, bm)` – HTML z JSON |
| `lib/unifiedPlanPipeline.js` | `runUnifiedPlanPipeline`, `persistPlanFromUnified`, `generatePlanForEmailViaUnified` |
| `lib/bodyMetricsToPlanInput.js` | Mapování body_metrics → planOrchestrator input |
| `lib/validation/structuredPlanValidators.js` | `validateStructuredPlan(planJson, bm)` |
| `supabase/migrations/20260328_ai_generated_plans_structured_json.sql` | Sloupec `structured_plan_json` |
| `docs/REFACTOR_UNIFIED_PLAN_PIPELINE.md` | Tento dokument |

### Upravené soubory

| Soubor | Změny |
|--------|-------|
| `lib/aiOrchestrator.js` | `runPlanPipeline` → thin wrapper nad `runUnifiedPlanPipeline` |
| `lib/taskExecutors.js` | `executeTrainerTask` používá `runUnifiedPlanPipeline`, persist `structured_plan_json` |
| `lib/generatePlan.js` | `generatePlanForEmail` → thin wrapper nad `generatePlanForEmailViaUnified` |
| `lib/services/planOrchestrator.js` | Přidán `validFrom`, `validUntil` override |
| `pages/api/generate-plan.js` | Používá `runUnifiedPlanPipeline` místo `generatePlan` |

### Beze změny (ale závisí na novém flow)

| Soubor | Poznámka |
|--------|----------|
| `pages/api/body-metrics.js` | Volá executeAITask – automaticky nová větev |
| `pages/api/profile-preferences.js` | Volá generatePlanForEmail – automaticky nová větev |
| `pages/api/generate-plan-next-week.js` | Volá generatePlanForEmail – automaticky nová větev |
| `pages/api/assistant-intake.js` | Volá generatePlanAndSendFromParams – automaticky nová větev |
| `pages/api/send-plan-again.js` | Čte plan_html z DB – beze změny |
| `lib/mail.js` | `sendPlanEmail` bere planHtml – beze změny |

## 4. Migrační poznámky

### 4.1. Spuštění migrace

```bash
# V Supabase SQL Editor nebo přes CLI
supabase db push
# nebo ručně spustit:
# supabase/migrations/20260328_ai_generated_plans_structured_json.sql
```

### 4.2. Zpětná kompatibilita

- **Plan_html** – stále se ukládá a používá pro profil, e-mail, PlanViewer.
- **Structured_plan_json** – nový sloupec; při absenci migrace se insert provede bez něj (fallback v kódu).
- **Staré plány** – zůstávají s `plan_html`; `structured_plan_json` je null. Profil a e-mail fungují dál.

### 4.3. Odstraněné / deprecated

- **Legacy generatePlanForEmail** – nahrazena thin wrapperem; vlastní logika je v `generatePlanForEmailViaUnified`.
- **runPlanPipeline** – deprecated; deleguje na `runUnifiedPlanPipeline`.
- **runPlanValidators** – již se nevolá z `executeTrainerTask`; strukturovaná validace je v `validateStructuredPlan`.

### 4.4. mealsOnly

- `mealsOnly: true` v `generatePlanForEmail` se předává do pipeline, ale **planOrchestrator zatím plně nepodporuje** – vždy se generuje celý plán.
- TODO: Rozšířit `generateStructuredPlan` o `mealsOnly` mode (např. zachovat workout z předchozího plánu).

## 5. Rizika a co otestovat

### Rizika

| Riziko | Mitigace |
|--------|----------|
| Spoonacular/wger API limit | Fallback na deterministic; logování |
| OpenAI timeout | Fallback v planOrchestrator; last-resort `buildDeterministicFallbackPlanHtml` v body-metrics |
| Migrace neexistuje | Insert fallback bez `structured_plan_json` |

## 3. Režim výstupu (nutrition_only / nutrition_training)

- **Generování** (`runUnifiedPlanPipeline` → `generateStructuredPlan`) vždy produkuje strukturovaný plán včetně **meal_plan** a **workout_plan** dle `workouts_per_week` a profilu. Odstranění legacy `runAgent('trainer')` nesmí ořezat tréninková data v JSON.
- **Zobrazení** řídí `lib/planOutputMode.js`: `nutrition_only` skrývá trénink v profilu (`PlanViewer`) a v těle plánovacího e-mailu / digestu; `nutrition_training` je může zobrazit. Obrázky jídel a GIFy v e-mailu zůstávají vypnuté (strip médií).
- Konfigurace: `PLAN_OUTPUT_MODE` a/nebo `NEXT_PUBLIC_PLAN_OUTPUT_MODE` (výchozí `nutrition_only`). Volitelně budoucí sloupec `output_mode` u řádku plánu.
- **Coach memory** zůstává krátký souhrn v `PROFIL_JSON`; nesmí přebít alergie, makra a tvrdé dietary constraints.

### Co otestovat

1. **Registrace** – body-metrics → plán → e-mail.
2. **Změna preferencí** – profile-preferences → přegenerování → e-mail.
3. **Generate next week** – generate-plan-next-week → nový plán.
4. **Assistant intake** – formulář → plán → e-mail.
5. **Send plan again** – znovu odeslání plánu z DB.
6. **Profil** – zobrazení plánu (plan_html).
7. **API generate-plan** – POST s body_metrics → html + metrics.
8. **Onboarding generate-plan** – POST s body_metrics → JSON (beze změny).
