-- Bucket unit = 'servings' / 'serving' v recipes_catalog.ingredients: diagnoza + oprava
-- dvou prokazatelnych radku. Zbytek se ZAMERNE neopravuje, protoze neni co opravit.
--
-- ===========================================================================
-- CO SE UKAZALO: NENI TO CHYBA NASEHO PARSERU
-- ===========================================================================
-- Puvodni hypoteza znela, ze parser omylem zapsal pocet porci do pole `unit` a
-- ze skutecna jednotka se da vytahnout z `original`. Data to nepotvrzuji.
--
-- 'servings' posila uz SAMO Spoonacular API. Je to jeho sentinel pro radek
-- ingredience, u ktereho v receptu NENI zadne mnozstvi. Overeno proti surovym
-- payloadum v public.spoonacular_raw_cache:
--
--   payload servings=4  ->  original "salt"                 amount 4  unit "servings"
--   payload servings=26 ->  original "icing sugar"          amount 26 unit "servings"
--   payload servings=2  ->  original "Salt and pepper"      amount 2  unit "servings"
--
-- Vraci to i v measures.metric.unitShort, takze nas importer
-- (lib/spoonacular/catalogImport.js:353, `metric?.unitShort || i?.unit || ''`)
-- to jen verne opise a vydeli poctem porci — proto je v katalogu amount = 1.
--
-- Dusledek: informace "kolik toho je" v puvodnim recepte NIKDY NEEXISTOVALA.
-- Z "Fresh mint", "Granola" nebo "Salt to taste" nejde zadnou gramaz vytahnout,
-- protoze v ni zadna neni. Prazdna kategorie "vysoka jistota" tady neni
-- nedbalost, ale vlastnost zdroje.
--
-- ROZSAH (aktivni recepty):
--   150 radku ingredienci v 93 receptech
--    82 radku uz dnes neblokuje  — jsou to sul, pepr, olivovy olej apod.
--                                  a propadnou pres is_pantry_ingredient()
--    68 radku blokuje 47 receptu — z toho 19 receptu blokuje JEN tenhle bucket,
--                                  28 jich blokuje jeste neco jineho
--
-- CO OBSAHUJE `original` (150 radku):
--   105  vubec zadnou cislici — "Honey", "Granola", "Edible flowers"
--    44  jen echo uz rozbite hodnoty — "1 servings sůl a pepř". Cesky prekladovy
--        krok prepsal `original` z uz vadneho amount+unit, takze surovy text je
--        u nich navic ztraceny. U 2 z nich se dal dohledat v raw cache a i tam
--        je bez mnozstvi ("Hot sauce or chili paste to taste", "Lime wedges").
--     1  cislo, ktere ale neni mnozstvi — "9 inches pie crust pre-baked" (prumer)

-- ===========================================================================
-- OPRAVA: 1 radek. Druhy prokazatelny pripad nelze opravit bez skody — proc, viz nize.
-- ===========================================================================
-- Prepisuje se na prazdnou jednotku, protoze ta uz ma v unit_conversions
-- definovany vyznam "1 kus" (migrace 20260804170000):
--
--   id 526 "9 inches pie crust pre-baked"
--          9 inches = 23 cm, tedy prave jeden korpus, presne jak je definovany
--          radek ('', 'těsto na koláč', 200) -> amount 1, unit '' = 200 g
--
-- Nic jineho se nemeni — `name` ani `name_en` nechavam, prepis nazvu neni
-- predmet teto opravy.
--
-- ---------------------------------------------------------------------------
-- ZAMINOVANY RECEPT: id 574 se opravit NEDA, i kdyz je hodnota jista
-- ---------------------------------------------------------------------------
-- U "Half of Banana, sliced in rounds or length wise" (id 574, Francouzsky toust)
-- text vyslovne rika PULKU, takze spravna hodnota je amount 0.5, unit ''
-- (0.5 x 120 g = 60 g). Presto ten radek nechavam byt.
--
-- Recept ma diet_tags ['dairy_free','vegetarian'], ale
-- recipe_diet_conflicts(ingredients,'vegetarian') vraci ['chleb'] — surovina
-- "chleb" nema ve slovniku nastaveny vegetariansky priznak. Trigger
-- enforce_recipe_catalog_rules bezi BEFORE UPDATE a brana (f) proto recept pri
-- JAKEMKOLI updatu deaktivuje. Prvni verze teto migrace to udelala a kontrola
-- ji zastavila (naštěstí v transakci, takze se nic neaplikovalo).
--
-- Vymena 1 porce banánu za 60 g nema cenu vyrazeni celeho receptu z katalogu.
-- Spravna posloupnost je: nejdriv dosetrit priznak u "chleb", pak tenhle radek.
--
-- SIRSI DOPAD, KTERY Z TOHO VYPLYVA: takhle zaminovanych je 67 ze 454 aktivnich
-- receptu — jakykoli UPDATE na ne (i nesouvisejici) je deaktivuje, protoze
-- prosly branou v dobe, kdy jeste nebyla, nebo kdy slovnik vypadal jinak.
-- Kazda budouci datova oprava nad recipes_catalog s tim musi pocitat.
-- ---------------------------------------------------------------------------
UPDATE public.recipes_catalog r
SET ingredients = (
      SELECT jsonb_agg(
               CASE
                 WHEN t.i->>'original' = '9 inches pie crust pre-baked'
                      AND t.i->>'unit' IN ('servings','serving')
                   THEN t.i || jsonb_build_object('amount', 1, 'unit', '')
                 ELSE t.i
               END
               ORDER BY t.ord)
      FROM jsonb_array_elements(r.ingredients) WITH ORDINALITY AS t(i, ord)
    )
WHERE r.id = 526
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.ingredients) e
               WHERE e->>'original' = '9 inches pie crust pre-baked'
                 AND e->>'unit' IN ('servings','serving'));

-- ===========================================================================
-- CO SE ZAMERNE NEOPRAVILO — 149 radku
-- ===========================================================================
-- A) Mnozstvi v receptu nikdy nebylo (dominantni pripad)
--      "Salt and pepper to taste", "Fresh mint", "Granola", "Honey",
--      "Edible flowers", "Chopped fruit", "Lime wedges", "Peaches, sliced"
--    Jakekoli cislo by tady bylo vymyslene. Cast z nich (sul, pepr, olej)
--    uz dnes propadne pres is_pantry_ingredient a nic neblokuje.
--
-- B) Slovni mnozstvi, ktere nejde prevest na cislo bez hadani
--      "few tarragon leaves"  (navic amount 2.25 pri servings 1)
--      "Some poppy seeds", "Sunflower seeds for garnishing"
--      "Spaghetti (amount is up to you-loads for me )"  <- doslova rika,
--         ze mnozstvi je na kuchari
--      "Water-just enough to cover the eggs"
--
-- C) Hranicni, radeji nechano blokovane
--      "Store bought pie crust" — koupeny korpus je pravdepodobne jeden, ale
--      cislo v textu neni. Rozdil 1 vs 2 korpusy je 200 g, takze to necham
--      cloveku.
--
-- D) Radky, ktere do ingredienci vubec nepatri (spatny import, ne spatna jednotka)
--      name "hrnec. odlomte a odhoďte tvrdé konce z"
--      original "saucepan. Snap and discard tough ends from the"
--    Do ingredienci se dostal kus postupu. Patri to k oprave importu, ne sem.
--
-- POZOR NA NAIVNI HROMADNOU OPRAVU: prepsat vsech 150 radku na unit = ''
-- by bylo AKTIVNE SKODLIVE. Prazdna jednotka od migrace 20260804170000
-- znamena "1 kus", takze "Fresh sliced strawberries" s amount 1 by najednou
-- vazilo 12 g a "Granola" by dostala gramaz kusu — cislo vycucane z prstu
-- tam, kde dnes recept aspon poctive hlasi, ze to spocitat neumime.
--
-- NAVRH OPRAVY IMPORTERU (needitovano, jen popis — import se dnes nepousti):
--   V mapSpoonacularRecipeToCatalogRow (lib/spoonacular/catalogImport.js:346)
--   detekovat sentinel: unit/measures.metric.unitShort in ('servings','serving')
--   AND amount == recipe.servings. Takovy radek zapsat jako
--     { amount: null, unit: '', unquantified: true }
--   ...ale POUZE spolu s pridanim `unquantified` do compute_nutrition_for_ingredients
--   (chovat se jako pantry: nepocitat, neblokovat). Bez toho ne — samotne
--   unit: '' by znamenalo "1 kus" a vyrobilo by vymyslene gramaze, viz vyse.
--   Rozhodnuti, jestli neuvedena ozdoba smi propadnout jako zanedbatelna,
--   je produktove: u petrzelky ano, u "Spaghetti" nebo "feta cheese" ne.

-- ===========================================================================
-- Kontroly
-- ===========================================================================
DO $$
DECLARE
  v_zbyva integer;
  v_korpus jsonb;
  v_aktivni integer;
BEGIN
  -- 1) Opraveny radek ma novou hodnotu.
  SELECT i INTO v_korpus FROM public.recipes_catalog r
    CROSS JOIN LATERAL jsonb_array_elements(r.ingredients) i
    WHERE r.id = 526 AND i->>'original' = '9 inches pie crust pre-baked';

  IF v_korpus IS NULL OR v_korpus->>'unit' <> '' OR (v_korpus->>'amount')::numeric <> 1 THEN
    RAISE EXCEPTION 'Radek s korpusem se neopravil: %', v_korpus;
  END IF;

  -- 2) Trigger enforce_recipe_catalog_rules nesmi recept deaktivovat.
  SELECT count(*) INTO v_aktivni FROM public.recipes_catalog WHERE id = 526 AND active;
  IF v_aktivni <> 1 THEN
    RAISE EXCEPTION 'Update deaktivoval recept 526.';
  END IF;

  -- 3) Zadny jiny radek se nesmel zmenit: bucket klesl presne o 1 (150 -> 149).
  SELECT count(*) INTO v_zbyva
  FROM public.recipes_catalog r
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(r.ingredients,'[]'::jsonb)) i
  WHERE r.active AND i->>'unit' IN ('servings','serving');
  IF v_zbyva <> 149 THEN
    RAISE EXCEPTION 'Ocekavano 149 zbylych radku bucketu, je %', v_zbyva;
  END IF;

  RAISE NOTICE 'Opraven 1 radek, v bucketu zbyva % (mnozstvi ve zdroji neexistuje)', v_zbyva;
END $$;
