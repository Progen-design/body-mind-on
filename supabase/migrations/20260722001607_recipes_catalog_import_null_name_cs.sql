-- Bulk Spoonacular import: allow untranslated rows (name_cs filled by translate-recipes cron).

ALTER TABLE public.recipes_catalog
  ALTER COLUMN name_cs DROP NOT NULL;

COMMENT ON COLUMN public.recipes_catalog.name_cs IS
  'Czech display name. NULL = pending OpenAI translation (import-spoonacular → translate-recipes).';

-- UNIQUE (source, source_id) already exists as recipes_catalog_source_source_id_key.
-- Log any legacy duplicates before index enforcement (should be empty).
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT source, source_id
    FROM public.recipes_catalog
    WHERE source = 'spoonacular' AND source_id IS NOT NULL
    GROUP BY source, source_id
    HAVING COUNT(*) > 1
  ) d;

  IF dup_count > 0 THEN
    RAISE NOTICE 'recipes_catalog spoonacular duplicates found: % groups — dedup required', dup_count;
  END IF;
END $$;
