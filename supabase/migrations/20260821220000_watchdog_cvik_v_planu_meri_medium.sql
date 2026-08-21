-- Watchdog: `cvik_v_planu_bez_navodu` prestane merit pole, ktere nikdo nevykresluje.
--
-- PROC. Vetev hlasila cvik, kteremu v `structured_plan_json` chybi
-- `instructions`. Overeno 21. 8. 2026, ze to pole:
--
--   1. NEMA ZDROJOVOU TABULKU. Zadny sloupec v databazi popis provedeni
--      cviku neuklada — `exercise_asset_registry` ma nazvy, partie, narado
--      a media, ale zadny text. Instructions ma jen `recipes_catalog`,
--      a to pro recepty.
--   2. NIKDE SE NEVYKRESLUJE. V celem repu se `ex.instructions` objevuje
--      jednou, v lib/workoutReplacementSchema.js, kde se jen kopiruje dal.
--
-- Modal "Jak cvik provest" ukazuje jmeno, serie/opakovani a ANIMACI (gif),
-- ne text. Vsech deset hlasenych cviku gif ma a je usable_in_plan — nic
-- rozbiteho tam nebylo.
--
-- OPRAVA: vetev meri to, co modal skutecne potrebuje — jestli cvik pouzity
-- v aktivnim planu ma vubec nejake medium, nebo aspon zaznam v registru.
-- Zmereno po prepnuti: 10 cviku v aktivnich planech, vsech 10 v registru,
-- vsech 10 s mediem → 0.
--
-- Vetev neni zbytecna: chytne cvik, ktery generator do planu zaradi, aniz
-- pro nej mame cim ilustrovat provedeni. To uzivatel pozna hned — klikne
-- na "Jak cvik provest" a uvidi prazdno.
--
-- POZNAMKA K ZAVAZNOSTI: zustava `warning`, ne `critical`. Uzivatel cvik
-- VIDI vcetne nazvu a serii, chybi mu jen ukazka. Je to horsi zazitek,
-- ne rozbita funkce.
--
-- Ctvrty falesny poplach v tomhle view po `je_prejata_surovina`,
-- `je_prejaty_nazev_cviku` a presne shode u nazvu receptu. Vsechny mely
-- stejnou pricinu: heuristika mistо mereni toho, co uzivatel doopravdy vidi.

DO $$
DECLARE
  puvodni text;
  nova    text;
  stara   text;
  novy    text;
BEGIN
  IF to_regclass('public.system_health_alerts') IS NULL THEN
    RAISE EXCEPTION 'system_health_alerts neexistuje — migrace by tise neudelala nic';
  END IF;

  puvodni := pg_get_viewdef('public.system_health_alerts'::regclass, true);

  IF puvodni LIKE '%cvik_v_planu_bez_media%' THEN
    RAISE NOTICE 'oprava uz je zavedena, preskakuji';
    RETURN;
  END IF;

  -- Vymenuje se kod vetve, popis a podminka. Zbytek (agregace, joiny) sedi.
  stara := '''cvik_v_planu_bez_navodu''::text AS kod,'
        || E'\n    ''Cvik v aktivnim planu nema popis provedeni''::text AS popis,';
  novy  := '''cvik_v_planu_bez_media''::text AS kod,'
        || E'\n    ''Cvik v aktivnim planu nema cim ukazat provedeni''::text AS popis,';

  IF position(stara in puvodni) = 0 THEN
    RAISE EXCEPTION 'hlavicka vetve cvik_v_planu_bez_navodu nenalezena — definice view se zmenila';
  END IF;
  nova := replace(puvodni, stara, novy);

  stara := 'AND NULLIF(btrim(e.value ->> ''instructions''::text), ''''::text) IS NULL';
  novy  := 'AND NOT (EXISTS ( SELECT 1 FROM exercise_asset_registry r'
        || ' WHERE r.canonical_key = NULLIF(btrim(e.value ->> ''canonical_key''::text), ''''::text)'
        || ' AND (NULLIF(btrim(r.gif_url), ''''::text) IS NOT NULL'
        || ' OR NULLIF(btrim(r.image_url), ''''::text) IS NOT NULL'
        || ' OR NULLIF(btrim(r.wger_exercise_image_url), ''''::text) IS NOT NULL)))';

  IF position(stara in nova) = 0 THEN
    RAISE EXCEPTION 'podminka na instructions nenalezena — definice view se zmenila';
  END IF;
  nova := replace(nova, stara, novy);

  IF nova = puvodni THEN
    RAISE EXCEPTION 'nahrazeni se nepovedlo';
  END IF;

  -- security_invoker se obnovuje explicitne — CREATE OR REPLACE VIEW ho jinak
  -- prepise na vychozi a view by obchazel RLS zdrojovych tabulek.
  EXECUTE 'CREATE OR REPLACE VIEW public.system_health_alerts '
       || 'WITH (security_invoker = true) AS ' || nova;
END $$;
