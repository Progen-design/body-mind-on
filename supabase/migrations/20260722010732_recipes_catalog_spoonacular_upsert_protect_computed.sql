-- Spoonacular catalog import upsert: preserve engine-computed nutrition over API estimates.
CREATE OR REPLACE FUNCTION public.upsert_spoonacular_catalog_import_rows(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_was_insert boolean;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_object('inserted', 0, 'updated', 0);
  END IF;

  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) AS t(value)
  LOOP
    INSERT INTO public.recipes_catalog (
      source,
      source_id,
      name_en,
      name_cs,
      servings,
      kcal,
      protein_g,
      carbs_g,
      fat_g,
      ingredients,
      instructions,
      image_url,
      spoonacular_url,
      diet_tags,
      meal_type,
      nutrition_source,
      active
    ) VALUES (
      COALESCE(NULLIF(r ->> 'source', ''), 'spoonacular'),
      r ->> 'source_id',
      r ->> 'name_en',
      NULLIF(r ->> 'name_cs', ''),
      COALESCE((r ->> 'servings')::integer, 1),
      (r ->> 'kcal')::integer,
      NULLIF(r ->> 'protein_g', '')::numeric,
      NULLIF(r ->> 'carbs_g', '')::numeric,
      NULLIF(r ->> 'fat_g', '')::numeric,
      r -> 'ingredients',
      r -> 'instructions',
      NULLIF(r ->> 'image_url', ''),
      NULLIF(r ->> 'spoonacular_url', ''),
      COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(r -> 'diet_tags')),
        '{}'::text[]
      ),
      r ->> 'meal_type',
      COALESCE(NULLIF(r ->> 'nutrition_source', ''), 'spoonacular_api'),
      COALESCE((r ->> 'active')::boolean, false)
    )
    ON CONFLICT ON CONSTRAINT recipes_catalog_source_source_id_key DO UPDATE SET
      name_en = EXCLUDED.name_en,
      name_cs = CASE
        WHEN recipes_catalog.name_cs IS NOT NULL AND btrim(recipes_catalog.name_cs) <> ''
          THEN recipes_catalog.name_cs
        ELSE EXCLUDED.name_cs
      END,
      servings = CASE
        WHEN recipes_catalog.nutrition_source = 'computed_from_ingredients'
          THEN recipes_catalog.servings
        ELSE EXCLUDED.servings
      END,
      kcal = CASE
        WHEN recipes_catalog.nutrition_source = 'computed_from_ingredients'
          THEN recipes_catalog.kcal
        ELSE EXCLUDED.kcal
      END,
      protein_g = CASE
        WHEN recipes_catalog.nutrition_source = 'computed_from_ingredients'
          THEN recipes_catalog.protein_g
        ELSE EXCLUDED.protein_g
      END,
      carbs_g = CASE
        WHEN recipes_catalog.nutrition_source = 'computed_from_ingredients'
          THEN recipes_catalog.carbs_g
        ELSE EXCLUDED.carbs_g
      END,
      fat_g = CASE
        WHEN recipes_catalog.nutrition_source = 'computed_from_ingredients'
          THEN recipes_catalog.fat_g
        ELSE EXCLUDED.fat_g
      END,
      ingredients = CASE
        WHEN recipes_catalog.nutrition_source = 'computed_from_ingredients'
          THEN recipes_catalog.ingredients
        ELSE EXCLUDED.ingredients
      END,
      nutrition_source = CASE
        WHEN recipes_catalog.nutrition_source = 'computed_from_ingredients'
          THEN recipes_catalog.nutrition_source
        ELSE EXCLUDED.nutrition_source
      END,
      instructions = EXCLUDED.instructions,
      image_url = EXCLUDED.image_url,
      spoonacular_url = EXCLUDED.spoonacular_url,
      diet_tags = EXCLUDED.diet_tags,
      meal_type = EXCLUDED.meal_type,
      active = CASE
        WHEN recipes_catalog.name_cs IS NOT NULL AND btrim(recipes_catalog.name_cs) <> ''
          THEN recipes_catalog.active
        ELSE EXCLUDED.active
      END
    RETURNING (xmax = 0) INTO v_was_insert;

    IF v_was_insert THEN
      v_inserted := v_inserted + 1;
    ELSE
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('inserted', v_inserted, 'updated', v_updated);
END;
$$;

COMMENT ON FUNCTION public.upsert_spoonacular_catalog_import_rows(jsonb) IS
  'Bulk upsert from Spoonacular import. Preserves computed_from_ingredients nutrition; keeps existing name_cs/active when set.';
