-- Cache for meal and exercise enrichment to reduce external API calls and support fallback when APIs timeout.

-- Meal metadata cache (Spoonacular/Pexels results)
create table if not exists meal_metadata_cache (
  id uuid primary key default gen_random_uuid(),
  meal_name text unique not null,
  image_url text,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  source text,
  created_at timestamp default now()
);

-- Exercise metadata cache (ExerciseDB results)
create table if not exists exercise_metadata_cache (
  id uuid primary key default gen_random_uuid(),
  exercise_name text unique not null,
  image_url text,
  gif_url text,
  body_part text,
  target text,
  equipment text,
  source text,
  created_at timestamp default now()
);
