INSERT INTO unit_conversions (unit, ingredient_match, grams)
SELECT v.unit, NULL, v.grams
FROM (VALUES
  ('teaspoon',5),('teaspoons',5),('tsp',5),('t',5),
  ('tablespoon',15),('tablespoons',15),('Tablespoons',15),('tbsp',15),('T',15),('Tbsp',15),('Tbs',15),
  ('clove',3),('cloves',3),
  ('gr',1),
  ('pinch',0.5),
  ('can',400),('cans',400),('small can',200),
  ('handful',30),('handfuls',30),
  ('bunch',40),('bunches',40),('svazek',40),
  ('stalk',40),('stalks',40),('stonka',40),('stonky',40),
  ('package',250),('packet',10),('bag',250),('box',250),('container',250),
  ('sprig',2),('sprigs',2),('vetvicka',2),
  ('slices',20)
) AS v(unit, grams)
WHERE NOT EXISTS (
  SELECT 1 FROM unit_conversions uc WHERE uc.unit = v.unit AND uc.ingredient_match IS NULL
);;
