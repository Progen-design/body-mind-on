-- =============================================================================
-- CESKE SUROVINY do ingredients_nutrition
--
-- Duvod: meal_cache recepty (30 ks) pouzivaji ceske nazvy ("kuřecí prsa"),
-- ktere Spoonacular enrichment nezna. Bez nich nejde spocitat jejich vyzivu.
-- Zaroven vraci zpet zeleninu, kterou nespravne vyhodil Atwater gate
-- (u zeleniny vzorec 4/4/9 nesedi kvuli vlaknine - spenat: 23 vs 29,6 kcal).
--
-- Zdroj: standardni referencni tabulky (USDA / ekvivalent), na 100 g jedle casti.
-- Obiloviny a lusteniny = SUCHY stav (tak je uvadeji recepty).
-- =============================================================================

insert into public.ingredients_nutrition
  (name_cs, name_en, name_normalized, kcal_per_100g, protein_g_per_100g,
   carbs_g_per_100g, fat_g_per_100g, sample_count, source)
values
  -- MASO
  ('kuřecí prsa',      'chicken breast',   'kureci-prsa',      165, 31.0,  0.0,  3.6, 1, 'reference_cs'),
  ('kuřecí prso',      'chicken breast',   'kureci-prso',      165, 31.0,  0.0,  3.6, 1, 'reference_cs'),
  ('krůtí prsa',       'turkey breast',    'kruti-prsa',       135, 29.0,  0.0,  1.7, 1, 'reference_cs'),
  ('krůtí prso',       'turkey breast',    'kruti-prso',       135, 29.0,  0.0,  1.7, 1, 'reference_cs'),
  ('hovězí maso',      'lean beef',        'hovezi-maso',      187, 21.0,  0.0, 11.0, 1, 'reference_cs'),
  ('libové hovězí maso','lean beef',       'libove-hovezi-maso',187,21.0,  0.0, 11.0, 1, 'reference_cs'),
  ('vepřová panenka',  'pork tenderloin',  'veprova-panenka',  143, 21.0,  0.0,  6.0, 1, 'reference_cs'),
  ('libové maso (např. vepřové)','lean pork','libove-maso-veprove',143,21.0,0.0, 6.0, 1, 'reference_cs'),
  -- RYBY
  ('losos',            'salmon',           'losos',            208, 20.0,  0.0, 13.0, 1, 'reference_cs'),
  ('bílá ryba',        'white fish (cod)', 'bila-ryba',         82, 18.0,  0.0,  0.7, 1, 'reference_cs'),
  ('ryba (např. losos)','salmon',          'ryba-losos',       208, 20.0,  0.0, 13.0, 1, 'reference_cs'),
  ('ryba (např. treska)','cod',            'ryba-treska',       82, 18.0,  0.0,  0.7, 1, 'reference_cs'),
  ('tuňák (v konzervě)','canned tuna',     'tunak-v-konzerve', 116, 26.0,  0.0,  1.0, 1, 'reference_cs'),
  -- VEJCE A MLECNE
  ('vejce',            'egg',              'vejce',            155, 13.0,  1.1, 11.0, 1, 'reference_cs'),
  ('mléko',            'milk',             'mleko',             47,  3.4,  4.8,  1.5, 1, 'reference_cs'),
  ('bílý jogurt',      'plain yogurt',     'bily-jogurt',       61,  3.5,  4.7,  3.3, 1, 'reference_cs'),
  ('tvaroh',           'quark',            'tvaroh',            98, 12.0,  3.5,  4.0, 1, 'reference_cs'),
  ('máslo',            'butter',           'maslo',            717,  0.9,  0.1, 81.0, 1, 'reference_cs'),
  -- OBILOVINY A PRILOHY (suchy stav)
  ('ovesné vločky',    'rolled oats',      'ovesne-vlocky',    380, 13.0, 60.0,  7.0, 1, 'reference_cs'),
  ('müsli',            'muesli',           'musli',            380, 10.0, 65.0,  8.0, 1, 'reference_cs'),
  ('rýže',             'white rice dry',   'ryze',             360,  7.0, 79.0,  0.7, 1, 'reference_cs'),
  ('rýže (bílá)',      'white rice dry',   'ryze-bila',        360,  7.0, 79.0,  0.7, 1, 'reference_cs'),
  ('quinoa',           'quinoa dry',       'quinoa-cs',        368, 14.0, 64.0,  6.0, 1, 'reference_cs'),
  ('celozrnný chléb',  'wholegrain bread', 'celozrnny-chleb',  247, 13.0, 41.0,  3.4, 1, 'reference_cs'),
  ('celozrnný toast',  'wholegrain toast', 'celozrnny-toast',  247, 13.0, 41.0,  3.4, 1, 'reference_cs'),
  ('brambory',         'potatoes',         'brambory',          77,  2.0, 17.0,  0.1, 1, 'reference_cs'),
  ('sladké brambory',  'sweet potatoes',   'sladke-brambory',   86,  1.6, 20.0,  0.1, 1, 'reference_cs'),
  -- ZELENINA (Atwater u nich NESEDI kvuli vlaknine - hodnoty jsou referencni!)
  ('cibule',           'onion',            'cibule',            40,  1.1,  9.3,  0.1, 1, 'reference_cs'),
  ('česnek',           'garlic',           'cesnek',           149,  6.4, 33.0,  0.5, 1, 'reference_cs'),
  ('paprika',          'bell pepper',      'paprika-cs',        31,  1.0,  6.0,  0.3, 1, 'reference_cs'),
  ('paprika (červená)','red bell pepper',  'paprika-cervena',   31,  1.0,  6.0,  0.3, 1, 'reference_cs'),
  ('rajče',            'tomato',           'rajce',             18,  0.9,  3.9,  0.2, 1, 'reference_cs'),
  ('mrkev',            'carrot',           'mrkev',             41,  0.9,  9.6,  0.2, 1, 'reference_cs'),
  ('brokolice',        'broccoli',         'brokolice-cs',      34,  2.8,  7.0,  0.4, 1, 'reference_cs'),
  ('špenát',           'spinach',          'spenat-cs',         23,  2.9,  3.6,  0.4, 1, 'reference_cs'),
  ('cuketa',           'zucchini',         'cuketa',            17,  1.2,  3.1,  0.3, 1, 'reference_cs'),
  ('okurka',           'cucumber',         'okurka',            15,  0.7,  3.6,  0.1, 1, 'reference_cs'),
  ('salát (např. ledový)','iceberg lettuce','salat-ledovy',      14,  0.9,  3.0,  0.1, 1, 'reference_cs'),
  ('směs salátů',      'mixed greens',     'smes-salatu',       15,  1.4,  2.9,  0.2, 1, 'reference_cs'),
  ('avokádo',          'avocado',          'avokado-cs',       160,  2.0,  8.5, 15.0, 1, 'reference_cs'),
  -- OVOCE
  ('banán',            'banana',           'banan',             89,  1.1, 23.0,  0.3, 1, 'reference_cs'),
  ('jablko',           'apple',            'jablko',            52,  0.3, 14.0,  0.2, 1, 'reference_cs'),
  ('jahody',           'strawberries',     'jahody',            32,  0.7,  7.7,  0.3, 1, 'reference_cs'),
  ('čerstvé ovoce',    'fresh fruit',      'cerstve-ovoce',     55,  0.8, 13.0,  0.3, 1, 'reference_cs'),
  ('citron',           'lemon',            'citron',            29,  1.1,  9.3,  0.3, 1, 'reference_cs'),
  ('citronová šťáva',  'lemon juice',      'citronova-stava',   22,  0.4,  6.9,  0.2, 1, 'reference_cs'),
  -- TUKY, ORECHY, DOPLNKY
  ('olivový olej',     'olive oil',        'olivovy-olej',     884,  0.0,  0.0,100.0, 1, 'reference_cs'),
  ('olej',             'oil',              'olej',             884,  0.0,  0.0,100.0, 1, 'reference_cs'),
  ('ořechy',           'nuts',             'orechy',           650, 15.0, 14.0, 60.0, 1, 'reference_cs'),
  ('arašídové máslo',  'peanut butter',    'arasidove-maslo',  588, 25.0, 20.0, 50.0, 1, 'reference_cs'),
  ('proteinový prášek','whey protein',     'proteinovy-prasek',380, 80.0,  8.0,  4.0, 1, 'reference_cs'),
  -- SLADIDLA, OCHUCOVADLA, KORENI
  ('med',              'honey',            'med',              304,  0.3, 82.0,  0.0, 1, 'reference_cs'),
  ('javorový sirup',   'maple syrup',      'javorovy-sirup',   260,  0.0, 67.0,  0.0, 1, 'reference_cs'),
  ('sojová omáčka',    'soy sauce',        'sojova-omacka',     53,  8.0,  5.0,  0.0, 1, 'reference_cs'),
  ('sůl',              'salt',             'sul',                0,  0.0,  0.0,  0.0, 1, 'reference_cs'),
  ('pepř',             'black pepper',     'pepr',             251, 10.0, 64.0,  3.3, 1, 'reference_cs'),
  ('skořice',          'cinnamon',         'skorice',          247,  4.0, 81.0,  1.2, 1, 'reference_cs')
on conflict (name_normalized) do update set
  name_cs           = excluded.name_cs,
  kcal_per_100g     = excluded.kcal_per_100g,
  protein_g_per_100g= excluded.protein_g_per_100g,
  carbs_g_per_100g  = excluded.carbs_g_per_100g,
  fat_g_per_100g    = excluded.fat_g_per_100g,
  source            = excluded.source,
  updated_at        = now();;
