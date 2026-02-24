-- user_habits – výběr návyků uživatele (které chce sledovat)
CREATE TABLE user_habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  habit_id text NOT NULL,
  is_positive boolean NOT NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, habit_id)
);

CREATE INDEX idx_user_habits_user ON user_habits (user_id);

ALTER TABLE user_habits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own user_habits"
  ON user_habits
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
