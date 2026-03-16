# P0: Root cause a oprava „Plán zatím nebyl vytvořen“

## 1. Skutečný root cause

Profil mohl vracet **„missing“** (a tedy v UI text „Plán zatím nebyl vytvořen“) i v situacích, kdy task existoval nebo běžel:

1. **Status `dlq` (dead-letter) nebyl ošetřen**  
   Když scheduler po opakovaných chybách označil task jako `dlq`, profile bral jen `failed`. Pro `dlq` pak platilo: `initialPlanPending=false`, `initialPlanFailed=false`, `initialPlanCompleted=false` → spadlo to do výchozí větve a **plan_state = 'missing'**. Uživatel tak viděl „Plán zatím nebyl vytvořen“, i když task existoval a skončil v DLQ.

2. **Žádné pravidlo „pokud existuje task, nikdy missing“**  
   Logika nejdřív přiřadila `plan_state = 'missing'` a pak ho přepisovala podle podmínek. Když task měl nějaký jiný neřešený status nebo edge case, zůstal `missing`. Chybělo explicitní pravidlo: **existuje-li `trainer/initial_plan` task, profil nesmí vrátit `missing`**.

3. **Selhání dotazu na ai_tasks**  
   Při `Promise.allSettled` může dotaz na `ai_tasks` skončit jako `rejected`. Pak `initialPlanTask = null`. Pokud zároveň neexistovaly plány, opět **plan_state = 'missing'**, i když task v DB mohl být (např. dočasná chyba DB/sítě).

## 2. Kde se flow rozpadlo

- **Profile state (plan_state)**  
  Stav „missing“ byl vracen i když task existoval (status `dlq` nebo jiný neřešený stav), nebo když dotaz na task selhal.  
  Persist a validace v taskExecutors/generatePlan jsou v pořádku: při neplatném plánu se task označí jako `failed` a plán se neukládá. Problém byl pouze v **vyhodnocení stavu v profile API** a v **chybějícím ošetření `dlq` a selhání dotazu**.

## 3. Co se změnilo

### pages/api/profile.js

- **Dotaz na ai_tasks**: přidán sloupec `processed_at` do `select`.
- **initialPlanTaskQueryFailed**: nová proměnná (`initialPlanTaskRes?.status === 'rejected'`). Při selhání dotazu a zároveň žádných plánech se nastaví **plan_state = 'processing'** a **plan_state_reason = 'task_query_failed_assume_processing'** (ne „missing“).
- **initialPlanFailed**: rozšířeno o status **`dlq`** → `status === 'failed' || status === 'dlq'`.
- **plan_state** – pevná pravidla v tomto pořadí:
  1. **ready** – existuje validní plán  
  2. **processing** – selhal dotaz na task a nejsou plány (optimisticky „processing“)  
  3. **processing** – task je `pending` nebo `processing`  
  4. **failed** – task je `failed` nebo `dlq`  
  5. **invalid** – existují záznamy v `plansData`, ale žádný není validní  
  6. **invalid** – task je `completed`, ale neexistuje validní plán  
  7. **invalid** – task existuje s jiným statusem (fallback)  
  8. **missing** – pouze když **neexistuje task a neexistují plány** (`!initialPlanTask && plansData.length === 0`).
- **plan_state_reason**: pro každý stav doplněn důvod (např. `task_failed_or_dlq`, `no_task_no_plan`).
- **Diagnostika**: doplněno `initialPlanTaskExists`, `initialPlanTaskStatus`, `initialPlanTaskCreatedAt`, `initialPlanTaskProcessedAt`, `initialPlanTaskLastError`, `initialPlanTaskQueryFailed`, `saved_plan_id`, `saved_plan_is_active`, `plan_state_reason`.

### pages/profil.js

- **failed**: samostatná zpráva „Plán se nepodařilo dokončit.“ + tlačítka Vygenerovat plán / Obnovit.
- **invalid**: samostatná zpráva „Plán byl vytvořen neúplně nebo neprošel validací.“ + stejná tlačítka.
- **missing**: text „Plán zatím nebyl vytvořen.“ zůstává jen pro skutečný stav **missing** (žádný task, žádný plán).

### pages/api/debug/latest-plan-status.js

- Do odpovědi tasku doplněna pole: `result_plan_id`, `result_final_publish_source`, `result_truth_check_passed`, `result_soft_gate_passed`, `result_truth_retry_triggered`, `result_truth_retry_reason`.
- Odpověď rozšířena o: `initialPlanTaskExists`, `saved_plan_exists`, `saved_plan_id`, `saved_plan_is_active`, `rendered_plan_exists`, **debug_plan_state**, **debug_plan_state_reason** (stejná logika jako v profile API).

## 4. Proč už „missing“ nebude lživý stav

- **missing** se nastaví jen v poslední větvi: když **neexistuje žádný** `trainer/initial_plan` task **a** `plansData.length === 0`.  
- Pokud **existuje** task (jakýkoli status), vždy platí jedna z předchozích vět: **processing**, **failed** nebo **invalid**.  
- Status **dlq** se bere jako **failed**, takže už nikdy nepropadne do „missing“.  
- Při **selhání dotazu** na task a zároveň žádných plánech se vrací **processing** s důvodem `task_query_failed_assume_processing`, takže uživatel neuvidí „Plán zatím nebyl vytvořen“ v nejasné situaci.

## 5. Jak to ověřit krok za krokem

1. **Nový uživatel (registrace)**  
   - Zaregistrovat nového uživatele (body-metrics s e-mailem, heslem, výška/váha, cílem).  
   - Po přihlášení otevřít profil.  
   - Očekávání: buď „Plán se dokončuje…“ (processing), nebo zobrazení plánu (ready). Po dokončení tasku by se nemělo objevit „Plán zatím nebyl vytvořen“, pokud task v DB existuje.

2. **Diagnostika v profilu**  
   - GET `/api/profile` s platným tokenem.  
   - V `_diagnostics` zkontrolovat: `plan_state`, **plan_state_reason**, `initialPlanTaskExists`, `initialPlanTaskStatus`, `saved_plan_exists`, `saved_plan_id`, `initialPlanTaskQueryFailed`.  
   - Pokud existuje task a není validní plán: `plan_state` by měl být `failed` nebo `invalid`, **ne** `missing`.

3. **Debug endpoint**  
   - GET `/api/debug/latest-plan-status?email=...` s hlavičkou `Authorization: Bearer <ADMIN_TOKEN>`.  
   - Ověřit: `initialPlanTaskExists`, `trainer_task.status`, `debug_plan_state`, `debug_plan_state_reason`, `saved_plan_exists`, `result_plan_id`, `result_truth_check_passed`.

4. **Úmyslně failed/DLQ**  
   - (V testu nebo lokálně) mít uživatele s taskem ve stavu `failed` nebo `dlq`.  
   - Profil by měl vracet **plan_state = 'failed'** a UI text „Plán se nepodařilo dokončit.“, ne „Plán zatím nebyl vytvořen.“

## 6. Je to safe pustit na main?

**Ano.**

- Změny jsou v **profile API** (plan_state a diagnostika), **profil.js** (oddělené zprávy pro failed/invalid) a **debug endpointu** (další pole).  
- Žádná změna v body-metrics, createInitialAITasks, scheduleru, taskExecutors ani generatePlan.  
- Rozšíření pravidel pro `plan_state` jen zužuje, kdy se vrací „missing“; při existující tasku se vrací failed/invalid/processing.  
- Při selhání dotazu na task se vrací „processing“ místo „missing“, což je konzervativní a zabraňuje falešnému „Plán zatím nebyl vytvořen“.
