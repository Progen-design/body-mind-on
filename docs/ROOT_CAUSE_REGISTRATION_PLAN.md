# Root cause: plán po registraci

**Datum:** 2026-03-17  
**Role:** Produktový architekt / CTO – core hodnota produktu.

---

## 1. Root cause

**Kde přesně a proč se po registraci nevygeneroval jídelníček a tréninkový plán:**

1. **Časový limit Vercel (504)**  
   Handler čekal až 95 s na dokončení AI plánu, ale Vercel ukončil funkci po 60 s (`FUNCTION_INVOCATION_TIMEOUT`). Po 504 klient nedostal odpověď a plán mohl zůstat v běhu na pozadí bez jasného stavu.

2. **Last-resort závisel na e-mailu**  
   Fallback plán se ukládal a task se označil za hotový jen když `fallbackResult.bm?.email` existoval. Při chybějícím e-mailu v záznamu se plán neuložil do `ai_generated_plans` a uživatel v profilu nic neviděl.

3. **Nedostatečná diagnostika**  
   Z jedné registrace nebylo z odpovědi body-metrics ani z profilu zřetelné, zda vznikl task, zda se spustil last-resort a zda byl plán uložen.

4. **Deterministický fallback je plnohodnotný**  
   `buildDeterministicFallbackPlanHtml` už generuje 7 dní, 3 jídla denně, „Trénink tento den“ u každého dne, sekce Regenerace, Suplementace, Nákupní seznam, Mindset a délku ≥ 3500 znaků – tedy validní plán. Problém byl v tom, že se tento plán ne vždy uložil a nezobrazil (viz body 1–2).

---

## 2. Kde se flow rozbíjelo

| Krok | Stav | Poznámka |
|------|------|----------|
| Registrace / auth | OK | `createAuthUserIfNew` → `payload.user_id` |
| body_metrics insert | OK | Řádek s `user_id`, `email` |
| createInitialAITasks | OK | Vznikají `trainer/initial_plan` a `coach/onboarding_message` |
| Task má user_id / payload | OK | `emailOptions` v payloadu |
| body_metrics pro executor | OK | `loadLatestBodyMetrics(user_id)` vidí právě vložený záznam |
| Spuštění tasku (direct execute) | Riziko | Běží v rámci requestu; při 48 s timeoutu request končí dřív než AI |
| Scheduler / poll | OK | Fallback cesta, když direct execute nestihne |
| Last-resort po timeoutu | Bug | Plán se ukládal jen když byl `bm.email` → opraveno |
| Persist do ai_generated_plans | OK | Service role, insert probíhá |
| Profile API | OK | Čte plány podle `user_id`, vrací `plan_state` |
| PlanViewer / profil | OK | Zobrazuje při `plan_state === 'ready'` a existujícím `currentPlan.plan_html` |

**Shrnutí:** Flow se rozbíjel na **Vercel timeoutu** (504) a na **podmínce last-resort** (vyžadování e-mailu před uložením plánu). Zbytek řetězce (task, persist, profile, render) je konzistentní.

---

## 3. Co bylo změněno

- **pages/api/body-metrics.js**
  - Last-resort: ukládá plán a označí task za `completed` vždy, když `fallbackResult?.plan_id` (e-mail se posílá jen pokud je `fallbackResult.bm?.email`).
  - Při selhání `persistFallbackPlanForUser` se zavolá **1× retry** před tím, než se last-resort vzdá.
  - Přidaná odpověď `_diagnostics`: `task_created`, `direct_execution_triggered`, `scheduler_triggered`, `initial_plan_task_status`, `plan_state`, `plan_sent`, `plan_pending`, `last_resort_ran`, `last_resort_plan_id`.
- **pages/api/profile.js**
  - V diagnostice přidáno: `recovery_attempted`, `recovery_task_triggered`, `last_resort_inferred`, `last_resort_plan_id` (odvozeno z task result / active plan).
- **vercel.json** (již dříve)
  - `maxDuration: 120` pro `body-metrics`.
- **pages/api/body-metrics.js** (již dříve)
  - `PLAN_GENERATION_TIMEOUT_MS = 48000` (48 s), aby request skončil před 60 s a stihl se last-resort.

Žádné změny v AI promptech, validátorech ani v `buildDeterministicFallbackPlanHtml` – ten už generuje plný týdenní plán.

---

## 4. Proč teď po registraci vznikne plný jídelníček a plný tréninkový plán

1. **Úspěšná AI cesta**  
   Když direct execute (nebo scheduler) stihne vygenerovat a uložit plán, platí stávající flow: `executeTrainerTask` → `runPlanPipeline` → `persistTrainerPlan` → plán v DB → profile vrátí `plan_state: 'ready'` a `plans[].plan_html` → PlanViewer zobrazí 7 dní (jídelníček + trénink).

2. **Last-resort cesta**  
   Když po 48 s není `initialPlanTaskStatus === 'completed'`, body-metrics zavolá `persistFallbackPlanForUser(user_id)`. Ten:
   - načte `body_metrics`,
   - vygeneruje `buildDeterministicFallbackPlanHtml(bm)` (7 dní, 3 jídla/den, trénink/den, sekce navíc),
   - zvaliduje `validatePublishedPlanHtml`,
   - vloží řádek do `ai_generated_plans` s `is_active: true`,
   - vrátí `plan_id`.
   - Body-metrics pak označí task za `completed` a případně odešle e-mail.  
   Uživatel má vždy záznam v `ai_generated_plans`, takže profil vrátí plán a PlanViewer zobrazí plný týdenní jídelníček a trénink.

3. **Žádná závislost na e-mailu pro persist**  
   Last-resort už nevyžaduje `bm.email` k uložení plánu; e-mail je jen bonus. Plán se tedy ukládá vždy, když last-resort doběhne.

4. **Žádný 504 na konci requestu**  
   S timeoutem 48 s a maxDuration 120 s request skončí včas; last-resort stihne proběhnout a vrátit 200.

---

## 5. Jak to otestovat krok za krokem

1. **Nový e-mail**  
   Registrace na /start nebo /on-club s e-mailem, který v systému ještě není.

2. **Po odeslání formuláře**  
   - V DevTools → Network → POST `/api/body-metrics` → Response:
     - `plan_state`: `ready` nebo `processing`,
     - `_diagnostics.last_resort_ran`: `true`/`false`,
     - `_diagnostics.last_resort_plan_id`: pokud last-resort běžel,
     - `_diagnostics.initial_plan_task_status`: `completed` / `pending` / `failed`.

3. **Přihlášení a profil**  
   - Po přihlášení otevřít /profil.
   - Sekce „Můj plán“: měl by být vidět týdenní plán (7 dní, snídaně/oběd/večeře, trénink tento den).
   - V konzoli nebo v rozšíření pro API lze ověřit GET /api/profile → `_diagnostics.plan_state === 'ready'`, `plans[0].plan_html` má délku > 3500 a obsahuje Jídelníček a Trénink.

4. **Bez e-mailu (edge case)**  
   Pokud by body_metrics neměl email, last-resort stejně uloží plán; v odpovědi body-metrics bude `plan_sent: false`, ale v profilu plán bude.

---

## 6. Je to safe pustit na main?

**Ano.**

- Last-resort mění jen chování při nedokončeném AI plánu: vždy uloží deterministický plán a označí task za hotový; e-mail jen když je adresa.
- Diagnostika je pouze přidaná (response body), nemění kontrakty pro klienta.
- Profile API jen rozšířeno o `recovery_attempted` a `recovery_task_triggered`.
- Build a existující flow (createInitialAITasks, executeTrainerTask, persistTrainerPlan, profile, PlanViewer) zůstávají beze změny logiky; jediná změna je „kdy a za jakých podmínek se uloží fallback plán“.

Spolehlivost: každý uživatel s `user_id` po registraci buď dostane plán z AI, nebo z last-resort, a v obou případech má plný týdenní jídelníček a tréninkový plán v profilu.
