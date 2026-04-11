# Audit: Flow generování plánů – Spoonacular + wger only

**Datum:** 2025-03-18  
**Cíl:** Ověřit a vynutit, že jídla = Spoonacular, cviky = wger, OpenAI vrací pouze search queries, do UI se nedostane neověřený raw text.

---

## A. Audit – kde se volá Spoonacular

| Soubor | Funkce/řádek | Volání |
|--------|--------------|--------|
| `lib/services/spoonacularService.js` | `searchRecipe()` | `https://api.spoonacular.com/recipes/complexSearch?apiKey=SPOONACULAR_API_KEY` |
| `lib/services/planOrchestrator.js` | `resolveMeals()` | `searchRecipe(m.search_query, { diet })` |
| `lib/mealEnrichment.js` | `callSpoonacular()` | `https://api.spoonacular.com/recipes/complexSearch?apiKey=SPOONACULAR_API_KEY` |
| `pages/api/onboarding/replace-meal.js` | handler | `searchRecipe(query, { diet })` |

**Použití klíče:** Pouze `process.env.SPOONACULAR_API_KEY`. Žádný RapidAPI.

---

## B. Audit – kde se volá wger

| Soubor | Funkce/řádek | Volání |
|--------|--------------|--------|
| `lib/services/wgerService.js` | `searchExercise()` | `https://wger.de/api/v2/exercise-translation/?search=...` |
| `lib/services/wgerService.js` | `getExerciseImage()` | `https://wger.de/api/v2/exerciseimage/?exercise=...` |
| `lib/services/wgerService.js` | `getExerciseVideo()` | `https://wger.de/api/v2/video/?exercise=...` |
| `lib/services/exerciseProviderRegistry.js` | `resolveExercise()` | `wgerResolve(searchTerm)` → wgerService |
| `lib/services/planOrchestrator.js` | `resolveWorkouts()` | `resolveExercise(term)` → exerciseProviderRegistry |
| `lib/exerciseEnrichment.js` | `enrichExercise()` | `wgerResolve(searchName)` → wgerService |
| `pages/api/onboarding/replace-workout.js` | handler | `resolveExercise(ex.search_term)` |

**Endpointy wger:** exercise-translation, exerciseimage, video. Žádný API klíč.

---

## C. Audit – fallbacky

| Místo | Před opravou | Po opravě |
|-------|--------------|-----------|
| `resolveMeals` – Spoonacular null | `display_name: m.search_query` (raw) | `display_name_cs: 'Jídlo (neověřeno)'`, `recipe_verified: false`; při hitu přeložený titul receptu + `planner_suggestion_cs` |
| `resolveWorkouts` – wger null | `name: term` (raw) | `name: 'Cvik (neověřeno)'`, `exercise_verified: false` |
| `replace-meal` – recipe null | `display_name: query` | `display_name: 'Jídlo (neověřeno)'` |
| `replace-workout` – wger null | `name: search_term` | `name: 'Cvik (neověřeno)'` |
| `exerciseProviderRegistry` | secondary provider (odstraněn) | pouze wger |
| `planOrchestrator` – chybí `meal_plan` | — | `buildProfileTemplateMealPlan` (generické dotazy), ne `getDeterministicMealPlan` |
| `planOrchestrator` – chybí `workout_plan.days` | — | `getDeterministicWorkoutPlan` (`WORKOUT_BLOCKS` + `deriveWorkoutDays`) |
| Unified pipeline | — | `validateStructuredPlan` tvrdě kontroluje shodu s profilem (jídla, tréninky, cviky) |

---

## D. Audit – OpenAI kontrakt

| Soubor | Kontrakt |
|--------|----------|
| `lib/validation/parseStructuredPlan.js` | Stripe `m.search_query`, `e.search_term` – pouze tyto pole z OpenAI |
| `lib/services/planOrchestrator.js` | Prompt: "NEVYMÝŠLEJ recepty ani cviky – pouze vyhledávací dotazy" |
| `parseStructuredPlan` | `meals.map(m => ({ type, search_query }))` – žádné title/display |
| `parseStructuredPlan` | `exercises.map(e => ({ search_term, sets, reps, duration_sec }))` – žádné name |

**Verdikt:** OpenAI vrací pouze search_query a search_term. Finální názvy pocházejí z Spoonacular (recipe.title) a wger (exercise name).

---

## E. Verdikt

| Kritérium | Stav |
|-----------|------|
| Spoonacular only | **PASS** |
| wger only | **PASS** |
| No secondary provider | **PASS** |
| No RapidAPI | **PASS** |
| No ExerciseDB | **PASS** |
| No fake publish (raw text) | **PASS** (po opravě) |

---

## F. Změněné soubory

1. `lib/services/planOrchestrator.js` – publish rules, recipe_verified, exercise_verified
2. `lib/planRenderer.js` – zobrazení podle verified flagů
3. `pages/api/onboarding/replace-meal.js` – placeholder při recipe null
4. `pages/api/onboarding/replace-workout.js` – placeholder při wger null

---

## G. Root cause (před opravou)

- Když Spoonacular nebo wger vrátily null, pipeline používala `search_query` / `search_term` (raw text z OpenAI) jako `display_name` / `name`.
- Do finálního UI se tak dostal neověřený text.

---

## H. Cílový stav

- Meal se zobrazí jako "Jídlo (neověřeno)" pouze když Spoonacular nevrátí recept.
- Exercise se zobrazí jako "Cvik (neověřeno)" pouze když wger nevrátí cvik.
- Žádný raw text z OpenAI se nepoužije jako user-facing název bez ověření přes API.

---

## I. Co otestovat po nasazení

1. **Plán s fungujícími API** – jídla a cviky se zobrazují s reálnými názvy.
2. **Spoonacular limit vyčerpán** – jídla zobrazují "Jídlo (neověřeno)".
3. **Neexistující cvik** – zobrazí "Cvik (neověřeno)".
4. **Replace meal** – při null receptu vrací "Jídlo (neověřeno)".
5. **Replace workout** – při null wger vrací "Cvik (neověřeno)".
6. **Build** – `npm run build` projde.
