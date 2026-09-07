-- Smazaný účet se tváří jako spadlá registrace — docs/DALSI_KROK.md 9.2.
--
-- 7. 9. 2026, hodinu po nasazení cizího klíče na ai_generated_plans (9.1/E):
-- smazání 16 testovacích účtů rozsvítilo warning `registrations_viselec`
-- „Registrace ulozena, ucet nevznikl" — přesně na těch 16 adres. Alert tvrdí
-- opak toho, co se stalo.
--
-- Řádek v `registrations` po smazání účtu SPRÁVNĚ zůstává (registrace vzniká
-- před účtem, cizí klíč tam nepatří) — mazat ho má aplikační vrstva
-- (api/delete-account.js nově posílá `target_email` do `delete_user_data`).
-- Tahle migrace řeší zbylé dvě věci:
--
--   1. `je_testovaci_email()` nezná gmailové `+` aliasy (janprikopa+r01@...),
--      takže testovací účty bere jako skutečné lidi.
--   2. `registrations_viselec` je bez časového omezení — hlásí donekonečna
--      i registrace, které dávno nejsou živý problém, a skutečný rozbitý
--      flow by mezi nimi zapadl (stejný mechanismus jako falešný critical
--      v 8.19).
--
-- Existující řádky v `registrations` se NEMAŽOU — po zúžení na 7 dní
-- přestanou vadit samy a jsou jediná stopa, že ty registrace proběhly.

-- ---------------------------------------------------------------------------
-- 1. je_testovaci_email zná +aliasy testovacích účtů.
--
-- Testuje se běžně přes janprikopa+u01@gmail.com, +r02, +t05... Značka je
-- písmeno t/r/u NÁSLEDOVANÉ ČÍSLICÍ, nebo slovo „test". Zadání říká „začíná
-- na t, r, u nebo test" — bez vyžadované číslice by ale pravidlo spolklo
-- i skutečné aliasy jako jana+urgent@ nebo petr+todo@, a hlídka by pak
-- přehlédla skutečnou spadlou registraci. Číslice za písmenem je to, co
-- odlišuje testovací sérii od lidského štítku (a „test" by jinak byl
-- podmnožinou „t", tedy zbytečné slovo v zadání).
--
-- Schválně tu NENÍ natvrdo žádná konkrétní adresa — čí e-mail se testuje,
-- je konfigurace osoby, ne pravidlo systému.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.je_testovaci_email(email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE PARALLEL SAFE STRICT
SET search_path TO ''
AS $function$
  SELECT
    email ~* '^(info|smoketest)\+[^@]+@bodyandmindon\.cz$'
    OR email ~* '@(example\.(com|org|net)|test\.invalid)$'
    OR email ~* '^bm-smoke-[^@]*@'
    OR email ~* '^[^@+]+\+((t|r|u)[0-9]|test)[^@]*@';
$function$;

COMMENT ON FUNCTION public.je_testovaci_email(text) IS
  'Testovaci adresy: info+/smoketest+ na bodyandmindon.cz, example.*/test.invalid, bm-smoke-*, a od 9.2 i +aliasy se znackou t/r/u+cislice nebo test (janprikopa+u01@gmail.com). Bez cislice by pravidlo spolklo i lidske aliasy (+urgent, +todo). docs/DALSI_KROK.md 9.2.';

DO $$
BEGIN
  -- Nové chování: číslovaná série je testovací...
  IF NOT public.je_testovaci_email('janprikopa+u01@gmail.com') THEN
    RAISE EXCEPTION 'janprikopa+u01@gmail.com ma byt testovaci';
  END IF;
  IF NOT public.je_testovaci_email('janprikopa+r02@gmail.com') THEN
    RAISE EXCEPTION 'janprikopa+r02@gmail.com ma byt testovaci';
  END IF;
  IF NOT public.je_testovaci_email('nekdo+test-onboarding@gmail.com') THEN
    RAISE EXCEPTION 'znacka test* ma byt testovaci';
  END IF;
  -- ...ale adresa bez značky ani lidský alias testovací NEJSOU.
  IF public.je_testovaci_email('janprikopa@gmail.com') THEN
    RAISE EXCEPTION 'janprikopa@gmail.com (bez znacky) NESMI byt testovaci';
  END IF;
  IF public.je_testovaci_email('jana+urgent@gmail.com') THEN
    RAISE EXCEPTION 'lidsky alias +urgent NESMI byt testovaci';
  END IF;
  -- Původní pravidla přežila přepis.
  IF NOT public.je_testovaci_email('info+bm-r01@bodyandmindon.cz') THEN
    RAISE EXCEPTION 'info+ na bodyandmindon.cz ma zustat testovaci';
  END IF;
  IF NOT public.je_testovaci_email('kdokoli@example.com') THEN
    RAISE EXCEPTION 'example.com ma zustat testovaci';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. registrations_viselec hlásí jen registrace z posledních 7 dnů.
--
-- Pohled neumí rozlišit „účet smazán" od „účet nevznikl" — a nemá jak,
-- registrace na účet žádný klíč nemá. Časové okno z toho dělá hlídku
-- ŽIVÉHO problému: spadlý registrační flow se projeví do minut, ne po
-- týdnech.
--
-- TĚLO POHLEDU SE NEPŘEPISUJE RUČNĚ — aktuální definice přes pg_get_viewdef,
-- mění se VÝHRADNĚ větev registrations_viselec (postup viz migrace
-- 20260907110000). KOTVA: WHERE téhle větve je textově stejné jako u
-- `registrace_selhava`, liší se až pokračováním — viselec jde rovnou do
-- HAVING count(*) > 0, selhava má mezi nimi GROUP BY r.email. Anchor proto
-- zahrnuje obojí a selhavy se nedotkne.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  puvodni text;
  nova    text;
  shod    integer;
BEGIN
  IF to_regclass('public.system_health_alerts_zaklad') IS NULL THEN
    RAISE EXCEPTION 'system_health_alerts_zaklad neexistuje — migrace by tise neudelala nic';
  END IF;

  puvodni := pg_get_viewdef('public.system_health_alerts_zaklad'::regclass, true);

  IF puvodni LIKE '%ucet nevznikl (poslednich 7 dni)%' THEN
    RAISE NOTICE 'vetev registrations_viselec uz je opravena, preskakuji';
  ELSE
    -- Okno 7 dnů do WHERE (jen větev s HAVING count(*) > 0 hned za WHERE).
    SELECT count(*) INTO shod FROM regexp_matches(
      puvodni,
      'WHERE pr\.id IS NULL AND NOT je_testovaci_email\(r\.email\)\s+HAVING count\(\*\) > 0',
      'g');
    IF shod <> 1 THEN
      RAISE EXCEPTION 'vetev registrations_viselec nenalezena presne 1x (nalezeno %x) — tvar v produkci nesedi, oprav anchor podle pg_get_viewdef', shod;
    END IF;

    nova := regexp_replace(
      puvodni,
      '(WHERE pr\.id IS NULL AND NOT je_testovaci_email\(r\.email\))(\s+HAVING count\(\*\) > 0)',
      '\1 AND r.created_at > (now() - ''7 days''::interval)\2');

    -- Popis ať říká, co větev skutečně hlídá.
    SELECT count(*) INTO shod FROM regexp_matches(
      nova,
      '''Registrace ulozena, ucet nevznikl''::text',
      'g');
    IF shod <> 1 THEN
      RAISE EXCEPTION 'popis vetve registrations_viselec nenalezen presne 1x (nalezeno %x)', shod;
    END IF;

    nova := regexp_replace(
      nova,
      '''Registrace ulozena, ucet nevznikl''::text',
      '''Registrace ulozena, ucet nevznikl (poslednich 7 dni)''::text');

    -- SECURITY_INVOKER SE OBNOVUJE EXPLICITNE — CREATE OR REPLACE VIEW ho
    -- jinak prepise na vychozi a pohled by obchazel RLS zdrojovych tabulek.
    EXECUTE 'CREATE OR REPLACE VIEW public.system_health_alerts_zaklad '
         || 'WITH (security_invoker = true) AS ' || nova;
  END IF;
END $$;

-- ===========================================================================
-- Kontroly
-- ===========================================================================
DO $$
DECLARE
  v_definice text;
  v_radku    integer;
BEGIN
  v_definice := pg_get_viewdef('public.system_health_alerts_zaklad'::regclass, true);

  IF v_definice NOT LIKE '%ucet nevznikl (poslednich 7 dni)%' THEN
    RAISE EXCEPTION 'vetev registrations_viselec nedostala casove okno';
  END IF;

  IF v_definice !~ 'r\.created_at > \(now\(\) - ''7 days''::interval\)' THEN
    RAISE EXCEPTION 'okno 7 dnu se do WHERE nepropsalo';
  END IF;

  -- registrace_selhava (HAVING count(*) >= 2) zůstala netknutá — hlídá
  -- něco jiného a funguje.
  IF v_definice NOT LIKE '%GROUP BY r.email%' OR v_definice !~ 'HAVING count\(\*\) >= 2' THEN
    RAISE EXCEPTION 'patch se dotkl vetve registrace_selhava — to nesmel';
  END IF;

  -- Ostatní větve musí zůstat na místě (namátkou, jako v 20260907110000).
  IF v_definice NOT LIKE '%uzivatel_bez_planu%' THEN
    RAISE EXCEPTION 'pri prepisu se ztratily ostatni vetve watchdogu';
  END IF;

  -- Pohled musí dál vracet data, ne spadnout na změněném tvaru.
  SELECT count(*) INTO v_radku FROM public.system_health_alerts;
  RAISE NOTICE 'Watchdog: registrations_viselec ma okno 7 dni, system_health_alerts vraci % radku.', v_radku;
END $$;
