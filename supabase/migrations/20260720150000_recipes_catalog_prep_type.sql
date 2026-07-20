-- Prep logistics for meal planner (workday lunch preference).
ALTER TABLE public.recipes_catalog
  ADD COLUMN IF NOT EXISTS prep_type text;

ALTER TABLE public.recipes_catalog
  DROP CONSTRAINT IF EXISTS recipes_catalog_prep_type_check;

ALTER TABLE public.recipes_catalog
  ADD CONSTRAINT recipes_catalog_prep_type_check
  CHECK (
    prep_type IS NULL
    OR prep_type IN ('rychlovka', 'mealprep', 'studene', 'varit')
  );

COMMENT ON COLUMN public.recipes_catalog.prep_type IS
  'rychlovka (<15 min) | mealprep (cook once, eat 2–3×) | studene (no heat) | varit (needs stove now)';

CREATE INDEX IF NOT EXISTS recipes_catalog_prep_type_idx
  ON public.recipes_catalog (prep_type)
  WHERE active = true;
