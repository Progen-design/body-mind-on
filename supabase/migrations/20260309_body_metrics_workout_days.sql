-- Volitelný výběr cvičících dnů (Po–Ne). Uložíme jako text např. '1,3,5' (Pondělí, Středa, Pátek).
-- Index: 0 = Neděle, 1 = Pondělí, …, 6 = Sobota (shodné s JavaScript getDay()).
ALTER TABLE body_metrics ADD COLUMN IF NOT EXISTS workout_days text DEFAULT NULL;
