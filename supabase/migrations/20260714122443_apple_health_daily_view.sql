-- Denni souhrn pro AI agenta / dashboard.
-- security_invoker => view respektuje RLS volajiciho uzivatele.
create or replace view public.apple_health_daily
with (security_invoker = true)
as
with m as (
  select
    user_id,
    local_date,
    max(qty) filter (where metric_name = 'step_count')                  as steps,
    max(qty) filter (where metric_name = 'active_energy')               as active_kcal,
    max(qty) filter (where metric_name = 'basal_energy_burned')         as basal_kcal,
    max(qty) filter (where metric_name = 'apple_exercise_time')         as exercise_min,
    max(qty) filter (where metric_name = 'apple_stand_hour')            as stand_hours,
    max(qty) filter (where metric_name = 'resting_heart_rate')          as resting_hr,
    avg(qty) filter (where metric_name = 'heart_rate_variability')      as hrv_ms,
    max(qty) filter (where metric_name = 'vo2_max')                     as vo2max,
    max(qty) filter (where metric_name = 'walking_running_distance')    as distance_km,
    max(qty) filter (where metric_name = 'weight_body_mass')            as weight_kg,
    max(qty) filter (where metric_name = 'body_fat_percentage')         as body_fat_pct,
    avg(qty) filter (where metric_name = 'respiratory_rate')            as respiratory_rate,
    avg(qty) filter (where metric_name = 'blood_oxygen_saturation')     as spo2
  from public.apple_health_metrics
  group by user_id, local_date
),
s as (
  select
    user_id,
    local_date,
    sum(asleep_min)      as sleep_asleep_min,
    sum(deep_min)        as sleep_deep_min,
    sum(rem_min)         as sleep_rem_min,
    sum(core_min)        as sleep_core_min,
    sum(awake_min)       as sleep_awake_min,
    avg(efficiency_pct)  as sleep_efficiency_pct
  from public.apple_health_sleep
  group by user_id, local_date
),
w as (
  select
    user_id,
    local_date,
    count(*)                            as workout_count,
    sum(duration_s) / 60.0              as workout_min,
    sum(coalesce(active_kcal, total_kcal)) as workout_kcal,
    max(max_hr)                         as workout_max_hr,
    string_agg(distinct workout_type, ', ') as workout_types
  from public.apple_health_workouts
  group by user_id, local_date
)
select
  coalesce(m.user_id, s.user_id, w.user_id)       as user_id,
  coalesce(m.local_date, s.local_date, w.local_date) as local_date,
  m.steps, m.active_kcal, m.basal_kcal, m.exercise_min, m.stand_hours,
  m.resting_hr, m.hrv_ms, m.vo2max, m.distance_km,
  m.weight_kg, m.body_fat_pct, m.respiratory_rate, m.spo2,
  s.sleep_asleep_min, s.sleep_deep_min, s.sleep_rem_min,
  s.sleep_core_min, s.sleep_awake_min, s.sleep_efficiency_pct,
  w.workout_count, w.workout_min, w.workout_kcal, w.workout_max_hr, w.workout_types
from m
full outer join s on s.user_id = m.user_id and s.local_date = m.local_date
full outer join w on w.user_id = coalesce(m.user_id, s.user_id)
                 and w.local_date = coalesce(m.local_date, s.local_date);

comment on view public.apple_health_daily is 'Denni souhrn Apple Health dat (metriky + spanek + treninky) pro AI agenta a dashboard.';
