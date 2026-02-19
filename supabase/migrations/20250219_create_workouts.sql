-- Workouts table for tracking user workouts
CREATE TABLE workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_date date NOT NULL,
  workout_type text,
  duration_min int,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient user workouts lookup by date (desc = most recent first)
CREATE INDEX idx_workouts_user_date ON workouts (user_id, workout_date DESC);

-- Enable Row Level Security
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can CRUD only their own workouts
CREATE POLICY "Users can CRUD own workouts"
  ON workouts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
