-- Habit logs – denní záznamy návyků uživatele
CREATE TABLE habit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  habit_id text NOT NULL,
  completed boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, log_date, habit_id)
);

-- Index pro rychlé načítání
CREATE INDEX idx_habit_logs_user_date ON habit_logs (user_id, log_date DESC);

-- RLS
ALTER TABLE habit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own habit_logs"
  ON habit_logs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
