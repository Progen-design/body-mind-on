-- scripts/test_p0_rls.sql
-- P0 RLS test suite (T1–T11 SQL část). Spustit na DEV branch / lokální Supabase PO aplikaci migrace.
-- T4, T8, T9, T12 (API), T13 (smoke) — viz RUNBOOK_P0.md (Node/curl).
--
-- Použití (příklad — NESPOUŠTĚT proti prod bez RUN DEV):
--   psql "$DEV_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/test_p0_rls.sql
--
-- Před spuštěním nastav UUID testovacích uživatelů (existující účty na dev):
\set user_a_id '00000000-0000-0000-0000-000000000001'
\set user_b_id '00000000-0000-0000-0000-000000000002'

-- Helper: reset role
RESET ROLE;

\echo '=== T1: user A nečte body_metrics B (authenticated) ==='
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'user_a_id', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT count(*) AS t1_count_should_be_0
FROM public.body_metrics
WHERE user_id = :'user_b_id'::uuid;

\echo '=== T2: anon nečte body_metrics (mělo by být 0 nebo permission denied) ==='
RESET ROLE;
SET LOCAL ROLE anon;
SELECT count(*) AS t2_count_should_be_0 FROM public.body_metrics;

\echo '=== T3: user A nečte profil B (authenticated) ==='
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'user_a_id', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT count(*) AS t3_count_should_be_0
FROM public.profiles
WHERE id = :'user_b_id'::uuid;

\echo '=== T5: anon nečte _backup_* (mělo by být 0) ==='
RESET ROLE;
SET LOCAL ROLE anon;
SELECT count(*) AS t5_backup_body_metrics_should_be_0
FROM public._backup_2026_06_02_body_metrics;

\echo '=== T6: anon nečte SECURITY DEFINER views ==='
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM 1 FROM public.v_user_plan_status LIMIT 1;
  RAISE EXCEPTION 'T6 FAIL: anon může číst v_user_plan_status';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'T6 PASS: anon denied on v_user_plan_status';
END $$;

\echo '=== T7: anon RPC handle_new_user = denied ==='
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM public.handle_new_user();
  RAISE EXCEPTION 'T7 FAIL: anon může volat handle_new_user()';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'T7 PASS: anon denied EXECUTE on handle_new_user()';
END $$;

\echo '=== T10a: anon SELECT recipes_catalog (mělo být >= 1) ==='
RESET ROLE;
SET LOCAL ROLE anon;
SELECT count(*) AS t10a_active_recipes_should_be_gt_0
FROM public.recipes_catalog
WHERE COALESCE(active, true) = true;

\echo '=== T10b: anon INSERT recipes_catalog = denied ==='
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  INSERT INTO public.recipes_catalog (source, source_id, name_cs, active)
  VALUES ('test', 'p0-rls-test', 'P0 test', false);
  RAISE EXCEPTION 'T10b FAIL: anon může INSERT do recipes_catalog';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'T10b PASS: anon denied INSERT on recipes_catalog';
END $$;

\echo '=== T11: security advisors (spusť zvlášť přes Supabase Dashboard nebo MCP get_advisors) ==='
\echo 'Očekávání: 0 ERROR pro rls_disabled_in_public (_backup, recipes_catalog), rls_policy_always_true (body_metrics, memberships), security_definer_view, anon_security_definer_function_executable'

\echo '=== T12 hint: komunita přes service_role (simulace API) ==='
RESET ROLE;
-- service_role bypass — ověř, že API route může načíst avatar_url cizího uživatele:
-- SELECT id, avatar_url FROM public.profiles WHERE id IN (:user_a_id, :user_b_id);

RESET ROLE;
\echo '=== SQL test suite dokončen. Zkontroluj výstupy výše (counts=0, NOTICE PASS). ==='
