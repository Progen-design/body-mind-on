# Analýza a návrh profilu Body & Mind ON

## 1. Současný stav

**Stránka `/profil`** (a alternativní `/dashboard`) zobrazuje:
- E-mail a odhlášení
- Seznam záznamů z `body_metrics` (datum, váha, výška, cíl, …)
- Žádná vizualizace pokroku, žádný zápis tréninků

**Dostupná data:**
- `body_metrics` – váha, výška, věk, aktivita, stres, cíl, frekvence, datum
- `ai_generated_plans` – plány s makroživinami, kaloriemi, platností

**Chybějící data:**
- Záznamy jednotlivých tréninků
- Série historie váhy pro graf pokroku
- Aktivní cíle (např. „splnil jsem 4/5 tréninků tento týden“)

---

## 2. Cílové funkce

### 2.1 Vizualizace pokroku
| Funkce | Popis |
|--------|--------|
| **Graf váhy** | Časová osa váhy z `body_metrics` – zobrazit trend (klesá / roste / stagnace) |
| **Týdenní přehled** | Kolik tréninků tento týden, kalorie dodržené, makra |
| **Streak** | Počet po sobě jdoucích týdnů s alespoň X tréninky |
| **KPI karty** | „Tento týden 3 tréninky“, „Váha −1,2 kg od začátku“ |

### 2.2 Záznam tréninků
| Funkce | Popis |
|--------|--------|
| **Rychlý zápis** | Tlačítko „Zapsat trénink“ → datum, typ (silový / kardio / strečink), délka (min), poznámka |
| **Historie tréninků** | Seznam s filtrováním (týden / měsíc), editace, smazání |
| **Integrace s plánem** | Zobrazení „Dnes máš v plánu XY“ z AI plánu |

### 2.3 Další vylepšení
- Rychlé přidání váhy (bez celého dotazníku)
- Zobrazení aktuálního AI plánu (náhled HTML)
- Čitelný, moderní design – tmavý motiv, gradienty, ikony
- Responzivita pro mobil

---

## 3. Datový model

### Nová tabulka `workouts`
```sql
create table workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  workout_date date not null,
  workout_type text not null,  -- 'silovy' | 'kardio' | 'strečink' | 'joga' | 'ostatni'
  duration_min int,
  notes text,
  created_at timestamptz default now()
);

create index workouts_user_date on workouts(user_id, workout_date desc);
alter table workouts enable row level security;
create policy "Users can CRUD own workouts" on workouts for all using (auth.uid() = user_id);
```

### Využití stávajících dat
- **Graf váhy**: z `body_metrics` – `weight_kg`, `created_at` (řazeno podle data)
- **Počáteční váha**: první záznam z body_metrics
- **Cíl z plánu**: z `ai_generated_plans` (goal → redukce = snižovat váhu, nabirani = zvyšovat)

---

## 4. Architektura řešení

```
[Profil stránka]
    │
    ├─ Hero + uvítání
    │
    ├─ Sekce: Přehled pokroku
    │   ├─ 4× KPI karta (váha trend, tréninky tento týden, streak, splněné cíle)
    │   └─ Graf váhy (line chart, posledních 30–90 dní)
    │
    ├─ Sekce: Rychlé akce
    │   ├─ [+ Zapsat trénink] modal
    │   └─ [+ Přidat váhu] modal (jen váha + datum)
    │
    ├─ Sekce: Historie tréninků
    │   └─ Seznam s datumem, typem, délkou, poznámkou
    │
    ├─ Sekce: Moje metriky (stávající, vylepšený vzhled)
    │
    └─ Sekce: Můj plán (AI plán, rozbalitelné)
```

---

## 5. Design – vizuální styl

- **Pozadí**: tmavý gradient (#0a021f → #0a0a0f)
- **Karty**: zaoblené, jemný border, hover efekty
- **Akcenty**: fialová (#9b5cff), zelená (#22c55e), tyrkys (#0EA5E9)
- **Typografie**: čistý sans-serif, hierarchie nadpisů
- **Ikony**: jednoduché SVG nebo emoji pro rychlé rozpoznání (🏋️ trénink, ⚖️ váha, 📈 pokrok)
- **Graf**: jednoduchý line chart (CSS nebo lehká knihovna např. recharts / lightweight-charts)

---

## 6. API endpointy

| Metoda | Endpoint | Popis |
|--------|----------|--------|
| GET | `/api/workouts` | Seznam tréninků uživatele (query: from, to, limit) |
| POST | `/api/workouts` | Přidat trénink (workout_date, workout_type, duration_min, notes) |
| DELETE | `/api/workouts?id=...` | Smazat trénink |
| POST | `/api/body-metrics/quick` | Rychlé přidání váhy (weight_kg, date) – volitelné rozšíření |

---

## 7. Jak spustit migraci (workouts tabulka)

**Chyba „Could not find duration_min column“:** Pokud už máš tabulku `workouts` bez sloupce `duration_min`, spusť v Supabase SQL Editoru:
`supabase/migrations/20250219_fix_workouts_duration.sql`

V Supabase Dashboard → SQL Editor spusť obsah souboru:
`supabase/migrations/20250219_create_workouts.sql`

Nebo ručně:
```sql
CREATE TABLE workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_date date NOT NULL,
  workout_type text,
  duration_min int,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_workouts_user_date ON workouts (user_id, workout_date DESC);
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own workouts" ON workouts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

---

## 8. Implementační pořadí (hotovo)

1. **Fáze 1 – Databáze a API** ✅
   - Migrace pro tabulku `workouts` – soubor v `supabase/migrations/`
   - API `/api/workouts` (GET, POST, DELETE)

2. **Fáze 2 – UI profilu** ✅
   - Přepracování layoutu – hero, KPI karty, sekce
   - Rychlý formulář „Zapsat trénink“ (modal)
   - Seznam tréninků s mazáním

3. **Fáze 3 – Pokrok** ✅
   - Graf váhy (z body_metrics)
   - KPI: tréninky tento týden, celkem, aktuální váha, změna od začátku

4. **Fáze 4 – Doladění** (volitelně)
   - Integrace s plánem („dnes máš v plánu“)
   - Loading stavy, prázdné stavy, animace

---

## 8. Technické poznámky

- **Graf**: Pro jednoduchost lze použít CSS + HTML (flex, divy) nebo knihovnu jako `recharts` (React). Alternativa: čistý SVG.
- **Supabase RLS**: U `workouts` nutné policy `auth.uid() = user_id`.
- **Sjednocení profil vs dashboard**: Aktuálně existují `/profil` a `/dashboard` – doporučeno mít jednu stránku (např. `/profil`) a přesměrovat `/dashboard` na ni.
- **Tailwind**: Projekt nepoužívá Tailwind konzistentně – nový design bude v globals.css + inline styles / styled-jsx pro konzistenci s projektem.
