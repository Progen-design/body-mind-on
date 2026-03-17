# Debug: jeden konkrétní uživatel (po registraci)

Cíl: zjistit, kde se „láme“ kvalita – generování, validace, fallback nebo UI.

## 1. Kdo je uživatel

- Nově registrovaný (ideálně po posledním deployi).
- Znáš jeho **e-mail** (pro debug endpoint).

## 2. Co vytáhnout

### A) Debug endpoint (vyžaduje ADMIN_TOKEN)

```bash
curl -s -H "Authorization: Bearer TVOJ_ADMIN_TOKEN" \
  "https://TVA_DOMENA/api/debug/latest-plan-status?email=USER_EMAIL"
```

Vrátí např.:

- `auth_user_exists`, `user_id`
- `body_metrics` (id, user_id, created_at)
- `trainer_task`: id, status, last_error, **result** (summary, generation_source, fallback_used, truth_check, …)
- `ai_generated_plan`: id, html_length, meal_keys_in_html, exercise_keys_in_html
- **agent_diagnostic**: prompt_version, prompt_source, supporting_documents_count, document_titles, source_ids

Z **trainer_task.result** si zapiš:

- `generation_source` (ai | ai_retry_truth | deterministic_fallback)
- `fallback_used` (true/false)
- `truth_check_passed`, `soft_gate_passed` (pokud máš nový pipeline)
- `truth_retry_triggered`, `truth_retry_reason`, `final_publish_source`
- `html_length` (nebo z ai_generated_plan)

### B) Profile API (jako přihlášený uživatel)

Přihlášený request na `GET /api/profile` s Bearer tokenem uživatele.

V odpovědi `_diagnostics`:

- `plan_state` (ready | processing | failed | invalid | missing)
- `generation_source`, `fallback_used`
- `truth_check_passed`, `truth_check_reason`
- `soft_gate_passed`, `soft_gate_reason`
- `truth_retry_triggered`, `truth_retry_reason`, `truth_retry_fixed`, `final_publish_source`
- `meals_exact_count`, `meals_illustrative_count`, `meals_none_count`
- `exercises_exact_count`, `exercises_fallback_count`, `exercises_none_count`

A hlavně: **co je v `plans[0]`** (nebo aktuální plán) – `plan_html` délka, struktura.

## 3. Co z toho vyčíst

| Co vidíš | Možná příčina |
|----------|----------------|
| `generation_source === 'deterministic_fallback'` | AI výstup neprošel validací nebo truth check; uživatel dostal fallback. |
| `fallback_used === true` | Buď hard, nebo soft gate → retry neprošel → fallback. |
| `truth_retry_triggered === true`, `truth_retry_fixed === false` | Byl spuštěn retry (hard/soft), ale opravení se nepovedlo → skončilo to fallbackem. |
| `exercises_none_count` vysoké, `exercises_exact_count` nízké | Enrichment médií: cviky se nemačou na canonical / ExerciseDB nevrací obrázky, nebo běží exact-only a většina je „none“. |
| `html_length` malé (< 5–8k znaků) | Plán je stručný; buď AI vrátil málo, nebo fallback je příliš krátký. |
| V profilu prázdné/rozbité sekce | Problém spíš v **PlanViewer** nebo v parsování HTML (struktura, sekce). |
| V profilu „Bez ověřeného média“ u cviků | **Enrichment** (exercise_media) nebo **canonical map** – cviky nemají exact match, nebo API nevrátilo médium. |

## 4. Co poslat dál

Pro přesné určení, kde to drhne:

1. **Screenshot profilu** – co uživatel reálně vidí (jídelníček, trénink, média).
2. **JSON** z `latest-plan-status` (nebo aspoň `trainer_task.result` + `ai_generated_plan`).
3. **Úsek `_diagnostics`** z `/api/profile` pro toho samého uživatele.

Z toho jde rozlišit:

- problém v **generování** (AI/fallback),
- v **validaci/truth** (retry, fallback),
- v **enrichmentu** (média cviků),
- nebo v **UI** (PlanViewer, zobrazení sekcí).
