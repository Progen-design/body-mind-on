# Habit Tracker – návrh řešení

## 1. Přehled

Habit tracker umožní uživatelům sledovat **pozitivní návyky** (splnil / nesplnil) a **negativní zlozvyky** (vyhnul se / nevyhnul se) denně. Data se ukládají do Supabase a zobrazují v profilu.

---

## 2. Definice návyků

### Pozitivní návyky (splnil = ✓)
| ID | Název | Emoji |
|----|-------|-------|
| `training` | Trénink | 🏋️ |
| `daily_movement` | Denní pohyb | 🚶 |
| `mobility_stretch` | Mobilita / Strečink | 🧘 |
| `meditation` | Meditace | 🧘‍♀️ |
| `breathing` | Dechové cvičení | 🌬️ |
| `quality_sleep` | Kvalitní spánek | 😴 |
| `digital_detox_evening` | Digitální detox večer | 📵 |
| `healthy_diet` | Zdravá strava | 🥗 |
| `hydration` | Pitný režim | 💧 |
| `cold_shower` | Studená sprcha | 🚿 |
| `reading` | Čtení / osobní rozvoj | 📚 |
| `gratitude` | Vděčnost | 🙏 |

### Negativní zlozvyky (vyhnul se = ✓)
| ID | Název | Emoji |
|----|-------|-------|
| `smoking` | Kouření | 🚬 |
| `alcohol` | Alkohol | 🍷 |
| `junk_food` | Junk food / průmyslový cukr | 🍔 |
| `social_media_scroll` | Nadměrné scrollování sociálních sítí | 📱 |
| `poor_sleep` | Nedostatek spánku | 😫 |

---

## 3. Databázové schéma

### Tabulka `habit_logs`

```sql
-- Habit logs – denní záznamy návyků uživatele
CREATE TABLE habit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  habit_id text NOT NULL,
  completed boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, log_date, habit_id)
);

-- Index pro rychlé načítání
CREATE INDEX idx_habit_logs_user_date ON habit_logs (user_id, log_date DESC);

-- RLS
ALTER TABLE habit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own habit_logs"
  ON habit_logs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

**Vysvětlení:**
- `habit_id` – jedno z výše uvedených ID (např. `training`, `smoking`)
- `completed` – u pozitivních = splnil, u negativních = vyhnul se (true = dobrý den)
- `UNIQUE(user_id, log_date, habit_id)` – jeden záznam na habit na den

---

## 4. API endpointy

### `GET /api/habits`
Načte logy pro dané období.

**Query parametry:**
- `from` (YYYY-MM-DD) – od data
- `to` (YYYY-MM-DD) – do data
- `habit_ids` (volitelné) – filtr na konkrétní návyky

**Odpověď:**
```json
{
  "logs": [
    {
      "id": "uuid",
      "log_date": "2025-02-20",
      "habit_id": "training",
      "completed": true,
      "notes": null,
      "created_at": "..."
    }
  ]
}
```

### `POST /api/habits`
Přidá nebo aktualizuje záznam (upsert).

**Body:**
```json
{
  "log_date": "2025-02-20",
  "habit_id": "training",
  "completed": true,
  "notes": "volitelně"
}
```

### `DELETE /api/habits?id=...`
Smaže záznam.

---

## 5. UI – návrh umístění

### Varianta A: Sekce v profilu (doporučeno)
Přidat novou sekci **„Můj den“** nebo **„Denní návyky“** do `profil.js` pod „Co chceš zapsat?“:

- **Dnešní datum** – horizontální řádek s návyky
- **Pozitivní** – zelené checkboxy (✓ = splnil)
- **Zlozvyky** – červené/oranžové checkboxy (✓ = vyhnul se)
- Klik na checkbox = toggle (splnil / nesplnil)
- Možnost přepínat datum (včera, předevčírem) pro doplnění

### Varianta B: Samostatná stránka `/habit-tracker`
- Kalendářní přehled týdne
- Klik na den → modal s návyky pro ten den
- Streak a statistiky (např. „7 dní v řadě bez kouření“)

### Doporučení
Začít s **Variantou A** – jednoduchá sekce v profilu, rychlá implementace. Variantu B přidat později jako rozšíření.

---

## 6. UI komponenta – wireframe

```
┌─────────────────────────────────────────────────────────────┐
│  Denní návyky · 20. 2. 2025                    [◀ Včera] [Dnes] [Zítra ▶]  │
├─────────────────────────────────────────────────────────────┤
│  Pozitivní návyky                                            │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐             │
│  │ 🏋️  │ │ 🚶  │ │ 🧘  │ │ 🧘‍♀️  │ │ 🌬️  │ │ 😴  │  ...       │
│  │  ✓  │ │  ○  │ │  ✓  │ │  ○  │ │  ○  │ │  ✓  │             │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘             │
│  Trénink  Pohyb  Strečink Meditace Dech  Spánek              │
├─────────────────────────────────────────────────────────────┤
│  Zlozvyky (vyhnul se = ✓)                                    │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                      │
│  │ 🚬  │ │ 🍷  │ │ 🍔  │ │ 📱  │ │ 😫  │                      │
│  │  ✓  │ │  ○  │ │  ✓  │ │  ○  │ │  ✓  │                     │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘                      │
│  Kouření Alkohol Junk food Scroll Nedostatek spánku           │
└─────────────────────────────────────────────────────────────┘
```

- **✓** = splnil (zelená) / vyhnul se (zelená)
- **○** = nesplnil (šedá) / nevyhnul se (červená/oranžová)

---

## 7. Implementační kroky

1. **Migrace** – vytvořit `habit_logs` v Supabase (SQL výše)
2. **API** – `pages/api/habits.js` (GET, POST, DELETE)
3. **Konstanty** – `lib/habits.js` – seznam habit_id, emoji, labely
4. **Komponenta** – `components/HabitTracker.js` – grid checkboxů, volba data
5. **Integrace** – přidat `<HabitTracker />` do `profil.js` do sekce „Denní návyky“
6. **Styly** – použít stávající design (tmavé pozadí, fialové akcenty, karty)

---

## 8. Volitelné rozšíření (později)

- **Streak** – „X dní v řadě bez kouření“
- **Graf** – týdenní přehled (heatmapa jako na GitHubu)
- **Vlastní návyky** – uživatel si přidá vlastní
- **Připomínky** – push notifikace večer „Jak jsi dnes na tom?“

---

## 9. Shrnutí

| Položka | Popis |
|---------|-------|
| Tabulka | `habit_logs` (user_id, log_date, habit_id, completed, notes) |
| API | GET/POST/DELETE `/api/habits` |
| UI | Sekce v profilu, grid checkboxů, přepínač datum |
| Návyky | 12 pozitivních + 5 negativních (fixní seznam) |

---

## 10. Nasazení (Varianta A – hotovo)

**Před prvním použitím** spusť v Supabase SQL Editoru migraci:

```
supabase/migrations/20250220_create_habit_logs.sql
```

Nebo zkopíruj a spusť obsah souboru ručně. Po vytvoření tabulky bude habit tracker v profilu fungovat.
