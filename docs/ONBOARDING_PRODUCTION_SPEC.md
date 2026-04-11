# Onboarding API – Production Specification

---

## 1. Fixed Input Contract

### Povinná pole

| Pole | Typ | Rozsah | Popis |
|------|-----|--------|-------|
| `goal` | `string` | enum | `redukce` \| `nabirani_svaly` \| `udrzovani` |
| `meals_per_day` | `number` | 2–6 | Počet jídel denně |
| `workouts_per_week` | `number` | 0–7 | Počet tréninků týdně |

### Volitelná pole

| Pole | Typ | Rozsah | Výchozí | Popis |
|------|-----|--------|---------|-------|
| `preferred_workout_days` | `number[]` | 0–6 každý | viz algoritmus | Preferované dny (0=Ne, 1=Po, …, 6=So) |
| `diet_type` | `string` | enum | `standard` | `standard` \| `vegetarian` \| `vegan` |
| `gender` | `string` | enum | – | `male` \| `female` \| `other` |
| `age` | `number` | 10–120 | – | Věk |
| `height_cm` | `number` | 100–250 | – | Výška v cm |
| `weight_kg` | `number` | 30–300 | – | Váha v kg |
| `activity_level` | `string` | enum | – | `sedentary` \| `light` \| `moderate` \| `active` \| `very_active` |
| `allergies` | `string` | max 500 znaků | `""` | Alergie (pro Spoonacular excludeIngredients) |
| `dietary_restrictions` | `string` | max 500 znaků | `""` | Dietní omezení |
| `foods_to_avoid` | `string` | max 500 znaků | `""` | Potraviny k vynechání |
| `fitness_level` | `string` | enum | `beginner` | `beginner` \| `intermediate` \| `advanced` |
| `equipment` | `string[]` | – | `["bodyweight"]` | Dostupné vybavení |
| `workout_duration_min` | `number` | 15–120 | 45 | Délka tréninku v minutách |

### Odvození workout days

**Pravidlo:** `workout_days` (použité v plánu) = prvních `workouts_per_week` prvků z `preferred_workout_days`, nebo výchozí rozložení.

```
FUNKCE derive_workout_days(workouts_per_week, preferred_workout_days):
  IF workouts_per_week = 0:
    RETURN []
  
  DEFAULT_DAYS = {
    1: [3],           // Středa
    2: [1, 4],        // Po, Čt
    3: [1, 3, 5],     // Po, St, Pá
    4: [1, 2, 4, 5],  // Po, Út, Čt, Pá
    5: [1, 2, 3, 4, 5],
    6: [1, 2, 3, 4, 5, 6],
    7: [0, 1, 2, 3, 4, 5, 6]
  }
  
  IF preferred_workout_days je neprázdné pole:
    RETURN preferred_workout_days[0 : workouts_per_week]
  
  RETURN DEFAULT_DAYS[workouts_per_week] NEBO první workouts_per_week z [1,2,3,4,5,6]
```

**Zakázáno:** Pole `workout_days` v inputu – používá se pouze odvozené `derive_workout_days()`.

### Pravidla souhry jídel a tréninku (produkt)

Tato pravidla popisují **záměr produktu** a očekávání vůči výstupu LLM. Runtime kromě strukturované validace (`validateStructuredPlan`) **automaticky nepropojuje** kalorie jednotlivých dnů s konkrétním tréninkem (žádný post-process „leg day → více sacharidů“).

1. **Kalorie a makra vs tréninkové dny**  
   Hodnoty `targets` (např. `calories_per_day`, `protein_g`) jsou **jednotný denní cíl** pro celý týden. Nevyžaduje se automatické denní přepočítávání podle toho, zda jde o tréninkový nebo klidový den; případné rozlišení má vzniknout v návrhu jídel z modelu, ne ve vynucené úpravě JSON po generování.

2. **Bílkoviny**  
   Denní `protein_g` má odpovídat cíli a profilu. Tréninkové dny nemusí mít v JSON vyšší explicitní protein, pokud to model nezapracuje do skladby jídel.

3. **Vybavení**  
   Pole `equipment` z profilu má být **respektováno v promptu** (`planOrchestrator`). Po obohacení plánu `validateStructuredPlan` může přidat **měkká varování** (heuristika klíčových slov v názvu cviku vs profil) — viz `lib/validation/mealTrainingCoherence.js` a `structuredPlanValidators.js`.

4. **Shoda s profilem (struktura)**  
   Počet jídel na každý den = `meals_per_day`. Počet dnů s neprázdným blokem `workout` a aspoň jedním cvikem = `workouts_per_week` (0 znamená žádný trénink). Na každém tréninkovém dni alespoň jeden cvik s platným názvem — viz `lib/validation/structuredPlanValidators.js`.

5. **Název jídla vs. obsah receptu (Spoonacular)**  
   Po `recipe_verified === true` je uživatelský název (`display_name_cs`) **přeložený titul receptu ze Spoonacular** (batch + cache v `recipeLocalization`), aby odpovídal surovinám a postupu v popupu. Původní `name_cs` / `ai_name` z plánovače zůstává v poli `planner_suggestion_cs` pro diagnostiku. Vyhledávání v rámci jednoho plánu se **deduplikuje** podle `(spoonacular_query, type, normalizovaný name_cs)` — stejný anglický dotaz u dvou různých českých názvů spustí dvě volání a může vrátit dva recepty.

---

## 2. Fallback a zdroje plánu (skutečné chování kódu)

### OpenAI a formáty

- Vestavěný prompt v `lib/services/planOrchestrator.js` žádá JSON s obalem **v5** (`meal_plan`, `workout_plan`, `targets`), ale u jídel a cviků **stejná pole jako ve v6**: u jídel `name_cs` + `spoonacular_query` (nebo `search_query`), u cviků `name_cs`, `search_term`, volitelně `canonical_key`. Po `resolveMeals` viz bod **§1.5** (titul receptu vs. `planner_suggestion_cs`).
- `lib/validation/parseStructuredPlan.js` umí navíc formát **v6** (`_format: 'v6'`, kořenové `days[]`). Po úspěšném parsování v6 běží `enrichAgentPlanV6` (`lib/services/planOrchestrator_newFormat.js`) se stejným `resolveMeals` / `resolveWorkouts` jako legacy větev. Kořenové `days[]` z vestavěného OpenAI volání se běžně neočekávají — model vrací `meal_plan` / `workout_plan`, parser je převede na v5.

### Kdy OpenAI selže nebo chybí část plánu

- OpenAI: až 2 pokusy; při nevalidním JSON / chybě parsování je výsledek `null` a pokračuje se náhradními kroky níže.
- **`meal_plan` chybí** (nebo nebyl získán z OpenAI): doplní se `buildProfileTemplateMealPlan` v `lib/services/deterministicFallback.js` — pro každý slot jídla krátký generický anglický dotaz (`{diet} {meal_type} balanced`), nikoli plná rotace tabulek `MEAL_QUERIES`. Spoonacular resolve běží dál nad těmito dotazy.
- **`workout_plan.days` chybí nebo je prázdné** a `workouts_per_week > 0`: orchestrátor zavolá **`getDeterministicWorkoutPlan`** (`deriveWorkoutDays` + rotace `WORKOUT_BLOCKS` z `deterministicFallback.js`), aby každý tréninkový den měl `search_term` pro wger. Pokud model vrátí `workout_plan` s dny, ale některé dny mají prázdné `exercises`, tato větev se nespouští — řešení je na kvalitě vstupu / v6.

### Exporty `getDeterministicMealPlan` / `getDeterministicWorkoutPlan`

`getDeterministicWorkoutPlan` **používá** `generateStructuredPlan`, když chybí platné `workout_plan.days`. **`getDeterministicMealPlan`** (plná rotace `MEAL_QUERIES` po dnech) orchestrátor při chybějícím `meal_plan` **nepoužívá** — místo toho `buildProfileTemplateMealPlan`.

### Diagnostika `generation_source`

V `_diagnostics.generation_source` je `openai`, pokud OpenAI vrátilo parsovatelný strukturovaný plán (i když část plánu mohla být následně doplněna šablonou jídel). Pokud OpenAI vypnuto nebo vždy selhalo, zůstává logika náhrad výše; přesná hodnota `generation_source` vždy odpovídá stavu v `planOrchestrator.js` (viz `generationSource`).

---

## 3. Final API Schemas

### Request Schema (POST /api/onboarding/generate-plan)

```json
{
  "user_id": "uuid?",
  "body_metrics": {
    "goal": "redukce",
    "meals_per_day": 3,
    "workouts_per_week": 3,
    "preferred_workout_days": [1, 3, 5],
    "diet_type": "standard",
    "gender": "male",
    "age": 30,
    "height_cm": 180,
    "weight_kg": 85,
    "activity_level": "moderate",
    "allergies": "",
    "dietary_restrictions": "",
    "foods_to_avoid": "",
    "fitness_level": "intermediate",
    "equipment": ["dumbbells", "bodyweight"],
    "workout_duration_min": 45
  }
}
```

### Response Schema (200 OK)

```json
{
  "ok": true,
  "plan_id": "uuid?",
  "valid_from": "YYYY-MM-DD",
  "valid_until": "YYYY-MM-DD",
  "targets": {
    "calories_per_day": 2000,
    "protein_g": 120,
    "carbs_g": 220,
    "fat_g": 65
  },
  "workouts_per_week": 3,
  "workout_days": [1, 3, 5],
  "days": [
    {
      "date": "YYYY-MM-DD",
      "day_index": 0,
      "day_name": "Pondělí",
      "meals": [
        {
          "type": "breakfast",
          "display_name": "string",
          "recipe": { "id", "title", "image", "sourceUrl", "readyInMinutes", "calories", "protein_g", "carbs_g", "fat_g", "source" } | null
        }
      ],
      "workout": {
        "day_index": 1,
        "duration_minutes": 45,
        "exercises": [
          {
            "name": "string",
            "sets": 3,
            "reps": "10-12" | null,
            "duration_sec": null | number,
            "image_url": "string" | null,
            "video_url": "string" | null,
            "source": "wger",
            "wger_exercise_id": number | null
          }
        ]
      } | null
    }
  ],
  "_diagnostics": {
    "generation_source": "openai" | "fallback",
    "meals_resolved": 21,
    "meals_fallback": 0,
    "exercises_resolved": 15,
    "exercises_fallback": 0
  },
  "plan_html": "string (HTML plánu, volitelné pro klienty)",
  "_validation": { "ok": true, "warnings": ["..."] } | null
}
```

### Error Response Schema

```json
{
  "ok": false,
  "error": "Human-readable message",
  "code": "VALIDATION_ERROR" | "OPENAI_ERROR" | "SPOONACULAR_ERROR" | "INTERNAL_ERROR",
  "details": { "field": "validation message" } | null,
  "_request_id": "uuid?"
}
```

### Validation Rules

| Pole | Pravidlo | Chyba |
|------|----------|-------|
| body_metrics | required, object | `body_metrics je povinné` |
| goal | enum | `goal musí být redukce, nabirani_svaly nebo udrzovani` |
| meals_per_day | 2–6 | `meals_per_day musí být 2–6` |
| workouts_per_week | 0–7 | `workouts_per_week musí být 0–7` |
| preferred_workout_days | každý 0–6 | `preferred_workout_days musí obsahovat čísla 0–6` |
| diet_type | enum | `diet_type musí být standard, vegetarian nebo vegan` |
| age | 10–120 | `věk mimo rozsah 10–120` |
| height_cm | 100–250 | `výška mimo rozsah 100–250 cm` |
| weight_kg | 30–300 | `váha mimo rozsah 30–300 kg` |

### Strukturovaný plán po generování (`validateStructuredPlan`)

Unified pipeline (`lib/unifiedPlanPipeline.js`) volá `validateStructuredPlan(planJson, bm)` z `lib/validation/structuredPlanValidators.js` **před** renderem HTML. Tvrdé chyby zastaví pipeline (např. nesoulad s profilem nebo dietní pravidla v textu jídel):

| Kontrola | Typ | Popis |
|----------|-----|--------|
| 7 dní v `days` | tvrdé | přesně sedm položek |
| `meals_per_day` | tvrdé | každý den má stejný počet jídel jako odvozený z `body_metrics` (`bodyMetricsToPlanInput`) |
| `workouts_per_week` | tvrdé | počet dnů s `workout != null` = očekávaný počet z profilu; 0 tréninků = žádný den s tréninkem |
| cviky na tréninkovém dni | tvrdé | `workout.exercises` neprázdné; každý cvik má neprázdný `name` / `display_name_cs` |
| neověřené cviky (wger) | měkké | varování, pokud jsou na daném dni všechny cviky s `exercise_verified === false` |
| vegetariánství / veganství, lepek | tvrdé | stejně jako dříve (text jídel) |
| rozsah kalorií / bílkovin v `targets` | měkké | mimo běžný rozsah → varování |

### Enum Values

- `goal`: `redukce` | `nabirani_svaly` | `udrzovani`
- `diet_type`: `standard` | `vegetarian` | `vegan`
- `gender`: `male` | `female` | `other`
- `activity_level`: `sedentary` | `light` | `moderate` | `active` | `very_active`
- `fitness_level`: `beginner` | `intermediate` | `advanced`
- `meal_type`: `breakfast` | `lunch` | `dinner` | `snack`

### Retry Strategy

| Komponenta | Retry | Backoff | Max attempts |
|------------|-------|---------|--------------|
| OpenAI | Ano | 0 (okamžitě) | 2 |
| Spoonacular | Ano | 1s | 2 |
| wger | Ano | 0 | 2 |

### Caching Strategy

| Entita | Cache | TTL |
|--------|-------|-----|
| Meal (Spoonacular) | meal_metadata_cache (existující) | exact: ∞, illustrative: 7d, none: 3d |
| Exercise (wger / canonical) | `exercise_asset_registry` (Supabase) pro známé `canonical_key`; živé dotazy na wger.de | dle řádku v DB; doplnění médií může zapisovat zpět do registry |
| Generated plan | ai_generated_plans (DB) | Trvalé pro uživatele |

### Replace Meal Flow

**POST /api/onboarding/replace-meal**

```json
Request: { "plan_id": "uuid", "date": "YYYY-MM-DD", "meal_type": "breakfast", "hint_query": "optional" }
Response: { "ok": true, "meal": { ... } }
```

1. Načíst plán (nebo z cache)
2. Získat původní search_query pro daný den + meal_type
3. Volitelně: pokud `hint_query`, použít jako alternativu
4. Spoonacular search → vybrat nejlepší recept
5. Vrátit nové meal
6. (Volitelně) aktualizovat uložený plán

### Replace Workout Flow

**POST /api/onboarding/replace-workout**

```json
Request: { "plan_id": "uuid", "date": "YYYY-MM-DD", "hint_focus": "upper body" }
Response: { "ok": true, "workout": { ... } }
```

1. Načíst plán
2. Získat původní exercise queries pro daný den
3. Volitelně: pokud `hint_focus`, vybrat jiný blok (upper/lower/full)
4. wger resolve pro každý search_term
5. Vrátit nový workout
6. (Volitelně) aktualizovat uložený plán

---

## 4. Service Responsibilities

### wgerService (lib/services/wgerService.js)

- **Primární provider** pro cviky
- `searchExercise(term)` → exercise ID
- `getExerciseImage(exerciseId)` → image URL
- `getExerciseVideo(exerciseId)` → video URL
- `resolveExercise(term)` → { name, image_url, video_url, wger_exercise_id }
- **Žádná závislost** na ExerciseDB/Pexels – čistý wger

### exerciseProviderRegistry (lib/services/exerciseProviderRegistry.js)

- **Účel:** Resolve cviků – pouze wger.de
- **Žádný secondary provider** – žádný RapidAPI, ExerciseDB ani Pexels

### spoonacularService (lib/services/spoonacularService.js)

- `searchRecipe(query, opts)` → recept nebo null
- Filtry: diet, excludeIngredients
- Retry při 429

### planOrchestrator (lib/services/planOrchestrator.js)

- Validace inputu
- Volání OpenAI (s retry); parsování přes `parseStructuredPlan` (legacy + v6)
- Náhrada chybějícího `meal_plan`: `buildProfileTemplateMealPlan`; chybějící `workout_plan.days` při `workouts_per_week > 0`: `getDeterministicWorkoutPlan` (viz §2)
- Resolve meals (Spoonacular)
- Resolve exercises (wger + `exerciseProviderRegistry` / registry)
- Sestavení finálního plánu
- Logging

### API Route Handler (pages/api/onboarding/generate-plan.js)

- Parsing body, `validateBodyMetrics`
- **`runUnifiedPlanPipeline`** (jako `/api/generate-plan`): `generateStructuredPlan` → `validateStructuredPlan` → `renderPlanHtmlFromStructured`
- Odpověď 200: pole z `planJson` (`days`, `targets`, `_diagnostics`, …) + **`plan_html`**, **`_validation`** (měkká varování)
- Chyba validace plánu vůči profilu: **422**, `code: PLAN_VALIDATION_ERROR`, `details.validation`

---

## 5. Replace Flows

### Replace Meal – sekvence

```
1. Validate: plan_id, date, meal_type
2. Load plan (from session/DB/cache)
3. Find day by date
4. Get current search_query for meal_type (from plan metadata or fallback table)
5. If hint_query provided, use it; else use original
6. spoonacularService.searchRecipe(query, diet)
7. If null: try shortened query (first 3 words)
8. Return { meal } or { error: "Recept nenalezen" }
```

### Replace Workout – sekvence

```
1. Validate: plan_id, date
2. Load plan
3. Find day by date
4. Get exercise queries (from plan or fallback block by day_index)
5. If hint_focus: select different block (upper/lower/full)
6. For each exercise: wgerService.resolveExercise(term)
7. Return { workout } or { error: "Cviky nenalezeny" }
```

---

## 6. Production Improvements

### Logging

- `[onboarding]` prefix pro všechny logy
- Request ID (uuid) v každém requestu
- Log: start, OpenAI result/fallback, resolve counts, duration, errors
- Nepřihlašovat PII (váha, věk OK pro diagnostiku, ne email)

### Input Validation

- Centralizovaná validace v `lib/validation/onboardingSchema.js`
- Zod nebo ruční validace s přesnými chybovými hláškami
- Return 400 s `details: { field: "message" }`

### Structured OpenAI Output Parsing

- `lib/validation/parseStructuredPlan.js`
- Kontrola: targets, meal_plan.days.length=7, workout_plan.days (legacy); nebo v6 `days[]`
- Pokud OpenAI nevrátí použitelný JSON → náhrada dle § 2 (šablona jídel; deterministický workout, pokud chybí `workout_plan.days`)
- Strip neznámých polí

### Graceful Degradation

| Selhání | Chování |
|--------|---------|
| OpenAI | Šablona jídel + deterministický workout (`getDeterministicWorkoutPlan`), pokud chybí `workout_plan.days`; log warning |
| Spoonacular pro 1 meal | recipe: null, display_name: search_query |
| Spoonacular celé | Všechna jídla s recipe: null |
| wger pro 1 exercise | image_url: null, name: search_term |
| wger celé | Všechny cviky bez obrázků |

### Frontend Weekly Planner – struktura odpovědi

- `days` vždy 7 položek (od valid_from)
- Každý den: `date`, `day_index`, `day_name`, `meals[]`, `workout | null`
- `workout_days` – které dny mají trénink (pro highlight v UI)
- `targets` – pro zobrazení cílů
- Konzistentní typy (null místo undefined)
