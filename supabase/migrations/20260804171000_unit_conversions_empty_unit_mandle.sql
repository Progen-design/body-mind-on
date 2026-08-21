-- Doplneni radku, ktery vypadl z 20260804170000_unit_conversions_empty_unit.sql.
--
-- Recept ma "Whole almonds (about 10)" -> amount 10, unit prazdna. Stejny vzor
-- jako zbytek te migrace: amount je pocet kusu. Jedna mandle vazi ~1,2 g
-- (USDA: 1 cup whole almonds = 143 g, ~120 kusu).
--
-- Samostatny soubor proto, ze predchozi migrace uz je zaplikovana — uprava
-- jejiho obsahu by se na remote znovu nespustila a schema by se rozeslo.
INSERT INTO public.unit_conversions (unit, ingredient_match, grams, note)
VALUES ('', 'mandle', 1.2, 'prazdna jednotka = 1 kus; USDA 1 cup = 143 g / ~120 ks')
ON CONFLICT DO NOTHING;

-- POZOR NA TEST: "mandle" je v ingredient_aliases zaroven ALIAS na "orechy",
-- zatimco "almonds" je alias NA "mandle". Resoluce je jednoskokova, takze
--   recept s "almonds" -> kanonicka surovina "mandle"  (tenhle prevod)
--   recept s "mandle"  -> kanonicka surovina "orechy"  (jiny radek)
-- Test proto musi jit pres "almonds", jak to ma i ten realny recept. Samotna ta
-- obourucnost aliasu je vec k oprave, ale patri do kola aliasu, ne sem.
DO $$
DECLARE
  v_kcal numeric;
BEGIN
  SELECT kcal INTO v_kcal FROM public.compute_nutrition_for_ingredients(
    '[{"name":"almonds","amount":10,"unit":""}]'::jsonb);
  IF v_kcal IS NULL OR v_kcal = 0 THEN
    RAISE EXCEPTION 'Prevod pro mandle se nespocital: %', v_kcal;
  END IF;
  RAISE NOTICE '10 mandli = % kcal', v_kcal;
END $$;
