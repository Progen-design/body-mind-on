-- Add recipe_id to meal_metadata_cache for Spoonacular recipe lookup
-- When image_trust_level = 'exact' and exact_source = 'spoonacular', we store the Spoonacular recipe ID
-- so the frontend can fetch full recipe via /api/spoonacular-recipe?id=X
alter table meal_metadata_cache add column if not exists recipe_id integer;
