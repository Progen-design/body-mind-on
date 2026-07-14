# Supabase — změny schématu pouze přes migrace

Projekt: **body-mind-on** (`ipfyavvmmxmsjupmfnes`).

## Pravidlo

**Schéma databáze se mění výhradně přes verzované SQL soubory v `supabase/migrations/`.**

Nikdy ne:

- ruční `CREATE` / `ALTER` / `DROP` v Supabase Studio (SQL Editor, Table Editor)
- ad-hoc migrace přes MCP `apply_migration` bez okamžitého commitu `.sql` do repa
- „rychlá oprava“ přímo na produkci bez souboru v gitu

Jinak vznikne **drift**: produkce má jinou migrační historii než repo → `supabase db push` selže, `db diff` ukáže rozdíly, rollback je nejasný.

## Správný postup

1. Lokálně vytvoř migraci:
   ```bash
   npx supabase migration new popis_zmeny
   ```
2. Napiš SQL do `supabase/migrations/<timestamp>_popis_zmeny.sql`.
3. Otestuj lokálně (`npx supabase db reset` jen na **lokální** stack, ne na produkci).
4. Commit + push do `main`.
5. Aplikuj na produkci **jednou** a konzistentně:
   - preferovaně CI / `supabase db push` z repa, nebo
   - jednorázově přes Studio **jen pokud** je stejný SQL soubor už v gitu a verze sedí s `schema_migrations`.

Po změně schématu:

```bash
npx supabase gen types typescript --linked > lib/database.types.ts
```

## Kontrola driftu

```bash
npx supabase link --project-ref ipfyavvmmxmsjupmfnes
npx supabase migration list --linked
npx supabase db diff --linked
```

- `migration list`: každá verze na produkci musí mít odpovídající soubor v repu (local == remote).
- `db diff --linked`: prázdný výstup = schéma z migrací sedí s produkcí. Není prázdný → něco se změnilo mimo migrace (Studio, ruční SQL) → převeď diff na novou migraci a commitni.

## Edge Functions

Zdroj pravdy je `supabase/functions/<slug>/` v repu.

- Nasazení: `supabase functions deploy <slug>` až po review a commitu.
- Stáhnout z produkce (obnovení driftu): `supabase functions download <slug> --use-api`
- Tajemství jen v env (Vercel / Supabase secrets), **nikdy** v `index.ts` ani v migracích.

## Apple Health modul (příklad driftu 2026-07)

12 migrací a `apple-health-ingest` v5 byly nasazeny přes MCP bez souborů v repu. Oprava: SQL vytáhnout z `supabase_migrations.schema_migrations`, edge function stáhnout z produkce, commitnout — **bez** `db push` / `migration repair` na již aplikované verze.

## Zakázané na produkci bez explicitního schválení

- `supabase db reset`
- `supabase migration repair` (kromě záměrné opravy historie po dohodě)
- `DROP` / `TRUNCATE` bez zálohy a migračního souboru
