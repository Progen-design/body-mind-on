-- 8.17 (cast 1 ze 2): vlaknina do slovniku surovin.
--
-- PROC: recipes_catalog.fiber_g je null u 488 z 875 aktivnich receptu a u
-- 463 z 513 llm_generated. Neni to chyba v datech receptu - makra pocita
-- compute_nutrition_for_ingredients() ze slovniku ingredients_nutrition a
-- ten ma fiber_g_per_100g vyplneny jen u 34 z 264 surovin, ktere se v
-- katalogu realne pouzivaji (3578 z 5215 pouziti bez dat).
--
-- Tahle migrace doplnuje data. Az pote ma smysl rozsirit vypocet
-- (cast 2 = compute_fiber_for_ingredients, dela Claude Code).
--
-- ZDROJ HODNOT: USDA FoodData Central, g na 100 g jedle casti.
-- Maso, ryby, vejce, mleko, tvrde syry, oleje, cukr a alkohol maji
-- vlakninu 0 - to NENI odhad, ty potraviny ji neobsahuji. Nula je proto
-- zapsana jako hodnota, ne ponechana jako null; jinak by se surovina dal
-- tvarila jako nezmerena.
--
-- MATCHOVANI kopiruje compute_nutrition_for_ingredients:
-- lower(extensions.unaccent(name_cs)).

update public.ingredients_nutrition inu
set fiber_g_per_100g = v.fiber,
    updated_at = now()
from (values
  -- oleje, tuky, cukry, tekutiny: nulova vlaknina
  ('olivovy olej', 0), ('olej', 0), ('kokosovy olej', 0), ('maslo', 0),
  ('sul', 0), ('voda', 0), ('cukr', 0), ('hnedy cukr', 0),
  ('javorovy sirup', 0), ('med', 0.2), ('agave', 0.2),
  ('bile vino', 0), ('balsamico ocet', 0), ('majoneza', 0),
  ('vanilkovy extrakt', 0), ('prasek do peciva', 0.2),

  -- maso, ryby, morske plody: nulova vlaknina
  ('kureci prsa', 0), ('grilovana kureci prsa', 0), ('kruti prsa', 0),
  ('kruti klobasa', 0), ('sunka', 0), ('slanina', 0),
  ('libove hovezi maso', 0), ('hovezi maso', 0), ('veprova panenka', 0),
  ('losos', 0), ('bila ryba', 0), ('tunak (v konzerve)', 0), ('krevety', 0),

  -- vejce a mlecne: nulova vlaknina
  ('vejce', 0), ('mleko', 0), ('bily jogurt', 0), ('recky jogurt', 0),
  ('plnotucny recky jogurt', 0), ('nizkotucny recky jogurt', 0),
  ('netucny bily jogurt', 0), ('tvaroh', 0), ('cottage', 0),
  ('feta', 0), ('parmezan', 0), ('cheddar', 0), ('mozzarella', 0),
  ('kozi syr', 0), ('syr', 0), ('ricotta', 0), ('smetanovy syr', 0),

  -- rostlinne alternativy
  ('mandlove mleko', 0.3), ('kokosove mleko', 2.2), ('sojova omacka', 0.8),
  ('tofu', 0.9), ('tempeh', 4.5), ('edamame', 5.2),
  ('proteinovy prasek', 1.0),

  -- zelenina
  ('zelenina', 2.5), ('paprika (cervena)', 2.1), ('okurka', 0.5),
  ('salat (napr. ledovy)', 1.2), ('rukola', 1.6), ('jarni cibulka', 2.6),
  ('salotka', 3.2), ('lilek', 3.0), ('chrest', 2.1), ('kapusta', 3.6),
  ('cervena repa', 2.8), ('dyne', 0.5), ('maslova dyne', 2.0),
  ('sladke brambory', 3.0), ('zazvor', 2.0),

  -- ovoce
  ('cerstve ovoce', 2.4), ('ananas', 1.4), ('mango', 1.6), ('kiwi', 3.0),
  ('brusinky', 3.6), ('ostruziny', 5.3), ('citron', 2.8), ('limetka', 2.8),
  ('pomeranc', 2.4), ('limetkova stava', 0.4), ('pomerancova stava', 0.2),

  -- lusteniny, orechy, seminka
  ('cizrna', 7.6), ('orechy', 7.0), ('mandlove maslo', 10.3),
  ('sezamova seminka', 11.8), ('hummus', 6.0),

  -- obiloviny a pecivo
  ('celozrnny toast', 6.8), ('chleb', 2.7), ('pita', 2.2),
  ('strouhanka', 4.5), ('granola', 7.0), ('musli', 7.5),

  -- bylinky a koreni (v receptech v gramech, prispevek je maly,
  -- ale nula by tu byla vecne spatne)
  ('pepr', 25.3), ('skorice', 53.1), ('oregano', 42.5), ('tymian', 14.0),
  ('rozmaryn', 14.1), ('bazalka', 1.6), ('petrzel', 3.3), ('mata', 8.0),
  ('koriandr', 2.8), ('pazitka', 2.5), ('kmin', 10.5),
  ('cesnekovy prasek', 9.0), ('chilli vlocky', 27.2), ('chili prasek', 34.8),
  ('kari koreni', 33.2), ('kakaovy prasek', 33.2),

  -- ostatni
  ('pesto', 1.5), ('dijonska horcice', 3.3),
  ('kureci vyvar', 0), ('zeleninovy vyvar', 0)
) as v(nazev, fiber)
where lower(extensions.unaccent(inu.name_cs)) = v.nazev
  and inu.fiber_g_per_100g is null;
