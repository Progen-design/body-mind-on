-- Aliasy surovin, kolo 3: anglicke nazvy a znackove varianty z importu.
--
-- MERENI, KTERE K TOMU VEDLO. Po kolech 1 a 2 (297 aliasu) zbyva v aktivnich
-- receptech 297 nepokrytych nazvu surovin, ktere blokuji 162 ze 433 aktivnich
-- receptu. Z nich bylo 90 vyhodnoceno jako jednoznacny alias na surovinu, ktera
-- uz ve slovniku je — vetsinou anglicke nazvy ze Spoonacularu (olive oil,
-- garlic, flour) a znackove varianty (Chobani yogurt, Bel Gioioso mozzarella).
--
-- Vsech 90 proslo branou scripts/verify-ingredient-aliases.mjs, ktera pro kazdy
-- alias prepocita zasazene aktivni recepty pres compute_nutrition_for_ingredients
-- a porovna vysledek s ulozenymi kcal. PROSLO 80, NEPROSLO 10.
--
-- OPRAVA BRANY, KTERA U TOHOHLE KOLA VZNIKLA. Brana puvodne soudila alias podle
-- celkove chyby receptu. To shodilo "olive oil", "garlic", "butter" i "parsley"
-- se shodnou odchylkou 50,5 %, protoze vsechny ctyri mely jediny meritelny
-- recept — #651 alfredo omacku, kde ulozenych 501 kcal nesedi se 754 kcal ze
-- surovin. Cesnek za ten rozdil nemuze; prispiva do receptu jednotkami kalorii.
-- Brana proto nove meri PRISPEVEK aliasu do receptu a recepty, kde alias vazi
-- min nez 10 % ulozenych kcal, z hodnoceni vyrazuje jako nevypovidajici.
-- Po oprave prosly navic: garlic, parsley, kosher salt, soja omacka.
--
-- NEPROSLO 10 a zamerne se NEZAPISUJI:
--   banany                           -> banan                median odchylky 31.2 % > 25 %
--   bel gioioso mozzarella           -> mozzarella           median odchylky 39.6 % > 25 %
--   butter                           -> maslo                median odchylky 50.5 % > 25 %
--   cracked pepper                   -> pepr                 soucet prestrelil ulozene kcal 193 %
--   extra virgin olive oil           -> olivovy olej         median odchylky 39.6 % > 25 %
--   filet mignon steaks              -> libove hovezi maso   soucet prestrelil ulozene kcal 193 %
--   kureci prsa bez kuze a kosti     -> kureci prsa          soucet prestrelil ulozene kcal 171 %
--   olive oil                        -> olivovy olej         median odchylky 50.5 % > 25 %
--   olive oil extra virgin           -> olivovy olej         soucet prestrelil ulozene kcal 193 %
--   zlate rozinky                    -> rozinky              soucet prestrelil ulozene kcal 176 %
--
-- U "olive oil" a "butter" je jazykovy vyznam jisty, ale do alfreda #651
-- kalorie realne prispivaji, takze ten recept o nich vypovida — a nesedi.
-- Dokud nevime, jestli je spatne ulozena hodnota nebo nase cislo za olej,
-- alias nezapisujeme. Cisla jsou v .cache/aliasy-kolo3b-neprosly.json.

INSERT INTO ingredient_aliases (alias_normalized, canonical_normalized, display_alias_cs)
SELECT v.a, v.c, v.a
FROM (VALUES
  ('baking powder','prasek do peciva'),
  ('baking soda','jedla soda'),
  ('basil','bazalka'),
  ('bob''s mill steel cut oats','ovesne vlocky'),
  ('butternut squash','maslova dyne'),
  ('cayenne pepper','chili prasek'),
  ('cinnamon','skorice'),
  ('citronovy tymian','tymian'),
  ('cokoladove hoblinky','cokoladove kousky'),
  ('condensed milk','slazene kondenzovane mleko'),
  ('cranberry','brusinky'),
  ('creamed wildflower honey','med'),
  ('datle mejdool','datle'),
  ('feta cheese','feta'),
  ('figs','fiky'),
  ('fiky mission','fiky'),
  ('filety z halibuta','bila ryba'),
  ('flour','mouka'),
  ('freshly cracked pepper','pepr'),
  ('fruit','cerstve ovoce'),
  ('garlic','cesnek'),
  ('goat cheese','kozi syr'),
  ('grapes','hroznove vino'),
  ('grilovane kure','grilovana kureci prsa'),
  ('herbed butter','maslo'),
  ('himalajska sul','sul'),
  ('hnizda spenatovych fettuccine','testoviny'),
  ('honey','med'),
  ('hruba morska sul','sul'),
  ('chavrie goat cheese','kozi syr'),
  ('chilli flakes','chilli vlocky'),
  ('chobani yogurt','recky jogurt'),
  ('kokosove mleko plnotucne','kokosove mleko'),
  ('koriandrova seminka','mlety koriandr'),
  ('kosher salt','sul'),
  ('kozi syr chavrie','kozi syr'),
  ('lasagne bez vareni','testoviny'),
  ('lemon juice','citronova stava'),
  ('lzice smetany','smetana'),
  ('mahagonova ryze','ryze'),
  ('mexicka smes syra','syr'),
  ('nefiltrovany med','med'),
  ('non-fat milk','odtucnene mleko'),
  ('nonfat cottage cheese','cottage'),
  ('olivy plnene pimentem','olivy'),
  ('orange pepper','paprika (cervena)'),
  ('paliva chilli paprika','chili papricky'),
  ('parsley','petrzel'),
  ('pepper flakes','chilli vlocky'),
  ('pikantni marinara omacka','marinara omacka'),
  ('piknikova sunka','sunka'),
  ('pistachios','pistacie'),
  ('posirovany losos','losos'),
  ('prirodni jogurt (neslazeny)','bily jogurt'),
  ('proteinovy prasek premier protein','proteinovy prasek'),
  ('rainbow chard','svycarsky mangold'),
  ('rajcata z konzervy','konzervovana rajcata'),
  ('ramen','testoviny'),
  ('reconstituted sun-dried tomatoes','susena rajcata'),
  ('roast turkey','kruti prsa'),
  ('rybi filety','bila ryba'),
  ('salt','sul'),
  ('smetana ke slehani','slehacka'),
  ('soja omacka s nizkym obsahem sodiku','sojova omacka'),
  ('soy sauce','sojova omacka'),
  ('spring mix greens','smes salatu'),
  ('stava z citronu meyer','citronova stava'),
  ('sugar','cukr'),
  ('suseny tymian','tymian'),
  ('thajska bazalka','bazalka'),
  ('tvrdy syr','syr'),
  ('vanilkovy proteinovy prasek','proteinovy prasek'),
  ('vanilla almond granola','granola'),
  ('vanilla extract','vanilkovy extrakt'),
  ('vanilla sugar','cukr'),
  ('vinegar','ocet'),
  ('water','voda'),
  ('whip cream','slehacka'),
  ('worcestershire sauce','worcesterska omacka'),
  ('zlate maliny','maliny')
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
