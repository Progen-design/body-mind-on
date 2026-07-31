-- Rotační import neumí vyrobit večeři — oprava zapojení, ne obsahu.
--
-- runSpoonacularQueryImport odvozuje cílový slot z Spoonacular typu přes
-- SPOONACULAR_SEARCH_TYPE_TO_CATALOG, který mapuje main course / salad / soup na
-- 'obed' a na 'vecere' nemapuje NIC. Rotační cesta proto nemohla vložit jedinou
-- večeři. Potvrzeno i daty: všech 60 aktivních vecere receptů vzniklo mezi
-- 5. 6. a 20. 7. 2026, tedy před zavedením rotace (29. 7.).
--
-- Příčina není chybná mapovací tabulka, ale to, že se slot odvozuje. Spoonacular
-- ve své taxonomii pojem večeře nemá (main course, salad, soup, snack, dessert,
-- breakfast, …), takže jakékoli odvození je ztrátové z principu. Slot je naše
-- produktová veličina — kalorické pásmo plus pravidla jednoduchosti — a dotaz si
-- ho proto říká sám.
--
-- Downstream je už hotový: catalogImportGate má pro 'vecere' plná pravidla
-- (maxMainIngredients 6, maxReadyTime 20, maxSteps 6, protein násobič 1.5).

-- ---------------------------------------------------------------------------
-- 1. Cílový slot jako deklarovaný atribut dotazu
-- ---------------------------------------------------------------------------
ALTER TABLE public.spoonacular_import_queries
  ADD COLUMN IF NOT EXISTS catalog_meal_type text;

COMMENT ON COLUMN public.spoonacular_import_queries.catalog_meal_type IS
  'Cilovy slot v recipes_catalog. Deklarovany, ne odvozeny ze Spoonacular typu — jejich taxonomie vecere nezna. meal_type/params.type zustava tim, co se posila na API.';

UPDATE public.spoonacular_import_queries
SET catalog_meal_type = CASE meal_type
      WHEN 'breakfast'   THEN 'snidane'
      WHEN 'main course' THEN 'obed'
      WHEN 'salad'       THEN 'obed'
      WHEN 'soup'        THEN 'obed'
      WHEN 'snack'       THEN 'svacina'
      WHEN 'dessert'     THEN 'svacina'
    END
WHERE catalog_meal_type IS NULL;

ALTER TABLE public.spoonacular_import_queries
  ALTER COLUMN catalog_meal_type SET NOT NULL;

ALTER TABLE public.spoonacular_import_queries
  DROP CONSTRAINT IF EXISTS spoonacular_import_queries_catalog_meal_type_chk;
ALTER TABLE public.spoonacular_import_queries
  ADD CONSTRAINT spoonacular_import_queries_catalog_meal_type_chk
    CHECK (catalog_meal_type IN ('snidane', 'obed', 'svacina', 'vecere'));

CREATE INDEX IF NOT EXISTS spoonacular_import_queries_slot_priority_idx
  ON public.spoonacular_import_queries (catalog_meal_type, priority, last_run_at NULLS FIRST)
  WHERE exhausted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Kalorické pásmo obědu
--
-- Bez horní meze u oběda by večeřové pásmo nemělo smysl — oběd by 480–750 kcal
-- pobral taky a rozdělení slotů by bylo jen nominální.
-- POZOR: hodnoty jsou výchozí produktový odhad, NE měření. Aktivní obědy mají
-- průměr 763 kcal, večeře 690 kcal, pásma se reálně překrývají.
-- ---------------------------------------------------------------------------
UPDATE public.spoonacular_import_queries
SET params = params || jsonb_build_object('minCalories', 520, 'maxCalories', 900)
WHERE catalog_meal_type = 'obed';

-- ---------------------------------------------------------------------------
-- 3. Večeřové dotazy — klony main course / salad / soup
--
-- maxReadyTime jen 20: gate pro 'vecere' zahazuje cokoli nad 20 min, takže dotazy
-- s 30 a 45 by jen pálily kvótu na recepty, které stejně neprojdou. (Stejná úvaha
-- platí i pro stávající obědové dotazy s rt=30/45 — neřeším to tady, ale je to
-- jeden z důvodů, proč 40 běhů vložilo 0 receptů.)
--
-- query_signature se drží stávajícího formátu, jen s příponou |slot=vecere —
-- jinak by byl podpis večeřového klonu k nerozeznání od obědového originálu
-- a v spoonacular_import_runs by je nešlo rozlišit.
-- 3 typy × 8 kuchyní × 4 diety × 1 maxReadyTime = 96 dotazů
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_meal text;
  v_cuisine text;
  v_diet text;
  v_ready int := 20;
  v_params jsonb;
  v_sig text;
BEGIN
  FOREACH v_meal IN ARRAY ARRAY['main course', 'salad', 'soup'] LOOP
    FOREACH v_cuisine IN ARRAY ARRAY[
      'italian', 'mexican', 'mediterranean', 'chinese', 'american', 'indian', 'greek', 'french'
    ] LOOP
      FOREACH v_diet IN ARRAY ARRAY['', 'vegetarian', 'vegan', 'gluten free'] LOOP
        v_params := jsonb_strip_nulls(jsonb_build_object(
          'type', v_meal,
          'cuisine', v_cuisine,
          'diet', NULLIF(v_diet, ''),
          'maxReadyTime', v_ready,
          'minCalories', 480,
          'maxCalories', 750
        ));
        v_sig := v_meal || '|cu=' || v_cuisine || '|di=' || COALESCE(v_diet, '-')
                 || '|rt=' || v_ready::text || '|slot=vecere';

        INSERT INTO public.spoonacular_import_queries (
          meal_type, catalog_meal_type, params, query_signature, priority
        )
        SELECT v_meal, 'vecere', v_params, v_sig,
               CASE WHEN v_diet = 'vegan' THEN 10 ELSE 100 END
        WHERE NOT EXISTS (
          SELECT 1 FROM public.spoonacular_import_queries q
          WHERE q.query_signature = v_sig
        );
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Kontrola: 96 nových večeřových dotazů, žádný dotaz bez slotu.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_vecere integer;
  v_bez_slotu integer;
BEGIN
  SELECT count(*) INTO v_vecere
    FROM public.spoonacular_import_queries WHERE catalog_meal_type = 'vecere';
  SELECT count(*) INTO v_bez_slotu
    FROM public.spoonacular_import_queries WHERE catalog_meal_type IS NULL;

  IF v_vecere <> 96 THEN
    RAISE EXCEPTION 'Vecerovych dotazu je %, cekali jsme 96.', v_vecere;
  END IF;
  IF v_bez_slotu <> 0 THEN
    RAISE EXCEPTION 'Dotazu bez catalog_meal_type je %, cekali jsme 0.', v_bez_slotu;
  END IF;
END $$;
