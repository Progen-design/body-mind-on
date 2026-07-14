-- =============================================================================
-- user_health_daily
-- JEDNO ctecí rozhrani pro profil: sloucí Withings + Apple Health do jedne rady/den.
--
-- Prioritizace zdroju (deduplikace):
--   * telesne slozeni (vaha, % tuku, svaly...)  -> WITHINGS ma prednost
--     (merici vaha je presnejsi nez to, co do Apple Health propise Withings app;
--      Apple Health se pouzije jen kdyz Withings pro dany den nic nema)
--   * aktivita, tep, HRV, spanek, treninky       -> APPLE HEALTH (jediny zdroj)
--
-- Frontend cte POUZE tento view. Nemusi resit, odkud data prisla.
-- =============================================================================

create or replace view public.user_health_daily
with (security_invoker = true)
as
with
-- 1) Telesne slozeni z Withings (primarni zdroj) - posledni mereni za den
wi as (
  select distinct on (user_id, (measured_at at time zone 'Europe/Prague')::date)
    user_id,
    (measured_at at time zone 'Europe/Prague')::date as local_date,
    weight_kg,
    fat_percent,
    fat_mass_kg,
    muscle_mass_kg,
    bone_mass_kg,
    hydration_percent,
    bmi,
    basal_metabolic_rate,
    visceral_fat
  from public.withings_body_snapshots
  order by user_id, (measured_at at time zone 'Europe/Prague')::date, measured_at desc
),
-- 2) Vsechno z Apple Health
ah as (
  select * from public.apple_health_daily
),
-- 3) Vsechny dny, kde existuje aspon neco
days as (
  select user_id, local_date from wi
  union
  select user_id, local_date from ah
)
select
  d.user_id,
  d.local_date,

  -- ---------- TELESNE SLOZENI (Withings > Apple Health) ----------
  coalesce(wi.weight_kg,  ah.weight_kg)     as weight_kg,
  coalesce(wi.fat_percent, ah.body_fat_pct) as body_fat_pct,
  wi.fat_mass_kg,
  wi.muscle_mass_kg,
  coalesce(ah.lean_mass_kg, wi.muscle_mass_kg) as lean_mass_kg,
  wi.bone_mass_kg,
  wi.hydration_percent,
  coalesce(wi.bmi, ah.bmi)                  as bmi,
  wi.basal_metabolic_rate                   as bmr_withings,
  wi.visceral_fat,
  case
    when wi.weight_kg is not null then 'withings'
    when ah.weight_kg is not null then 'apple_health'
    else null
  end                                       as body_source,

  -- ---------- AKTIVITA (Apple Health) ----------
  ah.steps,
  ah.active_kcal,
  ah.basal_kcal,
  ah.total_kcal,
  ah.exercise_min,
  ah.stand_hours,
  ah.distance_km,
  ah.cycling_km,
  ah.swimming_m,
  ah.flights,
  ah.daylight_min,

  -- ---------- SRDCE / REGENERACE (Apple Health) ----------
  ah.resting_hr,
  ah.avg_hr,
  ah.min_hr,
  ah.max_hr,
  ah.hrv_ms,
  ah.walking_hr,
  ah.respiratory_rate,
  ah.spo2,
  ah.vo2max,

  -- ---------- SPANEK (Apple Health) ----------
  ah.sleep_asleep_min,
  ah.sleep_deep_min,
  ah.sleep_rem_min,
  ah.sleep_core_min,
  ah.sleep_awake_min,
  ah.sleep_efficiency_pct,

  -- ---------- TRENINKY (Apple Health) ----------
  ah.workout_count,
  ah.workout_min,
  ah.workout_kcal,
  ah.workout_max_hr,
  ah.workout_types,

  -- ---------- METADATA ----------
  (wi.user_id is not null) as has_withings,
  (ah.user_id is not null) as has_apple_health

from days d
left join wi on wi.user_id = d.user_id and wi.local_date = d.local_date
left join ah on ah.user_id = d.user_id and ah.local_date = d.local_date;

comment on view public.user_health_daily is
  'Sjednoceny denni zdravotni prehled pro profil. Withings ma prednost u telesneho slozeni, Apple Health dodava aktivitu/tep/HRV/spanek/treninky. Frontend cte pouze tento view.';
