# AI orchestrace a plánovací pipeline – refaktor

## 1. Root cause

**Skutečné jádro problému:** Pipeline byla rozptýlená mezi `generatePlan.js` a `taskExecutors.js` bez jediného vstupního bodu; validátory byly uvnitř taskExecutors a nebylo jasné, kdo „řídí“ flow. Diagnostika (prompt_source, prompt_version, počet dokumentů, zda byly dokumenty použity) se nikde nesbírala do výsledku pro profil a debug. Agenti (trainer, nutrition_validator, training_validator) sice běželi, ale ne přes jednotný orchestrátor a bez standardizovaných payloadů pro kontext a dokumenty.

## 2. Nová architektura

**Agenti v systému:**

- **ORCHESTRATOR** (`lib/aiOrchestrator.js`) – řídí flow: jediný vstup `runPlanPipeline(params)`, volá `generatePlan`, v budoucnu může sestavovat kontext a předávat ho trainerovi. Exportuje `buildNormalizedContext` a `PIPELINE_PHASES`.

- **TRAINER** – generuje hlavní plán (jídelníček, trénink, suplementace, regenerace, mindset, nákupní seznam). Volá se přes `runAgent('trainer', { input: { prompt } })` uvnitř `generatePlan`. Kontext (včetně supporting_documents a shared_memory) mu dodává `buildAgentContext` v `runAgent`.

- **NUTRITION_VALIDATOR / TRAINING_VALIDATOR** – v `lib/planValidators.js` jako `runPlanValidators(planHtml, bm, userId)`. Kontrolují dietu, restrikce, strukturu tréninku. Vracejí `htmlToPublish`, `nutritionOk`, `trainingOk`, `validationWarning`, `nutritionErrors`, `trainingErrors`.

- **MEDIA_ENRICHMENT** – `enrichPlanContent({ html })` v `lib/enrichPlanContent.js`. Řeší obrázky a média pro jídla (Spoonacular, Pexels) a cviky (ExerciseDB, canonical registry, Pexels). Trust metadata: exact / illustrative / fallback / none.

- **COACH** – negeneruje plán; v `taskExecutors.executeCoachTask`. Navazuje na plán, adherence, stres, motivaci.

- **MEMORY / CONTEXT LAYER** – `buildAgentContext` (shared_memory, user_ai_memory, body_metrics, plans), `loadAgentDocumentsContext('trainer')` (supporting_documents z DB). Dokumenty se načítají server-side a předávají do contextu; žádný fake file search.

**Komunikace:** Kontext se sestavuje v `buildAgentContext` a v `buildNormalizedContext`. Trainer a validátoři dostávají vstup přes `runAgent(agentSlug, { userId, input: { plan_html, body_metrics, task_contract, task_type } })`. Výstup plánu je jednotný objekt z `generatePlan` / `runPlanPipeline` (html, metrics, enrichment, generation_source, truth_check, diagnostika).

## 3. Co se změnilo u trainera

- Trainer sám se nezměnil (stále stejný prompt a `runAgent('trainer', …)`).
- Na začátku `generatePlan` se načítají `getAgentConfig('trainer')` a `loadAgentDocumentsContext('trainer')`.
- Do návratu `generatePlan` se doplnily: `prompt_source`, `prompt_version`, `supporting_documents_count`, `document_titles`, `source_ids`, aby bylo zřejmé, která verze promptu běžela a kolik dokumentů dostal kontext (trainer je bere z contextu v `runAgent` → `buildAgentContext`).

## 4. Co se změnilo u validátorů

- **Vyčlenění:** `runPlanValidators` je v `lib/planValidators.js` a používá ho `taskExecutors`. Jedna sdílená implementace.
- **Strukturovaný výstup:** Kromě `nutritionOk`, `trainingOk`, `htmlToPublish`, `validationWarning` vrací i `nutritionErrors`, `trainingErrors`, `validatorReplacementApplied`, `validatorReplacementReason`.
- **HARD vs SOFT:** Rozlišení zatím není v JSON odpovědi validátorů (ok / errors). Hard fail = nepublikovatelné / diet conflict řeší `validatePlanTruth` a retry/fallback v `generatePlan`. Soft fail = repetice / slabá kvalita také `validatePlanTruth` (soft_gate_passed) a soft retry v `generatePlan`.

## 5. Co se změnilo v enrichmentu a médiích

- Enrichment a média se neměnily (exact = Spoonacular / ExerciseDB, illustrative/fallback = Pexels, none = placeholder).
- Strukturální řádky (total / warmup / cooldown / rest) v PlanViewer nemají velké media boxy (`showMediaBox = false`).
- Canonical map a české názvy pro cviky zůstávají v `exerciseCanonicalMap` a `exerciseEnrichment`.

## 6. Co se změnilo v dokumentech a contextu

- **Dokumenty:** Na začátku `generatePlan` se volá `loadAgentDocumentsContext('trainer')` a výsledek se vrací v diagnostice (`supporting_documents_count`, `document_titles`, `source_ids`). Samotný trainer dostává dokumenty v contextu přes `runAgent` → `buildAgentContext` → `loadAgentDocumentsContext`.
- **Kontext:** `buildNormalizedContext(bm, userId, taskContext)` v `aiOrchestrator.js` sestavuje supporting_documents, shared_memory, prompt_source, prompt_version pro budoucí rozšíření a diagnostiku.

## 7. Co se změnilo v profile/render flow

- **Profil API** vrací v `_diagnostics`: `prompt_source`, `prompt_version`, `supporting_documents_count`, `document_titles`, `source_ids` (z resultu initial_plan tasku).
- **Debug endpoint** `latest-plan-status` vrací `result_prompt_source`, `result_prompt_version`, `result_supporting_documents_count`, `result_document_titles`, `result_source_ids`.
- PlanViewer a zobrazení plánu se neměnily – profil dál bere aktivní plán z DB a pro média volá plan-enrichment.

## 8. Jak otestovat celý systém krok za krokem

1. **Registrace** – POST `/api/body-metrics` s e-mailem, výška, váha, cíl, frekvence, tréninkové dny. Ověř odpověď: `plan_state: 'ready'` nebo `'processing'`, po dokončení `initial_plan` task `status: 'completed'`.

2. **Profil** – GET `/api/profile` s Bearer tokenem. V `_diagnostics` zkontroluj: `generation_source`, `fallback_used`, `prompt_source`, `prompt_version`, `supporting_documents_count`, `document_titles`, `source_ids`, `raw_ai_html_length`, `final_html_length`, `truth_check_passed`, `soft_gate_passed`, `truth_retry_triggered`, `final_publish_source`, `media_exact_count`, `media_none_count`, `parse_success`, `rendering_mode`.

3. **Debug** – GET `/api/debug/latest-plan-status?email=…` s ADMIN_TOKEN. Ověř všechny `result_*` včetně `result_prompt_source`, `result_supporting_documents_count`, `result_document_titles`, `result_source_ids`.

4. **PlanViewer** – Přihlásit se, otevřít profil. Ověř, že je vidět 7denní jídelníček a trénink po dnech; u cviků buď obrázky/GIF (exact/fallback), nebo text „Bez ověřeného média“; u rozcvičky/závěru/odpočinku žádný velký media box.

5. **Build** – `npm run build` musí projít.

## 9. Je to safe pustit na main?

**Ano.** Změny jsou zpětně kompatibilní: výstup `runPlanPipeline` má stejný tvar jako dříve `generatePlan`. Jediný vstupní bod pro generování plánu v taskExecutors je teď `runPlanPipeline` z aiOrchestratoru. Validátory jsou vyčleněné do `planValidators.js`, ale chování zůstává. Přidaná diagnostika (prompt_source, prompt_version, dokumenty) jen rozšiřuje odpověď a neexponuje citlivá data. Žádné odstranění fallbacků ani změna truth/media pravidel.
