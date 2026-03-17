# Runtime opravy plánového flow – root cause, změny, výstup

Tvrdá runtime analýza a opravy: proč po registraci někdy nevznikl nebo se nezobrazil plný plán a co bylo změněno.

---

## 1. Skutečný runtime root cause

- **Completed bez persisted plánu**  
  Task mohl být označen jako `completed` i když insert do `ai_generated_plans` nevrátil `id` (např. RLS, trigger, nebo chybějící sloupec). Scheduler i body-metrics direct path nastavily `status: 'completed'` podle `execution?.ok` bez ověření, že `result.plan_id` existuje. Následek: profil nemá žádný platný plán, ale task je completed → uživatel vidí „plán není“ i když systém říká „hotovo“.

- **Žádný guard po persist**  
  `persistTrainerPlan` po úspěšném `insert` vrací `plan_id: data?.id ?? null`. Když `data` bylo `null` (select nevrátil řádek), nikdo neházel chybu a executor vrátil `ok: true` s `plan_id: null`. Následek: completed bez reálného uložení plánu.

- **Stav „invalid“ bez nápravy**  
  Když už byl task completed a platný plán v DB chyběl, profile API vracel `plan_state: 'invalid'`. Task v DB zůstal `completed`, takže každý další request znovu vracel invalid bez možnosti automatické opravy.

---

## 2. Kde se flow mohlo v praxi rozpadnout

| Místo | Co se mohlo stát |
|-------|-------------------|
| **Task creation** | OK – createInitialAITasks vytváří tasky; idempotency je v pořádku. |
| **Scheduler** | Po `executeAITask` se bez kontroly nastavilo `completed`; při `plan_id === null` zůstal task completed. |
| **Direct execute (body-metrics)** | Stejné – update na completed bez kontroly `plan_id`. |
| **persistTrainerPlan** | Insert mohl proběhnout, ale `.select('id').maybeSingle()` vrátit `data: null` (RLS/trigger) → vráceno `plan_id: null` bez throw. |
| **executeTrainerTask** | Vrátil `ok: true` i když `sideEffect.plan_id` byl null. |
| **Profile state** | Pravidla ready/processing/failed/invalid/missing byla nastavená správně, ale při „completed bez plánu“ vracel invalid bez opravy tasku. |
| **Render** | OK – PlanViewer zobrazuje to, co přijde z API; problém byl v datech (chybějící plán), ne v renderu. |

---

## 3. Co bylo změněno

### lib/taskExecutors.js

- **persistTrainerPlan**  
  Po insertu pro `initial_plan`: pokud `data?.id` je null/undefined, **throw** s hláškou „Plan insert did not return id – cannot complete initial_plan task“. Tím se nikdy nevrátí „úspěch“ bez reálného id záznamu.

- **executeTrainerTask**  
  Po `persistTrainerPlan`: pokud `task_type === 'initial_plan'` a `sideEffect.plan_id` je null/undefined, **throw** s textem „Initial plan task cannot complete without persisted plan_id“. Dvojitá ochrana proti completed bez plan_id.

- **Výsledek trainera**  
  Do `result` přidán explicitně `saved_plan_id: sideEffect.plan_id`, aby diagnostika a guardy měly vždy jasný zdroj.

### lib/aiScheduler.js

- **Guard před nastavením completed**  
  Pro `trainer` + `initial_plan`: pokud `execution?.ok` ale `result.outcome_type === 'plan_generated'` a `result.plan_id` chybí, task se **nastaví na `failed`** (ne completed), s `last_error: 'Completed without plan_id'` a rozšířeným `result` (outcome_type plan_generation_failed, error message).

- **Konzistentní finalStatus / finalResult**  
  Pro zápis do DB a pro `writeAILog` se používají `finalStatus` a `finalResult` odvozené z tohoto guardu.

### pages/api/body-metrics.js

- **last_error: null**  
  Při každém update tasku po direct/fallback execute se nastavuje `last_error: null`, aby diagnostika nebyla zkreslená starou chybou.

- **Guard pro completed**  
  Před nastavením `status: 'completed'` se ověřuje `effectiveOk`: pro `outcome_type === 'plan_generated'` musí být `plan_id` vyplněný. Jinak se task označí jako `failed`. Platí pro všechny tři cesty (první direct, fallback po scheduleru, fallback po chybě scheduleru).

### pages/api/profile.js

- **Select ai_tasks**  
  Do selectu přidán sloupec `attempts` pro diagnostiku.

- **Diagnostika**  
  Do `_diagnostics` přidáno: `initialPlanTaskAttemptCount` (z `initialPlanTask.attempts`), `self_heal_applied` (viz níže).

- **Self-healing**  
  Když je `plan_state === 'invalid'` a `plan_state_reason === 'task_completed_but_no_valid_plan'` a existuje `initialPlanTask.id`, profile API **jednou** updatuje daný task na `status: 'failed'`, s `result.self_heal_reason: 'completed_without_valid_plan'` a `last_error: 'Self-healed: completed without valid plan'`. Následně se v téže odpovědi nastaví `plan_state = 'failed'` a `plan_state_reason = 'task_completed_but_no_valid_plan_self_healed'`. Uživatel tak hned dostane stav „failed“ a další requesty už neuvidí invalid bez opravy.

---

## 4. Nový persist contract

- **completed** se smí nastavit jen když:
  - `chosenHtml` prošlo `validatePublishedPlanHtml` (v taskExecutors před persist),
  - persist byl zavolán a nehodil výjimku,
  - pro `initial_plan`: persist vrátil `plan_id` (ne null/undefined) – jinak `persistTrainerPlan` nebo `executeTrainerTask` hodí a task skončí jako **failed**,
  - scheduler/body-metrics navíc kontrolují `result.plan_id` a při jeho absenci nastaví **failed** místo completed.

- **failed** nastane když:
  - executor hodí (včetně „no plan_id“),
  - nebo executor vrátí `ok: true` ale bez `plan_id` u trainer/initial_plan (guard ve scheduleru a v body-metrics).

- **invalid** v profilu znamená „task completed, ale validní plán v DB není“. Po zavedení guardů by k tomu nemělo docházet u nových běhů; u starých dat to profile API při první příležitosti opraví self-healem na **failed**.

---

## 5. Proč už profil nebude lhát o stavu plánu

- **missing** se vrací jen když neexistuje task ani plán. Pokud existuje `trainer / initial_plan` task (jakýkoli status), profile nikdy nevrací missing (pořadí podmínek: ready → query failed → pending/processing → failed/dlq → plány existují ale nevalidní → completed bez validního plánu → task existuje jinak → missing).

- **completed bez plánu**: guardy v executoru, persist a scheduleru zaručují, že nový task nebude označen jako completed bez `plan_id`. Pokud by takový stav už v DB byl, self-heal v profile API při prvním načtení profilu task přepne na failed a odpověď vrátí `plan_state: 'failed'`, takže klient nevidí „invalid“ navěky.

- **Diagnostika** (`_diagnostics`) obsahuje: initialPlanTaskExists, Status, CreatedAt, ProcessedAt, LastError, AttemptCount, plan_state, plan_state_reason, generation_source, final_publish_source, truth_check_passed, soft_gate_passed, truth_retry_*, raw/final_html_length, saved_plan_exists, saved_plan_id, rendered_plan_exists, ai_output_was_used, retry_output_was_used, fallback_output_was_used, self_heal_applied. Z jedné odpovědi je možné rozlišit, zda problém byl v AI, validaci, persistu nebo v dřívějším stavu tasku.

---

## 6. Jak to ověřit krok za krokem

1. **Registrace**  
   Nový uživatel, vyplnění a odeslání. V DB ověřit: `body_metrics` záznam, `ai_tasks` s `trainer` / `initial_plan` (a coach onboarding).

2. **Úspěšný běh**  
   Po dokončení: task `completed`, `result.plan_id` vyplněný, v `ai_generated_plans` řádek s tímto id. Profil: `plan_state === 'ready'`, `_diagnostics.saved_plan_exists === true`, `saved_plan_id` odpovídá uloženému plánu.

3. **Simulace selhání persist**  
   Např. dočasně v persist po insertu nastavit `data = null`. Očekávání: executor hodí, task skončí jako **failed**, žádný completed bez plan_id. V profile pak `plan_state === 'failed'`.

4. **Self-heal**  
   Ručně v DB: task `trainer/initial_plan` na `completed`, `result` bez plan_id nebo s plan_id neexistujícího plánu, a smazat/nechat chybějící plán. Načíst profil: první odpověď může být ještě invalid, ale profile provede self-heal a v téže nebo další odpovědi už `plan_state === 'failed'`, task v DB má `status: 'failed'`, `_diagnostics.self_heal_applied === true` (pokud byl heal proveden).

5. **Frontend**  
   Po registraci při `plan_state === 'processing'` useProfileData polluje (interval 3 s); po přechodu na ready/failed se polling zastaví. Zprávy: failed = „Plán se nepodařilo dokončit.“, invalid = „Plán byl vytvořen neúplně nebo neprošel validací.“, missing jen když skutečně chybí task i plán.

6. **Build**  
   `npm run build` musí projít (ověřeno).

---

## 7. Je to safe pustit na main?

**Ano.**

- Změny pouze zpřísňují podmínky pro completed a přidávají ochranu proti „completed bez plánu“. Žádné uvolnění bezpečnosti nebo odstranění validací.
- Persist a executor při chybě nebo chybějícím plan_id hodí → task končí jako failed, plán se neukládá nevalidní.
- Self-heal v profile pouze přepisuje již nekonzistentní task (completed bez validního plánu) na failed; ne mění úspěšné plány ani nezasahuje do jiných tabulek.
- Body-metrics a scheduler nemění pořadí kroků ani timeouty; pouze přidávají kontrolu `plan_id` před nastavením completed.
- Build prošel, lint je v pořádku. Nasazení na main je z hlediska těchto úprav bezpečné.
