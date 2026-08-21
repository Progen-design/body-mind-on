-- Add last_measured_at to apple_health_metrics_daily (production sync via MCP).

CREATE OR REPLACE VIEW public.apple_health_metrics_daily
WITH (security_invoker = true) AS
WITH conv AS (
  SELECT
    m.user_id,
    m.local_date,
    m.metric_name,
    COALESCE(d.label_cs, m.metric_name) AS label_cs,
    COALESCE(d.category, 'ostatni') AS category,
    COALESCE(d.agg, 'avg') AS agg,
    COALESCE(d.canonical_unit, m.unit) AS unit,
    COALESCE(d.is_key, false) AS is_key,
    CASE
      WHEN d.from_unit IS NOT NULL
        AND lower(m.unit) = lower(d.from_unit)
        AND d.factor IS NOT NULL
        THEN m.qty * d.factor
      ELSE m.qty
    END AS qty,
    m.min_value,
    m.max_value,
    m.measured_at
  FROM public.apple_health_metrics m
  LEFT JOIN public.apple_health_metric_defs d ON d.metric_name = m.metric_name
)
SELECT
  user_id,
  local_date,
  metric_name,
  label_cs,
  category,
  unit,
  agg,
  is_key,
  CASE agg
    WHEN 'sum' THEN sum(qty)
    WHEN 'max' THEN max(qty)
    WHEN 'min' THEN min(qty)
    WHEN 'last' THEN (array_agg(qty ORDER BY measured_at DESC))[1]
    ELSE avg(qty)
  END AS value,
  min(COALESCE(min_value, qty)) AS min_value,
  max(COALESCE(max_value, qty)) AS max_value,
  count(*) AS samples,
  max(measured_at) AS last_measured_at
FROM conv
GROUP BY user_id, local_date, metric_name, label_cs, category, unit, agg, is_key;

COMMENT ON VIEW public.apple_health_metrics_daily IS 'Vsechny metriky Apple Health po dnech, agregovane dle apple_health_metric_defs. Zadny whitelist - nova metrika projde automaticky.';
