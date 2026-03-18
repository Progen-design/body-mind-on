# Release Audit: Unified Plan Pipeline

**Datum:** 2026-03-10  
**Cíl:** Ověřit, že existuje pouze jedna aktivní větev generování plánu a všechny vstupy vedou přes unified pipeline.

---

## A. Entry Points

| Endpoint / Job | Flow | Vedou do unified pipeline? |
|----------------|------|----------------------------|
| **body-metrics** (registrace) | createInitialAITasks → executeAITask → executeTrainerTask → **runUnifiedPlanPipeline** | ✅ ANO |
| **profile-preferences** | generatePlanForEmail → **generatePlanForEmailViaUnified** | ✅ ANO |
| **generate-plan-next-week** | generatePlanForEmail → **generatePlanForEmailViaUnified** | ✅ ANO |
| **assistant-intake** | generatePlanAndSendFromParams → generatePlanForEmail → **generatePlanForEmailViaUnified** | ✅ ANO |
| **generate-plan** (API) | **runUnifiedPlanPipeline** přímo | ✅ ANO |
| **send-plan-again** | Čte plan_html z DB, ne generuje | N/A (jen čte) |
| **onboarding/generate-plan** | generateStructuredPlan přímo (OpenAI → Spoonacular → wger) | ⚠️ PARALELNÍ – preview-only, ne persistuje |
| **body-metrics last-resort** | persistPublishableFallbackPlanForUser → buildDeterministicFallbackPlanHtml | N/A (fallback při selhání AI) |

---

## B. Wrapper Audit

| Funkce | Typ | Stav |
|--------|-----|------|
| **generatePlanForEmail** | Thin wrapper | ✅ OK – deleguje na generatePlanForEmailViaUnified |
| **generatePlanAndSendFromParams** | Thin wrapper | ✅ OK – volá generatePlanForEmail |
| **runPlanPipeline** | Thin wrapper | ✅ OK – deleguje na runUnifiedPlanPipeline |
| **generatePlan** | Thin wrapper | ✅ OK – deleguje na runUnifiedPlanPipeline (opraveno v rámci auditu) |

**generatePlan** – obsahuje vlastní logiku:
- `runAssistantWithPrompt` → `runAgent('trainer')`
- Vrací HTML z AI (ne structured JSON)
- Bez Spoonacular, bez wger
- `validatePublishedPlanHtml`, `validatePlanTruth`, `enrichPlanContent`
- **Není volána** z žádného aktivního kódu (generate-plan.js používá runUnifiedPlanPipeline)
- **Exportována** – riziko při budoucím importu

---

## C. Data Flow Audit

| Komponenta | Stav | Detaily |
|------------|------|---------|
| **OpenAI** | ✅ OK | planOrchestrator: `response_format: { type: 'json_object' }`, prompt: „NEVYMÝŠLEJ recepty ani cviky – pouze vyhledávací dotazy“ |
| **Spoonacular** | ✅ OK | planOrchestrator.resolveMeals() → searchRecipe() pro každé meal |
| **wger** | ✅ OK | planOrchestrator.resolveWorkouts() → resolveExercise() (exerciseProviderRegistry → wgerService) |
| **Validators** | ✅ OK | validateStructuredPlan(planJson, bm) – JSON-level, diet_type, foods_to_avoid |
| **Renderer** | ✅ OK | renderPlanHtmlFromStructured(planJson, bm) → plan_html |
| **Persistence** | ✅ OK | persistTrainerPlan, persistPlanFromUnified – ukládají plan_html + structured_plan_json |

**runPlanValidators** (HTML validators) – již se nevolá z executeTrainerTask. Zůstává v lib/planValidators.js jako dead code.

---

## D. PASS / RISK / FAIL

| Soubor | Verdict | Poznámka |
|--------|---------|----------|
| **lib/unifiedPlanPipeline.js** | PASS | Jediný orchestrátor |
| **lib/services/planOrchestrator.js** | PASS | OpenAI JSON → Spoonacular → wger |
| **lib/planRenderer.js** | PASS | HTML z JSON |
| **lib/validation/structuredPlanValidators.js** | PASS | JSON validace |
| **lib/taskExecutors.js** | PASS | executeTrainerTask → runUnifiedPlanPipeline, persist structured_plan_json |
| **lib/aiOrchestrator.js** | PASS | runPlanPipeline = thin wrapper |
| **lib/generatePlan.js** | PASS | generatePlan() = thin wrapper nad runUnifiedPlanPipeline |
| **pages/api/generate-plan.js** | PASS | runUnifiedPlanPipeline |
| **pages/api/generate-plan-next-week.js** | PASS | generatePlanForEmail → unified |
| **pages/api/profile-preferences.js** | PASS | generatePlanForEmail → unified |
| **pages/api/assistant-intake.js** | PASS | generatePlanAndSendFromParams → unified |
| **pages/api/onboarding/generate-plan.js** | RISK | Volá generateStructuredPlan přímo – ne přes runUnifiedPlanPipeline. Preview-only, ne persistuje. Stejný data flow (Spoonacular, wger). |
| **lib/planValidators.js** | RISK | runPlanValidators – dead code, nevolá se. Může být odstraněn nebo ponechán pro budoucí použití. |
| **lib/taskExecutors.js** (persistPublishableFallbackPlanForUser) | PASS | Last-resort fallback – HTML-only, bez structured_plan_json. Akceptovatelné. |

---

## E. Release Verdict

### HOTOVO

**Stav:** Všechny kritické vstupy vedou přes unified pipeline. `generatePlan` byl převeden na thin wrapper.

---

## Provedené opravy (v rámci auditu)

### 1. generatePlan – převeden na thin wrapper ✅

| Položka | Hodnota |
|---------|---------|
| **Soubor** | lib/generatePlan.js |
| **Funkce** | generatePlan(params) |
| **Provedeno** | Thin wrapper nad runUnifiedPlanPipeline. Vrací { html, metrics, enrichment } pro zpětnou kompatibilitu. |

### 2. onboarding/generate-plan – paralelní vstup

| Položka | Hodnota |
|---------|---------|
| **Soubor** | pages/api/onboarding/generate-plan.js |
| **Funkce** | handler |
| **Problém** | Volá generateStructuredPlan přímo, ne přes runUnifiedPlanPipeline. |
| **Dopad** | Nízký – používá stejný planOrchestrator (Spoonacular, wger). Preview-only, ne persistuje. |
| **Oprava** | Volitelné: přepojit na runUnifiedPlanPipeline pro konzistenci. Nebo ponechat s dokumentem, že jde o preview endpoint. |

### 3. runPlanValidators – dead code

| Položka | Hodnota |
|---------|---------|
| **Soubor** | lib/planValidators.js |
| **Funkce** | runPlanValidators |
| **Problém** | HTML validators nevolané z executeTrainerTask. |
| **Dopad** | Žádný – dead code. |
| **Oprava** | Odstranit nebo označit @deprecated. |

---

## Doporučené kroky (volitelné)

1. ~~Převést generatePlan na thin wrapper~~ – **HOTOVO**
2. **Volitelné:** Přepojit onboarding/generate-plan na runUnifiedPlanPipeline.
3. **Volitelné:** Označit nebo odstranit runPlanValidators.
