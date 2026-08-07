-- BEZPECNOST: odebrani EXECUTE od PUBLIC/anon/authenticated u SECURITY DEFINER funkci
-- + vnitrni pojistka v delete_user_data.
--
-- ===========================================================================
-- DIRA
-- ===========================================================================
-- 17 funkci v schematu public je SECURITY DEFINER, vlastnik postgres, a EXECUTE
-- ma anon. SECURITY DEFINER obchazi RLS a anon klic je verejny — je v JS bundlu
-- frontendu. Kdokoli s tim klicem tedy mohl volat cokoli z toho seznamu.
--
-- Nejhorsi je delete_user_data(uuid, text): ma proacl `=X/postgres`, tedy grant
-- pro PUBLIC, a JEDINOU kontrolou v tele je `target_user_id IS NOT NULL`. Pak
-- projde vsechny tabulky v public se sloupcem user_id a udela DELETE, plus
-- profiles podle id a registrations/waitlist/users podle e-mailu. Kdokoli
-- s verejnym anon klicem tedy mohl smazat data libovolneho uzivatele.
--
-- ===========================================================================
-- PRUZKUM VOLAJICICH — PROC JE ODEBRANI BEZPECNE
-- ===========================================================================
-- Prohledal jsem repo na `.rpc('<nazev>'` u vsech 17 funkci. VSICHNI volajici
-- pouzivaji `supabaseServer`, coz je v lib/supabaseServer.js klient postaveny
-- na SUPABASE_SERVICE_ROLE_KEY — a ma tam explicitni pojistku, ktera odmitne
-- start, kdyby to byl publishable/anon klic.
--
--   delete_user_data                pages/api/delete-account.js (route si sama
--                                   overi bearer token pres auth.getUser),
--                                   scripts/delete-user-by-email.mjs,
--                                   cleanup-stripe-preview-test-users.mjs,
--                                   db-cleanup-prelaunch.mjs,
--                                   lib/syntheticStripeTestUser.mjs
--   insert_product_event_server     lib/recordProductEvent.js, pages/api/events.js
--   insert_spoonacular_catalog_...  lib/spoonacular/catalogImport.js
--   queue/claim/mark_beta_email_*   lib/betaEmailAutomation.js,
--                                   pages/api/cron/beta-email.js,
--                                   pages/api/internal/beta-email/dispatch.js
--   list_beta_email_participants    lib/betaEmailAutomation.js
--   cancel_beta_participant_emails  lib/betaEmailAutomation.js
--   get_beta_participant_for_user   lib/betaParticipantMilestones.js
--   patch_beta_participant_milest.  lib/betaParticipantMilestones.js
--   join_beta_cohort                scripts/verify-beta-cohort-ops.mjs
--
-- KLICOVE OVERENI: v repu existuji i klientske moduly (lib/supabaseClient.js,
-- lib/supabaseUserClient.js) pro prohlizec. Prosel jsem VSECHNY soubory, ktere
-- je importuji (pages/login.js, register.js, profil.js, komunita.js, ...) a
-- NEVOLAJI zadne .rpc(). Z prohlizece se tedy dnes nevola ani jedna z tech 17.
-- Edge funkce v supabase/functions/ take zadne .rpc() nemaji.
--
-- CTYRI FUNKCE NEMAJI V REPU VOLAJICIHO VUBEC:
--   claim_beta_invite, validate_beta_invite    beta invite flow jeste neexistuje
--   upsert_spoonacular_catalog_import_rows     pouziva se jen insert_ varianta
--   grant_start_trial_on_signup                JE TO TRIGGER FUNKCE
--                                              (trg_start_trial_on_signup BEFORE
--                                              INSERT ON memberships) — trigger
--                                              se spusti bez ohledu na EXECUTE
--                                              granty, takze revoke ho nerozbije
--
-- Zadani predpokladalo, ze claim_beta_invite/validate_beta_invite bude muset
-- volat neprihlaseny uzivatel. Dnes je nevola nikdo, takze grant odebiram i jim.
-- Az se ten flow bude stavet, ma jit pres API route se service_role — nebo si
-- pred vracenim grantu dovnitr pridat kontrolu podle auth.uid().
--
-- ===========================================================================
-- ROZHODNUTI O `authenticated`
-- ===========================================================================
-- Odebiram taky. Prihlaseny uzivatel neni admin a zadny z tech 17 volajicich
-- prihlasenou roli nepouziva. Ponechat authenticated by znamenalo, ze kdokoli
-- po prihlaseni (anon klic + login, oboji dostupne) muze:
--   delete_user_data              smazat data ciziho uzivatele
--   list_beta_email_participants  precist e-maily vsech beta ucastniku
--   mark_beta_email_*             prepisovat interni frontu e-mailu
-- Samoobsluzne smazani uctu jde pres /api/delete-account, ktera bezi na
-- service_role — uzivatel funkci volat sam nepotrebuje.

-- ---------------------------------------------------------------------------
-- 1. Revoke
--
-- Dela se smyckou pres skutecny stav katalogu, ne opsanym seznamem podpisu —
-- preklep v podpisu by tise nic neodebral. Pojistka: pocet musi byt presne 17,
-- jinak by smycka mohla zabrat i na necem, co jsem neproveril.
--
-- REVOKE FROM PUBLIC je nutny zvlast. U ctyr funkci (delete_user_data,
-- grant_start_trial_on_signup, insert_/upsert_spoonacular_catalog_import_rows)
-- je v proacl `=X/postgres`, tedy grant pro PUBLIC — samotne
-- REVOKE FROM anon by je nechalo volatelne dal.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  f record;
  v_anon integer;
  v_vse  integer;
  v_dotcenych integer := 0;
BEGIN
  SELECT count(*) INTO v_anon
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
    AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF v_anon <> 17 THEN
    RAISE EXCEPTION 'Ocekavano 17 SECURITY DEFINER funkci volatelnych anon, nalezeno %. Neco se zmenilo — proverit rucne pred revoke.', v_anon;
  END IF;

  SELECT count(*) INTO v_vse
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef;

  -- Jede se pres VSECHNY SECURITY DEFINER funkce, ne jen pres tych 17 s anon.
  --
  -- Duvod: kontrola nize odhalila 18. funkci — log_catalog_slot_demand
  -- z migrace 20260805100000, kde jsem odebral PUBLIC a anon, ale ZAPOMNEL na
  -- authenticated. Je SECURITY DEFINER a zapisuje do catalog_slot_demand, takze
  -- prihlaseny uzivatel mohl poptavkovou tabulku zasypat vymyslenymi radky
  -- a pres fill_recipe_queue_from_demand tim tlacit generator do placenych
  -- OpenAI volani. Volajici je jediny: lib/recipesCatalog.js pres service_role.
  --
  -- Zbylych 6 (deactivate_expired_plans, fill_recipe_queue_from_demand,
  -- handle_force_regenerate_task, handle_new_user, prune_catalog_slot_demand,
  -- sweep_recipe_catalog_activation) uz service_role-only je; revoke je u nich
  -- bez efektu, ale drzi to seznam uplny a pristi pridana funkce se nezapomene.
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
    ORDER BY p.proname
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f.sig);
    -- service_role si grant drzi, na nem stoji vsichni legitimni volajici
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
    v_dotcenych := v_dotcenych + 1;
  END LOOP;

  RAISE NOTICE 'Revoke hotov u % SECURITY DEFINER funkci (z toho % melo anon).', v_dotcenych, v_anon;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Vnitrni pojistka v delete_user_data
--
-- Nezavisle na tom, kdo funkci SMI volat. Funkce, ktera umi smazat libovolneho
-- uzivatele podle parametru, ma mit kontrolu i kdyz jsou granty spravne — grant
-- se da omylem vratit jednou migraci, kontrola v tele ne.
--
-- Kdo se pozna jak: role se cte z JWT pres auth.role(), NE z current_user.
-- V SECURITY DEFINER je current_user vzdycky vlastnik funkce (postgres), takze
-- podle nej se volajici rozpoznat neda.
--
-- Povolene cesty:
--   service_role                     server — /api/delete-account a skripty,
--                                    smi mazat kohokoli (route si autorizaci
--                                    dela sama pres auth.getUser)
--   prihlaseny uzivatel = target     smazani SEBE; dnes to nikdo nevola,
--                                    protoze authenticated uz grant nema, ale
--                                    kdyby se vratil, je to bezpecne
--   prima SQL relace (postgres)      migrace a rucni sprava, kde zadne JWT neni
-- Vsechno ostatní se odmitne s insufficient_privilege.
--
-- Zbytek tela je nezmeneny.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_user_data(target_user_id uuid, target_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t record;
  n integer;
  vysledek jsonb := '{}'::jsonb;
  v_role text;
  v_uid  uuid;
BEGIN
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'delete_user_data: chybi target_user_id';
  END IF;

  -- POJISTKA OPRAVNENI
  v_role := auth.role();
  v_uid  := auth.uid();

  IF v_role = 'service_role' THEN
    NULL;
  ELSIF v_uid IS NOT NULL AND v_uid = target_user_id THEN
    NULL;
  ELSIF v_role IS NULL AND session_user IN ('postgres', 'supabase_admin') THEN
    NULL;
  ELSE
    RAISE EXCEPTION
      'delete_user_data: nepovolene volani (role=%, uid=%, cil=%)',
      coalesce(v_role, '(zadna)'), coalesce(v_uid::text, '(zadne)'), target_user_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR t IN
    SELECT DISTINCT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = 'public'
     AND tb.table_name = c.table_name
     AND tb.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.column_name = 'user_id'
    ORDER BY c.table_name
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE user_id = $1', t.table_name) USING target_user_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      vysledek := vysledek || jsonb_build_object(t.table_name, n);
    END IF;
  END LOOP;

  -- profiles se klíčuje přes id, ne user_id
  DELETE FROM public.profiles WHERE id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN vysledek := vysledek || jsonb_build_object('profiles', n); END IF;

  -- Tabulky bez user_id, kde je člověk identifikovaný e-mailem.
  IF target_email IS NOT NULL AND btrim(target_email) <> '' THEN
    FOR t IN SELECT unnest(ARRAY['registrations', 'waitlist', 'users']) AS table_name LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE lower(email) = lower($1)', t.table_name)
          USING target_email;
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n > 0 THEN
          vysledek := vysledek || jsonb_build_object(t.table_name, n);
        END IF;
      EXCEPTION WHEN undefined_table OR undefined_column THEN
        NULL;
      END;
    END LOOP;
  END IF;

  RETURN vysledek;
END;
$function$;

-- CREATE OR REPLACE granty nemeni, ale pro poradek explicitne:
REVOKE ALL ON FUNCTION public.delete_user_data(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_user_data(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.delete_user_data(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_data(uuid, text) TO service_role;

COMMENT ON FUNCTION public.delete_user_data(uuid, text) IS
  'Smazani vsech dat uzivatele. EXECUTE ma jen service_role. Telo navic overuje volajiciho: service_role smi kohokoli, prihlaseny uzivatel jen sebe, prima SQL relace projde. Volat pres /api/delete-account.';

-- ===========================================================================
-- CO SE ZAMERNE NERESILO
-- ===========================================================================
-- Ostatni funkce v public, ktere ma anon (atwater_ok, compute_nutrition_for_
-- ingredients, count_main_ingredients, is_pantry_ingredient, slot_time_limit,
-- get_daily_adherence, get_user_activity_stats, trigger funkce, ...) NEJSOU
-- SECURITY DEFINER. Bezi s pravy volajiciho, takze RLS na nich plati dal a
-- anon EXECUTE u nich nic neobchazi. Sahat na ne by znamenalo riskovat
-- funkcnost bez bezpecnostniho zisku.
--
-- POZNAMKA K get_daily_adherence(p_user_id) a get_user_activity_stats(p_user_id):
-- berou user_id z parametru a anon je smi volat. Nejsou SECURITY DEFINER, takze
-- data vydaji jen v ramci RLS — ale stoji za samostatnou proverku, jestli RLS na
-- vsech tabulkach, ktere ctou, opravdu drzi. Nedelal jsem to v teto migraci, at
-- neni sirsi nez ta dira, kterou zaviram.

-- ===========================================================================
-- Kontroly
-- ===========================================================================
DO $$
DECLARE
  v_anon    integer;
  v_public  integer;
  v_auth    integer;
  v_service integer;
  v_secdef  integer;
  v_trigger integer;
  v_chyba   text;
BEGIN
  -- 1) Zadna SECURITY DEFINER funkce v public uz nesmi byt volatelna anon.
  SELECT count(*) INTO v_anon
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
    AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_anon > 0 THEN
    RAISE EXCEPTION 'Jeste % SECURITY DEFINER funkci je volatelnych anon.', v_anon;
  END IF;

  -- 2) Ani authenticated.
  SELECT count(*) INTO v_auth
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  IF v_auth > 0 THEN
    RAISE EXCEPTION 'Jeste % SECURITY DEFINER funkci je volatelnych authenticated.', v_auth;
  END IF;

  -- 3) Ani PUBLIC.
  --
  -- Grant pro PUBLIC je polozka ACL s PRAZDNYM grantee, tedy `=X/postgres`.
  -- Testuje se pres unnest a vzor '=%', ne LIKE '%=X/%' nad celym proacl —
  -- ten by chytal i `postgres=X/postgres` a `service_role=X/postgres`
  -- a hlasil dira tam, kde neni. (Prvni verze teto kontroly to delala.)
  SELECT count(*) INTO v_public
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
    AND EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE '=%');
  IF v_public > 0 THEN
    RAISE EXCEPTION 'U % SECURITY DEFINER funkci zustal grant pro PUBLIC.', v_public;
  END IF;

  -- 4) service_role musi mit EXECUTE u VSECH 17 — na nem stoji cela aplikace.
  SELECT count(*) INTO v_secdef
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef;
  SELECT count(*) INTO v_service
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
    AND has_function_privilege('service_role', p.oid, 'EXECUTE');
  IF v_service <> v_secdef THEN
    RAISE EXCEPTION 'service_role ma EXECUTE jen u % z % SECURITY DEFINER funkci — rozbila by se aplikace.', v_service, v_secdef;
  END IF;

  -- 5) Trigger na START trial musi porad existovat. grant_start_trial_on_signup
  --    je trigger funkce; revoke ji nesmel odpojit.
  SELECT count(*) INTO v_trigger FROM pg_trigger t
  JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE NOT t.tgisinternal AND p.proname = 'grant_start_trial_on_signup';
  IF v_trigger <> 1 THEN
    RAISE EXCEPTION 'Trigger trg_start_trial_on_signup chybi.';
  END IF;

  -- 6) Pojistka v delete_user_data opravdu odmita cizi UUID.
  --
  -- Testuje se PODVRZENIM JWT CLAIMU, ne pres SET LOCAL ROLE. Pojistka cte
  -- auth.role()/auth.uid(), coz jsou GUC request.jwt.claims — skutecna DB role
  -- ji nezajima. Prvni verze teto kontroly menila roli na authenticated a
  -- RESET ROLE uz nestacil: relace v ni zustala a CLI pak nemohlo zapsat verzi
  -- do supabase_migrations ("permission denied for schema").
  --
  -- Simuluje se presne to, co by delal utocnik: prihlaseny uzivatel
  -- 1111...1111 se pokusi smazat data uzivatele 2222...2222.
  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"11111111-1111-1111-1111-111111111111"}', true);
  BEGIN
    PERFORM public.delete_user_data('22222222-2222-2222-2222-222222222222'::uuid, NULL);
    v_chyba := 'PROSLO';
  EXCEPTION
    WHEN insufficient_privilege THEN v_chyba := 'odmitnuto pojistkou';
    WHEN OTHERS THEN v_chyba := 'jina chyba: ' || SQLERRM;
  END;
  PERFORM set_config('request.jwt.claims', '', true);

  IF v_chyba <> 'odmitnuto pojistkou' THEN
    RAISE EXCEPTION 'delete_user_data s cizim UUID: % (mela odmitnout pojistka).', v_chyba;
  END IF;

  -- 7) A naopak: service_role musi projit, jinak by se rozbilo mazani uctu.
  --    Vola se s UUID, ktere neexistuje, takze se realne nic nesmaze.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    PERFORM public.delete_user_data('33333333-3333-3333-3333-333333333333'::uuid, NULL);
    v_chyba := 'proslo';
  EXCEPTION WHEN OTHERS THEN v_chyba := 'ODMITNUTO: ' || SQLERRM;
  END;
  PERFORM set_config('request.jwt.claims', '', true);

  IF v_chyba <> 'proslo' THEN
    RAISE EXCEPTION 'delete_user_data pod service_role neprosla (%) — rozbilo by se /api/delete-account.', v_chyba;
  END IF;

  RAISE NOTICE 'Hotovo: zadna SECURITY DEFINER funkce neni volatelna anon ani authenticated, service_role ma EXECUTE u vsech %, pojistka v delete_user_data odmita cizi UUID.', v_secdef;
END $$;
