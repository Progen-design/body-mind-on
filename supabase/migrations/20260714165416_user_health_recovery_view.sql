-- =============================================================================
-- user_health_recovery
-- Denni prehled + 7denni baseline + orientacni skore regenerace.
--
-- DULEZITE: NENI to zdravotni diagnostika. Je to orientacni ukazatel
-- treninkove zateze pro planovani. Pri chybejicich datech vraci NULL + duvod
-- (nikdy nefabrikujeme skore z neuplnych dat).
-- =============================================================================

create or replace view public.user_health_recovery
with (security_invoker = true)
as
with base as (
  select
    d.*,
    -- 7denni baseline (predchozich 7 dni, bez dnesniho)
    avg(d.hrv_ms) over w7            as hrv_baseline7,
    avg(d.resting_hr) over w7        as rhr_baseline7,
    avg(d.sleep_asleep_min) over w7  as sleep_baseline7,
    count(d.hrv_ms) over w7          as hrv_dnu,
    count(d.resting_hr) over w7      as rhr_dnu
  from public.user_health_daily d
  window w7 as (
    partition by d.user_id
    order by d.local_date
    rows between 7 preceding and 1 preceding
  )
),
calc as (
  select
    b.*,
    case when b.hrv_baseline7 > 0
         then (b.hrv_ms - b.hrv_baseline7) / b.hrv_baseline7 * 100
    end as hrv_delta_pct,
    (b.resting_hr - b.rhr_baseline7) as rhr_delta_bpm,
    (b.sleep_asleep_min / 480.0)     as sleep_ratio   -- cil 8 h
  from base b
)
select
  user_id,
  local_date,
  weight_kg, body_fat_pct, lean_mass_kg, bmi, body_source,
  steps, active_kcal, basal_kcal, total_kcal, exercise_min, distance_km,
  resting_hr, avg_hr, max_hr, hrv_ms, spo2, vo2max,
  sleep_asleep_min, sleep_deep_min, sleep_rem_min, sleep_efficiency_pct,
  workout_count, workout_min, workout_kcal, workout_types,

  -- baseline
  round(hrv_baseline7::numeric, 1)   as hrv_baseline7,
  round(rhr_baseline7::numeric, 1)   as rhr_baseline7,
  round(sleep_baseline7::numeric)    as sleep_baseline7,
  round(hrv_delta_pct::numeric, 1)   as hrv_delta_pct,
  round(rhr_delta_bpm::numeric, 1)   as rhr_delta_bpm,

  -- ---------- SKORE REGENERACE ----------
  case
    -- nedostatek dat -> zadne skore (nefabrikujeme)
    when hrv_dnu < 3 or rhr_dnu < 3 then null
    when hrv_ms is null or resting_hr is null then null
    else round((
        40 * least(greatest(1 + coalesce(hrv_delta_pct,0)/100, 0), 1.25) / 1.25
      + 30 * least(greatest(1 - coalesce(rhr_delta_bpm,0)/10, 0), 1)
      + 30 * least(greatest(coalesce(sleep_ratio, 0), 0), 1)
    )::numeric)
  end as recovery_score,

  case
    when hrv_dnu < 3 or rhr_dnu < 3          then 'nedostatek_dat'
    when hrv_ms is null                       then 'chybi_hrv'
    when resting_hr is null                   then 'chybi_klidovy_tep'
    when sleep_asleep_min is null             then 'chybi_spanek'
    else 'ok'
  end as recovery_status

from calc;

comment on view public.user_health_recovery is
  'Denni prehled + 7denni baseline + orientacni skore regenerace (0-100). NENI zdravotni diagnostika, je to ukazatel treninkove zateze. Pri nedostatku dat vraci NULL a duvod v recovery_status.';
