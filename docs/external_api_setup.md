# External API setup for meal and exercise enrichment

The plan enrichment layer uses these APIs to add images and metadata to meals and exercises. All are optional; if keys are missing, enrichment returns safe fallbacks.

## Environment variables

| Variable | Description |
|--------|-------------|
| `SPOONACULAR_API_KEY` | API key from [spoonacular.com](https://spoonacular.com/food-api). Used for meal/recipe search, nutrition metadata, and recipe images. |
| `PEXELS_API_KEY` | API key from [pexels.com/api](https://www.pexels.com/api/). Fallback source for meal images when Spoonacular has no image. |
| `EXERCISEDB_API_KEY` | API key (e.g. RapidAPI key) for ExerciseDB. Used for exercise search, GIFs, and metadata. |
| `EXERCISEDB_API_HOST` | ExerciseDB API host (e.g. `https://exercisedb.p.rapidapi.com`). Base URL for exercise endpoints. |

## Usage

- **Spoonacular** — Meal search, nutrition (calories, protein, carbs, fat), recipe image metadata. Primary source for meal enrichment.
- **Pexels** — Fallback meal images when Spoonacular returns no suitable image. Free tier available.
- **ExerciseDB** — Exercise search by name, exercise GIF URL, body part, target muscle, equipment. Used for training section enrichment.

Add these to `.env` (and Vercel Environment Variables for production). If not set, enrichment still runs but returns `source: "none"` and null media/nutrition.
