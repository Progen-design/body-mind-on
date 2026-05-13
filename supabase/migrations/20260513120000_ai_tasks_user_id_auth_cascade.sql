-- ON DELETE CASCADE: remove ai_tasks when auth user is deleted (avoid zombie tasks).
-- Note: deleting a user removes task history for that user.

ALTER TABLE public.ai_tasks
  DROP CONSTRAINT IF EXISTS ai_tasks_user_id_fkey;

ALTER TABLE public.ai_tasks
  ADD CONSTRAINT ai_tasks_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;
