-- Slovnik surovin, davka 3: dlouhy ocas z blokovanych receptu.
--
-- Meritko problemu: 485 ruznych nazvu surovin neni ani v ingredients_nutrition,
-- ani v pantry_ingredients, a blokuji 192 ze 426 aktivnich receptu. Skladac si
-- pak zada 24-48 kandidatu na slot a dostane jednotky (snidane 128 -> 21,
-- svacina 42 -> 20), takze se tydenni jidelnicek opakuje.
--
-- Tahle migrace resi tu cast ocasu, kde alias na existujici surovinu nejde:
-- surovina se lisi tukem nebo zpracovanim (odtucnene mleko neni mleko), nebo
-- ve slovniku proste chybi (feta, datle, olivy).
--
-- Hodnoty jsou z USDA FoodData Central pres scripts/fetch-usda-ingredients.mjs
-- (--batch=3). Ke kazdemu radku je FDC ID a nazev zdrojove polozky, takze je
-- kazde cislo dohledatelne. Zadne cislo nepochazi od modelu.
--
-- VYNECHANO po dvou neuspesnych pokusech (USDA vracelo jinou surovinu):
--   mascarpone       -> 'cheese italian mascarpone' vratilo restauracni ravioli
--   matcha prasek    -> 'spices tea powder' vratilo chilli prasek
--   susene brusinky  -> 'cranberries dried sweetened...' vratilo jablecne pyre
-- Zustavaji nenamapovane; doplnit rucne z SR Legacy v dalsim kole.
--
-- name_normalized je NOT NULL, tvar lower(unaccent(name_cs)) s pomlckami
-- misto mezer (viz stavajici radky: "kureci prsa" -> "kureci-prsa").

INSERT INTO public.ingredients_nutrition
  (name_en, name_cs, name_normalized, kcal_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g, source)
SELECT v.name_en, v.name_cs,
       replace(lower(extensions.unaccent(v.name_cs)), ' ', '-'),
       v.kcal, v.protein, v.carbs, v.fat, 'usda_fdc'
FROM (VALUES
  -- FDC 173420 (SR Legacy): Cheese, feta
  ('feta cheese', 'feta', 265::numeric, 14.2::numeric, 3.88::numeric, 21.5::numeric),
  -- FDC 170903 (SR Legacy): Yogurt, Greek, plain, lowfat
  ('low fat greek yogurt', 'nízkotučný řecký jogurt', 73::numeric, 9.95::numeric, 3.94::numeric, 1.92::numeric),
  -- FDC 170859 (SR Legacy): Cream, fluid, heavy whipping
  ('whipping cream', 'šlehačka', 340::numeric, 2.84::numeric, 2.84::numeric, 36.1::numeric),
  -- FDC 168164 (SR Legacy): Raisins, golden, seedless
  ('raisins', 'rozinky', 301::numeric, 3.28::numeric, 80::numeric, 0.2::numeric),
  -- FDC 170874 (SR Legacy): Milk, buttermilk, fluid, cultured, lowfat
  ('buttermilk', 'podmáslí', 40::numeric, 3.31::numeric, 4.79::numeric, 1.07::numeric),
  -- FDC 168567 (SR Legacy): Tomatoes, sun-dried
  ('sun-dried tomatoes', 'sušená rajčata', 258::numeric, 14.1::numeric, 55.8::numeric, 2.97::numeric),
  -- FDC 169103 (SR Legacy): Orange peel, raw
  ('orange peel', 'pomerančová kůra', 97::numeric, 1.5::numeric, 25::numeric, 0.2::numeric),
  -- FDC 167976 (SR Legacy): Candies, semisweet chocolate
  ('chocolate chips', 'čokoládové kousky', 480::numeric, 4.2::numeric, 63.9::numeric, 30::numeric),
  -- FDC 169868 (SR Legacy): Milk, fluid, nonfat, calcium fortified (fat free or skim)
  ('skim milk', 'odtučněné mléko', 35::numeric, 3.4::numeric, 4.85::numeric, 0.18::numeric),
  -- FDC 173435 (SR Legacy): Cheese, goat, soft type
  ('goat cheese', 'kozí sýr', 264::numeric, 18.5::numeric, 0::numeric, 21.1::numeric),
  -- FDC 168603 (SR Legacy): Nuts, almond butter, plain, with salt added
  ('almond butter', 'mandlové máslo', 614::numeric, 21::numeric, 18.8::numeric, 55.5::numeric),
  -- FDC 2515382 (Foundation): Flour, coconut
  ('coconut flour', 'kokosová mouka', 438::numeric, 16.1::numeric, 58.9::numeric, 15.3::numeric),
  -- FDC 170170 (SR Legacy): Nuts, coconut meat, dried (desiccated), not sweetened
  ('shredded coconut', 'kokosové vločky', 660::numeric, 6.88::numeric, 23.6::numeric, 64.5::numeric),
  -- FDC 169715 (SR Legacy): Semolina, enriched
  ('semolina', 'krupice', 360::numeric, 12.7::numeric, 72.8::numeric, 1.05::numeric),
  -- FDC 171697 (SR Legacy): Apricots, raw
  ('apricots', 'meruňky', 48::numeric, 1.4::numeric, 11.1::numeric, 0.39::numeric),
  -- FDC 168820 (SR Legacy): Molasses
  ('molasses', 'melasa', 290::numeric, 0::numeric, 74.7::numeric, 0.1::numeric),
  -- FDC 169095 (SR Legacy): Olives, ripe, canned (jumbo-super colossal)
  ('olives', 'olivy', 81::numeric, 0.97::numeric, 5.61::numeric, 6.87::numeric),
  -- FDC 173946 (SR Legacy): Blackberries, raw
  ('blackberries', 'ostružiny', 43::numeric, 1.39::numeric, 9.61::numeric, 0.49::numeric),
  -- FDC 170687 (SR Legacy): Buckwheat flour, whole-groat
  ('buckwheat flour', 'pohanková mouka', 335::numeric, 12.6::numeric, 70.6::numeric, 3.1::numeric),
  -- FDC 169097 (SR Legacy): Oranges, raw, all commercial varieties
  ('orange', 'pomeranč', 47::numeric, 0.94::numeric, 11.8::numeric, 0.12::numeric),
  -- FDC 173473 (SR Legacy): Rosemary, fresh
  ('rosemary', 'rozmarýn', 131::numeric, 3.31::numeric, 20.7::numeric, 5.86::numeric),
  -- FDC 168450 (SR Legacy): Pumpkin, canned, without salt
  ('pumpkin puree', 'dýňové pyré', 34::numeric, 1.1::numeric, 8.09::numeric, 0.28::numeric),
  -- FDC 168191 (SR Legacy): Dates, medjool
  ('dates', 'datle', 277::numeric, 1.81::numeric, 75::numeric, 0.15::numeric),
  -- FDC 173021 (SR Legacy): Figs, raw
  ('figs', 'fíky', 74::numeric, 0.75::numeric, 19.2::numeric, 0.3::numeric),
  -- FDC 174683 (SR Legacy): Grapes, red or green (European type, such as Thompson seedless), raw
  ('grapes', 'hroznové víno', 69::numeric, 0.72::numeric, 18.1::numeric, 0.16::numeric),
  -- FDC 170184 (SR Legacy): Nuts, pistachio nuts, raw
  ('pistachios', 'pistácie', 560::numeric, 20.2::numeric, 27.2::numeric, 45.3::numeric),
  -- FDC 170169 (SR Legacy): Nuts, coconut meat, raw
  ('coconut', 'kokos', 354::numeric, 3.33::numeric, 15.2::numeric, 33.5::numeric),
  -- FDC 167765 (SR Legacy): Watermelon, raw
  ('watermelon', 'vodní meloun', 30::numeric, 0.61::numeric, 7.55::numeric, 0.15::numeric),
  -- FDC 169276 (SR Legacy): Radishes, raw
  ('radishes', 'ředkvičky', 16::numeric, 0.68::numeric, 3.4::numeric, 0.1::numeric),
  -- FDC 2685575 (Foundation): Brussels sprouts, raw
  ('brussels sprouts', 'růžičková kapusta', 59.5::numeric, 3.98::numeric, 9.62::numeric, 0.565::numeric),
  -- FDC 171401 (SR Legacy): Lard
  ('lard', 'sádlo', 902::numeric, 0::numeric, 0::numeric, 100::numeric),
  -- FDC 169599 (SR Legacy): Gelatins, dry powder, unsweetened
  ('gelatin', 'želatina', 335::numeric, 85.6::numeric, 0::numeric, 0.1::numeric),
  -- FDC 171538 (SR Legacy): Soup, beef broth or bouillon canned, ready-to-serve
  ('beef broth', 'hovězí vývar', 7::numeric, 1.14::numeric, 0.04::numeric, 0.22::numeric),
  -- FDC 172195 (SR Legacy): Milk, dry, nonfat, regular, with added vitamin A and vitamin D
  ('milk powder', 'sušené mléko', 362::numeric, 36.2::numeric, 52::numeric, 0.77::numeric),
  -- FDC 171646 (SR Legacy): Cereals ready-to-eat, granola, homemade
  ('granola', 'granola', 489::numeric, 13.7::numeric, 53.9::numeric, 24.3::numeric),
  -- FDC 170932 (SR Legacy): Spices, pepper, red or cayenne
  ('chili flakes', 'chilli vločky', 318::numeric, 12::numeric, 56.6::numeric, 17.3::numeric),
  -- FDC 169134 (SR Legacy): Pomegranates, raw
  ('pomegranate seeds', 'semínka granátového jablka', 83::numeric, 1.67::numeric, 18.7::numeric, 1.17::numeric),
  -- FDC 173963 (SR Legacy): Currants, european black, raw
  ('black currants', 'černý rybíz', 63::numeric, 1.4::numeric, 15.4::numeric, 0.41::numeric),
  -- FDC 171708 (SR Legacy): Cherries, tart, dried, sweetened (Includes foods for USDA's Food Distribution Program)
  ('dried cherries', 'sušené třešně', 333::numeric, 1.25::numeric, 80.4::numeric, 0.73::numeric),
  -- FDC 168448 (SR Legacy): Pumpkin, raw
  ('pumpkin', 'dýně', 26::numeric, 1::numeric, 6.5::numeric, 0.1::numeric),
  -- FDC 171255 (SR Legacy): Cream, fluid, half and half
  ('half and half', 'smetana a mléko (half-and-half)', 131::numeric, 3.13::numeric, 4.3::numeric, 11.5::numeric),
  -- FDC 173471 (SR Legacy): Vanilla extract
  ('vanilla extract', 'vanilkový extrakt', 288::numeric, 0.06::numeric, 12.6::numeric, 0.06::numeric),
  -- FDC 170051 (SR Legacy): Tomatoes, red, ripe, canned, packed in tomato juice
  ('canned tomatoes', 'konzervovaná rajčata', 16::numeric, 0.79::numeric, 3.47::numeric, 0.25::numeric),
  -- FDC 171477 (SR Legacy): Chicken, broilers or fryers, breast, meat only, cooked, roasted
  ('grilled chicken breast', 'grilovaná kuřecí prsa', 165::numeric, 31::numeric, 0::numeric, 3.57::numeric)
) AS v(name_en, name_cs, kcal, protein, carbs, fat)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Feta uz v tabulce byla, ale bez name_cs — a tim padem NEVIDITELNA, protoze
-- compute_nutrition_for_ingredients paruje vyhradne pres name_cs. ON CONFLICT
-- vys ji proto jen tise preskocil.
--
-- Radek navic nesel nutricne pouzit: ze spoonacular_enrichment mel
-- 125 kcal / 25 g bilkovin / 7,1 g sacharidu / 0 g TUKU. Feta s nulovym tukem
-- neexistuje. Prepisuje se na hodnoty z USDA (FDC 173420, Cheese, feta:
-- 265 kcal / 14,2 / 3,88 / 21,5) a doplnuje se cesky nazev.
--
-- Neni to mazani — radek zustava, meni se obsah, ktery byl prokazatelne spatny.
-- ---------------------------------------------------------------------------
UPDATE public.ingredients_nutrition
SET name_cs             = 'feta',
    kcal_per_100g       = 265,
    protein_g_per_100g  = 14.2,
    carbs_g_per_100g    = 3.88,
    fat_g_per_100g      = 21.5,
    source              = 'usda_fdc',
    updated_at          = now()
WHERE name_normalized = 'feta' AND name_cs IS NULL;


-- ---------------------------------------------------------------------------
-- Kontrola: vsechny nove suroviny musi byt dohledatelne presne tak, jak je
-- hleda compute_nutrition_for_ingredients (lower + unaccent nad name_cs).
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_chybi integer;
BEGIN
  SELECT count(*) INTO v_chybi
  FROM (VALUES ('feta'),('nizkotucny recky jogurt'),('slehacka'),('rozinky'),
               ('podmasli'),('susena rajcata'),('pomerancova kura'),
               ('cokoladove kousky'),('odtucnene mleko'),('kozi syr'),
               ('mandlove maslo'),('kokosova mouka'),('kokosove vlocky'),
               ('krupice'),('merunky'),('melasa'),('olivy'),('ostruziny'),
               ('pohankova mouka'),('pomeranc'),('rozmaryn'),('dynove pyre'),
               ('datle'),('fiky'),('hroznove vino'),('pistacie'),('kokos'),
               ('vodni meloun'),('redkvicky'),('ruzickova kapusta'),('sadlo'),
               ('zelatina'),('hovezi vyvar'),('susene mleko'),('granola'),
               ('chilli vlocky'),('seminka granatoveho jablka'),('cerny rybiz'),
               ('susene tresne'),('dyne'),('smetana a mleko (half-and-half)'),
               ('vanilkovy extrakt'),('konzervovana rajcata'),
               ('grilovana kureci prsa')) AS ocekavano(n)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.ingredients_nutrition i
    WHERE lower(extensions.unaccent(i.name_cs)) = ocekavano.n
  );

  IF v_chybi <> 0 THEN
    RAISE EXCEPTION 'Nedohledatelnych novych surovin: %, cekali jsme 0.', v_chybi;
  END IF;
END $$;
