-- Oprava CHECK constraintů na body_metrics – povolené canonical hodnoty.
-- Pokud produkce má staré constrainty s jinými hodnotami, odstraníme je a přidáme nové.

-- 1) Odstranit existující constrainty (názvy se mohou lišit)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'body_metrics'
      AND c.contype = 'c'
      AND (conname LIKE '%activity%' OR conname LIKE '%occupation%' OR conname LIKE '%goal%')
  ) LOOP
    EXECUTE format('ALTER TABLE public.body_metrics DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

-- 2) Přidat nové constrainty (povolují NULL a canonical hodnoty)
ALTER TABLE public.body_metrics
  ADD CONSTRAINT body_metrics_activity_check
  CHECK (activity IS NULL OR activity IN ('sedavy', 'lehce', 'stredne', 'velmi', 'extra'));

ALTER TABLE public.body_metrics
  ADD CONSTRAINT body_metrics_occupation_check
  CHECK (occupation IS NULL OR occupation IN ('office_it', 'manual', 'teacher_sales'));

ALTER TABLE public.body_metrics
  ADD CONSTRAINT body_metrics_goal_check
  CHECK (goal IS NULL OR goal IN ('redukce', 'nabirani_svaly', 'udrzovani'));
