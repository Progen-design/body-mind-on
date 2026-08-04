-- Aktivacni brana: zapnuti casove podminky (e) — ZATIM JEN obed a vecere.
--
-- ===========================================================================
-- CO SE ZAPINA A PROC PRAVE TEDA
-- ===========================================================================
-- Vetev (e) byla od 20260801081000 zakomentovana s tim, ze se zapne po slotech,
-- az denni import doplni katalog. Puvodni plan z 2. 8. cekal na ~9. 8., protoze
-- pocital s 26,9 % ztratou. Katalog mezitim narostl, takze obed + vecere dnes
-- stoji 29 receptu z 251 (11,6 %). Na to se cekat nemusi.
--
-- MERENI PRED ZMENOU (aktivni recepty, coalesce(ready_in_minutes,
-- prep_minutes_estimated) proti limitu slotu):
--
--   slot      limit  aktivnich  bez casu  deaktivuje  %       zbyde
--   obed        30      162        20         12     7,4 %     150
--   vecere      30       89         0         17    19,1 %      72
--   ---------------------------------------- zapina se jen tohle -------
--   snidane     20      151        12         39    25,8 %     112
--   svacina     15       52         0         16    30,8 %      36
--
-- Snidane a svacina se ZAMERNE NEZAPINAJI — vzaly by dalsich 55 receptu
-- a rozhodne se o nich zvlast. Limity 20 a 15 zustavaji zapsane nize.
--
-- ===========================================================================
-- POZOR: ZAKOMENTOVANY NAVRH SE NESMEL JEN ODKOMENTOVAT
-- ===========================================================================
-- Draft ve vetvi (e) zacinal takhle:
--
--   IF coalesce(NEW.ready_in_minutes, NEW.prep_minutes_estimated) IS NULL
--      OR coalesce(...) > CASE ... THEN  NEW.active := false;
--
-- Tedy "NEZNAME cas NEBO je nad limitem -> deaktivovat". To by vyradilo
-- 20 obedu a 12 snidani, ktere nemaji ani merenou hodnotu, ani odhad —
-- presne ta chyba, kterou uz jednou resila migrace
-- 20260802130000_structured_length_active_only.sql: "Aktivni cas by vysel NULL
-- — ne nula, ale 'nezname'. Nechat je s prazdnym odhadem by je casova podminka
-- vyradila, prestoze postup maji."
--
-- Podminka je proto prepsana do tvaru "ZNAME cas A JE nad limitem":
--   ... IS NOT NULL AND ... > limit
-- NULL od teto chvile nikdy nedeaktivuje. Az se odhady doplni, recept se
-- posoudi sam pres sweeper.
--
-- Poradi coalesce(ready_in_minutes, prep_minutes_estimated) je zamerne —
-- merena hodnota ma prednost pred odhadem. Sedi to se zbytkem kodu, viz
-- scripts/estimate-prep-time.mjs:247 ("dela trigger nad coalesce(...)").

-- ---------------------------------------------------------------------------
-- 1. Brana (trigger na INSERT i UPDATE)
--
-- Menim VYHRADNE vetev (e), zbytek tela je znak po znaku puvodni.
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

  -- 0) čeká na schválení člověkem
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

  -- b) Atwater podle MACRO_KCAL_GATE_TOLERANCE (10 %), high_fiber bránu obchází.
  IF NOT (
    'high_fiber' = ANY(NEW.diet_tags)
    OR (
      round(NEW.kcal) > 0
      AND round(4*NEW.protein_g + 4*NEW.carbs_g + 9*NEW.fat_g) > 0
      AND round(abs((round(NEW.kcal)::numeric - round(4*NEW.protein_g + 4*NEW.carbs_g + 9*NEW.fat_g)::numeric)
                    / round(NEW.kcal)::numeric) * 100, 1) <= 10.0
    )
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

  -- e) ČAS — ZAPNUTO PRO OBED A VECERI, limit 30 minut.
  --
  -- Snidane (limit 20) a svacina (limit 15) se ZATIM nevynucuji; rozhoduje se
  -- o nich zvlast, vzaly by dalsich 55 aktivnich receptu. Az se zapnou, staci
  -- rozsirit seznam slotu a limit vzit z CASE.
  --
  -- NULL NEDEAKTIVUJE. Podminka je "zname cas A je nad limitem", ne "nezname
  -- NEBO je nad limitem" — viz komentar na zacatku migrace.
  IF NEW.meal_type IN ('obed', 'vecere')
     AND coalesce(NEW.ready_in_minutes, NEW.prep_minutes_estimated) IS NOT NULL
     AND coalesce(NEW.ready_in_minutes, NEW.prep_minutes_estimated) > 30 THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  -- f) dietní tag musí sedět se surovinami
  --
  -- Model může vrátit diet_tags jaké chce; aktivní bude jen recept, jehož
  -- všechny suroviny mají příznak skutečně nastavený. Neznámá surovina
  -- se počítá jako konflikt.
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
-- 2. Sweeper — MUSI dostat tu samou podminku
--
-- sweep_recipe_catalog_activation() jen AKTIVUJE recepty, ktere uz pravidlum
-- vyhovuji. Kdyby casovou podminku neznal, pri nejblizsim nocnim behu by
-- vsech 29 deaktivovanych receptu zapnul zpatky a zmena by byla k nicemu.
--
-- Podminka je zrcadlem te v brane, vcetne toho, ze NULL cas aktivaci nebrani.
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
        OR (
          round(r.kcal) > 0
          AND round(4*r.protein_g + 4*r.carbs_g + 9*r.fat_g) > 0
          AND round(abs((round(r.kcal)::numeric - round(4*r.protein_g + 4*r.carbs_g + 9*r.fat_g)::numeric)
                        / round(r.kcal)::numeric) * 100, 1) <= 10.0
        )
      )
      AND NOT (
        'vegan' = ANY(r.diet_tags)
        AND array_length(public.recipe_diet_conflicts(r.ingredients, 'vegan'), 1) IS NOT NULL
      )
      AND NOT (
        'vegetarian' = ANY(r.diet_tags)
        AND array_length(public.recipe_diet_conflicts(r.ingredients, 'vegetarian'), 1) IS NOT NULL
      )
      -- ČAS: zapnuto pro obed a vecere (limit 30). Snidane 20 a svacina 15
      -- se zatim nevynucuji. NULL cas aktivaci NEBRANI — stejne jako v brane.
      AND NOT (
        r.meal_type IN ('obed', 'vecere')
        AND coalesce(r.ready_in_minutes, r.prep_minutes_estimated) IS NOT NULL
        AND coalesce(r.ready_in_minutes, r.prep_minutes_estimated) > 30
      )
    RETURNING r.id
  )
  SELECT count(*) INTO v_aktivovano FROM zmeneno;

  SELECT count(*) INTO v_aktivnich FROM public.recipes_catalog WHERE active;

  RETURN jsonb_build_object(
    'activated', v_aktivovano,
    'active_total', v_aktivnich,
    'swept_at', now()
  );
END;
$function$;

COMMENT ON FUNCTION public.sweep_recipe_catalog_activation() IS
  'Denni sweep: aktivuje recepty, ktere uz vyhovuji pravidlum (zmenily se unit_conversions, ingredients_nutrition, pantry seznam nebo se doplnil cas). Jen aktivuje, nikdy nedeaktivuje. Stejne pravidlo jako enforce_recipe_catalog_rules vcetne casove podminky pro obed/vecere.';

-- ---------------------------------------------------------------------------
-- 3. Doslo na stavajici recepty
--
-- Trigger je BEFORE INSERT OR UPDATE, takze sam od sebe uz aktivni recepty
-- neprepocita. Deaktivuji je cileny UPDATE.
--
-- PROC JE TENHLE UPDATE BEZPECNY A NESPUSTI JINE BRANY (nalez z minule
-- migrace: recept 614 ma count_main_ingredients = 10 z 10 a je na hrane):
-- brana ma na prvnim radku `IF NEW.active IS NOT TRUE THEN RETURN NEW`, takze
-- kdyz nastavim active = false PRIMO, trigger se okamzite vrati a zadnou dalsi
-- vetev (vcetne (c) na pocet surovin a (f) na diet tagy) nevyhodnocuje.
-- Recepty mimo cilovou mnozinu se navic nedotknu vubec, takze u nich zadny
-- trigger nefiruje.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _cil ON COMMIT DROP AS
SELECT id, meal_type, coalesce(ready_in_minutes, prep_minutes_estimated) AS cas
FROM public.recipes_catalog
WHERE active AND NOT pending_review
  AND meal_type IN ('obed', 'vecere')
  AND coalesce(ready_in_minutes, prep_minutes_estimated) IS NOT NULL
  AND coalesce(ready_in_minutes, prep_minutes_estimated) > 30;

CREATE TEMP TABLE _pred_aktivni ON COMMIT DROP AS
SELECT id FROM public.recipes_catalog WHERE active;

UPDATE public.recipes_catalog SET active = false
WHERE id IN (SELECT id FROM _cil);

-- ===========================================================================
-- Kontroly
-- ===========================================================================
DO $$
DECLARE
  v_cilu       integer;
  v_deakt      integer;
  v_null       integer;
  v_spatny_slot integer;
  v_navic      integer;
  v_obed       integer;
  v_vecere     integer;
  v_sweep_by   integer;
BEGIN
  SELECT count(*) INTO v_cilu FROM _cil;

  -- 1) Deaktivovalo se presne 29 receptu.
  IF v_cilu <> 29 THEN
    RAISE EXCEPTION 'Ocekavano 29 deaktivovanych receptu, je jich %.', v_cilu;
  END IF;

  -- 2) Vsechny jsou obed nebo vecere.
  SELECT count(*) INTO v_spatny_slot FROM _cil WHERE meal_type NOT IN ('obed','vecere');
  IF v_spatny_slot > 0 THEN
    RAISE EXCEPTION 'Mezi deaktivovanymi je % receptu z jineho slotu.', v_spatny_slot;
  END IF;

  -- 3) Zadny s neznamym casem. Tohle je ta puvodni past, takze kontrola navic:
  --    v celem katalogu nesmi byt deaktivovany recept obed/vecere bez casu.
  SELECT count(*) INTO v_null FROM _cil WHERE cas IS NULL;
  IF v_null > 0 THEN
    RAISE EXCEPTION 'Deaktivovalo se % receptu s NEZNAMYM casem.', v_null;
  END IF;

  SELECT count(*) INTO v_null
  FROM public.recipes_catalog
  WHERE NOT active AND NOT pending_review AND meal_type IN ('obed','vecere')
    AND coalesce(ready_in_minutes, prep_minutes_estimated) IS NULL
    AND id IN (SELECT id FROM _pred_aktivni);
  IF v_null > 0 THEN
    RAISE EXCEPTION 'Casova podminka vyradila % receptu bez znameho casu.', v_null;
  END IF;

  -- 4) Nic jineho se deaktivovat nesmelo.
  SELECT count(*) INTO v_navic
  FROM _pred_aktivni p JOIN public.recipes_catalog r ON r.id = p.id
  WHERE NOT r.active AND p.id NOT IN (SELECT id FROM _cil);
  IF v_navic > 0 THEN
    RAISE EXCEPTION 'Deaktivovalo se % receptu mimo cilovou mnozinu.', v_navic;
  END IF;

  -- 5) V obou slotech musi zustat aspon 50 aktivnich.
  SELECT count(*) INTO v_obed   FROM public.recipes_catalog WHERE active AND meal_type = 'obed';
  SELECT count(*) INTO v_vecere FROM public.recipes_catalog WHERE active AND meal_type = 'vecere';
  IF v_obed < 50 OR v_vecere < 50 THEN
    RAISE EXCEPTION 'Po zmene zbyva obed % a vecere % aktivnich, limit je 50.', v_obed, v_vecere;
  END IF;

  -- 6) Sweeper nesmi zadny z nich vratit zpatky. Nespoustim ho (aktivoval by
  --    i recepty odblokovane jinymi zmenami) — jen overuji jeho predikat.
  SELECT count(*) INTO v_sweep_by
  FROM public.recipes_catalog r
  WHERE r.id IN (SELECT id FROM _cil)
    AND NOT (
      r.meal_type IN ('obed','vecere')
      AND coalesce(r.ready_in_minutes, r.prep_minutes_estimated) IS NOT NULL
      AND coalesce(r.ready_in_minutes, r.prep_minutes_estimated) > 30
    );
  IF v_sweep_by > 0 THEN
    RAISE EXCEPTION 'Sweeper by % z deaktivovanych receptu aktivoval zpatky.', v_sweep_by;
  END IF;

  -- 7) Snidane a svacina se nesmely dotknout.
  SELECT count(*) INTO v_navic
  FROM _pred_aktivni p JOIN public.recipes_catalog r ON r.id = p.id
  WHERE NOT r.active AND r.meal_type IN ('snidane','svacina');
  IF v_navic > 0 THEN
    RAISE EXCEPTION 'Deaktivovalo se % snidani/svacin, i kdyz se nemely zapinat.', v_navic;
  END IF;

  RAISE NOTICE 'Cas zapnut pro obed+vecere (limit 30). Deaktivovano % receptu, zbyva obed % a vecere %.',
    v_cilu, v_obed, v_vecere;
END $$;
