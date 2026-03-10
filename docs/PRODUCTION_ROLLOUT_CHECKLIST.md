# Production Rollout Checklist – Body & Mind ON AI System

> Použij při každém produkčním deployi, zejména při nasazení governance migrace nebo změnách AI pipeline.

---

## 0. Před deployem (lokálně)

- [ ] `git status` – všechny změny commitnuty, nic untracked kritického
- [ ] `git log --oneline -5` – poslední commit odpovídá tomu, co deployuješ
- [ ] Build pass: `npm run build` nebo `next build` proběhne bez chyb
- [ ] Všechny nové migrace jsou commitnuty v `supabase/migrations/`
- [ ] `vercel.json` cron schedule odpovídá aktuální realitě (Hobby: 1x denně `30 7 * * *`)
- [ ] GitHub Actions workflow existuje a má nastavené secrets (`APP_URL`, `CRON_SECRET`)

---

## 1. Vercel environment variables

Ověř, že na Vercel jsou nastaveny tyto proměnné (Settings → Environment Variables):

| Proměnná | Popis | Povinná |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI API klíč | ✅ |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon klíč | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role klíč (server-only) | ✅ |
| `CRON_SECRET` | Secret pro autentikaci `/api/ai/run-scheduler` | ✅ |
| `ADMIN_TOKEN` | Secret pro admin API (`/api/admin/*`) | ✅ |
| `NEXT_PUBLIC_APP_URL` | Produkční URL (`https://app.bodyandmindon.cz`) | ✅ |
| `SENDGRID_API_KEY` nebo `RESEND_API_KEY` | Pro odesílání e-mailů | ✅ |
| `AI_TASK_PROCESSING_STALE_MINUTES` | Timeout pro stale task recovery (default 15) | doporučeno |
| `AI_MAX_TASK_ATTEMPTS` | Max retry pokusů (default 3) | doporučeno |

---

## 2. GitHub Actions secrets

Ověř, že v GitHub repo (Settings → Secrets → Actions) jsou:

| Secret | Hodnota |
|---|---|
| `APP_URL` | `https://app.bodyandmindon.cz` |
| `CRON_SECRET` | stejná hodnota jako na Vercel |

---

## 3. Supabase: aplikování governance migrace

> **Migrace `20260315_ai_governance_db_first.sql` je idempotentní** – bezpečné spustit i vícekrát.

### Postup:

1. Otevři Supabase Dashboard → SQL Editor
2. Otevři soubor `supabase/migrations/20260315_ai_governance_db_first.sql`
3. Zkopíruj celý obsah a spusť
4. Ověř výstup – nesmí být žádná `ERROR:` chyba (WARNING je OK)

### Ověření po migraci:

```sql
-- Ověř tabulky a seedy
select count(*) from ai_agents;              -- musí být >= 4 (trainer, coach, validators)
select count(*) from ai_task_types;          -- musí být >= 12
select count(*) from ai_trigger_rules;       -- musí být >= 7
select count(*) from ai_context_profiles;   -- musí být >= 4
select count(*) from ai_executor_bindings;  -- musí být >= 6

-- Ověř nové sloupce na ai_tasks
select column_name from information_schema.columns
where table_name = 'ai_tasks'
and column_name in ('idempotency_key','source_event_id','processing_started_at','artifact_id');
-- očekávej 4 záznamy
```

### Kritické tabulky musí existovat:

- [ ] `ai_agents` – alespoň 4 záznamy (trainer, coach, nutrition_validator, training_validator)
- [ ] `ai_task_types` – 12 task definic
- [ ] `ai_trigger_rules` – trigger pravidla
- [ ] `ai_context_profiles` – 4 profily
- [ ] `ai_executor_bindings` – 6 bindingů
- [ ] `ai_tasks.idempotency_key` – sloupec existuje
- [ ] `ai_tasks.processing_started_at` – sloupec existuje

---

## 3b. Supabase: governed agent seed (instrukce a modely)

> Po 20260315 (nebo když už existuje `ai_agents`) spusť **governance seed** – nastaví všem agentům jednotné instrukce a modely (trainer = gpt-4.1, ostatní = gpt-4.1-mini). Viz `docs/AI_AGENT_GOVERNANCE.md`.

### Postup:

1. Supabase Dashboard → SQL Editor
2. Otevři `supabase/migrations/20260316_ai_agents_governed_seed.sql`
3. Zkopíruj celý obsah a spusť
4. Ověř: žádná `ERROR:` (WARNING je OK)

### Ověření:

```sql
select slug, model, left(system_prompt, 60) as prompt_preview from ai_agents order by slug;
-- trainer musí mít model = gpt-4.1, ostatní gpt-4.1-mini
-- system_prompt u každého musí být neprázdný
```

- [ ] `ai_agents` – 6 řádků (trainer, coach, marketing, social, nutrition_validator, training_validator)
- [ ] trainer.model = `gpt-4.1`, ostatní = `gpt-4.1-mini`

---

## 4. Vercel deploy

```bash
# Push do main větve → automatický Vercel deploy
git push origin main

# NEBO manuální deploy
vercel --prod
```

- [ ] Deploy proběhl bez chyb (sleduj Vercel Dashboard → Deployments)
- [ ] Deployment URL odpovídá `https://app.bodyandmindon.cz`
- [ ] Build logs neobsahují `Error:` nebo `Cannot find module`

---

## 5. GitHub Actions scheduler – aktivace

Po prvním push `.github/workflows/ai-scheduler.yml`:

- [ ] Přejdi na GitHub → Actions → `AI Scheduler (every 5 min)`
- [ ] Ověř, že workflow existuje a je enabled
- [ ] Spusť manuálně (`workflow_dispatch`) a ověř HTTP 200

---

## 6. Alternativní scheduler: cron-job.org (backup)

Pokud GitHub Actions nestačí nebo vyžaduješ nezávislý backup scheduler:

1. Registruj se na [cron-job.org](https://cron-job.org) (free)
2. Vytvoř nový cron job:
   - **URL**: `https://app.bodyandmindon.cz/api/ai/run-scheduler`
   - **Method**: GET
   - **Header**: `Authorization: Bearer <CRON_SECRET>`
   - **Schedule**: každých 5 minut
3. Ověř první spuštění – status 200

---

## 7. Post-deploy ověření

Viz samostatný checklist: `docs/SMOKE_TEST_CHECKLIST.md`

---

## 8. Rollback postup

Pokud deploy způsobil problémy:

```bash
# Revert na předchozí commit
git revert HEAD --no-edit
git push origin main
```

Pro rollback DB migrace (pokud nutný):
- Migrace je additive (přidává sloupce/tabulky) → rollback obecně není nutný
- Pokud nutné odstranit nové tabulky: `drop table if exists ai_task_types, ai_trigger_rules, ai_context_profiles, ai_executor_bindings, ai_agent_versions cascade;`
