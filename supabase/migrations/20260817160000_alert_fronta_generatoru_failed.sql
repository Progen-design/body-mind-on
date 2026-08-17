-- system_health_alerts: hlidka na hromadeni spadlych objednavek generatoru.
--
-- PROC. 17. 8. 2026 lezelo v recipe_generation_queue 70 polozek ve stavu
-- 'failed' s hlaskou 'nic nezapsano'. Skutecna pricina byla
-- 429 credit_balance_exhausted — OpenAI dosel kredit uz 15. 8. vecer a od te
-- chvile kazda objednavka spadla jeste pred volanim modelu. Dva dny se
-- negeneroval jediny recept a nic to nehlasilo: existujici vetev
-- `fronta_generatoru_stoji` hlida jen polozky ve stavu 'pending' starsi 48 h,
-- takze na frontu, ktera se rychle prelila do 'failed', vubec nedosahne.
--
-- PRAH 20. Jednotlive 'failed' je bezny provoz — model obcas vrati recept mimo
-- kaloricke pasmo a objednavka se zahodi pravem. Dvacet uz znamena, ze pada
-- neco spolecneho: kredit, klic, vypadek API nebo rozbity prompt.
--
-- SEVERITY WARNING, ne critical. Uzivatel s aktivnim planem dotcen neni, plany
-- se sestavuji z uz existujiciho katalogu. Dochazi ale pestrost a to je potreba
-- videt driv, nez si toho vsimne trener.
--
-- DETAIL NESE NEJCASTEJSI CHYBU. Bez ni je hlaseni "20 polozek failed" stejne
-- slepe jako puvodni 'nic nezapsano' — prave o tom, ze se prava pricina
-- nikam nedostala, tahle migrace je.
--
-- VIEW SE NEPREPISUJE CELY: ma pres dvacet vetvi a jediny preklep tise rozbije
-- jinou hlidku. Vetev se vklada do existujici definice, kterou si Postgres
-- vypise sam — stejny postup jako 20260813183836.

DO $$
DECLARE
  puvodni text;
  nova    text;
  vetev   text := E'        UNION ALL\n'
    || E'         SELECT ''warning''::text,\n'
    || E'            ''fronta_generatoru_failed''::text,\n'
    || E'            ''Objednavky generatoru padaji — vic nez 20 ve stavu failed''::text,\n'
    || E'            ''nejcastejsi: '' || COALESCE(mode() WITHIN GROUP (ORDER BY q.posledni_chyba), ''bez chyby'') AS text,\n'
    || E'            count(*) AS count\n'
    || E'           FROM recipe_generation_queue q\n'
    || E'          WHERE q.stav = ''failed''\n'
    || E'         HAVING count(*) > 20\n';
BEGIN
  IF to_regclass('public.system_health_alerts') IS NULL THEN
    RAISE NOTICE 'system_health_alerts neexistuje, preskakuji';
    RETURN;
  END IF;

  puvodni := pg_get_viewdef('public.system_health_alerts'::regclass, true);

  -- Idempotence: druhy beh migrace vetev nepridava podruhe.
  IF puvodni LIKE '%fronta_generatoru_failed%' THEN
    RAISE NOTICE 'vetev fronta_generatoru_failed uz existuje, preskakuji';
    RETURN;
  END IF;

  nova := regexp_replace(puvodni, '\)\s*alerts;\s*$', vetev || ') alerts;');

  IF nova = puvodni THEN
    RAISE EXCEPTION 'nenasel jsem konec definice view — vetev se nepridala';
  END IF;

  -- security_invoker se pri CREATE OR REPLACE VIEW bez klauzule WITH ztraci
  -- (viz 20260813214759). Nastavuje se proto znovu.
  EXECUTE 'CREATE OR REPLACE VIEW public.system_health_alerts WITH (security_invoker = true) AS ' || nova;
END $$;

COMMENT ON VIEW public.system_health_alerts IS
  'Prehled poruch pro denni alert. Vetev fronta_generatoru_failed pridana 17. 8. 2026: 70 spadlych objednavek generatoru po vycerpani OpenAI kreditu nikde nesvitilo.';
