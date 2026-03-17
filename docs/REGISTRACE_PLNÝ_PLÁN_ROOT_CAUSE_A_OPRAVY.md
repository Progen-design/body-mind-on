# Registrace → plný plán: root cause, opravy a ověření

Dokument shrnuje end-to-end kontrolu registračního flow, stav logiky agentů, validace, persist, profil a UI. Cíl: **po registraci vždy vznikne plný 7denní jídelníček a 7denní tréninkový plán** a profil správně ukazuje ready / processing / failed / invalid / missing.

---

## 1. Root cause

Kde se flow rozbíjelo a proč:

1. **Stav profilu (plan_state)**  
   - Při existujícím tasku `trainer / initial_plan` se mohl vrátit **missing** („Plán zatím nebyl vytvořen“), protože se neřešilo: existuje task, ale ještě není completed, nebo query na task selhala.  
   - Status **dlq** nebyl explicitně považován za failed.  
   - Při selhání dotazu na `ai_tasks` se vracel misleading stav místo „processing“.

2. **Rozlišení invalid vs failed vs missing**  
   - Chybělo jasné pravidlo: task completed bez validního plánu = **invalid**, task failed/dlq = **failed**, žádný task ani plán = **missing**.  
   - Frontend nezobrazoval odlišné zprávy pro invalid a failed.

3. **Validace délky plánu**  
   - Minimální délka HTML nebyla vynucována – mohly projít příliš krátké / generické plány.

4. **Diagnostika**  
   - Chyběly konzistentní signály (initialPlanTaskExists, plan_state_reason, saved_plan_id, truth_retry_*, atd.), takže nebylo zřejmé, zda problém vznikl v AI, validaci, persist nebo renderu.

**Ne** jako root cause:  
- Vytváření tasků po registraci (trainer + coach) funguje.  
- Scheduler a direct execute fallback se spouštějí.  
- Orchestrator volá generatePlan a taskExecutors; persist zapisuje do `ai_generated_plans`.  
- PlanViewer neodstraňuje části plánu – parser doplňuje chybějící dny do 7 a zobrazuje raw fallback při nevalidním HTML.

---

## 2. Co bylo špatně v generování po registraci

Konkrétně:

- **Profil vracel „missing“ i při běžícím tasku**  
  Pokud existoval `trainer / initial_plan` (pending/processing), měl být stav **processing**, ne missing. Uživatel tak viděl „Plán zatím nebyl vytvořen“ místo „Plán se dokončuje…“.

- **dlq nebyl považován za konečný neúspěch**  
  Task ve frontě mrtvých měl vést na **failed** a zprávu typu „Plán se nepodařilo dokončit.“

- **Task completed bez validního plánu**  
  Když validace (validatePublishedPlanHtml) po vygenerování neprošla, task mohl skončit jako completed bez zápisu do DB, nebo se uložil nevalidní plán. Pravidlo muselo být: completed bez validního plánu = **invalid** a odlišná zpráva („Plán byl vytvořen neúplně nebo neprošel validací.“).

- **Minimální délka plánu**  
  Bez vynucení minimální délky (např. 3500 znaků) mohly projít příliš krátké výstupy.

- **Jednoznačná zpráva při selhání query na task**  
  Při výpadku DB dotazu na `ai_tasks` se neměl vracet missing; bez dalších dat je rozumné vrátit **processing** („Plán se dokončuje…“), aby uživatel neviděl zavádějící „Plán zatím nebyl vytvořen“.

---

## 3. Co bylo změněno

### body-metrics (`pages/api/body-metrics.js`)

- Beze změny. Po uložení `body_metrics` volá `createInitialAITasks`, `enqueueAIEvent`, `triggerImmediateDecision` a při možnosti `runPlanGeneration` (direct execute + scheduler). Tasky `trainer / initial_plan` a `coach / onboarding_message` vznikají s idempotency.

### AI task flow (`lib/createInitialAITasks.js`, `lib/aiScheduler.js`)

- Beze změny. Vznikají oba tasky; scheduler a direct execute spouštějí pipeline.

### Orchestrator (`lib/aiOrchestrator.js`)

- Beze změny. `runPlanPipeline` volá `generatePlan` a v taskExecutors se volá `runPlanPipeline` → validace → výběr `chosenHtml` → `persistTrainerPlan` jen při `finalValid.ok`.

### generatePlan (`lib/generatePlan.js`)

- Beze změny. Obsahuje: buildUserPrompt se všemi vstupy (včetně workout_days), runAssistantWithPrompt → runAgent('trainer'), validace HTML, truth check (hard/soft), retry a deterministic fallback. Trainer dostává kontext včetně `supporting_documents` přes `buildAgentContext`.

### Validators (`lib/validatePlanHtml.js`, `lib/validatePlanTruth.js`, `lib/planValidators.js`)

- **validatePlanHtml**: zavedeno **MIN_PLAN_HTML_LENGTH = 3500** – plán kratší než 3500 znaků neprojde (reason např. `plan_too_short`).  
- **validatePlanTruth**: hard gate (nepublikovatelné jídlo/cvik) a soft gate (repetice, slabé sekce) – používají se v generatePlan pro retry a fallback.  
- **planValidators**: nutrition_validator a training_validator mohou vrátit opravené HTML; v taskExecutors se vybírá mezi generated a validator HTML podle pravidel (validator_corrected vs generated).

### Persist

- Beze změny. `persistTrainerPlan` se volá pouze když `validatePublishedPlanHtml(chosenHtml).ok === true`. Při nevalidním výstupu se task označí jako failed a plán se neukládá.

### Profile API (`pages/api/profile.js`)

- **plan_state** – přepočet v tomto pořadí:  
  1. `hasValidPlan` → **ready**  
  2. `initialPlanTaskQueryFailed` a žádné plány → **processing** (ne missing)  
  3. `initialPlanPending` → **processing**  
  4. `initialPlanFailed` (včetně **dlq**) → **failed**  
  5. `initialPlanCompleted` a ne `hasValidPlan` → **invalid**  
  6. Další existující task bez validního plánu → **invalid**  
  7. Jinak → **missing** (žádný task ani plán)

- **Diagnostika**: doplněno do `_diagnostics`:  
  `initialPlanTaskExists`, `initialPlanTaskStatus`, `initialPlanTaskCreatedAt`, `initialPlanTaskProcessedAt`, `initialPlanTaskLastError`, `initialPlanTaskQueryFailed`, `plan_state`, `plan_state_reason`, `saved_plan_exists`, `saved_plan_id`, `saved_plan_is_active`, `rendered_plan_exists`, `generation_source`, `truth_check_passed`, `soft_gate_passed`, `truth_retry_*`, `raw_ai_html_length`, `final_html_length`, `media_exact_count`, `media_none_count`, `parse_success`, `rendering_mode`, atd.

### Frontend profil (`pages/profil.js`)

- Oddělené zprávy podle `plan_state`:  
  - **failed** → „Plán se nepodařilo dokončit.“  
  - **invalid** → „Plán byl vytvořen neúplně nebo neprošel validací.“  
  - **missing** → „Plán zatím nebyl vytvořen.“  
  - **processing** → „Plán se dokončuje…“ (s doporučením neodcházet)

### PlanViewer (`components/PlanViewer.js`)

- Beze změny. Parsování přes `parsePlanHtml(plan.plan_html)`; pokud je méně než 7 dnů, doplní se placeholder dny; při nevalidním/neúplném HTML je k dispozici raw fallback. Žádné odstraňování sekcí podle ověření.

### Enrichment (`lib/enrichPlanContent.js`)

- Beze změny. Pravidla exact / illustrative / none pro jídla a cviky; strukturní položky (total, warmup, cooldown, rest) nemají velké media boxy dle stávající logiky.

### Supporting documents

- Beze změny. `loadAgentDocumentsContext('trainer')` načítá z `ai_supporting_documents`; `buildAgentContext` je volá a předává do kontextu agenta; v `runAgent` jde kontext (včetně `supporting_documents`) do user message. Žádný falešný file search – dokumenty jsou načteny server-side a předány jako text.

---

## 4. Proč teď po registraci vznikne plný plán

- **Tasky**: Po registraci se vždy vytvoří `trainer / initial_plan` (a `coach / onboarding_message`). Scheduler nebo direct execute spustí pipeline.

- **Generování**: Trainer dostává kompletní vstup (body_metrics, goal, weekly_sessions, diet_type, preferences, workout_days, supporting_documents, shared_memory) přes buildUserPrompt a buildAgentContext. System prompt (TRAINER_SYSTEM_PROMPT) vynucuje 7 dní, 21 jídel, „Trénink tento den“ u každého dne, konkrétní sekce a publish-safe pravidla.

- **Validace**:  
  - HTML: core sekce (Jídelníček, Trénink), 7 dní, Snídaně/Oběd/Večeře, „Trénink tento den“, délka ≥ 3500.  
  - Truth: publish-safe jídla/cviky (hard), repetice/slabé sekce (soft).  
  Při hard fail retry, při soft fail 1 retry s důvodem, poté deterministic fallback. Do DB jde jen výstup prošlý validací.

- **Persist**: Uloží se pouze `chosenHtml`, který projde `validatePublishedPlanHtml`. Task se při nevalidním výstupu označí jako failed a plán se neukládá.

- **Profil**: Stav (ready/processing/failed/invalid/missing) odpovídá realitě; při existujícím tasku se nevrací missing; dlq = failed; při selhání query na task = processing.

- **UI**: Podle plan_state uživatel vidí správnou zprávu; při ready se zobrazí uložený plán (PlanViewer z `plan.plan_html`), bez degradace mezi AI výstupem a tím, co je uloženo a zobrazeno.

---

## 5. Jak to otestovat krok za krokem

1. **Registrace nového uživatele**  
   - Vyplnění registrace (včetně goal, weekly_sessions, diet_type, preferences, workout_days).  
   - Ověřit v DB: záznam v `body_metrics`, dva záznamy v `ai_tasks` (trainer/initial_plan, coach/onboarding_message).

2. **Stav během generování**  
   - Okamžitě po registraci otevřít profil.  
   - Očekávat: `plan_state === 'processing'`, zpráva „Plán se dokončuje…“.  
   - V `_diagnostics`: `initialPlanTaskExists === true`, `initialPlanTaskStatus === 'pending'` nebo `'processing'`.

3. **Po dokončení (úspěch)**  
   - Po dokončení tasku (status completed) a zápisu plánu:  
   - `plan_state === 'ready'`, zobrazení plánu s 7 dny, 3 jídly denně, blokem „Trénink tento den“ u každého dne.  
   - V `_diagnostics`: `saved_plan_exists === true`, `has_valid_plan === true`, `current_plan_html_length >= 3500`.

4. **Selhání tasku**  
   - Simulovat failed (nebo dlq) – např. vyřadit API klíč / přerušit běh.  
   - Očekávat: `plan_state === 'failed'`, zpráva „Plán se nepodařilo dokončit.“

5. **Completed bez validního plánu**  
   - Např. ručně nastavit task na completed s prázdným nebo nevalidním result (bez zápisu plánu).  
   - Očekávat: `plan_state === 'invalid'`, zpráva „Plán byl vytvořen neúplně nebo neprošel validací.“

6. **Debug endpoint**  
   - `GET /api/debug/latest-plan-status` (s auth) – ověřit `initialPlanTaskExists`, `trainer_task.result`, `saved_plan_*`, `debug_plan_state`, `debug_plan_state_reason`.

7. **Build**  
   - `npm run build` – musí projít bez chyb.

---

## 6. Je to safe pustit na main?

**Ano.**

- Změny jsou omezené na:  
  - logiku `plan_state` a důvody v profile API (bez změny API kontraktu pro klienta),  
  - rozšíření `_diagnostics` (opt-in pro debugging),  
  - minimální délku plánu v validatePlanHtml (3500),  
  - texty zpráv na frontendu podle plan_state.

- Žádné odstranění bezpečnostních kontrol, žádná expozice citlivých dat.  
- Persist se nevolá při nevalidním plánu; task se při chybě označí jako failed.  
- Direct execute a scheduler zůstávají stejné; trainer a validátory již dříve vynucovaly strukturu plánu – nyní je doplněna délka a konzistentní stavy v profilu.

Doporučení: po nasazení sledovat `plan_state` a `plan_state_reason` v reálných registracích (např. přes _diagnostics nebo logy) a případně upravit prahy (např. MIN_PLAN_HTML_LENGTH) podle reálných dat.
