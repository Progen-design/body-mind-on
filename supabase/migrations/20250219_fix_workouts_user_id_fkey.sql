-- Oprava FK: workouts.user_id musí odkazovat na auth.users(id).
-- Chyba "workouts_user_id_fkey" často vzniká, když tabulka odkazovala na public.profiles/public.users
-- a tam uživatel z Auth ještě nemá záznam. Po této migraci se použije přímo auth.users.

ALTER TABLE workouts DROP CONSTRAINT IF EXISTS workouts_user_id_fkey;

ALTER TABLE workouts ADD CONSTRAINT workouts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
