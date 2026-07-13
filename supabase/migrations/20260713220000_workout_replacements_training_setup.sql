-- Oddělené místo a vybavení u workout replacements (nullable, zpětně kompatibilní).
ALTER TABLE public.workout_replacements
  ADD COLUMN IF NOT EXISTS training_location text NULL,
  ADD COLUMN IF NOT EXISTS equipment_level text NULL;

COMMENT ON COLUMN public.workout_replacements.training_location IS 'home | gym | outdoor';
COMMENT ON COLUMN public.workout_replacements.equipment_level IS 'bodyweight | basic | full_gym';
