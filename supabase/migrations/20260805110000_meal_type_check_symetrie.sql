-- Kontrakt na meal_type: dorovnani CHECKu tam, kde nesou tutez domenu.
--
-- ===========================================================================
-- PROBLEM: DVE MISTA NAD STEJNYMI DATY, JEN JEDNO HLIDA
-- ===========================================================================
--   recipe_generation_queue.meal_type   CHECK ('snidane','obed','vecere','svacina')
--   catalog_slot_demand.meal_type       zadny CHECK   <- nova tabulka z 20260805100000
--   recipes_catalog.meal_type           zadny CHECK   <- pritom je to hlavni katalog
--
-- Overeno experimentem pred nasazenim (v transakci s rollbackem):
--   INSERT 'lunch' do recipe_generation_queue  ->  ODMITNUTO checkem
--   log_catalog_slot_demand('lunch', ...)      ->  PROSLO, tichy zapis
--
-- Tichy zapis anglicke hodnoty do catalog_slot_demand by spadl az druhy den ve
-- fill_recipe_queue_from_demand, tedy v cronu, protoze ten uz zapisuje do
-- fronty S checkem. Chyba by se projevila daleko od mista vzniku jako padajici
-- nocni uloha bez zjevne priciny.
--
-- Je to tretí vyskyt teze tridy chyby v tomhle repu:
--   1. name vs name_en — count_main_ingredients cte jine pole nez nutricni
--      pipeline (recept 614, migrace 20260804260000)
--   2. `gramu is null` v pantry logice — pantry se uplatnilo jen kdyz neslo
--      prevest jednotku (migrace 20260804230000)
--   3. tenhle meal_type
--
-- ===========================================================================
-- CO SE UKAZALO PRI PRUZKUMU: SAMOTNY ZAPIS JE ANGLICKY
-- ===========================================================================
-- `m.type` v planu je ANGLICKY (breakfast|lunch|dinner|snack) — repo na to ma
-- mapovani planMealTypeToCatalog() v lib/recipesCatalog.js:100. Jenze
-- fetchCatalogCandidates ho pouzilo jen pro DOTAZ do katalogu (catalogType,
-- radek 257) a do fronty i do logu poptavky posilalo RAW anglickou hodnotu.
--
-- Dusledek, ktery neni jen teoreticky: obe poptavkove cesty byly rozbite.
--   objednejZNizkeNabidky -> 'lunch' do fronty -> CHECK ho odmitne -> chyba se
--   spolkne v odesliPoptavku a nikde se neprojevi
--   zalogujPoptavkuSlotu  -> 'lunch' do poptavky -> projde, tichy zapis
-- Fallback `|| 'lunch'` na hodnotu, kterou cilova tabulka nepřijme, to jen
-- zabetonoval. Kod se opravuje mimo tuhle migraci (lib/recipesCatalog.js):
-- vsechna ctyri mista uz normalizuji pres planMealTypeToCatalog().

-- ---------------------------------------------------------------------------
-- 1. Nejdriv OVERIT, ze data check neporusuji. Nepredpokladat.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_poptavka integer;
  v_katalog  integer;
BEGIN
  SELECT count(*) INTO v_poptavka FROM public.catalog_slot_demand
  WHERE meal_type NOT IN ('snidane','obed','vecere','svacina');
  IF v_poptavka > 0 THEN
    RAISE EXCEPTION 'catalog_slot_demand ma % radku, ktere by check porusily — nejdriv je potreba rozhodnout, co s nimi.', v_poptavka;
  END IF;

  SELECT count(*) INTO v_katalog FROM public.recipes_catalog
  WHERE meal_type IS NULL OR meal_type NOT IN ('snidane','obed','vecere','svacina');
  IF v_katalog > 0 THEN
    RAISE EXCEPTION 'recipes_catalog ma % radku, ktere by check porusily.', v_katalog;
  END IF;

  RAISE NOTICE 'Data jsou cista: catalog_slot_demand 0 poruseni, recipes_catalog 0 poruseni.';
END $$;

-- ---------------------------------------------------------------------------
-- 2. catalog_slot_demand — hlavni dira ze zadani
-- ---------------------------------------------------------------------------
ALTER TABLE public.catalog_slot_demand
  ADD CONSTRAINT catalog_slot_demand_meal_type_check
  CHECK (meal_type = ANY (ARRAY['snidane'::text, 'obed'::text, 'vecere'::text, 'svacina'::text]));

-- ---------------------------------------------------------------------------
-- 3. recipes_catalog — stejna domena, stejne riziko, jen se na to nikdo neptal
--
-- Vsech 555 radku uz cesky je (obed 194, snidane 182, vecere 106, svacina 73),
-- takze check nic nerozbije a od teď zachyti regresi na hranici importu.
--
-- PROVERENO, ZE NEROZBIJE NOCNI IMPORT: insert_spoonacular_catalog_import_rows
-- prosypava `r ->> 'meal_type'` z volajiciho, ale ten dostava hodnotu ze
-- spoonacular_import_queries.catalog_meal_type, ktera SVUJ CHECK s ceskymi
-- hodnotami uz ma. Retez je tedy cesky po cele delce.
--
-- Bez checku by anglicka hodnota v katalogu nespadla vubec — recept by jen
-- nikdy netrefil zadny slot, protoze dotazy se ptaji na ceske hodnoty
-- (a od 20260805090000 i casova brana pres meal_type IN ('obed','vecere')).
-- Tichy zapis, zadny pad. Presne ta trida chyby.
-- ---------------------------------------------------------------------------
ALTER TABLE public.recipes_catalog
  ADD CONSTRAINT recipes_catalog_meal_type_check
  CHECK (meal_type = ANY (ARRAY['snidane'::text, 'obed'::text, 'vecere'::text, 'svacina'::text]));

-- ===========================================================================
-- CO SE ZAMERNE NEDOPLNILO — asymetrie, ktere NEJSOU stejne riziko
-- ===========================================================================
-- spoonacular_import_runs.meal_type   JINA DOMENA, check by byl chyba.
--   Data: breakfast (20), main course (15), soup (14), salad (14),
--   dessert (10), snack (10) — je to slovnik SPOONACULARU, kterym se pta
--   import, ne nas slot. Cesky check by nocni import okamzite rozbil.
--
-- nutrition_logs.meal_type           Tabulka je PRAZDNA, domena nedolozena.
-- user_meal_pins.meal_type           Tabulka je PRAZDNA, domena nedolozena.
--   U obou nevim, jestli maji nest nas slot, nebo neco uzivatelskeho. Check
--   podle domenky by byl hadani; az do nich zacne neco tect, pozna se to.
--
-- spoonacular_import_cursor_legacy.meal_type   Legacy, kandidat na smazani.
--
-- diet_tags (recipes_catalog, recipe_generation_queue, catalog_slot_demand)
--   CHECK nikde a NEDOPLNUJI ho. Domena je otevrena (gluten_free, vegan,
--   vegetarian, high_fiber, low_carb, ketogenic, primal, paleolithic,
--   pescatarian, dairy_free, whole30, ...) a roste s tim, co vraci Spoonacular.
--   Vycet v checku by se rozesel s realitou a rozbil import pri prvnim novem
--   tagu. Tvar hodnot uz drzi normalizeDietTags() v kodu — jednotne misto,
--   coz je u otevrene domeny spravnejsi nez check.
--   ASYMETRIE TU ALE JE, jen jineho druhu: setrideni. Btree bere
--   {vegan,gluten_free} a {gluten_free,vegan} jako dva klice, takze
--   recipe_gen_queue_unikat i primarni klic catalog_slot_demand se daji
--   obejit poradim. V catalog_slot_demand to resi RPC (radi tagy), ve fronte
--   nic — to je volny konec, ktery by chtel vlastni rozhodnuti.
--
-- stav / zdroj (recipe_generation_queue, exercise_import_queue)
--   Obe tabulky check MAJI a shodny. Zadna asymetrie.

-- ===========================================================================
-- Kontroly
-- ===========================================================================
DO $$
DECLARE
  v_checku    integer;
  v_poptavka  text;
  v_katalog   text;
  v_radku     integer;
BEGIN
  -- 1) Oba checky opravdu existuji.
  SELECT count(*) INTO v_checku FROM pg_constraint
  WHERE conname IN ('catalog_slot_demand_meal_type_check','recipes_catalog_meal_type_check')
    AND contype = 'c';
  IF v_checku <> 2 THEN
    RAISE EXCEPTION 'Ocekavany 2 nove checky, nalezeno %.', v_checku;
  END IF;

  -- 2) Anglicka hodnota MUSI byt odmitnuta v obou tabulkach. Tohle je ta vec,
  --    kterou migrace resi — kdyby prosla, je cela k nicemu.
  BEGIN
    PERFORM public.log_catalog_slot_demand('lunch', '{}', 200, 900, 0, 1, true);
    v_poptavka := 'PROSLO';
  EXCEPTION WHEN check_violation THEN v_poptavka := 'odmitnuto';
            WHEN others THEN v_poptavka := 'jina chyba: ' || sqlerrm;
  END;
  IF v_poptavka <> 'odmitnuto' THEN
    RAISE EXCEPTION 'catalog_slot_demand stale bere anglickou hodnotu (%).', v_poptavka;
  END IF;

  BEGIN
    INSERT INTO public.recipes_catalog (source, source_id, name_en, name_cs, kcal, meal_type, active)
    VALUES ('test_check', 'test_check_1', 'x', 'x', 100, 'lunch', false);
    v_katalog := 'PROSLO';
  EXCEPTION WHEN check_violation THEN v_katalog := 'odmitnuto';
            WHEN others THEN v_katalog := 'jina chyba: ' || sqlerrm;
  END;
  IF v_katalog <> 'odmitnuto' THEN
    RAISE EXCEPTION 'recipes_catalog stale bere anglickou hodnotu (%).', v_katalog;
  END IF;

  -- 3) Ceska hodnota musi dal projit — check nesmi zablokovat normalni provoz.
  PERFORM public.log_catalog_slot_demand('obed', ARRAY['vegan'], 400, 600, 5, 5, false);
  SELECT count(*) INTO v_radku FROM public.catalog_slot_demand WHERE meal_type='obed';
  IF v_radku < 1 THEN
    RAISE EXCEPTION 'Ceska hodnota se nezapsala — check je prilis prisny.';
  END IF;
  DELETE FROM public.catalog_slot_demand WHERE meal_type='obed' AND diet_tags = ARRAY['vegan'];

  -- 4) Po uklidu je poptavka zas prazdna a katalog nezmeneny.
  SELECT count(*) INTO v_radku FROM public.catalog_slot_demand;
  IF v_radku <> 0 THEN
    RAISE EXCEPTION 'Po uklidu zustalo v catalog_slot_demand % radku.', v_radku;
  END IF;

  SELECT count(*) INTO v_radku FROM public.recipes_catalog;
  IF v_radku <> 555 THEN
    RAISE EXCEPTION 'V recipes_catalog je % radku, cekali jsme 555.', v_radku;
  END IF;

  RAISE NOTICE 'meal_type kontrakt srovnan: catalog_slot_demand i recipes_catalog odmitaji anglickou hodnotu, ceska prochazi.';
END $$;
