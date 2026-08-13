-- BEZPECNOST: odebrani EXECUTE u dvou zrcadlicich trigger funkci.
--
-- CO SE STALO. Migrace 20260813225243 zalozila `zrcadli_withings_vahu()`
-- a `zrcadli_apple_health_vahu()` jako SECURITY DEFINER. Nove funkce v `public`
-- ale dedi vychozi grant pro PUBLIC, takze je PostgREST okamzite vystavil jako
-- `/rest/v1/rpc/...` volatelne rolemi `anon` i `authenticated`. Advisors to
-- hlasily jako 4 nove WARN hned po nasazeni.
--
-- Tim se porusil invariant, ktery zavedla migrace 20260807090000: zadna
-- SECURITY DEFINER funkce v `public` nesmi byt volatelna anon ani authenticated.
-- Anon klic je verejny — je v JS bundlu frontendu.
--
-- REALNY DOPAD BYL MALY, ale nenulovy: volani pres RPC by spadlo, protoze
-- trigger funkce sahaji na `NEW`, ktere mimo trigger neexistuje. Slo by tedy
-- o chybu, ne o zapis cizi vahy. Spolehat se na to je ale spatne — chranit ma
-- grant, ne nahodna vlastnost tela funkce.
--
-- PROC SE NECHAVA SECURITY DEFINER. Trigger se spusti bez ohledu na EXECUTE
-- granty (stejne jako `grant_start_trial_on_signup`, viz 20260807090000),
-- takze revoke zrcadleni nerozbije. DEFINER zaroven zaruci, ze prelevani do
-- `body_measurements` neselze kvuli RLS, az se zapisovatelem stane nekdo jiny
-- nez service_role.

REVOKE ALL ON FUNCTION public.zrcadli_withings_vahu() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zrcadli_withings_vahu() FROM anon;
REVOKE ALL ON FUNCTION public.zrcadli_withings_vahu() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.zrcadli_withings_vahu() TO service_role;

REVOKE ALL ON FUNCTION public.zrcadli_apple_health_vahu() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zrcadli_apple_health_vahu() FROM anon;
REVOKE ALL ON FUNCTION public.zrcadli_apple_health_vahu() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.zrcadli_apple_health_vahu() TO service_role;

-- `je_testovaci_email` z 20260813214759 je schvalne SECURITY INVOKER (cista
-- funkce nad textem), takze pod tenhle invariant nespada a nesaha se na ni.

-- ---------------------------------------------------------------------------
-- Kontroly — stejne jako v 20260807090000, aby se invariant nedal porusit potichu.
--
-- Kontroluje se CELY katalog, ne jen ty dve funkce. Prave proto, ze tenhle
-- problem vznikl pridanim nove funkce: seznam opsany rucne by pristi novou
-- funkci zase minul.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_anon    integer;
  v_auth    integer;
  v_public  integer;
  v_secdef  integer;
  v_service integer;
  v_trig    integer;
BEGIN
  SELECT count(*) INTO v_anon
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
    AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_anon > 0 THEN
    RAISE EXCEPTION 'Jeste % SECURITY DEFINER funkci je volatelnych anon.', v_anon;
  END IF;

  SELECT count(*) INTO v_auth
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  IF v_auth > 0 THEN
    RAISE EXCEPTION 'Jeste % SECURITY DEFINER funkci je volatelnych authenticated.', v_auth;
  END IF;

  -- Grant pro PUBLIC je polozka ACL s prazdnym grantee (`=X/postgres`).
  SELECT count(*) INTO v_public
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
    AND EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE '=%');
  IF v_public > 0 THEN
    RAISE EXCEPTION 'U % SECURITY DEFINER funkci zustal grant pro PUBLIC.', v_public;
  END IF;

  SELECT count(*) INTO v_secdef
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef;
  SELECT count(*) INTO v_service
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
    AND has_function_privilege('service_role', p.oid, 'EXECUTE');
  IF v_service <> v_secdef THEN
    RAISE EXCEPTION 'service_role ma EXECUTE jen u % z % SECURITY DEFINER funkci.', v_service, v_secdef;
  END IF;

  -- Oba zrcadlici triggery musi po revoke porad existovat a byt navazane.
  SELECT count(*) INTO v_trig FROM pg_trigger t
  JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE NOT t.tgisinternal
    AND p.proname IN ('zrcadli_withings_vahu', 'zrcadli_apple_health_vahu');
  IF v_trig <> 2 THEN
    RAISE EXCEPTION 'Ocekavany 2 zrcadlici triggery, nalezeno % — revoke je odpojil.', v_trig;
  END IF;

  RAISE NOTICE 'Invariant drzi: 0 anon, 0 authenticated, 0 PUBLIC u % SECURITY DEFINER funkci; oba zrcadlici triggery na miste.', v_secdef;
END $$;
