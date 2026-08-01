-- Cuisine ven z rotace — byla to falešná diverzita, která dotazy uškrtila na nulu.
--
-- Sonda 31. 7. 2026 ukázala, že „vegan + snídaně + do 15 min" má v celém
-- Spoonaculuru 2 recepty. Přidání cuisine z toho udělá 0 — a přesně to se dělo:
-- 43 běhů, 45 vrácených receptů dohromady, 0 vložených. Je to stejná falešná
-- diverzita jako `sort`, kterou odstranila migrace phase2; u cuisine zůstala.
--
-- 288 dotazů (8 kuchyní × 36 kombinací) se scvrkne na 36 skutečně různých:
--   snidane  breakfast                     × 4 diety =  4
--   obed     main course / salad / soup    × 4 diety = 12
--   vecere   main course / salad / soup    × 4 diety = 12
--   svacina  snack / dessert               × 4 diety =  8
-- Stránkuje se přes next_offset, ne přes umělé kombinace parametrů.
--
-- Tři veganské snídaně, které se dnes neprávem odepsaly (jediná prázdná odpověď
-- → exhausted_at), tímhle reseedem zanikají i s cuisine variantami a nahrazuje je
-- jeden čerstvý dotaz `breakfast|di=vegan|rt=15|slot=snidane`. Samostatný reset
-- proto není potřeba.

-- ---------------------------------------------------------------------------
-- 1. Důvod odepsání — prázdný pool není totéž co vyčerpaný
--
-- pool_exhausted: stránkovali jsme a došli na konec → retry nemá smysl
-- pool_empty:     hned první stránka prázdná, filtr moc úzký → po rozvolnění
--                 filtrů jde tahle skupina vrátit do rotace jedním UPDATE
-- ---------------------------------------------------------------------------
ALTER TABLE public.spoonacular_import_queries
  ADD COLUMN IF NOT EXISTS retired_reason text;

ALTER TABLE public.spoonacular_import_queries
  DROP CONSTRAINT IF EXISTS spoonacular_import_queries_retired_reason_chk;
ALTER TABLE public.spoonacular_import_queries
  ADD CONSTRAINT spoonacular_import_queries_retired_reason_chk
    CHECK (retired_reason IS NULL OR retired_reason IN ('pool_exhausted', 'pool_empty'));

COMMENT ON COLUMN public.spoonacular_import_queries.retired_reason IS
  'Proc dotaz opustil rotaci. pool_exhausted = dostranovali jsme na konec. pool_empty = prvni stranka byla prazdna, filtr je moc uzky a po rozvolneni jde dotaz vratit.';

-- ---------------------------------------------------------------------------
-- 2. Přeseedování bez cuisine
-- ---------------------------------------------------------------------------
TRUNCATE public.spoonacular_import_queries;

DO $$
DECLARE
  v_slot text;
  v_meal text;
  v_meals text[];
  v_diet text;
  v_ready int;
  v_min int;
  v_max int;
  v_params jsonb;
  v_sig text;
BEGIN
  FOREACH v_slot IN ARRAY ARRAY['snidane', 'obed', 'vecere', 'svacina'] LOOP
    -- maxReadyTime shodný s gate v catalogImportGate.js, kalorické pásmo slotu.
    CASE v_slot
      WHEN 'snidane' THEN
        v_meals := ARRAY['breakfast'];                   v_ready := 15; v_min := 430; v_max := NULL;
      WHEN 'obed' THEN
        v_meals := ARRAY['main course','salad','soup'];  v_ready := 20; v_min := 520; v_max := 900;
      WHEN 'vecere' THEN
        v_meals := ARRAY['main course','salad','soup'];  v_ready := 20; v_min := 480; v_max := 750;
      WHEN 'svacina' THEN
        v_meals := ARRAY['snack','dessert'];             v_ready := 10; v_min := 160; v_max := NULL;
    END CASE;

    FOREACH v_meal IN ARRAY v_meals LOOP
      FOREACH v_diet IN ARRAY ARRAY['', 'vegetarian', 'vegan', 'gluten free'] LOOP
        v_params := jsonb_strip_nulls(jsonb_build_object(
          'type', v_meal,
          'diet', NULLIF(v_diet, ''),
          'maxReadyTime', v_ready,
          'minCalories', v_min,
          'maxCalories', v_max
        ));
        v_sig := v_meal || '|di=' || v_diet || '|rt=' || v_ready::text || '|slot=' || v_slot;

        INSERT INTO public.spoonacular_import_queries (
          meal_type, catalog_meal_type, params, query_signature, priority
        ) VALUES (
          v_meal, v_slot, v_params, v_sig,
          -- Vegan napřed: katalog na něj nestačí a je kvůli tomu vypnutý v UI.
          CASE WHEN v_diet = 'vegan' THEN 10 ELSE 100 END
        );
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Kontrola: 36 dotazů, žádný s cuisine, 9 veganských v přednosti, nic odepsaného.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_celkem integer;
  v_cuisine integer;
  v_vegan integer;
  v_odepsanych integer;
BEGIN
  SELECT count(*) INTO v_celkem      FROM public.spoonacular_import_queries;
  SELECT count(*) INTO v_cuisine     FROM public.spoonacular_import_queries WHERE params ? 'cuisine';
  SELECT count(*) INTO v_vegan       FROM public.spoonacular_import_queries WHERE params->>'diet' = 'vegan' AND priority = 10;
  SELECT count(*) INTO v_odepsanych  FROM public.spoonacular_import_queries WHERE exhausted_at IS NOT NULL;

  IF v_celkem <> 36 THEN
    RAISE EXCEPTION 'Dotazu je %, cekali jsme 36.', v_celkem;
  END IF;
  IF v_cuisine <> 0 THEN
    RAISE EXCEPTION 'Dotazu s cuisine je %, cekali jsme 0.', v_cuisine;
  END IF;
  IF v_vegan <> 9 THEN
    RAISE EXCEPTION 'Veganskych dotazu v prednosti je %, cekali jsme 9.', v_vegan;
  END IF;
  IF v_odepsanych <> 0 THEN
    RAISE EXCEPTION 'Odepsanych dotazu je %, cekali jsme 0.', v_odepsanych;
  END IF;
END $$;
