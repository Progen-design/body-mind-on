-- Withings callback: zaznam vysledku + hlidka na tichy pad.
--
-- CO SE STALO 13. 8. 2026. Uzivatel dvakrat (23:51 a 23:52) prosel Withings
-- OAuth. `connect` vratil 200, `callback` vratil 302 — a `withings_connections`
-- zustala prazdna. V `withings_oauth_states` jsou OBA state radky spotrebovane
-- (consumed_at 23:51:31 a 23:52:39), takze callback dobehl az za overeni state
-- a spadl nekde mezi vymenou kodu za token a ulozenim spojeni.
--
-- KTERY Z TECH DVOU KROKU TO BYL, SE NEDALO ZJISTIT. Callback sve chyby hlasi
-- jen do `console.error`, a z produkcnich runtime logu se nepodarilo vytahnout
-- jediny radek z `console.*` — ani pro endpointy, ktere prokazatelne loguji pri
-- kazdem behu. Diagnostika tedy nesmi stat na stdout funkce.
--
-- PROTO SE VYSLEDEK CALLBACKU UKLADA DO DB. Ze stejneho radku pak cte hlidka
-- `withings_callback_selhal`. Bez ni je tichy pad neviditelny — stejna trida
-- chyby jako prekladovy cron, ktery pet dni padal a CI bylo zelene.

CREATE TABLE IF NOT EXISTS public.withings_callback_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Muze byt NULL: pri `denied` nebo pri rozbitem state uzivatele neznáme.
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  status text NOT NULL,
  -- Krok, ve kterem to skoncilo. Prave tohle chybelo 13. 8.
  stage text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT withings_callback_events_status_check
    CHECK (status = ANY (ARRAY[
      'connected',
      'connected_sync_pending',
      'denied',
      'error',
      'bad_request'
    ])),
  CONSTRAINT withings_callback_events_stage_check
    CHECK (stage IS NULL OR stage = ANY (ARRAY[
      'oauth_denied',
      'missing_code_or_state',
      'consume_state',
      'token_exchange',
      'save_connection',
      'initial_sync',
      'done'
    ]))
);

CREATE INDEX IF NOT EXISTS idx_withings_callback_events_time
  ON public.withings_callback_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withings_callback_events_user_time
  ON public.withings_callback_events (user_id, created_at DESC);

COMMENT ON TABLE public.withings_callback_events IS
  'Vysledek kazdeho pruchodu /api/withings/callback. Zapisuje server (service_role). Zdroj pro hlidku withings_callback_selhal — na runtime logy se spolehnout nedalo.';
COMMENT ON COLUMN public.withings_callback_events.stage IS
  'Krok, ve kterem callback skoncil. Rozlisuje token_exchange od save_connection — presne to, co 13. 8. 2026 neslo zjistit.';

-- RLS zapnuta, zadna politika: pise i cte vyhradne server pres service_role,
-- ktery RLS obchazi. Stejny rezim jako `stripe_events`. Radky nesou provozni
-- diagnostiku, ne obsah pro uzivatele.
ALTER TABLE public.withings_callback_events ENABLE ROW LEVEL SECURITY;

-- ── Hlidka ──────────────────────────────────────────────────────────────────
-- Bere doslova zadani: cokoli jineho nez `connected` je problem.
-- `connected_sync_pending` se tedy hlasi taky — spojeni sice vzniklo, ale prvni
-- sync selhal, takze uzivatel data nevidi a bez hlidky by se to neresilo.
DO $$
DECLARE
  puvodni text;
  nova    text;
  vetev   text := E'        UNION ALL\n'
    || E'         SELECT ''critical''::text,\n'
    || E'            ''withings_callback_selhal''::text,\n'
    || E'            ''Withings callback skoncil jinak nez connected (poslednich 24 h)''::text,\n'
    || E'            string_agg(DISTINCT e.status || COALESCE('' @ '' || e.stage, '''')\n'
    || E'                       || COALESCE('': '' || "left"(e.error_message, 80), ''''), ''; ''::text),\n'
    || E'            count(*)\n'
    || E'           FROM public.withings_callback_events e\n'
    || E'          WHERE e.status <> ''connected''\n'
    || E'            AND e.created_at > (now() - interval ''24 hours'')\n'
    || E'         HAVING count(*) > 0\n';
BEGIN
  IF to_regclass('public.system_health_alerts') IS NULL THEN
    RAISE NOTICE 'system_health_alerts neexistuje, preskakuji';
    RETURN;
  END IF;

  puvodni := pg_get_viewdef('public.system_health_alerts'::regclass, true);

  IF puvodni LIKE '%withings_callback_selhal%' THEN
    RAISE NOTICE 'vetev withings_callback_selhal uz existuje, preskakuji';
    RETURN;
  END IF;

  nova := regexp_replace(puvodni, '\)\s*alerts;\s*$', vetev || ') alerts;');

  IF nova = puvodni THEN
    RAISE EXCEPTION 'nenasel jsem konec definice view — vetev se nepridala';
  END IF;

  -- security_invoker explicitne: CREATE OR REPLACE VIEW bez WITH reloptions
  -- neprebira a view by o nej znovu prislo (viz 20260813214759).
  EXECUTE 'CREATE OR REPLACE VIEW public.system_health_alerts '
       || 'WITH (security_invoker = true) AS ' || nova;
END $$;

COMMENT ON VIEW public.system_health_alerts IS
  'Prehled poruch pro denni alert. Vetev withings_callback_selhal pridana 14. 8. 2026: callback vracel 302 a mlcel, spojeni nevznikalo a z runtime logu to nebylo poznat.';
