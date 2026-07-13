-- Workout replacements — today-only alternative workouts (additive).

CREATE TABLE IF NOT EXISTS public.workout_replacements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL,
  plan_day text NOT NULL,
  original_workout jsonb NOT NULL,
  replacement_workout jsonb NOT NULL,
  selected_muscle_groups text[] NOT NULL,
  location text NULL,
  duration_minutes integer NULL,
  intensity text NULL,
  status text NOT NULL DEFAULT 'generated',
  generation_attempt integer NOT NULL DEFAULT 1,
  prompt_version text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz NULL,
  restored_at timestamptz NULL,
  expires_at timestamptz NULL,
  CONSTRAINT workout_replacements_status_check CHECK (
    status IN ('generated', 'confirmed', 'restored', 'expired', 'rejected')
  )
);

CREATE INDEX IF NOT EXISTS idx_workout_replacements_user_plan_day
  ON public.workout_replacements(user_id, plan_id, plan_day);

CREATE INDEX IF NOT EXISTS idx_workout_replacements_status
  ON public.workout_replacements(status);

ALTER TABLE public.workout_replacements ENABLE ROW LEVEL SECURITY;

CREATE POLICY workout_replacements_select_own ON public.workout_replacements
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE for authenticated — server-side only via service role.
