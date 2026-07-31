-- Phase 2: filter observability, raw cache, query regeneration, legacy cursor rename.

-- ---------------------------------------------------------------------------
-- 1. Filter reason breakdown per API call
-- ---------------------------------------------------------------------------
ALTER TABLE public.spoonacular_import_runs
  ADD COLUMN IF NOT EXISTS skipped_filter_reasons jsonb;

-- ---------------------------------------------------------------------------
-- 2. Raw API payload cache (replay filter offline without re-fetching)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.spoonacular_raw_cache (
  source_id         text PRIMARY KEY,
  payload           jsonb        NOT NULL,
  query_meal_type   text,
  query_signature   text,
  fetched_at        timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS spoonacular_raw_cache_fetched_at_idx
  ON public.spoonacular_raw_cache (fetched_at DESC);

ALTER TABLE public.spoonacular_raw_cache ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. Deprecate linear cursor table (replaced by spoonacular_import_queries)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'spoonacular_import_cursor'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'spoonacular_import_cursor_legacy'
  ) THEN
    ALTER TABLE public.spoonacular_import_cursor
      RENAME TO spoonacular_import_cursor_legacy;
  END IF;
END $$;

COMMENT ON TABLE public.spoonacular_import_cursor_legacy IS
  'Deprecated — replaced by spoonacular_import_queries rotation (2026-07-29).';

-- ---------------------------------------------------------------------------
-- 4. Regenerate query rotation (drop sort/minProtein/maxSugar fake diversity)
--    6 meal types × 8 cuisines × 4 diets × 3 maxReadyTime = 576 combos
-- ---------------------------------------------------------------------------
TRUNCATE public.spoonacular_import_queries;

DO $$
DECLARE
  v_meal text;
  v_cuisine text;
  v_diet text;
  v_ready int;
  v_params jsonb;
  v_sig text;
BEGIN
  FOREACH v_meal IN ARRAY ARRAY[
    'breakfast', 'main course', 'salad', 'soup', 'snack', 'dessert'
  ] LOOP
    FOREACH v_cuisine IN ARRAY ARRAY[
      'italian', 'mexican', 'mediterranean', 'chinese', 'american', 'indian', 'greek', 'french'
    ] LOOP
      FOREACH v_diet IN ARRAY ARRAY['', 'vegetarian', 'vegan', 'gluten free'] LOOP
        FOREACH v_ready IN ARRAY ARRAY[20, 30, 45] LOOP
          v_params := jsonb_strip_nulls(jsonb_build_object(
            'type', v_meal,
            'cuisine', v_cuisine,
            'diet', NULLIF(v_diet, ''),
            'maxReadyTime', v_ready
          ));
          v_sig := v_meal || '|cu=' || v_cuisine || '|di=' || COALESCE(v_diet, '-') || '|rt=' || v_ready::text;
          INSERT INTO public.spoonacular_import_queries (
            meal_type, params, query_signature, priority
          ) VALUES (
            v_meal, v_params, v_sig, 100
          );
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;
