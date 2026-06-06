# RUNBOOK — P0 GDPR / RLS Hardening

**Projekt:** Body & Mind ON · **Migrace:** `20260606230000_p0_gdpr_rls_hardening.sql`  
**Authored:** 2026-05-20 · **Prod head před migrací:** `20260606215617` (fix_workouts_rls_with_check)

---

## Co migrace dělá (body 1–7)

| Bod | Oblast | Změna |
|-----|--------|-------|
| B1 | `body_metrics` | Odstraní `bm_select`, `bm_insert`, `server all via service role`; jen owner policies |
| B2 | `profiles` | Odstraní `profiles_select USING (true)`; jen owner. Komunita/trenér = service_role API |
| B3 | `memberships` | Odstraní duplicitní SELECT + permissive ALL policy |
| B4 | `_backup_2026_*` (9 tabulek) | REVOKE anon/authenticated + RLS ON bez politik |
| B5 | `recipes_catalog` | RLS ON + read-only (`active` sloupec existuje) |
| B6 | 3× admin views | REVOKE anon/authenticated + `security_invoker = true` |
| B7 | RPC funkce | **Pouze** REVOKE/GRANT EXECUTE (těla funkcí beze změny) |

**Vynecháno:** B8 (leaked password — Dashboard), B9 (avatars storage — zvlášť).

---

## Soubory

| Soubor | Účel |
|--------|------|
| `supabase/migrations/20260606230000_p0_gdpr_rls_hardening.sql` | Forward migrace |
| `scripts/rollback_p0_gdpr_rls_hardening.sql` | Rollback (mimo `migrations/` — neauto-aplikovat!) |
| `scripts/test_p0_rls.sql` | SQL testy T1–T3, T5–T7, T10 |
| `RUNBOOK_P0.md` | Tento dokument |

---

## Rizika

| Změna | Riziko | Mitigace |
|-------|--------|----------|
| B1 body_metrics | Registrace přes `/api/body-metrics` | Používá **service_role** → OK |
| B2 profiles | Komunita avatary | API `/api/community/*` používá **service_role** → T12 |
| B3 memberships | Stripe webhook | **service_role** → T9 |
| B4 backup | Žádná app závislost | Jen zavře únik přes anon |
| B7 REVOKE RPC | Trigger `trg_on_auth_user_created` | Trigger nepotřebuje EXECUTE pro volajícího |
| B6 views | Admin SQL dashboard | Jen service_role GRANT SELECT |

---

## KROK 2 — Aplikace na DEV (až po „RUN DEV“)

### Předpoklady

- [ ] Supabase CLI přihlášen (`SUPABASE_ACCESS_TOKEN`)
- [ ] **NIKDY** `supabase link` na produkční ref bez schválení
- [ ] Ověřen správný `SUPABASE_SERVICE_ROLE_KEY` na Vercel (legacy JWT, ne `sb_publishable_*`)

### Varianta A — Supabase dev branch (doporučeno)

```text
# Příkaz k vypořádání — NEspouštět bez "RUN DEV":
supabase branches create p0-rls-hardening --project-ref ipfyavvmmxmsjupmfnes
supabase link --project-ref <branch-ref>
supabase db push
```

### Varianta B — Lokální

```text
# NEspouštět bez "RUN DEV":
supabase start
supabase db reset
```

### Po aplikaci

```text
# NEspouštět bez "RUN DEV":
psql "$DEV_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/test_p0_rls.sql
# Supabase advisors (security) — MCP nebo Dashboard
```

### Testy T1–T13

| ID | Test | Jak |
|----|------|-----|
| T1 | User A nečte body_metrics B | `test_p0_rls.sql` |
| T2 | Anon nečte body_metrics | `test_p0_rls.sql` |
| T3 | User A nečte profil B | `test_p0_rls.sql` |
| T4 | Trenér `/api/trainer/clients` = 200 | curl + JWT trenéra (`TRAINER_EMAIL`) |
| T5 | Anon nečte `_backup_*` | `test_p0_rls.sql` |
| T6 | Anon nečte views | `test_p0_rls.sql` |
| T7 | RPC `handle_new_user` anon denied | `test_p0_rls.sql` |
| T8 | Registrace START | `npm run smoke-test` proti dev preview URL |
| T9 | Stripe webhook membership | Stripe CLI `trigger` proti dev |
| T10 | recipes SELECT OK, INSERT fail | `test_p0_rls.sql` |
| T11 | Advisors 0 ERROR na opravených bodech | MCP `get_advisors` type=security |
| T12 | Komunita — avatary/jména autorů | GET `/api/community` s JWT; ověř `author_avatar` |
| T13 | Smoke celé app | Registrace → profil → workout → komunita |

---

## Rollback (dev only)

```text
# NEspouštět bez explicitního souhlasu:
psql "$DEV_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/rollback_p0_gdpr_rls_hardening.sql
```

Poté spusť advisors znovu — očekávej návrat původních ERROR nálezů.

---

## KROK 3 — PR a produkce (až po „SCHVALUJI MERGE“)

1. Otevři PR s migrací + runbookem + test skriptem.
2. Po merge a QA na dev branch: **NEPROVÁDĚJ** `db push` na prod sám.
3. Připravené příkazy pro produkci (spustit až po **„RUN PROD“**):

```text
# POZOR: produkční projekt ipfyavvmmxmsjupmfnes — jen po RUN PROD
supabase link --project-ref ipfyavvmmxmsjupmfnes
supabase db push
# Ověřit advisors + smoke-test:prod
```

### Checklist před RUN PROD

- [ ] Všechny T1–T13 PASS na dev branch
- [ ] Advisors security: 0 ERROR (opravené body)
- [ ] PITR / backup ověřen v Supabase Dashboard
- [ ] Rollback SQL otestován na dev
- [ ] `SUPABASE_SERVICE_ROLE_KEY` na Vercel = legacy service_role JWT
- [ ] Preview deploy s PR prošel smoke testem
- [ ] Explicitní **RUN PROD** od vlastníka

---

## B8 — Leaked password protection (manuálně)

Dashboard → Authentication → Providers → Email → **Enable leaked password protection**  
(Není součást SQL migrace.)

---

## Poznámka k timestamp migrace

Verze `20260606230000` řadí migraci **za prod head** `20260606215617`.  
Authored 2026-05-20; číslo verze reflektuje pořadí na produkci, ne datum session.
