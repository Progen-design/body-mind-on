# Core flow: Registrace → AI plán (Body & Mind ON)

**Produktová pravda:** Po dokončení registrace (např. na `/on-club`) musí systém uživatele dovést až do stavu, kdy OpenAI asistent z jeho dat vygeneruje finální výstup (jídelníček, tréninkový plán, suplementace, doporučení). Tento flow je jádrem produktu a **nesmí být refaktorem rozbit**.

## Kanonický flow (6 kroků)

| Krok | Popis | Soubory / místa |
|------|------|-----------------|
| 1 | **Formulář / registrace** | `pages/on-club.js`, `pages/start.js`, `pages/chci-vip.js`, `components/ProgramForm.js` – odeslání na `POST /api/body-metrics` |
| 2 | **Uložení do `body_metrics`** | `pages/api/body-metrics.js` – validace, `createAuthUserIfNew`, `insert` do `body_metrics` |
| 3 | **Spuštění AI generování** | `pages/api/body-metrics.js` → `createInitialAITasks(user_id, emailOptions)` → `enqueueAIEvent` + `triggerImmediateDecision` → `runAIScheduler()`; scheduler volá `executeAITask` → `executeTrainerTask` v `lib/aiTaskExecutors.js` |
| 4 | **Výstup asistenta (JSON/HTML)** | `lib/aiTaskExecutors.js` → `generatePlan(...)` (`lib/generatePlan.js`) → OpenAI trainer agent vrací strukturovaný výstup; `persistTrainerPlan` očekává `generated.html` |
| 5 | **Uložení do `ai_generated_plans`** | `lib/aiTaskExecutors.js` → `persistTrainerPlan()` – insert/update v `ai_generated_plans`, nastavení `valid_from` / `valid_until`, `is_active` |
| 6 | **Zobrazení v aplikaci a e-mail** | **E-mail:** `executeTrainerTask` volá `sendPlanEmail(...)` po úspěšném uložení plánu. **UI:** `pages/api/profile.js` načte `ai_generated_plans` jako `plans`; `hooks/useProfileData.js` + `lib/profileApi.js` dodají data do `pages/profil.js`; profil zobrazuje `currentPlan.plan_html` (jídelníček, trénink, doporučení). |

## Kritické závislosti

- **Registrace bez `user_id`:** Pokud `createAuthUserIfNew` selže (nebo vrátí bez `userId`), úvodní AI úkoly se nevytvoří – flow končí po kroku 2. Odpověď API pak obsahuje `loginUnavailable: true` a uživatel dostane hlášku o kontaktu.
- **Jediná cesta pro „první plán“:** První plán po registraci jde výhradně přes úlohu `trainer` / `initial_plan` vytvořenou v `createInitialAITasks`. V body-metrics se **nevolá** přímo `generatePlanForEmail` ani jiná paralelní cesta – pouze vytvoření tasků a běh scheduleru.
- **Scheduler v rámci requestu:** Po vytvoření tasků se v body-metrics volá `runAIScheduler()`. Dokud běží v rámci stejného HTTP požadavku, může API vrátit `planSent: true/false` podle stavu tasku `initial_plan`. Pokud scheduler vyhodí výjimku, tasky zůstanou `pending` a cron (`/api/ai/run-scheduler`) je zpracuje později – uživatel pak uvidí „e-mail se nepodařilo odeslat“, ale po přihlášení může plán vidět v profilu po dalším načtení (refetch), jakmile task doběhne.

## Co při refaktoru nesmí zmizet

1. **V `POST /api/body-metrics` (po úspěšném insertu `body_metrics` a při existujícím `user_id`):**
   - volání `createInitialAITasks(userId, emailOptions)`;
   - volání `enqueueAIEvent` + `triggerImmediateDecision`;
   - volání `runAIScheduler()` (nebo ekvivalentní zpracování pending tasků);
   - vrácení `planSent` odvozené od stavu tasku `trainer` / `initial_plan`.

2. **V `lib/aiTaskExecutors.js`:**
   - `executeTrainerTask`: načtení `body_metrics` → `generatePlan(...)` → `persistTrainerPlan(...)` → pro `initial_plan` volání `sendPlanEmail(...)`.

3. **Ukládání plánu:** Vždy do tabulky `ai_generated_plans` (insert nebo update) s `plan_html`, `valid_from`, `valid_until`, `is_active`.

4. **Profil:** API `/api/profile` musí vracet `plans` z `ai_generated_plans`; profilová stránka musí zobrazovat `profile.plans` a aktuální plán (`currentPlan`) včetně `plan_html`.

## Doporučení pro robustnost a viditelnost

- **Audit:** Logovat v body-metrics a v scheduleru klíčové milníky (body_metrics insert, createInitialAITasks, scheduler completed/failed, task initial_plan completed/failed). Případně zapisovat do `ai_logs`.
- **UI:** Na profilu zobrazit stav „Plán se připravuje“ pokud uživatel má `body_metrics` ale žádný aktivní plán v `plans` – s možností ručního obnovení (refetch). Tím zůstane flow pro uživatele srozumitelný i když scheduler doběhne až po odchodu z registrace.
- **Orchestrace:** Zachovat jednu hlavní cestu: event → decision → task → agent → side effect (uložení plánu + e-mail). Nepřidávat paralelní „zkratky“, které by obcházely `ai_tasks` a zapisovaly do `ai_generated_plans` bez konzistence se schedulerem.

Tento dokument slouží jako referenční popis core flow; změny v uvedených souborech by měly tento flow zachovat nebo posílit.
