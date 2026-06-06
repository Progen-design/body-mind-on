-- ROLLBACK pro 20260606230000_p0_gdpr_rls_hardening.sql
-- Umístění: scripts/ (NE v supabase/migrations — jinak by se auto-aplikoval)
-- Spustit POUZE na dev branch / po schválení. NIKDY automaticky na prod.
-- Obnovuje stav politik a grantů dle FACT BASE (KROK 0) před P0 hardeningem.

BEGIN;

-- B6: views
REVOKE SELECT ON public.v_membership_funnel FROM service_role;
REVOKE SELECT ON public.v_user_plan_status FROM service_role;
REVOKE SELECT ON public.v_plan_quality_dashboard FROM service_role;

ALTER VIEW public.v_membership_funnel SET (security_invoker = false);
ALTER VIEW public.v_user_plan_status SET (security_invoker = false);
ALTER VIEW public.v_plan_quality_dashboard SET (security_invoker = false);

GRANT ALL ON public.v_membership_funnel TO anon, authenticated;
GRANT ALL ON public.v_user_plan_status TO anon, authenticated;
GRANT ALL ON public.v_plan_quality_dashboard TO anon, authenticated;

-- B5: recipes_catalog
DROP POLICY IF EXISTS "recipes_catalog_public_read" ON public.recipes_catalog;
ALTER TABLE public.recipes_catalog DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.recipes_catalog TO anon, authenticated;

-- B3: memberships
DROP POLICY IF EXISTS "memberships_select_own" ON public.memberships;

CREATE POLICY "Users can read own membership"
  ON public.memberships FOR SELECT TO public
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own membership"
  ON public.memberships FOR SELECT TO public
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage memberships"
  ON public.memberships FOR ALL TO public
  USING (true) WITH CHECK (true);

GRANT ALL ON public.memberships TO anon, authenticated;

-- B2: profiles
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

CREATE POLICY "Profiles are viewable by owner"
  ON public.profiles FOR SELECT TO public
  USING (auth.uid() = id);

CREATE POLICY "Profiles can be updated by owner"
  ON public.profiles FOR UPDATE TO public
  USING (auth.uid() = id);

CREATE POLICY "profiles_select"
  ON public.profiles FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

GRANT ALL ON public.profiles TO anon, authenticated;

-- B1: body_metrics
DROP POLICY IF EXISTS "body_metrics_select_own" ON public.body_metrics;
DROP POLICY IF EXISTS "body_metrics_insert_own" ON public.body_metrics;
DROP POLICY IF EXISTS "body_metrics_update_own" ON public.body_metrics;
DROP POLICY IF EXISTS "body_metrics_delete_own" ON public.body_metrics;

CREATE POLICY "Body metrics policy"
  ON public.body_metrics FOR ALL TO public
  USING (auth.uid() = user_id);

CREATE POLICY "bm_select"
  ON public.body_metrics FOR SELECT TO public
  USING (true);

CREATE POLICY "bm_insert"
  ON public.body_metrics FOR INSERT TO public
  WITH CHECK (true);

CREATE POLICY "server all via service role"
  ON public.body_metrics FOR ALL TO public
  USING (true) WITH CHECK (true);

GRANT ALL ON public.body_metrics TO anon, authenticated;

-- B4: backup tables
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    '_backup_2026_06_02_users',
    '_backup_2026_06_02_body_metrics',
    '_backup_2026_06_02_plans',
    '_backup_2026_06_02_memberships',
    '_backup_2026_06_02_profiles',
    '_backup_2026_06_02_ai_agents',
    '_backup_2026_06_02_user_habits',
    '_backup_2026_06_02_meal_cache',
    '_backup_2026_06_02_exercise_cache'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT ALL ON public.%I TO anon, authenticated', t);
  END LOOP;
END $$;

-- B7: functions (obnovit EXECUTE pro anon/authenticated — stav před P0)
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_force_regenerate_task() TO anon, authenticated, service_role;

COMMIT;
