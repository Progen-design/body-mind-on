-- Casova podminka (e) rozsirena na snidani a svacinu — zapnuta pro vsechny sloty.
--
-- ===========================================================================
-- CO SE ZAPINA
-- ===========================================================================
-- Migrace 20260805090000 zapnula cas jen pro obed a veceri (limit 30). Zbytek
-- byl pripraveny v komentari. Ted se dopina snidane (20) a svacina (15), takze
-- podminka plati na vsechny ctyri sloty a limit se bere z public.slot_time_limit().
--
-- MERENI PRED ZMENOU (aktivni recepty, coalesce(ready_in_minutes,
-- prep_minutes_estimated) proti limitu slotu):
--
--   slot      limit  aktivnich  bez casu  deaktivuje  zbyde
--   snidane     20      161        12         39       122
--   svacina     15       66         0         16        50
--   obed        30      156        20          0       156   (uz zapnuto)
--   vecere      30       80         0          0        80   (uz zapnuto)
--
-- Celkem 55 receptu. Pocty nad limitem sedi s merenim ze zadani (39 a 16),
-- celkove pocty jsou vyssi — generator mezitim pridal recepty.
--
-- ===========================================================================
-- NULL NEDEAKTIVUJE
-- ===========================================================================
-- Podminka je "ZNAME cas A JE nad limitem", ne "nezname NEBO je nad limitem".
-- Zakomentovany draft z 20260801081000 mel puvodne `IS NULL OR ... > limit`,
-- coz by vyradilo 12 snidani a 20 obedu bez merene hodnoty i odhadu. Tvar
-- s IS NOT NULL se drzi od 20260805090000 a plati dal.

-- ---------------------------------------------------------------------------
-- Limit slotu jako FUNKCE, ne CASE na dvou mistech
--
-- Dva duvody:
--   1) Limity byly dosud opsane v brane i ve sweeperu. Jedna funkce znamena,
--      ze se nemuzou rozejit — stejny duvod jako u atwater_ok().
--   2) `IF ... > CASE ... END THEN` plpgsql NEPRELOZI. Parser hleda ukoncujici
--      THEN a najde ten UVNITR CASE, takze spadne na "syntax error at end of
--      input". Overeno, prvni verze teto migrace na tom stala.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.slot_time_limit(p_meal_type text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $function$
  select case p_meal_type
           when 'snidane' then 20
           when 'svacina' then 15
           else 30           -- obed a vecere
         end;
$function$;

COMMENT ON FUNCTION public.slot_time_limit(text) IS
  'Limit aktivniho casu pripravy v minutach podle slotu: snidane 20, svacina 15, obed a vecere 30. Jedina definice pro branu i sweeper.';

CREATE TEMP TABLE _cil ON COMMIT DROP AS
SELECT id, meal_type, coalesce(ready_in_minutes, prep_minutes_estimated) AS cas
FROM public.recipes_catalog
WHERE active AND NOT pending_review
  AND meal_type IN ('snidane', 'svacina')
  AND coalesce(ready_in_minutes, prep_minutes_estimated) IS NOT NULL
  AND coalesce(ready_in_minutes, prep_minutes_estimated)
      > public.slot_time_limit(meal_type);

CREATE TEMP TABLE _pred_aktivni ON COMMIT DROP AS
SELECT id, meal_type, diet_tags FROM public.recipes_catalog WHERE active;

-- ---------------------------------------------------------------------------
-- 1. Brana — vetev (e) uz nema seznam slotu, limit bere z slot_time_limit()
--
-- Zbytek tela je znak po znaku shodny s 20260805150000 (vcetne vetve (b),
-- ktera od te migrace vola atwater_ok s vlakninou).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_recipe_catalog_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.pending_review THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  -- a) kcal a všechna tři makra vyplněná
  IF NEW.kcal IS NULL OR NEW.kcal <= 0
     OR NEW.protein_g IS NULL OR NEW.carbs_g IS NULL OR NEW.fat_g IS NULL THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  -- b) Atwater, tolerance 10 %. Vláknina se odečítá — viz public.atwater_ok.
  IF NOT (
    'high_fiber' = ANY(NEW.diet_tags)
    OR public.atwater_ok(NEW.kcal, NEW.protein_g, NEW.carbs_g, NEW.fat_g,
                         public.recipe_fiber_g(NEW.ingredients), 10.0)
  ) THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  -- c) počet hlavních surovin
  IF public.count_main_ingredients(NEW.ingredients) > 10 THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  -- d) český název
  IF NEW.name_cs IS NULL OR btrim(NEW.name_cs) = '' THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  -- e) ČAS — ZAPNUTO PRO VŠECHNY SLOTY.
  --      snidane 20, svacina 15, obed 30, vecere 30.
  --
  -- NULL NEDEAKTIVUJE. Podmínka je "známe čas A je nad limitem". Recept bez
  -- měřené hodnoty i bez odhadu zůstává aktivní a posoudí se sám, až odhad
  -- doplní scripts/estimate-prep-time.mjs — přes sweeper.
  IF coalesce(NEW.ready_in_minutes, NEW.prep_minutes_estimated) IS NOT NULL
     AND coalesce(NEW.ready_in_minutes, NEW.prep_minutes_estimated)
         > public.slot_time_limit(NEW.meal_type) THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  -- f) dietní tag musí sedět se surovinami
  IF 'vegan' = ANY(NEW.diet_tags)
     AND array_length(public.recipe_diet_conflicts(NEW.ingredients, 'vegan'), 1) IS NOT NULL THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  IF 'vegetarian' = ANY(NEW.diet_tags)
     AND array_length(public.recipe_diet_conflicts(NEW.ingredients, 'vegetarian'), 1) IS NOT NULL THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Sweeper — tatáž podmínka, jinak by v noci vrátil 55 receptů zpátky
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sweep_recipe_catalog_activation()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_aktivovano integer;
  v_aktivnich  integer;
BEGIN
  WITH zmeneno AS (
    UPDATE public.recipes_catalog r
    SET active = true
    WHERE r.active = false
      AND NOT r.pending_review
      AND r.kcal > 0
      AND r.protein_g IS NOT NULL AND r.carbs_g IS NOT NULL AND r.fat_g IS NOT NULL
      AND public.count_main_ingredients(r.ingredients) <= 10
      AND r.name_cs IS NOT NULL AND btrim(r.name_cs) <> ''
      AND (
        'high_fiber' = ANY(r.diet_tags)
        OR public.atwater_ok(r.kcal, r.protein_g, r.carbs_g, r.fat_g,
                             public.recipe_fiber_g(r.ingredients), 10.0)
      )
      AND NOT (
        'vegan' = ANY(r.diet_tags)
        AND array_length(public.recipe_diet_conflicts(r.ingredients, 'vegan'), 1) IS NOT NULL
      )
      AND NOT (
        'vegetarian' = ANY(r.diet_tags)
        AND array_length(public.recipe_diet_conflicts(r.ingredients, 'vegetarian'), 1) IS NOT NULL
      )
      -- ČAS: všechny sloty (snidane 20, svacina 15, obed 30, vecere 30).
      -- NULL čas aktivaci NEBRÁNÍ — stejně jako v bráně.
      AND NOT (
        coalesce(r.ready_in_minutes, r.prep_minutes_estimated) IS NOT NULL
        AND coalesce(r.ready_in_minutes, r.prep_minutes_estimated)
            > public.slot_time_limit(r.meal_type)
      )
    RETURNING r.id
  )
  SELECT count(*) INTO v_aktivovano FROM zmeneno;
  SELECT count(*) INTO v_aktivnich FROM public.recipes_catalog WHERE active;
  RETURN jsonb_build_object('activated', v_aktivovano, 'active_total', v_aktivnich, 'swept_at', now());
END;
$function$;

COMMENT ON FUNCTION public.sweep_recipe_catalog_activation() IS
  'Denni sweep: aktivuje recepty, ktere uz vyhovuji pravidlum. Jen aktivuje, nikdy nedeaktivuje. Stejne pravidlo jako enforce_recipe_catalog_rules vcetne casove podminky pro vsechny sloty.';

-- ---------------------------------------------------------------------------
-- 3. Doraz na stavajici recepty
--
-- Cileny UPDATE na active = false. Brana ma na prvnim radku
-- `IF NEW.active IS NOT TRUE THEN RETURN NEW`, takze pri primem nastaveni false
-- se okamzite vraci a zadnou dalsi vetev nevyhodnocuje — bezpecne i pro
-- recepty na hrane jinych bran (14 s konfliktem diet_tags, 614 na hrane
-- poctu surovin, 7 na hrane Atwatera).
-- ---------------------------------------------------------------------------
UPDATE public.recipes_catalog SET active = false
WHERE id IN (SELECT id FROM _cil);

-- ===========================================================================
-- Kontroly
-- ===========================================================================
DO $$
DECLARE
  v_cilu     integer;
  v_snidane  integer;
  v_svacina  integer;
  v_null     integer;
  v_jiny     integer;
  v_navic    integer;
  v_sweep    integer;
BEGIN
  SELECT count(*) INTO v_cilu FROM _cil;

  -- 1) Deaktivovaly se jen snidane a svaciny.
  SELECT count(*) INTO v_jiny FROM _cil WHERE meal_type NOT IN ('snidane','svacina');
  IF v_jiny > 0 THEN
    RAISE EXCEPTION 'Mezi deaktivovanymi je % receptu z jineho slotu.', v_jiny;
  END IF;

  -- 2) Zadny s neznamym casem — ani v cilove mnozine, ani v celem katalogu.
  SELECT count(*) INTO v_null FROM _cil WHERE cas IS NULL;
  IF v_null > 0 THEN
    RAISE EXCEPTION 'Deaktivovalo se % receptu s NEZNAMYM casem.', v_null;
  END IF;

  SELECT count(*) INTO v_null
  FROM _pred_aktivni p JOIN public.recipes_catalog r ON r.id = p.id
  WHERE NOT r.active AND coalesce(r.ready_in_minutes, r.prep_minutes_estimated) IS NULL;
  IF v_null > 0 THEN
    RAISE EXCEPTION 'Casova podminka vyradila % receptu bez znameho casu.', v_null;
  END IF;

  -- 3) Nic mimo cilovou mnozinu se deaktivovat nesmelo.
  SELECT count(*) INTO v_navic
  FROM _pred_aktivni p JOIN public.recipes_catalog r ON r.id = p.id
  WHERE NOT r.active AND p.id NOT IN (SELECT id FROM _cil);
  IF v_navic > 0 THEN
    RAISE EXCEPTION 'Deaktivovalo se % receptu mimo cilovou mnozinu.', v_navic;
  END IF;

  -- 4) V obou slotech musi zustat aspon 30 aktivnich.
  SELECT count(*) INTO v_snidane FROM public.recipes_catalog WHERE active AND meal_type='snidane';
  SELECT count(*) INTO v_svacina FROM public.recipes_catalog WHERE active AND meal_type='svacina';
  IF v_snidane < 30 OR v_svacina < 30 THEN
    RAISE EXCEPTION 'Zbyva snidane % a svacina % aktivnich, limit je 30.', v_snidane, v_svacina;
  END IF;

  -- 5) Sweeper nesmi zadny z nich vratit zpatky. Nespoustim ho (aktivoval by
  --    i recepty odblokovane jinymi zmenami) — jen overuji jeho predikat.
  SELECT count(*) INTO v_sweep
  FROM public.recipes_catalog r WHERE r.id IN (SELECT id FROM _cil)
    AND NOT (
      coalesce(r.ready_in_minutes, r.prep_minutes_estimated) IS NOT NULL
      AND coalesce(r.ready_in_minutes, r.prep_minutes_estimated)
          > public.slot_time_limit(r.meal_type)
    );
  IF v_sweep > 0 THEN
    RAISE EXCEPTION 'Sweeper by % z deaktivovanych receptu aktivoval zpatky.', v_sweep;
  END IF;

  -- 6) V zadnem slotu nesmi zustat aktivni recept nad svym limitem.
  SELECT count(*) INTO v_navic FROM public.recipes_catalog
  WHERE active AND NOT pending_review
    AND coalesce(ready_in_minutes, prep_minutes_estimated) IS NOT NULL
    AND coalesce(ready_in_minutes, prep_minutes_estimated)
        > public.slot_time_limit(meal_type);
  IF v_navic > 0 THEN
    RAISE EXCEPTION 'Aktivnich receptu nad limitem zustalo %.', v_navic;
  END IF;

  RAISE NOTICE 'Cas zapnut pro vsechny sloty. Deaktivovano % receptu, zbyva snidane % a svacina %.',
    v_cilu, v_snidane, v_svacina;
END $$;
