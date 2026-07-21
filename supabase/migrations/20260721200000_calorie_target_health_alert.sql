-- Append calorie_target_mismatch alert to system_health_alerts (preserve existing checks).
CREATE OR REPLACE VIEW public.system_health_alerts AS
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
  'critical'::text AS severity,
  'generovani_selhalo'::text AS kod,
  'Generovani planu selhalo za poslednich 24 h'::text AS popis,
  count(*)::text || 'x'::text AS detail,
  count(*) AS pocet
FROM product_events
WHERE product_events.event_name = 'plan_generation_failed'::text
  AND product_events.created_at > (now() - '24:00:00'::interval)
HAVING count(*) > 0
UNION ALL
SELECT
  'critical'::text AS severity,
  'registrace_selhava'::text AS kod,
  'Opakovana registrace stejneho e-mailu BEZ vzniku uctu (flow spada)'::text AS popis,
  string_agg(DISTINCT s.email, ', '::text) AS detail,
  count(DISTINCT s.email) AS pocet
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
  'critical'::text AS severity,
  'uvizl_na_paywallu'::text AS kod,
  'Clenstvi ve stavu pending_payment - mel dostat trial'::text AS popis,
  string_agg(u.email::text, ', '::text) AS detail,
  count(*) AS pocet
FROM memberships m
JOIN auth.users u ON u.id = m.user_id
WHERE m.status = 'pending_payment'::text
HAVING count(*) > 0
UNION ALL
SELECT
  'warning'::text AS severity,
  'registrations_viselec'::text AS kod,
  'Registrace ulozena, ucet nevznikl'::text AS popis,
  string_agg(DISTINCT r.email, ', '::text) AS detail,
  count(DISTINCT r.email) AS pocet
FROM registrations r
LEFT JOIN auth.users u ON lower(u.email::text) = lower(r.email)
WHERE u.id IS NULL
HAVING count(*) > 0
UNION ALL
SELECT
  'warning'::text AS severity,
  'necela_kusova_surovina'::text AS kod,
  'V aktivnim planu je necely pocet kusovych surovin'::text AS popis,
  'napr. 3,45 vejce'::text AS detail,
  count(*) AS pocet
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
  'warning'::text AS severity,
  'nazev_nesedi_s_receptem'::text AS kod,
  'display_name jidla neodpovida catalog receptu'::text AS popis,
  ''::text AS detail,
  count(*) AS pocet
FROM ai_generated_plans p,
LATERAL jsonb_array_elements(p.structured_plan_json -> 'days') d(value),
LATERAL jsonb_array_elements(d.value -> 'meals') m(value)
JOIN recipes_catalog rc ON rc.id = ((m.value ->> 'catalog_id')::bigint)
WHERE p.is_active
  AND (m.value ->> 'display_name') IS DISTINCT FROM rc.name_cs
HAVING count(*) > 0
UNION ALL
SELECT
  'warning'::text AS severity,
  'apple_health_nesynchronizuje'::text AS kod,
  'Apple Health nesynchronizoval vic nez 48 h'::text AS popis,
  string_agg(u.email::text, ', '::text) AS detail,
  count(*) AS pocet
FROM apple_health_connections c
JOIN auth.users u ON u.id = c.user_id
WHERE c.status = 'active'::text
  AND (c.last_sync_at IS NULL OR c.last_sync_at < (now() - '48:00:00'::interval))
HAVING count(*) > 0
UNION ALL
SELECT
  'warning'::text AS severity,
  'recept_mimo_gate'::text AS kod,
  'Recept ma kcal mimo toleranci vuci makrum'::text AS popis,
  string_agg(recipes_catalog.name_cs, ', '::text) AS detail,
  count(*) AS pocet
FROM recipes_catalog
WHERE recipes_catalog.active
  AND (abs(recipes_catalog.kcal::numeric - (recipes_catalog.protein_g * 4 + recipes_catalog.carbs_g * 4 + recipes_catalog.fat_g * 9))
    / NULLIF(recipes_catalog.kcal, 0)::numeric) > 0.20
HAVING count(*) > 0
UNION ALL
SELECT
  'warning'::text AS severity,
  'calorie_target_mismatch'::text AS kod,
  'Aktivni plan ma jiny kaloricky cil nez body_metrics'::text AS popis,
  string_agg(p.email::text, ', '::text) AS detail,
  count(*) AS pocet
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
HAVING count(*) > 0;

GRANT SELECT ON public.system_health_alerts TO service_role;
