-- import_beh_chyba pocital i r.error = 'budget_exhausted' jako poruchu importu.
-- budget_exhausted je zdrave samo-zastaveni pri vycerpani denni Spoonacular kvoty
-- (viz BMON_STAV_2026-08-05.md), ne chyba site/auth/parse. Hlidka kricela critical
-- na spravne chovani stejne jako drive registrations_viselec na vlastni testy.
--
-- Skutecne chyby (network, auth, parse, api_status>=400) zustavaji critical.
-- budget_exhausted dostava vlastni 'info' vetvu, symetricky s import_rotace_vycerpana.

CREATE OR REPLACE VIEW public.system_health_alerts
WITH (security_invoker = true) AS
SELECT severity, kod, popis, detail, pocet
FROM (
  SELECT 'critical'::text AS severity,
    'uzivatel_bez_planu'::text AS kod,
    'Uzivatel s aktivnim clenstvim nema plan'::text AS popis,
    string_agg(COALESCE(pr.email, pr.id::text), ', ') AS detail,
    count(*) AS pocet
  FROM profiles pr
  JOIN memberships m ON m.user_id = pr.id
  WHERE (m.status = 'active' OR m.status = 'trial' AND m.trial_ends_at IS NOT NULL AND m.trial_ends_at > now())
    AND NOT EXISTS (SELECT 1 FROM ai_generated_plans p WHERE p.user_id = pr.id AND p.is_active)
  HAVING count(*) > 0

  UNION ALL
  SELECT 'critical', 'ai_task_dlq',
    'AI task skoncil v DLQ (poslednich 24 h)',
    string_agg(DISTINCT (t.task_type || ': ') || left(COALESCE(t.last_error, 'bez chyby'), 70), '; '),
    count(*)
  FROM ai_tasks t
  WHERE t.status = 'dlq' AND COALESCE(t.dead_lettered_at, t.processed_at) > (now() - '24:00:00'::interval)
  HAVING count(*) > 0

  UNION ALL
  SELECT 'critical', 'generovani_selhalo',
    'Generovani planu selhalo za poslednich 24 h',
    count(*)::text || 'x', count(*)
  FROM product_events
  WHERE product_events.event_name = 'plan_generation_failed' AND product_events.created_at > (now() - '24:00:00'::interval)
  HAVING count(*) > 0

  UNION ALL
  SELECT 'critical', 'registrace_selhava',
    'Opakovana registrace stejneho e-mailu BEZ vzniku uctu (flow spada)',
    string_agg(DISTINCT s.email, ', '), count(DISTINCT s.email)
  FROM (
    SELECT r.email FROM registrations r
    LEFT JOIN profiles pr ON lower(pr.email) = lower(r.email)
    WHERE pr.id IS NULL AND NOT je_testovaci_email(r.email)
    GROUP BY r.email HAVING count(*) >= 2
  ) s
  HAVING count(*) > 0

  UNION ALL
  SELECT 'critical', 'uvizl_na_paywallu',
    'Clenstvi ve stavu pending_payment - mel dostat trial',
    string_agg(COALESCE(pr.email, pr.id::text), ', '), count(*)
  FROM memberships m JOIN profiles pr ON pr.id = m.user_id
  WHERE m.status = 'pending_payment'
  HAVING count(*) > 0

  UNION ALL
  SELECT 'warning', 'registrations_viselec',
    'Registrace ulozena, ucet nevznikl',
    string_agg(DISTINCT r.email, ', '), count(DISTINCT r.email)
  FROM registrations r
  LEFT JOIN profiles pr ON lower(pr.email) = lower(r.email)
  WHERE pr.id IS NULL AND NOT je_testovaci_email(r.email)
  HAVING count(*) > 0

  UNION ALL
  SELECT 'warning', 'necela_kusova_surovina',
    'V aktivnim planu je necely pocet kusovych surovin',
    'napr. 3,45 vejce', count(*)
  FROM ai_generated_plans p,
    LATERAL jsonb_array_elements(p.structured_plan_json -> 'days') d(value),
    LATERAL jsonb_array_elements(d.value -> 'meals') m(value),
    LATERAL jsonb_array_elements((m.value -> 'recipe') -> 'ingredients') i(value)
  WHERE p.is_active
    AND (i.value ->> 'unit') = ANY (ARRAY['ks','plátky','plátek','konzerva','stroužek'])
    AND ((i.value ->> 'amount')::numeric) <> (round(((i.value ->> 'amount')::numeric) * 2) / 2)
  HAVING count(*) > 0

  UNION ALL
  SELECT 'warning', 'nazev_nesedi_s_receptem',
    'display_name jidla neodpovida catalog receptu',
    '', count(*)
  FROM ai_generated_plans p,
    LATERAL jsonb_array_elements(p.structured_plan_json -> 'days') d(value),
    LATERAL jsonb_array_elements(d.value -> 'meals') m(value)
  JOIN recipes_catalog rc ON rc.id = ((m.value ->> 'catalog_id')::bigint)
  WHERE p.is_active AND (m.value ->> 'display_name') IS DISTINCT FROM rc.name_cs
  HAVING count(*) > 0

  UNION ALL
  SELECT 'warning', 'apple_health_nesynchronizuje',
    'Apple Health nesynchronizoval vic nez 48 h',
    string_agg(COALESCE(pr.email, pr.id::text), ', '), count(*)
  FROM apple_health_connections c JOIN profiles pr ON pr.id = c.user_id
  WHERE c.status = 'active' AND (c.last_sync_at IS NULL OR c.last_sync_at < (now() - '48:00:00'::interval))
  HAVING count(*) > 0

  UNION ALL
  SELECT 'warning', 'recept_mimo_gate',
    'Recept ma kcal mimo toleranci vuci makrum',
    string_agg(recipes_catalog.name_cs, ', '), count(*)
  FROM recipes_catalog
  WHERE recipes_catalog.active
    AND (abs(recipes_catalog.kcal::numeric - (recipes_catalog.protein_g * 4 + recipes_catalog.carbs_g * 4 + recipes_catalog.fat_g * 9)) / NULLIF(recipes_catalog.kcal, 0)::numeric) > 0.20
  HAVING count(*) > 0

  UNION ALL
  SELECT 'warning', 'calorie_target_mismatch',
    'Aktivni plan ma jiny kaloricky cil nez body_metrics',
    string_agg(p.email, ', '), count(*)
  FROM ai_generated_plans p
  JOIN LATERAL (
    SELECT bm.calories_target FROM body_metrics bm
    WHERE bm.user_id = p.user_id ORDER BY bm.created_at DESC LIMIT 1
  ) latest ON true
  WHERE p.is_active AND p.daily_calories IS NOT NULL AND latest.calories_target IS NOT NULL
    AND p.daily_calories <> latest.calories_target
  HAVING count(*) > 0

  UNION ALL
  SELECT 'info', 'nenormalizovana_surovina',
    'Surovina v aktivnim planu nema kanonicky nazev',
    string_agg(DISTINCT m.raw_name, ', ' ORDER BY m.raw_name), count(DISTINCT m.raw_name)
  FROM ingredient_normalization_misses m
  JOIN ai_generated_plans p ON p.id = m.plan_id AND p.is_active
  WHERE m.seen_at > (now() - '7 days'::interval)
  HAVING count(DISTINCT m.raw_name) > 0

  UNION ALL
  SELECT 'critical', 'import_zadny_novy_recept',
    'Zadny novy recept v katalogu 2+ dny',
    to_char(max(rc.created_at), 'YYYY-MM-DD HH24:MI'), 1
  FROM recipes_catalog rc
  HAVING max(rc.created_at) < (now() - '2 days'::interval)

  UNION ALL
  -- ZMENA: budget_exhausted vyloucen — ma vlastni info vetev nize.
  SELECT 'critical', 'import_beh_chyba',
    'Spoonacular import selhal (poslednich 24 h)',
    string_agg(DISTINCT left(r.error, 120), '; '), count(*)
  FROM spoonacular_import_runs r
  WHERE r.started_at > (now() - '24:00:00'::interval)
    AND (r.error IS NOT NULL OR r.api_status >= 400)
    AND COALESCE(r.error, '') <> 'budget_exhausted'
  HAVING count(*) > 0

  UNION ALL
  -- NOVE: budget_exhausted je zdrave sebe-zastaveni, ne porucha.
  SELECT 'info', 'import_denni_rozpocet_vycerpan',
    'Spoonacular import se sam zastavil - denni rozpocet vycerpan (poslednich 24 h)',
    count(*)::text || 'x', count(*)
  FROM spoonacular_import_runs r
  WHERE r.started_at > (now() - '24:00:00'::interval) AND r.error = 'budget_exhausted'
  HAVING count(*) > 0

  UNION ALL
  SELECT 'warning', 'import_nizka_kvota',
    'Spoonacular quota_left pod 20',
    min(r.quota_left)::text, 1
  FROM spoonacular_import_runs r
  WHERE r.started_at > (now() - '24:00:00'::interval) AND r.quota_left IS NOT NULL AND r.quota_left < 20
  HAVING count(*) > 0

  UNION ALL
  SELECT 'critical', 'import_overene_recepty_klesly',
    'Pocet computed_from_ingredients pod 217',
    count(*)::text, count(*)
  FROM recipes_catalog
  WHERE recipes_catalog.nutrition_source = 'computed_from_ingredients'
  HAVING count(*) < 217

  UNION ALL
  SELECT 'critical', 'preklad_zaostava',
    'Recepty cekaji na preklad vic nez 6 h (cron bezi po 5 min)',
    'nejstarsi: ' || to_char(min(rc.created_at), 'YYYY-MM-DD HH24:MI'), count(*)
  FROM recipes_catalog rc
  WHERE (rc.name_cs IS NULL OR btrim(rc.name_cs) = '') AND rc.created_at < (now() - '06:00:00'::interval)
  HAVING count(*) > 0

  UNION ALL
  SELECT 'critical', 'generator_nedodava',
    'Generator nevyrobil zadny recept 48 h',
    'posledni: ' || COALESCE(to_char(max(rc.created_at), 'YYYY-MM-DD HH24:MI'), 'nikdy'), 1
  FROM recipes_catalog rc
  WHERE rc.source = 'llm_generated'
  HAVING max(rc.created_at) IS NULL OR max(rc.created_at) < (now() - '48:00:00'::interval)

  UNION ALL
  SELECT 'warning', 'import_nebezel',
    'Spoonacular import se 48 h vubec nespustil (nebo je vycerpany pool dotazu)',
    'posledni beh: ' || COALESCE(to_char(max(r.started_at), 'YYYY-MM-DD HH24:MI'), 'nikdy'), 1
  FROM spoonacular_import_runs r
  HAVING (max(r.started_at) IS NULL OR max(r.started_at) < (now() - '48:00:00'::interval))
    AND EXISTS (SELECT 1 FROM spoonacular_import_queries q WHERE q.exhausted_at IS NULL AND q.retired_reason IS NULL)

  UNION ALL
  SELECT 'warning', 'cekaji_na_schvaleni',
    'Recepty cekaji na rucni schvaleni vic nez 24 h',
    'nejstarsi: ' || to_char(min(rc.created_at), 'YYYY-MM-DD HH24:MI'), count(*)
  FROM recipes_catalog rc
  WHERE rc.pending_review AND rc.created_at < (now() - '24:00:00'::interval)
  HAVING count(*) > 0

  UNION ALL
  SELECT 'warning', 'fronta_generatoru_stoji',
    'Polozka ve fronte generatoru ceka vic nez 48 h',
    'nejstarsi: ' || to_char(min(q.created_at), 'YYYY-MM-DD HH24:MI'), count(*)
  FROM recipe_generation_queue q
  WHERE q.stav = 'pending' AND q.created_at < (now() - '48:00:00'::interval)
  HAVING count(*) > 0

  UNION ALL
  SELECT 'critical', 'stripe_udalost_zahozena',
    'Stripe udalost skoncila jako skipped (poslednich 24 h)',
    string_agg(DISTINCT COALESCE(se.error_message, se.handler_result), '; '), count(*)
  FROM stripe_events se
  WHERE se.handler_result LIKE 'skipped_%' AND se.created_at > (now() - '24:00:00'::interval)
  HAVING count(*) > 0

  UNION ALL
  SELECT 'warning', 'zarizeni_mlci',
    'Aktivni pripojeni zarizeni, ale 7 dni zadne mereni',
    string_agg(DISTINCT z.popis, ', '), count(DISTINCT z.user_id)
  FROM (
    SELECT c.user_id, ((COALESCE(pr.email, pr.id::text) || ' (') || c.zdroj) || ')' AS popis
    FROM (
      SELECT w.user_id, 'withings' AS zdroj, w.connected_at FROM withings_connections w
      WHERE w.refresh_token_expires_at IS NULL OR w.refresh_token_expires_at > now()
      UNION ALL
      SELECT a.user_id, 'apple_health', a.connected_at FROM apple_health_connections a
      WHERE a.status = 'active' AND a.revoked_at IS NULL
    ) c
    JOIN profiles pr ON pr.id = c.user_id
    WHERE c.connected_at < (now() - '7 days'::interval) AND NOT je_testovaci_email(pr.email)
      AND NOT EXISTS (
        SELECT 1 FROM body_measurements bm
        WHERE bm.user_id = c.user_id AND bm.source = c.zdroj AND bm.weight_kg IS NOT NULL
          AND bm.measured_at > (now() - '7 days'::interval)
      )
  ) z
  HAVING count(*) > 0

  UNION ALL
  SELECT 'critical', 'withings_callback_selhal',
    'Withings callback skoncil jinak nez connected (poslednich 24 h)',
    string_agg(DISTINCT (e.status || COALESCE(' @ ' || e.stage, '')) || COALESCE(': ' || left(e.error_message, 80), ''), '; '), count(*)
  FROM withings_callback_events e
  WHERE e.status <> 'connected' AND e.created_at > (now() - '24:00:00'::interval)
  HAVING count(*) > 0

  UNION ALL
  SELECT 'info', 'import_rotace_vycerpana',
    'Spoonacular rotace dotazu je vycerpana - neni co importovat',
    count(*)::text || 'x vycerpany dotaz, 0 pouzitelnych', count(*)
  FROM spoonacular_import_queries q
  WHERE q.exhausted_at IS NOT NULL OR q.retired_reason IS NOT NULL
  HAVING count(*) > 0 AND NOT EXISTS (
    SELECT 1 FROM spoonacular_import_queries q2 WHERE q2.exhausted_at IS NULL AND q2.retired_reason IS NULL
  )

  UNION ALL
  SELECT 'warning', 'fronta_generatoru_failed',
    'Objednavky generatoru padaji — vic nez 20 ve stavu failed',
    'nejcastejsi: ' || COALESCE(mode() WITHIN GROUP (ORDER BY q.posledni_chyba), 'bez chyby'), count(*)
  FROM recipe_generation_queue q
  WHERE q.stav = 'failed'
  HAVING count(*) > 20
) alerts;
