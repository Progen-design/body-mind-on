-- Add structured_plan_json to ai_generated_plans for unified pipeline.
-- Single source of truth: structured JSON → rendered HTML.
-- Safe to run: IF NOT EXISTS.

ALTER TABLE ai_generated_plans
ADD COLUMN IF NOT EXISTS structured_plan_json jsonb;

COMMENT ON COLUMN ai_generated_plans.structured_plan_json IS 'Canonical structured plan (days, targets, meals, workouts). HTML is rendered from this.';
