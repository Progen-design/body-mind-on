-- Rozšíření pantry_ingredients o zápisové varianty koření a bylinek.
--
-- is_pantry_ingredient porovnává jednoslovné položky spíže PŘESNOU shodou;
-- víceslovné hledá jako frázi. Proto `kmin` v tabulce nepokryje `mlety kmin`
-- a `coriander` nepokryje `ground coriander`. Tyhle varianty se pak počítají
-- jako hlavní suroviny a recept spadne přes pravidlo >6 v
-- trg_enforce_recipe_catalog_rules, přestože jde o špetku koření.
--
-- Seznam obsahuje výhradně koření, bylinky, solné a česnekové varianty —
-- nic, co nese kalorie. Zelenina (spring onions, scallions, zázvorový kořen)
-- tu záměrně NENÍ.
--
-- Dopad, změřeno před nasazením: 18 neaktivních receptů klesne pod 6 hlavních
-- surovin (z toho 10 veganských), žádný aktivní recept se nedostane nad 6 a
-- žádnému receptu počet nestoupne. Tahle migrace nemění recipes_catalog, takže
-- trg_enforce_recipe_catalog_rules se nespustí a nic se nedeaktivuje ani
-- neaktivuje — aktivace je i nadále jen přes seed skript s nutriční bránou.

INSERT INTO public.pantry_ingredients (name_normalized, category) VALUES
  -- české varianty mletého koření
  ('mlety kmin',            'seasoning'),
  ('mlety koriandr',        'seasoning'),
  ('mleta kurkuma',         'seasoning'),
  ('mlety kurkuma',         'seasoning'),
  ('mlety zazvor',          'seasoning'),
  ('mlety horcicny prasek', 'seasoning'),
  ('kari koreni',           'seasoning'),
  ('zazvorove koreni',      'seasoning'),
  ('kajensky pepr',         'seasoning'),
  ('chili papricky',        'seasoning'),
  -- anglické varianty téhož
  ('ground coriander',      'seasoning'),
  ('ground cumin',          'seasoning'),
  ('ground ginger',         'seasoning'),
  ('cumin seeds',           'seasoning'),
  ('cumin seed powder',     'seasoning'),
  ('coriander seeds',       'seasoning'),
  ('mustard seeds',         'seasoning'),
  ('mustard powder',        'seasoning'),
  ('cinnamon powder',       'seasoning'),
  ('curry powder',          'seasoning'),
  ('curry leaves',          'seasoning'),
  ('garam masala',          'seasoning'),
  ('cayenne',               'seasoning'),
  ('cayenne pepper',        'seasoning'),
  ('chillies',              'seasoning'),
  ('asafoetida',            'seasoning'),
  ('seasonings',            'seasoning'),
  ('vanilla',               'seasoning'),
  -- bobkový list a bylinky
  ('bay leaf',              'seasoning'),
  ('bay leaves',            'seasoning'),
  ('fresh thyme',           'seasoning'),
  ('fresh parsley',         'seasoning'),
  ('fresh chives',          'seasoning'),
  ('flat leaved parsley',   'seasoning'),
  ('rosemary leaves',       'seasoning'),
  ('tarragon',              'seasoning'),
  ('of basil',              'seasoning'),
  ('of oregano',            'seasoning'),
  -- solné a česnekové varianty
  ('salt and pepper',       'seasoning'),
  ('kosher salt',           'seasoning'),
  ('herbal salt',           'seasoning'),
  ('himalayan sea salt',    'seasoning'),
  ('garlic powder',         'seasoning'),
  ('garlic clove',          'seasoning'),
  ('garlic cloves',         'seasoning')
ON CONFLICT (name_normalized) DO NOTHING;

-- Kontrola: žádný aktivní recept se nesmí dostat nad limit 6.
DO $$
DECLARE
  nad_limit integer;
BEGIN
  SELECT count(*) INTO nad_limit
  FROM public.recipes_catalog
  WHERE active IS TRUE AND public.count_main_ingredients(ingredients) > 6;

  IF nad_limit > 0 THEN
    RAISE EXCEPTION
      'Po rozsireni spize ma % aktivnich receptu vic nez 6 hlavnich surovin — cekali jsme 0.',
      nad_limit;
  END IF;
END
$$;

-- Kontrola: počet aktivních receptů se nesmí změnit (297 před migrací).
DO $$
DECLARE
  aktivnich integer;
BEGIN
  SELECT count(*) INTO aktivnich FROM public.recipes_catalog WHERE active IS TRUE;

  IF aktivnich <> 297 THEN
    RAISE EXCEPTION 'Aktivnich receptu je % , cekali jsme 297 — spiz nemela aktivaci ovlivnit.', aktivnich;
  END IF;
END
$$;
