-- P0 GDPR / RLS hardening (Body & Mind ON)
-- Authored: 2026-05-20
-- Version 20260606230000 — řadí se ZA prod head 20260606215617 (fix_workouts_rls_with_check)
-- Scope: body 1–7 z P0 návrhu (B8 auth dashboard, B9 storage avatars vynechány)
-- Idempotentní. Jedna transakce.

BEGIN;

-- =============================================================================
-- B7: SECURITY DEFINER RPC — pouze REVOKE/GRANT (těla funkcí NE měnit)
-- =============================================================================
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_force_regenerate_task() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.handle_force_regenerate_task() TO postgres, service_role;

-- =============================================================================
-- B4: _backup_2026_* — REVOKE + RLS ON bez politik (deny pro PostgREST role)
-- =============================================================================
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
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- =============================================================================
-- B1: body_metrics — odstranit permissive politiky, jen vlastník (authenticated)
-- service_role RLS obchází — samostatná politika pro service_role NENÍ potřeba
-- =============================================================================
DROP POLICY IF EXISTS "bm_select" ON public.body_metrics;
DROP POLICY IF EXISTS "bm_insert" ON public.body_metrics;
DROP POLICY IF EXISTS "server all via service role" ON public.body_metrics;
DROP POLICY IF EXISTS "Body metrics policy" ON public.body_metrics;
DROP POLICY IF EXISTS "body_metrics_select_own" ON public.body_metrics;
DROP POLICY IF EXISTS "body_metrics_insert_own" ON public.body_metrics;
DROP POLICY IF EXISTS "body_metrics_update_own" ON public.body_metrics;
DROP POLICY IF EXISTS "body_metrics_delete_own" ON public.body_metrics;

CREATE POLICY "body_metrics_select_own"
  ON public.body_metrics FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "body_metrics_insert_own"
  ON public.body_metrics FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "body_metrics_update_own"
  ON public.body_metrics FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "body_metrics_delete_own"
  ON public.body_metrics FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.body_metrics FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.body_metrics TO authenticated;

-- =============================================================================
-- B2: profiles — odstranit profiles_select USING (true); jen vlastník
-- Trenér + komunita čtou cizí profily přes service_role API (supabaseServer)
-- =============================================================================
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by owner" ON public.profiles;
DROP POLICY IF EXISTS "Profiles can be updated by owner" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

-- =============================================================================
-- B3: memberships — odstranit duplicitní SELECT a permissive service policy
-- =============================================================================
DROP POLICY IF EXISTS "Users can read own membership" ON public.memberships;
DROP POLICY IF EXISTS "Users can view own membership" ON public.memberships;
DROP POLICY IF EXISTS "Service role can manage memberships" ON public.memberships;
DROP POLICY IF EXISTS "memberships_select_own" ON public.memberships;

CREATE POLICY "memberships_select_own"
  ON public.memberships FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.memberships FROM anon;
GRANT SELECT ON public.memberships TO authenticated;

-- =============================================================================
-- B5: recipes_catalog — RLS ON, read-only pro anon/authenticated
-- Sloupec active ověřen v information_schema (boolean, default true)
-- =============================================================================
ALTER TABLE public.recipes_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recipes_catalog_public_read" ON public.recipes_catalog;

CREATE POLICY "recipes_catalog_public_read"
  ON public.recipes_catalog FOR SELECT
  TO anon, authenticated
  USING (COALESCE(active, true) = true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.recipes_catalog FROM anon, authenticated;
GRANT SELECT ON public.recipes_catalog TO anon, authenticated;

-- =============================================================================
-- B6: SECURITY DEFINER views — revoke + security_invoker (PG15+)
-- Views exist on prod; on fresh dev they may be absent — skip safely.
-- =============================================================================
DO $$
DECLARE
  v text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'v_membership_funnel',
    'v_user_plan_status',
    'v_plan_quality_dashboard'
  ]
  LOOP
    IF to_regclass('public.' || v) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', v);
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v);
      EXECUTE format('GRANT SELECT ON public.%I TO service_role', v);
    END IF;
  END LOOP;
END $$;

COMMIT;
