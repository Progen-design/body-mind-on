-- system_health_alerts: doplneni kontrol na TICHE vypadky.
--
-- ===========================================================================
-- PROC: hlidac existoval a pet dni neustekl
-- ===========================================================================
-- /api/cron/translate-recipes padal 1307x mezi 1. a 5. 8. (ReferenceError,
-- opraveno v PR #50) a Spoonacular import od 3. 8. neprodukoval nic. Denni
-- system-health-alert nic neposlal. Duvody jsou tri a kazdy je vlastni trida
-- slepoty:
--
--   1) AGREGACE MASKUJE. Kontrola `import_zadny_novy_recept` se pta na
--      max(created_at) pres CELY katalog. Generator mezitim pridaval ~33
--      receptu denne, takze jeden zdravy zdroj prekryl dva mrtve.
--
--   2) HLIDA SE CHYBA, NE TICHO. `import_beh_chyba` cte
--      spoonacular_import_runs a hleda radky s error/api_status>=400.
--      Cron, ktery se vubec nespustil, zadny radek nezanecha — a pravé
--      absence radku je ten horsi pripad.
--
--   3) FRONTA SE NEHLIDA VUBEC. Neprelozene recepty ani recepty cekajici na
--      schvaleni nemely zadnou kontrolu. Prvni by chytila mrtvy preklad uz
--      po sesti hodinach, druha odhalila 14 receptu, ktere lezely tri dny.
--
-- Pravidlo, ktere z toho plyne a plati i pro dalsi kontroly:
-- ptat se PER ZDROJ a na NEPRITOMNOST, ne jen na chybu.
--
-- Zadne existujici kontroly se nemeni ani neodstranuji, jen se pridava pet
-- novych. Puvodni `import_zadny_novy_recept` zustava — je porad platny jako
-- posledni zachrana, kdyby umlkly vsechny zdroje najednou.

CREATE OR REPLACE VIEW public.system_health_alerts AS
SELECT severity, kod, popis, detail, pocet FROM (

  -- ======================= PUVODNI KONTROLY =============================
  SELECT 'critical'::text AS severity, 'uzivatel_bez_planu'::text AS kod,
         'Uzivatel s aktivnim clenstvim nema plan'::text AS popis,
         string_agg(COALESCE(pr.email, pr.id::text), ', ') AS detail,
         count(*) AS pocet
    FROM profiles pr JOIN memberships m ON m.user_id = pr.id
   WHERE (m.status = 'active' OR m.status = 'trial' AND m.trial_ends_at IS NOT NULL AND m.trial_ends_at > now())
     AND NOT EXISTS (SELECT 1 FROM ai_generated_plans p WHERE p.user_id = pr.id AND p.is_active)
  HAVING count(*) > 0

  UNION ALL
  SELECT 'critical', 'ai_task_dlq', 'AI task skoncil v DLQ (poslednich 24 h)',
         string_agg(DISTINCT (t.task_type || ': ') || "left"(COALESCE(t.last_error, 'bez chyby'), 70), '; '),
         count(*)
    FROM ai_tasks t
   WHERE t.status = 'dlq' AND COALESCE(t.dead_lettered_at, t.processed_at) > (now() - interval '24 hours')
  HAVING count(*) > 0

  UNION ALL
  SELECT 'critical', 'generovani_selhalo', 'Generovani planu selhalo za poslednich 24 h',
         count(*)::text || 'x', count(*)
    FROM product_events
   WHERE event_name = 'plan_generation_failed' AND created_at > (now() - interval '24 hours')
  HAVING count(*) > 0

  UNION ALL
  SELECT 'critical', 'registrace_selhava',
         'Opakovana registrace stejneho e-mailu BEZ vzniku uctu (flow spada)',
         string_agg(DISTINCT s.email, ', '), count(DISTINCT s.email)
    FROM (SELECT r.email FROM registrations r
            LEFT JOIN profiles pr ON lower(pr.email) = lower(r.email)
           WHERE pr.id IS NULL GROUP BY r.email HAVING count(*) >= 2) s
  HAVING count(*) > 0

  UNION ALL
  SELECT 'critical', 'uvizl_na_paywallu', 'Clenstvi ve stavu pending_payment - mel dostat trial',
         string_agg(COALESCE(pr.email, pr.id::text), ', '), count(*)
    FROM memberships m JOIN profiles pr ON pr.id = m.user_id
   WHERE m.status = 'pending_payment'
  HAVING count(*) > 0

  UNION ALL
  SELECT 'warning', 'registrations_viselec', 'Registrace ulozena, ucet nevznikl',
         string_agg(DISTINCT r.email, ', '), count(DISTINCT r.email)
    FROM registrations r LEFT JOIN profiles pr ON lower(pr.email) = lower(r.email)
   WHERE pr.id IS NULL
  HAVING count(*) > 0

  UNION ALL
  SELECT 'warning', 'necela_kusova_surovina',
         'V aktivnim planu je necely pocet kusovych surovin', 'napr. 3,45 vejce', count(*)
    FROM ai_generated_plans p,
         LATERAL jsonb_array_elements(p.structured_plan_json -> 'days') d(value),
         LATERAL jsonb_array_elements(d.value -> 'meals') m(value),
         LATERAL jsonb_array_elements((m.value -> 'recipe') -> 'ingredients') i(value)
   WHERE p.is_active
     AND (i.value ->> 'unit') = ANY (ARRAY['ks','plátky','plátek','konzerva','stroužek'])
     AND ((i.value ->> 'amount')::numeric) <> (round(((i.value ->> 'amount')::numeric) * 2) / 2)
  HAVING count(*) > 0

  UNION ALL
  SELECT 'warning', 'nazev_nesedi_s_receptem', 'display_name jidla neodpovida catalog receptu', '', count(*)
    FROM ai_generated_plans p,
         LATERAL jsonb_array_elements(p.structured_plan_json -> 'days') d(value),
         LATERAL jsonb_array_elements(d.value -> 'meals') m(value)
         JOIN recipes_catalog rc ON rc.id = ((m.value ->> 'catalog_id')::bigint)
   WHERE p.is_active AND (m.value ->> 'display_name') IS DISTINCT FROM rc.name_cs
  HAVING count(*) > 0

  UNION ALL
  SELECT 'warning', 'apple_health_nesynchronizuje', 'Apple Health nesynchronizoval vic nez 48 h',
         string_agg(COALESCE(pr.email, pr.id::text), ', '), count(*)
    FROM apple_health_connections c JOIN profiles pr ON pr.id = c.user_id
   WHERE c.status = 'active' AND (c.last_sync_at IS NULL OR c.last_sync_at < (now() - interval '48 hours'))
  HAVING count(*) > 0

  UNION ALL
  SELECT 'warning', 'recept_mimo_gate', 'Recept ma kcal mimo toleranci vuci makrum',
         string_agg(name_cs, ', '), count(*)
    FROM recipes_catalog
   WHERE active AND (abs(kcal::numeric - (protein_g * 4 + carbs_g * 4 + fat_g * 9)) / NULLIF(kcal, 0)::numeric) > 0.20
  HAVING count(*) > 0

  UNION ALL
  SELECT 'warning', 'calorie_target_mismatch', 'Aktivni plan ma jiny kaloricky cil nez body_metrics',
         string_agg(p.email, ', '), count(*)
    FROM ai_generated_plans p
    JOIN LATERAL (SELECT bm.calories_target FROM body_metrics bm
                   WHERE bm.user_id = p.user_id ORDER BY bm.created_at DESC LIMIT 1) latest ON true
   WHERE p.is_active AND p.daily_calories IS NOT NULL AND latest.calories_target IS NOT NULL
     AND p.daily_calories <> latest.calories_target
  HAVING count(*) > 0

  UNION ALL
  SELECT 'info', 'nenormalizovana_surovina', 'Surovina v aktivnim planu nema kanonicky nazev',
         string_agg(DISTINCT m.raw_name, ', ' ORDER BY m.raw_name), count(DISTINCT m.raw_name)
    FROM ingredient_normalization_misses m
    JOIN ai_generated_plans p ON p.id = m.plan_id AND p.is_active
   WHERE m.seen_at > (now() - interval '7 days')
  HAVING count(DISTINCT m.raw_name) > 0

  UNION ALL
  SELECT 'critical', 'import_zadny_novy_recept', 'Zadny novy recept v katalogu 2+ dny',
         to_char(max(rc.created_at), 'YYYY-MM-DD HH24:MI'), 1
    FROM recipes_catalog rc
  HAVING max(rc.created_at) < (now() - interval '2 days')

  UNION ALL
  SELECT 'critical', 'import_beh_chyba', 'Spoonacular import selhal (poslednich 24 h)',
         string_agg(DISTINCT "left"(r.error, 120), '; '), count(*)
    FROM spoonacular_import_runs r
   WHERE r.started_at > (now() - interval '24 hours') AND (r.error IS NOT NULL OR r.api_status >= 400)
  HAVING count(*) > 0

  UNION ALL
  SELECT 'warning', 'import_nizka_kvota', 'Spoonacular quota_left pod 20', min(r.quota_left)::text, 1
    FROM spoonacular_import_runs r
   WHERE r.started_at > (now() - interval '24 hours') AND r.quota_left IS NOT NULL AND r.quota_left < 20
  HAVING count(*) > 0

  UNION ALL
  SELECT 'critical', 'import_overene_recepty_klesly', 'Pocet computed_from_ingredients pod 217',
         count(*)::text, count(*)
    FROM recipes_catalog WHERE nutrition_source = 'computed_from_ingredients'
  HAVING count(*) < 217

  -- ======================= NOVE: TICHE VYPADKY ==========================

  -- 1) Preklad zaostava. Cron bezi kazdych 5 minut, takze recept cekajici
  --    pres 6 hodin znamena, ze nebezi nebo pada. Tohle by mrtvy preklad
  --    ohlasilo prvni den misto po peti.
  UNION ALL
  SELECT 'critical', 'preklad_zaostava',
         'Recepty cekaji na preklad vic nez 6 h (cron bezi po 5 min)',
         'nejstarsi: ' || to_char(min(rc.created_at), 'YYYY-MM-DD HH24:MI'), count(*)
    FROM recipes_catalog rc
   WHERE (rc.name_cs IS NULL OR btrim(rc.name_cs) = '')
     AND rc.created_at < (now() - interval '6 hours')
  HAVING count(*) > 0

  -- 2) Generator nedodava. Je to dnes hlavni zdroj katalogu (100 %
  --    spocitatelna nutrice proti 39 % u Spoonacularu), takze jeho vypadek
  --    je vaznejsi nez vypadek importu. Ptame se PER ZDROJ, aby to
  --    nezamaskoval nikdo jiny.
  UNION ALL
  SELECT 'critical', 'generator_nedodava',
         'Generator nevyrobil zadny recept 48 h',
         'posledni: ' || COALESCE(to_char(max(rc.created_at), 'YYYY-MM-DD HH24:MI'), 'nikdy'), 1
    FROM recipes_catalog rc
   WHERE rc.source = 'llm_generated'
  HAVING max(rc.created_at) IS NULL OR max(rc.created_at) < (now() - interval '48 hours')

  -- 3) Import se vubec nespustil. `import_beh_chyba` vys hlida chybu, tohle
  --    hlida TICHO — cron, ktery nebezel, zadny radek nezanecha.
  --    Warning, ne critical: pool dotazu muze byt legitimne vycerpany.
  UNION ALL
  SELECT 'warning', 'import_nebezel',
         'Spoonacular import se 48 h vubec nespustil (nebo je vycerpany pool dotazu)',
         'posledni beh: ' || COALESCE(to_char(max(r.started_at), 'YYYY-MM-DD HH24:MI'), 'nikdy'), 1
    FROM spoonacular_import_runs r
  HAVING max(r.started_at) IS NULL OR max(r.started_at) < (now() - interval '48 hours')

  -- 4) Recepty uvizle na schvaleni. 14 jich lezelo tri dny a nikdo o nich
  --    nevedel; byly mezi nimi veganske vecere, ktere katalogu chybely.
  UNION ALL
  SELECT 'warning', 'cekaji_na_schvaleni',
         'Recepty cekaji na rucni schvaleni vic nez 24 h',
         'nejstarsi: ' || to_char(min(rc.created_at), 'YYYY-MM-DD HH24:MI'), count(*)
    FROM recipes_catalog rc
   WHERE rc.pending_review AND rc.created_at < (now() - interval '24 hours')
  HAVING count(*) > 0

  -- 5) Fronta generatoru stoji. Polozka `pending` starsi nez 48 h znamena,
  --    ze ji nikdo nebere — bud nebezi cron, nebo se na ni opakovane pada.
  UNION ALL
  SELECT 'warning', 'fronta_generatoru_stoji',
         'Polozka ve fronte generatoru ceka vic nez 48 h',
         'nejstarsi: ' || to_char(min(q.created_at), 'YYYY-MM-DD HH24:MI'), count(*)
    FROM recipe_generation_queue q
   WHERE q.stav = 'pending' AND q.created_at < (now() - interval '48 hours')
  HAVING count(*) > 0

) alerts;

COMMENT ON VIEW public.system_health_alerts IS
  'Detekce pro denni system-health-alert. Pravidlo: ptat se PER ZDROJ a na NEPRITOMNOST, ne jen na chybu — agregace pres cely katalog maskovala dva mrtve zdroje pet dni.';
