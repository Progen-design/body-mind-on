-- Backfill profiles.name z body_metrics.name.
--
-- NEAPLIKUJI tuhle migraci — čeká na schválení (PROMPT_DNES_WOW.md).
--
-- PROČ. Registrace zapisovala jméno jen do `body_metrics.name`; trigger
-- `handle_new_user` zakládá `profiles` s (id, email) a `name` zůstává prázdné
-- (ověřeno 21. 9. 2026: 10 z 10 účtů). Cron `api/cron/inactivity-reminder.js`
-- čte `profiles.name`, takže e-maily chodí bez oslovení. Nové účty už jméno
-- do `profiles.name` dostávají z `api/body-metrics.js`; tahle migrace doplní
-- stávající.
--
-- CO DĚLÁ. Jen PRÁZDNÉ `profiles.name` (NULL nebo prázdný řetězec) se doplní
-- z NEJNOVĚJŠÍHO neprázdného `body_metrics.name` téhož uživatele. Vyplněné
-- jméno se nepřepisuje. Nic se nemaže. Idempotentní — druhý běh nic nenajde.
--
-- RLS: žádná nová tabulka ani politika, jen UPDATE existujících řádků.

UPDATE public.profiles p
   SET name = src.name,
       updated_at = now()
  FROM (
    SELECT DISTINCT ON (bm.user_id)
           bm.user_id,
           btrim(bm.name) AS name
      FROM public.body_metrics bm
     WHERE bm.name IS NOT NULL
       AND btrim(bm.name) <> ''
     ORDER BY bm.user_id, bm.created_at DESC
  ) src
 WHERE p.id = src.user_id
   AND (p.name IS NULL OR btrim(p.name) = '');

-- Kontrola: po backfillu nesmí zůstat účet, který má jméno v body_metrics
-- a prázdné v profiles.
DO $$
DECLARE
  v_zbyva integer;
BEGIN
  SELECT count(*) INTO v_zbyva
    FROM public.profiles p
   WHERE (p.name IS NULL OR btrim(p.name) = '')
     AND EXISTS (
       SELECT 1 FROM public.body_metrics bm
        WHERE bm.user_id = p.id
          AND bm.name IS NOT NULL
          AND btrim(bm.name) <> ''
     );
  IF v_zbyva > 0 THEN
    RAISE EXCEPTION 'backfill profiles.name nedoběhl: % účtů má jméno v body_metrics a prázdné v profiles', v_zbyva;
  END IF;
END $$;
