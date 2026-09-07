-- Hlídka křičí critical na něco, co funguje — docs/DALSI_KROK.md 8.19 část A.
--
-- Pohled `system_health_alerts` hlásí `critical`: „Generator nevyrobil zadny
-- recept 20 h". Skutečnost z `ai_runs` (purpose = 'recipe_generator_beh'):
--
--   6. 9. 03:18   zapsano 12, zahozeno 93   (bezel)
--   6. 9. 11:15   reason: denni_strop_vycerpan, skipped: true
--   6. 9. 19:15   reason: denni_strop_vycerpan, skipped: true
--
-- Generátor NESPADL — narazil na denní strop (`RECIPE_GEN_MAX_PER_DAY`,
-- `vyrobenoZa24h()` v lib/recipeGenerator.js) a běh se korektně přeskočil.
-- To je navržené chování, ne porucha, ale hlídka to hlásí jako `critical` —
-- a falešný poplach na kritické úrovni je horší než žádný: `critical`
-- v systému přestává něco znamenat, a až generátor OPRAVDU spadne, nikdo
-- si toho nevšimne.
--
-- TĚLO POHLEDU SE NEPŘEPISUJE RUČNĚ. `system_health_alerts_zaklad` má přes
-- dvacet větví (stejná poznámka jako u migrace 20260827230000_watchdog_bez_
-- auth_users.sql) — bere se aktuální definice přes `pg_get_viewdef` a mění
-- se v ní jen `generator_nedodava`, zbytek zůstává znak po znaku stejný.
--
-- KOTVA. `generator_nedodava` byla naposledy upravená migrací
-- 20260826100000_generator_mlceni_je_porucha.sql, která práh zkrátila
-- z 48 h na 20 h (a text popisu z „48 h" na „20 h") — přesně tenhle
-- kanonický tvar (`pg_get_viewdef` normalizuje `interval '48 hours'` na
-- `'48:00:00'::interval`) je anchor níž. Žádná pozdější migrace už
-- `generator_nedodava` neupravila (ověřeno: 20260827230000 mění jen zdroj
-- e-mailu ve VŠECH větvích najednou, 20260828100000 přidává úplně novou
-- větev `utrata_stoji` a nesahá na `_zaklad` vůbec).

-- ---------------------------------------------------------------------------
-- 1. Funkce: vysvětluje poslední běh generátoru ticho, nebo ne?
--
-- Samostatná funkce místo vnořeného sub-selectu přímo v pohledu — držet
-- regex patch pohledu co nejkratší a nejjednoznačnější (viz komentář
-- u KOTVY v migraci 20260826100000: "strop opakovani v ARE je 255").
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.posledni_beh_generatoru_ocekavane_ticho()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT COALESCE(
    (SELECT r.result ->> 'reason' = 'denni_strop_vycerpan'
        OR r.result ->> 'skipped' = 'true'
     FROM public.ai_runs r
     WHERE r.purpose = 'recipe_generator_beh'
     ORDER BY r.created_at DESC
     LIMIT 1),
    false
  );
$function$;

COMMENT ON FUNCTION public.posledni_beh_generatoru_ocekavane_ticho() IS
  'True, kdyz posledni zaznam recipe_generator_beh v ai_runs ma reason=denni_strop_vycerpan nebo skipped=true — tzn. generator bezi spravne, jen nema co delat. Pouziva ho vetev generator_nedodava v system_health_alerts_zaklad, aby nehlasila critical na ocekavane ticho (docs/DALSI_KROK.md 8.19).';

-- ---------------------------------------------------------------------------
-- 2. Patch větve generator_nedodava — critical jen když poslední běh NENÍ
-- vysvětlené ticho (žádný běh vůbec, nebo běh s chybou).
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

  IF puvodni LIKE '%posledni_beh_generatoru_ocekavane_ticho%' THEN
    RAISE NOTICE 'vetev generator_nedodava uz je opravena, preskakuji';
  ELSE
    -- Kratka a jednoznacna kotva, stejna jako v 20260826100000 (uz jednou
    -- overena, ze v produkci v tomhle tvaru existuje).
    SELECT count(*) INTO shod FROM regexp_matches(
      puvodni,
      'rc\.source = ''llm_generated''::text\s*HAVING max\(rc\.created_at\) IS NULL '
      || 'OR max\(rc\.created_at\) < \(now\(\) - ''20:00:00''::interval\)',
      'g');
    IF shod <> 1 THEN
      RAISE EXCEPTION 'vetev generator_nedodava nenalezena presne 1x (nalezeno %x) — aktualni tvar HAVING v produkci uz nesedi s touhle migraci, oprav anchor rucne podle pg_get_viewdef', shod;
    END IF;

    nova := regexp_replace(
      puvodni,
      '(rc\.source = ''llm_generated''::text\s*HAVING )(max\(rc\.created_at\) IS NULL '
      || 'OR max\(rc\.created_at\) < \(now\(\) - ''20:00:00''::interval\))',
      '\1(\2) AND NOT public.posledni_beh_generatoru_ocekavane_ticho()');

    -- SECURITY_INVOKER SE OBNOVUJE EXPLICITNE — CREATE OR REPLACE VIEW ho
    -- jinak prepise na vychozi a pohled by obchazel RLS zdrojovych tabulek.
    EXECUTE 'CREATE OR REPLACE VIEW public.system_health_alerts_zaklad '
         || 'WITH (security_invoker = true) AS ' || nova;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Nová větev (info, ne critical/warning): dej vědět, že strop je
-- vyčerpaný a proto se běh přeskočil — bez týhle větve úplné utišení
-- vypadá stejně jako "nic se neděje", a to je přesně to ticho, kvůli
-- kterému vznikla migrace 20260826100000.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.system_health_alerts_generator_strop_vycerpan AS
WITH posledni AS (
  SELECT r.created_at, r.result
  FROM public.ai_runs r
  WHERE r.purpose = 'recipe_generator_beh'
  ORDER BY r.created_at DESC
  LIMIT 1
)
SELECT
  'info'::text AS severity,
  'generator_strop_vycerpan'::text AS kod,
  'Denni strop generatoru je vycerpany - beh se korektne preskocil'::text AS popis,
  to_char(p.created_at, 'MM-DD HH24:MI')::text AS detail,
  1::bigint AS pocet
FROM posledni p
WHERE p.result ->> 'reason' = 'denni_strop_vycerpan'
   OR p.result ->> 'skipped' = 'true';

ALTER VIEW public.system_health_alerts_generator_strop_vycerpan SET (security_invoker = true);

COMMENT ON VIEW public.system_health_alerts_generator_strop_vycerpan IS
  'Info vetev (ne critical/warning): posledni beh generatoru byl ocekavane preskocen kvuli dennimu stropu. docs/DALSI_KROK.md 8.19.';

-- ---------------------------------------------------------------------------
-- 4. Sjednocení — přidává jen nový řádek k aktuálnímu seznamu (viz
-- 20260828100000_utrata_se_odvozuje_z_uctenek.sql, poslední migrace, která
-- tenhle pohled definovala celý).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.system_health_alerts AS
  SELECT severity, kod, popis, detail, pocet
  FROM public.system_health_alerts_zaklad
  UNION ALL
  SELECT severity, kod, popis, detail, pocet
  FROM public.system_health_alerts_dieta_pod_kritickym_poctem
  UNION ALL
  SELECT severity, kod, popis, detail, pocet
  FROM public.system_health_alerts_surovina_blokuje_tag
  UNION ALL
  SELECT severity, kod, popis, detail, pocet
  FROM public.system_health_alerts_generator_selhava
  UNION ALL
  SELECT severity, kod, popis, detail, pocet
  FROM public.system_health_alerts_utrata_stoji
  UNION ALL
  SELECT severity, kod, popis, detail, pocet
  FROM public.system_health_alerts_generator_strop_vycerpan;

ALTER VIEW public.system_health_alerts SET (security_invoker = true);

-- ===========================================================================
-- Kontroly
-- ===========================================================================
DO $$
DECLARE
  v_definice text;
  v_radku    integer;
BEGIN
  v_definice := pg_get_viewdef('public.system_health_alerts_zaklad'::regclass, true);

  IF v_definice NOT LIKE '%posledni_beh_generatoru_ocekavane_ticho%' THEN
    RAISE EXCEPTION 'vetev generator_nedodava nebyla opravena';
  END IF;

  -- Práh 20 h zůstal netknutý, jen se doplnila podmínka.
  IF v_definice NOT LIKE '%20:00:00%' THEN
    RAISE EXCEPTION 'prah 20 h zmizel pri patchi';
  END IF;

  -- Ostatní větve musí zůstat na místě (namátkou, jako v 20260826100000).
  IF v_definice NOT LIKE '%uzivatel_bez_planu%' THEN
    RAISE EXCEPTION 'pri prepisu se ztratily ostatni vetve watchdogu';
  END IF;

  -- Pohled musí dál vracet data, ne spadnout na změněném tvaru.
  SELECT count(*) INTO v_radku FROM public.system_health_alerts;
  RAISE NOTICE 'Watchdog: generator_nedodava opraven, system_health_alerts vraci % radku.', v_radku;
END $$;
