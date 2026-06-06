-- scripts/test_p0_rls_dev.sql — same as test_p0_rls.sql without psql meta-commands (for supabase db query).
-- Test users (fixed UUIDs from seed):
--   user_a = 00000000-0000-0000-0000-000000000001
--   user_b = 00000000-0000-0000-0000-000000000002

RESET ROLE;

DO $$
DECLARE
  c bigint;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SELECT count(*) INTO c FROM public.body_metrics WHERE user_id = '00000000-0000-0000-0000-000000000002'::uuid;
  IF c <> 0 THEN RAISE EXCEPTION 'T1 FAIL: user A reads body_metrics B (count=%)', c; END IF;
  RAISE NOTICE 'T1 PASS: user A cannot read body_metrics B';
END $$;

RESET ROLE;
DO $$
DECLARE c bigint;
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO c FROM public.body_metrics;
    IF c <> 0 THEN RAISE EXCEPTION 'T2 FAIL: anon reads body_metrics (count=%)', c; END IF;
    RAISE NOTICE 'T2 PASS: anon SELECT returned 0 rows on body_metrics';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T2 PASS: anon denied on body_metrics';
  END;
END $$;

RESET ROLE;
DO $$
DECLARE c bigint;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SELECT count(*) INTO c FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000002'::uuid;
  IF c <> 0 THEN RAISE EXCEPTION 'T3 FAIL: user A reads profile B (count=%)', c; END IF;
  RAISE NOTICE 'T3 PASS: user A cannot read profile B';
END $$;

RESET ROLE;
DO $$
DECLARE c bigint;
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO c FROM public._backup_2026_06_02_body_metrics;
    IF c <> 0 THEN RAISE EXCEPTION 'T5 FAIL: anon reads backup (count=%)', c; END IF;
    RAISE NOTICE 'T5 PASS: anon SELECT returned 0 rows on _backup_*';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T5 PASS: anon denied on _backup_*';
  END;
END $$;

RESET ROLE;
DO $$
BEGIN
  SET LOCAL ROLE anon;
  PERFORM 1 FROM public.v_user_plan_status LIMIT 1;
  RAISE EXCEPTION 'T6 FAIL: anon can read v_user_plan_status';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'T6 PASS: anon denied on v_user_plan_status';
END $$;

RESET ROLE;
DO $$
BEGIN
  SET LOCAL ROLE anon;
  PERFORM public.handle_new_user();
  RAISE EXCEPTION 'T7 FAIL: anon can call handle_new_user()';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'T7 PASS: anon denied EXECUTE on handle_new_user()';
END $$;

RESET ROLE;
DO $$
DECLARE c bigint;
BEGIN
  SET LOCAL ROLE anon;
  SELECT count(*) INTO c FROM public.recipes_catalog WHERE COALESCE(active, true) = true;
  IF c < 1 THEN RAISE EXCEPTION 'T10a FAIL: anon cannot SELECT active recipes (count=%)', c; END IF;
  RAISE NOTICE 'T10a PASS: anon SELECT recipes_catalog (count=%)', c;
END $$;

RESET ROLE;
DO $$
BEGIN
  SET LOCAL ROLE anon;
  INSERT INTO public.recipes_catalog (source, source_id, name_cs, meal_type, kcal, active)
  VALUES ('test', 'p0-rls-test', 'P0 test', 'lunch', 100, false);
  RAISE EXCEPTION 'T10b FAIL: anon can INSERT recipes_catalog';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'T10b PASS: anon denied INSERT on recipes_catalog';
END $$;

RESET ROLE;

-- T12 hint: service_role can read cross-user profiles (simulates /api/community)
DO $$
DECLARE c bigint;
BEGIN
  RESET ROLE;
  SELECT count(*) INTO c FROM public.profiles
  WHERE id IN (
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  );
  IF c <> 2 THEN RAISE EXCEPTION 'T12 hint FAIL: service_role/postgres cannot read both profiles (count=%)', c; END IF;
  RAISE NOTICE 'T12 hint PASS: postgres reads both profiles for community API pattern (count=%)', c;
END $$;
