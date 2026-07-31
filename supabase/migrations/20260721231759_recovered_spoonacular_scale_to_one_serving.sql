UPDATE recipes_catalog r SET
  ingredients_original = COALESCE(ingredients_original, ingredients),
  servings_original    = COALESCE(servings_original, servings),
  kcal_original        = COALESCE(kcal_original, kcal),
  ingredients = (
    SELECT jsonb_agg(
      CASE WHEN (elem->>'amount') ~ '^[0-9]+(\.[0-9]+)?$'
        THEN jsonb_set(elem, '{amount}', to_jsonb(round((elem->>'amount')::numeric / r.servings, 3)))
        ELSE elem END
    )
    FROM jsonb_array_elements(r.ingredients) elem
  ),
  servings = 1
WHERE r.id IN (31,32,41,58,70,71,77,146,168,183,184,264,284)
  AND r.servings > 1;;
