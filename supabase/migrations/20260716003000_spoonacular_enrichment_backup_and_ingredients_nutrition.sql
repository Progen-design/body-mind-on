-- Backup columns for Spoonacular enrichment rollback + ingredients nutrition store.
ALTER TABLE public.recipes_catalog
  ADD COLUMN IF NOT EXISTS kcal_original integer,
  ADD COLUMN IF NOT EXISTS protein_g_original numeric,
  ADD COLUMN IF NOT EXISTS carbs_g_original numeric,
  ADD COLUMN IF NOT EXISTS fat_g_original numeric,
  ADD COLUMN IF NOT EXISTS servings_original integer,
  ADD COLUMN IF NOT EXISTS ingredients_original jsonb,
  ADD COLUMN IF NOT EXISTS enriched_at timestamptz,
  ADD COLUMN IF NOT EXISTS enrichment_source text;

CREATE TABLE IF NOT EXISTS public.ingredients_nutrition (
  id bigserial PRIMARY KEY,
  name_en text NOT NULL,
  name_cs text,
  name_normalized text NOT NULL,
  spoonacular_ingredient_id integer,
  kcal_per_100g numeric NOT NULL,
  protein_g_per_100g numeric,
  carbs_g_per_100g numeric,
  fat_g_per_100g numeric,
  sample_count integer NOT NULL DEFAULT 1,
  source text NOT NULL DEFAULT 'spoonacular_enrichment',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ingredients_nutrition_name_normalized_key UNIQUE (name_normalized)
);

CREATE INDEX IF NOT EXISTS ingredients_nutrition_spoonacular_id_idx
  ON public.ingredients_nutrition (spoonacular_ingredient_id);

ALTER TABLE public.ingredients_nutrition ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ingredients_nutrition_select_authenticated ON public.ingredients_nutrition;
CREATE POLICY ingredients_nutrition_select_authenticated
  ON public.ingredients_nutrition
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.ingredients_nutrition IS
  'Closed local nutrition DB built from Spoonacular nutrition.ingredients (per 100 g).';
