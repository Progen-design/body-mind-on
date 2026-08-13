-- KROK 4: hlídka na ticho v datech ze zařízení.
--
-- PROČ. Zařízení posílají data, ale dnes by nikdo nepoznal, že přestala.
-- Připojení zůstane „aktivní", `last_sync_at` prostě zamrzne a odvozená váha
-- se po 14 dnech tiše přepne na null — což je záměrné (cíl se nemění), ale
-- znamená to, že celý řetěz od měření k cíli přestane fungovat a nikde to
-- nebude vidět. Stejná třída chyby jako překladový cron, který pět dní padal
-- a CI bylo zelené.
--
-- Sleduje se mlčení ZAŘÍZENÍ, ne uživatele: ruční vážení se schválně nepočítá.
-- Když má člověk připojenou váhu a týden z ní nic nepřišlo, je rozbité
-- připojení — i kdyby se mezitím vážil ručně.
--
-- Připojení mladší sedmi dnů se nehlásí. Nemělo ještě celý týden na to, aby
-- něco poslalo, a hlídka, která křičí na čerstvé připojení, je hlídka, která
-- se přestane číst (viz registrations_viselec o dva dny dřív).
--
-- Testovací e-maily se filtrují stejnou funkcí jako registrační větve.

DO $$
DECLARE
  puvodni text;
  nova    text;
  vetev   text := E'        UNION ALL\n'
    || E'         SELECT ''warning''::text,\n'
    || E'            ''zarizeni_mlci''::text,\n'
    || E'            ''Aktivni pripojeni zarizeni, ale 7 dni zadne mereni''::text,\n'
    || E'            string_agg(DISTINCT z.popis, '', ''::text),\n'
    || E'            count(DISTINCT z.user_id)\n'
    || E'           FROM (\n'
    || E'             SELECT c.user_id,\n'
    || E'                    COALESCE(pr.email, pr.id::text) || '' ('' || c.zdroj || '')'' AS popis\n'
    || E'               FROM (\n'
    || E'                 SELECT w.user_id, ''withings''::text AS zdroj, w.connected_at\n'
    || E'                   FROM public.withings_connections w\n'
    || E'                  WHERE (w.refresh_token_expires_at IS NULL OR w.refresh_token_expires_at > now())\n'
    || E'                 UNION ALL\n'
    || E'                 SELECT a.user_id, ''apple_health''::text, a.connected_at\n'
    || E'                   FROM public.apple_health_connections a\n'
    || E'                  WHERE a.status = ''active'' AND a.revoked_at IS NULL\n'
    || E'               ) c\n'
    || E'               JOIN public.profiles pr ON pr.id = c.user_id\n'
    || E'              WHERE c.connected_at < (now() - interval ''7 days'')\n'
    || E'                AND NOT public.je_testovaci_email(pr.email)\n'
    || E'                AND NOT EXISTS (\n'
    || E'                      SELECT 1 FROM public.body_measurements bm\n'
    || E'                       WHERE bm.user_id = c.user_id\n'
    || E'                         AND bm.source = c.zdroj\n'
    || E'                         AND bm.weight_kg IS NOT NULL\n'
    || E'                         AND bm.measured_at > (now() - interval ''7 days'')\n'
    || E'                    )\n'
    || E'           ) z\n'
    || E'         HAVING count(*) > 0\n';
BEGIN
  IF to_regclass('public.system_health_alerts') IS NULL THEN
    RAISE NOTICE 'system_health_alerts neexistuje, preskakuji';
    RETURN;
  END IF;

  puvodni := pg_get_viewdef('public.system_health_alerts'::regclass, true);

  -- Idempotence: druhy beh migrace vetev nepridava podruhe.
  IF puvodni LIKE '%zarizeni_mlci%' THEN
    RAISE NOTICE 'vetev zarizeni_mlci uz existuje, preskakuji';
    RETURN;
  END IF;

  nova := regexp_replace(puvodni, '\)\s*alerts;\s*$', vetev || ') alerts;');

  IF nova = puvodni THEN
    RAISE EXCEPTION 'nenasel jsem konec definice view — vetev se nepridala';
  END IF;

  -- security_invoker se uvadi explicitne: CREATE OR REPLACE VIEW bez klauzule
  -- WITH reloptions neprebira a view by o nej znovu prislo (viz 20260813214759).
  EXECUTE 'CREATE OR REPLACE VIEW public.system_health_alerts '
       || 'WITH (security_invoker = true) AS ' || nova;
END $$;

COMMENT ON VIEW public.system_health_alerts IS
  'Prehled poruch pro denni alert. Vetev zarizeni_mlci pridana 13. 8. 2026: aktivni pripojeni zarizeni bez mereni 7 dni znamena, ze retez od vazeni ke kalorickemu cili je preruseny.';
