-- USDA FoodData Central — batch 2: slovník pro vegan sloty.
--
-- Vygenerováno scripts/fetch-usda-ingredients.mjs (dataType=Foundation,SR Legacy).
-- Každý řádek nese FDC ID a přesný název položky, ze které hodnota pochází.
-- Žádná hodnota není odhadnutá ani od modelu. Kdo bude čísla ověřovat,
-- najde zdroj podle FDC ID na https://fdc.nal.usda.gov/food-details/<id>.
--
-- Proč tenhle batch: compute_recipe_nutrition páruje suroviny přes name_cs,
-- takže bez cizrny, rostlinných mlék, tahini a tempehu neprojde vegan
-- snídaně ani většina vegan obědů gate na kompletní nutrici.
--
-- POZOR u 'sójové maso': dotaz "soy protein textured" vrací z USDA izolát
-- (88 g bílkovin/100 g), což je jiná surovina. Použit je defatted soy flour
-- (FDC 1104705), ze kterého se TVP extruduje a jehož makra sedí.

INSERT INTO public.ingredients_nutrition
  (name_en, name_cs, name_normalized, kcal_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g, source)
SELECT v.name_en, v.name_cs,
       replace(lower(extensions.unaccent(v.name_cs)), ' ', '-'),
       v.kcal, v.protein, v.carbs, v.fat, 'usda_fdc'
FROM (VALUES
  -- FDC 2644288 (Foundation): Chickpeas (garbanzo beans, bengal gram), canned, sodium added, drained and rinsed
  ('chickpeas', 'cizrna', 137::numeric, 7.02::numeric, 20.3::numeric, 3.1::numeric),
  -- FDC 1999630 (Foundation): Soy milk, unsweetened, plain, shelf stable
  ('soy milk', 'sójové mléko', 38.5::numeric, 3.55::numeric, 1.29::numeric, 2.12::numeric),
  -- FDC 2257045 (Foundation): Almond milk, unsweetened, plain, refrigerated
  ('almond milk', 'mandlové mléko', 19.3::numeric, 0.656::numeric, 0.671::numeric, 1.56::numeric),
  -- FDC 2257046 (Foundation): Oat milk, unsweetened, plain, refrigerated
  ('oat milk', 'ovesné mléko', 48.3::numeric, 0.797::numeric, 5.1::numeric, 2.75::numeric),
  -- FDC 175227 (SR Legacy): SILK Plain soy yogurt
  ('plant yogurt', 'rostlinný jogurt', 66::numeric, 2.64::numeric, 9.69::numeric, 1.76::numeric),
  -- FDC 2346393 (Foundation): Nuts, almonds, whole, raw
  ('almonds', 'mandle', 626::numeric, 21.5::numeric, 20::numeric, 51.1::numeric),
  -- FDC 2515374 (Foundation): Nuts, cashew nuts, raw
  ('cashews', 'kešu', 565::numeric, 17.4::numeric, 36.3::numeric, 38.9::numeric),
  -- FDC 2346394 (Foundation): Nuts, walnuts, English, halves, raw
  ('walnuts', 'vlašské ořechy', 730::numeric, 14.6::numeric, 10.9::numeric, 69.7::numeric),
  -- FDC 170556 (SR Legacy): Seeds, pumpkin and squash seed kernels, dried
  ('pumpkin seeds', 'dýňová semínka', 559::numeric, 30.2::numeric, 10.7::numeric, 49::numeric),
  -- FDC 170562 (SR Legacy): Seeds, sunflower seed kernels, dried
  ('sunflower seeds', 'slunečnicová semínka', 584::numeric, 20.8::numeric, 20::numeric, 51.5::numeric),
  -- FDC 2262075 (Foundation): Flaxseed, ground
  ('flaxseed', 'lněná semínka', 545::numeric, 18::numeric, 34.4::numeric, 37.3::numeric),
  -- FDC 168604 (SR Legacy): Seeds, sesame butter, tahini, type of kernels unspecified
  ('tahini', 'tahini', 592::numeric, 17.4::numeric, 21.5::numeric, 53::numeric),
  -- FDC 172467 (SR Legacy): Tempeh, cooked
  ('tempeh', 'tempeh', 195::numeric, 19.9::numeric, 7.62::numeric, 11.4::numeric),
  -- FDC 168147 (SR Legacy): Vital wheat gluten
  ('seitan', 'seitan', 370::numeric, 75.2::numeric, 13.8::numeric, 1.85::numeric),
  -- FDC 168411 (SR Legacy): Edamame, frozen, prepared
  ('edamame', 'edamame', 121::numeric, 11.9::numeric, 8.91::numeric, 5.2::numeric),
  -- FDC 174289 (SR Legacy): Hummus, commercial
  ('hummus', 'hummus', 237::numeric, 7.78::numeric, 15::numeric, 17.8::numeric),
  -- FDC 170287 (SR Legacy): Bulgur, cooked
  ('bulgur', 'bulgur', 83::numeric, 3.08::numeric, 18.6::numeric, 0.24::numeric),
  -- FDC 170686 (SR Legacy): Buckwheat groats, roasted, cooked
  ('buckwheat', 'pohanka', 92::numeric, 3.38::numeric, 19.9::numeric, 0.62::numeric),
  -- FDC 168871 (SR Legacy): Millet, cooked
  ('millet', 'jáhly', 119::numeric, 3.51::numeric, 23.7::numeric, 1::numeric),
  -- FDC 1104705 (Foundation): Flour, soy, defatted
  ('textured soy protein', 'sójové maso', 366::numeric, 51.1::numeric, 32.9::numeric, 3.33::numeric)
) AS v(name_en, name_cs, kcal, protein, carbs, fat)
ON CONFLICT (name_normalized) DO NOTHING;
