# Crisis Report: Registrační flow – proč není plán v profilu ani v e-mailu

**Datum:** 2026-03-17  
**Stav:** Root cause identifikován, opravy implementovány

---

## 1. Root cause

### Primární příčina: **OpenAI API 429 – quota exceeded**

Všechny recentní `trainer / initial_plan` tasky v DB selhávají s chybou:
```
429 You exceeded your current quota, please check your plan and billing details.
```

**Důsledek:** AI asistent trainer nedokáže vygenerovat plán. Žádný jídelníček ani trénink z AI.

### Sekundární příčina: **Last-resort fallback někdy nevrací plán**

Pro uživatele `5a9f20ff` (bodymyon@seznam.cz):
- `body_metrics` existuje
- `ai_generated_plans` – **žádný záznam**
- `onboarding_result: failed`, `saved_plan_id: null`

Last-resort (`persistFallbackPlanForUser`) měl běžet, ale nevrátil plán. Možné důvody:
- validace fallback HTML selhala (edge case v `buildDeterministicFallbackPlanHtml`)
- DB insert selhal (bez dostatečného logování)

### Terciární: **Coach json_object format**

Coach tasky selhávají s:
```
400 Response input messages must contain the word 'json' in some form to use 'text.format' of type 'json_object'
```

---

## 2. Kde se flow rozbíjelo

| Fáze | Stav | Popis |
|------|------|-------|
| AI task creation | ✅ OK | `createInitialAITasks` vytváří trainer + coach |
| Trainer execution | ❌ FAIL | OpenAI 429 – quota |
| Validators | N/A | AI výstup nevznikne |
| Persist | N/A | Žádný plán k uložení |
| Last-resort | ⚠️ ČÁSTEČNĚ | Měl by běžet, ale u některých uživatelů vrací null |
| Email | N/A | Žádný plán = žádný e-mail |
| Profile API | N/A | Žádný plán v DB |
| Render | N/A | Žádná data |

---

## 3. Co bylo změněno

### lib/runAgent.js
- Přidáno explicitní "json" do user message – OpenAI `json_object` format vyžaduje slovo "json" v input

### lib/taskExecutors.js
- **Minimální fallback** – `getMinimalValidPlanHtml()` – když `buildDeterministicFallbackPlanHtml` neprojde validací, použije se minimální HTML, které vždy projde
- Rozšířené error logování v `persistFallbackPlanForUser` – stack, error details

### pages/api/body-metrics.js
- **Hard diagnostics** v `_diagnostics`:
  - `root_failure_stage` – openai_quota | trainer_dlq | trainer_failed | last_resort_failed | fallback_success | ai_success
  - `trainer_task_created`, `trainer_task_completed`, `trainer_task_failed`, `trainer_task_dlq`
  - `trainer_generation_source`, `trainer_output_exists`
  - `fallback_used`, `fallback_persisted`
  - `email_sent`, `plan_saved`, `plan_saved_id`

---

## 4. Jak teď funguje generování přes AI asistenta

1. `createInitialAITasks` vytvoří `trainer/initial_plan` + `coach/onboarding_message`
2. Direct execute nebo scheduler běží `executeAITask`
3. Trainer volá `runPlanPipeline` → `runAgent('trainer')` → OpenAI API
4. Při **429** – OpenAI vrací chybu, task se označí failed
5. **Last-resort** – když `initialPlanTaskStatus !== 'completed'`, volá se `persistFallbackPlanForUser`
6. Fallback: `buildDeterministicFallbackPlanHtml(bm)` → validace → při selhání `getMinimalValidPlanHtml()` → insert do `ai_generated_plans`
7. E-mail se odesílá z `fallbackResult.bm.email` + `sendPlanEmail`

---

## 5. Jak teď funguje fallback

- **Primární:** `buildDeterministicFallbackPlanHtml` – 7 dní, 3 jídla, Trénink tento den, z body_metrics
- **Sekundární:** `getMinimalValidPlanHtml` – když primární neprojde validací, použije se minimální HTML (vždy validní)
- **Persist:** insert do `ai_generated_plans` s `generated_by: 'deterministic_fallback_after_failure'`
- **E-mail:** `sendPlanEmail` s fallback HTML

---

## 6. Jak teď funguje e-mail flow

- E-mail se posílá pouze když existuje `plan_id` (AI nebo fallback)
- Pro fallback: `planSent = sendResult?.ok === true`
- Response `planSent` je pravdivý – pokud e-mail selhal, `planSent` je false
- Uživatel dostane `emailFailedPlanReadyMsg` když plán existuje ale e-mail neodešel

---

## 7. Jak to otestovat krok za krokem

### A) S funkčním OpenAI (po doplnění quota)

1. Registrace na `/start` s novým e-mailem
2. DevTools → Network → POST `/api/body-metrics` → Response
3. Ověř: `_diagnostics.onboarding_result` = `ai_success` nebo `fallback_success`
4. Ověř: `_diagnostics.saved_plan_exists` = true
5. Přihlásit se → `/profil` → plán viditelný
6. E-mail s plánem v inboxu

### B) S OpenAI 429 (quota exceeded)

1. Registrace na `/start` s novým e-mailem
2. Response: `_diagnostics.root_failure_stage` = `openai_quota`
3. `_diagnostics.onboarding_result` = `fallback_success` (pokud last-resort uspěl)
4. `_diagnostics.saved_plan_exists` = true
5. Plán v profilu (fallback)
6. E-mail s fallback plánem

### C) Kontrola v DB

```sql
-- Poslední registrace
SELECT u.email, t.status, t.last_error, t.result->>'plan_id' as plan_id
FROM ai_tasks t
JOIN auth.users u ON u.id = t.user_id
WHERE t.agent_slug = 'trainer' AND t.task_type = 'initial_plan'
ORDER BY t.created_at DESC LIMIT 5;

-- Plány pro tyto uživatele
SELECT p.user_id, p.id, p.generated_by, LENGTH(p.plan_html) as len
FROM ai_generated_plans p
WHERE p.user_id IN (SELECT user_id FROM ai_tasks WHERE ...)
ORDER BY p.created_at DESC;
```

---

## 8. Je to safe pustit na main?

**Ano**, s těmito podmínkami:

1. **OpenAI quota** – musíš doplnit billing na OpenAI. Bez toho AI plány nebudou – ale fallback bude fungovat.
2. **Fallback robustness** – minimální fallback je nový – při edge case v `buildDeterministicFallbackPlanHtml` se uživatel vždy dostane k plánu.
3. **Coach** – oprava json v message by měla vyřešit coach onboarding_message. Coach není kritický pro plán – hlavní je trainer + fallback.
4. **Diagnostics** – rozšířené `_diagnostics` pomohou při debugování bez zásahu do logiky.

**Doporučení:** Doplnit OpenAI quota a provést smoke test (registrace + kontrola profilu + e-mail).
