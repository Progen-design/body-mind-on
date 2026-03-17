# P0: Chybějící initial_plan task – root cause a recovery

Proč uživatel na /profil vidí „Plán zatím nebyl vytvořen“ a co bylo změněno.

---

## 1. Skutečný root cause

Proč pro uživatele nevznikl nebo nebyl nalezen `trainer / initial_plan`:

1. **Starší uživatelé**  
   Účet a `body_metrics` vznikly dříve než flow s `createInitialAITasks`. V DB tedy je `user_id` a záznamy v `body_metrics`, ale v `ai_tasks` žádný řádek pro `trainer / initial_plan`. Profile API pak nenašel task → `initialPlanTaskExists === false` → při neexistenci validního plánu se vrátil `plan_state = 'missing'`.

2. **Auth bez user_id**  
   Když při registraci auth selže (a nejde o „already registered“), ukládáme `body_metrics` s `user_id = null`. Tasky se nezakládají (`if (payload.user_id)`). Tito uživatelé ale nemají účet, takže se na /profil nepřihlásí – to není důvod „missing“ u přihlášeného uživatele.

3. **Žádný jiný tichý úspěch bez tasku**  
   Při platném `payload.user_id` voláme `createInitialAITasks`; při chybě insertu (kromě duplicate/idempotency) funkce hodí a body-metrics API vrátí 500. Úspěšná odpověď 200 tedy znamená, že task creation buď proběhl, nebo byl idempotentní (duplicate). U přihlášeného uživatele bez tasku je tak hlavní vysvětlení: **účet/body_metrics vznikly v době bez tohoto flow**, nebo výjimečně task později někdo smazal.

4. **Proč UI ukazovalo missing**  
   I když backend vracel `missing` jen při skutečné absenci tasku i plánu, chyběla **recovery**: při existujících `body_metrics` a neexistenci tasku se task nedoplňoval, takže uživatel zůstal v „missing“ bez šance na automatické doplnění.

---

## 2. Kde se flow rozbíjelo

- **Registrace (body-metrics)**  
  Při `payload.user_id == null` se tasky nevytváří – záměrně; uživatel nemá účet. Při platném `user_id` se `createInitialAITasks` volá a při neúspěchu (kromě duplicate) se chyba propaguje (500). Žádné tiché „úspěch bez tasku“.

- **Profile API**  
  Po načtení dat se určil `plan_state`. Když `!initialPlanTaskExists && !hasValidPlan`, vracel se `missing` bez pokusu o doplnění chybějícího tasku. Chyběla logika typu: „má body_metrics, nemá task ani validní plán → vytvoř task a vrať processing“.

- **Starší data**  
  U účtů vytvořených před zavedením `createInitialAITasks` v DB nikdy nevznikl `trainer / initial_plan` task. Žádný mechanismus to dodatečně nedoplňoval.

---

## 3. Co bylo změněno

### body-metrics (`pages/api/body-metrics.js`)

- Volání `createInitialAITasks` je v `try/catch`. Při výjimce se chyba zaloguje a znovu hodí – registrace se netváří jako úspěch.
- Logování: před/po vytvoření tasků (včetně `tasksCreated` z výsledku), při chybě `[body-metrics] createInitialAITasks failed`.

### createInitialAITasks (`lib/createInitialAITasks.js`)

- Na začátku a při chybách přidáno logování (userId, typ chyby).
- Návratová hodnota: `{ ok: true, tasksCreated: true }` při novém insertu, `{ ok: true, tasksCreated: false }` při duplicate/idempotency, aby bylo dohledatelné, zda tasky skutečně vznikly.

### Profile API (`pages/api/profile.js`)

- Import a volání **ensureInitialPlanTask** z `lib/ensureInitialPlanTask.js`.
- **Recovery:** Po načtení `body_metrics`, `ai_tasks` a plánů: pokud neexistuje task `trainer / initial_plan` a neexistuje validní plán, ale existuje alespoň jeden záznam v `body_metrics`, zavolá se `ensureInitialPlanTask(userId, {})`. Pokud vytvoří task, načte se nový task a použije se pro zbytek logiky → `plan_state` vyjde jako **processing** (pending task), ne missing.
- **Diagnostika v odpovědi:** V `_diagnostics` přidáno: `body_metrics_exists`, `body_metrics_count`, `recovery_task_created`, `recovery_reason` (např. `recovery_task_created`, `valid_plan_exists_skip_recovery`, `no_body_metrics_skip_recovery`, `create_failed`).

### Recovery helper (`lib/ensureInitialPlanTask.js`)

- **ensureInitialPlanTask(userId, emailOptions?)**
  - Ověří existenci `trainer / initial_plan` pro `userId`.
  - Pokud task existuje → `{ created: false, reason: 'task_already_exists' }`.
  - Pokud neexistuje → volá `createInitialAITasks(userId, emailOptions)` (stejná idempotency jako při registraci). Při úspěchu → `{ created: true, reason: 'recovery_task_created' }`. Při výjimce (kromě duplicate) → `{ created: false, reason: 'create_failed', error }`. Při duplicate po vytvoření jinde → `{ created: false, reason: 'task_created_by_race' }`.
- Žádné duplikáty: používá se stávající `createInitialAITasks` včetně idempotency key.

### Debug endpoint (`pages/api/debug/latest-plan-status.js`)

- Do odpovědi přidáno: `body_metrics_exists`, `body_metrics_count`, `initialPlanTaskStatus`, `initialPlanTaskCreatedAt`, `initialPlanTaskProcessedAt`, `initialPlanTaskLastError` pro rychlé dohledání stavu bez nutnosti prohlížet DB.

---

## 4. Jak funguje self-healing

1. Uživatel otevře /profil, profile API načte `body_metrics`, plány a `ai_tasks` (trainer / initial_plan).
2. Pokud **není** task a **není** validní plán, ale **jsou** `body_metrics`:
   - Zavolá se `ensureInitialPlanTask(userId, {})`.
   - Ta zkontroluje v DB, zda už task pro tohoto uživatele neexistuje (race).
   - Pokud neexistuje, zavolá `createInitialAITasks(userId, {})` → vytvoří `trainer / initial_plan` a `coach / onboarding_message` se stejným idempotency key jako při registraci.
   - Profile API po úspěšném vytvoření načte nový task a použije ho pro výpočet stavu → výsledek je **processing** (pending), ne missing.
3. V odpovědi je v `_diagnostics`: `recovery_task_created: true`, `recovery_reason: 'recovery_task_created'` (nebo jiný důvod při skip/fail).
4. Frontend zobrazí „Plán se dokončuje…“ a může pollovat; scheduler/cron nebo „Vygenerovat plán“ (retry-initial-plan) task zpracují stejným pipeline jako po registraci → plný plán (7 dní, jídelníček, trénink atd.).

---

## 5. Proč už uživatel nezůstane bez plánu

- **Nová registrace:** Task vznikne v body-metrics přes `createInitialAITasks`; při selhání registrace spadne na 500, ne na „úspěch bez tasku“.
- **Starý účet (body_metrics bez tasku):** Při prvním načtení profilu se spustí recovery → vytvoří se chybějící task, stav se vrátí jako **processing**. Následně scheduler nebo „Vygenerovat plán“ vygenerují plán stejným pipeline (generatePlan, validace, persist) jako u nové registrace.
- **Profil už nevrací lživý missing:** Missing se vrací jen když skutečně neexistuje task ani plán a recovery buď neproběhla (např. žádné body_metrics), nebo selhala (create_failed). V typickém případě „má body_metrics, neměl task“ recovery task vytvoří a uživatel dostane processing, ne missing.

---

## 6. Jak to otestovat krok za krokem

1. **Recovery pro starého uživatele**  
   V DB: uživatel s `body_metrics` a bez řádku v `ai_tasks` pro `trainer / initial_plan`. Přihlásit se jako tento uživatel, otevřít /profil. Očekávání: první odpověď profile má v diagnostice `recovery_task_created: true`, `plan_state: 'processing'`. V DB po požadavku existuje nový task `trainer / initial_plan` (pending). UI: „Plán se dokončuje…“.

2. **Po zpracování tasku**  
   Spustit scheduler (cron nebo POST na run-scheduler) nebo použít „Vygenerovat plán“. Po dokončení: task completed, v `ai_generated_plans` platný plán, profile vrací `plan_state: 'ready'`, na /profil je zobrazen plán.

3. **Idempotence**  
   U uživatele, který už má task (pending/completed), znovu načíst profil. Recovery se nesmí pokoušet vytvořit druhý task (ensureInitialPlanTask vrátí `task_already_exists`). V diagnostice `recovery_task_created` není true.

4. **Registrace**  
   Nová registrace s platným e-mailem a heslem. V logu ověřit `[createInitialAITasks] tasks created` nebo `tasks already exist`. V DB ověřit dva záznamy v `ai_tasks` (trainer/initial_plan, coach/onboarding_message).

5. **Diagnostika**  
   V odpovědi GET /api/profile ověřit v `_diagnostics`: `body_metrics_exists`, `body_metrics_count`, `recovery_task_created`, `recovery_reason`, `initialPlanTaskExists`, `plan_state`, `plan_state_reason`.

6. **Build**  
   `npm run build` – projde bez chyb.

---

## 7. Je to safe pustit na main?

**Ano.**

- Recovery pouze doplňuje chybějící task stejným `createInitialAITasks` jako registrace, včetně idempotency key → žádné duplikáty.
- Registrace při selhání vytvoření tasku nadále končí 500 a nelze ji zaměnit za úspěch.
- Žádné měnění existujících plánů ani mazání tasků; pouze insert tasků, když chybí.
- Logování a diagnostika umožňují dohledat příčinu bez změny chování pro uživatele, kteří už task a plán mají.
