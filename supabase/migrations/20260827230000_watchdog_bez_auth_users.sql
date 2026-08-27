-- Watchdog nesmi sahat do auth.users.
--
-- PROC. `system_health_alerts` ma security_invoker=true, takze pohled bezi pod
-- volajicim. Cron /api/cron/system-health-alert se pripojuje jako `service_role`
-- a ten na auth.users pravo NEMA — SELECT je tam grantovany jen pro `postgres`.
-- Vysledek: cron padal kazde rano od 23. 8. 2026 na
--   [system-health-alert] view query failed: permission denied for table users
-- a nikdo se nedozvedel, ze generator receptu umrel 24. 8. Hlidka mlcela prave
-- ve chvili, kdy mela kricet. Z MCP se pohled cetl bez problemu, protoze tam
-- jede jina role — proto to pet dni vypadalo zdrave.
--
-- RESENI NENI DAT service_role PRISTUP DO auth.users. Kvuli watchdogu by se
-- otevrela cela autentizacni tabulka. Obe vetve (`plan_obsahuje_anglictinu`
-- a `cvik_v_planu_bez_media`) potrebuji z uzivatele JEN e-mail kvuli
-- je_testovaci_email(). Ten je v public.profiles.
--
-- Overeno 27. 8. 2026: 4 ucty v auth.users, 4 radky v profiles, 0 profilu bez
-- e-mailu, 0 uctu bez profilu. Zamena je tedy bez ztraty zaznamu.
--
-- TELO POHLEDU SE NEPREPISUJE RUCNE. Ma pres dvacet vetvi a rucni prepis je
-- nejlepsi zpusob, jak nekterou ztratit. Bere se pg_get_viewdef a nahrazuje se
-- v nem jen zdroj uzivatele.

DO $$
DECLARE
  v_def text;
  v_pred integer;
  v_po integer;
BEGIN
  v_def := pg_get_viewdef('public.system_health_alerts_zaklad'::regclass, true);

  SELECT count(*) INTO v_pred FROM regexp_matches(v_def, 'auth\.users', 'g');
  IF v_pred = 0 THEN
    RAISE NOTICE 'auth.users se v pohledu nevyskytuje, neni co menit.';
    RETURN;
  END IF;

  v_def := replace(v_def, 'auth.users u', 'public.profiles u');
  v_def := rtrim(btrim(v_def), ';');

  SELECT count(*) INTO v_po FROM regexp_matches(v_def, 'auth\.users', 'g');
  IF v_po > 0 THEN
    RAISE EXCEPTION 'Po nahrazeni zbyva % vyskytu auth.users — jiny alias, oprav rucne.', v_po;
  END IF;

  EXECUTE 'create or replace view public.system_health_alerts_zaklad '
       || 'with (security_invoker=true) as ' || v_def;

  RAISE NOTICE 'Nahrazeno % vyskytu auth.users za public.profiles.', v_pred;
END $$;

-- Kontrola dopadu, ne jen ze migrace probehla.
DO $$
DECLARE
  v_zbyva integer;
  v_radku integer;
BEGIN
  SELECT count(*) INTO v_zbyva
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace,
       LATERAL regexp_matches(pg_get_viewdef(c.oid, true), 'auth\.users', 'g')
  WHERE n.nspname = 'public' AND c.relkind = 'v'
    AND c.relname LIKE 'system_health_alerts%';

  IF v_zbyva > 0 THEN
    RAISE EXCEPTION 'auth.users zustava v % miste watchdogu.', v_zbyva;
  END IF;

  -- Pohled musi dal vracet data, ne spadnout na zmenenem tvaru.
  SELECT count(*) INTO v_radku FROM public.system_health_alerts;
  RAISE NOTICE 'Watchdog vraci % radku.', v_radku;
END $$;
