INSERT INTO unit_conversions (unit, ingredient_match, grams)
SELECT '', v.ing, v.grams FROM (VALUES
  ('cibule',110),('paprika',150),('rajče',120),('mrkev',60),
  ('kuřecí prsa',150),('krůtí prsa',150),('losos',150),('avokádo',150),
  ('mango',200),('brambory',150),('květák',600),('lilek',250),('cuketa',200),
  ('šalotka',40),('chili papričky',15),('jalapeño',15),('pórek',90),
  ('broskev',150),('kiwi',75),('limetka',67)
) AS v(ing,grams)
WHERE NOT EXISTS (
  SELECT 1 FROM unit_conversions uc WHERE uc.unit=''
    AND lower(extensions.unaccent(uc.ingredient_match))=lower(extensions.unaccent(v.ing))
);;
