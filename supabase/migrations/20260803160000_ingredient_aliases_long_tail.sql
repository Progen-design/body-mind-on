-- Aliasy surovin: dlouhy ocas nenamapovanych nazvu z aktivnich receptu.
--
-- 485 ruznych nazvu surovin nebylo ani v ingredients_nutrition, ani
-- v pantry_ingredients, a blokovalo 192 ze 426 aktivnich receptu. Skladac pak
-- na slot dostaval jednotky kandidatu misto zadanych 24-48 a tydenni jidelnicek
-- se opakoval.
--
-- KAZDY alias v teto migraci prosel overovaci branou
-- (scripts/verify-ingredient-aliases.mjs), ne uvahou. Pro alias X -> Y se
-- nad UPRAVENYM jsonb (bez zapisu do DB) prepocitala nutrice vsech zasazenych
-- aktivnich receptu a porovnala s ulozenymi kcal:
--   - kde je recept po prepisu kompletni: median odchylky <= 25 %, zadny > 60 %
--   - kde kompletni neni (blokuji ho dalsi nezname nazvy): soucet nesmi
--     prestrelit ulozene kcal o vic nez 60 % a prepis musi neco pridat
--
-- Navrzeno 185, PROSLO 162, NEPROSLO 23. Neprosle jsou i s cisly v
-- .cache/aliasy-neprosly.json a zamerne se NEZAPISUJI — mezi nimi napriklad
-- 'praskovy cukr' -> 'cukr' (prestrel 1180 %) nebo 'ziti' -> 'testoviny'
-- (1270 %), kde ulozene kcal receptu zjevne nesedi a alias by chybu zabetonoval.
--
-- Dalsich 9 nazvu se do navrhu vubec nedostalo kvuli tvrdemu zakazu: zdrojovy
-- nazev nese modifikator, ktery cil nema (susene, konzervovane, plnotucne,
-- grilovane, posirovane). Ty maji vlastni radek v ingredients_nutrition, nebo
-- cekaji na dalsi kolo.

INSERT INTO ingredient_aliases (alias_normalized, canonical_normalized, display_alias_cs)
SELECT v.a, v.c, v.a
FROM (VALUES
  ('6 roma tomatoes','rajce'),
  ('almond milk','mandlove mleko'),
  ('almonds','mandle'),
  ('apple','jablko'),
  ('applesauce','jablecna omacka'),
  ('asparagus spears','chrest'),
  ('avocado','avokado'),
  ('baby portabella mushrooms','houby'),
  ('baby spinach','spenat'),
  ('bacon','slanina'),
  ('balsamic vinegar','balsamico ocet'),
  ('balzamikovy ocet','balsamico ocet'),
  ('banana','banan'),
  ('basil leaves','bazalka'),
  ('bell pepper','paprika'),
  ('bile vejce','bilek'),
  ('bilky','bilek'),
  ('blueberries','boruvky'),
  ('bread crumbs','strouhanka'),
  ('broccoli','brokolice'),
  ('broccoli florets','brokolice'),
  ('brown sugar','hnedy cukr'),
  ('cajova lzicka jedle sody','jedla soda'),
  ('cajova lzicka prasku do peciva','prasek do peciva'),
  ('carrot','mrkev'),
  ('cedar','cheddar'),
  ('celery','celer'),
  ('cervena/zluta cibule','cibule'),
  ('cheddar cheese','cheddar'),
  ('cherry tomatoes','rajce'),
  ('chia seeds','chia seminka'),
  ('chili powder','chili prasek'),
  ('chives','pazitka'),
  ('cocoa','kakaovy prasek'),
  ('cocoa powder','kakaovy prasek'),
  ('coconut milk','kokosove mleko'),
  ('cooking oats','ovesne vlocky'),
  ('cream cheese','smetanovy syr'),
  ('creamy peanut butter','arasidove maslo'),
  ('crunchy peanut butter','arasidove maslo'),
  ('dill','kopr'),
  ('egg whites','bilek'),
  ('egg yolks','zloutky'),
  ('eggs','vejce'),
  ('extra-firm tofu','tofu'),
  ('farfalle pasta by barilla','testoviny'),
  ('fennel','fenykl'),
  ('filety aljasskeho lososa','losos'),
  ('filety lososa','losos'),
  ('freeze strawberries','jahody'),
  ('full baby spinach','spenat'),
  ('ginger root','zazvor'),
  ('greek yogurt','recky jogurt'),
  ('green onion','jarni cibulka'),
  ('green onions','jarni cibulka'),
  ('hladka mouka','mouka'),
  ('horcice dijon','dijonska horcice'),
  ('horcice dijonska','dijonska horcice'),
  ('irske ovesne vlocky','ovesne vlocky'),
  ('jablecne pyre','jablecna omacka'),
  ('juice of lemon','citronova stava'),
  ('kanadska slanina','slanina'),
  ('kapka olivoveho oleje','olivovy olej'),
  ('kesu orechy','kesu'),
  ('kousky manga','mango'),
  ('krystalovy cukr','cukr'),
  ('led','voda'),
  ('ledova voda','voda'),
  ('ledove kostky','voda'),
  ('leek','porek'),
  ('lemon','citron'),
  ('lettuce','salat (napr. ledovy)'),
  ('limety','limetka'),
  ('linguine','testoviny'),
  ('listy mangoldu','svycarsky mangold'),
  ('listy spenatu','spenat'),
  ('listy tymianu','tymian'),
  ('lneny olej','olej'),
  ('lump crab meat','krabi maso'),
  ('mandlove platky','mandle'),
  ('mayonnaise','majoneza'),
  ('mazola olej','olej'),
  ('milk','mleko'),
  ('mlady spenat','spenat'),
  ('mleta lnena seminka','lnena seminka'),
  ('mlete lnene seminko','lnena seminka'),
  ('mlety muskatovy orisek','muskatovy orisek'),
  ('natural yogurt','bily jogurt'),
  ('oats','ovesne vlocky'),
  ('old fashioned oats','ovesne vlocky'),
  ('old-fashioned oatmeal','ovesne vlocky'),
  ('olej z hroznovych jader','olej'),
  ('onion','cibule'),
  ('onion or','cibule'),
  ('orange juice','pomerancova stava'),
  ('ostry cedar','cheddar'),
  ('panko breadcrumbs','strouhanka'),
  ('parmazan','parmezan'),
  ('parmesan cheese','parmezan'),
  ('parsley leaves','petrzel'),
  ('pasta','testoviny'),
  ('pasta shells','testoviny'),
  ('pasteurized eggs','vejce'),
  ('pastry flour','mouka'),
  ('peach','broskev'),
  ('peaches','broskev'),
  ('peanut butter','arasidove maslo'),
  ('pecans','pekany'),
  ('pekanove orechy','pekany'),
  ('pine nuts','pinove orisky'),
  ('pineapple','ananas'),
  ('piniove orisky','pinove orisky'),
  ('platek limetky','limetka'),
  ('plocholista petrzel','petrzel'),
  ('por','porek'),
  ('potato','brambory'),
  ('protein powder','proteinovy prasek'),
  ('psenicna mouka na peceni','mouka'),
  ('pulka bananu','banan'),
  ('quick-cooking oats','ovesne vlocky'),
  ('rajcata cherry','rajce'),
  ('rajcata roma','rajce'),
  ('raspberries','maliny'),
  ('repkovy olej','olej'),
  ('rice vinegar','ryzovy ocet'),
  ('rolled oats','ovesne vlocky'),
  ('rozslehana vejce','vejce'),
  ('ruzicky brokolice','brokolice'),
  ('salmon','losos'),
  ('salmon fillets','losos'),
  ('salmon steaks','losos'),
  ('salotky','salotka'),
  ('scallions','jarni cibulka'),
  ('shrimp','krevety'),
  ('skoricovy prasek','skorice'),
  ('slunecnicovy olej','olej'),
  ('sockeye lososove filety','losos'),
  ('spinach','spenat'),
  ('spinach leaves','spenat'),
  ('staromodni ovesne vlocky','ovesne vlocky'),
  ('strawberries','jahody'),
  ('stvoly chrestu','chrest'),
  ('sweet potato','sladke brambory'),
  ('syr mozzarella','mozzarella'),
  ('testoviny motylky','testoviny'),
  ('tomato','rajce'),
  ('tomatoes','rajce'),
  ('treska','ryba (napr. treska)'),
  ('turkey cutlets','kruti prsa'),
  ('tvarohovy syr','smetanovy syr'),
  ('univerzalni mouka','mouka'),
  ('vajecny bilek','bilek'),
  ('vejce z volneho chovu','vejce'),
  ('velka cibule','cibule'),
  ('vlocky ovesne','ovesne vlocky'),
  ('volitelne vlasske orechy','vlasske orechy'),
  ('walnuts','vlasske orechy'),
  ('white wine','bile vino'),
  ('yogurt','bily jogurt'),
  ('zampiony crimini','houby'),
  ('zelena cibulka','jarni cibulka'),
  ('zrale avokado','avokado')
) AS v(a, c)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Kontrola: kazdy zapsany alias musi ukazovat na existujici surovinu, jinak
-- by mlcky nedelal nic (compute_nutrition_for_ingredients hleda podle name_cs).
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
