# Body metrics – volitelné sloupce pro stravu

Registrace na [app.bodyandmindon.cz/start](https://app.bodyandmindon.cz/start) funguje **bez úprav databáze**: údaje o stravě a omezeních se ukládají do sloupce `notes`.

Pole **Typ stravy** a **Co nejí** jsou v aplikaci i v API **nepovinná** – při prázdných hodnotách se ukládá `null`. Sloupce v DB jsou nullable.

Pokud v budoucnu budeš chtít mít typ stravy a omezení v samostatných sloupcích (např. pro reporting nebo API), můžeš v Supabase přidat sloupce takto:

## 1. Otevři Supabase

- Přihlas se do [supabase.com](https://supabase.com) a vyber projekt pro Body & Mind ON.
- V levém menu zvol **SQL Editor**.

## 2. Spusť tento SQL

```sql
-- Přidání sloupců pro stravu do body_metrics (volitelné)
ALTER TABLE body_metrics
  ADD COLUMN IF NOT EXISTS diet_type text,
  ADD COLUMN IF NOT EXISTS dietary_restrictions text;
```

## 3. Po přidání sloupců

Aplikace momentálně **neposílá** `diet_type` a `dietary_restrictions` do INSERT (aby běžela i bez těchto sloupců). Až sloupce v DB budou, můžeš v `pages/api/body-metrics.js` znovu přidat do objektu `payload` řádky:

- `diet_type: dietType || null,`
- `dietary_restrictions: dietaryRestrictions || null,`

a zároveň buď nechat ukládání do `notes`, nebo ho odstranit a ukládat jen do nových sloupců.

---

**Shrnutí:** Teď nic v Supabase měnit nemusíš – registrace by měla projít a strava jde do `notes`.

---

## Chyba: body_metrics_occupation_check

Pokud se objeví chyba `violates check constraint "body_metrics_occupation_check"`, sloupec `occupation` má omezené povolené hodnoty. Aplikace mapuje vstupy na: `office_it`, `manual`, `driver`, `warehouse`, `healthcare`, `teacher_sales`, `gastronomy`, `other`. Hodnota `kombinovana` (z formuláře) se mapuje na `teacher_sales`.

Pokud chceš povolit `kombinovana` přímo v DB, v Supabase SQL Editor spusť:

```sql
ALTER TABLE body_metrics DROP CONSTRAINT IF EXISTS body_metrics_occupation_check;
ALTER TABLE body_metrics ADD CONSTRAINT body_metrics_occupation_check
  CHECK (occupation IS NULL OR occupation IN (
    'office_it', 'manual', 'driver', 'warehouse', 'healthcare',
    'teacher_sales', 'gastronomy', 'other', 'kombinovana'
  ));
```
