-- Cast B: znackove a slozene suroviny s jednotkou g/ml -> obecny ekvivalent.
--
-- ===========================================================================
-- ZADANI A JEHO CENA
-- ===========================================================================
-- Jednotka je u tehle skupiny v poradku, chybi SUROVINA — typicky znackovy
-- vyrobek nebo slozeny pokrm, ktery se nepodarilo dohledat v USDA. Produktove
-- rozhodnuti uzivatele: nahradit obecnejsim ekvivalentem a PRIZNAT NEPRESNOST
-- je prijatelne.
--
-- U kazdeho aliasu nize je proto napsano, jakou nepresnost zavadi. Kriterium
-- zustava z davky 4: alias miri na surovinu, ktera z prave te potraviny vznikla,
-- nebo je ji nutricne velmi blizka. Kde by obecny ekvivalent zamazal podstatny
-- rozdil (vzor "reduced fat cheddar -> cheddar" z PR #43), alias nedelam.

-- Stav PRED zmenou, aby kontroly merily skutecny dopad.
CREATE TEMP TABLE _pred ON COMMIT DROP AS
SELECT r.id, c.complete
FROM public.recipes_catalog r
CROSS JOIN LATERAL public.compute_nutrition_for_ingredients(r.ingredients) c
WHERE r.active;

-- ---------------------------------------------------------------------------
-- 1. Aliasy na obecny ekvivalent
-- ---------------------------------------------------------------------------
INSERT INTO public.ingredient_aliases (alias_normalized, canonical_normalized, display_alias_cs)
VALUES
  -- BEZ NEPRESNOSTI — jde o tu samou potravinu, jen jinak zapsanou.
  --
  -- 5 receptu. Slovnik uz "half-and-half" MA pod nazvem se zavorkou, takze
  -- tohle je ciste sjednoceni pojmenovani.
  ('smes smetany a mleka',      'smetana a mleko (half-and-half)', 'směs smetany a mléka'),
  -- "400 grams of tuna, drained and flaked" = tunak z konzervy scedeny.
  ('tuna',                      'tunak (v konzerve)',              'tuňák'),
  -- Puvodni text je "unbleached all-purpose flour", tedy OBYCEJNA PSENICNA
  -- mouka. Cesky nazev "nepsenicna mouka" je chyba prekladu, ne jina surovina.
  ('nepsenicna mouka',          'mouka',                           'pšeničná mouka (hladká)'),
  -- "*2" je znacka odkazu na poznamku pod receptem, ne soucast nazvu. Voda ma
  -- 0 kcal, takze prevod je presny.
  ('voda *2',                   'voda',                            'voda'),

  -- MALA NEPRESNOST — rozdil je pod ~10 % nebo davka tak mala, ze nehraje roli.
  --
  -- Creme fraiche ma ~330 kcal a ~35 g tuku, slehacka ve slovniku 340 a 36,1.
  -- Puvodni text navic sam rika "Heavy cream or Alouette creme fraiche", takze
  -- zamenu schvaluje autor receptu.
  ('alouette creme fraiche',    'slehacka',                        'crème fraîche'),
  -- Filet mignon je hovezi svickova; slovnikove "hovezi maso" ma 187 kcal a
  -- 11 g tuku, syrova svickova ~190 a ~10. Nepresnost: neresi se rozdil rezu.
  ('filet mignon steaks',       'hovezi maso',                     'steaky filet mignon'),
  -- Guacamole je z avokada (kriterium "vznikla z te potraviny"). Nepresnost:
  -- guacamole ma navic limetku, sul a cibuli, takze kcal je o par procent niz.
  ('guacamole',                 'avokado',                         'guacamole'),
  -- Baby kale je mlada kapusta. Nepresnost: mladsi list ma o par procent mene
  -- vlakniny, kcal rada sedi (49).
  ('mlady kapustovy salat',     'kapusta',                          'mladá kapusta (baby kale)'),
  -- "frozen berry blend (strawberries, raspberries...)" — smes bobuli ma
  -- 50-57 kcal, obecne "cerstve ovoce" 55. Nepresnost: mrazene vs cerstve.
  ('smes bobuloveho ovoce',     'cerstve ovoce',                    'směs bobulového ovoce'),
  -- "0.33 tablespoons vina" = 5 g. Bile a cervene vino se lisi o jednotky kcal
  -- a davka je 5 g, takze rozdil je pod 1 kcal.
  ('vino',                      'bile vino',                        'víno'),
  -- Lepkava ryzova mouka ma ~360 kcal a ~1 g tuku, slovnikova mouka 364 a 1.
  -- Nepresnost: bilkoviny 6 vs 10 g na 100 g (u 20 g davky tedy ~0,8 g).
  ('lepkava ryzova mouka',      'mouka',                            'lepkavá rýžová mouka'),

  -- ZNATELNA NEPRESNOST — vedome prijata, protoze recept jinak zustane slepy.
  --
  -- Havarti ma ~371 kcal a ~31 g tuku, obecny "syr" 350 a 27. Nepresnost:
  -- podhodnoceni tuku o ~4 g na 100 g (u 25 g davky ~1 g).
  ('syr havarti',               'syr',                              'sýr havarti'),
  -- Diestel je znacka KRUTICH uzenin, proto miri na kruti klobasu (196 kcal,
  -- 10,4 g tuku) a ne na obecnou klobasu (326 / 28,7) — ta by tuk pretahla
  -- skoro trojnasobne. Nepresnost: konkretni receptura vyrobce se lisi v soli.
  ('diestel breakfast sausage', 'kruti klobasa',                    'Diestel krůtí klobása'),
  -- "113 g mletych klobas" — mleta klobasova hmota odpovida obecne klobase.
  -- Nepresnost: typ masa a obsah soli je u konkretni klobasy jiny.
  ('mlete klobasy',             'klobasa',                          'mleté klobásy'),
  -- "non-dairy milk (almond, soy, rice)" — text nabizi tri varianty a mandlove
  -- uvadi prvni. Nepresnost: sojove mleko ma ~2x vic bilkovin; davka je 8 g,
  -- takze rozdil je pod 0,5 g.
  ('rostlinne mleko',           'mandlove mleko',                   'rostlinné mléko'),
  -- Mascarpone ma ~429 kcal a ~44 g tuku, smetanovy syr 342 a 34.
  -- NEPRESNOST JE ZDE NEJVETSI Z CELE MIGRACE: podhodnoceni tuku o ~10 g na
  -- 100 g, tedy u 29 g davky ~3 g tuku a ~25 kcal.
  -- PR #43 tenhle alias jeste odmitl. Delam ho teprve teď, protoze
  --   a) uzivatel vyslovne prijal "nahradit obecnejsim a priznat nepresnost",
  --   b) jeden z obou puvodnich textu sam rika "2 oz mascarpone (or cream
  --      cheese)", takze zamenu schvaluje autor receptu.
  ('mascarpone',                'smetanovy syr',                    'mascarpone')
ON CONFLICT (alias_normalized) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Korenici smesi a extrakty -> pantry
--
-- Tohle nejsou kandidati na alias, ale na zanedbatelnost: jsou to smesi koreni
-- a extrakty v davkach 0-5 g. Od migrace 20260804230000 pantry funguje i tam,
-- kde jednotka prevest JDE (podminka je "not ok", ne "gramu is null"), takze to
-- u nich zabere i s jednotkou g.
--
-- Zadna z nich neni v ingredients_nutrition, takze u nich zabradli
-- trg_pantry_ingredient_neni_kaloricka nema s cim porovnavat — posuzoval jsem
-- je tedy sam podle davky v receptu (uvedena u kazdeho radku).
-- Vsechny jsou rostlinne.
-- ---------------------------------------------------------------------------
INSERT INTO public.pantry_ingredients (name_normalized, category, is_vegetarian, is_vegan)
VALUES
  ('bylinkove koreni',      'seasoning', true, true),  -- "1 teaspoon Italian herb seasoning", 3 g
  ('dynove koreni',         'seasoning', true, true),  -- "1/2 tsp pumpkin spice blend", 1 g
  ('koreni citron a pepr',  'seasoning', true, true),  -- "0.25 tsp koreni citron a pepr", 1 g
  ('paprika (koreni)',      'seasoning', true, true),  -- "½ tsp smoked paprika", 1 g
  ('koreni',                'seasoning', true, true),  -- "1.5 lzicky koreni", 3 g
  ('rosemary and thyme',    'seasoning', true, true),  -- "2 tsp of fresh rosemary and thyme", 5 g
  ('kyselina vinna',        'seasoning', true, true),  -- "1 1/2 t. cream of tartar", 0 g
  ('tekuty kour',           'seasoning', true, true),  -- "1.5 lzicky tekuteho koure", 2 g
  ('mata peprna (extrakt)', 'seasoning', true, true)   -- "1 to 2 tsp peppermint extract", 5 g
ON CONFLICT (name_normalized) DO NOTHING;

-- ===========================================================================
-- CO SE ZAMERNE NEUDELALO
-- ===========================================================================
-- A) Obecny ekvivalent by zamazal PODSTATNY rozdil (vzor z PR #43)
--   kondenzovane mleko      Puvodni text je "200 grams EVAPORATED milk", tedy
--                           neslazene (~135 kcal). Slovnik ma jen SLAZENE
--                           kondenzovane mleko (321 kcal) — 2,4x rozdil.
--   snizenotucna smetana    "reduced fat sour cream" (~135 kcal, ~10 g tuku)
--                           vs zakysana smetana (198 / 19,4) — presne ten
--                           snizenotucny vzor, ktery projekt zakazal.
--   reduced fat cheddar     Uz odmitnuto v PR #43 (282 vs 403 kcal).
--   susene brusinky         Susene ~325 kcal vs cerstve brusinky 46 — 7x.
--   cizrna *1               "16 oz bag of DRIED garbanzo beans"; slovnikova
--                           cizrna je varena/konzervovana (137 kcal) vs susena
--                           ~360. Alias by podhodnotil o ~170 kcal na porci.
--                           (Nazev ma navic artefakt "*1" — znacku poznamky.)
--   horka cokolada          Horka cokolada ~550 kcal vs cokoladove kousky 480,
--                           a lisi se cukrem; davka 44 g je prilis velka.
--   farro                   Text rika "1/2 cup farro DRY" (~340 kcal), nejblizsi
--                           slovnikova polozka bulgur je VARENA (83) — 4x.
--   makova napln            Vznika z maku, ale ma cukr a casto susene mleko;
--                           alias na mak by pretahl tuk a tvrdil veganstvi.
--   konopny proteinovy prasek  Slovnikovy "proteinovy prasek" ma jina makra a
--                           sam nema vyplneny diet priznak, takze by recept
--                           ani neodminil.
--   zbytky kurete milanskeho stylu  Obalovane smazene kure != kureci prsa.
--   rybi kolacek            Rybi kolacek ma moucny podil, neni to ryba.
--   mirin                   Sladke ryzove vino ~250 kcal vs bile vino 82.
--   smazeny cesnek          15 g cesnku smazeneho na oleji neni cesnek.
--
-- B) Slozena vec bez rozumneho ekvivalentu / neznama receptura
--   dale's seasoning, enchilada omacka, cerna fazolova cesnekova omacka,
--   smes na dresink hidden valley ranch, barbecue seasoning, limonada,
--   matcha prasek, arenkha msc + arenkha msc caviar substitute (znackova
--   napodobenina kaviaru z chaluh), wasabi paste, jahodovy marshmallow
--   (zelatina — nejiste i pro diet priznak), potravinarske barvivo (karmin),
--   seafood seasoning (nedokazu overit, jestli neobsahuje zivocisnou slozku),
--   maso na duseni, maso na gulas (nejde urcit druh masa — uz dolozeno
--   v komentari fetch-usda-ingredients.mjs)
--
-- C) Neni to surovina — zbytek parsovani
--   privedte k varu nekolik hrnku vody   veta z postupu
--   to)                                  utrzek zavorky
--   hrasek a mrkev                       dve suroviny slite do jedne
--   voda minus 2 lzice & pridat 2        podle textu je to KEFIR/PODMASLI
--                                        (177 ml), ne voda — viz PR #42
--   vanilka                              4 recepty, ale recept 252 ma
--                                        "8 oz vanilky" = 227 g, tedy skoro
--                                        jiste vanilkovy jogurt. Alias na
--                                        vanilkovy extrakt by z toho udelal
--                                        227 g extraktu (654 kcal). Viz PR #43.
--   masova omacka                        960 g u receptu 205, ktery je navic
--                                        spatne otagovany jako vegetarian

-- ===========================================================================
-- Kontroly — meri se DOPAD
-- ===========================================================================
DO $$
DECLARE
  v_pred integer; v_po integer; v_regrese integer; v_visici integer; v_chybi integer;
BEGIN
  -- 1) Zadny alias nesmi mirit mimo slovnik (visici alias je horsi nez zadny).
  SELECT count(*) INTO v_visici FROM public.ingredient_aliases a
  WHERE NOT EXISTS (SELECT 1 FROM public.ingredients_nutrition i
                     WHERE lower(extensions.unaccent(i.name_cs)) = a.canonical_normalized);
  IF v_visici > 0 THEN
    RAISE EXCEPTION 'V ingredient_aliases je % aliasu mirici mimo slovnik.', v_visici;
  END IF;

  -- 2) Vsech 9 korenicich polozek se muselo vlozit.
  SELECT count(*) INTO v_chybi FROM (VALUES
    ('bylinkove koreni'),('dynove koreni'),('koreni citron a pepr'),('paprika (koreni)'),
    ('koreni'),('rosemary and thyme'),('kyselina vinna'),('tekuty kour'),('mata peprna (extrakt)')) AS v(n)
  WHERE NOT EXISTS (SELECT 1 FROM public.pantry_ingredients p WHERE p.name_normalized = v.n);
  IF v_chybi > 0 THEN
    RAISE EXCEPTION 'V pantry chybi % z 9 korenicich polozek.', v_chybi;
  END IF;

  -- 3) Kaloricky vyznamna vec se do pantry nesmela dostat.
  IF EXISTS (
    SELECT 1 FROM public.pantry_ingredients p
    JOIN public.ingredients_nutrition i ON lower(extensions.unaccent(i.name_cs)) = p.name_normalized
    WHERE (coalesce(i.fat_g_per_100g,0) >= 50 OR coalesce(i.carbs_g_per_100g,0) >= 70)
      AND p.name_normalized NOT IN ('skorice','mlety zazvor')
  ) THEN
    RAISE EXCEPTION 'V pantry je kaloricky vyznamna surovina.';
  END IF;

  CREATE TEMP TABLE _po ON COMMIT DROP AS
  SELECT r.id, c.complete
  FROM public.recipes_catalog r
  CROSS JOIN LATERAL public.compute_nutrition_for_ingredients(r.ingredients) c
  WHERE r.active;

  SELECT count(*) FILTER (WHERE complete) INTO v_pred FROM _pred;
  SELECT count(*) FILTER (WHERE complete) INTO v_po   FROM _po;

  -- 4) Pocet spocitatelnych receptu musi STOUPNOUT.
  IF v_po <= v_pred THEN
    RAISE EXCEPTION 'Pocet spocitatelnych receptu nestoupl: % -> %.', v_pred, v_po;
  END IF;

  -- 5) Zadny recept nesmel spocitatelnost ztratit.
  SELECT count(*) INTO v_regrese FROM _pred p JOIN _po n ON n.id = p.id
  WHERE p.complete AND NOT n.complete;
  IF v_regrese > 0 THEN
    RAISE EXCEPTION 'Regrese: % receptu prestalo byt spocitatelnych.', v_regrese;
  END IF;

  RAISE NOTICE 'Cast B: spocitatelnych receptu % -> % (+%).', v_pred, v_po, v_po - v_pred;
END $$;
