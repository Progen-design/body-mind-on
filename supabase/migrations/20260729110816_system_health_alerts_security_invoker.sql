-- Fix Supabase linter ERRORs on public.system_health_alerts:
--   auth_users_exposed, security_definer_view
-- Ops-only view: no auth.users, SECURITY INVOKER, service_role SELECT only.

CREATE OR REPLACE VIEW public.system_health_alerts
WITH (security_invoker = true)
AS
SELECT * FROM (
  SELECT
    'critical'::text AS severity,
    'uzivatel_bez_planu'::text AS kod,
    'Uzivatel s aktivnim clenstvim nema plan'::text AS popis,
    string_agg(COALESCE(pr.email, pr.id::text), ', '::text) AS detail,
    count(*) AS pocet
  FROM public.profiles pr
  JOIN memberships m ON m.user_id = pr.id
  WHERE (m.status = ANY (ARRAY['active'::text, 'trial'::text]))
    AND NOT (EXISTS (
      SELECT 1 FROM ai_generated_plans p
      WHERE p.user_id = pr.id AND p.is_active
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
    LEFT JOIN public.profiles pr ON lower(pr.email) = lower(r.email)
    WHERE pr.id IS NULL
    GROUP BY r.email
    HAVING count(*) >= 2
  ) s
  HAVING count(*) > 0
  UNION ALL
  SELECT
    'critical'::text,
    'uvizl_na_paywallu'::text,
    'Clenstvi ve stavu pending_payment - mel dostat trial'::text,
    string_agg(COALESCE(pr.email, pr.id::text), ', '::text),
    count(*)
  FROM memberships m
  JOIN public.profiles pr ON pr.id = m.user_id
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
  LEFT JOIN public.profiles pr ON lower(pr.email) = lower(r.email)
  WHERE pr.id IS NULL
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
    string_agg(COALESCE(pr.email, pr.id::text), ', '::text),
    count(*)
  FROM apple_health_connections c
  JOIN public.profiles pr ON pr.id = c.user_id
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

COMMENT ON VIEW public.system_health_alerts IS
  'Internal ops health checks (cron only). SECURITY INVOKER; service_role SELECT only. No auth.users exposure.';

REVOKE ALL ON public.system_health_alerts FROM PUBLIC;
REVOKE ALL ON public.system_health_alerts FROM anon, authenticated;
GRANT SELECT ON public.system_health_alerts TO service_role;
