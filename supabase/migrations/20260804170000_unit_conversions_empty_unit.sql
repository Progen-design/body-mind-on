-- Prazdna jednotka v receptech: doplneni gramaze tam, kde amount znamena pocet kusu.
--
-- CO JSME ZJISTILI, PROC TO JDE RESIT
--   Predchozi migrace (20260804160000) prazdnou jednotku zamerne vynechala s tim,
--   ze "nejde urcit, co mela znamenat". Po pohledu na puvodni texty ingredienci
--   to urcit jde: amount u prazdne jednotky je POCET KUSU PRENASOBENY NA JEDNU
--   PORCI. Nejlepe je to videt na jarni cibulce:
--
--     "4 green onions"           -> amount 1.333  (3 porce)
--     "6 green onions, sliced"   -> amount 0.75   (8 porci)
--     "2 scallions, chopped"     -> amount 2      (1 porce)
--
--   Vsechny tri radky mluvi o stejne veci — o jednom stonku jarni cibulky. Zlomky
--   jako 0.25 tedy nejsou jina jednotka, jen deleni poctem porci. Diky tomu se
--   prazdna jednotka chova stejne jako uz ulozene 'ks' a lze ji dat gramaz.
--
--   Tabulka uz 24 takovych radku ma ('' + avokado, banan, cibule, vejce, ...),
--   takze to neni novy vzor, jen doplneni chybejicich surovin.
--
-- MERENI PRED ZMENOU
--   454 aktivnich receptu, 149 blokovanych chybejicim prevodem nebo surovinou.
--   Z toho 67 receptu blokuje prazdna jednotka. Dotaz nasel 44 ruznych surovin;
--   15 z nich neni ve slovniku vyzivy (prevod by jim nepomohl, blokovaly by dal
--   kvuli chybejici surovine) a 5 je opravdu nejednoznacnych — viz konec souboru.

-- ---------------------------------------------------------------------------
-- Prazdna jednotka = 1 kus
--
-- Gramaze jsou USDA FoodData Central (velikosti kusu), u peciva a testa bezna
-- prodejni velikost. Kde uz pro tu samou surovinu existuje radek 'ks', 'large'
-- nebo 'pieces', PREBIRAM JEHO HODNOTU — dve jednotky pro stejny kus se nesmi
-- rozejit (houby 18 g, jarni cibulka 15 g, celer 40 g, sladke brambory 130 g,
-- bilek 33 g, zloutky 17 g).
--
-- U 'large' to naopak NEPLATI a platit nema: prazdna jednotka je kus bez
-- privlastku, tedy stredni velikost. Tabulka to uz tak ma (banan '' 120 g vs
-- large 136 g), takze jahody dostavaji USDA medium 12 g a pomeranc medium 131 g,
-- ne hodnotu z radku 'large'.
-- ---------------------------------------------------------------------------
INSERT INTO public.unit_conversions (unit, ingredient_match, grams, note)
VALUES
  -- zelenina
  ('', 'jarní cibulka',    15,  'prazdna jednotka = 1 stonek; stejne jako ks'),
  ('', 'houby',            18,  'prazdna jednotka = 1 kus; stejne jako ks'),
  ('', 'celer',            40,  'prazdna jednotka = 1 rapik; stejne jako ks'),
  ('', 'sladké brambory',  130, 'prazdna jednotka = 1 kus; stejne jako ks'),
  ('', 'chřest',           16,  'prazdna jednotka = 1 vyhonek; USDA medium spear'),
  ('', 'pastinák',         133, 'prazdna jednotka = 1 kus; USDA medium parsnip'),

  -- ovoce
  ('', 'jahody',           12,  'prazdna jednotka = 1 kus; USDA medium strawberry (large 18 g je zvlast)'),
  ('', 'borůvky',          1.5, 'prazdna jednotka = 1 kus'),
  ('', 'pomeranč',         131, 'prazdna jednotka = 1 kus; USDA medium orange'),
  ('', 'kaki',             168, 'prazdna jednotka = 1 kus; USDA japanese persimmon'),
  ('', 'mangostana',       25,  'prazdna jednotka = duzina z 1 plodu'),
  ('', 'koktejlové třešně', 5,  'prazdna jednotka = 1 kus'),

  -- stavy a kura: amount je pocet CITRONU/POMERANCU, ne mnozstvi stavy
  --   "2 lemons, juiced" -> 0.667 (3 porce), "sťáva z 1 citronu" -> 1
  ('', 'citronová šťáva',  45,  'prazdna jednotka = stava z 1 citronu (~45 ml)'),
  ('', 'pomerančová šťáva', 86, 'prazdna jednotka = stava z 1 pomerance; USDA juice from 1 fruit'),
  ('', 'citronová kůra',   6,   'prazdna jednotka = kura z 1 citronu (~1 lzice)'),

  -- vejce (vzdy bez skorapky, stejne jako u velikostnich privlastku)
  ('', 'bílek',            33,  'prazdna jednotka = 1 bilek; stejne jako large'),
  ('', 'žloutky',          17,  'prazdna jednotka = 1 zloutek; stejne jako large'),
  ('', 'kachní vejce',     70,  'prazdna jednotka = 1 kachni vejce bez skorapky'),

  -- maso
  ('', 'kuřecí paličky',   100, 'prazdna jednotka = 1 palicka'),

  -- pecivo a testo
  ('', 'croissant',        57,  'prazdna jednotka = 1 kus; USDA butter croissant'),
  ('', 'pita',             60,  'prazdna jednotka = 1 placka'),
  ('', 'celozrnná pita',   60,  'prazdna jednotka = 1 placka'),
  ('', 'těsto na koláč',   200, 'prazdna jednotka = 1 pripraveny korpus (23 cm)'),

  -- koreni: 1 susseny list vazi kolem 0,2 g, do nutrice se prakticky nepromitne,
  -- ale bez prevodu blokuje cely recept
  ('', 'bobkový list',     0.2, 'prazdna jednotka = 1 susseny list')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- CO SE ZAMERNE NEDOPLNILO
--
-- A) Nejednoznacne — jedna hodnota by u casti receptu lhala
--
--   červená řepa   Jediny recept rika "12 cooked baby beets". Baby repa vazi
--                  ~25 g, bezna repa ~82 g (USDA, 2" dia) — 3x rozdil. Gramaz
--                  se zapisuje na kanonicky nazev, takze 25 g by lhalo u kazde
--                  budouci bezne repy a 82 g lze u tohohle receptu. Spravne
--                  reseni je alias "baby beets" na vlastni surovinu, ne prevod.
--
--   těstoviny      "8 lasagní", "10 curly-edged lasagní" — pocet platu lasagni
--                  (~25 g/plat). Kanonicky nazev je ale obecne "testoviny", kde
--                  "1 kus" nic nerika. Migrace 20260804160000 uz stejny pripad
--                  ('ks těstoviny') odlozila ze stejneho duvodu; drzim to same.
--
--   zázvor         "¼ julienne young ginger" — ctvrtina koreni, nebo ctvrt
--                  hrnku nakrajeneho zazvoru? Rozdil je radovy.
--
-- B) Zbytek po parsovani Spoonacularu, ne jednotka
--
--   smetana        Puvodni text "2 tblsp sour cream", ale nazev suroviny je
--                  "lžíce smetany" — jednotka se vsakla do nazvu a v poli unit
--                  zbylo prazdno. Prevod pro "smetana = 1 kus" by byl nesmysl;
--                  patri to k oprave parseru, stejne jako 'pch salt' nebo
--                  't cream'.
--
-- C) Suroviny mimo slovnik vyzivy (15 radku) — prevod by je neodblokoval
--
--   banány, muffiny, muffins, corn tortillas, zelené cibule, lime kůra,
--   kuřecí prsa bez kůže a kostí, těsto na koláč o průměru 23 cm, pasta omáčka,
--   zelená dýně, vanilkový lusk, kost s uzeninou, raspberries and mint leaves,
--   pch salt, t cream
--
--   Vetsina z nich je alias-dira, ne dira v prevodech: banán, jarní cibulka,
--   kuřecí prsa, těsto na koláč i pita ve slovniku UZ JSOU, jen pod jinym
--   nazvem. To resi dalsi kolo aliasu, ne tahle migrace.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Kontroly
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_kcal numeric;
  v_lzice numeric;
  v_lzicka numeric;
BEGIN
  -- 1) Prazdna jednotka se u doplnene suroviny opravdu spocita.
  SELECT kcal INTO v_kcal FROM public.compute_nutrition_for_ingredients(
    '[{"name":"jarní cibulka","amount":2,"unit":""}]'::jsonb);
  IF v_kcal IS NULL OR v_kcal = 0 THEN
    RAISE EXCEPTION 'Prazdna jednotka se nespocitala: jarni cibulka -> %', v_kcal;
  END IF;

  -- 2) Prazdna jednotka a 'ks' musi dat u stejne suroviny stejnou hmotnost.
  IF EXISTS (
    SELECT 1
    FROM public.unit_conversions a
    JOIN public.unit_conversions b
      ON lower(extensions.unaccent(a.ingredient_match)) = lower(extensions.unaccent(b.ingredient_match))
    WHERE a.unit = '' AND b.unit = 'ks' AND a.grams <> b.grams
  ) THEN
    RAISE EXCEPTION 'Prazdna jednotka a ks se u nejake suroviny rozesly v gramazi.';
  END IF;

  -- 3) Obecny fallback pro prazdnou jednotku nesmi vzniknout: bez suroviny
  --    "1 necoho" nic neznamena.
  IF EXISTS (SELECT 1 FROM public.unit_conversions WHERE unit = '' AND ingredient_match IS NULL) THEN
    RAISE EXCEPTION 'Vznikl obecny prevod pro prazdnou jednotku bez suroviny.';
  END IF;

  -- 4) T/t se stale nesmi slit (zabradli z 20260804160000).
  SELECT kcal INTO v_lzice FROM public.compute_nutrition_for_ingredients(
    '[{"name":"olivový olej","amount":1,"unit":"T"}]'::jsonb);
  SELECT kcal INTO v_lzicka FROM public.compute_nutrition_for_ingredients(
    '[{"name":"olivový olej","amount":1,"unit":"t"}]'::jsonb);
  IF v_lzice IS NULL OR v_lzicka IS NULL OR v_lzice = v_lzicka THEN
    RAISE EXCEPTION 'Kontrola T/t selhala: T=%, t=%', v_lzice, v_lzicka;
  END IF;

  RAISE NOTICE 'Kontroly prosly: jarni cibulka 2 ks = % kcal', v_kcal;
END $$;
