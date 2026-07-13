-- Skutečná tělesná měření (odděleně od registračního body_metrics snapshotu).
CREATE TABLE IF NOT EXISTS public.body_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  measured_at timestamptz NOT NULL DEFAULT now(),
  weight_kg numeric NULL,
  waist_cm numeric NULL,
  hips_cm numeric NULL,
  chest_cm numeric NULL,
  arm_cm numeric NULL,
  source text NOT NULL DEFAULT 'manual',
  source_record_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT body_measurements_weight_range CHECK (
    weight_kg IS NULL OR (weight_kg > 20 AND weight_kg < 400)
  ),
  CONSTRAINT body_measurements_waist_range CHECK (
    waist_cm IS NULL OR (waist_cm > 20 AND waist_cm < 300)
  ),
  CONSTRAINT body_measurements_hips_range CHECK (
    hips_cm IS NULL OR (hips_cm > 20 AND hips_cm < 300)
  ),
  CONSTRAINT body_measurements_chest_range CHECK (
    chest_cm IS NULL OR (chest_cm > 20 AND chest_cm < 300)
  ),
  CONSTRAINT body_measurements_arm_range CHECK (
    arm_cm IS NULL OR (arm_cm > 20 AND arm_cm < 300)
  ),
  CONSTRAINT body_measurements_has_value CHECK (
    weight_kg IS NOT NULL
    OR waist_cm IS NOT NULL
    OR hips_cm IS NOT NULL
    OR chest_cm IS NOT NULL
    OR arm_cm IS NOT NULL
  ),
  CONSTRAINT body_measurements_source_check CHECK (
    source IN ('manual', 'withings', 'integration')
  )
);

CREATE INDEX IF NOT EXISTS idx_body_measurements_user_measured
  ON public.body_measurements(user_id, measured_at DESC);

ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY body_measurements_select_own
  ON public.body_measurements FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY body_measurements_insert_own
  ON public.body_measurements FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY body_measurements_update_own
  ON public.body_measurements FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY body_measurements_delete_own
  ON public.body_measurements FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND source = 'manual');

REVOKE ALL ON public.body_measurements FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.body_measurements TO authenticated;

COMMENT ON TABLE public.body_measurements IS 'User body measurements with source tracking; no modeled values.';
