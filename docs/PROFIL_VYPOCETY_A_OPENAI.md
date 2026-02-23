# Profil – výpočty z tréninku a role OpenAI

## 1. Ověření výpočtů

- **7700 kcal ≈ 1 kg tělesného tuku** – standardní hodnota v nutriční vědě (energetická hodnota tuku včetně vody a bílkovin v tkáni). Zdroj: FAO, odborná literatura o hubnutí. ✅ V kódu používáno správně.
- **kcal/min podle typu tréninku** – odhady odpovídají běžným údajům: kardio cca 8 kcal/min (běh mírným tempem), silový 4–7 kcal/min (v kódu 5), strečink/jóga nižší (2,5 resp. 3). Slouží pouze k orientačnímu odhadu; skutečný výdej závisí na váze a intenzitě. ✅ Konstanty v `profil.js` jsou v pořádku.
- **Týden Po–Ne** a kumulativní odhad váhy z tréninků jsou konzistentní s výše uvedenými vzorci.

---

## 2. Stav deploye

Změny jsou v repozitáři na `main` (working tree je čistý). **Produkce** (Vercel) se nasazuje z `main` – po každém pushi. Bez commitu nelze „dát do produkce“ nové změny; aktuální stav v repo = aktuální stav v produkci.

---

## 3. Kde se na profilu počítají hodnoty z tréninku a na základě čeho

**Stránka:** [https://app.bodyandmindon.cz/profil](https://app.bodyandmindon.cz/profil)  
**Zdroj dat:** API `GET /api/profile` vrací `workouts`, `body_metrics`, `plans`, `weight_history`, `stats`. Data z tabulek Supabase: `workouts`, `body_metrics`, `ai_generated_plans`.

### 2.1 Odhad spálených kalorií z jednoho tréninku

V **`pages/profil.js`**:

- **Funkce:** `estimatedCalories(workout)`
- **Vzorec:** `duration_min × kcal_per_min` podle typu tréninku.
- **Konstanty** (`KCAL_PER_MIN_BY_TYPE`):

| Typ       | kcal/min |
|----------|----------|
| Silový   | 5        |
| Kardio   | 8        |
| Strečink | 2,5      |
| Jóga     | 3        |
| Ostatní  | 4        |

Příklad: 45 min kardio → 45 × 8 = **360 kcal**.

### 2.2 Týdenní hodnoty

- **Týden:** pondělí–neděle (ISO týden, `weekStartStr` = pondělí aktuálního týdne).
- **Počet tréninků tento týden:** `workoutsThisWeek` = počet záznamů z `workouts` s `workout_date >= weekStartStr`.
- **Minuty tento týden:** součet `duration_min` za tréninky v tomto týdnu.
- **Kcal tento týden:** `estimatedCaloriesThisWeek` = součet `estimatedCalories(workout)` za tréninky v tomto týdnu.

### 2.3 Celkové odhady (od začátku)

- **Celkem spáleno (kcal):** `estimatedCaloriesAll` = součet `estimatedCalories(workout)` přes **všechny** tréninky uživatele.
- **Konstanta:** 1 kg tělesného tuku ≈ 7700 kcal (`KCAL_PER_KG = 7700`).
- **Odhad úbytku váhy z tréninků:** `estimatedKgLostTotal = estimatedCaloriesAll / 7700` (v kg).
- **Výchozí váha:** z prvního záznamu v `body_metrics` (registrace na `/start`) nebo z `user.start_weight_kg` (Nastavení).
- **Odhadovaná aktuální váha (z tréninků):**  
  `estimatedCurrentWeight = startWeight - estimatedKgLostTotal`,  
  s dolní hranicí `goalWeight`, pokud je v Nastavení vyplněná.
- **Graf „váha“:** body grafu jsou **pouze z tréninků** – po každém dni, kdy byl zapsaný trénink, se kumulují spálené kcal a počítá se  
  `váha = startWeight - (kumulativní kcal / 7700)`,  
  bez použití ručně zadané váhy z měření.

### 2.4 Co do výpočtů na profilu nezasahuje

- **Ruční váha** (záznamy z „Přidat váhu“ / `body_metrics`) se v těchto odhadech **nepoužívá**. V UI je to uvedeno: *„Všechny hodnoty vycházejí jen z tréninků a z tvého nastavení (výchozí váha, cíl, výška). Ruční váha do výpočtu nezasahuje.“*
- Cílová váha a výška z **Nastavení** slouží k zobrazení cíle a k zaokrouhlení odhadované váhy (cap na `goalWeight`), ne k samotnému výpočtu spálených kcal.

---

## 4. Jak v tom hraje OpenAI (AI asistent)

### 3.1 V profilu se OpenAI nevolá

- Profil pouze **načítá a zobrazuje** data: tréninky z `workouts`, plán z `ai_generated_plans.plan_html`, váhu z `body_metrics` atd.
- Žádné volání OpenAI API ani „asistenta“ na stránce `/profil` ani v API `/api/profile` není.

### 4.2 Kde OpenAI v aplikaci je

| Místo | Účel |
|-------|------|
| **`lib/generatePlan.js`** | Po registraci na `/start` se uloží metriky do `body_metrics`, pak se zavolá `generatePlanForEmail()` → **OpenAI API** (GPT) vygeneruje HTML plán (jídelníček, recepty, trénink, nákup, mindset). Výsledek se uloží do `ai_generated_plans` a odešle e-mailem. |
| **`pages/api/recipe.js`** | Volá **OpenAI API** (např. při „swap receptu“ nebo doplnění receptu v aplikaci). |
| **`docs/ASISTENT_OPENAI_JIDELNICEK.md`** | Popisuje **externího asistenta** (Custom GPT / Instructions), který vrací JSON s jídelníčkem, makry, HTML. Tento asistent **není** v aktuálním flow použit na `/start` ani v profilu – plán v profilu je vždy z `generatePlan.js` a tabulky `ai_generated_plans`. |

### 4.3 Shrnutí role „AI“ vůči profilu

- **Generování plánu:** AI (OpenAI v `generatePlan.js`) vytvoří plán **jednou** po registraci; ten se uloží a v profilu se jen zobrazuje.
- **Hodnoty z tréninku na profilu:** Počítají se **čistě v kódu** z `workouts` (typ + délka) pomocí konstant kcal/min a 7700 kcal/kg. Žádný AI ani asistent v těchto výpočtech nefiguruje.
