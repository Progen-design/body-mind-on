-- workouts: explicitní WITH CHECK pro INSERT/UPDATE (stejně jako habit_logs)
-- Idempotentní oprava RLS politiky.

DROP POLICY IF EXISTS "Workouts policy" ON public.workouts;

CREATE POLICY "Workouts policy"
  ON public.workouts
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
