-- Osm surovin v aktivnich planech nemelo kanonicky nazev.
--
-- Alert `nenormalizovana_surovina` je hlasil jmenovite. Dopad je na nakupni
-- seznam: surovina bez kanonickeho nazvu se neslouci s ostatnimi vyskyty,
-- takze uzivatel dostane dva radky misto jednoho a bez spravneho mnozstvi.
--
-- Reseni je ve trech patrech podle toho, CO ta surovina je:
--
-- 1) ALIAS na existujici polozku slovniku - jina formulace tehoz.
--      slanina na kousky -> slanina
--      salatove listy    -> salat (napr. ledovy)
--      listovy salat     -> salat (napr. ledovy)   (zrejma varianta navic)
--
-- 2) PANTRY - koreni a dochucovadla v zanedbatelnem mnozstvi. Do pantry
--    patri proto, ze nesmi shodit vypocet nutrice celeho receptu kvuli
--    spetce, kterou stejne nikdo nevazi.
--      mlety hrebicek (seasoning)
--      hneda horcice  (condiment)
--    madras kari koreni uz v pantry bylo - hlaseni bylo zastarale.
--
-- 3) SKUTECNE CHYBEJICI POTRAVINY do slovniku (USDA FoodData Central,
--    hodnoty na 100 g). Tyhle tri maji vyzivovou hodnotu, kterou je treba
--    pocitat, takze do pantry NEPATRI.
--      hrozny          69 kcal
--      ananasova stava 53 kcal
--      jablecna stava  46 kcal

insert into public.ingredient_aliases (alias_normalized, canonical_normalized, display_alias_cs) values
  ('slanina na kousky', 'slanina',              'slanina na kousky'),
  ('salatove listy',    'salat (napr. ledovy)', 'salátové listy'),
  ('listovy salat',     'salat (napr. ledovy)', 'listový salát')
on conflict do nothing;

insert into public.pantry_ingredients (name_normalized, category, is_vegan, is_vegetarian, obsahuje_lepek) values
  ('mlety hrebicek', 'seasoning', true, true, false),
  ('hneda horcice',  'condiment', true, true, false)
on conflict do nothing;

insert into public.ingredients_nutrition
  (name_en, name_cs, name_normalized, kcal_per_100g, protein_g_per_100g,
   carbs_g_per_100g, fat_g_per_100g, fiber_g_per_100g,
   is_vegan, is_vegetarian, obsahuje_lepek, source)
values
  ('grapes',          'hrozny',           'hrozny',          69, 0.72, 18.1, 0.16, 0.9, true, true, false, 'usda_fdc'),
  ('pineapple juice', 'ananasová šťáva',  'ananasova stava', 53, 0.36, 12.9, 0.12, 0.2, true, true, false, 'usda_fdc'),
  ('apple juice',     'jablečná šťáva',   'jablecna stava',  46, 0.10, 11.3, 0.13, 0.2, true, true, false, 'usda_fdc')
on conflict do nothing;
