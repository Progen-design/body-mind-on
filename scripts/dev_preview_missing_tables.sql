-- Chybějící tabulky na dev projektu (qfufvsyhlbximanxayci) pro preview smoke testy.
-- Minimální schéma — NOT for production.

CREATE TABLE IF NOT EXISTS public.workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workout_date date NOT NULL,
  workout_type text,
  workout_name text,
  duration_min integer,
  notes text,
  perceived_difficulty text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Workouts policy" ON public.workouts;
CREATE POLICY "Workouts policy"
  ON public.workouts FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workouts TO authenticated;

CREATE TABLE IF NOT EXISTS public.user_habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  habit_id text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.user_habits ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_habits TO authenticated;

CREATE TABLE IF NOT EXISTS public.habit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  log_date date NOT NULL,
  habit_id text NOT NULL,
  completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.habit_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.habit_logs TO authenticated;

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  agent_slug text,
  task_type text,
  title text,
  content text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.ai_messages TO authenticated;
