# UI Trust Labels — Body & Mind ON

> How the frontend displays trust metadata for meal and exercise assets.  
> The UI must not overstate certainty where the backend does not confirm it.

---

## Meals (jídelníček)

| Backend `image_trust_level` | UI behaviour |
|-----------------------------|--------------|
| `exact` | Show image. Badge: **Přesný zdroj** (sublabel: Spoonacular). |
| `illustrative` | Show image. Badge: **Ilustrační foto** (sublabel: Pexels). |
| `none` or no `image_url` | Do **not** show a generic stock image. Show placeholder: **Bez ověřeného obrázku**. |

Data source: `POST /api/plan-enrichment` → `meal_trust[key]` with `image_trust_level`, `exact_source`, `illustrative_source`.  
PlanViewer resolves the same lookup key as `meal_images` and uses it for `meal_trust`. When the backend returns **none** or no `image_url`, the frontend never falls back to `meal_images` or static `DISH_IMAGES` / `DEFAULT_MEAL_IMAGE` for that meal — it shows the placeholder only.

---

## Exercises (cviky)

| Backend `trust_level` | UI behaviour |
|-----------------------|--------------|
| `exact` | Show GIF or image. Badge: **Ověřený cvik** (sublabel: ExerciseDB / source). |
| `fallback` | Show image. Badge: **Ilustrační foto** (or **Náhradní vizuál**). |
| `none` or no media | Show placeholder: **Bez ověřeného média**. Do not show a random image. |

Data source: `POST /api/plan-enrichment` → `exercise_media[key]` with `trust_level`, `canonical_key`, `source`, `gif_url`, `image_url`.  
GIF has priority over image when `trust_level === 'exact'`.  
If the exercise image/GIF fails to load (`onError`), the frontend shows the same placeholder „Bez ověřeného média“ instead of a broken image.

---

## Static fallbacks (DISH_IMAGES / getMealImageByDish)

- Used **only** when **no** trust metadata exists for that meal (e.g. legacy plan, incomplete enrichment).
- When trust metadata **is** present and says `image_trust_level === 'none'` or `image_url` is missing, the frontend **must not** use enrichment URL or static fallback — placeholder only.
- When static fallback is used (no trust data), the UI **must** label as **Ilustrační foto**, never as exact.
- `DEFAULT_MEAL_IMAGE` is not used as an `onError` fallback; if the image fails to load, the card shows the placeholder instead.

---

## No Lies rule

The frontend must not present:

- an **illustrative** or **fallback** asset as if it were exact/verified;
- a **none** case as a broken image or as a static/random stock photo;
- a failed image load as a generic default image without showing the placeholder.

Trust labels are compact (badge + optional sublabel). Placeholders use neutral copy (e.g. „Bez ověřeného obrázku“) so the user understands that no verified visual is available, not that something failed.

---

## Where it is implemented

- **PlanViewer.js**: meal cards use `mealTrustMap`, `getEnrichedMealTrust()`, and strict resolution (backend none → no fallback; exact badge only when `mealTrust.image_url` is set). Training items use `exerciseMedia.trust_level`. Failed meal image load is tracked in `mealImageErrorKeys`; failed exercise media load in `exerciseMediaErrorKeys` — both show the placeholder instead of a broken or default image. Trust badges and placeholders in the same component; styles in the PlanViewer style block.
