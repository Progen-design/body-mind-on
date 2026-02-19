-- Doplnit chybějící sloupce v tabulce workouts (fix pro schema cache error)
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS duration_min int;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS notes text;
