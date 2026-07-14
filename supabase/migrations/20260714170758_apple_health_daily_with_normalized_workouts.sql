drop view if exists public.apple_health_recovery;
drop view if exists public.apple_health_daily;

create view public.apple_health_daily
with (security_invoker = true)
as
with p as (
  select * from public.apple_health_metrics_daily
),
w as (
  select
    wk.user_id, wk.local_date,
    count(*)                                        as workout_count,
    round(sum(wk.duration_s)/60.0)                  as workout_min,
    round(sum(coalesce(wk.active_kcal, wk.total_kcal))) as workout_kcal,
    round(max(wk.max_hr))                           as workout_max_hr,
    round(avg(wk.avg_hr)::numeric, 1)               as workout_avg_hr,
    round(sum(wk.distance_m)/1000.0, 2)             as workout_km,
    -- stabilni klice pro AI a logiku
    array_agg(distinct coalesce(m.canonical, 'unmapped'))            as workout_types,
    -- ceske labely pro UI
    string_agg(distinct coalesce(m.label_cs, wk.workout_type), ', ') as workout_labels,
    array_agg(distinct coalesce(m.category, 'jina'))                 as workout_categories
  from public.apple_health_workouts wk
  left join public.workout_type_map m on m.raw_type = wk.workout_type
  group by 1,2
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
  -- AKTIVITA
  round(max(p.value) filter (where p.metric_name='step_count'))                     as steps,
  round(max(p.value) filter (where p.metric_name='active_energy'))                  as active_kcal,
  round(max(p.value) filter (where p.metric_name='basal_energy_burned'))            as basal_kcal,
  round(max(p.value) filter (where p.metric_name='apple_exercise_time'))            as exercise_min,
  round(max(p.value) filter (where p.metric_name='apple_stand_hour'))               as stand_hours,
  round(max(p.value) filter (where p.metric_name='flights_climbed'))                as flights,
  round(max(p.value) filter (where p.metric_name='time_in_daylight'))               as daylight_min,
  -- VZDALENOSTI
  round(max(p.value) filter (where p.metric_name='walking_running_distance')::numeric,2) as distance_km,
  round(max(p.value) filter (where p.metric_name='cycling_distance')::numeric,2)    as cycling_km,
  round(max(p.value) filter (where p.metric_name='swimming_distance')::numeric,1)   as swimming_m,
  -- SRDCE
  round(max(p.value) filter (where p.metric_name='resting_heart_rate'))             as resting_hr,
  round(max(p.value) filter (where p.metric_name='heart_rate')::numeric,1)          as avg_hr,
  round(max(p.max_value) filter (where p.metric_name='heart_rate'))                 as max_hr,
  round(min(p.min_value) filter (where p.metric_name='heart_rate'))                 as min_hr,
  round(max(p.value) filter (where p.metric_name='heart_rate_variability')::numeric,1) as hrv_ms,
  round(max(p.value) filter (where p.metric_name='walking_heart_rate_average')::numeric,1) as walking_hr,
  round(max(p.value) filter (where p.metric_name='cardio_recovery')::numeric,1)     as cardio_recovery,
  round(max(p.value) filter (where p.metric_name='vo2_max')::numeric,1)             as vo2max,
  -- DYCHANI
  round(max(p.value) filter (where p.metric_name='respiratory_rate')::numeric,1)    as respiratory_rate,
  round(max(p.value) filter (where p.metric_name='blood_oxygen_saturation')::numeric,1) as spo2,
  -- TELO Z HODINEK (oddelene od Withings!)
  round(max(p.value) filter (where p.metric_name='weight_body_mass')::numeric,2)    as ah_weight_kg,
  round(max(p.value) filter (where p.metric_name='body_fat_percentage')::numeric,2) as ah_body_fat_pct,
  -- SPANEK
  s.sleep_asleep_min, s.sleep_deep_min, s.sleep_rem_min, s.sleep_core_min, s.sleep_efficiency_pct,
  -- TRENINKY (normalizovane)
  w.workout_count, w.workout_min, w.workout_kcal, w.workout_avg_hr, w.workout_max_hr, w.workout_km,
  w.workout_types, w.workout_labels, w.workout_categories
from days d
left join p on p.user_id=d.user_id and p.local_date=d.local_date
left join s on s.user_id=d.user_id and s.local_date=d.local_date
left join w on w.user_id=d.user_id and w.local_date=d.local_date
group by d.user_id, d.local_date,
  s.sleep_asleep_min, s.sleep_deep_min, s.sleep_rem_min, s.sleep_core_min, s.sleep_efficiency_pct,
  w.workout_count, w.workout_min, w.workout_kcal, w.workout_avg_hr, w.workout_max_hr, w.workout_km,
  w.workout_types, w.workout_labels, w.workout_categories;

comment on view public.apple_health_daily is
  'SEKCE APPLE WATCH: denni souhrn. workout_types = stabilni kanonicke klice pro AI, workout_labels = ceske nazvy pro UI. Neobsahuje vahu z Withings.';

-- Recovery (jen Apple Health)
create view public.apple_health_recovery
with (security_invoker = true)
as
with base as (
  select
    d.user_id, d.local_date,
    d.hrv_ms, d.resting_hr, d.sleep_asleep_min,
    d.steps, d.active_kcal, d.exercise_min, d.workout_count, d.workout_min, d.workout_labels,
    avg(d.hrv_ms)       over w7 as hrv_baseline7,
    avg(d.resting_hr)   over w7 as rhr_baseline7,
    count(d.hrv_ms)     over w7 as hrv_dnu,
    count(d.resting_hr) over w7 as rhr_dnu
  from public.apple_health_daily d
  window w7 as (partition by d.user_id order by d.local_date rows between 7 preceding and 1 preceding)
),
calc as (
  select b.*,
    case when b.hrv_baseline7 > 0
         then (b.hrv_ms - b.hrv_baseline7) / b.hrv_baseline7 * 100 end as hrv_delta_pct,
    (b.resting_hr - b.rhr_baseline7)                                   as rhr_delta_bpm,
    (b.sleep_asleep_min / 480.0)                                       as sleep_ratio
  from base b
)
select
  user_id, local_date,
  hrv_ms, resting_hr, sleep_asleep_min,
  steps, active_kcal, exercise_min, workout_count, workout_min, workout_labels,
  round(hrv_baseline7::numeric, 1) as hrv_baseline7,
  round(rhr_baseline7::numeric, 1) as rhr_baseline7,
  round(hrv_delta_pct::numeric, 1) as hrv_delta_pct,
  round(rhr_delta_bpm::numeric, 1) as rhr_delta_bpm,
  case
    when hrv_dnu < 3 or rhr_dnu < 3           then null
    when hrv_ms is null or resting_hr is null then null
    else round((
        40 * least(greatest(1 + coalesce(hrv_delta_pct,0)/100, 0), 1.25) / 1.25
      + 30 * least(greatest(1 - coalesce(rhr_delta_bpm,0)/10, 0), 1)
      + 30 * least(greatest(coalesce(sleep_ratio, 0), 0), 1)
    )::numeric)
  end as recovery_score,
  case
    when hrv_dnu < 3 or rhr_dnu < 3 then 'nedostatek_dat'
    when hrv_ms is null             then 'chybi_hrv'
    when resting_hr is null         then 'chybi_klidovy_tep'
    when sleep_asleep_min is null   then 'chybi_spanek'
    else 'ok'
  end as recovery_status
from calc;

comment on view public.apple_health_recovery is
  'Orientacni skore regenerace (0-100) z Apple Health. NENI zdravotni diagnostika.';
