-- Derived daily plan adherence (meals + workout + Apple Watch). No manual check-in required.
CREATE OR REPLACE FUNCTION public.get_daily_adherence(p_user_id uuid, p_date date)
RETURNS TABLE(
  planovanych_jidel integer,
  splnenych_jidel integer,
  treninkovy_den boolean,
  trenink_splnen boolean,
  pohyb_min numeric,
  adherence_pct integer,
  hodnoceni text
)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
with plan_day as (
  select jsonb_array_length(d->'meals') as jidel,
         (d->'workout' is not null and d->'workout' <> 'null'::jsonb) as je_trenink
  from public.ai_generated_plans p,
       lateral jsonb_array_elements(p.structured_plan_json->'days') d
  where p.user_id = p_user_id and p.is_active and (d->>'date')::date = p_date
  limit 1
),
comp as (
  select
    count(*) filter (where activity_type = 'meal') as jidla,
    count(*) filter (where activity_type = 'workout') as treninky_rucne
  from public.daily_activity_completions
  where user_id = p_user_id and completed_at::date = p_date
),
watch as (
  select coalesce(sum(exercise_min), 0) as pohyb,
         coalesce(sum(workout_count), 0) as watch_wo
  from public.apple_health_daily
  where user_id = p_user_id and local_date = p_date
),
calc as (
  select
    coalesce(pd.jidel, 0) as planovanych,
    least(coalesce(c.jidla, 0), coalesce(pd.jidel, 0)) as splneno,
    coalesce(pd.je_trenink, false) as je_trenink,
    (coalesce(c.treninky_rucne, 0) > 0
       or coalesce(w.watch_wo, 0) > 0
       or coalesce(w.pohyb, 0) >= 30) as trenink_ok,
    w.pohyb as pohyb
  from plan_day pd
  cross join comp c
  cross join watch w
)
select
  planovanych,
  splneno,
  je_trenink,
  trenink_ok,
  pohyb,
  case
    when planovanych = 0 then 0
    when je_trenink then round(
      (splneno::numeric / planovanych * 0.7
        + (case when trenink_ok then 1 else 0 end) * 0.3) * 100
    )::int
    else round(splneno::numeric / planovanych * 100)::int
  end as adherence_pct,
  case
    when planovanych = 0 then 'zadna_data'
    when splneno = 0 and not trenink_ok and pohyb < 10 then 'zadna_data'
    else case
      when (
        case
          when je_trenink then round(
            (splneno::numeric / planovanych * 0.7
              + (case when trenink_ok then 1 else 0 end) * 0.3) * 100
          )
          else round(splneno::numeric / planovanych * 100)
        end
      ) >= 85 then 'skvele'
      when (
        case
          when je_trenink then round(
            (splneno::numeric / planovanych * 0.7
              + (case when trenink_ok then 1 else 0 end) * 0.3) * 100
          )
          else round(splneno::numeric / planovanych * 100)
        end
      ) >= 60 then 'dobre'
      when (
        case
          when je_trenink then round(
            (splneno::numeric / planovanych * 0.7
              + (case when trenink_ok then 1 else 0 end) * 0.3) * 100
          )
          else round(splneno::numeric / planovanych * 100)
        end
      ) >= 30 then 'castecne'
      else 'slabe'
    end
  end as hodnoceni
from calc;
$function$;

GRANT EXECUTE ON FUNCTION public.get_daily_adherence(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_adherence(uuid, date) TO service_role;
