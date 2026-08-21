-- Recovery score works without sleep data (production sync via MCP).
-- When sleep is missing, HRV + resting HR components are scaled to 0–100.

CREATE OR REPLACE VIEW public.apple_health_recovery
WITH (security_invoker = true) AS
WITH base AS (
  SELECT
    d.user_id,
    d.local_date,
    d.hrv_ms,
    d.resting_hr,
    d.sleep_asleep_min,
    d.steps,
    d.active_kcal,
    d.exercise_min,
    d.workout_count,
    d.workout_min,
    d.workout_labels,
    avg(d.hrv_ms) OVER w7 AS hrv_baseline7,
    avg(d.resting_hr) OVER w7 AS rhr_baseline7,
    count(d.hrv_ms) OVER w7 AS hrv_dnu,
    count(d.resting_hr) OVER w7 AS rhr_dnu
  FROM public.apple_health_daily d
  WINDOW w7 AS (
    PARTITION BY d.user_id
    ORDER BY d.local_date
    ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING
  )
),
calc AS (
  SELECT
    b.*,
    CASE
      WHEN b.hrv_baseline7 > 0 THEN ((b.hrv_ms - b.hrv_baseline7) / b.hrv_baseline7) * 100
      ELSE NULL
    END AS hrv_delta_pct,
    (b.resting_hr - b.rhr_baseline7) AS rhr_delta_bpm,
    (b.sleep_asleep_min / 480.0) AS sleep_ratio
  FROM base b
),
scored AS (
  SELECT
    c.*,
    40::numeric * least(greatest(1 + coalesce(c.hrv_delta_pct, 0) / 100, 0), 1.25) / 1.25 AS hrv_comp,
    30::numeric * least(greatest(1 - coalesce(c.rhr_delta_bpm, 0) / 10, 0), 1) AS rhr_comp,
    30::numeric * least(greatest(coalesce(c.sleep_ratio, 0), 0), 1) AS sleep_comp
  FROM calc c
)
SELECT
  user_id,
  local_date,
  hrv_ms,
  resting_hr,
  sleep_asleep_min,
  steps,
  active_kcal,
  exercise_min,
  workout_count,
  workout_min,
  workout_labels,
  round(hrv_baseline7, 1) AS hrv_baseline7,
  round(rhr_baseline7, 1) AS rhr_baseline7,
  round(hrv_delta_pct, 1) AS hrv_delta_pct,
  round(rhr_delta_bpm, 1) AS rhr_delta_bpm,
  CASE
    WHEN hrv_dnu < 3 OR rhr_dnu < 3 THEN NULL::numeric
    WHEN hrv_ms IS NULL OR resting_hr IS NULL THEN NULL::numeric
    WHEN sleep_asleep_min IS NOT NULL THEN round(hrv_comp + rhr_comp + sleep_comp)
    ELSE round((hrv_comp + rhr_comp) / 70.0 * 100)
  END AS recovery_score,
  CASE
    WHEN hrv_dnu < 3 OR rhr_dnu < 3 THEN 'nedostatek_dat'
    WHEN hrv_ms IS NULL THEN 'chybi_hrv'
    WHEN resting_hr IS NULL THEN 'chybi_klidovy_tep'
    ELSE 'ok'
  END AS recovery_status,
  (sleep_asleep_min IS NOT NULL) AS has_sleep
FROM scored;

COMMENT ON VIEW public.apple_health_recovery IS 'Orientacni skore regenerace (0-100) z Apple Health. NENI zdravotni diagnostika. Skore funguje i bez udaju o spanku.';
