-- Minimal pre-P0 schema on empty dev DB (simulates prod vulnerabilities for T1–T10).
-- NOT for production. Run once before P0 migration on dev project only.

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  email text,
  full_name text,
  avatar_url text,
  daily_email boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.body_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text,
  name text,
  gender text,
  age integer,
  height_cm numeric,
  weight_kg numeric,
  activity text,
  stress text,
  occupation text,
  goal text,
  weekly_sessions integer,
  diet_type text,
  preferences text,
  calories_target numeric,
  workout_days text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  tier text,
  status text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recipes_catalog (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source text NOT NULL DEFAULT 'spoonacular',
  source_id text,
  name_cs text NOT NULL,
  name_en text,
  meal_type text NOT NULL DEFAULT 'lunch',
  kcal int NOT NULL DEFAULT 0,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  diet_tags text[] NOT NULL DEFAULT '{}',
  servings int DEFAULT 1,
  ingredients jsonb,
  instructions jsonb,
  spoonacular_url text,
  image_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);

CREATE TABLE IF NOT EXISTS public._backup_2026_06_02_body_metrics (LIKE public.body_metrics INCLUDING ALL);

ALTER TABLE public.body_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bm_select" ON public.body_metrics;
DROP POLICY IF EXISTS "bm_insert" ON public.body_metrics;
DROP POLICY IF EXISTS "server all via service role" ON public.body_metrics;
CREATE POLICY "bm_select" ON public.body_metrics FOR SELECT TO public USING (true);
CREATE POLICY "bm_insert" ON public.body_metrics FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "server all via service role" ON public.body_metrics FOR ALL TO public USING (true) WITH CHECK (true);
GRANT ALL ON public.body_metrics TO anon, authenticated;

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (true);
GRANT ALL ON public.profiles TO anon, authenticated;

DROP POLICY IF EXISTS "Service role can manage memberships" ON public.memberships;
CREATE POLICY "Service role can manage memberships" ON public.memberships FOR ALL TO public USING (true) WITH CHECK (true);
GRANT ALL ON public.memberships TO anon, authenticated;

GRANT ALL ON public.recipes_catalog TO anon, authenticated;
GRANT ALL ON public._backup_2026_06_02_body_metrics TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_force_regenerate_task()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_force_regenerate_task() TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW public.v_user_plan_status AS
SELECT 'stub'::text AS status;

GRANT ALL ON public.v_user_plan_status TO anon, authenticated;
