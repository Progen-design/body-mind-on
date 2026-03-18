# Audit: Publish pravidla pro jídla a cviky

**Datum:** 2026-03-18  
**Cíl:** Zajistit, že raw OpenAI text (`search_query`, `search_term`) se nikdy nedostane do finálního UI ani e-mailu.

---

## A. Root cause

### Problém
- OpenAI vrací pouze vyhledávací dotazy (`search_query` pro jídla, `search_term` pro cviky).
- Při missu ve Spoonacular nebo wger se do plánu mohly propsat tyto raw texty jako display hodnoty.
- Uživatel tak mohl vidět neověřený anglický text místo ověřeného obsahu z API.

### Konkrétní místa (před opravou)
1. **planOrchestrator.resolveMeals** – `display_name: recipe?.title ?? m.search_query` → raw search_query při missu
2. **planOrchestrator.resolveWorkouts** – `name: resolvedEx?.name ?? term` → raw search_term při missu nebo edge case
3. **exerciseProviderRegistry.resolveExercise** – fallback `{ name: searchTerm, ... }` → raw search_term
4. **replace-meal** – při missu vracel raw hint_query (již opraveno na placeholder)
5. **replace-workout** – `name: resolved?.name ?? ex.search_term` → raw search_term při edge case

---

## B. Co bylo opraveno

### 1. Resolvery

| Soubor | Změna |
|--------|-------|
| `lib/services/planOrchestrator.js` | **resolveMeals:** `display_name` = `recipeVerified ? recipe.title : 'Jídlo (neověřeno)'`; `recipe_verified: boolean` |
| `lib/services/planOrchestrator.js` | **resolveWorkouts:** `name` = `exerciseVerified ? (resolvedEx?.name \|\| 'Cvik (neověřeno)') : 'Cvik (neověřeno)'`; nikdy `term` |
| `lib/services/exerciseProviderRegistry.js` | Při wger miss vrací `{ name: null, source: 'none' }` – žádný raw search_term |

### 2. Verified flagy

- **Meals:** `recipe_verified: boolean` – true jen pokud Spoonacular vrátil recept
- **Exercises:** `exercise_verified: boolean` – true jen pokud wger vrátil cvik s image_url nebo video_url

### 3. Renderer

| Soubor | Logika |
|--------|--------|
| `lib/planRenderer.js` | Jídla: `m.recipe_verified === true ? (m.display_name ?? m.recipe?.title ?? '') : 'Jídlo (neověřeno)'` |
| `lib/planRenderer.js` | Cviky: `ex.exercise_verified === true ? (ex.name ?? '') : 'Cvik (neověřeno)'` |
| `lib/planRenderer.js` | Nákupní seznam: jen `m.recipe_verified === true` |

### 4. Replace flow

| Endpoint | Při missu |
|----------|-----------|
| `replace-meal` | `display_name: 'Jídlo (neověřeno)'`, `recipe_verified: false` |
| `replace-workout` | `name: verified ? (resolved?.name \|\| 'Cvik (neověřeno)') : 'Cvik (neověřeno)'` – nikdy `ex.search_term` |

---

## C. Seznam změněných souborů

1. `lib/services/planOrchestrator.js` – resolveMeals, resolveWorkouts
2. `lib/services/exerciseProviderRegistry.js` – fallback bez raw search_term
3. `lib/planRenderer.js` – verified-only display, nákupní seznam
4. `pages/api/onboarding/replace-meal.js` – controlled placeholder při missu
5. `pages/api/onboarding/replace-workout.js` – nikdy raw search_term

---

## D. Kontrakt (finální stav)

### Meals
- Publish jako ověřené jen při validním Spoonacular match
- Při missu: `display_name: 'Jídlo (neověřeno)'`, `recipe_verified: false`
- Raw `search_query` se nikdy nepoužívá jako display

### Exercises
- Publish jako ověřené jen při validním wger match (image_url nebo video_url)
- Při missu: `name: 'Cvik (neověřeno)'`, `exercise_verified: false`
- Raw `search_term` se nikdy nepoužívá jako display

### Zdroj dat
- **Jídla:** pouze Spoonacular
- **Cviky:** pouze wger.de
- Žádný RapidAPI, ExerciseDB ani další externí zdroje

---

## E. Test plan

1. **Spoonacular OK** – plán s běžnými dotazy (oatmeal, chicken rice) → ověřená jídla v UI i e-mailu
2. **Spoonacular miss** – dotaz, který Spoonacular nenajde (nebo limit) → „Jídlo (neověřeno)“ v UI i e-mailu
3. **wger OK** – plán s běžnými cviky (squat, push up) → ověřené cviky v UI i e-mailu
4. **wger miss** – neexistující cvik → „Cvik (neověřeno)“ v UI i e-mailu
5. **Replace meal** – miss → vrací `display_name: 'Jídlo (neověřeno)'`
6. **Replace workout** – miss → vrací `name: 'Cvik (neověřeno)'`
7. **Nákupní seznam** – obsahuje jen ověřená jídla (ne „Jídlo (neověřeno)“)
8. **Profil + e-mail** – stejné chování, žádný raw text
