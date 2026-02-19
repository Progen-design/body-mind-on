-- Add duration_min if missing (fix for schema cache error)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workouts' AND column_name = 'duration_min'
  ) THEN
    ALTER TABLE workouts ADD COLUMN duration_min int;
  END IF;
END $$;
