-- Spoonacular import: observability, query rotation, shared pantry list, insert-only writes.

-- ---------------------------------------------------------------------------
-- 1. Import run log (one row per API call / query execution)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.spoonacular_import_runs (
  id                bigserial PRIMARY KEY,
  run_id            uuid        NOT NULL,
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  meal_type         text        NOT NULL,
  query_signature   text        NOT NULL,
  offset_used       int         NOT NULL,
  api_status        int,
  api_results       int         NOT NULL DEFAULT 0,
  candidates        int         NOT NULL DEFAULT 0,
  inserted          int         NOT NULL DEFAULT 0,
  skipped_duplicate int         NOT NULL DEFAULT 0,
  skipped_filter    int         NOT NULL DEFAULT 0,
  quota_left        numeric,
  quota_used        numeric,
  duration_ms       int,
  error             text
);

CREATE INDEX IF NOT EXISTS spoonacular_import_runs_started_at_idx
  ON public.spoonacular_import_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS spoonacular_import_runs_meal_started_idx
  ON public.spoonacular_import_runs (meal_type, started_at DESC);

ALTER TABLE public.spoonacular_import_runs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Query rotation (replaces linear spoonacular_import_cursor reset loop)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.spoonacular_import_queries (
  id              bigserial PRIMARY KEY,
  meal_type       text    NOT NULL,
  params          jsonb   NOT NULL,
  query_signature text    NOT NULL,
  next_offset     int     NOT NULL DEFAULT 0 CHECK (next_offset >= 0),
  total_results   int,
  exhausted_at    timestamptz,
  empty_streak    int     NOT NULL DEFAULT 0 CHECK (empty_streak >= 0),
  last_run_at     timestamptz,
  priority        int     NOT NULL DEFAULT 100
);

CREATE UNIQUE INDEX IF NOT EXISTS spoonacular_import_queries_signature_key
  ON public.spoonacular_import_queries (query_signature);

CREATE INDEX IF NOT EXISTS spoonacular_import_queries_pick_idx
  ON public.spoonacular_import_queries (meal_type, exhausted_at, priority, last_run_at);

ALTER TABLE public.spoonacular_import_queries ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. Shared pantry / seasoning list (import + DB count_main_ingredients)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pantry_ingredients (
  name_normalized text PRIMARY KEY,
  category        text NOT NULL DEFAULT 'seasoning'
);

ALTER TABLE public.pantry_ingredients ENABLE ROW LEVEL SECURITY;

INSERT INTO public.pantry_ingredients (name_normalized, category) VALUES
  ('sul', 'seasoning'),
  ('pepr', 'seasoning'),
  ('olej', 'seasoning'),
  ('olivovy olej', 'seasoning'),
  ('voda', 'seasoning'),
  ('cukr', 'seasoning'),
  ('mlety pepr', 'seasoning'),
  ('morska sul', 'seasoning'),
  ('bazalka', 'seasoning'),
  ('oregano', 'seasoning'),
  ('tymian', 'seasoning'),
  ('kmin', 'seasoning'),
  ('skorice', 'seasoning'),
  ('kurkuma', 'seasoning'),
  ('koriandr', 'seasoning'),
  ('petrzel', 'seasoning'),
  ('cesnek', 'seasoning'),
  ('jedla soda', 'seasoning'),
  ('prasek do peciva', 'seasoning'),
  ('vanilkovy extrakt', 'seasoning'),
  ('ocet', 'seasoning'),
  ('salt', 'seasoning'),
  ('pepper', 'seasoning'),
  ('black pepper', 'seasoning'),
  ('ground pepper', 'seasoning'),
  ('oil', 'seasoning'),
  ('olive oil', 'seasoning'),
  ('water', 'seasoning'),
  ('sugar', 'seasoning'),
  ('sea salt', 'seasoning'),
  ('basil', 'seasoning'),
  ('thyme', 'seasoning'),
  ('cumin', 'seasoning'),
  ('cinnamon', 'seasoning'),
  ('turmeric', 'seasoning'),
  ('coriander', 'seasoning'),
  ('parsley', 'seasoning'),
  ('garlic', 'seasoning'),
  ('baking soda', 'seasoning'),
  ('baking powder', 'seasoning'),
  ('vanilla extract', 'seasoning'),
  ('vinegar', 'seasoning'),
  ('butter', 'seasoning'),
  ('flour', 'seasoning'),
  ('honey', 'seasoning'),
  ('soy sauce', 'seasoning'),
  ('lemon juice', 'seasoning'),
  ('worcestershire sauce', 'seasoning'),
  ('mustard', 'seasoning'),
  ('rosemary', 'seasoning'),
  ('sage', 'seasoning'),
  ('chili', 'seasoning'),
  ('chilli', 'seasoning'),
  ('paprika', 'seasoning'),
  ('nutmeg', 'seasoning'),
  ('ground nutmeg', 'seasoning')
ON CONFLICT (name_normalized) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_pantry_ingredient(p_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  n text;
  p record;
BEGIN
  n := extensions.unaccent(lower(trim(p_name)));
  IF n = '' THEN
    RETURN false;
  END IF;

  FOR p IN SELECT name_normalized FROM public.pantry_ingredients
  LOOP
    IF n = p.name_normalized THEN
      RETURN true;
    END IF;
    -- Multi-word pantry names only (e.g. "olive oil", "black pepper")
    IF position(' ' in p.name_normalized) > 0 AND n ~ (
      '(^|[[:space:]])' || regexp_replace(p.name_normalized, '([.^$|?*+(){}\[\]\\-])', '\\\1', 'g')
      || '([[:space:]]|$)'
    ) THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.count_main_ingredients(p_ingredients jsonb)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  elem jsonb;
  name_raw text;
  cnt integer := 0;
BEGIN
  IF p_ingredients IS NULL OR jsonb_typeof(p_ingredients) <> 'array' THEN
    RETURN 0;
  END IF;

  FOR elem IN SELECT value FROM jsonb_array_elements(p_ingredients) AS t(value)
  LOOP
    name_raw := COALESCE(
      NULLIF(elem ->> 'name_en', ''),
      NULLIF(elem ->> 'name', ''),
      NULLIF(elem ->> 'nameClean', ''),
      ''
    );
    IF name_raw = '' THEN
      CONTINUE;
    END IF;
    IF NOT public.is_pantry_ingredient(name_raw) THEN
      cnt := cnt + 1;
    END IF;
  END LOOP;

  RETURN cnt;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Insert-only import (never overwrite computed_from_ingredients)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.insert_spoonacular_catalog_import_rows(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) AS t(value)
  LOOP
    v_attempted := v_attempted + 1;
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
    ON CONFLICT ON CONSTRAINT recipes_catalog_source_source_id_key DO NOTHING;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count > 0 THEN
      v_inserted := v_inserted + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'skipped_duplicate', v_skipped,
    'attempted', v_attempted
  );
END;
$$;

COMMENT ON FUNCTION public.insert_spoonacular_catalog_import_rows(jsonb) IS
  'Bulk insert from Spoonacular import. ON CONFLICT DO NOTHING — never overwrites existing rows.';

-- Keep legacy RPC name delegating to insert-only (callers may still use old name)
CREATE OR REPLACE FUNCTION public.upsert_spoonacular_catalog_import_rows(p_rows jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.insert_spoonacular_catalog_import_rows(p_rows)
    || jsonb_build_object('updated', 0);
$$;

-- ---------------------------------------------------------------------------
-- 5. Seed query rotation combinations (meal_type × cuisine × diet × ready × sort)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_meal text;
  v_cuisine text;
  v_diet text;
  v_ready int;
  v_sort text;
  v_params jsonb;
  v_sig text;
BEGIN
  FOREACH v_meal IN ARRAY ARRAY[
    'breakfast', 'main course', 'salad', 'soup', 'snack', 'dessert'
  ] LOOP
    FOREACH v_cuisine IN ARRAY ARRAY[
      'italian', 'mexican', 'mediterranean', 'chinese', 'american', 'indian', 'greek', 'french'
    ] LOOP
      FOREACH v_diet IN ARRAY ARRAY['', 'vegetarian', 'vegan', 'gluten free'] LOOP
        FOREACH v_ready IN ARRAY ARRAY[20, 30, 45] LOOP
          FOREACH v_sort IN ARRAY ARRAY['popularity', 'healthiness', 'random'] LOOP
            v_params := jsonb_strip_nulls(jsonb_build_object(
              'type', v_meal,
              'cuisine', v_cuisine,
              'diet', NULLIF(v_diet, ''),
              'maxReadyTime', v_ready,
              'sort', v_sort,
              'sortDirection', CASE WHEN v_sort = 'healthiness' THEN 'desc' ELSE NULL END,
              'minProtein', 5,
              'maxSugar', 30
            ));
            v_sig := v_meal || '|cu=' || v_cuisine || '|di=' || COALESCE(v_diet, '-') || '|rt='
              || v_ready::text || '|so=' || v_sort;
            INSERT INTO public.spoonacular_import_queries (
              meal_type, params, query_signature, priority
            ) VALUES (
              v_meal, v_params, v_sig, 100
            )
            ON CONFLICT (query_signature) DO NOTHING;
          END LOOP;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 6. system_health_alerts — import pipeline checks
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.system_health_alerts AS
SELECT * FROM (
  SELECT
    'critical'::text AS severity,
    'uzivatel_bez_planu'::text AS kod,
    'Uzivatel s aktivnim clenstvim nema plan'::text AS popis,
    string_agg(u.email::text, ', '::text) AS detail,
    count(*) AS pocet
  FROM auth.users u
  JOIN memberships m ON m.user_id = u.id
  WHERE (m.status = ANY (ARRAY['active'::text, 'trial'::text]))
    AND NOT (EXISTS (
      SELECT 1 FROM ai_generated_plans p
      WHERE p.user_id = u.id AND p.is_active
    ))
  HAVING count(*) > 0
  UNION ALL
  SELECT
    'critical'::text,
    'generovani_selhalo'::text,
    'Generovani planu selhalo za poslednich 24 h'::text,
    count(*)::text || 'x'::text,
    count(*)
  FROM product_events
  WHERE event_name = 'plan_generation_failed'::text
    AND created_at > (now() - interval '24 hours')
  HAVING count(*) > 0
  UNION ALL
  SELECT
    'critical'::text,
    'registrace_selhava'::text,
    'Opakovana registrace stejneho e-mailu BEZ vzniku uctu (flow spada)'::text,
    string_agg(DISTINCT s.email, ', '::text),
    count(DISTINCT s.email)
  FROM (
    SELECT r.email
    FROM registrations r
    LEFT JOIN auth.users u ON lower(u.email::text) = lower(r.email)
    WHERE u.id IS NULL
    GROUP BY r.email
    HAVING count(*) >= 2
  ) s
  HAVING count(*) > 0
  UNION ALL
  SELECT
    'critical'::text,
    'uvizl_na_paywallu'::text,
    'Clenstvi ve stavu pending_payment - mel dostat trial'::text,
    string_agg(u.email::text, ', '::text),
    count(*)
  FROM memberships m
  JOIN auth.users u ON u.id = m.user_id
  WHERE m.status = 'pending_payment'::text
  HAVING count(*) > 0
  UNION ALL
  SELECT
    'warning'::text,
    'registrations_viselec'::text,
    'Registrace ulozena, ucet nevznikl'::text,
    string_agg(DISTINCT r.email, ', '::text),
    count(DISTINCT r.email)
  FROM registrations r
  LEFT JOIN auth.users u ON lower(u.email::text) = lower(r.email)
  WHERE u.id IS NULL
  HAVING count(*) > 0
  UNION ALL
  SELECT
    'warning'::text,
    'necela_kusova_surovina'::text,
    'V aktivnim planu je necely pocet kusovych surovin'::text,
    'napr. 3,45 vejce'::text,
    count(*)
  FROM ai_generated_plans p,
  LATERAL jsonb_array_elements(p.structured_plan_json -> 'days') d(value),
  LATERAL jsonb_array_elements(d.value -> 'meals') m(value),
  LATERAL jsonb_array_elements((m.value -> 'recipe') -> 'ingredients') i(value)
  WHERE p.is_active
    AND (i.value ->> 'unit') = ANY (ARRAY['ks', 'plátky', 'plátek', 'konzerva', 'stroužek'])
    AND ((i.value ->> 'amount')::numeric) <> (round(((i.value ->> 'amount')::numeric) * 2) / 2)
  HAVING count(*) > 0
  UNION ALL
  SELECT
    'warning'::text,
    'nazev_nesedi_s_receptem'::text,
    'display_name jidla neodpovida catalog receptu'::text,
    ''::text,
    count(*)
  FROM ai_generated_plans p,
  LATERAL jsonb_array_elements(p.structured_plan_json -> 'days') d(value),
  LATERAL jsonb_array_elements(d.value -> 'meals') m(value)
  JOIN recipes_catalog rc ON rc.id = ((m.value ->> 'catalog_id')::bigint)
  WHERE p.is_active
    AND (m.value ->> 'display_name') IS DISTINCT FROM rc.name_cs
  HAVING count(*) > 0
  UNION ALL
  SELECT
    'warning'::text,
    'apple_health_nesynchronizuje'::text,
    'Apple Health nesynchronizoval vic nez 48 h'::text,
    string_agg(u.email::text, ', '::text),
    count(*)
  FROM apple_health_connections c
  JOIN auth.users u ON u.id = c.user_id
  WHERE c.status = 'active'::text
    AND (c.last_sync_at IS NULL OR c.last_sync_at < (now() - interval '48 hours'))
  HAVING count(*) > 0
  UNION ALL
  SELECT
    'warning'::text,
    'recept_mimo_gate'::text,
    'Recept ma kcal mimo toleranci vuci makrum'::text,
    string_agg(recipes_catalog.name_cs, ', '::text),
    count(*)
  FROM recipes_catalog
  WHERE recipes_catalog.active
    AND (abs(recipes_catalog.kcal::numeric - (recipes_catalog.protein_g * 4 + recipes_catalog.carbs_g * 4 + recipes_catalog.fat_g * 9))
      / NULLIF(recipes_catalog.kcal, 0)::numeric) > 0.20
  HAVING count(*) > 0
  UNION ALL
  SELECT
    'warning'::text,
    'calorie_target_mismatch'::text,
    'Aktivni plan ma jiny kaloricky cil nez body_metrics'::text,
    string_agg(p.email::text, ', '::text),
    count(*)
  FROM ai_generated_plans p
  JOIN LATERAL (
    SELECT calories_target
    FROM body_metrics bm
    WHERE bm.user_id = p.user_id
    ORDER BY bm.created_at DESC
    LIMIT 1
  ) latest ON true
  WHERE p.is_active = true
    AND p.daily_calories IS NOT NULL
    AND latest.calories_target IS NOT NULL
    AND p.daily_calories <> latest.calories_target
  HAVING count(*) > 0
  UNION ALL
  SELECT
    'info'::text,
    'nenormalizovana_surovina'::text,
    'Surovina v aktivnim planu nema kanonicky nazev'::text,
    string_agg(DISTINCT m.raw_name, ', ' ORDER BY m.raw_name),
    count(DISTINCT m.raw_name)
  FROM ingredient_normalization_misses m
  JOIN ai_generated_plans p ON p.id = m.plan_id AND p.is_active
  WHERE m.seen_at > (now() - interval '7 days')
  HAVING count(DISTINCT m.raw_name) > 0
  UNION ALL
  SELECT
    'critical'::text,
    'import_zadny_novy_recept'::text,
    'Zadny novy recept v katalogu 2+ dny'::text,
    to_char(max(rc.created_at), 'YYYY-MM-DD HH24:MI') AS detail,
    1
  FROM recipes_catalog rc
  HAVING max(rc.created_at) < (now() - interval '2 days')
  UNION ALL
  SELECT
    'critical'::text,
    'import_beh_chyba'::text,
    'Spoonacular import selhal (poslednich 24 h)'::text,
    string_agg(DISTINCT left(r.error, 120), '; '),
    count(*)
  FROM spoonacular_import_runs r
  WHERE r.started_at > (now() - interval '24 hours')
    AND (r.error IS NOT NULL OR r.api_status >= 400)
  HAVING count(*) > 0
  UNION ALL
  SELECT
    'warning'::text,
    'import_nizka_kvota'::text,
    'Spoonacular quota_left pod 20'::text,
    min(r.quota_left)::text,
    1
  FROM spoonacular_import_runs r
  WHERE r.started_at > (now() - interval '24 hours')
    AND r.quota_left IS NOT NULL
    AND r.quota_left < 20
  HAVING count(*) > 0
  UNION ALL
  SELECT
    'critical'::text,
    'import_overene_recepty_klesly'::text,
    'Pocet computed_from_ingredients pod 217'::text,
    count(*)::text,
    count(*)
  FROM recipes_catalog
  WHERE nutrition_source = 'computed_from_ingredients'
  HAVING count(*) < 217
) alerts;

GRANT SELECT ON public.system_health_alerts TO service_role;
