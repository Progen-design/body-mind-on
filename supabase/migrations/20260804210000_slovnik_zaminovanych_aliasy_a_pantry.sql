-- Odminovani zbylych 33 receptu: chybejici suroviny do slovniku.
--
-- ===========================================================================
-- CIM SE TOHLE KOLO LISI OD PREDCHOZIHO
-- ===========================================================================
-- V migraci 20260804190000 slo o suroviny, ktere ve slovniku BYLY, jen mely
-- prazdny diet priznak (default false). Tady surovina ve slovniku NENI VUBEC —
-- recipe_diet_conflicts ji hlasi jako konflikt, protoze o ni nic nevi.
-- Overeno: u vsech 42 konfliktnich radku je zaroven
-- ingredients_nutrition = ne, ingredient_aliases = ne, pantry_ingredients = ne.
--
-- NOVE RADKY DO ingredients_nutrition SE NEPRIDAVAJI, A TO ZAMERNE.
-- scripts/fetch-usda-ingredients.mjs ma na konci seznam surovin, ktere se
-- v USDA uz nekolikrat hledat zkousely a nenasly. Je v nem prakticky cely
-- muj seznam: tzatziki, makova napln, kandovana pomerancova kura,
-- koncentrat limonady, vanilka, vanilkovy lusk, vanilkova pasta,
-- almond extract, lepkava ryzova mouka, konopny proteinovy prasek,
-- orechove ovesne vlocky, mascarpone — a davka 4 pridava syr asiago
-- ("USDA vratilo Cheese spread, 7,1 g bilkovin misto ~25").
-- Skript zaroven rika, proc si cisla nesmim vymyslet: "nutricni hodnoty se do
-- katalogu nesmi dostat z hlavy ani od modelu, ke kazdemu radku patri FDC ID".
-- Takze zbyvaji dve poctive cesty: ALIAS na surovinu, ktera uz ve slovniku je,
-- nebo PANTRY u veci, ktere jsou opravdu zanedbatelne.

-- ---------------------------------------------------------------------------
-- 1. Aliasy na existujici suroviny
--
-- Kriterium je z davky 4: "alias miri vzdycky na surovinu, ktera z prave te
-- potraviny vznikla". Kde to neplati, je to u radku poznamenane.
-- ---------------------------------------------------------------------------
INSERT INTO public.ingredient_aliases (alias_normalized, canonical_normalized, display_alias_cs)
VALUES
  -- Stejna potravina, jen jinak zapsana
  ('mild cheddar',              'cheddar',          'mild cheddar'),
  ('bel gioioso mozzarella',    'mozzarella',       'Bel Gioioso mozzarella'),
  ('banany',                    'banan',            'banány'),
  -- Radek 'rozinky' ve slovniku je z USDA dotazu 'raisins GOLDEN seedless',
  -- takze zlate rozinky jsou doslova ta samotna polozka.
  ('zlate rozinky',             'rozinky',          'zlaté rozinky'),
  -- "1 cup cracked wheat, cooked"; radek 'bulgur' je z dotazu 'bulgur cooked'.
  ('lamanka',                   'bulgur',           'lámanka'),
  -- Znackovy pomazankovy syr na smetanovem zaklade.
  ('alouette berries & cream spreadable cheese', 'smetanovy syr', 'Alouette Berries & Cream'),
  -- Puvodni text sam rika "1 cup of cereal or granola".
  ('cereal',                    'granola',          'cereálie'),
  -- "1 cup mixed berries" -> obecne ovoce (55 kcal), bobule maji 50-57.
  ('berries',                   'cerstve ovoce',    'bobulové ovoce'),
  -- Kandovana kura vznika z pomerancove kury. Cukr v ni alias zanedbava, ale
  -- mnozstvi je v recepte neuvedene (artefakt 'servings'), takze do souctu
  -- prakticky nic nepridava.
  ('kandovana pomerancova kura','pomerancova kura', 'kandovaná pomerančová kůra'),

  -- Nize uz nejde o tu samou potravinu, proto rozepsano:
  --
  -- Asiago je tvrdy italsky syr. Obecny radek 'syr' (350 kcal, 25 g bilkovin,
  -- 27 g tuku) mu sedi bliz nez 'parmezan' (431 kcal, 38 g bilkovin).
  -- Vlastni radek nejde postavit, viz komentar davky 4.
  ('syr asiago',                'syr',              'sýr asiago'),
  -- Tzatziki je cezeny jogurt s okurkou a olejem. Alias na recky jogurt
  -- zanedbava olej; v recepte je 1 lzice (~15 g), takze chyba je do 1 g tuku.
  ('tzatziki',                  'recky jogurt',     'tzatziki'),
  -- Limonadovy koncentrat je slazena citronova stava. Alias zanedbava cukr;
  -- v recepte je 0,5 lzice (~7 g), tedy jednotky kcal.
  ('koncentrat limonady',       'citronova stava',  'koncentrát limonády'),
  -- Ovesne vlocky s orechy. 'musli' je taky vlocky s orechy a ma skoro
  -- shodne kcal (380 vs 380) — bliz to ve slovniku neni.
  ('orechove ovesne vlocky',    'musli',            'ořechové ovesné vločky')
ON CONFLICT (alias_normalized) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Pantry: veci, ktere jsou v receptu opravdu zanedbatelne
--
-- pantry_ingredients uz tuhle roli plni pro 'vanilla', 'vanilla extract',
-- 'vanilkovy extrakt', 'voda', 'water', 'lemon juice' i pro korenove smesi
-- ('garam masala', 'curry powder'). Zaroven je to jediny seznam, kde je vec
-- vedena jako nutricne nulova — proto sem patri extrakty a koreni, ne do
-- ingredients_nutrition.
--
-- U KAZDEHO RADKU JE OVERENO, ZE SE PARUJE JEN NA ZAMYSLENE SUROVINY a ze
-- mnozstvi v receptu je opravdu zanedbatelne (pantry surovina se do souctu
-- kcal nepocita, takze u velkeho mnozstvi by to byla tichá ztrata).
-- ---------------------------------------------------------------------------
INSERT INTO public.pantry_ingredients (name_normalized, category, is_vegetarian, is_vegan)
VALUES
  ('almond extract',         'seasoning', true, true),   -- recept 78: 0,5 tsp
  ('vanilkova pasta',        'seasoning', true, true),   -- recept 611: 0,111 tsp
  ('vanilkovy lusk',         'seasoning', true, true),   -- recept 609: 0,25 ks
  ('koreni na dynovy kolac', 'seasoning', true, true),   -- recept 577: 0,063 tsp
  ('ruzova voda',            'seasoning', true, true),   -- recept 602: 9,8 ml, ~0 kcal
  ('jedle kvety',            'garnish',   true, true),   -- recept 602: ozdoba bez mnozstvi
  -- "1 pch Salt" — jednotka (pinch) se vsakla do nazvu. Neni to zbytek postupu,
  -- je to sul, a ta v pantry uz je jako 'salt' i 'sul'. Po oprave parseru bude
  -- tenhle radek mrtvy, ale lhat nemuze: sul je nutricne nulova.
  ('pch salt',               'seasoning', true, true),   -- recept 76
  -- "Water-just enough to cover the eggs" — voda, uz v pantry jako 'voda'/'water'.
  ('voda - prave tolik',     'seasoning', true, true)    -- recept 523
ON CONFLICT (name_normalized) DO NOTHING;

-- ===========================================================================
-- CO SE ZAMERNE NEDOPLNILO A KTERE RECEPTY PROTO ZUSTAVAJI ZAMINOVANE
-- ===========================================================================
-- A) 'vanilka' — NEJVETSI PAST TOHOTO KOLA, a proto ji nechavam byt
--
--    Vypadalo to na cistou pantry polozku (recept 516 ma "1 teaspoon vanilla",
--    577 "1/2 teaspoon - Vanilla"). Ale recept 252 "Jogurtovy dort s cerstvymi
--    jahodami" ma `vanilka` s mnozstvim 227 g a puvodnim textem "8 oz vanilky"
--    — a v celem seznamu surovin toho dortu ZADNY JOGURT NENI. 8 oz je
--    americke baleni; jde skoro jiste o vanilkovy jogurt, jen se pri prekladu
--    z nazvu ztratil (radek 'vanilkovy jogurt' ve slovniku existuje).
--
--    Kdybych 'vanilka' dal do pantry, recept 252 by z vypoctu tise vyhodil
--    227 g jogurtu a zacal se tvarit, ze nutrici zna. Nevedomost je tady lepsi
--    nez sebejiste spatne cislo, takze 252, 516 a 577 zustavaji zaminovane.
--    Oprava patri k prekladu nazvu surovin, ne sem.
--
-- B) Aliasy, ktere by zamazaly rozdil v tuku — projekt je uz jednou zakazal
--
--    .cache/alias-vyrazeno-zakazem.json vyradil presne tenhle vzor
--    ("recky jogurt plnotucny" -> "recky jogurt", "jogurt z plnotucneho mleka"
--    -> "bily jogurt"). Proto NEDELAM:
--      reduced fat cheddar cheese -> cheddar   (282 vs 403 kcal, 19 vs 33 g tuku;
--                                               v recepte 34 jsou 4 lzice)
--    Recept 34 zustava zaminovany. Potrebuje vlastni radek pro polotucny
--    cheddar, ktery se v USDA zatim nepodarilo dohledat (viz davka 4).
--
-- C) Nejasny diet priznak — radeji zaminovane nez lhat vegetarianovi
--      jahodovy marshmallow (253)   marshmallow se bezne dela na zelatine,
--                                   takze vegetariansky byt nemusi. Agarova
--                                   varianta existuje, z nazvu ji nepoznam.
--      potravinarske barvivo (549)  "1/2 teaspoon Yellow food coloring" je zluté
--                                   a tedy syntetické, ale radek by ve slovniku
--                                   byl OBECNY a cervena barviva pouzivaji
--                                   karmin (E120) ze stitenek.
--      konopny proteinovy prasek (548) konopi je rostlina, priznak by byl jasny,
--                                   ale prasek ma ~50 g bilkovin na 100 g a
--                                   alias na 'proteinovy prasek' (jina surovina,
--                                   navic sama s nejistym priznakem) by makra
--                                   posunul. Bez USDA radku to nejde.
--      makova napln (582)           vznika z maku, ale komercni napln obsahuje
--                                   cukr a casto susene mleko — veganstvi neni
--                                   jiste. Alias na 'mak' by ho tvrdil.
--
-- D) Zbytky parsovani, ktere nejsou surovina — do slovniku nepatri
--      t cream (47)                       "1 + 2 T cream or whole milk"
--      raspberries and mint leaves (59)   dve suroviny slite do jedne
--      lehce oslazena slehacka nebo (80)  utaty nazev s visicim "nebo"
--      poznamka: pouzil jsem pomerance (83) veta z postupu
--      cokolada a extra kakaovy prasek (586) dve suroviny slite do jedne
--
--    A jeden, ktery vypadal jako voda, ale neni:
--      voda minus 2 lzice & pridat 2 (532)  puvodni text je
--      "3/4 cup kefir, cultured buttermilk or water minus 2 Tbsp & add 2"
--      a mnozstvi 177 ml. Je to kefir/podmasli, ne voda. Kdybych to poslal do
--      pantry jako "vodu", recept by o 177 ml mlecneho vyrobku tise prisel.
--
-- E) Spatne otagovany recept, ne chybejici surovina
--      masova omacka (205)  "Zapecene testoviny pastitsio" s masovou omackou
--                           maji tag vegetarian. Uz popsano v 20260804180000;
--                           brana tady pracuje spravne, spatny je tag receptu.
--
-- F) mascarpone (586) — alias na 'smetanovy syr' by zamazal tuk (44 vs 34 g).
--    Recept 586 stejne zustava kvuli slite ingredienci z bodu D, takze by to
--    nic neodemklo. USDA ho nema (viz davka 3 i 4).

-- ===========================================================================
-- Kontroly
-- ===========================================================================
DO $$
DECLARE
  v_zaminovanych integer;
  v_visici       integer;
  v_aktivnich    integer;
  v_maso         integer;
  v_252          numeric;
BEGIN
  -- 1) Zadny novy alias nesmi mirit na neexistujici surovinu. Visici alias je
  --    horsi nez zadny: prepsal by nazev na kanonicky, ktery slovnik nezna.
  SELECT count(*) INTO v_visici
  FROM public.ingredient_aliases a
  WHERE NOT EXISTS (SELECT 1 FROM public.ingredients_nutrition i
                     WHERE lower(extensions.unaccent(i.name_cs)) = a.canonical_normalized);
  IF v_visici > 0 THEN
    RAISE EXCEPTION 'V ingredient_aliases je % aliasu mirici mimo slovnik.', v_visici;
  END IF;

  -- 2) Zadna masna/rybi vec nesmi byt v pantry vedena jako vegetarianska.
  SELECT count(*) INTO v_maso FROM public.pantry_ingredients
  WHERE (is_vegetarian OR is_vegan)
    AND name_normalized ~* '(maso|masov|hovez|vepr|kure|krut|slanin|sunka|klobas|chorizo|losos|tunak|krev|krab|zelatin|sadlo|vyvar|anchov|ustric|worcest|bacon|beef|chicken|pork|fish|gelatin)';
  IF v_maso > 0 THEN
    RAISE EXCEPTION 'V pantry je % masnych/rybich radku s vegetarianskym priznakem.', v_maso;
  END IF;

  -- 3) Pocet zaminovanych musi klesnout z 33.
  SELECT count(*) INTO v_zaminovanych FROM public.recipes_catalog r
  WHERE r.active AND NOT r.pending_review
    AND (('vegan' = ANY(r.diet_tags) AND array_length(public.recipe_diet_conflicts(r.ingredients,'vegan'),1) IS NOT NULL)
      OR ('vegetarian' = ANY(r.diet_tags) AND array_length(public.recipe_diet_conflicts(r.ingredients,'vegetarian'),1) IS NOT NULL));
  IF v_zaminovanych >= 33 THEN
    RAISE EXCEPTION 'Pocet zaminovanych receptu neklesl: %', v_zaminovanych;
  END IF;

  -- 4) Migrace nesaha na recipes_catalog, takze pocet aktivnich se nesmi zmenit.
  SELECT count(*) INTO v_aktivnich FROM public.recipes_catalog WHERE active;
  IF v_aktivnich <> 454 THEN
    RAISE EXCEPTION 'Zmenil se pocet aktivnich receptu: % (ocekavano 454).', v_aktivnich;
  END IF;

  -- 5) Past z bodu A: recept 252 MUSI zustat v konfliktu. Kdyby se odminoval,
  --    znamenalo by to, ze se 'vanilka' nekam dostala a 227 g jogurtu zmizelo.
  IF array_length(public.recipe_diet_conflicts(
       (SELECT ingredients FROM public.recipes_catalog WHERE id = 252), 'vegetarian'), 1) IS NULL THEN
    RAISE EXCEPTION 'Recept 252 se odminoval — 227 g "vanilky" se tise prestalo pocitat.';
  END IF;

  RAISE NOTICE 'Zaminovanych receptu po doplneni slovniku: % (bylo 33)', v_zaminovanych;
END $$;
