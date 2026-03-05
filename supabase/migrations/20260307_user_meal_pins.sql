-- user_meal_pins: která jídla má uživatel označená pro zahrnutí do dalšího plánu
CREATE TABLE IF NOT EXISTS public.user_meal_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meal_type text NOT NULL,
  meal_text text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, meal_type, meal_text)
);

CREATE INDEX idx_user_meal_pins_user ON public.user_meal_pins(user_id);
ALTER TABLE public.user_meal_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own meal pins"
  ON public.user_meal_pins FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
