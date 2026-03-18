# Onboarding API Flow – Architektura a implementace

> **Production spec:** Viz [ONBOARDING_PRODUCTION_SPEC.md](./ONBOARDING_PRODUCTION_SPEC.md) pro finální input contract, validation, replace flows a production improvements.

**Princip:** OpenAI = mozek a personalizace. Spoonacular = reálné recepty a fotky. wger = reálné cviky a obrázky/videa. Backend = orchestrátor.

---

## 1. Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           POST /api/onboarding/generate-plan                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. VALIDATE INPUT (body_metrics / onboarding payload)                       │
│     - goal, gender, age, height, weight, activity, allergies, preferences      │
│     - meals_per_day, workouts_per_week, fitness_level, equipment, duration    │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. OPENAI – Structured Plan (JSON only, no recipes/exercises)                │
│     - meal_queries[]: { type, search_query, day_index }                       │
│     - workout_queries[]: { day_index, focus, muscles, equipment, duration }  │
│     - exercise_queries[]: { search_term, sets, reps, workout_day_ref }        │
│     - targets: { calories, protein, carbs, fat }                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. SPOONACULAR – Resolve each meal_queries[].search_query                    │
│     - complexSearch?query=X → pick best recipe by score                      │
│     - Fallback: try alternative query, then placeholder                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  4. WGER – Resolve each exercise_queries[].search_term                        │
│     - exercise-translation?search=X&language=2 → exerciseimage?exercise=ID   │
│     - video?exercise=ID (if available)                                       │
│     - Fallback: placeholder (žádný secondary provider)                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  5. ASSEMBLE – Merge OpenAI structure + Spoonacular + wger                   │
│     - Weekly plan JSON for frontend                                          │
│     - Persist to ai_generated_plans (optional)                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Žádná vlastní DB receptů/cviků** – vše dynamicky přes API. Ukládáme jen finální plán pro uživatele.

---

## 2. OpenAI JSON Schema

OpenAI vrací **pouze** strukturované zadání. Žádné recepty ani cviky.

```json
{
  "targets": {
    "calories_per_day": 2000,
    "protein_g": 120,
    "carbs_g": 220,
    "fat_g": 65
  },
  "meal_plan": {
    "meals_per_day": 3,
    "days": [
      {
        "day_index": 0,
        "day_name": "Pondělí",
        "meals": [
          { "type": "breakfast", "search_query": "oatmeal banana eggs", "notes": "" },
          { "type": "lunch", "search_query": "chicken breast rice vegetables", "notes": "" },
          { "type": "dinner", "search_query": "grilled salmon salad", "notes": "" }
        ]
      }
    ]
  },
  "workout_plan": {
    "workouts_per_week": 3,
    "workout_days": [1, 3, 5],
    "days": [
      {
        "day_index": 1,
        "focus": "upper body",
        "muscles": ["chest", "shoulders", "triceps"],
        "equipment": ["dumbbells", "bodyweight"],
        "duration_minutes": 45,
        "difficulty": "intermediate",
        "exercises": [
          { "search_term": "push up", "sets": 3, "reps": "10-12" },
          { "search_term": "dumbbell shoulder press", "sets": 3, "reps": "10" },
          { "search_term": "plank", "sets": 3, "duration_sec": 45 }
        ]
      }
    ]
  }
}
```

**Pravidla pro OpenAI:**
- `search_query` = anglický dotaz pro Spoonacular (max 5 slov)
- `search_term` = anglický název cviku pro wger (např. "squat", "push up")
- Žádné vymyšlené recepty ani cviky – jen vyhledávací dotazy

---

## 3. API Flow

### POST /api/onboarding/generate-plan

**Request:**
```json
{
  "user_id": "uuid",
  "body_metrics": {
    "goal": "redukce",
    "gender": "male",
    "age": 30,
    "height_cm": 180,
    "weight_kg": 85,
    "activity_level": "moderate",
    "allergies": "",
    "dietary_restrictions": "",
    "foods_to_avoid": "",
    "diet_type": "standard",
    "meals_per_day": 3,
    "workouts_per_week": 3,
    "workout_days": [1, 3, 5],
    "fitness_level": "intermediate",
    "equipment": ["dumbbells", "bodyweight", "resistance band"],
    "workout_duration_min": 45
  }
}
```

**Flow krok za krokem:**

| Krok | Akce | Fallback |
|------|------|----------|
| 1 | Validace vstupů (zodpovědnost, typy) | 400 Bad Request |
| 2 | OpenAI → structured JSON | Retry 1×, pak deterministic fallback |
| 3 | Parse + validate JSON (schema) | Fallback na předdefinované queries |
| 4 | Pro každé meal: Spoonacular search | Alternativní query, pak placeholder |
| 5 | Pro každý exercise: wger search | placeholder |
| 6 | Sestavení finálního JSON | – |
| 7 | (Volitelně) persist do DB | – |
| 8 | Return 200 + plan | – |

---

## 4. Example Requests

### Spoonacular mapping

| OpenAI search_query | Spoonacular API |
|---------------------|-----------------|
| `oatmeal banana eggs` | `GET /recipes/complexSearch?query=oatmeal+banana+eggs&number=3&addRecipeInformation=true&addRecipeNutrition=true` |
| `chicken breast rice` | `GET /recipes/complexSearch?query=chicken+breast+rice&number=3&...` |

**Filtry podle diet_type:**
- `diet=vegetarian` nebo `diet=vegan` v query params
- `excludeIngredients` pro allergies

### wger mapping

| OpenAI search_term | wger API |
|--------------------|----------|
| `push up` | `GET /exercise-translation/?search=push+up&language=2` → `exercise` ID |
| | `GET /exerciseimage/?exercise={id}&is_main=true` → `image` URL |
| | `GET /video/?exercise={id}` → `video` URL (pokud existuje) |

**exerciseinfo** (bohatší metadata):
- `GET /exerciseinfo/?limit=20` – paginace
- Filtrování: `?equipment=7` (bodyweight), `?muscles=4` (chest)

**Jazyky:** `language=2` (EN) pro vyhledávání, `language=9` (CS) pro české názvy v UI.

---

## 5. Example Request (curl)

```bash
curl -X POST https://app.bodyandmindon.cz/api/onboarding/generate-plan \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "uuid",
    "body_metrics": {
      "goal": "redukce",
      "gender": "male",
      "age": 30,
      "height_cm": 180,
      "weight_kg": 85,
      "activity_level": "moderate",
      "allergies": "",
      "dietary_restrictions": "bez lepku",
      "foods_to_avoid": "",
      "diet_type": "standard",
      "meals_per_day": 3,
      "workouts_per_week": 3,
      "workout_days": [1, 3, 5],
      "fitness_level": "intermediate",
      "equipment": ["dumbbells", "bodyweight", "resistance band"],
      "workout_duration_min": 45
    }
  }'
```

---

## 6. Example Final Response

```json
{
  "ok": true,
  "plan_id": "uuid",
  "valid_from": "2026-03-10",
  "valid_until": "2026-03-17",
  "targets": {
    "calories_per_day": 2000,
    "protein_g": 120,
    "carbs_g": 220,
    "fat_g": 65
  },
  "days": [
    {
      "date": "2026-03-10",
      "day_name": "Pondělí",
      "meals": [
        {
          "type": "breakfast",
          "display_name": "Oatmeal with Banana and Eggs",
          "recipe": {
            "id": 12345,
            "title": "Oatmeal with Banana and Eggs",
            "image": "https://spoonacular.com/recipeImages/12345-312x231.jpg",
            "sourceUrl": "https://...",
            "readyInMinutes": 15,
            "calories": 350,
            "protein_g": 12,
            "carbs_g": 45,
            "fat_g": 10,
            "source": "spoonacular"
          }
        }
      ],
      "workout": {
        "focus": "upper body",
        "duration_minutes": 45,
        "exercises": [
          {
            "name": "Push-up",
            "sets": 3,
            "reps": "10-12",
            "image_url": "https://wger.de/media/exercise-images/.../push-up.png",
            "video_url": "https://wger.de/media/exercise-video/.../video.MOV",
            "source": "wger",
            "wger_exercise_id": 167
          }
        ]
      }
    }
  ],
  "_diagnostics": {
    "meals_resolved": 21,
    "meals_fallback": 0,
    "exercises_resolved": 15,
    "exercises_fallback": 0
  }
}
```

---

## 7. Example OpenAI Prompt

```
Jsi nutriční a fitness poradce. Vytvoř strukturovaný týdenní plán jako JSON.

VSTUP UŽIVATELE:
- Cíl: redukce
- Strava: standard
- Jídel denně: 3
- Tréninků týdně: 3
- Vybavení: dumbbells, bodyweight, resistance band
- Omezení: bez lepku

PRAVIDLA:
1. Vrať POUZE validní JSON, žádný jiný text.
2. Pro jídla: meal_plan.days – každý den má meals s type (breakfast/lunch/dinner) a search_query (anglický dotaz max 5 slov pro Spoonacular).
3. Pro cviky: workout_plan.days – každý tréninkový den má exercises s search_term (anglický název pro wger), sets, reps nebo duration_sec.
4. targets: calories_per_day, protein_g, carbs_g, fat_g.
5. NEVYMÝŠLEJ recepty ani cviky – pouze vyhledávací dotazy.
```

---

## 8. Implementation Plan

### Fáze 1: Service vrstvy

| Soubor | Účel |
|--------|------|
| `lib/services/wgerService.js` | searchExercise(name), getExerciseImage(exerciseId), getExerciseVideo(exerciseId) |
| `lib/services/spoonacularService.js` | searchRecipe(query, options) – wrapper nad existujícím mealEnrichment |
| `lib/services/planOrchestrator.js` | generateStructuredPlan(bodyMetrics) – OpenAI + resolve + assemble |

### Fáze 2: OpenAI prompt a schema

- Prompt v `lib/prompts/onboardingPlanPrompt.js`
- JSON schema validace v `lib/validateStructuredPlan.js`
- Retry + fallback na deterministic queries

### Fáze 3: API endpoint

- `pages/api/onboarding/generate-plan.js`
- Validace vstupu, volání orchestrátoru, persist, response

### Fáze 4: Regenerace (budoucí)

- `POST /api/onboarding/regenerate-meal` – `{ plan_id, day_index, meal_type }` – znovu vyhledá recept
- `POST /api/onboarding/regenerate-workout` – `{ plan_id, day_index }` – znovu vyhledá cviky

---

## Error Handling & Fallbacks

| Situace | Akce |
|---------|------|
| OpenAI nevalidní JSON | Retry 1× s upřesněným promptem, pak deterministic |
| Spoonacular 429/limit | Exponential backoff, fallback query, pak placeholder |
| Spoonacular žádný výsledek | Zkusit zkrácený query, pak `{ display_name, recipe: null }` |
| wger žádný cvik | placeholder |
| wger 5xx | Retry 1×, pak placeholder |

---

## Rate Limits

| API | Limit | Strategie |
|-----|-------|-----------|
| Spoonacular | 50/den (free) | Cache meal_metadata_cache, batch pokud možno |
| wger | Žádný (veřejné) | Přímé volání |
| OpenAI | Token limit | Strukturovaný výstup, max 2k tokenů |

---

## Datové typy (TypeScript / JSDoc)

```typescript
interface OnboardingInput {
  user_id: string;
  body_metrics: {
    goal: 'redukce' | 'nabirani_svaly' | 'udrzovani';
    gender: string;
    age: number;
    height_cm: number;
    weight_kg: number;
    activity_level: string;
    allergies?: string;
    dietary_restrictions?: string;
    foods_to_avoid?: string;
    diet_type?: 'standard' | 'vegetarian' | 'vegan';
    meals_per_day: number;
    workouts_per_week: number;
    workout_days: number[];
    fitness_level: string;
    equipment: string[];
    workout_duration_min: number;
  };
}

interface StructuredPlanFromAI {
  targets: { calories_per_day: number; protein_g: number; carbs_g: number; fat_g: number };
  meal_plan: { days: Array<{ day_index: number; meals: Array<{ type: string; search_query: string }> }> };
  workout_plan: { days: Array<{ day_index: number; exercises: Array<{ search_term: string; sets: number; reps?: string; duration_sec?: number }> }> };
}

interface ResolvedMeal {
  type: string;
  display_name: string;
  recipe: { id: number; title: string; image: string; sourceUrl: string; calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number; source: string } | null;
}

interface ResolvedExercise {
  name: string;
  sets: number;
  reps?: string;
  duration_sec?: number;
  image_url: string | null;
  video_url: string | null;
  source: string;
  wger_exercise_id?: number;
}
```
