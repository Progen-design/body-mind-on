-- Krok 3: sweeper — druhá šance receptům, které dřív neprošly.
--
-- Trigger vystřelí jen když se řádek zapíše. Jenže vstupy pravidla se mění i bez
-- zápisu do recipes_catalog: doplní se unit_conversions, přibude položka do
-- ingredients_nutrition, rozšíří se pantry seznam (mění count_main_ingredients),
-- doplní se čas. Recept odmítnutý včera tak může dnes vyhovovat, ale nikdo ho
-- znovu neposoudí. Od toho je tenhle sweep.
--
-- Pravidlo je shodné s triggerem enforce_recipe_catalog_rules. Sweeper JEN
-- aktivuje; deaktivaci nedělá, aby jeden špatný běh nesundal katalog.

CREATE OR REPLACE FUNCTION public.sweep_recipe_catalog_activation()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_aktivovano integer;
  v_aktivnich  integer;
BEGIN
  WITH zmeneno AS (
    UPDATE public.recipes_catalog r
    SET active = true
    WHERE r.active = false
      AND r.kcal > 0
      AND r.protein_g IS NOT NULL AND r.carbs_g IS NOT NULL AND r.fat_g IS NOT NULL
      AND public.count_main_ingredients(r.ingredients) <= 10
      AND r.name_cs IS NOT NULL AND btrim(r.name_cs) <> ''
      AND (
        'high_fiber' = ANY(r.diet_tags)
        OR (
          round(r.kcal) > 0
          AND round(4*r.protein_g + 4*r.carbs_g + 9*r.fat_g) > 0
          AND round(abs((round(r.kcal)::numeric - round(4*r.protein_g + 4*r.carbs_g + 9*r.fat_g)::numeric)
                        / round(r.kcal)::numeric) * 100, 1) <= 10.0
        )
      )
      -- ČAS zatím nevynucován — shodně s triggerem, viz 20260801081000.
    RETURNING r.id
  )
  SELECT count(*) INTO v_aktivovano FROM zmeneno;

  SELECT count(*) INTO v_aktivnich FROM public.recipes_catalog WHERE active;

  RETURN jsonb_build_object(
    'activated', v_aktivovano,
    'active_total', v_aktivnich,
    'swept_at', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.sweep_recipe_catalog_activation() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.sweep_recipe_catalog_activation() IS
  'Denni sweep: aktivuje recepty, ktere uz vyhovuji pravidlum (zmenily se unit_conversions, ingredients_nutrition, pantry seznam nebo se doplnil cas). Jen aktivuje, nikdy nedeaktivuje. Stejne pravidlo jako enforce_recipe_catalog_rules.';

-- ---------------------------------------------------------------------------
-- Uvodni sweep hned pri nasazeni — jinak by se katalog dorovnal az rannim cronem.
-- Ocekavano: 60 aktivovanych, celkem 463 aktivnich (404 − 1 na Atwaterovi + 60).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_vysledek jsonb;
  v_aktivnich integer;
BEGIN
  v_vysledek := public.sweep_recipe_catalog_activation();
  RAISE NOTICE 'Uvodni sweep: %', v_vysledek;

  SELECT count(*) INTO v_aktivnich FROM public.recipes_catalog WHERE active;
  IF v_aktivnich <> 463 THEN
    RAISE EXCEPTION 'Aktivnich receptu je %, cekali jsme 463.', v_aktivnich;
  END IF;
END $$;
