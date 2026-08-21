-- diet_tags: kanonicke poradi, aby se deduplikace nedala obejit poradim tagu.
--
-- ===========================================================================
-- PROBLEM
-- ===========================================================================
-- recipe_gen_queue_unikat je UNIQUE (meal_type, diet_tags, kcal_min, kcal_max)
-- WHERE stav IN ('pending','running'). Pole se v btree porovnava prvek po prvku,
-- takze {vegan,gluten_free} a {gluten_free,vegan} jsou DVA RUZNE KLICE — jedna
-- a ta sama dira se da do fronty zalozit dvakrat, staci jine poradi tagu.
--
-- Stejny tvar ma primarni klic catalog_slot_demand. Tam to dnes drzi
-- log_catalog_slot_demand, ktera tagy pred zapisem radi, ale je to obrana
-- v jednom volajicim, ne v tabulce.
--
-- Kdo je nechraneny:
--   objednejRecepty()                  posila spec.diet_tags rovnou do insertu
--   normalizeDietTags()                dedupuje a mapuje aliasy, ale NERADI
--                                      (lib/dietTags.js:47 vraci [...out],
--                                      tedy poradi vlozeni)
--   fill_recipe_queue_from_demand()    porovnava q.diet_tags = d.diet_tags,
--                                      tedy PRESNOU rovnost poli
--
-- To posledni je druha tvar teze chyby: kdyby ve fronte lezelo nesetridene pole
-- a v poptavce setridene, NOT EXISTS by je nespojil a plnic by zalozil duplicit
-- k uz otevrene objednavce.
--
-- STAV DAT PRED ZMENOU (overeno, nepredpokladano):
--   recipe_generation_queue  9 radku, 0 nesetridenych, 0 s vice tagy
--   catalog_slot_demand      0 radku
--   recipes_catalog        555 radku, 5 nesetridenych, 187 s vice tagy
-- K obejiti tedy jeste nedoslo — opravuje se drive, nez na to nekdo narazi.
--
-- ===========================================================================
-- PROC TRIGGER A NE GENEROVANY SLOUPEC NEBO SETRIDENI V JS
-- ===========================================================================
-- * JS (setridit v objednejRecepty) by pokryl jen jednu cestu. Do fronty
--   zapisuje i SQL — fill_recipe_queue_from_demand a rucni seedy. Presne ta
--   asymetrie "dve mista nad stejnymi daty, jen jedno hlida", kterou resime.
-- * Generovany sloupec + druhy unikatni index by potreboval IMMUTABLE pomocnou
--   funkci a hlavne by NEOPRAVIL to porovnani q.diet_tags = d.diet_tags —
--   ulozena hodnota by zustala nesetridena.
-- * Trigger normalizuje ULOZENOU hodnotu, takze spravi oboji zaraz: unikatni
--   index i kazde porovnani poli napric tabulkami. A plati pro vsechny cesty.
--
-- Kanonicka forma = setrideno A deduplikovano. Bez dedup by {vegan,vegan}
-- byl dalsi klic, kterym se index obejde.

CREATE OR REPLACE FUNCTION public.diet_tags_kanonicky()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.diet_tags := coalesce(
    (SELECT array_agg(DISTINCT t ORDER BY t) FROM unnest(coalesce(NEW.diet_tags, '{}')) t),
    '{}'::text[]
  );
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.diet_tags_kanonicky() IS
  'Setridi a deduplikuje diet_tags pri zapisu. Bez toho se unikatni index nad polem da obejit jinym poradim tagu ({vegan,gluten_free} vs {gluten_free,vegan}).';

-- Trigger se jmenuje tak, aby v abecednim poradi bezel PRED branami
-- (enforce_*, trg_*) — brany ctou diet_tags a maji je videt uz kanonicke.
-- (Poradi tady na vysledek nema vliv, protoze brany pouzivaji = ANY(...),
-- ktere je na poradi nezavisle, ale je to jasnejsi pro cteni.)
DROP TRIGGER IF EXISTS aa_diet_tags_kanonicky ON public.recipe_generation_queue;
CREATE TRIGGER aa_diet_tags_kanonicky
  BEFORE INSERT OR UPDATE ON public.recipe_generation_queue
  FOR EACH ROW EXECUTE FUNCTION public.diet_tags_kanonicky();

DROP TRIGGER IF EXISTS aa_diet_tags_kanonicky ON public.catalog_slot_demand;
CREATE TRIGGER aa_diet_tags_kanonicky
  BEFORE INSERT OR UPDATE ON public.catalog_slot_demand
  FOR EACH ROW EXECUTE FUNCTION public.diet_tags_kanonicky();

-- ===========================================================================
-- CO SE ZAMERNE NEUDELALO
-- ===========================================================================
-- recipes_catalog.diet_tags — 5 z 555 radku ma nesetridene pole a NECHAVAM je.
--   Poradi tam nic neovlivnuje: nad diet_tags neni zadny unikatni index a
--   vsechna cteni jsou `= ANY(diet_tags)` nebo recipe_diet_conflicts(), tedy
--   na poradi nezavisla. Zisk by byl kosmeticky, ale UPDATE tech radku by
--   probudil enforce_recipe_catalog_rules a ten umi recept deaktivovat —
--   presne to riziko, ktere uz jednou zastavilo migraci 20260804200000
--   (recept 614 na hrane count_main_ingredients). Trigger sem taky nepridavam,
--   at se do horke tabulky nepridava dalsi krok bez duvodu.
--
-- Setrideni v JS (objednejRecepty / normalizeDietTags) nedoplnuji — trigger je
--   autoritativni a duplikovat totez pravidlo na dvou mistech je zrovna ten
--   vzorec, ktery tahle rada migraci odstranuje. In-memory deduplikace ve
--   skladaci uz na poradi nezavisla je: zapisPoptavku i zapisLogPoptavky si
--   klic skladaji pres .slice().sort().join(',').

-- ===========================================================================
-- Kontroly — musi DOKAZAT, ze obejiti poradim uz nefunguje
-- ===========================================================================
DO $$
DECLARE
  v_pred      integer;
  v_po        integer;
  v_ulozene   text[];
  v_druhy     text;
BEGIN
  SELECT count(*) INTO v_pred FROM public.recipe_generation_queue;

  -- 1) Zapis nesetrideneho pole se ulozi kanonicky.
  INSERT INTO public.recipe_generation_queue
    (meal_type, diet_tags, kcal_min, kcal_max, pozadovano, priorita, zdroj)
  VALUES ('obed', ARRAY['vegan','gluten_free'], 400, 600, 5, 99, 'seed');

  SELECT diet_tags INTO v_ulozene FROM public.recipe_generation_queue
  WHERE priorita = 99 AND zdroj = 'seed' AND meal_type = 'obed';
  IF v_ulozene <> ARRAY['gluten_free','vegan'] THEN
    RAISE EXCEPTION 'diet_tags se neulozily setridene, je tam %.', v_ulozene;
  END IF;

  -- 2) TO PODSTATNE: druhy zapis s OBRACENYM poradim uz musi narazit na
  --    unikatni index. Pred touhle migraci by prosel a vznikla by duplicita.
  BEGIN
    INSERT INTO public.recipe_generation_queue
      (meal_type, diet_tags, kcal_min, kcal_max, pozadovano, priorita, zdroj)
    VALUES ('obed', ARRAY['gluten_free','vegan'], 400, 600, 5, 99, 'seed');
    v_druhy := 'PROSLO — obejiti poradim stale funguje';
  EXCEPTION WHEN unique_violation THEN v_druhy := 'odmitnuto indexem';
  END;
  IF v_druhy <> 'odmitnuto indexem' THEN
    RAISE EXCEPTION 'Deduplikace se da porad obejit poradim tagu (%).', v_druhy;
  END IF;

  -- 3) Deduplikace: {vegan,vegan} nesmi byt dalsi klic.
  BEGIN
    INSERT INTO public.recipe_generation_queue
      (meal_type, diet_tags, kcal_min, kcal_max, pozadovano, priorita, zdroj)
    VALUES ('obed', ARRAY['vegan','vegan','gluten_free'], 400, 600, 5, 99, 'seed');
    v_druhy := 'PROSLO — duplicitni tag vyrobil novy klic';
  EXCEPTION WHEN unique_violation THEN v_druhy := 'odmitnuto indexem';
  END;
  IF v_druhy <> 'odmitnuto indexem' THEN
    RAISE EXCEPTION 'Duplicitni tag v poli obesel index (%).', v_druhy;
  END IF;

  -- 4) Totez v catalog_slot_demand (primarni klic ma stejny tvar).
  PERFORM public.log_catalog_slot_demand('obed', ARRAY['vegan','gluten_free'], 400, 600, 2, 5, false);
  INSERT INTO public.catalog_slot_demand
    (meal_type, diet_tags, kcal_min, kcal_max, den, reseni)
  VALUES ('obed', ARRAY['gluten_free','vegan'], 400, 600, current_date, 1)
  ON CONFLICT (meal_type, diet_tags, kcal_min, kcal_max, den) DO UPDATE SET reseni = catalog_slot_demand.reseni + 1;

  SELECT count(*) INTO v_po FROM public.catalog_slot_demand WHERE meal_type = 'obed';
  IF v_po <> 1 THEN
    RAISE EXCEPTION 'V catalog_slot_demand vznikly % radky misto 1 — poradi tagu obchazi primarni klic.', v_po;
  END IF;

  -- 5) Uklid po testu.
  DELETE FROM public.recipe_generation_queue WHERE priorita = 99 AND zdroj = 'seed' AND meal_type = 'obed';
  DELETE FROM public.catalog_slot_demand WHERE meal_type = 'obed' AND diet_tags = ARRAY['gluten_free','vegan'];

  SELECT count(*) INTO v_po FROM public.recipe_generation_queue;
  IF v_po <> v_pred THEN
    RAISE EXCEPTION 'Po uklidu je ve fronte % radku misto puvodnich %.', v_po, v_pred;
  END IF;
  SELECT count(*) INTO v_po FROM public.catalog_slot_demand;
  IF v_po <> 0 THEN
    RAISE EXCEPTION 'Po uklidu zustalo v catalog_slot_demand % radku.', v_po;
  END IF;

  RAISE NOTICE 'diet_tags maji kanonicke poradi. Obejiti poradim ani duplicitnim tagem uz neprojde, fronta zustala na % radcich.', v_pred;
END $$;
