# Kompletní rozbor: chyby tabulky workouts

---

## Chyba: „workouts_user_id_fkey“ (foreign key constraint)

**Význam:** Sloupec `workouts.user_id` má cizí klíč na jinou tabulku. Vkládaný `user_id` (UUID z Supabase Auth) v té tabulce neexistuje.

**Častá příčina:** Tabulka `workouts` byla vytvořena s odkazem na `public.profiles(id)` nebo `public.users(id)`, ale uživatel z přihlášení existuje jen v `auth.users`. API posílá `user.id` z `auth.getUser(token)` = ID z `auth.users`.

**Řešení:** Spusť v Supabase SQL Editoru migraci `supabase/migrations/20250219_fix_workouts_user_id_fkey.sql`. Ta odstraní starý cizí klíč a nastaví `workouts.user_id` → `auth.users(id)`, takže vložení bude platné.

Pokud chyba přetrvává, ověř v Supabase Dashboard → Authentication → Users, že uživatel s daným e-mailem existuje (token může být po smazání účtu).

---

## Chyba: „null value in column workout_name“

## 1. Co chyba znamená

Hláška od PostgreSQL znamená:

- V tabulce **`workouts`** existuje sloupec **`workout_name`**.
- Sloupec má omezení **NOT NULL** (nesmí být prázdný).
- Při **INSERT** se do `workout_name` posílá **null** → databáze insert odmítne.

---

## 2. Co databáze očekává

Tabulka `workouts` v Supabase může vypadat dvěma způsoby:

### Varianta A – původní migrace v repozitáři

Soubor `supabase/migrations/20250219_create_workouts.sql` definuje:

| Sloupec       | Typ         | Null?   |
|---------------|-------------|--------|
| id            | uuid        | PK     |
| user_id       | uuid        | NOT NULL |
| workout_date  | date        | NOT NULL |
| **workout_type** | text     | ano    |
| duration_min  | int         | ano    |
| notes         | text        | ano    |
| created_at    | timestamptz | NOT NULL |

→ Tady je **workout_type**, žádný **workout_name**.

### Varianta B – tabulka vytvořená jinde (např. v Supabase ručně)

Pokud máš tabulku s tímto sloupcem:

| Sloupec       | Typ         | Null?     |
|---------------|-------------|-----------|
| ...           | ...         | ...       |
| **workout_name** | text     | **NOT NULL** |

pak při ukládání tréninku **musí** být `workout_name` vždy vyplněné. Aplikace dříve posílala jen `workout_type` → do `workout_name` šlo null → chyba.

---

## 3. Co aplikace posílá a co je potřeba doplnit

### Formulář (profil – modal „Zapsat trénink“)

- **Datum** → `workout_date`
- **Typ tréninku** (Silový, Kardio, …) → **`workout_type`** (hodnota např. `silovy`, `kardio`)
- **Délka (minuty)** → `duration_min`
- **Poznámka** → `notes`

Formulář **neposílá** `workout_name` – to je jen v databázi.

### API POST `/api/workouts`

- Z request body bere: `workout_date`, `workout_type`, `duration_min`, `notes`.
- Do databáze musí poslat i **`workout_name`**, pokud tabulka tento sloupec má a je NOT NULL.

**Doplněno v kódu:**

1. V **`pages/api/workouts.js`** je mapa `WORKOUT_TYPE_LABELS` (např. `silovy` → „Silový“).
2. Při INSERT se do payloadu přidává:
   - **`workout_name`** = název podle zvoleného typu, např. „Silový“, „Kardio“; pokud typ chybí, použije se „Ostatní“.

Tím se zajistí, že **`workout_name` nikdy neposíláme jako null** a NOT NULL constraint je splněn.

---

## 4. Přehled toho, co kde doplnit

| Místo | Co je potřeba | Stav |
|-------|----------------|------|
| **DB – sloupec workout_name** | Pokud tabulka má `workout_name` NOT NULL, musí při každém INSERT přijmout hodnotu. | ✅ API nyní posílá `workout_name` (odvozené z `workout_type`). |
| **DB – chybějící sloupec** | Pokud tabulka má jen `workout_type` a ty chceš i `workout_name`, přidat sloupec migrací. | ✅ Migrace `20250219_fix_workouts_workout_name.sql` přidá `workout_name` tam, kde chybí. |
| **API POST** | Při vytváření záznamu vždy vyplnit `workout_name`, když ho tabulka vyžaduje. | ✅ Doplněno – hodnota z `WORKOUT_TYPE_LABELS` nebo „Ostatní“. |
| **API GET** | Žádná změna nutná – `select('*')` vrací všechny sloupce včetně `workout_name`. | ✅ Beze změn. |
| **Frontend – seznam tréninků** | Zobrazit název typu: preferovat `workout_type` (id), jinak použít `workout_name` (pro staré záznamy nebo jiné schéma). | ✅ V `profil.js` se bere `type.label` z `WORKOUT_TYPES` podle `w.workout_type`, jinak `w.workout_name` nebo fallback. |

---

## 5. Migrace v repozitáři

- **`20250219_fix_workouts_schema.sql`** – přidává `duration_min`, `notes` (pokud chybí).
- **`20250219_fix_workouts_workout_name.sql`** – přidává `workout_name` (pokud chybí), aby bylo možné mít v DB oba názvy (typ id + zobrazený název).

V Supabase Dashboard → SQL Editor spusť migrace v tomto pořadí:

1. `supabase/migrations/20250219_fix_workouts_schema.sql`
2. `supabase/migrations/20250219_fix_workouts_workout_name.sql`

(Pokud už máš `workout_name` NOT NULL a nechceš nic měnit, stačí, že API už hodnotu posílá – migraci pro `workout_name` nemusíš spouštět.)

---

## 6. Shrnutí

- **Příčina chyby:** Tabulka `workouts` má sloupec `workout_name` s NOT NULL a aplikace ho při ukládání nevyplňovala.
- **Řešení:** V API při POST doplnit **`workout_name`** odvozené z **`workout_type`** (např. „Silový“, „Kardio“), takže do DB už nikdy neposíláme null.
- **Doplněno:** API payload, migrace pro případné doplnění sloupce, zobrazení na frontendu tak, aby fungovalo i při `workout_type` nebo `workout_name`.

Po nasazení těchto úprav by hláška „null value in column workout_name“ neměla dál vznikat.
