-- Potraviny k vynechání z jídelníčku (konkrétní položky, které nemají být v plánu)
ALTER TABLE public.body_metrics
  ADD COLUMN IF NOT EXISTS foods_to_avoid text;

COMMENT ON COLUMN public.body_metrics.foods_to_avoid IS 'Konkrétní potraviny k vynechání z jídelníčku (např. avokádo, brokolice, banány) – oddělené čárkou';
