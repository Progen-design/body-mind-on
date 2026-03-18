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

---

## 2. Fallback Rules

### Kdy se použije deterministic fallback

- OpenAI vrátí nevalidní JSON
- OpenAI vrátí prázdný/neúplný plán
- OpenAI timeout nebo chyba
- Po 1× retry stále selhání

### Deterministic fallback – přesný algoritmus

**Vstup:** `goal`, `meals_per_day`, `workouts_per_week`, `preferred_workout_days`, `diet_type`, `weight_kg`

**Krok 1 – Targets (kalorie, makra):**

```
weight = weight_kg NEBO 70
IF goal = "redukce":
  calories = ROUND_DOWN(weight * 28 - 300, 50)
  protein = ROUND(weight * 1.8)
ELSE IF goal = "nabirani_svaly":
  calories = ROUND_UP(weight * 32 + 200, 50)
  protein = ROUND(weight * 2.0)
ELSE:
  calories = ROUND(weight * 30, 50)
  protein = ROUND(weight * 1.6)

fat = ROUND(calories * 0.28 / 9)
carbs = ROUND((calories - protein*4 - fat*9) / 4)
```

**Krok 2 – Meal queries (7 dní × meals_per_day):**

Tabulky jsou indexované `day_index` 0–6. Pro `meals_per_day = 3` použij breakfast, lunch, dinner. Pro 4 přidej snack. Pro 2 použij jen breakfast, lunch.

```
MEAL_TABLES[goal][diet_type][meal_type][day_index] = search_query

goal ∈ {redukce, nabirani_svaly, udrzovani}
diet_type ∈ {standard, vegetarian, vegan}
meal_type ∈ {breakfast, lunch, dinner, snack}
day_index ∈ 0..6
```

**Přesné tabulky (standard, 3 jídla):**

| day_index | breakfast | lunch | dinner |
|-----------|-----------|-------|--------|
| 0 | oatmeal banana eggs | chicken breast rice vegetables | grilled chicken vegetables |
| 1 | yogurt muesli fruit | grilled salmon potatoes salad | salmon salad |
| 2 | eggs whole grain toast | beef quinoa vegetables | turkey vegetables |
| 3 | cottage cheese fruit | turkey sweet potato | white fish vegetables |
| 4 | oatmeal pancakes fruit | fish rice salad | chicken stir fry |
| 5 | smoothie protein toast | chicken salad avocado | lean beef vegetables |
| 6 | omelette vegetables | lean meat vegetables | fish vegetables |

*(Pro vegetarian/vegan: substituce dle diet_type. Pro redukce: lehčí varianty. Pro nabirani_svaly: vyšší bílkoviny.)*

**Krok 3 – Workout queries:**

```
workout_days = derive_workout_days(workouts_per_week, preferred_workout_days)

WORKOUT_BLOCKS = [
  [ {search_term:"squat", sets:3, reps:"10-12"}, {search_term:"push up", sets:3, reps:"8-10"}, ... ],  // full body
  [ {search_term:"squat", sets:4, reps:"10"}, {search_term:"lunge", sets:3, reps:"10 per leg"}, ... ],   // lower
  [ {search_term:"push up", sets:4, reps:"8-10"}, {search_term:"bent over row", sets:3, reps:"10"}, ... ]  // upper
]

FOR i, day_index IN workout_days:
  block = WORKOUT_BLOCKS[i % 3]
  workout_plan.days.push({ day_index, exercises: block })
```

**Žádné generativní chování** – pouze lookup v pevných tabulkách.

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
  }
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
| Exercise (wger) | Žádný (veřejné API) | – |
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
- Volání OpenAI (s retry)
- Deterministic fallback
- Resolve meals (Spoonacular)
- Resolve exercises (wger)
- Sestavení finálního plánu
- Logging

### API Route Handler (pages/api/onboarding/generate-plan.js)

- Parsing body
- Input validation
- Volání orchestrátoru
- Error handling
- Response formatting

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
- Kontrola: targets, meal_plan.days.length=7, workout_plan.days
- Pokud nevalidní → deterministic fallback
- Strip neznámých polí

### Graceful Degradation

| Selhání | Chování |
|--------|---------|
| OpenAI | Deterministic fallback, log warning |
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
