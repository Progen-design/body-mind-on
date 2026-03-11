# Audit core flow registrace → plán (2026-03-10)

## A) DIAGNÓZA

### Kde se flow může zastavit

| Krok | Místo | Možná zástava |
|------|-------|---------------|
| 1 | body-metrics.js | `payload.user_id = null` při auth fail → createInitialAITasks se nevolá |
| 2 | createInitialAITasks | Duplicate / DB error → task se nevloží |
| 3 | **aiScheduler** | **Task je mimo batch** – scheduler bere jen 30 nejstarších pending tasks |
| 4 | generatePlan | AI vrátí nevalidní JSON / krátký HTML → retry → throw |
| 5 | runPlanValidators | Validátor vrátí `corrected_html` prázdný nebo krátký |
| 6 | persistTrainerPlan | `generated.html` nevalidní → throw |
| 7 | profile API | Vrací plány – filtruje jen když není aktivní plán |
| 8 | profil.js | `hasValidPlanHtml` (≥200) → zobrazí fallback pro krátké plány |

### Nejpravděpodobnější příčina

**Scheduler batch limit (MAX_TASKS_PER_RUN = 30):** Nový task může zůstat pending. **Fallback:** direct executeAITask v body-metrics.

**Sekundární:** Validátor může vrátit slabý corrected_html. **Oprava:** preferujeme lepší variantu (generated vs validator) podle validatePublishedPlanHtml.

### Co je pouze symptom

- „Plán ještě není připraven“ v UI – správné chování
- E-mail se nepošle – správné, když plán není dostatečně kompletní

---

## B) PROVEDENÉ ZMĚNY (druhá iterace)

1. **body-metrics.js** – initialPlanSummary, initialPlanValidationWarning v response; logy result po scheduleru
2. **taskExecutors.js** – validatePublishedPlanHtml(html) helper: ok, length, matchedSections, reason
3. **taskExecutors.js** – výběr mezi generated.html a validation.htmlToPublish podle validity; preferuj lepší variantu
4. **taskExecutors.js** – throw "Generated trainer plan is incomplete" místo tichého uložení
5. **taskExecutors.js** – logy: generated_html_length, validated_html_length, selected_html_source
6. **generatePlan.js** – validace ≥ 3 sekcí; striktnější retry prompt
7. **profile.js** – _diagnostics.has_valid_plan; currentPlan preferuje plán s validním plan_html
8. **debug/latest-plan-status** – result_email_sent

---

## C) OVĚŘENÍ NA PRODUKCI

1. Nová registrace → Vercel logs: `body_metrics inserted`, `scheduler run finished`, `initial_plan task status`, `initialPlanSummary`
2. Response body-metrics: `initialPlanTaskStatus`, `planSent`, `initialPlanSummary`, `initialPlanValidationWarning`
3. Debug: `GET /api/debug/latest-plan-status?email=...` – `trainer_task` (status, result_summary, result_email_sent), `ai_generated_plan.html_length`
4. Profil: přihlásit se, sekce „Můj plán“ – jídelníček + trénink

---

## D) BEZPEČNOST PRO MAIN

- Žádné nové dependency
- Žádná změna business flow
- Backward compatible
