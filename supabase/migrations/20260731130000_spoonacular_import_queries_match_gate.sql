-- Rotační dotazy srovnané s gate — konec pálení kvóty na recepty, které stejně neprojdou.
--
-- Dosavadní sada měla u každé kombinace tři varianty maxReadyTime (20/30/45), jenže
-- gate v catalogImportGate.js zahazuje cokoli nad svůj limit:
--   snidane 15 | svacina 10 | obed 20 | vecere 20
-- Nadlimitních bylo 480 z 672 dotazů (71 %); u snídaní a svačin VŠECHNY, protože
-- i nejnižší varianta (20) je nad jejich limitem. Takový dotaz zaplatí bod za volání
-- a vrácené recepty pak lokálně vyhodí gate. Je to jeden z důvodů, proč 43 běhů
-- vložilo 0 receptů.
--
-- Přeseedování místo UPDATE + DELETE: kdyby se jen snížil maxReadyTime, zůstaly by
-- ze tří variant tři identické dotazy vracející totéž, tedy trojnásobná spotřeba na
-- duplicity. A hlavně by query_signature dál tvrdil rt=20 tam, kde params mají 15.
-- Rotační stav se ztrácí, ale měly ho 3 řádky ze 672 — prakticky zdarma.
--
-- query_signature nově nese |slot=, protože obed a vecere sdílejí stejné Spoonacular
-- typy i maxReadyTime a jinak by byly k nerozeznání. Podpisy ve spoonacular_import_runs
-- ze starých běhů tím přestávají odpovídat aktuálním dotazům — to je cena za truncate,
-- historie běhů zůstává čitelná sama o sobě.

TRUNCATE public.spoonacular_import_queries;

DO $$
DECLARE
  v_slot text;
  v_meal text;
  v_meals text[];
  v_cuisine text;
  v_diet text;
  v_ready int;
  v_min int;
  v_max int;
  v_params jsonb;
  v_sig text;
BEGIN
  FOREACH v_slot IN ARRAY ARRAY['snidane', 'obed', 'vecere', 'svacina'] LOOP
    -- Spoonacular typy, maxReadyTime shodný s gate, kalorické pásmo slotu.
    CASE v_slot
      WHEN 'snidane' THEN
        v_meals := ARRAY['breakfast'];              v_ready := 15; v_min := 430; v_max := NULL;
      WHEN 'obed' THEN
        v_meals := ARRAY['main course','salad','soup']; v_ready := 20; v_min := 520; v_max := 900;
      WHEN 'vecere' THEN
        v_meals := ARRAY['main course','salad','soup']; v_ready := 20; v_min := 480; v_max := 750;
      WHEN 'svacina' THEN
        v_meals := ARRAY['snack','dessert'];        v_ready := 10; v_min := 160; v_max := NULL;
    END CASE;

    FOREACH v_meal IN ARRAY v_meals LOOP
      FOREACH v_cuisine IN ARRAY ARRAY[
        'italian', 'mexican', 'mediterranean', 'chinese', 'american', 'indian', 'greek', 'french'
      ] LOOP
        FOREACH v_diet IN ARRAY ARRAY['', 'vegetarian', 'vegan', 'gluten free'] LOOP
          v_params := jsonb_strip_nulls(jsonb_build_object(
            'type', v_meal,
            'cuisine', v_cuisine,
            'diet', NULLIF(v_diet, ''),
            'maxReadyTime', v_ready,
            'minCalories', v_min,
            'maxCalories', v_max
          ));
          v_sig := v_meal || '|cu=' || v_cuisine || '|di=' || v_diet
                   || '|rt=' || v_ready::text || '|slot=' || v_slot;

          INSERT INTO public.spoonacular_import_queries (
            meal_type, catalog_meal_type, params, query_signature, priority
          ) VALUES (
            v_meal, v_slot, v_params, v_sig,
            -- Vegan napřed: katalog má 6 snídaní / 4 obědy / 4 svačiny / 3 večeře,
            -- takže se vegan v UI musel dočasně vypnout.
            CASE WHEN v_diet = 'vegan' THEN 10 ELSE 100 END
          );
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Kontrola: 288 dotazů, žádný nad limitem gate, 72 veganských v přednosti.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_celkem integer;
  v_nadlimit integer;
  v_vegan integer;
BEGIN
  SELECT count(*) INTO v_celkem FROM public.spoonacular_import_queries;

  SELECT count(*) INTO v_nadlimit
    FROM public.spoonacular_import_queries q
    JOIN (VALUES ('snidane',15), ('svacina',10), ('obed',20), ('vecere',20)) AS g(slot, lim)
      ON g.slot = q.catalog_meal_type
   WHERE (q.params->>'maxReadyTime')::int > g.lim;

  SELECT count(*) INTO v_vegan
    FROM public.spoonacular_import_queries
   WHERE params->>'diet' = 'vegan' AND priority = 10;

  IF v_celkem <> 288 THEN
    RAISE EXCEPTION 'Dotazu je %, cekali jsme 288.', v_celkem;
  END IF;
  IF v_nadlimit <> 0 THEN
    RAISE EXCEPTION 'Nadlimitnich dotazu je %, cekali jsme 0.', v_nadlimit;
  END IF;
  IF v_vegan <> 72 THEN
    RAISE EXCEPTION 'Veganskych dotazu v prednosti je %, cekali jsme 72.', v_vegan;
  END IF;
END $$;
