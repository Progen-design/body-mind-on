-- Dva doopravdy chybějící názvy z `posledni_chyba` fronty generátoru.
-- docs/DALSI_KROK.md 8.10, bod 5.
--
-- Hlavní příčina spadlé fronty (černý rybíz -> skupina "ryby") je jinde
-- (lib/plan/rotaceBilkovin.js). Tyhle dva řádky řeší dvě SAMOSTATNÉ, menší
-- díry, které se ve stejném měření objevily vedle toho:
--
--   červená paprika   ve slovníku chybí ALIAS, ne surovina. `paprika` v
--                     ingredients_nutrition JE a alias `papriky -> paprika`
--                     (bez přívlastku) už existuje od 21. 7. — chybí jen
--                     varianta s barevným přívlastkem. NE nový nutriční
--                     řádek, jen alias na existující surovinu.
--
--   římský kmín       koření, ne hlavní surovina — patří do
--                     `pantry_ingredients` (zanedbatelná dávka v receptu),
--                     ne do `ingredients_nutrition`. Stejná kategorie jako
--                     `kmin` (obyčejný kmín), který v pantry už je.

-- ---------------------------------------------------------------------------
-- 1. Alias: "červená paprika" -> "paprika"
-- ---------------------------------------------------------------------------
INSERT INTO public.ingredient_aliases (alias_normalized, canonical_normalized, display_alias_cs)
VALUES ('cervena paprika', 'paprika', 'červená paprika')
ON CONFLICT (alias_normalized) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Pantry: "římský kmín" — koření, rostlinné, zanedbatelná dávka
-- ---------------------------------------------------------------------------
INSERT INTO public.pantry_ingredients (name_normalized, category, is_vegetarian, is_vegan)
VALUES ('rimsky kmin', 'seasoning', true, true)
ON CONFLICT (name_normalized) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Kontroly
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_kcal numeric;
BEGIN
  -- 1) "červená paprika" se teď spočítá stejně jako "paprika".
  SELECT kcal INTO v_kcal FROM public.compute_nutrition_for_ingredients(
    '[{"name":"červená paprika","amount":100,"unit":"g"}]'::jsonb);
  IF v_kcal IS NULL THEN
    RAISE EXCEPTION '"červená paprika" se porad nespocitala.';
  END IF;

  -- 2) "římský kmín" je teď zanedbatelný (pantry), ne nedohledaný.
  IF NOT public.is_pantry_ingredient('rimsky kmin') THEN
    RAISE EXCEPTION '"rimsky kmin" neni v pantry_ingredients rozpoznany jako pantry.';
  END IF;

  RAISE NOTICE 'Kontroly OK. cervena paprika = % kcal/100g.', v_kcal;
END $$;
