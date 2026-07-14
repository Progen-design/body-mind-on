-- =============================================================================
-- Prestavba na ODDELENE zdroje.
-- Withings (vaha) a Apple Health (hodinky) maji vlastni sekce, nic se neslevava.
-- =============================================================================

drop view if exists public.user_health_recovery;
drop view if exists public.user_health_daily;
drop view if exists public.apple_health_daily;

-- -----------------------------------------------------------------------------
-- 1) APPLE HEALTH - LONG: kazda metrika, spravne agregovana dle registru.
--    Nova metrika bez zaznamu v registru => fallback avg, ale objevi se
--    v apple_health_unknown_metrics, aby sla doplnit.
-- -----------------------------------------------------------------------------
create view public.apple_health_metrics_daily
with (security_invoker = true)
as
with conv as (
  select
    m.user_id,
    m.local_date,
    m.metric_name,
    coalesce(d.label_cs, m.metric_name)                  as label_cs,
    coalesce(d.category, 'ostatni')                      as category,
    coalesce(d.agg, 'avg')                               as agg,
    coalesce(d.canonical_unit, m.unit)                   as unit,
    coalesce(d.is_key, false)                            as is_key,
    -- prepocet jednotky, pokud registr definuje prevod a jednotka sedi
    case
      when d.from_unit is not null
       and lower(m.unit) = lower(d.from_unit)
       and d.factor is not null
        then m.qty * d.factor
      else m.qty
    end                                                  as qty,
    m.min_value, m.max_value, m.measured_at
  from public.apple_health_metrics m
  left join public.apple_health_metric_defs d on d.metric_name = m.metric_name
)
select
  user_id, local_date, metric_name, label_cs, category, unit, agg, is_key,
  case agg
    when 'sum'  then sum(qty)
    when 'max'  then max(qty)
    when 'min'  then min(qty)
    when 'last' then (array_agg(qty order by measured_at desc))[1]
    else avg(qty)
  end                                                     as value,
  min(coalesce(min_value, qty))                           as min_value,
  max(coalesce(max_value, qty))                           as max_value,
  count(*)                                                as samples
from conv
group by user_id, local_date, metric_name, label_cs, category, unit, agg, is_key;

comment on view public.apple_health_metrics_daily is
  'Vsechny metriky Apple Health po dnech, agregovane dle apple_health_metric_defs. Zadny whitelist - nova metrika projde automaticky.';

-- Metriky, ktere jeste nejsou v registru (k doplneni)
create or replace view public.apple_health_unknown_metrics
with (security_invoker = true)
as
select
  m.metric_name,
  min(m.unit)        as unit,
  count(*)           as radku,
  max(m.local_date)  as naposledy
from public.apple_health_metrics m
left join public.apple_health_metric_defs d on d.metric_name = m.metric_name
where d.metric_name is null
group by m.metric_name;

comment on view public.apple_health_unknown_metrics is
  'Metriky, ktere dorazily z Apple Health, ale nejsou v registru. Doplnit do apple_health_metric_defs.';

-- -----------------------------------------------------------------------------
-- 2) APPLE HEALTH - WIDE (jen z hodinek/telefonu, ZADNA vaha z Withings)
-- -----------------------------------------------------------------------------
create view public.apple_health_daily
with (security_invoker = true)
as
with p as (
  select * from public.apple_health_metrics_daily
),
w as (
  select user_id, local_date,
    count(*)                                     as workout_count,
    round(sum(duration_s)/60.0)                  as workout_min,
    round(sum(coalesce(active_kcal,total_kcal))) as workout_kcal,
    round(max(max_hr))                           as workout_max_hr,
    round(sum(distance_m)/1000.0, 2)             as workout_km,
    string_agg(distinct workout_type, ', ')      as workout_types
  from public.apple_health_workouts group by 1,2
),
s as (
  select user_id, local_date,
    round(sum(asleep_min))                as sleep_asleep_min,
    round(sum(deep_min))                  as sleep_deep_min,
    round(sum(rem_min))                   as sleep_rem_min,
    round(sum(core_min))                  as sleep_core_min,
    round(avg(efficiency_pct)::numeric,1) as sleep_efficiency_pct
  from public.apple_health_sleep group by 1,2
),
days as (
  select distinct user_id, local_date from p
  union select user_id, local_date from w
  union select user_id, local_date from s
)
select
  d.user_id, d.local_date,
  -- aktivita
  round(max(p.value) filter (where p.metric_name='step_count'))                     as steps,
  round(max(p.value) filter (where p.metric_name='active_energy'))                  as active_kcal,
  round(max(p.value) filter (where p.metric_name='basal_energy_burned'))            as basal_kcal,
  round(max(p.value) filter (where p.metric_name='apple_exercise_time'))            as exercise_min,
  round(max(p.value) filter (where p.metric_name='apple_stand_hour'))               as stand_hours,
  round(max(p.value) filter (where p.metric_name='flights_climbed'))                as flights,
  round(max(p.value) filter (where p.metric_name='time_in_daylight'))               as daylight_min,
  -- vzdalenosti
  round(max(p.value) filter (where p.metric_name='walking_running_distance')::numeric,2) as distance_km,
  round(max(p.value) filter (where p.metric_name='cycling_distance')::numeric,2)    as cycling_km,
  round(max(p.value) filter (where p.metric_name='swimming_distance')::numeric,1)   as swimming_m,
  -- srdce
  round(max(p.value) filter (where p.metric_name='resting_heart_rate'))             as resting_hr,
  round(max(p.value) filter (where p.metric_name='heart_rate')::numeric,1)          as avg_hr,
  round(max(p.max_value) filter (where p.metric_name='heart_rate'))                 as max_hr,
  round(min(p.min_value) filter (where p.metric_name='heart_rate'))                 as min_hr,
  round(max(p.value) filter (where p.metric_name='heart_rate_variability')::numeric,1) as hrv_ms,
  round(max(p.value) filter (where p.metric_name='walking_heart_rate_average')::numeric,1) as walking_hr,
  round(max(p.value) filter (where p.metric_name='cardio_recovery')::numeric,1)     as cardio_recovery,
  round(max(p.value) filter (where p.metric_name='vo2_max')::numeric,1)             as vo2max,
  -- dychani
  round(max(p.value) filter (where p.metric_name='respiratory_rate')::numeric,1)    as respiratory_rate,
  round(max(p.value) filter (where p.metric_name='blood_oxygen_saturation')::numeric,1) as spo2,
  -- telo Z HODINEK/TELEFONU (NE z Withings - to je vlastni sekce)
  round(max(p.value) filter (where p.metric_name='weight_body_mass')::numeric,2)    as ah_weight_kg,
  round(max(p.value) filter (where p.metric_name='body_fat_percentage')::numeric,2) as ah_body_fat_pct,
  -- spanek
  s.sleep_asleep_min, s.sleep_deep_min, s.sleep_rem_min, s.sleep_core_min, s.sleep_efficiency_pct,
  -- treninky
  w.workout_count, w.workout_min, w.workout_kcal, w.workout_max_hr, w.workout_km, w.workout_types
from days d
left join p on p.user_id=d.user_id and p.local_date=d.local_date
left join s on s.user_id=d.user_id and s.local_date=d.local_date
left join w on w.user_id=d.user_id and w.local_date=d.local_date
group by d.user_id, d.local_date,
  s.sleep_asleep_min, s.sleep_deep_min, s.sleep_rem_min, s.sleep_core_min, s.sleep_efficiency_pct,
  w.workout_count, w.workout_min, w.workout_kcal, w.workout_max_hr, w.workout_km, w.workout_types;

comment on view public.apple_health_daily is
  'SEKCE APPLE WATCH: denni souhrn z hodinek a telefonu. Neobsahuje data z vahy Withings.';

-- -----------------------------------------------------------------------------
-- 3) WITHINGS - vlastni sekce (vaha a telesne slozeni)
-- -----------------------------------------------------------------------------
create or replace view public.withings_daily
with (security_invoker = true)
as
select distinct on (user_id, (measured_at at time zone 'Europe/Prague')::date)
  user_id,
  (measured_at at time zone 'Europe/Prague')::date as local_date,
  measured_at                                       as merено_v,
  weight_kg,
  fat_percent          as body_fat_pct,
  fat_mass_kg,
  muscle_mass_kg,
  bone_mass_kg,
  hydration_percent,
  bmi,
  basal_metabolic_rate as bmr_kcal,
  visceral_fat,
  pulse
from public.withings_body_snapshots
order by user_id, (measured_at at time zone 'Europe/Prague')::date, measured_at desc;

comment on view public.withings_daily is
  'SEKCE VAHA (Withings): telesne slozeni po dnech. Posledni mereni dne. Oddelene od Apple Health.';
