-- Aliasy surovin, kolo 2: co proslo po oprave overovaci brany.
--
-- V kole 1 (20260803160000) neproslo 23 aliasu. Pri druhem behu se ukazalo,
-- ze vetsinu z nich neshodil alias, ale CHYBA V BRANE:
--
--   recipes_catalog.kcal je NA PORCI, ale suroviny u importovanych receptu
--   popisuji cely pekac. Recept 205 "Zapecene testoviny pastitsio" ma
--   ulozeno 373 kcal, ale 450 g ziti, 480 g fety a "12 porci sul a pepr" —
--   soucet ze surovin je 3161 kcal. Brana tedy porovnavala celou formu proti
--   jednomu taliri a kazdy vicedavkovy recept vysel jako 10nasobny prestrel.
--
-- Po vydeleni poctem porci sedi vsechno na ~1,0: dort 10,3 -> 0,85,
-- pastitsio 8,5 -> 0,71, grilovane kure 8,5 -> 1,06, makarony 6,9 -> 0,86.
--
-- Druha oprava: puvodni test "prepis neco pridal" padal u bylinek a vody,
-- kde je prirustek v jednotkach kcal. Nahrazen primym testem, jestli se
-- cilova surovina vubec sparuje.
--
-- Vsech 162 aliasu z kola 1 bylo opravenou branou preovereno a proslo znovu,
-- takze oprava nic zpetne nezneplatnuje.
--
-- Z 23 znovu overovanych PROSLO 19, NEPROSLO 4:
--   banany                         -> banan            median odchylky 31.2 % > 25 %
--   kureci prsa bez kuze a kosti   -> kureci prsa      soucet prestrelil ulozene kcal 171 %
--   mild cheddar                   -> cheddar          median odchylky 52.0 % > 25 %
--   zelene cibule                  -> jarni cibulka    soucet prestrelil ulozene kcal 171 %
--
-- Cisla jsou v .cache/aliasy-kolo2-neprosly.json. 'mild cheddar' -> 'cheddar'
-- ma medianovou odchylku 52 % a zustava venku; 'kureci prsa bez kuze a kosti'
-- a 'zelene cibule' prestreluji o 171 % i po deleni porcemi.

INSERT INTO ingredient_aliases (alias_normalized, canonical_normalized, display_alias_cs)
SELECT v.a, v.c, v.a
FROM (VALUES
  ('bazalka natrhana na kousky','bazalka'),
  ('chilli prasek','chili prasek'),
  ('dalsi mata','mata'),
  ('houb','houby'),
  ('jalapeno papricky','jalapeno'),
  ('klas kukurice','kukurice'),
  ('limetkove klinky','limetka'),
  ('lzice vody','voda'),
  ('mild cheddar syr','cheddar'),
  ('mint','mata'),
  ('nakrajeny mlady zazvor','zazvor'),
  ('nove brambory','brambory'),
  ('portobello zampiony','houby'),
  ('praskovy cukr','cukr'),
  ('soda na peceni','jedla soda'),
  ('stavnata zrala rajcata','rajce'),
  ('svestkove rajcata','rajce'),
  ('vlazna voda','voda'),
  ('ziti','testoviny')
) AS v(a, c)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Kontrola: zadny alias nesmi mirit do prazdna.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_slepych integer;
BEGIN
  SELECT count(*) INTO v_slepych
  FROM public.ingredient_aliases a
  WHERE NOT EXISTS (
    SELECT 1 FROM public.ingredients_nutrition i
    WHERE lower(extensions.unaccent(i.name_cs)) = a.canonical_normalized
  )
  AND NOT public.is_pantry_ingredient(a.canonical_normalized);

  IF v_slepych <> 0 THEN
    RAISE EXCEPTION 'Aliasu miricich do prazdna je %, cekali jsme 0.', v_slepych;
  END IF;
END $$;
