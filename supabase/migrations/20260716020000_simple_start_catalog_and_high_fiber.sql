-- Seed extras for simple_start import + high_fiber soft-gate tags.
-- Runtime import: node scripts/import-simple-start-to-catalog.mjs
-- (Already applied to production during Bod 6 migration.)

-- Soft gate: vegetable/fiber meals that fail Atwater ±10 % stay selectable.
UPDATE public.recipes_catalog
SET diet_tags = (
  SELECT ARRAY(SELECT DISTINCT t FROM unnest(COALESCE(diet_tags, '{}'::text[]) || ARRAY['high_fiber']) AS t)
)
WHERE id IN (208, 244, 257, 46, 245, 272, 260, 284)
  AND NOT ('high_fiber' = ANY(COALESCE(diet_tags, '{}'::text[])));
