-- Prevody jednotek: case-insensitive zaloha, aliasy jednotek, velikostni privlastky.
--
-- MERENI, KTERE K TOMU VEDLO (.cache/chybejici-prevody.csv):
--   Chybejici prevody blokuji 152 ze 454 aktivnich receptu (33 %). U 138 z nich
--   surovinu ve slovniku UZ MAME — chybi opravdu jen prevod na gramy. Prevody
--   jsou tim dnes vetsi dira nez slovnik surovin (ten blokuje 100 receptu).
--
-- Tahle migrace resi jen bezpecnou cast. Prazdna jednotka (67 receptu) a
-- servings/serving (47 receptu) se ZAMERNE neresi — u prvni nejde urcit, co
-- mela znamenat, druha neni jednotka hmotnosti, ale zbytek po parsovani
-- Spoonacularu ("12 porci sul a pepr"). To patri k oprave parseru.

-- ---------------------------------------------------------------------------
-- 1. Parovani jednotek: presna shoda prvni, case-insensitive az jako zaloha
--
-- PROC NE PLOSNE case-insensitive, JAK BY SE NABIZELO. V unit_conversions jsou
-- 'T' = 15 g (polevkova lzice) a 't' = 5 g (lzicka). Lisi se JEN velikosti
-- pismene. Plosne lower() by je slilo do jedne skupiny, jedna z hodnot by
-- nedeterministicky vyhrala a u dnes fungujicich receptu by se lzice zmenila
-- na lzicku — trojnasobny rozdil, ktery by nikdo nezpozoroval.
--
-- Proto se poradi zachovava:
--   1) presna shoda unit + konkretni surovina
--   2) case-insensitive unit + konkretni surovina, JEN kdyz je jednoznacna
--   3) presna shoda unit + obecny fallback
--   4) case-insensitive unit + obecny fallback, JEN kdyz je jednoznacny
--
-- "Jednoznacna" znamena, ze vsechny kandidatske radky se shodnou na gramazi.
-- Resi to HAVING count(DISTINCT grams) = 1: pri neshode agregat nevrati radek
-- a hledani pokracuje dal, misto aby si vybral nahodne. Diky tomu 'T' i 't'
-- nadal trefi svuj presny radek v kroku 1/3 a do zalohy se vubec nedostanou.
--
-- ZISK JE DNES MALY A JE POCTIVE HO RICT: case-insensitive zaloha odemyka
-- jediny recept ('Clove' -> 'clove'). Delam ji hlavne proto, aby varianty
-- psani ('Lb' vedle 'lb') uz nikdy nebyly potreba zakladat dvakrat.
--
-- Signatura ani navratovy typ se nemeni, takze staci CREATE OR REPLACE.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_nutrition_for_ingredients(p_ingredients jsonb)
 RETURNS TABLE(kcal numeric, protein_g numeric, carbs_g numeric, fat_g numeric, ingredients_total integer, ingredients_matched integer, ingredients_unmatched text[], complete boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with rozpad as (
  select lower(extensions.unaccent(regexp_replace(trim(i->>'name'),'\s+',' ','g'))) as n_raw,
         (i->>'amount')::numeric as mnozstvi,
         i->>'unit'              as jednotka
  from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb)) i
),
res as (
  select rz.mnozstvi, rz.jednotka,
    coalesce(
      (select a.canonical_normalized from public.ingredient_aliases a
        where a.alias_normalized = rz.n_raw),
      rz.n_raw
    ) as rn
  from rozpad rz
),
s_gramy as (
  select res.rn,
    coalesce(
      -- 1) presna jednotka + konkretni surovina
      (select uc.grams from public.unit_conversions uc
        where uc.unit = res.jednotka
          and lower(extensions.unaccent(uc.ingredient_match)) = res.rn),
      -- 2) jina velikost pismen + konkretni surovina, jen kdyz je jednoznacna
      (select max(uc.grams) from public.unit_conversions uc
        where lower(uc.unit) = lower(res.jednotka)
          and lower(extensions.unaccent(uc.ingredient_match)) = res.rn
        having count(distinct uc.grams) = 1),
      -- 3) presna jednotka + obecny fallback
      (select uc.grams from public.unit_conversions uc
        where uc.unit = res.jednotka and uc.ingredient_match is null),
      -- 4) jina velikost pismen + obecny fallback, jen kdyz je jednoznacny
      (select max(uc.grams) from public.unit_conversions uc
        where lower(uc.unit) = lower(res.jednotka) and uc.ingredient_match is null
        having count(distinct uc.grams) = 1)
    ) * res.mnozstvi as gramu
  from res
),
spojeno as (
  select sg.rn as surovina, sg.gramu,
    inu.kcal_per_100g, inu.protein_g_per_100g, inu.carbs_g_per_100g, inu.fat_g_per_100g,
    (inu.name_cs is not null and sg.gramu is not null) as ok,
    (sg.gramu is null and public.is_pantry_ingredient(sg.rn)) as zanedbatelna
  from s_gramy sg
  left join lateral (
    select name_cs, kcal_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g
    from public.ingredients_nutrition
    where lower(extensions.unaccent(name_cs)) = sg.rn
    limit 1
  ) inu on true
)
select
  round(sum(kcal_per_100g        * gramu / 100.0) filter (where ok), 1),
  round(sum(protein_g_per_100g   * gramu / 100.0) filter (where ok), 1),
  round(sum(carbs_g_per_100g     * gramu / 100.0) filter (where ok), 1),
  round(sum(fat_g_per_100g       * gramu / 100.0) filter (where ok), 1),
  count(*)::integer,
  count(*) filter (where ok)::integer,
  coalesce(array_agg(surovina) filter (where not ok and not zanedbatelna), '{}'::text[]),
  (count(*) filter (where not ok and not zanedbatelna) = 0)
from spojeno;
$function$;

COMMENT ON FUNCTION public.compute_nutrition_for_ingredients(jsonb) IS
  'Nutrice ze surovin. Jednotka se hleda nejdriv presne, pak case-insensitive a jen kdyz je jednoznacna: T=15 g a t=5 g se timhle nesmi slit.';

-- ---------------------------------------------------------------------------
-- 2. Aliasy jednotek
--
-- Samostatna tabulka aliasu jednotek NEEXISTUJE — varianty se resi duplicitnim
-- radkem se stejnou gramazi ('litr','litre','litres','litru' = 1000). Doplnuji
-- stejnym zpusobem, at je to konzistentni.
--
-- Vsechno nize jsou prepocty, ne odhady: 1 l = 1000 ml, 1 cup = 240 ml (stejne
-- jako uz ulozeny 'hrnek'), 1 lb = 453,59 g, 1 kg = 1000 g.
-- ---------------------------------------------------------------------------
INSERT INTO public.unit_conversions (unit, ingredient_match, grams, note)
VALUES
  ('l',    NULL, 1000,   'stejne jako litr/litre/litru'),
  ('cup',  NULL, 240,    'stejne jako hrnek'),
  ('cups', NULL, 240,    'stejne jako hrnky'),
  ('lb',   NULL, 453.59, '1 libra; pokryva i Lb pres case-insensitive zalohu'),
  ('kgs',  NULL, 1000,   '1 kg')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Velikostni privlastky
--
-- Bezne kuchynske vahy podle USDA (velikosti kusu z FoodData Central). Zapisuji
-- se jen tam, kde surovina uz ve slovniku je a kde je vaha jednoznacna.
-- Nejasne pripady zustavaji venku a jsou vypsane na konci migrace.
--
-- Vejce jsou VZDY bez skorapky — radek 'vejce' ve slovniku popisuje obsah.
-- ---------------------------------------------------------------------------
INSERT INTO public.unit_conversions (unit, ingredient_match, grams, note)
VALUES
  -- vejce (USDA: large 50 g, extra large 56 g, jumbo 63 g; zloutek 17, bilek 33)
  ('large',       'vejce',             50,  'velke vejce bez skorapky'),
  ('extra large', 'vejce',             56,  'USDA extra large'),
  ('jumbo',       'vejce',             63,  'USDA jumbo'),
  ('large',       'žloutky',           17,  'zloutek z velkeho vejce'),
  ('large',       'bílek',             33,  'bilek z velkeho vejce'),

  -- cibulova zelenina
  ('small',       'cibule',            70,  'USDA small onion'),
  ('medium',      'cibule',            110, 'USDA medium onion'),
  ('ks',          'jarní cibulka',     15,  'USDA medium scallion'),
  ('small',       'jarní cibulka',     15,  'USDA medium scallion'),

  -- plodova zelenina
  ('large',       'rajče',             182, 'USDA large tomato'),
  ('medium size', 'rajče',             123, 'USDA medium tomato'),
  ('medium',      'paprika',           119, 'USDA medium bell pepper'),
  ('medium',      'cuketa',            196, 'USDA medium zucchini'),
  ('medium',      'avokádo',           136, 'USDA, bez slupky a pecky'),

  -- ostatni zelenina
  ('large',       'mrkev',             72,  'USDA large carrot'),
  ('medium',      'květák',            588, 'USDA medium head'),
  ('medium head', 'květák',            588, 'USDA medium head'),
  ('medium',      'ředkvičky',         4.5, 'USDA medium radish'),
  ('medium',      'růžičková kapusta', 19,  'USDA medium sprout'),
  ('ks',          'houby',             18,  'USDA medium white mushroom'),
  ('pieces',      'houby',             18,  'USDA medium white mushroom'),

  -- ovoce
  ('small',       'banán',             101, 'USDA small banana'),
  ('medium',      'banán',             118, 'USDA medium banana'),
  ('large',       'banán',             136, 'USDA large banana'),
  ('small',       'jablko',            149, 'USDA small apple'),
  ('large',       'broskev',           175, 'USDA large peach'),
  ('large',       'pomeranč',          184, 'USDA large orange'),
  ('large',       'jahody',            18,  'USDA large strawberry'),
  ('medium',      'fíky',              50,  'USDA medium fig'),

  -- pecivo
  ('pieces',      'naan',              90,  'USDA naan, 1 piece')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- CO SE ZAMERNE NEDOPLNILO — ceka na rozhodnuti cloveka
--
--   strips/pieces slanina  radek 'slanina' ma 541 kcal a 42 g tuku, coz je
--                          UPECENA slanina. Syrovy platek vazi ~28 g, ale po
--                          upeceni ~8 g. Ktera vaha se ma pouzit, zavisi na
--                          tom, jak to mysli recept — 3,5x rozdil.
--   pieces krevety         'krevety' je varena kreveta; vaha kusu zavisi na
--                          velikostni tride (~4 az 15 g).
--   ks česnek              strouzek, nebo cela hlavicka? Rozdil je ~10x.
--                          (jednotka 'stroužek' = 3 g uz existuje)
--   ks kukuřice            klas, nebo konzerva?
--   large máslová dýně     cela dyne vazi 1-1,5 kg podle kusu.
--   large mozzarella       kulicka? balicek? Jaka gramaz?
--   pkg špenát / pkg tofu  velikost baleni neni z receptu poznat.
--   pts cottage,           'pts' muze byt pinta i pieces. Pinta = 473 g,
--   pts cukrový hrášek     kus = neco uplne jineho.
--   large/medium/small     salotky se lisi radove (bezna ~30 g,
--     šalotka              banankova i 60 g+).
--   small špenát           "4 small spinach" — listy? balicky?
--   pieces krůtí klobása   hmotnost jednoho kousku neni dana.
--   ks brie / ricotta /    "kus" u syra a testovin nic nerika.
--     těstoviny / grilovaná
--     kuřecí prsa
--   ks kopr / máta /       bylinky po kusech = snitka? list?
--     bazalka / oregano
--
-- Tyhle radky nejsou chyba parseru, ale skutecna nejednoznacnost. Radeji
-- neodblokovany recept nez recept se spatnymi kaloriemi.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Kontrola: 'T' a 't' se nesmi slit ani po zmene funkce.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_lzice numeric;
  v_lzicka numeric;
BEGIN
  SELECT kcal INTO v_lzice FROM public.compute_nutrition_for_ingredients(
    '[{"name":"olivový olej","amount":1,"unit":"T"}]'::jsonb);
  SELECT kcal INTO v_lzicka FROM public.compute_nutrition_for_ingredients(
    '[{"name":"olivový olej","amount":1,"unit":"t"}]'::jsonb);

  IF v_lzice IS NULL OR v_lzicka IS NULL THEN
    RAISE EXCEPTION 'Kontrola T/t nemohla probehnout: T=%, t=%', v_lzice, v_lzicka;
  END IF;
  IF v_lzice = v_lzicka THEN
    RAISE EXCEPTION 'T a t daly stejnou hodnotu (%) — case-insensitive parovani je slilo.', v_lzice;
  END IF;
  RAISE NOTICE 'T/t oddelene: lzice=% kcal, lzicka=% kcal', v_lzice, v_lzicka;
END $$;
