-- Doskalovani receptu, ktere v migraci 20260804200000 zbyly jako zaminovane.
--
-- ===========================================================================
-- KONTEXT
-- ===========================================================================
-- Migrace 20260804200000 srovnala 30 z 36 receptu na invariant "amount je na
-- porci, servings = 1". Sest jich vynechala, protoze mely nevyreseny konflikt
-- diet_tags a trigger enforce_recipe_catalog_rules (brana f) je pri UPDATE
-- deaktivuje.
--
-- Po doplneni slovniku (20260804210000) jsou z tech sesti dva bez konfliktu:
--   id  39  Ovesna kase s ocelovymi vlockami  (servings 8)
--             odminovan aliasem orechove ovesne vlocky -> musli
--   id 207  Pecene makarony se syrem          (servings 8)
--             odminovan aliasem mild cheddar -> cheddar
--
-- Zbyle ctyri zustavaji a je proc:
--   id  83  konflikt "poznamka: pouzil jsem pomerance" — veta z postupu
--   id 205  konflikt "masova omacka" — recept ma spatny tag vegetarian
--   id 252  konflikt "vanilka" — 227 g "8 oz vanilky", nejspis vanilkovy jogurt
--   id 253  konflikt "jahodovy marshmallow" — zelatina, vegetarianstvi nejiste
--
-- POSTUP JE STEJNY jako v 20260804200000: zaloha puvodniho stavu do
-- *_original, amount se deli poctem porci, servings = 1. ULOZENE kcal SE
-- NEPREPOCITAVA — neni chybne, pochazi z nutricnich dat Spoonacularu a uz je
-- na porci. Chybne bylo jen skalovani surovin.
--
-- MERENI PRED ZMENOU (soucet ze surovin vs ulozene kcal na porci):
--   id  39  ulozeno 189 kcal, soucet 1074 -> po deleni 8 je 134, odchylka 29 %
--   id 207  ulozeno 367 kcal, soucet 4464 -> po deleni 8 je 558, odchylka 52 %
-- Zbytkova odchylka je nepresnost souctu ze surovin (obecne gramaze, aliasy),
-- ne dalsi chyba v konvenci — stejne jako u 16 receptu z predchoziho kola.

-- Cilove recepty do temp tabulky, aby kontroly overovaly presne tyhle radky.
-- (Marker servings_original > 1 na to nestaci, pouziva ho i jina cesta zapisu —
-- viz komentar v 20260804200000.)
CREATE TEMP TABLE _cil ON COMMIT DROP AS
SELECT r.id
FROM public.recipes_catalog r
WHERE r.active
  AND r.servings > 1
  AND NOT (
       ('vegan' = ANY(r.diet_tags)
         AND array_length(public.recipe_diet_conflicts(r.ingredients,'vegan'),1) IS NOT NULL)
    OR ('vegetarian' = ANY(r.diet_tags)
         AND array_length(public.recipe_diet_conflicts(r.ingredients,'vegetarian'),1) IS NOT NULL)
  );

UPDATE public.recipes_catalog r SET
  ingredients_original = coalesce(r.ingredients_original, r.ingredients),
  servings_original    = coalesce(r.servings_original, r.servings),
  kcal_original        = coalesce(r.kcal_original, r.kcal),
  ingredients = (
    SELECT jsonb_agg(
             CASE WHEN jsonb_typeof(t.elem->'amount') = 'number'
                  THEN jsonb_set(t.elem, '{amount}',
                         to_jsonb(round((t.elem->>'amount')::numeric / r.servings, 3)))
                  ELSE t.elem END
             ORDER BY t.ord)
    FROM jsonb_array_elements(r.ingredients) WITH ORDINALITY AS t(elem, ord)
  ),
  servings = 1
WHERE r.id IN (SELECT id FROM _cil);

-- ===========================================================================
-- Kontroly
-- ===========================================================================
DO $$
DECLARE
  v_cilu         integer;
  v_zbyva        integer;
  v_bez_zalohy   integer;
  v_pocet_prvku  integer;
  v_deaktivovano integer;
  v_spatnych     integer;
BEGIN
  SELECT count(*) INTO v_cilu FROM _cil;
  IF v_cilu <> 2 THEN
    RAISE EXCEPTION 'Ocekavany 2 cilove recepty (39, 207), je jich %.', v_cilu;
  END IF;

  -- 1) Zbyt smi jen zaminovane recepty.
  SELECT count(*) INTO v_zbyva FROM public.recipes_catalog r
  WHERE r.active AND r.servings > 1
    AND NOT (
         ('vegan' = ANY(r.diet_tags) AND array_length(public.recipe_diet_conflicts(r.ingredients,'vegan'),1) IS NOT NULL)
      OR ('vegetarian' = ANY(r.diet_tags) AND array_length(public.recipe_diet_conflicts(r.ingredients,'vegetarian'),1) IS NOT NULL));
  IF v_zbyva > 0 THEN
    RAISE EXCEPTION 'Zustalo % nezaminovanych receptu se servings > 1.', v_zbyva;
  END IF;

  -- 2) Zaloha a servings = 1 u vsech cilovych.
  SELECT count(*) INTO v_bez_zalohy FROM public.recipes_catalog r JOIN _cil c ON c.id = r.id
  WHERE r.ingredients_original IS NULL OR r.kcal_original IS NULL
     OR r.servings_original IS NULL OR r.servings <> 1;
  IF v_bez_zalohy > 0 THEN
    RAISE EXCEPTION 'U % cilovych receptu chybi zaloha nebo neni servings = 1.', v_bez_zalohy;
  END IF;

  -- 3) jsonb_agg nesmel zahodit ani pridat surovinu.
  SELECT count(*) INTO v_pocet_prvku FROM public.recipes_catalog r JOIN _cil c ON c.id = r.id
  WHERE jsonb_array_length(r.ingredients) <> jsonb_array_length(r.ingredients_original);
  IF v_pocet_prvku > 0 THEN
    RAISE EXCEPTION 'U % receptu se zmenil pocet surovin.', v_pocet_prvku;
  END IF;

  -- 4) Trigger nesmel zadny opravovany recept deaktivovat.
  SELECT count(*) INTO v_deaktivovano FROM public.recipes_catalog r JOIN _cil c ON c.id = r.id
  WHERE NOT r.active;
  IF v_deaktivovano > 0 THEN
    RAISE EXCEPTION 'Update deaktivoval % receptu.', v_deaktivovano;
  END IF;

  -- 5) Po skalovani uz soucet ze surovin nesmi byt nasobkem porci.
  SELECT count(*) INTO v_spatnych
  FROM public.recipes_catalog r
  JOIN _cil cc ON cc.id = r.id
  CROSS JOIN LATERAL public.compute_nutrition_for_ingredients(r.ingredients) c
  WHERE c.complete AND r.kcal > 0 AND abs(c.kcal - r.kcal) / r.kcal > 0.6;
  IF v_spatnych > 0 THEN
    RAISE EXCEPTION 'U % receptu je soucet ze surovin i po skalovani mimo (>60 %%).', v_spatnych;
  END IF;

  RAISE NOTICE 'Doskalovany 2 recepty (39, 207). Se servings > 1 zbyvaji jen zaminovane.';
END $$;
