-- Zábradlí pro producenta týdenních plánů.
--
-- V červnu 2026 spálila smyčka missing_plan + 5min cron 7 405 Spoonacular volání
-- za měsíc s nulovou úspěšností a generateAITasks je od té doby zamrzlé. Zábrana
-- tehdy nebyla nikde — spoléhalo se na kód. Tahle migrace ji dává do schématu,
-- aby ji nešlo obejít žádnou kombinací souběhu, retry, dvojího cronu ani ručního
-- INSERTu.

-- ---------------------------------------------------------------------------
-- 1. Idempotence, vrstva 2
--
-- Vrstva 1 (idx_ai_tasks_idempotency) je UNIQUE(idempotency_key) WHERE key IS NOT
-- NULL — má díru: partial index na NULL neplatí, takže weekly task bez klíče ji
-- projde. CHECK tu díru zavírá: weekly task bez klíče prostě nevznikne.
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_tasks
  DROP CONSTRAINT IF EXISTS ai_tasks_weekly_needs_idempotency_key;
ALTER TABLE public.ai_tasks
  ADD CONSTRAINT ai_tasks_weekly_needs_idempotency_key
    CHECK (task_type <> 'weekly_plan_update' OR idempotency_key IS NOT NULL);

-- Sémantický pár přímo, ať klíč (řetězec) není jediná pravda. Kdyby se změnil
-- formát klíče, tenhle index drží pravidlo dál.
CREATE UNIQUE INDEX IF NOT EXISTS ai_tasks_weekly_unique_target
  ON public.ai_tasks (user_id, ((payload->>'target_from')))
  WHERE task_type = 'weekly_plan_update';

COMMENT ON INDEX public.ai_tasks_weekly_unique_target IS
  'Jeden weekly_plan_update na uzivatele a cilovy tyden. Druha vrstva vedle UNIQUE(idempotency_key).';

-- ---------------------------------------------------------------------------
-- 2. system_health_alerts
--
-- Dvě změny:
--   a) uzivatel_bez_planu respektuje membership gate. Po nasazení
--      deactivate_expired_plans hlásil 11 uživatelů, ale u 8 vypršelých trialů je
--      „nemá plán“ SPRÁVNÝ stav — producent jim plán vědomě nevyrobí. Kritický
--      alert, který denně hlásí očekávaný stav, přestane být čtený a skutečný
--      výpadek produkce se v něm ztratí.
--
--      Podmínka je `status = 'active'`, tedy PŘESNĚ ta, na které producent
--      vytváří úlohy (canRenewPlanForMembership). Alert tím měří odpovědnost
--      producenta: pálí právě tehdy, když plán vzniknout měl a nevznikl. Běžící
--      trial mezi ně nepatří — ten dostává jediný plán přes initial_plan a jeho
--      vypršení je konec trialu, ne porucha produkce.
--   b) přibývá ai_task_dlq. Po vyčerpání retry zůstane klíč v ai_tasks, takže
--      producent na ten týden znovu nesáhne — a to je záměr, automatický retry
--      po DLQ je přesně cesta zpátky ke smyčce. Tichý výpadek ale potřebuje
--      alert, jinak se o něm nikdo nedozví.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.system_health_alerts
WITH (security_invoker = true) AS
SELECT severity, kod, popis, detail, pocet
FROM (
  SELECT 'critical'::text AS severity,
         'uzivatel_bez_planu'::text AS kod,
         'Uzivatel s aktivnim clenstvim nema plan'::text AS popis,
         string_agg(COALESCE(pr.email, pr.id::text), ', '::text) AS detail,
         count(*) AS pocet
    FROM profiles pr
    JOIN memberships m ON m.user_id = pr.id
   WHERE m.status = 'active'
     AND NOT EXISTS (SELECT 1 FROM ai_generated_plans p WHERE p.user_id = pr.id AND p.is_active)
  HAVING count(*) > 0
  UNION ALL
  SELECT 'critical'::text, 'ai_task_dlq'::text,
         'AI task skoncil v DLQ (poslednich 24 h)'::text,
         string_agg(DISTINCT t.task_type || ': ' || "left"(COALESCE(t.last_error, 'bez chyby'), 70), '; '::text),
         count(*)
    FROM ai_tasks t
   WHERE t.status = 'dlq'
     AND COALESCE(t.dead_lettered_at, t.processed_at) > (now() - '24:00:00'::interval)
  HAVING count(*) > 0
  UNION ALL
  SELECT 'critical'::text, 'generovani_selhalo'::text,
         'Generovani planu selhalo za poslednich 24 h'::text,
         count(*)::text || 'x'::text, count(*)
    FROM product_events
   WHERE product_events.event_name = 'plan_generation_failed'::text
     AND product_events.created_at > (now() - '24:00:00'::interval)
  HAVING count(*) > 0
  UNION ALL
  SELECT 'critical'::text, 'registrace_selhava'::text,
         'Opakovana registrace stejneho e-mailu BEZ vzniku uctu (flow spada)'::text,
         string_agg(DISTINCT s.email, ', '::text), count(DISTINCT s.email)
    FROM (SELECT r.email FROM registrations r
            LEFT JOIN profiles pr ON lower(pr.email) = lower(r.email)
           WHERE pr.id IS NULL GROUP BY r.email HAVING count(*) >= 2) s
  HAVING count(*) > 0
  UNION ALL
  SELECT 'critical'::text, 'uvizl_na_paywallu'::text,
         'Clenstvi ve stavu pending_payment - mel dostat trial'::text,
         string_agg(COALESCE(pr.email, pr.id::text), ', '::text), count(*)
    FROM memberships m JOIN profiles pr ON pr.id = m.user_id
   WHERE m.status = 'pending_payment'::text
  HAVING count(*) > 0
  UNION ALL
  SELECT 'warning'::text, 'registrations_viselec'::text,
         'Registrace ulozena, ucet nevznikl'::text,
         string_agg(DISTINCT r.email, ', '::text), count(DISTINCT r.email)
    FROM registrations r LEFT JOIN profiles pr ON lower(pr.email) = lower(r.email)
   WHERE pr.id IS NULL
  HAVING count(*) > 0
  UNION ALL
  SELECT 'warning'::text, 'necela_kusova_surovina'::text,
         'V aktivnim planu je necely pocet kusovych surovin'::text,
         'napr. 3,45 vejce'::text, count(*)
    FROM ai_generated_plans p,
         LATERAL jsonb_array_elements(p.structured_plan_json -> 'days'::text) d(value),
         LATERAL jsonb_array_elements(d.value -> 'meals'::text) m(value),
         LATERAL jsonb_array_elements((m.value -> 'recipe'::text) -> 'ingredients'::text) i(value)
   WHERE p.is_active
     AND ((i.value ->> 'unit'::text) = ANY (ARRAY['ks'::text, 'plátky'::text, 'plátek'::text, 'konzerva'::text, 'stroužek'::text]))
     AND ((i.value ->> 'amount'::text)::numeric) <> (round(((i.value ->> 'amount'::text)::numeric) * 2::numeric) / 2::numeric)
  HAVING count(*) > 0
  UNION ALL
  SELECT 'warning'::text, 'nazev_nesedi_s_receptem'::text,
         'display_name jidla neodpovida catalog receptu'::text, ''::text, count(*)
    FROM ai_generated_plans p,
         LATERAL jsonb_array_elements(p.structured_plan_json -> 'days'::text) d(value),
         LATERAL jsonb_array_elements(d.value -> 'meals'::text) m(value)
    JOIN recipes_catalog rc ON rc.id = ((m.value ->> 'catalog_id'::text)::bigint)
   WHERE p.is_active AND (m.value ->> 'display_name'::text) IS DISTINCT FROM rc.name_cs
  HAVING count(*) > 0
  UNION ALL
  SELECT 'warning'::text, 'apple_health_nesynchronizuje'::text,
         'Apple Health nesynchronizoval vic nez 48 h'::text,
         string_agg(COALESCE(pr.email, pr.id::text), ', '::text), count(*)
    FROM apple_health_connections c JOIN profiles pr ON pr.id = c.user_id
   WHERE c.status = 'active'::text
     AND (c.last_sync_at IS NULL OR c.last_sync_at < (now() - '48:00:00'::interval))
  HAVING count(*) > 0
  UNION ALL
  SELECT 'warning'::text, 'recept_mimo_gate'::text,
         'Recept ma kcal mimo toleranci vuci makrum'::text,
         string_agg(recipes_catalog.name_cs, ', '::text), count(*)
    FROM recipes_catalog
   WHERE recipes_catalog.active
     AND (abs(recipes_catalog.kcal::numeric - (recipes_catalog.protein_g * 4::numeric + recipes_catalog.carbs_g * 4::numeric + recipes_catalog.fat_g * 9::numeric)) / NULLIF(recipes_catalog.kcal, 0)::numeric) > 0.20
  HAVING count(*) > 0
  UNION ALL
  SELECT 'warning'::text, 'calorie_target_mismatch'::text,
         'Aktivni plan ma jiny kaloricky cil nez body_metrics'::text,
         string_agg(p.email, ', '::text), count(*)
    FROM ai_generated_plans p
    JOIN LATERAL (SELECT bm.calories_target FROM body_metrics bm
                   WHERE bm.user_id = p.user_id ORDER BY bm.created_at DESC LIMIT 1) latest ON true
   WHERE p.is_active = true AND p.daily_calories IS NOT NULL
     AND latest.calories_target IS NOT NULL AND p.daily_calories <> latest.calories_target
  HAVING count(*) > 0
  UNION ALL
  SELECT 'info'::text, 'nenormalizovana_surovina'::text,
         'Surovina v aktivnim planu nema kanonicky nazev'::text,
         string_agg(DISTINCT m.raw_name, ', '::text ORDER BY m.raw_name), count(DISTINCT m.raw_name)
    FROM ingredient_normalization_misses m
    JOIN ai_generated_plans p ON p.id = m.plan_id AND p.is_active
   WHERE m.seen_at > (now() - '7 days'::interval)
  HAVING count(DISTINCT m.raw_name) > 0
  UNION ALL
  SELECT 'critical'::text, 'import_zadny_novy_recept'::text,
         'Zadny novy recept v katalogu 2+ dny'::text,
         to_char(max(rc.created_at), 'YYYY-MM-DD HH24:MI'::text), 1
    FROM recipes_catalog rc
  HAVING max(rc.created_at) < (now() - '2 days'::interval)
  UNION ALL
  SELECT 'critical'::text, 'import_beh_chyba'::text,
         'Spoonacular import selhal (poslednich 24 h)'::text,
         string_agg(DISTINCT "left"(r.error, 120), '; '::text), count(*)
    FROM spoonacular_import_runs r
   WHERE r.started_at > (now() - '24:00:00'::interval)
     AND (r.error IS NOT NULL OR r.api_status >= 400)
  HAVING count(*) > 0
  UNION ALL
  SELECT 'warning'::text, 'import_nizka_kvota'::text,
         'Spoonacular quota_left pod 20'::text, min(r.quota_left)::text, 1
    FROM spoonacular_import_runs r
   WHERE r.started_at > (now() - '24:00:00'::interval)
     AND r.quota_left IS NOT NULL AND r.quota_left < 20::numeric
  HAVING count(*) > 0
  UNION ALL
  SELECT 'critical'::text, 'import_overene_recepty_klesly'::text,
         'Pocet computed_from_ingredients pod 217'::text, count(*)::text, count(*)
    FROM recipes_catalog
   WHERE recipes_catalog.nutrition_source = 'computed_from_ingredients'::text
  HAVING count(*) < 217
) alerts;
