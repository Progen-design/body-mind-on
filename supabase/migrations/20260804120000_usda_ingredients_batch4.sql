-- Slovnik surovin, davka 4: hromadka "doplnit" z .cache/chybejici-suroviny-navrh.csv
--
-- MERENI, KTERE K TOMU VEDLO. Po kole 3 aliasu zbyva v aktivnich receptech 217
-- nepokrytych nazvu surovin, ktere blokuji 143 ze 433 aktivnich receptu. Z nich
-- bylo 149 vyhodnoceno jako surovina, ktera ve slovniku CHYBI CELA — alias by
-- u nich lhal o tuku nebo o zpracovani.
--
-- Hodnoty jsou z USDA FoodData Central pres scripts/fetch-usda-ingredients.mjs,
-- ke kazdemu radku patri FDC ID a presny nazev polozky. Nic se nedopocitava.
--
-- ZAPSANO 78 ze 149. Zbytek se nezapisuje ze dvou duvodu:
--   a) dotaz nejde polozit tak, aby jiste trefil tu surovinu (znackove vyrobky,
--      slozene pokrmy, prilis obecne nazvy) — vypsano v komentari ve skriptu
--   b) USDA vratilo JINOU surovinu a kontrola vystupu to zachytila:
--        syr asiago      -> Cheese spread, cream cheese base (7,1 g bilkovin misto ~25)
--        psenicna tortilla -> Puff pastry, frozen
--        kukuricna tortilla -> Puff pastry, frozen (stejne FDC ID)
--        reduced fat cheddar -> Cheese spread, reduced fat (13,4 g bilkovin misto ~28)
--        snizenotucna smetana -> Cream, fluid, LIGHT WHIPPING (30,9 g tuku)
--      a dohledat se nepodarilo: susene brusinky, guacamole
--
-- ALIASY NA KONCI. Nazvy v receptech jsou casto anglicke ("swiss cheese") nebo
-- jinak psane ("sou cream", "recky jogurt plnotucny"). Bez aliasu by nove
-- suroviny lezely ve slovniku a zadny recept by se neodblokoval. Alias miri
-- vzdycky na surovinu, ktera z prave te potraviny vznikla — nejde o mapovani
-- na neco podobneho, jako v kolech 1-3.

-- name_normalized je NOT NULL, tvar lower(unaccent(name_cs)) s pomlckami misto mezer.
INSERT INTO public.ingredients_nutrition
  (name_en, name_cs, name_normalized, kcal_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g, source)
SELECT v.name_en, v.name_cs,
       replace(lower(extensions.unaccent(v.name_cs)), ' ', '-'),
       v.kcal, v.protein, v.carbs, v.fat, 'usda_fdc'
FROM (VALUES
  -- FDC 746767 (Foundation): Cheese, swiss
  ('swiss cheese', 'ementál', 393::numeric, 27::numeric, 1.44::numeric, 31::numeric),
  -- FDC 172177 (SR Legacy): Cheese, brie
  ('brie cheese', 'brie', 334::numeric, 20.8::numeric, 0.45::numeric, 27.7::numeric),
  -- FDC 171241 (SR Legacy): Cheese, gouda
  ('gouda cheese', 'gouda', 356::numeric, 24.9::numeric, 2.22::numeric, 27.4::numeric),
  -- FDC 171242 (SR Legacy): Cheese, gruyere
  ('gruyere cheese', 'gruyère', 413::numeric, 29.8::numeric, 0.36::numeric, 32.3::numeric),
  -- FDC 170844 (SR Legacy): Cheese, monterey
  ('monterey jack cheese', 'monterey jack', 373::numeric, 24.5::numeric, 0.68::numeric, 30.3::numeric),
  -- FDC 171249 (SR Legacy): Cheese, romano
  ('romano cheese', 'pecorino romano', 387::numeric, 31.8::numeric, 3.63::numeric, 26.9::numeric),
  -- FDC 171254 (SR Legacy): Cheese spread, pasteurized process, American
  ('american cheese', 'americký tavený sýr', 290::numeric, 16.4::numeric, 8.73::numeric, 21.2::numeric),
  -- FDC 171257 (SR Legacy): Cream, sour, cultured
  ('sour cream', 'zakysaná smetana', 198::numeric, 2.44::numeric, 4.63::numeric, 19.4::numeric),
  -- FDC 171284 (SR Legacy): Yogurt, plain, whole milk
  ('whole milk yogurt', 'plnotučný bílý jogurt', 61::numeric, 3.47::numeric, 4.66::numeric, 3.25::numeric),
  -- FDC 170887 (SR Legacy): Yogurt, plain, skim milk
  ('nonfat yogurt', 'netučný bílý jogurt', 56::numeric, 5.73::numeric, 7.68::numeric, 0.18::numeric),
  -- FDC 2259794 (Foundation): Yogurt, Greek, plain, whole milk
  ('whole milk greek yogurt', 'plnotučný řecký jogurt', 93.7::numeric, 8.78::numeric, 4.75::numeric, 4.39::numeric),
  -- FDC 170907 (SR Legacy): Yogurt, Greek, vanilla, lowfat
  ('vanilla greek yogurt', 'vanilkový řecký jogurt', 95::numeric, 8.64::numeric, 9.54::numeric, 2.5::numeric),
  -- FDC 170888 (SR Legacy): Yogurt, vanilla, low fat.
  ('vanilla yogurt', 'vanilkový jogurt', 85::numeric, 4.93::numeric, 13.8::numeric, 1.25::numeric),
  -- FDC 168751 (SR Legacy): Beverages, almond milk, sweetened, vanilla flavor, ready-to-drink
  ('vanilla almond milk', 'vanilkové mandlové mléko', 38::numeric, 0.42::numeric, 6.59::numeric, 1.04::numeric),
  -- FDC 171431 (SR Legacy): Margarine, margarine-like vegetable oil spread, 67-70% fat, tub
  ('margarine spread', 'rostlinný tuk', 606::numeric, 0.07::numeric, 0.59::numeric, 68.3::numeric),
  -- FDC 171450 (SR Legacy): Chicken, broilers or fryers, meat and skin, cooked, roasted
  ('chicken', 'kuře', 239::numeric, 27.3::numeric, 0::numeric, 13.6::numeric),
  -- FDC 172376 (SR Legacy): Chicken, broilers or fryers, dark meat, drumstick, meat only, cooked, roasted
  ('chicken drumstick', 'kuřecí paličky', 155::numeric, 24.2::numeric, 0::numeric, 5.7::numeric),
  -- FDC 2514745 (Foundation): Pork, ground, raw
  ('ground pork', 'mleté vepřové', 228::numeric, 17.8::numeric, 0::numeric, 17.5::numeric),
  -- FDC 167850 (SR Legacy): Pork, fresh, shoulder, (Boston butt), blade (steaks), separable lean and fat, cooked, braised
  ('pork shoulder', 'vepřová plec', 267::numeric, 25.1::numeric, 0::numeric, 17.7::numeric),
  -- FDC 174577 (SR Legacy): Polish sausage, pork
  ('sausage', 'klobása', 326::numeric, 14.1::numeric, 1.63::numeric, 28.7::numeric),
  -- FDC 173871 (SR Legacy): Sausage, turkey, fresh, cooked
  ('turkey sausage', 'krůtí klobása', 196::numeric, 23.9::numeric, 0::numeric, 10.4::numeric),
  -- FDC 173859 (SR Legacy): Sausage, pork, chorizo, link or ground, raw
  ('chorizo sausage', 'chorizo', 296::numeric, 13.6::numeric, 3.78::numeric, 25.1::numeric),
  -- FDC 170200 (SR Legacy): Beef, cured, corned beef, brisket, cooked
  ('corned beef', 'nakládané hovězí', 251::numeric, 18.2::numeric, 0.47::numeric, 19::numeric),
  -- FDC 173332 (SR Legacy): Beef, corned beef hash, with potato, canned
  ('corned beef hash', 'hovězí hash', 164::numeric, 8.73::numeric, 9.27::numeric, 10.2::numeric),
  -- FDC 172189 (SR Legacy): Egg, duck, whole, fresh, raw
  ('duck egg', 'kachní vejce', 185::numeric, 12.8::numeric, 1.45::numeric, 13.8::numeric),
  -- FDC 173462 (SR Legacy): Egg substitute, liquid or frozen, fat free
  ('egg substitute', 'náhrada vajec', 48::numeric, 10::numeric, 2::numeric, 0::numeric),
  -- FDC 169387 (SR Legacy): Arugula, raw
  ('arugula', 'rukola', 25::numeric, 2.58::numeric, 3.65::numeric, 0.66::numeric),
  -- FDC 2685576 (Foundation): Beets, raw
  ('beets', 'červená řepa', 44.6::numeric, 1.69::numeric, 8.79::numeric, 0.302::numeric),
  -- FDC 170375 (SR Legacy): Beet greens, raw
  ('beet greens', 'listy červené řepy', 22::numeric, 2.2::numeric, 4.33::numeric, 0.13::numeric),
  -- FDC 170406 (SR Legacy): Collards, raw
  ('collard greens', 'listová kapusta collard', 32::numeric, 3.02::numeric, 5.42::numeric, 0.61::numeric),
  -- FDC 170417 (SR Legacy): Parsnips, raw
  ('parsnip', 'pastinák', 75::numeric, 1.2::numeric, 18::numeric, 0.3::numeric),
  -- FDC 170068 (SR Legacy): Watercress, raw
  ('watercress', 'řeřicha', 11::numeric, 2.3::numeric, 1.29::numeric, 0.1::numeric),
  -- FDC 170010 (SR Legacy): Peas, edible-podded, raw
  ('snow peas', 'cukrový hrášek', 42::numeric, 2.8::numeric, 7.55::numeric, 0.2::numeric),
  -- FDC 170130 (SR Legacy): Squash, winter, butternut, cooked, baked, with salt
  ('cooked butternut squash', 'máslová dýně vařená', 40::numeric, 0.9::numeric, 10.5::numeric, 0.09::numeric),
  -- FDC 169941 (SR Legacy): Persimmons, japanese, raw
  ('persimmon', 'kaki', 70::numeric, 0.58::numeric, 18.6::numeric, 0.19::numeric),
  -- FDC 169090 (SR Legacy): Mangosteen, canned, syrup pack
  ('mangosteen', 'mangostana', 73::numeric, 0.41::numeric, 17.9::numeric, 0.58::numeric),
  -- FDC 167766 (SR Legacy): Maraschino cherries, canned, drained
  ('maraschino cherries', 'koktejlové třešně', 165::numeric, 0.22::numeric, 42::numeric, 0.21::numeric),
  -- FDC 168156 (SR Legacy): Lime juice, raw
  ('lime juice', 'limetková šťáva', 25::numeric, 0.42::numeric, 8.42::numeric, 0.07::numeric),
  -- FDC 170174 (SR Legacy): Nuts, coconut water (liquid from coconuts)
  ('coconut water', 'kokosová voda', 19::numeric, 0.72::numeric, 3.71::numeric, 0.2::numeric),
  -- FDC 174925 (SR Legacy): Bread, white, commercially prepared, toasted
  ('bread', 'chléb', 290::numeric, 9::numeric, 54.5::numeric, 4::numeric),
  -- FDC 168013 (SR Legacy): Bread, multi-grain (includes whole-grain)
  ('multigrain bread', 'vícezrnný chléb', 265::numeric, 13.4::numeric, 43.3::numeric, 4.23::numeric),
  -- FDC 172673 (SR Legacy): Bread, egg
  ('challah bread', 'challah chléb', 287::numeric, 9.5::numeric, 47.8::numeric, 6::numeric),
  -- FDC 171845 (SR Legacy): Bread, naan, plain, commercially prepared, refrigerated
  ('naan bread', 'naan', 291::numeric, 9.62::numeric, 50.4::numeric, 5.65::numeric),
  -- FDC 174915 (SR Legacy): Bread, pita, white, enriched
  ('pita bread', 'pita', 275::numeric, 9.1::numeric, 55.7::numeric, 1.2::numeric),
  -- FDC 174916 (SR Legacy): Bread, pita, whole-wheat
  ('whole wheat pita', 'celozrnná pita', 262::numeric, 9.8::numeric, 55.9::numeric, 1.71::numeric),
  -- FDC 174987 (SR Legacy): Croissants, butter
  ('croissant', 'croissant', 406::numeric, 8.2::numeric, 45.8::numeric, 21::numeric),
  -- FDC 172751 (SR Legacy): Croutons, plain
  ('croutons', 'krutony', 407::numeric, 11.9::numeric, 73.5::numeric, 6.6::numeric),
  -- FDC 169741 (SR Legacy): Oat flour, partially debranned
  ('oat flour', 'ovesná mouka', 404::numeric, 14.7::numeric, 65.7::numeric, 9.12::numeric),
  -- FDC 168867 (SR Legacy): Cornmeal, degermed, enriched, yellow
  ('cornmeal', 'kukuřičná krupice', 370::numeric, 7.11::numeric, 79.4::numeric, 1.75::numeric),
  -- FDC 175022 (SR Legacy): Pie crust, standard-type, dry mix
  ('pie crust', 'těsto na koláč', 518::numeric, 6.9::numeric, 52.1::numeric, 31.4::numeric),
  -- FDC 175006 (SR Legacy): Pancakes, plain, dry mix, complete, prepared
  ('pancake mix', 'palačinková směs', 194::numeric, 5.2::numeric, 36.7::numeric, 2.5::numeric),
  -- FDC 173912 (SR Legacy): Cereals ready-to-eat, rice, puffed, fortified
  ('puffed rice', 'pufovaná rýže', 402::numeric, 6.3::numeric, 89.8::numeric, 0.5::numeric),
  -- FDC 175043 (SR Legacy): Leavening agents, yeast, baker's, active dry
  ('yeast', 'droždí', 325::numeric, 40.4::numeric, 41.2::numeric, 7.61::numeric),
  -- FDC 174523 (SR Legacy): Sauce, barbecue
  ('barbecue sauce', 'barbecue omáčka', 172::numeric, 0.82::numeric, 40.8::numeric, 0.63::numeric),
  -- FDC 172886 (SR Legacy): Sauce, hoisin, ready-to-serve
  ('hoisin sauce', 'hoisin omáčka', 220::numeric, 3.31::numeric, 44.1::numeric, 3.39::numeric),
  -- FDC 174529 (SR Legacy): Sauce, oyster, ready-to-serve
  ('oyster sauce', 'ústřicová omáčka', 51::numeric, 1.35::numeric, 10.9::numeric, 0.25::numeric),
  -- FDC 174527 (SR Legacy): Sauce, ready-to-serve, pepper or hot
  ('hot sauce', 'pálivá omáčka', 11::numeric, 0.51::numeric, 1.75::numeric, 0.37::numeric),
  -- FDC 746777 (Foundation): Sauce, salsa, ready-to-serve
  ('salsa', 'salsa', 29::numeric, 1.44::numeric, 6.74::numeric, 0.19::numeric),
  -- FDC 171582 (SR Legacy): Sauce, pesto, CLASSICO, basil pesto, ready-to-serve
  ('pesto sauce', 'pesto', 372::numeric, 4.16::numeric, 6.93::numeric, 36.4::numeric),
  -- FDC 173592 (SR Legacy): Salad dressing, ranch dressing, regular
  ('ranch dressing', 'ranch dresink', 430::numeric, 1.32::numeric, 5.9::numeric, 44.5::numeric),
  -- FDC 173961 (SR Legacy): Cranberry sauce, canned, sweetened
  ('cranberry sauce', 'brusinková omáčka', 159::numeric, 0.9::numeric, 40.4::numeric, 0.15::numeric),
  -- FDC 2685580 (Foundation): Tomato, paste, canned, without salt added
  ('tomato paste', 'rajčatový protlak', 104::numeric, 4.23::numeric, 20.2::numeric, 0.732::numeric),
  -- FDC 171155 (SR Legacy): Soup, cream of mushroom, canned, condensed
  ('cream of mushroom soup', 'houbová polévka', 79::numeric, 1.35::numeric, 6.8::numeric, 5.3::numeric),
  -- FDC 171146 (SR Legacy): Soup, cream of chicken, canned, condensed
  ('cream of chicken soup', 'kuřecí polévka', 90::numeric, 2.38::numeric, 7.16::numeric, 5.77::numeric),
  -- FDC 172442 (SR Legacy): Miso
  ('miso paste', 'miso', 198::numeric, 12.8::numeric, 25.4::numeric, 6.01::numeric),
  -- FDC 172438 (SR Legacy): Refried beans, canned, traditional style
  ('refried beans', 'fazolová kaše', 90::numeric, 4.98::numeric, 13.6::numeric, 2.01::numeric),
  -- FDC 169641 (SR Legacy): Jams and preserves
  ('jam', 'džem', 278::numeric, 0.37::numeric, 68.9::numeric, 0.07::numeric),
  -- FDC 170934 (SR Legacy): Spices, saffron
  ('saffron', 'šafrán', 310::numeric, 11.4::numeric, 65.4::numeric, 5.85::numeric),
  -- FDC 170919 (SR Legacy): Spices, cardamom
  ('cardamom', 'kardamom', 311::numeric, 10.8::numeric, 68.5::numeric, 6.7::numeric),
  -- FDC 171321 (SR Legacy): Spices, cloves, ground
  ('cloves', 'hřebíček', 274::numeric, 5.97::numeric, 65.5::numeric, 13::numeric),
  -- FDC 171316 (SR Legacy): Spices, anise seed
  ('anise seed', 'anýzová semínka', 337::numeric, 17.6::numeric, 50::numeric, 15.9::numeric),
  -- FDC 170937 (SR Legacy): Spices, tarragon, dried
  ('tarragon', 'estragon', 295::numeric, 22.8::numeric, 50.2::numeric, 7.24::numeric),
  -- FDC 170929 (SR Legacy): Spices, mustard seed, ground
  ('ground mustard', 'hořčičný prášek', 508::numeric, 26.1::numeric, 28.1::numeric, 36.2::numeric),
  -- FDC 170002 (SR Legacy): Onions, dehydrated flakes
  ('onion flakes', 'cibulové vločky', 349::numeric, 8.95::numeric, 83.3::numeric, 0.46::numeric),
  -- FDC 171330 (SR Legacy): Spices, poppy seed
  ('poppy seed', 'mák', 525::numeric, 18::numeric, 28.1::numeric, 41.6::numeric),
  -- FDC 173756 (SR Legacy): Chickpeas (garbanzo beans, bengal gram), mature seeds, raw
  ('dried chickpeas', 'sušená cizrna', 378::numeric, 20.5::numeric, 63::numeric, 6.04::numeric),
  -- FDC 171890 (SR Legacy): Beverages, coffee, brewed, prepared with tap water
  ('coffee', 'káva', 1::numeric, 0.12::numeric, 0::numeric, 0.02::numeric),
  -- FDC 174817 (SR Legacy): Alcoholic beverage, distilled, rum, 80 proof
  ('rum', 'rum', 231::numeric, 0::numeric, 0::numeric, 0::numeric)
) AS v(name_en, name_cs, kcal, protein, carbs, fat)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Zruseni tri aliasu, ktere by nova data zastinily
--
-- Alias se v compute_nutrition_for_ingredients vyhodnocuje PRED slovnikem,
-- takze dokud tyhle tri existuji, novych radku se nikdo nedopta:
--
--   vanilkovy jogurt -> bily jogurt       61 kcal / 4,7 g S   vs  85 / 13,8 (skutecny vanilkovy)
--   limetkova stava  -> citronova stava   jiny citrus
--   chleb            -> celozrnny chleb   celozrnny vs bily
--
-- V kolech 1-3 to byla nejlepsi dostupna aproximace. Ted uz mame presnou
-- surovinu z USDA, takze aproximace prekazi.
-- ---------------------------------------------------------------------------
DELETE FROM public.ingredient_aliases
WHERE alias_normalized IN ('vanilkovy jogurt', 'limetkova stava', 'chleb');

-- ---------------------------------------------------------------------------
-- Aliasy: podoby nazvu z receptu -> nove suroviny (65)
-- ---------------------------------------------------------------------------
INSERT INTO ingredient_aliases (alias_normalized, canonical_normalized, display_alias_cs)
SELECT v.a, v.c, v.a
FROM (VALUES
  ('baby arugula','rukola'),
  ('baby beets','cervena repa'),
  ('barbecue sauce','barbecue omacka'),
  ('berry cranberry sauce','brusinkova omacka'),
  ('bread','chleb'),
  ('coconut water','kokosova voda'),
  ('collard greens','listova kapusta collard'),
  ('corned beef hash','hovezi hash'),
  ('croissanty','croissant'),
  ('grain bread','vicezrnny chleb'),
  ('grape preserves','dzem'),
  ('hoisin sauce','hoisin omacka'),
  ('hot sauce','paliva omacka'),
  ('chorizo klobasa','chorizo'),
  ('jack cheese','monterey jack'),
  ('jogurt z plnotucneho mleka','plnotucny bily jogurt'),
  ('krutonky','krutony'),
  ('lime juice','limetkova stava'),
  ('lime stava','limetkova stava'),
  ('liquid egg substitute','nahrada vajec'),
  ('mangosteen','mangostana'),
  ('maraschino tresen','koktejlove tresne'),
  ('maslo country crock','rostlinny tuk'),
  ('maslova dynova kase','maslova dyne varena'),
  ('miso paste','miso'),
  ('mlade listy cervene repy','listy cervene repy'),
  ('mleta horcice','horcicny prasek'),
  ('mleta kukuricna krupice','kukuricna krupice'),
  ('mlete hrebicek','hrebicek'),
  ('mlety horcicny prasek','horcicny prasek'),
  ('mlety kardamom','kardamom'),
  ('monterey jack syr','monterey jack'),
  ('multigrain bread','vicezrnny chleb'),
  ('naan bread','naan'),
  ('nepecene testo na kolac','testo na kolac'),
  ('non fat yogurt','netucny bily jogurt'),
  ('ostre americke syry','americky taveny syr'),
  ('parsnip','pastinak'),
  ('pita chleb z celozrnne mouky','celozrnna pita'),
  ('pita pockets','pita'),
  ('predpeceny korpus','testo na kolac'),
  ('pufovany ryzovy cerealie','pufovana ryze'),
  ('ranch dressing','ranch dresink'),
  ('raspberry fruit spread','dzem'),
  ('recky jogurt plnotucny','plnotucny recky jogurt'),
  ('recky jogurt s vanilkou','vanilkovy recky jogurt'),
  ('refried fazole','fazolova kase'),
  ('romano syr','pecorino romano'),
  ('silna kava','kava'),
  ('smetanova houbova polevka','houbova polevka'),
  ('smetanova kureci polevka','kureci polevka'),
  ('sou cream','zakysana smetana'),
  ('swiss cheese','emental'),
  ('syr brie','brie'),
  ('syr gouda prima donna','gouda'),
  ('syr gruyere','gruyere'),
  ('tarragon leaves','estragon'),
  ('testo na quiche','testo na kolac'),
  ('trocha maku','mak'),
  ('vajecny nahrazka','nahrada vajec'),
  ('vanilla almond milk','vanilkove mandlove mleko'),
  ('vanilla silk almond milk','vanilkove mandlove mleko'),
  ('vanilla yogurt','vanilkovy jogurt'),
  ('veganske maslo','rostlinny tuk'),
  ('watercress','rericha')
) AS v(a, c)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Kontrola: zadny alias nesmi mirit do prazdna.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_slepych integer;
BEGIN
  SELECT count(*) INTO v_slepych
  FROM public.ingredient_aliases a
  WHERE NOT EXISTS (
    SELECT 1 FROM public.ingredients_nutrition i
    WHERE lower(extensions.unaccent(i.name_cs)) = a.canonical_normalized
  )
  AND NOT public.is_pantry_ingredient(a.canonical_normalized);

  IF v_slepych <> 0 THEN
    RAISE EXCEPTION 'Aliasu miricich do prazdna je %, cekali jsme 0.', v_slepych;
  END IF;
END $$;
