-- Tři bezpečnostní nálezy ze Supabase advisors (změřeno v produkci 9. 9. 2026).
-- Nic víc než tyhle tři opravy — žádná změna těla žádné funkce.
--
-- NEAPLIKUJI tuhle migraci — píšu soubor, nasazuje ji Honzův druhý Claude
-- před mergem (docs/DALSI_KROK.md, "Pravidla, která platí nade vším").

-- ===========================================================================
-- 1) sync_plan_activation() smí volat kdokoli, i nepřihlášený   [PRIORITA]
-- ===========================================================================
-- SECURITY DEFINER, search_path už má nastavený ('public'), ale EXECUTE má
-- pořád {PUBLIC, anon, authenticated, postgres, service_role} — volatelné
-- přes /rest/v1/rpc/sync_plan_activation bez přihlášení. Funkce jako
-- SECURITY DEFINER obchází RLS a dělá GLOBÁLNÍ update přes celou
-- ai_generated_plans (zapíná/vypíná is_active) pro VŠECHNY uživatele, beze
-- vší kontroly volajícího uvnitř.
--
-- Jediný volající v kódu je api/cron/sweep-catalog-activation.js přes
-- supabaseServer.rpc('sync_plan_activation') — tedy service_role. Klientská
-- část (src/) ji nevolá nikde, takže odebrání práv anon/authenticated/PUBLIC
-- nic nerozbije.
REVOKE EXECUTE ON FUNCTION public.sync_plan_activation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_plan_activation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_plan_activation() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.sync_plan_activation() TO service_role;

-- ===========================================================================
-- 2) Pohled exercise_registry_expected_keys je SECURITY DEFINER
-- ===========================================================================
-- Advisor to hlásí jako ERROR. Pohled je jen `select k from unnest(ARRAY[...])`
-- — pevný seznam 48 canonical_key, žádná tabulka, žádná uživatelská data.
-- SECURITY DEFINER tam nemá co dělat (neškodné, ale je to hygiena). Používá
-- se jen v migracích 20260803200000 a 20260830120000 a v testu
-- lib/__tests__/exerciseRegistryCoverage.test.mjs (ten čte SQL soubory, ne DB).
-- `= true`, ne `= on`: Postgres ukládá reloption doslova tak, jak se napíše,
-- takže po `= on` je v `pg_class.reloptions` řetězec `security_invoker=on`
-- a kontrola níž (i ostatní pohledy v tomhle repu — `openai_daily_usage`,
-- `v_user_plan_status` — mají `security_invoker=true`) by ho nenašla.
-- Chycené kontrolním blokem při nasazení 9. 9. 2026.
ALTER VIEW public.exercise_registry_expected_keys SET (security_invoker = true);

-- ===========================================================================
-- 3) Pět funkcí bez pevného search_path
-- ===========================================================================
-- Žádná z nich není SECURITY DEFINER, riziko je tedy malé, ale advisor je
-- hlásí a je to jednořádková oprava na funkci. `SET search_path` tělo
-- funkce NEMĚNÍ — enforce_exercise_registry_rules() se tímhle nepřepisuje
-- (naposledy měněná 9. 9. migrací 20260909001500 — usable_in_plan podle
-- instructions_cs — a to zůstává beze změny).
ALTER FUNCTION public.atwater_ok(numeric, numeric, numeric, numeric, numeric, numeric) SET search_path = public;
ALTER FUNCTION public.enforce_exercise_registry_rules() SET search_path = public;
ALTER FUNCTION public.exercise_level_ordinal(text) SET search_path = public;
ALTER FUNCTION public.protect_measured_ready_in_minutes() SET search_path = public;
ALTER FUNCTION public.slot_time_limit(text) SET search_path = public;

-- ===========================================================================
-- Kontroly
-- ===========================================================================
DO $$
DECLARE
  v_anon_ma_execute boolean;
  v_authenticated_ma_execute boolean;
  v_security_invoker boolean;
  v_bez_search_path text[];
BEGIN
  -- 1) sync_plan_activation nesmí mít EXECUTE pro anon ani authenticated.
  SELECT has_function_privilege('anon', 'public.sync_plan_activation()', 'EXECUTE')
    INTO v_anon_ma_execute;
  IF v_anon_ma_execute THEN
    RAISE EXCEPTION 'sync_plan_activation() má pořád EXECUTE pro anon.';
  END IF;

  SELECT has_function_privilege('authenticated', 'public.sync_plan_activation()', 'EXECUTE')
    INTO v_authenticated_ma_execute;
  IF v_authenticated_ma_execute THEN
    RAISE EXCEPTION 'sync_plan_activation() má pořád EXECUTE pro authenticated.';
  END IF;

  -- 2) exercise_registry_expected_keys musí mít security_invoker = true.
  SELECT c.reloptions @> ARRAY['security_invoker=true']::text[]
    INTO v_security_invoker
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'exercise_registry_expected_keys';

  IF NOT coalesce(v_security_invoker, false) THEN
    RAISE EXCEPTION 'exercise_registry_expected_keys nemá security_invoker = true.';
  END IF;

  -- 3) pět funkcí musí mít proconfig se search_path.
  --
  -- Signatura se překládá přes `to_regprocedure()`, ne skládáním řetězce
  -- z `pg_get_function_identity_arguments()`: to vrací argumenty i se JMÉNY
  -- parametrů („p_kcal numeric, p_protein numeric, …"), takže porovnání
  -- s „atwater_ok(numeric, numeric, …)" nikdy nesedlo a kontrola hlásila
  -- jako nenastavené i funkce, které SET search_path dostaly. Chycené při
  -- nasazení 9. 9. 2026. `to_regprocedure` řeší typy a jména ignoruje;
  -- když funkce neexistuje, vrátí NULL a kontrola ji nahlásí — což je
  -- správně, protože přejmenovaná funkce je taky rozbitá kontrola.
  SELECT array_agg(f.podpis) INTO v_bez_search_path
  FROM (VALUES
    ('public.atwater_ok(numeric,numeric,numeric,numeric,numeric,numeric)'),
    ('public.enforce_exercise_registry_rules()'),
    ('public.exercise_level_ordinal(text)'),
    ('public.protect_measured_ready_in_minutes()'),
    ('public.slot_time_limit(text)')
  ) AS f(podpis)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.oid = to_regprocedure(f.podpis)
      AND p.proconfig IS NOT NULL
      AND EXISTS (SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%')
  );

  IF v_bez_search_path IS NOT NULL AND array_length(v_bez_search_path, 1) > 0 THEN
    RAISE EXCEPTION 'Funkce bez pevného search_path: %', array_to_string(v_bez_search_path, ', ');
  END IF;

  RAISE NOTICE 'Bezpečnostní opravy ověřeny: sync_plan_activation uzavřená pro anon/authenticated, exercise_registry_expected_keys security_invoker, 5 funkcí má search_path.';
END $$;
