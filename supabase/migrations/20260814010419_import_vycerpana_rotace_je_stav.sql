-- Spoonacular import: vycerpana rotace je STAV, ne porucha.
--
-- CO SE DELO. Od 3. 8. 2026 hlasi hlidka `import_nebezel` (warning), ze se
-- import 48 h vubec nespustil. Neni to pravda — cron `/api/cron/import-spoonacular`
-- bezi kazdy den a odpovida 200. Overeno rucnim spustenim 14. 8. v 01:03:
-- vratil `fetched: 0, requestsUsed: 0`, tedy k API vubec nesel.
--
-- DUVOD: v `spoonacular_import_queries` je 36 dotazu a VSECH 36 ma
-- `exhausted_at` (33 z nich navic `retired_reason`). Pouzitelnych je NULA.
-- Import nema na co se ptat, takze neudela zadne API volani — a protoze radek
-- do `spoonacular_import_runs` se pise az u volani, nevznikne ani zaznam behu.
-- Hlidka meri pritomnost radku, tedy neco jineho, nez tvrdi.
--
-- ROZDIL, KTERY TA HLIDKA MUSI UMET:
--   rotace ma co nabidnout + neni beh   → PORUCHA (cron nejede)      warning
--   rotace je vycerpana                 → STAV (neni co importovat)  info
--
-- Bez toho hlidka kricela 11 dni na neco, co neni rozbite — a az se import
-- opravdu rozbije, uz si toho nikdo nevsimne.
--
-- CO SE TIM NERESI: ze je rotace prazdna. To je produktove rozhodnuti
-- (doplnit dotazy, nebo import ukoncit), ne vada. Hlidka to nove rekne
-- nahlas jako stav, aby to bylo videt a dalo se rozhodnout.

DO $$
DECLARE
  puvodni text;
  nova    text;
  vyskytu int;
  stare   text := 'HAVING max(r.started_at) IS NULL OR max(r.started_at) < (now() - ''48:00:00''::interval)';
  nove    text := 'HAVING (max(r.started_at) IS NULL OR max(r.started_at) < (now() - ''48:00:00''::interval))'
    || E'\n            AND EXISTS (SELECT 1 FROM public.spoonacular_import_queries q'
    || E'\n                         WHERE q.exhausted_at IS NULL AND q.retired_reason IS NULL)';
  vetev   text := E'        UNION ALL\n'
    || E'         SELECT ''info''::text,\n'
    || E'            ''import_rotace_vycerpana''::text,\n'
    || E'            ''Spoonacular rotace dotazu je vycerpana - neni co importovat''::text,\n'
    || E'            count(*)::text || ''x vycerpany dotaz, 0 pouzitelnych'',\n'
    || E'            count(*)\n'
    || E'           FROM public.spoonacular_import_queries q\n'
    || E'          WHERE q.exhausted_at IS NOT NULL OR q.retired_reason IS NOT NULL\n'
    || E'         HAVING count(*) > 0\n'
    || E'            AND NOT EXISTS (SELECT 1 FROM public.spoonacular_import_queries q2\n'
    || E'                             WHERE q2.exhausted_at IS NULL AND q2.retired_reason IS NULL)\n';
BEGIN
  IF to_regclass('public.system_health_alerts') IS NULL THEN
    RAISE NOTICE 'system_health_alerts neexistuje, preskakuji';
    RETURN;
  END IF;

  puvodni := pg_get_viewdef('public.system_health_alerts'::regclass, true);

  IF puvodni LIKE '%import_rotace_vycerpana%' THEN
    RAISE NOTICE 'uz zavedeno, preskakuji';
    RETURN;
  END IF;

  -- `max(r.started_at)` je v celem view jen ve vetvi import_nebezel
  -- (generator_nedodava pouziva alias rc). Kdyby to prestalo platit, migrace
  -- spadne tady misto aby tise upravila jinou vetev.
  vyskytu := (length(puvodni) - length(replace(puvodni, stare, ''))) / length(stare);
  IF vyskytu <> 1 THEN
    RAISE EXCEPTION 'cekal jsem 1 vyskyt HAVING vetve import_nebezel, nasel %', vyskytu;
  END IF;

  nova := replace(puvodni, stare, nove);
  nova := regexp_replace(nova, '\)\s*alerts;\s*$', vetev || ') alerts;');

  IF nova = puvodni THEN
    RAISE EXCEPTION 'definice view se nezmenila';
  END IF;

  -- security_invoker explicitne (viz 20260813214759).
  EXECUTE 'CREATE OR REPLACE VIEW public.system_health_alerts '
       || 'WITH (security_invoker = true) AS ' || nova;
END $$;

COMMENT ON VIEW public.system_health_alerts IS
  'Prehled poruch pro denni alert. Od 14. 8. 2026: import_nebezel hlasi jen skutecnou poruchu (rotace ma co nabidnout, ale beh chybi); vycerpana rotace se hlasi zvlast jako info import_rotace_vycerpana.';
