-- Prázdný pool importu je problém, ne informace — docs/DALSI_KROK.md 9.3.
--
-- Spoonacular import neběžel 18 dní (poslední běh 20. 8. 2026) a hlídka
-- mlčela, protože se dvě větve navzájem umlčely:
--
--   - `import_rotace_vycerpana` má severity `info` — „není co importovat".
--   - `import_nebezel` (warning) se přes EXISTS podmínku VYPÍNÁ, právě když
--     je pool dotazů prázdný — tedy přesně tehdy, kdy import stojí.
--
-- Stejný vzorec jako falešný `critical` u 8.19, jen obráceně: tam křičelo
-- něco funkčního, tady mlčí něco rozbitého.
--
-- TĚLO POHLEDU SE NEPŘEPISUJE RUČNĚ. `system_health_alerts_zaklad` má přes
-- dvacet větví — bere se aktuální definice přes `pg_get_viewdef`, mění se
-- VÝHRADNĚ větve `import_rotace_vycerpana` a `import_nebezel` a zbytek
-- zůstává znak po znaku stejný (postup viz migrace 20260907110000).
--
-- KOTVY. Obě větve naposledy definovala migrace 20260820150000 (rotace) a
-- žádná pozdější je neupravila — kanonický tvar níž je ověřený proti
-- aktuálnímu `pg_get_viewdef` z produkce (7. 9. 2026). Rozlišovací detail:
-- `import_nebezel` používá alias `q`, `import_rotace_vycerpana` alias `q2`,
-- takže regex s `q\.` trefí jen jednu z nich.

-- ---------------------------------------------------------------------------
-- 1. Funkce: má pool aspoň jeden použitelný dotaz?
--
-- Samostatná funkce místo vnořeného sub-selectu v pohledu — drží regex patch
-- krátký a jednoznačný (stejný důvod jako u
-- posledni_beh_generatoru_ocekavane_ticho v migraci 20260907110000).
-- „Použitelný" = stejná definice, jakou používá rotace v
-- lib/spoonacular/importQueryRotation.js: bez exhausted_at a bez retired_reason.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.import_pool_ma_pouzitelne_dotazy()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.spoonacular_import_queries q
    WHERE q.exhausted_at IS NULL AND q.retired_reason IS NULL
  );
$function$;

COMMENT ON FUNCTION public.import_pool_ma_pouzitelne_dotazy() IS
  'True, kdyz ma spoonacular_import_queries aspon jeden dotaz bez exhausted_at a bez retired_reason - tedy rotace ma co delat. Pouziva vetev import_nebezel v system_health_alerts_zaklad pro volbu textu hlasky (docs/DALSI_KROK.md 9.3).';

-- ---------------------------------------------------------------------------
-- 2. Patch větví import_rotace_vycerpana a import_nebezel.
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
  nova := puvodni;

  -- 2a) import_rotace_vycerpana: info -> warning. Když není co importovat,
  -- katalog neroste — to je provozní problém, ne zajímavost.
  IF nova ~ '''warning''::text AS text,\s*''import_rotace_vycerpana''' THEN
    RAISE NOTICE 'import_rotace_vycerpana uz je warning, preskakuji';
  ELSE
    SELECT count(*) INTO shod FROM regexp_matches(
      nova,
      '''info''::text AS text,\s*''import_rotace_vycerpana''::text',
      'g');
    IF shod <> 1 THEN
      RAISE EXCEPTION 'vetev import_rotace_vycerpana nenalezena presne 1x (nalezeno %x) — tvar v produkci nesedi, oprav anchor podle pg_get_viewdef', shod;
    END IF;

    nova := regexp_replace(
      nova,
      '''info''(::text AS text,\s*''import_rotace_vycerpana''::text)',
      '''warning''\1');
  END IF;

  -- 2b) import_nebezel: dnes se přes EXISTS vypíná, když je pool prázdný —
  -- přesně naopak, než má být. Podmínka se odstraní a text hlášky se místo ní
  -- rozdvojí podle stavu poolu.
  IF nova LIKE '%import_pool_ma_pouzitelne_dotazy%' THEN
    RAISE NOTICE 'vetev import_nebezel uz je opravena, preskakuji';
  ELSE
    -- Text hlášky -> CASE podle stavu poolu.
    SELECT count(*) INTO shod FROM regexp_matches(
      nova,
      '''Spoonacular import se 48 h vubec nespustil \(nebo je vycerpany pool dotazu\)''::text',
      'g');
    IF shod <> 1 THEN
      RAISE EXCEPTION 'popis vetve import_nebezel nenalezen presne 1x (nalezeno %x) — oprav anchor podle pg_get_viewdef', shod;
    END IF;

    nova := regexp_replace(
      nova,
      '''Spoonacular import se 48 h vubec nespustil \(nebo je vycerpany pool dotazu\)''::text',
      'CASE WHEN public.import_pool_ma_pouzitelne_dotazy() '
      || 'THEN ''Spoonacular import se 48 h vubec nespustil''::text '
      || 'ELSE ''Spoonacular import 48 h nebezel, pool dotazu je prazdny''::text END');

    -- Umlčovací podmínka pryč. Alias `q` (rotace má `q2`) drží anchor na
    -- jediném místě.
    SELECT count(*) INTO shod FROM regexp_matches(
      nova,
      '\s+AND \(EXISTS \( SELECT 1\s+FROM spoonacular_import_queries q\s+WHERE q\.exhausted_at IS NULL AND q\.retired_reason IS NULL\)\)',
      'g');
    IF shod <> 1 THEN
      RAISE EXCEPTION 'umlcovaci EXISTS vetve import_nebezel nenalezen presne 1x (nalezeno %x) — oprav anchor podle pg_get_viewdef', shod;
    END IF;

    nova := regexp_replace(
      nova,
      '\s+AND \(EXISTS \( SELECT 1\s+FROM spoonacular_import_queries q\s+WHERE q\.exhausted_at IS NULL AND q\.retired_reason IS NULL\)\)',
      '');
  END IF;

  IF nova <> puvodni THEN
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

  IF v_definice !~ '''warning''::text AS text,\s*''import_rotace_vycerpana''' THEN
    RAISE EXCEPTION 'import_rotace_vycerpana neni warning';
  END IF;

  IF v_definice NOT LIKE '%import_pool_ma_pouzitelne_dotazy%' THEN
    RAISE EXCEPTION 'vetev import_nebezel nebyla opravena';
  END IF;

  IF v_definice ~ 'q\.exhausted_at IS NULL AND q\.retired_reason IS NULL' THEN
    RAISE EXCEPTION 'umlcovaci EXISTS v import_nebezel prezil patch';
  END IF;

  -- Práh 48 h i větev rozpočtu zůstaly netknuté.
  IF v_definice NOT LIKE '%48:00:00%' THEN
    RAISE EXCEPTION 'prah 48 h zmizel pri patchi';
  END IF;
  IF v_definice NOT LIKE '%budget_exhausted%' THEN
    RAISE EXCEPTION 'vetev denniho rozpoctu se ztratila';
  END IF;

  -- Ostatní větve musí zůstat na místě (namátkou, jako v 20260907110000).
  IF v_definice NOT LIKE '%uzivatel_bez_planu%' THEN
    RAISE EXCEPTION 'pri prepisu se ztratily ostatni vetve watchdogu';
  END IF;

  -- Pohled musí dál vracet data, ne spadnout na změněném tvaru.
  SELECT count(*) INTO v_radku FROM public.system_health_alerts;
  RAISE NOTICE 'Watchdog: prazdny import pool uz je videt, system_health_alerts vraci % radku.', v_radku;
END $$;
