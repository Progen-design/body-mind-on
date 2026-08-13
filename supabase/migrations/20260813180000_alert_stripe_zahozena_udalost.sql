-- system_health_alerts: hlidka na Stripe udalosti, ktere jsme zahodili.
--
-- PROC. 12. 8. 2026 skoncily dva `customer.subscription.updated` jako
-- `skipped_unknown_price` se statusem `completed`, `error_message` NULL
-- a HTTP 200. Nikde se to neprojevilo. Kdyby to byl platici zakaznik na cene,
-- kterou nemame v env (napr. ON Club), zaplatil by a nedostal nic — a poznali
-- bychom to az z jeho stiznosti.
--
-- DO VIEW SE NEDA VKLADAT RADEK. "Zaloz zaznam do system_health_alerts" proto
-- znamena pridat vetev, ktera cte ze zdrojove tabulky — stejne jako to dela
-- `generovani_selhalo` (product_events) nebo `import_beh_chyba`
-- (spoonacular_import_runs). Zdrojem je `stripe_events`, kde radek uz vznika;
-- jen ho dosud nikdo necetl.
--
-- PROC SE VIEW NEPREPISUJE CELY. Ma 21 vetvi. Rucni prepsani znamena
-- prepsat i tech 20 ostatnich a jediny preklep tise rozbije jiny alert —
-- pri prvnim pokusu jsem jich takhle omylem zahodil tri. Vetev se proto
-- vklada do existujici definice, kterou si Postgres vypise sam.
--
-- Zahrnuty jsou VSECHNY skipped_* stavy, ne jen unknown_price:
-- `skipped_no_membership_match`, `skipped_tier_mismatch`
-- i `skipped_no_expected_tier` znamenaji totez — Stripe nam neco rekl a my
-- jsme to zahodili. Kazdy z nich muze byt zaplaceny clovek bez pristupu.

DO $$
DECLARE
  puvodni text;
  nova    text;
  vetev   text := E'        UNION ALL\n'
    || E'         SELECT ''critical''::text,\n'
    || E'            ''stripe_udalost_zahozena''::text,\n'
    || E'            ''Stripe udalost skoncila jako skipped (poslednich 24 h)''::text,\n'
    || E'            string_agg(DISTINCT COALESCE(se.error_message, se.handler_result), ''; ''::text) AS string_agg,\n'
    || E'            count(*) AS count\n'
    || E'           FROM stripe_events se\n'
    || E'          WHERE se.handler_result LIKE ''skipped_%%''\n'
    || E'            AND se.created_at > (now() - ''24:00:00''::interval)\n'
    || E'         HAVING count(*) > 0\n';
BEGIN
  IF to_regclass('public.system_health_alerts') IS NULL THEN
    RAISE NOTICE 'system_health_alerts neexistuje, preskakuji';
    RETURN;
  END IF;

  puvodni := pg_get_viewdef('public.system_health_alerts'::regclass, true);

  -- Idempotence: druhy beh migrace vetev nepridava podruhe.
  IF puvodni LIKE '%stripe_udalost_zahozena%' THEN
    RAISE NOTICE 'vetev stripe_udalost_zahozena uz existuje, preskakuji';
    RETURN;
  END IF;

  -- Definice konci na ") alerts;" — vetev se vklada tesne pred nej.
  nova := regexp_replace(puvodni, '\)\s*alerts;\s*$', vetev || ') alerts;');

  IF nova = puvodni THEN
    RAISE EXCEPTION 'nenasel jsem konec definice view — vetev se nepridala';
  END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.system_health_alerts AS ' || nova;
END $$;

COMMENT ON VIEW public.system_health_alerts IS
  'Prehled poruch pro denni alert. Vetev stripe_udalost_zahozena pridana 13. 8. 2026: skipped_* udalosti ze stripe_events se do te doby zahazovaly potichu s HTTP 200.';
