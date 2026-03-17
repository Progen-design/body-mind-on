# P0 – Verifikační matice plan_state po root cause fixu

## 1. Ověření plan_state logiky (profile.js)

| Stav | Podmínka | plan_state | plan_state_reason |
|------|----------|------------|-------------------|
| Validní plán | hasValidPlan | **ready** | valid_plan_exists |
| Dotaz na task selhal, žádné plány | initialPlanTaskQueryFailed && plansData.length === 0 | **processing** | task_query_failed_assume_processing |
| Task čeká nebo běží | status === 'pending' \|\| 'processing' | **processing** | task_pending_or_processing |
| Task selhal nebo DLQ | status === 'failed' \|\| 'dlq' | **failed** | task_failed_or_dlq |
| Jsou plány, ale nevalidní | plansData.length > 0 | **invalid** | plan_exists_but_invalid |
| Task completed, žádný validní plán | initialPlanCompleted | **invalid** | task_completed_but_no_valid_plan |
| Task existuje, jiný status | initialPlanTaskExists (fallback) | **invalid** | task_exists_unknown_status |
| Žádný task, žádné plány | jinak | **missing** | no_task_no_plan |

**Potvrzení:** Pokud `initialPlanTaskExists === true`, vždy platí jedna z vět 1–7 (ready / processing / failed / invalid). Do větve 8 (missing) se dostaneme jen když `!initialPlanTask` a zároveň žádné plány (a nebyl to případ „task query failed“). Tudíž **při existující tasku nikdy nenastane missing**.

---

## 2. Ověření debug endpointu (latest-plan-status.js)

Vrací:
- **initialPlanTaskExists**
- **trainer_task** (uvnitř: status, created_at, processed_at, result_plan_id, result_final_publish_source, result_truth_check_passed, result_soft_gate_passed, result_truth_retry_triggered, result_truth_retry_reason, …)
- **saved_plan_exists**
- **saved_plan_id**
- **saved_plan_is_active**
- **rendered_plan_exists**
- **debug_plan_state**
- **debug_plan_state_reason**

Logika debug_plan_state je záměrně stejná jako v profile API (ready / processing / failed / invalid / missing).

---

## 3. Ověření UI (profil.js)

| plan_state | UI text |
|------------|--------|
| **processing** | „Plán se dokončuje – automaticky se obnoví, jakmile bude hotový.“ |
| **failed** | „Plán se nepodařilo dokončit.“ |
| **invalid** | „Plán byl vytvořen neúplně nebo neprošel validací.“ |
| **missing** | „Plán zatím nebyl vytvořen.“ |

**Potvrzení:** „Plán zatím nebyl vytvořen.“ se zobrazí jen když backend vrátí `plan_state === 'missing'`, což nastane pouze při skutečné absenci tasku i plánu (a při úspěšném dotazu na task).

---

## 4. Testovací matice scénářů

| # | Scénář | plan_state | plan_state_reason | UI text |
|---|--------|------------|-------------------|--------|
| 1 | Task **pending** | processing | task_pending_or_processing | Plán se dokončuje – automaticky se obnoví… |
| 2 | Task **processing** | processing | task_pending_or_processing | Plán se dokončuje – automaticky se obnoví… |
| 3 | Task **failed** | failed | task_failed_or_dlq | Plán se nepodařilo dokončit. |
| 4 | Task **dlq** | failed | task_failed_or_dlq | Plán se nepodařilo dokončit. |
| 5 | Task **completed** + validní plán | ready | valid_plan_exists | (zobrazení plánu) |
| 6 | Task **completed** + žádný validní plán | invalid | task_completed_but_no_valid_plan | Plán byl vytvořen neúplně nebo neprošel validací. |
| 7 | Žádný task + žádný plán | missing | no_task_no_plan | Plán zatím nebyl vytvořen. |

Doplňkově:
- **Dotaz na task rejected** + žádné plány → plan_state = **processing**, plan_state_reason = task_query_failed_assume_processing → UI: „Plán se dokončuje…“
- **Existují záznamy v plans, ale žádný neprojde validací** → plan_state = **invalid**, plan_state_reason = plan_exists_but_invalid → UI: „Plán byl vytvořen neúplně…“
