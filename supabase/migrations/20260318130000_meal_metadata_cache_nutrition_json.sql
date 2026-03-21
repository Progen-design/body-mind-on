-- Rozšířené nutriční a metadata z Spoonacular (mapSpoonacularRecipe) pro cache / analytiku.
ALTER TABLE public.meal_metadata_cache
  ADD COLUMN IF NOT EXISTS nutrition_json jsonb;

COMMENT ON COLUMN public.meal_metadata_cache.nutrition_json IS 'Plný nutriční profil a ingredience z Spoonacular (JSON), volitelné.';
