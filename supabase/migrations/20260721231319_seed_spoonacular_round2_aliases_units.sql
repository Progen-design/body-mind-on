-- další aliasy pro near-miss varianty
INSERT INTO ingredient_aliases (alias_normalized, canonical_normalized, display_alias_cs)
SELECT v.a, v.c, v.a FROM (VALUES
  ('fiky','cerstve ovoce'),
  ('svestky','cerstve ovoce'),
  ('pistacie','orechy'),
  ('mandle','orechy'),
  ('kesu','orechy'),
  ('lisková jádra','orechy'),
  ('mlete kruti maso','kruti prsa'),
  ('kruti maso','kruti prsa'),
  ('mlete kruti','kruti prsa'),
  ('steaky z lososa','losos'),
  ('steak z lososa','losos'),
  ('filety z lososa','losos'),
  ('filet lososa','losos'),
  ('losos filet','losos'),
  ('velke zampiony','houby'),
  ('zampiony','houby'),
  ('hnedé zampiony','houby'),
  ('cervene fazole','fazole'),
  ('cerne fazole','fazole'),
  ('cernooke fazole','fazole'),
  ('cerne oci hrach','fazole'),
  ('bile fazole','fazole'),
  ('kokosovy cukr','cukr'),
  ('vanilkovy cukr','cukr'),
  ('trtinovy cukr','cukr'),
  ('mouckovy cukr','cukr'),
  ('tve oblibene makarony','testoviny'),
  ('spagety','testoviny'),
  ('penne','testoviny'),
  ('fusilli','testoviny'),
  ('pikantni hneda horcice','horcice'),
  ('smooth arasidove maslo','arasidove maslo'),
  ('krémové arašídové máslo','arasidove maslo'),
  ('cerstve mleta','pepr'),
  ('bazalka a oregano','bazalka'),
  ('cerstva bazalka','bazalka'),
  ('cerstvy tymian','tymian'),
  ('cerstva mata','mata'),
  ('mleta skorice','skorice'),
  ('cele','sul')
) AS v(a,c)
WHERE NOT EXISTS (SELECT 1 FROM ingredient_aliases ia WHERE ia.alias_normalized=v.a);

-- bezpečné objemové jednotky
INSERT INTO unit_conversions (unit, ingredient_match, grams)
SELECT v.unit, NULL, v.grams FROM (VALUES
  ('glass',240),('pint',473),('litres',1000),('litre',1000),('litr',1000),
  ('Leaves',1),('leaves',1),('head',400),('filet',150),('filets',150),('fillet',150)
) AS v(unit,grams)
WHERE NOT EXISTS (SELECT 1 FROM unit_conversions uc WHERE uc.unit=v.unit AND uc.ingredient_match IS NULL);

-- ks per-piece pro běžné porcovatelné suroviny
INSERT INTO unit_conversions (unit, ingredient_match, grams)
SELECT 'ks', v.ing, v.grams FROM (VALUES
  ('kuřecí prsa',150),('krůtí prsa',150),('losos',150),('mango',200),('brambory',150),
  ('lilek',250),('cuketa',200),('květák',600),('broskev',150),('kiwi',75),('pórek',90),
  ('chili papričky',15),('jalapeño',15),('šalotka',40),('limetka',67),('mrkev',60),
  ('celer',40),('fenykl',230),('batat',130),('sladké brambory',130)
) AS v(ing,grams)
WHERE NOT EXISTS (
  SELECT 1 FROM unit_conversions uc WHERE uc.unit='ks'
    AND lower(extensions.unaccent(uc.ingredient_match))=lower(extensions.unaccent(v.ing))
);;
