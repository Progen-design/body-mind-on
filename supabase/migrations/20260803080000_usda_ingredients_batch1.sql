-- Rozšíření slovní zásoby generátoru — dávka 1 (ČÁSTEČNÁ).
--
-- Nutrice se v compute_recipe_nutrition páruje VÝHRADNĚ přes name_cs, takže
-- řádek bez českého názvu je pro generátor neviditelný. Z 236 řádků má name_cs
-- jen 167 — to je skutečná slovní zásoba a tahle migrace ji rozšiřuje.
--
-- Hodnoty pocházejí z USDA FoodData Central, ke každému řádku je FDC ID a přesný
-- název položky. Vygenerováno scripts/fetch-usda-ingredients.mjs; žádné číslo
-- není z hlavy ani od modelu.
--
-- POZOR — TAHLE DÁVKA JE NEÚPLNÁ: 2 z 20 položek.
-- USDA DEMO_KEY má limit 10 dotazů (Retry-After ~7 h) a na zbytek nestačil.
-- Chybí mimo jiné cizrna, rostlinná mléka, mandle, kešu, tahini, tempeh a
-- hummus — tedy právě to, bez čeho nejde postavit vegan snídaně ani většina
-- vegan obědů. Dokud nedorazí zbytek, nemá smysl pouštět vegan seed dávku.
--
-- Doplnění: vlastní klíč zdarma na https://fdc.nal.usda.gov/api-key-signup.html
-- (limit 1 000 dotazů/h), pak:
--   FDC_API_KEY=xxx node scripts/fetch-usda-ingredients.mjs --sql

-- name_normalized je NOT NULL a drží tvar lower(unaccent(name_cs)) s pomlčkami
-- místo mezer (viz stávající řádky: „kuřecí prsa“ → „kureci-prsa“). Počítá se
-- tady, ne ručně, aby se nedal opsat špatně.
INSERT INTO public.ingredients_nutrition
  (name_en, name_cs, name_normalized, kcal_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g, source)
SELECT v.name_en, v.name_cs,
       replace(lower(extensions.unaccent(v.name_cs)), ' ', '-'),
       v.kcal, v.protein, v.carbs, v.fat, 'usda_fdc'
FROM (VALUES
  -- FDC 170556 (SR Legacy): Seeds, pumpkin and squash seed kernels, dried
  ('pumpkin seeds', 'dýňová semínka', 559::numeric, 30.2::numeric, 10.7::numeric, 49::numeric),
  -- FDC 170562 (SR Legacy): Seeds, sunflower seed kernels, dried
  ('sunflower seeds', 'slunečnicová semínka', 584::numeric, 20.8::numeric, 20::numeric, 51.5::numeric)
) AS v(name_en, name_cs, kcal, protein, carbs, fat)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Kontrola: obě suroviny musí být dohledatelné tak, jak je hledá
-- compute_recipe_nutrition (lower + unaccent nad name_cs).
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_nalezeno integer;
BEGIN
  SELECT count(*) INTO v_nalezeno
  FROM public.ingredients_nutrition
  WHERE lower(extensions.unaccent(name_cs)) IN ('dynova seminka', 'slunecnicova seminka');

  IF v_nalezeno <> 2 THEN
    RAISE EXCEPTION 'Novych surovin dohledatelnych je %, cekali jsme 2.', v_nalezeno;
  END IF;
END $$;
