-- Denní útrata se ODVOZUJE z účtenek, nezapisuje se zvlášť.
--
-- ===========================================================================
-- CO SE STALO
-- ===========================================================================
-- `openai_daily_usage` má poslední záznam z 23. 8. 2026. Generátor přitom
-- 28. 8. utratil $0,237. Došel kredit, nikdo si toho nevšiml, a čtyři dny
-- stojícího generátoru stály víc než ten kredit.
--
-- PŘÍČINA NENÍ ROZBITÝ ZÁPIS. Ta tabulka generátor nikdy neobsahovala.
-- `recordOpenAIUsage()` má JEDINÉHO volajícího — `lib/runAgent.js`, tedy
-- cestu AI agentů (TED, trenér). Generátor receptů si píše vlastní účtenky
-- do `ai_runs` a do `openai_daily_usage` nesáhl ani jednou.
--
-- Existovaly tedy DVĚ oddělené knihy, každá neúplná:
--   ai_runs                 generátor, skutečná cena z `usage`
--   ai_logs + daily_usage   agenti, odhad z `estimateOpenAICostUSD()`
-- Tabulka „přestala" být plněná prostě proto, že agenti od 23. 8. 01:13
-- padají na `429 no credits` — od té doby nemá kdo zapisovat.
--
-- HORŠÍ DŮSLEDEK, KTERÝ TÍM VYCHÁZÍ NAJEVO: `assertOpenAIDailyBudget()` čte
-- právě `openai_daily_usage`. Rozpočtová pojistka tedy generátor NEVIDÍ —
-- ten může utrácet bez jakéhokoli stropu v dolarech. Drží ho jen limity na
-- počty receptů, což je něco jiného.
--
-- ===========================================================================
-- PROČ POHLED A NE OPRAVA ZÁPISU
-- ===========================================================================
-- Dopsat generátoru volání `recordOpenAIUsage()` by byla oprava na dva řádky,
-- ale nechala by stát celý vzorec:
--   * dvě místa, jedno aktualizované — přesně ta třída chyby, která nás
--     v téhle etapě potkala už třikrát (self-aliasy, pásma fronty, tenhle);
--   * každý další, kdo v budoucnu zavolá OpenAI, si musí VZPOMENOUT zapsat;
--   * `recordOpenAIUsage()` je navíc read-modify-write bez zámku — dvě
--     souběžná volání si navzájem přepíšou inkrement.
--
-- Účtenky se přitom píšou spolehlivě samy: `ai_runs` u každého volání
-- generátoru, `ai_logs` u každého volání agenta (i u `blocked` a chyb).
-- Denní součet je z nich odvoditelný, takže druhá kniha je zbytečná.
--
-- OVĚŘENO, KDO TABULKU ČTE: jediný čtenář v celém kódu je
-- `assertOpenAIDailyBudget()` (`lib/aiOps.js`) — plus read-before-write uvnitř
-- `recordOpenAIUsage()`, který tímhle commitem mizí. Žádný SQL pohled, cron
-- ani admin endpoint na ni nesahá. Pohled proto drží PŘESNĚ TVAR tabulky,
-- takže se čtenář nemění.
--
-- CO POHLED NEUMÍ: rozpočtová pojistka teď měří i generátor, takže může
-- začít blokovat dřív než dřív. To je záměr — dosud byla poloslepá.

-- ------------------------------------------------------------- archiv

-- Historii nemažeme, jen ji odsouváme. Do pohledu se NEPŘILÉVÁ: agentní
-- útratu do 23. 8. má `ai_logs` taky, takže by se sečetla dvakrát.
alter table public.openai_daily_usage rename to openai_daily_usage_archiv;

comment on table public.openai_daily_usage_archiv is
  'Historie zapisovana rucne pres recordOpenAIUsage() do 28. 8. 2026. '
  'Obsahuje POUZE utratu AI agentu, nikdy ne generator receptu. '
  'Necist — aktualni cisla jsou v pohledu openai_daily_usage.';

-- ------------------------------------------------------------- pohled

-- Denní útrata ze všech účtenek. Tvar je shodný s původní tabulkou.
--
-- `ai_runs.cost_usd` je skutečná cena spočtená ze sazeb u modelu.
-- `ai_logs.estimated_cost_usd` je odhad z `estimateOpenAICostUSD()` a používá
-- jiné sazby než generátor (5/15 vs 2,50/10 za milion tokenů) — nesrovnalost,
-- která tu byla i předtím a tenhle pohled ji neřeší, jen zpřesňuje součet
-- o generátor. Až se sazby sjednotí, změní se to na jednom místě.
create or replace view public.openai_daily_usage as
with uctenky as (
  -- Generátor receptů. Řádky `recipe_generator_beh` mají nulovou cenu (je to
  -- záznam o běhu, ne o volání modelu), takže součet nezkreslí.
  select r.created_at::date as usage_date,
         coalesce(r.cost_usd, 0)::numeric as cena,
         coalesce(r.input_tokens, 0) as vstup,
         coalesce(r.output_tokens, 0) as vystup,
         case when r.cost_usd > 0 then 1 else 0 end as volani
  from public.ai_runs r

  union all

  -- AI agenti. `estimated_cost_usd` je vyplněné i u `blocked` běhů (nula),
  -- takže se počítají jen ta volání, která opravdu něco stála.
  select l.created_at::date,
         coalesce(l.estimated_cost_usd, 0)::numeric,
         coalesce(l.input_tokens, 0),
         coalesce(l.output_tokens, 0),
         case when l.estimated_cost_usd > 0 then 1 else 0 end
  from public.ai_logs l
)
select
  usage_date,
  sum(cena)::numeric as spent_usd,
  sum(vstup)::bigint as input_tokens,
  sum(vystup)::bigint as output_tokens,
  sum(volani)::bigint as requests_count,
  max(usage_date)::timestamptz as updated_at
from uctenky
group by usage_date;

alter view public.openai_daily_usage set (security_invoker = true);

comment on view public.openai_daily_usage is
  'Denni utrata za OpenAI odvozena z uctenek: ai_runs (generator, skutecna '
  'cena) + ai_logs (agenti, odhad). Nahradilo rucni zapis pres '
  'recordOpenAIUsage(), ktery generator nikdy nezahrnoval. Cte '
  'assertOpenAIDailyBudget() v lib/aiOps.js.';

-- ------------------------------------------------------- watchdog větev

-- Utrácíme, nebo neutrácíme?
--
-- Zůstatek kreditu z API přečíst nejde, ale tohle poznat musíme: když fronta
-- generátoru čeká a přitom za celý den nevznikla ani jedna účtenka, něco
-- brání volat model. Přesně ten stav trval 24.–28. 8. a nikdo ho neviděl.
--
-- PROČ SE PTÁME I NA FRONTU. Nulová útrata sama o sobě porucha není —
-- o víkendu se nemusí generovat nic a katalog může být nasycený. Poplach
-- dává smysl jedině ve dvojici „je co dělat, a nic se neděje".
--
-- Doplňuje `generator_selhava` (ta hlásí důvod z posledního běhu). Tahle
-- větev chytá i případ, kdy se běh vůbec nespustí a žádný důvod nevznikne.
create or replace view public.system_health_alerts_utrata_stoji as
with posledni as (
  select max(usage_date) as den from public.openai_daily_usage where spent_usd > 0
),
fronta as (
  select coalesce(sum(pozadovano - coalesce(vyrobeno, 0)), 0) as kusu
  from public.recipe_generation_queue where stav = 'pending'
)
select
  'critical'::text as severity,
  'utrata_se_nezaznamenava'::text as kod,
  'Za 24 h zadna utrata za OpenAI, pritom fronta generatoru ceka'::text as popis,
  ('posledni utrata: ' || coalesce(p.den::text, 'nikdy')
    || ' | ve fronte ceka ' || f.kusu || ' receptu') as detail,
  1::bigint as pocet
from posledni p
cross join fronta f
where f.kusu > 0
  and (p.den is null or p.den < current_date - 1);

alter view public.system_health_alerts_utrata_stoji set (security_invoker = true);

comment on view public.system_health_alerts_utrata_stoji is
  'Fronta generatoru ceka, ale za 24 h nevznikla zadna uctenka. '
  'Zustatek kreditu z API precist nejde — tohle je nahrada.';

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
  from public.system_health_alerts_generator_selhava
  union all
  select severity, kod, popis, detail, pocet
  from public.system_health_alerts_utrata_stoji;

alter view public.system_health_alerts set (security_invoker = true);

-- ===========================================================================
-- Kontroly
-- ===========================================================================
DO $$
DECLARE
  v_tvar text;
BEGIN
  -- Pohled musi mit PRESNE tvar puvodni tabulky, jinak se rozbije ctenar
  -- assertOpenAIDailyBudget(), ktery pri chybe tise vraci "allowed" —
  -- rozpoctova pojistka by zmizela a nikdo by se to nedozvedel.
  SELECT string_agg(column_name, ',' ORDER BY ordinal_position) INTO v_tvar
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'openai_daily_usage';

  IF v_tvar IS DISTINCT FROM 'usage_date,spent_usd,input_tokens,output_tokens,requests_count,updated_at' THEN
    RAISE EXCEPTION 'pohled openai_daily_usage ma jiny tvar nez tabulka: %', v_tvar;
  END IF;

  IF to_regclass('public.openai_daily_usage_archiv') IS NULL THEN
    RAISE EXCEPTION 'archiv historie se nezalozil';
  END IF;

  -- Dotaz, ktery pousti rozpoctova pojistka, musi projit.
  PERFORM spent_usd FROM public.openai_daily_usage WHERE usage_date = current_date;

  RAISE NOTICE 'Denni utrata se odvozuje z uctenek; watchdog vetev utrata_stoji je na miste.';
END $$;
