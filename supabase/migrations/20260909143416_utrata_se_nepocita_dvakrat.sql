-- OPRAVA DVOJÍHO POČÍTÁNÍ ÚTRATY.
--
-- Pohled `openai_daily_usage` (migrace 20260828100000) sčítá VŠECHNY řádky
-- `ai_runs`. Jeho komentář předpokládá, že řádky `recipe_generator_beh` mají
-- nulovou cenu („je to záznam o běhu, ne o volání modelu"). To neplatí:
-- `zapisZaznamOBehu()` v lib/recipeGeneratorRun.js do nich zapisuje
-- `cost_usd: vysledek.cena_usd`, tedy součet celého běhu.
--
-- Cena generování se proto počítala DVAKRÁT — jednou po dávkách
-- (`recipe_generation`), podruhé v součtu za běh. Měřeno 9. 9. 2026:
--   7. 9.: 1,48 za volání + 1,48 za běh = 2,95 vykázáno místo 1,48
--   6. 9.: 1,10 + 1,10 = 2,20 místo 1,10
--
-- Nejde jen o zkreslené číslo v přehledu. Na tenhle pohled se dívá
-- `assertOpenAIDailyBudget()` — rozpočtová pojistka by sepnula při polovině
-- skutečné útraty a zablokovala agenty (včetně TEDa), přestože rozpočet
-- vyčerpaný není.
--
-- Řádky `recipe_generator_beh` se nechávají v `ai_runs` (jsou to záznamy
-- o bězích, hlásí `reason`, `zahozeno_dle_duvodu` a chyby) — jen se z účtenek
-- vyřazují. Tokeny se dvakrát nepočítaly nikdy: `beh` řádky mají nuly.
create or replace view public.openai_daily_usage as
with uctenky as (
  -- Generátor receptů. POUZE řádky o volání modelu; `recipe_generator_beh`
  -- je souhrn běhu a jeho cena je součtem těch samých volání.
  select r.created_at::date as usage_date,
         coalesce(r.cost_usd, 0)::numeric as cena,
         coalesce(r.input_tokens, 0) as vstup,
         coalesce(r.output_tokens, 0) as vystup,
         case when r.cost_usd > 0 then 1 else 0 end as volani
  from public.ai_runs r
  where r.purpose is distinct from 'recipe_generator_beh'

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
  'Denni utrata za OpenAI odvozena z uctenek: ai_runs (volani modelu, '
  'skutecna cena; radky recipe_generator_beh se vynechavaji, jsou to souhrny '
  'behu) + ai_logs (agenti, odhad).';

-- Kontrola: den, kdy generator bezel, uz nesmi vykazovat vic nez soucet
-- radku o volanich.
do $$
declare
  v_pohled numeric;
  v_volani numeric;
begin
  select coalesce(spent_usd, 0) into v_pohled
  from public.openai_daily_usage where usage_date = date '2026-09-07';

  select coalesce(sum(cost_usd), 0) into v_volani
  from public.ai_runs
  where created_at::date = date '2026-09-07'
    and purpose is distinct from 'recipe_generator_beh';

  if v_pohled is null or v_volani is null then
    return;
  end if;

  if abs(v_pohled - v_volani) > 0.01 then
    raise exception 'pohled dal % , ucet z volani %', v_pohled, v_volani;
  end if;
end $$;
