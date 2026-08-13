-- system_health_alerts: registracni hlidky prestanou hlasit vlastni testy.
--
-- PROC. `registrations_viselec` hlasi "registrace ulozena, ucet nevznikl".
-- Jenze presne to po sobe nechaval kazdy beh `npm run verify:paid-path`:
-- uklid mazal ai_tasks, ai_generated_plans, memberships,
-- start_workout_progression, body_metrics a auth uzivatele, ale radek
-- v `registrations` ne — ta se vaze e-mailem, ne user_id. K 13. 8. 2026 tam
-- takhle lezely 4 osirele registrace (info+bm-paid-*, 10.-12. 8.) a hlidka
-- kricela pri kazdem behu ovreovaciho skriptu.
--
-- Hlidka, ktera pravidelne kricí bez priciny, se prestane cist — a az
-- vyskoci doopravdy, nikdo si ji nevsimne. Uklid skriptu je opraveny zvlast
-- (scripts/verify-paid-path.mjs); tady se resi, aby stejny vzor uz hlidku
-- nespoustel ani pri pristich testech.
--
-- STEJNY FILTR DOSTAVA I `registrace_selhava` (critical). Cte doslova tentyz
-- osirely join, jen navic vyzaduje >= 2 pokusy o stejny e-mail. Testovaci
-- e-maily maji v sobe timestamp, takze se zatim neopakovaly — ale kterykoli
-- skript, ktery zkusi registraci dvakrat, by rozsvitil critical. Filtrovat
-- jednu vetev a druhou ne by znamenalo nechat tam tutez minu.
--
-- CO SE NEFILTRUJE: nic jineho. Vzor je uzce vazany na nase vlastni domeny
-- a rezervovane testovaci TLD, takze skutecny zakaznik pod nej nespadne.
--
-- BONUS OPRAVA: view od migrace 20260805130000 ztratil `security_invoker`.
-- `CREATE OR REPLACE VIEW ... AS` bez klauzule WITH totiz reloptions
-- nezachovava, prepise je na vychozi. View tim od 5. 8. 2026 bezel s pravy
-- vlastnika a obchazel RLS zdrojovych tabulek. Obnovuje se to tady, protoze
-- view stejne prepisujeme.

-- ── Vzor testovaciho e-mailu ────────────────────────────────────────────────
-- Jeden zdroj pravdy pro vsechny hlidky. Odpovida tomu, co skutecne generuji
-- skripty v scripts/: info+bm-paid-*, info+bm-smoke-*, info+beta-*,
-- info+restore-*, info+stripe-preview-* (vsechny na nasi domene),
-- smoketest+* (admin:delete-smoketest-users), bm-smoke-*@example.com
-- a stripe.e2e@test.invalid z e2e-stripe-subscription-test.mjs.
CREATE OR REPLACE FUNCTION public.je_testovaci_email(email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT
    -- plus-adresovane testy na nasi vlastni domene
    email ~* '^(info|smoketest)\+[^@]+@bodyandmindon\.cz$'
    -- vyhrazene testovaci domeny (RFC 2606 / RFC 6761)
    OR email ~* '@(example\.(com|org|net)|test\.invalid)$'
    -- smoke-test generator pouziva i jine domeny
    OR email ~* '^bm-smoke-[^@]*@';
$$;

COMMENT ON FUNCTION public.je_testovaci_email(text) IS
  'True pro e-maily, ktere zaklada nas vlastni testovaci nastroj. Pouzivaji hlidky v system_health_alerts, aby nehlasily nasi vlastni stopu.';

-- ── Zavedeni filtru do obou registracnich vetvi ─────────────────────────────
-- View ma 21 vetvi. Rucni prepsani cele definice uz jednou tise rozbilo tri
-- jine alerty (viz 20260813183836), takze se znovu upravuje jen to, co je
-- potreba, v definici, kterou si Postgres vypise sam.
DO $$
DECLARE
  puvodni text;
  nova    text;
  vyskytu int;
BEGIN
  IF to_regclass('public.system_health_alerts') IS NULL THEN
    RAISE NOTICE 'system_health_alerts neexistuje, preskakuji';
    RETURN;
  END IF;

  puvodni := pg_get_viewdef('public.system_health_alerts'::regclass, true);

  -- Idempotence: druhy beh migrace filtr nepridava podruhe.
  IF puvodni LIKE '%je_testovaci_email%' THEN
    RAISE NOTICE 'filtr testovacich e-mailu uz je zaveden, preskakuji';
    RETURN;
  END IF;

  -- `pr.id IS NULL` je v celem view prave dvakrat a obakrat je to presne ten
  -- osirely join registrations -> profiles. Kdyby to nekdy prestalo platit,
  -- migrace spadne nize na kontrole poctu misto aby tise upravila neco jineho.
  vyskytu := (length(puvodni) - length(replace(puvodni, 'WHERE pr.id IS NULL', ''))) / length('WHERE pr.id IS NULL');
  IF vyskytu <> 2 THEN
    RAISE EXCEPTION 'cekal jsem 2 vyskyty "WHERE pr.id IS NULL", nasel %, definice view se zmenila', vyskytu;
  END IF;

  nova := replace(
    puvodni,
    'WHERE pr.id IS NULL',
    'WHERE pr.id IS NULL AND NOT public.je_testovaci_email(r.email)'
  );

  -- security_invoker se obnovuje explicitne — bez nej by se ztratil znovu.
  EXECUTE 'CREATE OR REPLACE VIEW public.system_health_alerts '
       || 'WITH (security_invoker = true) AS ' || nova;
END $$;

COMMENT ON VIEW public.system_health_alerts IS
  'Prehled poruch pro denni alert. Registracni vetve (registrations_viselec, registrace_selhava) od 13. 8. 2026 ignoruji testovaci e-maily podle public.je_testovaci_email(); soucasne obnoven security_invoker, ktery se ztratil pri prepisu 5. 8. 2026.';
