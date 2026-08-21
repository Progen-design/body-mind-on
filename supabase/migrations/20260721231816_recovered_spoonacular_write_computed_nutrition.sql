WITH nut AS (
  SELECT r.id, c.kcal, c.protein_g, c.carbs_g, c.fat_g
  FROM recipes_catalog r
  CROSS JOIN LATERAL compute_recipe_nutrition(r.id) c
  WHERE r.id IN (31,32,33,36,37,41,58,70,71,77,146,168,183,184,242,264,284)
    AND c.complete
)
UPDATE recipes_catalog r SET
  kcal = ROUND(nut.kcal)::int,
  protein_g = nut.protein_g,
  carbs_g = nut.carbs_g,
  fat_g = nut.fat_g,
  nutrition_source = 'computed_from_ingredients',
  nutrition_computed_at = now()
FROM nut
WHERE nut.id = r.id;;
