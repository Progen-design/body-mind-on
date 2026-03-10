# Trusted Asset Resolution

> Technical documentation for the trustworthiness model of meal and exercise visuals in Body & Mind ON.

---

## Why this matters

When a user sees their personalized meal plan or training plan, the accompanying visuals must:
- Correspond to the actual food/exercise shown
- Be consistent across multiple views (the same exercise must always show the same image)
- Never mislead the user with an irrelevant or incorrect image

A system that silently shows a photo of a cliff for "Kuřecí prsa na grilu" or a yoga pose for "Dřepy" damages trust and credibility.

---

## Trust Model Overview

```mermaid
flowchart TD
    A[AI Plan HTML] --> B[enrichPlanContent.js\nParse meals & exercises]
    B --> C[Meal Resolver\nmealEnrichment.js]
    B --> D[Exercise Resolver\nexerciseEnrichment.js]
    C --> E{Spoonacular\nconfidence >= 0.75?}
    E -- Yes --> F[image_trust_level: exact\nexact_source: spoonacular]
    E -- No --> G[Pexels fallback\nimage_trust_level: illustrative\nillustrativeSource: pexels]
    E -- No match --> H[image_trust_level: none\nno image shown]
    D --> I{Canonical key\nresolved?}
    I -- Yes --> J[Check exercise_asset_registry DB]
    J -- Found --> K[trust_level: exact\nConsistent visual guaranteed]
    J -- Not found --> L[ExerciseDB API\ncanonical exercisedb_name]
    L -- Found --> M[trust_level: exact\nStore to registry]
    L -- Not found --> N[Pexels fitness fallback\ntrust_level: fallback]
    I -- No canonical key --> O[Free-text ExerciseDB search]
    O --> P[trust_level: exact if found\nor fallback via Pexels]
    F --> Q[Cache: meal_metadata_cache]
    G --> Q
    K --> R[UI enrichment data]
    M --> R
    N --> R
    Q --> R
```

---

## Meal Trust Rules

### Why Spoonacular can be exact — but only with confidence threshold

Spoonacular returns recipe search results based on text matching. The first result is not always the correct match for a given meal name, especially for:
- Czech meal names (translated or adapted)
- Generic descriptions with multiple ingredients
- AI-generated meal names that don't match Spoonacular titles well

**Rule:** Spoonacular result is accepted as `exact` only if `scoreMealMatch()` returns score ≥ 0.75.

### Confidence scoring (`scoreMealMatch`)

The score (0..1) considers:
1. **Word overlap ratio**: how many words from the input appear in the recipe title
2. **Main ingredient match**: first significant word matches the recipe title
3. **Nutrition data bonus**: recipe includes detailed nutrition (+0.10)
4. **Image bonus**: recipe includes an image (+0.05)
5. **Zero-overlap penalty**: if no words match, score is capped at 0.05

### Why Pexels is always illustrative

Pexels is a stock photo library. It returns photos based on keyword search. There is no guarantee that:
- "kuřecí prsa" returns a photo of grilled chicken breast
- The first result isn't a beach, a portrait, or an unrelated food

**Rule:** Pexels images always have `image_trust_level: "illustrative"`. They must never be treated as exact truth.

### Fallback rules for low confidence

| Situation | Result |
|-----------|--------|
| Spoonacular score ≥ 0.75 + has image | `exact` — Spoonacular image used |
| Spoonacular score < 0.75 | No exact image; Pexels tried as `illustrative` |
| Pexels score < 2 (photo scoring) | `none` — no image shown |
| No Spoonacular key available | Skip to Pexels illustrative |

### Meal normalization (`lib/mealNormalization.js`)

Before querying Spoonacular or Pexels, meal names are normalized:
- Remove parenthetical ingredient lists: `"Kuřecí prsa (prsa, rýže)"` → `"Kuřecí prsa"`
- Remove meal-type prefixes: `"Snídaně: Ovesná kaše"` → `"Ovesná kaše"`
- Remove quantity text: `"200g kuřecí prsa"` → `"kuřecí prsa"`
- Build fallback search chain: full name → simplified → first word

---

## Exercise Canonical Rules

### Why exercises use canonical mapping

Free-text API matching for exercises is unreliable:
- Czech names like "Dřepy s vlastní vahou" may not be found in ExerciseDB (English-only)
- Different plan renderings may use slightly different wording → inconsistent visuals
- ExerciseDB free-text search returns the first match, which may be wrong

**Rule:** Every supported exercise maps to one `canonical_key` in `lib/exerciseCanonicalMap.js`. The canonical key is the primary lookup identifier.

### Canonical key map

Each canonical key has:
- `display_name_cs`: Czech display name
- `exercisedb_name`: exact English name used for ExerciseDB lookup
- Metadata defaults: `body_part`, `target`, `equipment`

Examples:
| Czech input | canonical_key | exercisedb_name |
|-------------|---------------|-----------------|
| Dřepy | `squat` | `squat` |
| Kliky | `pushup` | `push-up` |
| Přítahy v předklonu | `bent_over_row` | `barbell bent over row` |
| Mrtvý tah | `deadlift` | `deadlift` |
| Prkno | `plank` | `plank` |
| Výpady | `lunges` | `lunge` |

### exercise_asset_registry (DB)

The `exercise_asset_registry` table guarantees visual consistency:
- First successful trusted resolution (ExerciseDB or Pexels) is stored by `canonical_key`
- Future lookups always check the registry first
- The same exercise always shows the same visual, regardless of plan rendering

### Trust levels for exercises

| Source | trust_level | Meaning |
|--------|-------------|---------|
| exercise_asset_registry | `exact` | Previously verified and stored |
| ExerciseDB (canonical name) | `exact` | Direct API match on known canonical name |
| exercisedb.dev fallback | `exact` | Verified GIF from free ExerciseDB mirror |
| Pexels | `fallback` | Fitness photo, not guaranteed exercise-specific |
| Nothing found | `none` | No visual shown |

---

## Trust Labels for UI

The backend exposes trust metadata for frontend labels (available in plan-enrichment API response):

### Meals (`meal_trust` map)
```json
{
  "image_trust_level": "exact",
  "exact_source": "spoonacular",
  "illustrative_source": null,
  "confidence_score": 0.87,
  "calories": 520,
  "protein_g": 42
}
```

### Exercises (`exercise_media` map)
```json
{
  "gif_url": "https://...",
  "canonical_key": "squat",
  "trust_level": "exact",
  "source": "exercisedb"
}
```

### Suggested UI labels
- `image_trust_level: "exact"` → badge: **Přesný zdroj**
- `image_trust_level: "illustrative"` → badge: **Ilustrační foto**
- `trust_level: "exact"` (exercise) → badge: **Ověřený cvik**
- `trust_level: "fallback"` (exercise) → badge: **Ilustrační foto**

---

## Database Tables

### `meal_metadata_cache`

| Column | Type | Purpose |
|--------|------|---------|
| `name_key` | text UNIQUE | Normalized meal name used as cache key |
| `image_url` | text | Final image URL (may be Spoonacular or Pexels) |
| `image_trust_level` | text | `exact` / `illustrative` / `none` |
| `exact_source` | text | `spoonacular` or null |
| `illustrative_source` | text | `pexels` or null |
| `confidence_score` | numeric | Spoonacular match confidence (0..1) |
| `calories` | numeric | Per-serving calories (when available) |

### `exercise_asset_registry`

| Column | Type | Purpose |
|--------|------|---------|
| `canonical_key` | text UNIQUE | Canonical exercise identifier |
| `exercisedb_name` | text | English name for ExerciseDB lookup |
| `gif_url` | text | Exercise GIF (from ExerciseDB) |
| `image_url` | text | Fallback image (from Pexels if no GIF) |
| `trust_level` | text | `exact` / `fallback` / `none` |
| `source` | text | `exercisedb` / `pexels` / `none` |

---

## Fallback Behavior Summary

The system is designed to be honest when uncertain:

| Situation | Behavior |
|-----------|----------|
| Spoonacular finds exact match | Show image with trust = exact |
| Spoonacular finds uncertain match | Use nutrition data; don't use image |
| Pexels returns good fitness photo | Show image with trust = illustrative |
| Pexels returns irrelevant photo (score < 2) | Show no image (trust = none) |
| ExerciseDB canonical match | Show GIF with trust = exact |
| ExerciseDB misses | Try exercisedb.dev |
| All exercise APIs fail | Pexels fitness fallback (trust = fallback) |
| All sources fail | No visual (trust = none) |

**The system never pretends certainty it doesn't have.**
