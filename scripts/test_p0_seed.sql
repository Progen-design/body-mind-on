-- Minimal seed for P0 RLS tests on empty dev DB (runs as postgres via supabase db query).
-- Creates two profile rows, body_metrics for user B, one active recipe, one backup table row.

INSERT INTO public.profiles (id, email, full_name, avatar_url)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'p0-test-a@example.com', 'Test User A', 'https://example.com/a.png'),
  ('00000000-0000-0000-0000-000000000002', 'p0-test-b@example.com', 'Test User B', 'https://example.com/b.png')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.body_metrics (user_id, gender, age, height_cm, weight_kg, activity, goal)
VALUES ('00000000-0000-0000-0000-000000000002', 'male', 30, 180, 80, 'moderate', 'maintain')
ON CONFLICT DO NOTHING;

INSERT INTO public.recipes_catalog (source, source_id, name_cs, meal_type, kcal, active)
VALUES ('test', 'p0-seed-recipe', 'P0 seed recept', 'lunch', 500, true)
ON CONFLICT DO NOTHING;

-- Stub backup table for T5 (prod has 9; one is enough for anon-deny test)
CREATE TABLE IF NOT EXISTS public._backup_2026_06_02_body_metrics (LIKE public.body_metrics INCLUDING ALL);
INSERT INTO public._backup_2026_06_02_body_metrics (user_id, gender, age, height_cm, weight_kg, activity, goal)
SELECT user_id, gender, age, height_cm, weight_kg, activity, goal
FROM public.body_metrics
WHERE user_id = '00000000-0000-0000-0000-000000000002'::uuid
LIMIT 1
ON CONFLICT DO NOTHING;

-- Re-apply B4 revoke on stub backup if P0 already ran before seed
DO $$
BEGIN
  IF to_regclass('public._backup_2026_06_02_body_metrics') IS NOT NULL THEN
    REVOKE ALL ON public._backup_2026_06_02_body_metrics FROM anon, authenticated;
    ALTER TABLE public._backup_2026_06_02_body_metrics ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;
