-- recipes_catalog: ready_in_minutes
--
-- complexSearch se volá s addRecipeInformation=true, takže readyInMinutes v odpovědi
-- máme a simplicity gate ho už čte (lib/spoonacular/catalogSimplicity.js). Katalog ho
-- ale zahazoval — bez sloupce nejde při výběru receptu do plánu filtrovat podle času
-- přípravy. Stojí to 0 bodů navíc, data už v odpovědi jsou.

alter table public.recipes_catalog
  add column if not exists ready_in_minutes integer;

comment on column public.recipes_catalog.ready_in_minutes is
  'Čas přípravy v minutách (Spoonacular readyInMinutes). NULL = neznámý — řádky importované před 2026-07-31 nejsou zpětně doplněné.';

-- Filtr "rychlé jídlo" běží vždy nad aktivním katalogem.
create index if not exists recipes_catalog_ready_in_minutes_idx
  on public.recipes_catalog (ready_in_minutes)
  where active = true;

-- Insert RPC má pevný výčet sloupců — bez tohoto by mapper psal ready_in_minutes do prázdna.
create or replace function public.insert_spoonacular_catalog_import_rows(p_rows jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  r jsonb;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_attempted integer := 0;
  v_row_count integer;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_object('inserted', 0, 'skipped_duplicate', 0, 'attempted', 0);
  END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) AS t(value) LOOP
    v_attempted := v_attempted + 1;
    INSERT INTO public.recipes_catalog (
      source, source_id, name_en, name_cs, servings, kcal, protein_g, carbs_g, fat_g,
      ingredients, instructions, image_url, spoonacular_url, diet_tags, meal_type,
      nutrition_source, active, ready_in_minutes
    ) VALUES (
      COALESCE(NULLIF(r ->> 'source', ''), 'spoonacular'),
      r ->> 'source_id', r ->> 'name_en', NULLIF(r ->> 'name_cs', ''),
      COALESCE((r ->> 'servings')::integer, 1), (r ->> 'kcal')::integer,
      NULLIF(r ->> 'protein_g', '')::numeric, NULLIF(r ->> 'carbs_g', '')::numeric,
      NULLIF(r ->> 'fat_g', '')::numeric, r -> 'ingredients', r -> 'instructions',
      NULLIF(r ->> 'image_url', ''), NULLIF(r ->> 'spoonacular_url', ''),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(r -> 'diet_tags')), '{}'::text[]),
      r ->> 'meal_type', COALESCE(NULLIF(r ->> 'nutrition_source', ''), 'spoonacular_api'),
      COALESCE((r ->> 'active')::boolean, false),
      NULLIF(r ->> 'ready_in_minutes', '')::integer
    )
    ON CONFLICT ON CONSTRAINT recipes_catalog_source_source_id_key DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count > 0 THEN v_inserted := v_inserted + 1; ELSE v_skipped := v_skipped + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('inserted', v_inserted, 'skipped_duplicate', v_skipped, 'attempted', v_attempted);
END;
$function$;
