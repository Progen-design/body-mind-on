drop view if exists public.apple_health_daily;

-- OPRAVA: puvodni view predpokladal 1 radek = 1 den (max(qty)).
-- Realita: HAE posila vzorky (hodinove/minutove) -> nutna spravna agregacni semantika:
--   * kumulativni metriky (kroky, energie, vzdalenost, cas) -> SUM
--   * mira/rate (tep, HRV, SpO2, dech)                      -> AVG (+ MIN/MAX u tepu)
--   * bodove hodnoty (vaha, VO2max, % tuku)                 -> posledni namerena za den
-- Navic: HAE posila energii v kJ (nekdy kcal) -> normalizace na kcal.

create view public.apple_health_daily
with (security_invoker = true)
as
with norm as (
  select
    user_id,
    local_date,
    metric_name,
    measured_at,
    case
      when metric_name in ('active_energy','basal_energy_burned','dietary_energy')
           and lower(coalesce(unit,'')) = 'kj'
        then qty / 4.184
      else qty
    end as qty,
    min_value, max_value
  from public.apple_health_metrics
),
cum as (
  select user_id, local_date,
    round(sum(qty) filter (where metric_name='step_count'))                    as steps,
    round(sum(qty) filter (where metric_name='active_energy'))                 as active_kcal,
    round(sum(qty) filter (where metric_name='basal_energy_burned'))           as basal_kcal,
    round(sum(qty) filter (where metric_name='apple_exercise_time'))           as exercise_min,
    round(sum(qty) filter (where metric_name='apple_stand_hour'))              as stand_hours,
    round(sum(qty) filter (where metric_name='apple_stand_time'))              as stand_min,
    round(sum(qty) filter (where metric_name='walking_running_distance')::numeric, 2) as distance_km,
    round(sum(qty) filter (where metric_name='cycling_distance')::numeric, 2)  as cycling_km,
    round(sum(qty) filter (where metric_name='swimming_distance')::numeric, 1) as swimming_m,
    round(sum(qty) filter (where metric_name='flights_climbed'))               as flights,
    round(sum(qty) filter (where metric_name='time_in_daylight'))              as daylight_min
  from norm group by 1,2
),
rates as (
  select user_id, local_date,
    round(avg(qty) filter (where metric_name='resting_heart_rate'))                     as resting_hr,
    round(avg(qty) filter (where metric_name='heart_rate')::numeric, 1)                 as avg_hr,
    round(min(coalesce(min_value, qty)) filter (where metric_name='heart_rate'))        as min_hr,
    round(max(coalesce(max_value, qty)) filter (where metric_name='heart_rate'))        as max_hr,
    round(avg(qty) filter (where metric_name='heart_rate_variability')::numeric, 1)     as hrv_ms,
    round(avg(qty) filter (where metric_name='walking_heart_rate_average')::numeric, 1) as walking_hr,
    round(avg(qty) filter (where metric_name='respiratory_rate')::numeric, 1)           as respiratory_rate,
    round(avg(qty) filter (where metric_name='blood_oxygen_saturation')::numeric, 1)    as spo2
  from norm group by 1,2
),
point as (
  select distinct on (user_id, local_date, metric_name)
    user_id, local_date, metric_name, qty
  from norm
  where metric_name in ('vo2_max','weight_body_mass','body_fat_percentage','lean_body_mass','body_mass_index')
  order by user_id, local_date, metric_name, measured_at desc
),
point_p as (
  select user_id, local_date,
    round(max(qty) filter (where metric_name='vo2_max')::numeric, 1)             as vo2max,
    round(max(qty) filter (where metric_name='weight_body_mass')::numeric, 2)    as weight_kg,
    round(max(qty) filter (where metric_name='body_fat_percentage')::numeric, 2) as body_fat_pct,
    round(max(qty) filter (where metric_name='lean_body_mass')::numeric, 2)      as lean_mass_kg,
    round(max(qty) filter (where metric_name='body_mass_index')::numeric, 1)     as bmi
  from point group by 1,2
),
s as (
  select user_id, local_date,
    round(sum(asleep_min))                as sleep_asleep_min,
    round(sum(deep_min))                  as sleep_deep_min,
    round(sum(rem_min))                   as sleep_rem_min,
    round(sum(core_min))                  as sleep_core_min,
    round(sum(awake_min))                 as sleep_awake_min,
    round(avg(efficiency_pct)::numeric,1) as sleep_efficiency_pct
  from public.apple_health_sleep group by 1,2
),
w as (
  select user_id, local_date,
    count(*)                                     as workout_count,
    round(sum(duration_s)/60.0)                  as workout_min,
    round(sum(coalesce(active_kcal,total_kcal))) as workout_kcal,
    round(max(max_hr))                           as workout_max_hr,
    string_agg(distinct workout_type, ', ')      as workout_types
  from public.apple_health_workouts group by 1,2
),
days as (
  select user_id, local_date from cum
  union select user_id, local_date from s
  union select user_id, local_date from w
)
select
  d.user_id,
  d.local_date,
  c.steps,
  c.active_kcal,
  c.basal_kcal,
  (coalesce(c.active_kcal,0) + coalesce(c.basal_kcal,0)) as total_kcal,
  c.exercise_min, c.stand_hours, c.stand_min,
  c.distance_km, c.cycling_km, c.swimming_m, c.flights, c.daylight_min,
  r.resting_hr, r.avg_hr, r.min_hr, r.max_hr, r.hrv_ms, r.walking_hr,
  r.respiratory_rate, r.spo2,
  p.vo2max, p.weight_kg, p.body_fat_pct, p.lean_mass_kg, p.bmi,
  s.sleep_asleep_min, s.sleep_deep_min, s.sleep_rem_min,
  s.sleep_core_min, s.sleep_awake_min, s.sleep_efficiency_pct,
  w.workout_count, w.workout_min, w.workout_kcal, w.workout_max_hr, w.workout_types
from days d
left join cum     c on c.user_id=d.user_id and c.local_date=d.local_date
left join rates   r on r.user_id=d.user_id and r.local_date=d.local_date
left join point_p p on p.user_id=d.user_id and p.local_date=d.local_date
left join s         on s.user_id=d.user_id and s.local_date=d.local_date
left join w         on w.user_id=d.user_id and w.local_date=d.local_date;

comment on view public.apple_health_daily is
  'Denni souhrn Apple Health. SUM pro kumulativni metriky, AVG pro rate, posledni hodnota pro bodove. Energie normalizovana kJ->kcal. POZOR: predpoklada HODINOVE skupovani v Health Auto Export - minutove vzorky bazalni energie se prekryvaji a zdvojnasobuji soucet.';
