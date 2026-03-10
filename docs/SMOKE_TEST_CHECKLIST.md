# Post-Deploy Smoke Test Checklist – Body & Mind ON AI System

> Prováděj po každém produkčním deployi. Každý bod ověřuj v Supabase SQL Editoru, Vercel Logs, nebo prohlížeči.

---

## A. Registrační flow (`/start`, `/on-club`, `/chci-vip`)

### A1. Formulář a UI

- [ ] Stránka `/start` se načte bez JS chyb (otevři DevTools → Console)
- [ ] Formulář přijme data (jméno, e-mail, výška, váha, cíl, aktivita)
- [ ] Submit tlačítko není duplikovaně disabled nebo zamrzlé
- [ ] Po submitu přijde response do 30s (AI generování plánu)

### A2. Kontrola v DB: `body_metrics`

```sql
select id, email, name, user_id, created_at
from body_metrics
order by created_at desc
limit 5;
```

- [ ] Nový řádek se objeví se správnými daty
- [ ] `user_id` je vyplněn (auth user byl vytvořen)

### A3. Kontrola v DB: `auth.users`

```sql
select id, email, created_at from auth.users order by created_at desc limit 5;
```

- [ ] Nový auth user existuje pro testovací e-mail

---

## B. AI task pipeline

### B1. Vytvoření AI tasků po registraci

```sql
select id, user_id, agent_slug, task_type, status, idempotency_key, source_event_id, created_at
from ai_tasks
order by created_at desc
limit 10;
```

- [ ] Existuje task `trainer / initial_plan` pro nového uživatele (status `pending` nebo `completed`)
- [ ] Existuje task `coach / onboarding_message` pro nového uživatele
- [ ] `idempotency_key` je vyplněn (ve formátu `registration:{user_id}:trainer:initial_plan`)
- [ ] Žádný task není ve stavu `failed` pro nového uživatele

### B2. Kontrola AI events

```sql
select id, event_type, user_id, status, created_at
from ai_events
order by created_at desc
limit 5;
```

- [ ] Existuje event `user_registered` nebo `initial_plan_requested` pro nového uživatele
- [ ] Status je `completed` (event byl zpracován)

### B3. Spuštění scheduleru (inline z registrace)

Registrační flow volá `runAIScheduler()` přímo – scheduler NEzávisí na cronu pro nové uživatele.

```sql
-- Ověř, že task byl zpracován (status completed)
select status, attempts, last_error, result, updated_at
from ai_tasks
where agent_slug = 'trainer' and task_type = 'initial_plan'
order by created_at desc
limit 3;
```

- [ ] `status = 'completed'`
- [ ] `last_error` je NULL
- [ ] `result` obsahuje `side_effect: plan_insert` a `plan_id`

---

## C. Vznik AI plánu (`ai_generated_plans`)

```sql
select id, user_id, plan_type, is_active, created_at,
       left(plan_html, 200) as plan_preview
from ai_generated_plans
order by created_at desc
limit 3;
```

- [ ] Nový záznam existuje pro testovacího uživatele
- [ ] `plan_html` není NULL a není prázdný
- [ ] `plan_html` obsahuje HTML strukturu (musí obsahovat `<` a `>`)
- [ ] `is_active = true` pro nejnovější plán

---

## D. Zobrazení plánu v profilu (`/profil`)

- [ ] Přihlas se testovacím uživatelem na `/login`
- [ ] Přejdi na `/profil`
- [ ] Stránka se načte bez chyb
- [ ] Plán je viditelný (obsah `plan_html` se zobrazuje)
- [ ] Nejsou žádné JS chyby v konzoli (DevTools)

```sql
-- Alternativně ověř přes API
-- GET /api/profile?userId={user_id} s auth headerem
```

---

## E. Odeslání e-mailu

- [ ] Testovací e-mail přišel do schránky (zkontroluj spam folder)
- [ ] E-mail obsahuje plán (HTML formát)
- [ ] Odesílatel je správný (`noreply@bodyandmindon.cz` nebo nakonfigurovaný)

```sql
-- Ověř v AI task result (pokud logujete email status)
select result->>'email_sent' as email_sent, result->>'side_effect' as side_effect
from ai_tasks
where agent_slug = 'trainer' and task_type = 'initial_plan'
order by created_at desc limit 3;
```

---

## F. Scheduler (background cron)

### F1. Manuální spuštění scheduleru

```bash
# curl příkaz pro manuální trigger
curl -s -X GET \
  -H "Authorization: Bearer {CRON_SECRET}" \
  https://app.bodyandmindon.cz/api/ai/run-scheduler | python3 -m json.tool
```

Očekávaná response:
```json
{
  "ok": true,
  "generated": 0,
  "events": { ... },
  "scheduler": { "processed": 0, "failed": 0 }
}
```

- [ ] HTTP 200
- [ ] `ok: true`
- [ ] Žádné `error` pole ve výstupu

### F2. GitHub Actions scheduler

- [ ] Přejdi na GitHub → Actions → `AI Scheduler (every 5 min)`
- [ ] Poslední run byl úspěšný (zelená fajfka)
- [ ] Run proběhl v posledních 10 minutách

### F3. Kontrola zaseklých tasků

```sql
-- Zaseklé tasky (processing > 15 minut)
select id, user_id, agent_slug, task_type, status, processing_started_at,
       now() - processing_started_at as stuck_for
from ai_tasks
where status = 'processing'
and processing_started_at < now() - interval '15 minutes';
```

- [ ] Výsledek je prázdný (žádné zaseklé tasky)
- [ ] Pokud existují → spusť scheduler manuálně nebo nastav `processing_started_at` na NULL

### F4. Kontrola failed tasků

```sql
select id, user_id, agent_slug, task_type, status, attempts, last_error, created_at
from ai_tasks
where status = 'failed'
order by created_at desc
limit 10;
```

- [ ] Žádné kritické selhání v posledních 24h
- [ ] `last_error` je čitelná chyba (ne NULL při failed)

---

## G. Replan po změně preferencí

- [ ] Přihlas se testovacím uživatelem
- [ ] Přejdi na `/profil` → Upravit preference
- [ ] Změň cíl nebo typ stravy
- [ ] Ulož změny
- [ ] Do 30s by měl být vygenerován nový plán

```sql
select id, plan_type, is_active, created_at
from ai_generated_plans
where user_id = '{test_user_id}'
order by created_at desc
limit 5;
```

- [ ] Nový plán existuje (novější timestamp)
- [ ] Starý plán má `is_active = false`

---

## H. Admin rozhraní

- [ ] Přejdi na `/admin?key={ADMIN_TOKEN}`
- [ ] Sekce „AI asistenti (OpenAI)" zobrazuje agenty ze `ai_agents`
- [ ] Jsou vidět: trainer, coach, nutrition_validator, training_validator
- [ ] Úprava system_prompt a uložení funguje (HTTP 200 z `/api/admin/agents`)

---

## I. Kontrola logů (Vercel)

- [ ] Vercel Dashboard → Deployments → nejnovější deploy → View Logs
- [ ] Žádné `TypeError`, `Cannot read properties of undefined`, `Error:` v runtime logách
- [ ] Scheduler logy ukazují: `✅ Data uložena`, `📧 E-mail s plánem odeslán`

---

## J. DB governance – ověření po migraci

```sql
-- Musí vrátit 4 záznamy
select count(*) from ai_agents where slug in ('trainer','coach','nutrition_validator','training_validator');

-- Musí existovat idempotency index
select indexname from pg_indexes where tablename = 'ai_tasks' and indexname = 'idx_ai_tasks_idempotency';

-- Ověř context profiles
select slug, include_progress, include_plans, include_memory from ai_context_profiles;
```

- [ ] 4 agenti existují
- [ ] `idx_ai_tasks_idempotency` unique index existuje
- [ ] 4 context profiles existují (`trainer_coach`, `marketing`, `social`, `validator`)

---

## Výsledek smoke testu

| Oblast | Status | Poznámka |
|---|---|---|
| Registrace + body_metrics | | |
| AI tasky vytvoření | | |
| Trainer plan generování | | |
| Plan zobrazení v profilu | | |
| E-mail odeslání | | |
| Scheduler (manual) | | |
| GitHub Actions scheduler | | |
| Žádné zaseklé tasky | | |
| Admin UI | | |
| DB governance | | |

> Datum testu: __________ | Tester: __________ | Deploy commit: __________
