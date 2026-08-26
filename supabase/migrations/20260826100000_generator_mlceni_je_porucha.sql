-- Mlčení generátoru přestává vypadat jako úspěch.
--
-- ===========================================================================
-- CO SE STALO
-- ===========================================================================
-- Generátor stál od 24. 8. 03:18 do 26. 8. — 55 hodin, osm propadlých cron
-- slotů, katalog nerostl vůbec. Spoonacular je dojetý (viz 4.10), takže to byl
-- jediný zdroj.
--
-- PŘÍČINA NEBYLA V KÓDU: OpenAI vracelo `429 You have no credits remaining`.
-- Cron běžel správně (9 volání za 3 dny, přesně podle rozvrhu), funkce
-- doběhla, vrátila HTTP 200 a v logu měla `"event":"done","zapsano":0`.
-- Ošetření infrastrukturní chyby fungovalo přesně, jak mělo — položku vrátilo
-- do fronty a běh zastavilo.
--
-- PROBLÉM JE, ŽE TO NEBYLO POZNAT. Do `ai_runs` se psalo jen po ÚSPĚŠNÉM
-- volání modelu, takže po devíti bězích nezůstala ani jedna stopa. Prázdná
-- tabulka vypadá stejně jako „cron neběžel" i jako „všechno je v pořádku".
-- Jediné, co se rozsvítilo, byl `generator_nedodava` — s prahem 48 hodin.
--
-- DVĚ ZMĚNY:
--   1. Práh `generator_nedodava` z 48 h na 20 h.
--   2. Nová větev `generator_selhava`, která hlásí DŮVOD z posledního běhu.
--
-- Zápis o každém běhu do `ai_runs` (purpose `recipe_generator_beh`) přidává
-- lib/recipeGeneratorRun.js ve stejném commitu — bez něj by druhá větev
-- neměla z čeho číst.

-- --------------------------------------------------------- práh 48 h → 20 h
--
-- PROČ PRÁVĚ 20. Cron běží 3× denně (03:15, 11:15, 19:15 UTC), mezi běhy je
-- 8 hodin. Dvacet hodin ticha znamená DVA propadlé sloty a kus třetího —
-- to už není jeden zaškobrtnutý běh, ale porucha. Kratší práh (16 h) by
-- hlásil poplach po jediném vynechaném slotu; delší (24 h) by čekal skoro
-- den, což je u jediného zdroje katalogu pozdě. Původních 48 h znamenalo,
-- že se o zastaveném generátoru dozvíme až po šesti propadlých slotech.
--
-- Práh se mění SCOPOVANĚ. `'48:00:00'` je v pohledu 4×, ostatní patří jiným
-- větvím (import_nebezel a spol.) a ty se nemění.
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

  IF puvodni LIKE '%nevyrobil zadny recept 20 h%' THEN
    RAISE NOTICE 'prah uz je zkraceny, preskakuji';
  ELSE
    -- Kotva je KRATKA a jednoznacna: WHERE + HAVING teze vetve. Delsi vzor
    -- ({0,400}) Postgres odmita — strop opakovani v ARE je 255.
    SELECT count(*) INTO shod FROM regexp_matches(
      puvodni,
      'rc\.source = ''llm_generated''::text\s*HAVING max\(rc\.created_at\) IS NULL '
      || 'OR max\(rc\.created_at\) < \(now\(\) - ''48:00:00''::interval\)',
      'g');
    IF shod <> 1 THEN
      RAISE EXCEPTION 'vetev generator_nedodava nalezena %x, cekali jsme 1x', shod;
    END IF;

    nova := regexp_replace(
      puvodni,
      '(rc\.source = ''llm_generated''::text\s*HAVING max\(rc\.created_at\) IS NULL '
      || 'OR max\(rc\.created_at\) < \(now\(\) - )''48:00:00''',
      '\1''20:00:00''');
    nova := replace(nova,
      'Generator nevyrobil zadny recept 48 h',
      'Generator nevyrobil zadny recept 20 h');

    -- SECURITY_INVOKER SE OBNOVUJE EXPLICITNE — CREATE OR REPLACE VIEW ho
    -- jinak prepise na vychozi a pohled by obchazel RLS zdrojovych tabulek.
    EXECUTE 'CREATE OR REPLACE VIEW public.system_health_alerts_zaklad '
         || 'WITH (security_invoker = true) AS ' || nova;
  END IF;
END $$;

-- ------------------------------------------------------------ nová větev

-- Generátor běží, ale nic nevyrábí — a ví se proč.
--
-- Čte poslední záznam o běhu (`recipe_generator_beh`). Ten se zapisuje po
-- KAŽDÉM běhu, i když nic nevznikne, takže tahle větev rozliší tři stavy,
-- které dřív vypadaly stejně:
--   * záznam s chybou       → porucha, a v detailu stojí která
--   * záznam bez chyby      → fronta došla, katalog je nasycený (nehlásí se)
--   * žádný záznam vůbec    → cron neběží (to hlásí `generator_nedodava`)
--
-- SEVERITY CRITICAL a bez časového prahu: jeden běh s infrastrukturní chybou
-- stačí. Když nejde zaplatit model, druhý pokus za osm hodin dopadne stejně
-- a čekat na něj nemá smysl. Falešný poplach nehrozí — `error` se plní jen
-- z `chyby`, tedy z toho, co běh sám označil za problém.
create or replace view public.system_health_alerts_generator_selhava as
with posledni as (
  select r.created_at, r.error, r.result
  from public.ai_runs r
  where r.purpose = 'recipe_generator_beh'
  order by r.created_at desc
  limit 1
)
select
  'critical'::text as severity,
  'generator_selhava'::text as kod,
  'Generator bezi, ale nic nevyrabi - posledni beh skoncil chybou'::text as popis,
  (to_char(p.created_at, 'MM-DD HH24:MI') || ' | ' || left(p.error, 300)) as detail,
  1::bigint as pocet
from posledni p
where p.error is not null;

alter view public.system_health_alerts_generator_selhava set (security_invoker = true);

comment on view public.system_health_alerts_generator_selhava is
  'Posledni beh generatoru skoncil chybou. Cte ai_runs (purpose '
  'recipe_generator_beh), ktery se zapisuje po kazdem behu i bez vysledku.';

-- ------------------------------------------------------------ sjednocení

-- Tenký pohled, nic než union. Nová větev = nový řádek tady.
create or replace view public.system_health_alerts as
  select severity, kod, popis, detail, pocet
  from public.system_health_alerts_zaklad
  union all
  select severity, kod, popis, detail, pocet
  from public.system_health_alerts_dieta_pod_kritickym_poctem
  union all
  select severity, kod, popis, detail, pocet
  from public.system_health_alerts_surovina_blokuje_tag
  union all
  select severity, kod, popis, detail, pocet
  from public.system_health_alerts_generator_selhava;

alter view public.system_health_alerts set (security_invoker = true);

-- ===========================================================================
-- Kontroly
-- ===========================================================================
DO $$
DECLARE
  v_definice text;
BEGIN
  v_definice := pg_get_viewdef('public.system_health_alerts_zaklad'::regclass, true);

  IF v_definice NOT LIKE '%nevyrobil zadny recept 20 h%' THEN
    RAISE EXCEPTION 'prah generator_nedodava se nezkratil';
  END IF;

  -- Ostatni vetve si svuj 48h prah musi ponechat.
  IF (length(v_definice) - length(replace(v_definice, '48:00:00', ''))) / 8 <> 3 THEN
    RAISE EXCEPTION 'zmenil se prah i jinym vetvim nez generator_nedodava';
  END IF;

  IF v_definice NOT LIKE '%uzivatel_bez_planu%' THEN
    RAISE EXCEPTION 'pri prepisu se ztratily ostatni vetve watchdogu';
  END IF;

  RAISE NOTICE 'Watchdog: prah 20 h a vetev generator_selhava jsou na miste.';
END $$;
