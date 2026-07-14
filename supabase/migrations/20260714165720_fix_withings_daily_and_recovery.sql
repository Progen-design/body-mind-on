drop view if exists public.withings_daily;

-- SEKCE VAHA (Withings)
create view public.withings_daily
with (security_invoker = true)
as
select distinct on (user_id, (measured_at at time zone 'Europe/Prague')::date)
  user_id,
  (measured_at at time zone 'Europe/Prague')::date as local_date,
  measured_at                                       as measured_at,
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
  'SEKCE VAHA (Withings): telesne slozeni po dnech, posledni mereni dne. Oddelene od Apple Health.';

-- -----------------------------------------------------------------------------
-- REGENERACE - pocita se VYHRADNE z Apple Health (HRV, klidovy tep, spanek).
-- Vaha z Withings do skore nevstupuje.
-- NENI to zdravotni diagnostika, je to ukazatel treninkove zateze.
-- -----------------------------------------------------------------------------
create or replace view public.apple_health_recovery
with (security_invoker = true)
as
with base as (
  select
    d.user_id, d.local_date,
    d.hrv_ms, d.resting_hr, d.sleep_asleep_min,
    d.steps, d.active_kcal, d.exercise_min, d.workout_count, d.workout_min,
    avg(d.hrv_ms)     over w7 as hrv_baseline7,
    avg(d.resting_hr) over w7 as rhr_baseline7,
    count(d.hrv_ms)     over w7 as hrv_dnu,
    count(d.resting_hr) over w7 as rhr_dnu
  from public.apple_health_daily d
  window w7 as (
    partition by d.user_id order by d.local_date
    rows between 7 preceding and 1 preceding
  )
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
  steps, active_kcal, exercise_min, workout_count, workout_min,
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
  'Orientacni skore regenerace (0-100) z Apple Health: HRV + klidovy tep + spanek vs 7denni baseline. NENI zdravotni diagnostika. Pri nedostatku dat vraci NULL + duvod.';
