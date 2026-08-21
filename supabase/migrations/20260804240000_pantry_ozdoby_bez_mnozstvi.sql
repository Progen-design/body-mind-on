-- Cast A: neuvedene mnozstvi (unit = 'servings'/'serving') — ozdoby a koreni do pantry.
--
-- ===========================================================================
-- PROC UZ NENI POTREBA ZADNA NOVA MECHANIKA
-- ===========================================================================
-- Puvodne se planoval priznak `unquantified` do importeru i do
-- compute_nutrition_for_ingredients. Po migraci 20260804230000 to netreba:
-- zanedbatelnost se pocita jako (not ok AND is_pantry_ingredient(...)), tedy
-- BEZ ohledu na prevoditelnost jednotky. Ingredience bez uvedeneho mnozstvi ma
-- gramu NULL, takze staci, aby byla v pantry_ingredients, a prestane blokovat.
-- Tahle migrace je proto CISTE KURATORSKA — zadny kod se nemeni.
--
-- ===========================================================================
-- PRAVIDLO, PODLE KTEREHO SE ROZHODOVALO (produktove rozhodnuti uzivatele)
-- ===========================================================================
-- Neuvedena polozka smi propadnout jako zanedbatelna, POKUD je to ozdoba nebo
-- koreni. Pokud je to skutecna slozka jidla (ryze, feta, granola, spagety,
-- sirup), propadnout NESMI — recept ma zustat blokovany a poctive rict, ze to
-- spocitat neumime.
--
-- K tomu jsem pridal jednu ciselnou linii, aby rozhodovani nebylo dojmove:
-- do pantry jde jen surovina pod ~350 kcal/100 g. Nad tim uz nejde o ozdobu,
-- ale o koncentrovanou energii, i kdyz se "sype navrch". Linie sedi presne do
-- mezery v datech: chilli vlocky 318 -> cokoladove kousky 480.

-- Stav PRED zmenou, aby kontroly na konci merily skutecny dopad.
CREATE TEMP TABLE _pred ON COMMIT DROP AS
SELECT r.id, c.complete
FROM public.recipes_catalog r
CROSS JOIN LATERAL public.compute_nutrition_for_ingredients(r.ingredients) c
WHERE r.active;

-- ---------------------------------------------------------------------------
-- HROMADKA 1: ozdoba / koreni -> pantry
--
-- U kazde polozky je duvod a puvodni text z receptu, ktery ho dokazuje.
-- Vsechny jsou rostlinne, takze is_vegetarian i is_vegan = true.
-- ---------------------------------------------------------------------------
INSERT INTO public.pantry_ingredients (name_normalized, category, is_vegetarian, is_vegan)
VALUES
  -- ozdoby: sypou se navrch nebo se podavaji vedle
  ('jarni cibulka',    'garnish',   true, true),  -- 4 recepty: "scallions (for garnish)", "green onions, diced"
  ('mata',             'garnish',   true, true),  -- "Fresh mint"
  ('limetka',          'garnish',   true, true),  -- "1 servings limetkove kliny" — klinky na okraj talire
  ('pomerancova kura', 'garnish',   true, true),  -- "Candied Orange peel" — posyp na ryzovem pudinku
  ('tarragon stalks',  'garnish',   true, true),  -- "tarragon stalks" — stonky bylinky
  -- koreni a dochucovadla: davkuji se "to taste", po spetce nebo po kapkach
  ('salt & pepper',    'seasoning', true, true),  -- "salt & pepper"; varianta uz ulozeneho 'salt and pepper'
  ('cracked pepper',   'seasoning', true, true),  -- "cracked black pepper"
  ('estragon',         'seasoning', true, true),  -- "few tarragon leaves"
  ('chilli vlocky',    'seasoning', true, true),  -- "Red chili flakes" (318 kcal/100 g, davka spetka)
  ('citronova kura',   'seasoning', true, true),  -- "1 servings citronova kura"
  ('citronova stava',  'seasoning', true, true),  -- "Lemon juice to taste"; 'lemon juice' uz v pantry je
  ('sriracha',         'seasoning', true, true)   -- "1 serving sriracha" — ostra omacka po kapkach
ON CONFLICT (name_normalized) DO NOTHING;

-- ===========================================================================
-- HROMADKA 2: skutecna slozka jidla -> ZUSTAVA BLOKOVANA, nesaha se na to
-- ===========================================================================
-- Tuky a sladidla (PR #44 je z pantry vedome vyhodil, nevracim je):
--   olivovy olej (8 receptu), maslo (2), olej (1)   884 / 717 / 884 kcal/100 g
--   cukr ("Powdered sugar"), med ("Honey")          zabradli by je stejne odmitlo
--   javorovy sirup (4 recepty)                      uzivatel jmenovite: sirup ne
--
-- Jidlo, ne ozdoba — vynechani by zmenilo vysledek receptu:
--   ryze (2)          "1 servings ryze", "1 servings hneda ryze"
--   feta (2)          "crumbled feta cheese", "Feta cheese"
--   granola (1)       "Granola"
--   dzem (2)          "Jam", "raspberry fruit spread or jam"
--   slanina (1)       "Bacon"                       541 kcal/100 g
--   vejce (1)         "Eggs"
--   bily jogurt (1)   "Green yogurt";  vanilkovy jogurt (1)
--   slazene kondenzovane mleko (1)
--   testo na kolac (1) "Store bought pie crust"     518 kcal/100 g
--   zelenina (1)      "1 servings zelenina" — obecna zelenina je slozka, ne ozdoba
--   ovoce jako slozka: jahody (2), boruvky (1), maliny (1), broskev (1),
--                      cerstve ovoce (1) "Chopped fruit", banan (1)
--
-- Kaloricky huste "posypy" — vypadaji jako ozdoba, ale nejsou:
--   kokosove vlocky (660 kcal, 64,5 g tuku)   ZABRADLI JE ODMITA
--   slunecnicova seminka (584, 51,5 g tuku)   "Sunflower seeds for garnishing"
--   sezamova seminka (573, 50,0 g tuku)       ZABRADLI JE ODMITA
--   Trigger trg_pantry_ingredient_neni_kaloricka z PR #44 u tri z nich zasahl
--   sam a ma pravdu: 50-65 g tuku na 100 g neni ozdoba, i kdyz se sype.
--   mak (525 kcal, 41,6 g tuku) zabradlim PROJDE, ale nechavam ho blokovany
--   taky — poustet mak a zastavit sezam by byla nahoda hranice, ne pravidlo.
--   cokoladove kousky (480 kcal) "chocolate shavings" — nad linii 350.
--   orechy (2) "Almonds", "Pistachio nuts, crumbled"  650 kcal/100 g
--   vlasske orechy (1) "If you like walnuts- add those as well"  730 kcal/100 g
--   ovesne vlocky (1) "oats (to sprinkle on top)" — text rika posyp, ale ovesne
--     vlocky jsou stejna trida jidla jako granola, kterou uzivatel jmenovite
--     vyradil. Radeji nekonzistenci nedelam.
--
-- Ve slovniku nejsou a prisne posouzeno jako jidlo:
--   amaretti (1)                "1 servings amaretti" — susenky, ne ozdoba
--   crepes (1)                  "your favorite crepes" — palacinky jsou zaklad jidla
--   crust (1)                   "Crust" — korpus
--   krupavy chleb k podavani (1) "Crusty bread to serve" — pecivo k jidlu
--   barbecue omacka (1)         "Barbecue sauce to taste" — "to taste" svadi
--     k zarazeni mezi dochucovadla, ale BBQ omacka se bezne pouziva i jako
--     glazura po lzicich; nechavam blokovanou.
--   chilli pasta (1)            "1 servings chilli pasta" — nazev je dvojznacny
--     (chilli PASTA jako pasta z chilli, nebo testoviny s chilli?). Nehadam.
--   brusinkovo-pomerancova omacka (1) "Or cranberry-orange relish" — zacina "Or",
--     tedy alternativa k jine surovine; navic priloha, ne ozdoba.

-- ===========================================================================
-- HROMADKA 3: neni to surovina (zbytek parsovani) -> nikam
-- ===========================================================================
--   hrnec. odlomte a odhodte tvrde konce z  <- veta z postupu
--       "saucepan. Snap and discard tough ends from the"
--   lehce oslazena slehacka nebo            <- uty nazev s visicim "nebo"
--   cokolada a extra kakaovy prasek         <- dve suroviny slite do jedne
--       "Shaved chocolate & extra cocoa powder for garnish"
--   habanero omacka a chile                 <- dve suroviny slite do jedne
-- Do slovniku ani do pantry nepatri. Odemkne je oprava parseru, ne kurace.

-- ===========================================================================
-- Kontroly — meri se DOPAD, ne jen ze migrace prosla.
--
-- Presne tohle chybelo v PR #43: tam se do pantry pridaly 4 polozky, ktere
-- kvuli podmince `gramu is null` nemely zadny efekt, a nikdo si toho nevsiml.
-- ===========================================================================
DO $$
DECLARE
  v_pred     integer;
  v_po       integer;
  v_regrese  integer;
  v_chybi    integer;
BEGIN
  -- Vsech 12 polozek se muselo opravdu vlozit (zabradli mohlo neco odmitnout).
  SELECT count(*) INTO v_chybi FROM (VALUES
    ('jarni cibulka'),('mata'),('limetka'),('pomerancova kura'),('tarragon stalks'),
    ('salt & pepper'),('cracked pepper'),('estragon'),('chilli vlocky'),
    ('citronova kura'),('citronova stava'),('sriracha')) AS v(n)
  WHERE NOT EXISTS (SELECT 1 FROM public.pantry_ingredients p WHERE p.name_normalized = v.n);
  IF v_chybi > 0 THEN
    RAISE EXCEPTION 'V pantry chybi % z 12 pridavanych polozek.', v_chybi;
  END IF;

  -- Kaloricky vyznamna vec se do pantry pridat nesmela ani omylem.
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

  IF v_po <= v_pred THEN
    RAISE EXCEPTION 'Pocet spocitatelnych receptu nestoupl: % -> %. Pridani do pantry nemelo efekt.', v_pred, v_po;
  END IF;

  -- Pridani do pantry umi recept jen odblokovat, nikdy zablokovat — zanedbatelnost
  -- se uplatni vyhradne u radku, ktery se stejne nepocital. Kdyby to neplatilo,
  -- je to chyba v uvaze a musi to spadnout.
  SELECT count(*) INTO v_regrese
  FROM _pred p JOIN _po n ON n.id = p.id
  WHERE p.complete AND NOT n.complete;
  IF v_regrese > 0 THEN
    RAISE EXCEPTION 'Regrese: % receptu prestalo byt spocitatelnych.', v_regrese;
  END IF;

  RAISE NOTICE 'Cast A: spocitatelnych receptu % -> % (+%).', v_pred, v_po, v_po - v_pred;
END $$;
