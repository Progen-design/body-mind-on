# Analýza: Habit Tracker – mřížka (návyky × dny) a personalizace

## 1. Co uživatel chce

1. **Návyky a zlozvyky pod sebou** – vertikálně (řádky)
2. **Na ose X dny** – horizontálně (sloupce)
3. **Mřížka** – každá buňka = habit × den, kliknutím odškrtnout splněno/nesplněno
4. **Návyky odvozené od výběru na začátku** – uživatel si vybere, které návyky chce sledovat
5. **Předdefinované na základě registrace** – některé návyky předvybrány podle body_metrics (goal, stress, activity, notes…)

---

## 2. Současný stav systému

### Databáze
- **`body_metrics`** – registrace: goal, stress_level, activity, diet_type, dietary_restrictions, notes, program
- **`habit_logs`** – user_id, log_date, habit_id, completed (UNIQUE user_id, log_date, habit_id)
- **`auth.users`** – uživatelé

### Registrace (on-club, chci-vip, start)
- **Krok 1:** jméno, e-mail, heslo
- **Krok 2:** pohlaví, věk, výška, váha
- **Krok 3:** aktivita, stres, typ práce, cíl, frekvence cvičení
- **Krok 4:** strava a omezení (volitelné) – diet_type, dietary_restrictions

### Habit tracker (aktuálně)
- Fixní seznam 12 pozitivních + 5 negativních návyků
- Zobrazení: jeden den, přepínač ◀ ▶
- Bubliny s emoji, ○/✓, label – klik = toggle pro vybraný den

### HabitEntryWizard
- Proklikávací průvodce s bublinami (pouze zobrazení)
- Žádný výběr návyků – jen úvod

---

## 3. Co je potřeba změnit

### 3.1 Nová tabulka: `user_habits` (výběr návyků uživatele)

```sql
CREATE TABLE user_habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  habit_id text NOT NULL,
  is_positive boolean NOT NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, habit_id)
);
```

- Ukládá, které návyky si uživatel vybral
- `is_positive` = true (pozitivní) / false (zlozvyk)

### 3.2 Logika předvybrání z registrace

| Pole z body_metrics | Předvybrané návyky |
|--------------------|--------------------|
| `goal = redukce` | healthy_diet, junk_food (zlozvyk), quality_sleep |
| `goal = nabirani_svaly` | training, healthy_diet, quality_sleep |
| `stress_level = high` | meditation, breathing, quality_sleep |
| `activity = sedavy` | daily_movement, training |
| `dietary_restrictions` obsahuje „kouř“ / „alkohol“ | smoking, alcohol (zlozvyky) |
| `notes` – heuristika | např. „cukr“ → junk_food |

### 3.3 HabitEntryWizard – krok výběru návyků

- **Nový krok** (např. krok 2): „Vyber si návyky, které chceš sledovat“
- Checkboxy pro všechny pozitivní + zlozvyky
- Některé předvybrané podle body_metrics
- Po „Další“ → uložit do `user_habits` (API POST)
- Uživatel může později upravit v nastavení profilu

### 3.4 HabitTracker – mřížka místo bublin

**Layout:**
```
         | Po 20.2. | Út 21.2. | St 22.2. | Čt 23.2. | Pá 24.2. | ...
---------|----------|----------|----------|----------|----------|----
🏋️ Trénink    |    ○     |    ✓     |    ○     |    ✓     |    ○     |
🚶 Denní pohyb |    ✓     |    ○     |    ✓     |    ✓     |    ○     |
...
🚬 Kouření    |    ✓     |    ○     |    ✓     |    ✓     |    ✓     |
```

- **Y (řádky):** návyky z `user_habits` (nebo výchozí, pokud prázdné)
- **X (sloupce):** dny (např. 7–14 dní dopředu i dozadu od dneška)
- **Buňka:** ○ / ✓ – klik = toggle, volá POST /api/habits
- Horizontální scroll na mobilu

### 3.5 API změny

| Endpoint | Změna |
|----------|-------|
| `GET /api/habits` | Přidat `?habit_ids=...` nebo načítat jen z user_habits; rozšířit rozsah `from`–`to` pro více dní |
| `GET /api/user-habits` | Nový – vrátí výběr návyků uživatele |
| `POST /api/user-habits` | Nový – uložit výběr (replace) |
| `POST /api/habits` | Beze změny – stále log_date, habit_id, completed |
| Profile API | Přidat `user_habits` do odpovědi (nebo volat zvlášť) |

### 3.6 Body-metrics API

- Při registraci (nebo při prvním přihlášení ON Club/VIP) volat funkci pro předvybrání návyků
- Alternativa: předvybrání až v HabitEntryWizard na klientu podle dat z profilu

### 3.7 Migrace pro existující uživatele

- Uživatelé bez záznamu v `user_habits` → zobrazit všechny návyky (jako dnes) nebo vynutit výběr při prvním zobrazení

---

## 4. Soubory k úpravě

| Soubor | Změna |
|--------|-------|
| `supabase/migrations/` | Nová migrace pro `user_habits` |
| `lib/habits.js` | Funkce `getSuggestedHabits(bodyMetrics)` – předvybrání z registrace |
| `pages/api/user-habits.js` | Nový – GET, POST |
| `pages/api/profile.js` | Volitelně vracet `user_habits` nebo `suggested_habits` |
| `components/HabitEntryWizard.js` | Přidat krok výběru návyků s checkboxy, předvyplnit podle profilu |
| `components/HabitTracker.js` | Přepsat na mřížku (řádky = návyky, sloupce = dny), načítat z user_habits |
| `pages/api/habits.js` | Rozšířit GET o rozsah více dní (from–to), validovat habit_id proti user_habits |

---

## 5. Pořadí implementace

1. Migrace `user_habits`
2. API `user-habits` (GET, POST)
3. `getSuggestedHabits(bodyMetrics)` v lib/habits.js
4. HabitEntryWizard – krok výběru návyků
5. HabitTracker – mřížka (Y = návyky, X = dny)
6. Propojení s profilem (načtení body_metrics pro předvybrání)
7. Volitelně: nastavení v profilu pro úpravu výběru návyků

---

## 6. Shrnutí

| Požadavek | Řešení |
|-----------|--------|
| Návyky pod sebou, dny na ose X | Mřížka: řádky = návyky, sloupce = dny |
| Odškrtávání splněno/nesplněno | Klik na buňku = toggle, POST /api/habits |
| Výběr na začátku | Nový krok v HabitEntryWizard, uložení do user_habits |
| Předdefinované z registrace | getSuggestedHabits(body_metrics) → předvybrat v wizardu |
