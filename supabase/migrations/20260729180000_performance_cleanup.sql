-- Performance cleanup — behavior-preserving.
-- Řeší nálezy Supabase performance advisoru z 2026-07-29:
--   auth_rls_initplan (31), duplicate_index (3), multiple_permissive_policies (12),
--   function_search_path_mutable (8 z 9), unindexed_foreign_keys (6), no_primary_key (9).
-- Žádná změna přístupových práv — všechny výrazy zůstávají sémanticky identické.

-- ---------------------------------------------------------------------------
-- 1) users: odstranění staré duplicitní politiky
--    "Users can view own data" (FOR ALL, PUBLIC) se překrývá s users_self_select
--    a users_self_update. Ty pokrývají SELECT i UPDATE se stejnou podmínkou,
--    takže smazáním se nic neztrácí — jen zmizí 12 multiple_permissive_policies
--    a jeden auth_rls_initplan nález.
-- ---------------------------------------------------------------------------
DROP POLICY "Users can view own data" ON public.users;

-- ---------------------------------------------------------------------------
-- 2) auth.uid() -> (SELECT auth.uid()) ve zbývajících 30 politikách
--    Postgres pak vyhodnotí auth.uid() jednou jako InitPlan místo per-row.
-- ---------------------------------------------------------------------------

-- users
ALTER POLICY "users_self_select" ON public.users
  USING (((SELECT auth.uid()) = id));
ALTER POLICY "users_self_update" ON public.users
  USING (((SELECT auth.uid()) = id))
  WITH CHECK (((SELECT auth.uid()) = id));

-- politiky bez FOR/TO (FOR ALL, PUBLIC) — WITH CHECK zůstává NULL, tedy
-- se pro zápis použije USING, přesně jako dosud
ALTER POLICY "AI plans policy" ON public.ai_generated_plans
  USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Fitness goals policy" ON public.fitness_goals
  USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Nutrition policy" ON public.nutrition_logs
  USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Progress policy" ON public.progress_tracking
  USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "Subscriptions policy" ON public.subscriptions
  USING (((SELECT auth.uid()) = user_id));

ALTER POLICY "Users can CRUD own habit_logs" ON public.habit_logs
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can CRUD own user_habits" ON public.user_habits
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "Users can manage own meal pins" ON public.user_meal_pins
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

-- wearables / beta
ALTER POLICY "withings_body_snapshots_select_own" ON public.withings_body_snapshots
  USING (((SELECT auth.uid()) = user_id));
ALTER POLICY "beta_feedback_insert_own" ON public.beta_feedback
  WITH CHECK ((user_id = (SELECT auth.uid())));

-- daily_activity_completions
ALTER POLICY "daily_activity_completions_select_own" ON public.daily_activity_completions
  USING ((user_id = (SELECT auth.uid())));
ALTER POLICY "daily_activity_completions_insert_own" ON public.daily_activity_completions
  WITH CHECK ((user_id = (SELECT auth.uid())));
ALTER POLICY "daily_activity_completions_delete_own" ON public.daily_activity_completions
  USING ((user_id = (SELECT auth.uid())));

-- daily_checkins
ALTER POLICY "daily_checkins_select_own" ON public.daily_checkins
  USING ((user_id = (SELECT auth.uid())));
ALTER POLICY "daily_checkins_insert_own" ON public.daily_checkins
  WITH CHECK ((user_id = (SELECT auth.uid())));
ALTER POLICY "daily_checkins_update_own" ON public.daily_checkins
  USING ((user_id = (SELECT auth.uid())))
  WITH CHECK ((user_id = (SELECT auth.uid())));

-- community_posts
ALTER POLICY "community_posts_insert_authenticated" ON public.community_posts
  WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "community_posts_update_own" ON public.community_posts
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "community_posts_delete_own" ON public.community_posts
  USING (((SELECT auth.uid()) = user_id));

-- community_replies
ALTER POLICY "community_replies_insert_authenticated" ON public.community_replies
  WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "community_replies_update_own" ON public.community_replies
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));
ALTER POLICY "community_replies_delete_own" ON public.community_replies
  USING (((SELECT auth.uid()) = user_id));

-- product_events
ALTER POLICY "product_events_insert_own" ON public.product_events
  WITH CHECK ((user_id = (SELECT auth.uid())));

-- workout_replacements
ALTER POLICY "workout_replacements_select_own" ON public.workout_replacements
  USING (((SELECT auth.uid()) = user_id));

-- body_measurements (delete si drží dodatečnou podmínku source = 'manual')
ALTER POLICY "body_measurements_select_own" ON public.body_measurements
  USING ((user_id = (SELECT auth.uid())));
ALTER POLICY "body_measurements_insert_own" ON public.body_measurements
  WITH CHECK ((user_id = (SELECT auth.uid())));
ALTER POLICY "body_measurements_update_own" ON public.body_measurements
  USING ((user_id = (SELECT auth.uid())))
  WITH CHECK ((user_id = (SELECT auth.uid())));
ALTER POLICY "body_measurements_delete_own" ON public.body_measurements
  USING (((user_id = (SELECT auth.uid())) AND (source = 'manual'::text)));

-- ---------------------------------------------------------------------------
-- 3) Duplicitní indexy
--    Ověřeno v baseline_schema.sql — všechny tři dvojice jsou btree nad
--    identickými sloupci a žádný z nich nepodpírá constraint.
-- ---------------------------------------------------------------------------
DROP INDEX public.idx_body_metrics_user;            -- duplikát idx_body_metrics_user_id (user_id)
DROP INDEX public.idx_exercise_registry_canonical;  -- duplikát idx_exercise_asset_registry_key (canonical_key)
DROP INDEX public.idx_meal_cache_name;              -- duplikát idx_meal_metadata_cache_meal_name (meal_name)

-- ---------------------------------------------------------------------------
-- 4) Fixace search_path u funkcí
--    Těla všech osmi jsou v repu ověřená: odkazují buď jen na pg_catalog
--    (now, round, power, lower, coalesce, least, greatest), nebo na plně
--    kvalifikované public.* tabulky. Prázdný search_path je tedy nerozbije.
--
--    enforce_recipe_catalog_rules ZDE ZÁMĚRNĚ CHYBÍ — její definice v repu
--    není (drift oproti produkci), takže nelze ověřit, že nepoužívá
--    nekvalifikované názvy. Viz otevřené otázky.
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.calculate_bmi() SET search_path = '';
ALTER FUNCTION public.calculate_tdee(numeric, numeric, integer, character varying, character varying) SET search_path = '';
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';
ALTER FUNCTION public.bm_fill_calculated_fields() SET search_path = '';
ALTER FUNCTION public.set_updated_at() SET search_path = '';
ALTER FUNCTION public.prevent_task_without_metrics() SET search_path = '';
ALTER FUNCTION public.handle_force_regenerate_task() SET search_path = '';
ALTER FUNCTION public.block_ai_task_inserts() SET search_path = '';

-- ---------------------------------------------------------------------------
-- 5) Indexy nad cizími klíči bez krytí
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_beta_email_messages_user_id
  ON public.beta_email_messages (user_id);
CREATE INDEX IF NOT EXISTS idx_beta_issues_participant_id
  ON public.beta_issues (participant_id);
CREATE INDEX IF NOT EXISTS idx_community_replies_user_id
  ON public.community_replies (user_id);
CREATE INDEX IF NOT EXISTS idx_fitness_goals_user_id
  ON public.fitness_goals (user_id);
CREATE INDEX IF NOT EXISTS idx_ingredient_normalization_misses_plan_id
  ON public.ingredient_normalization_misses (plan_id);
CREATE INDEX IF NOT EXISTS idx_withings_body_snapshots_connection_id
  ON public.withings_body_snapshots (connection_id);

-- ---------------------------------------------------------------------------
-- 6) Smazání záložních tabulek _backup_2026_06_02_*
--    Pojistka: pokud v kterékoli z nich něco je, migrace spadne a nic nesmaže.
--    DROP je bez CASCADE — pokud na tabulce visí view nebo FK, taky spadne.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    '_backup_2026_06_02_ai_agents',
    '_backup_2026_06_02_body_metrics',
    '_backup_2026_06_02_exercise_cache',
    '_backup_2026_06_02_meal_cache',
    '_backup_2026_06_02_memberships',
    '_backup_2026_06_02_plans',
    '_backup_2026_06_02_profiles',
    '_backup_2026_06_02_user_habits',
    '_backup_2026_06_02_users'
  ]
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'public.% obsahuje % řádků — smazání zastaveno, prověř ručně', t, n;
    END IF;
  END LOOP;
END
$$;

DROP TABLE public._backup_2026_06_02_ai_agents;
DROP TABLE public._backup_2026_06_02_body_metrics;
DROP TABLE public._backup_2026_06_02_exercise_cache;
DROP TABLE public._backup_2026_06_02_meal_cache;
DROP TABLE public._backup_2026_06_02_memberships;
DROP TABLE public._backup_2026_06_02_plans;
DROP TABLE public._backup_2026_06_02_profiles;
DROP TABLE public._backup_2026_06_02_user_habits;
DROP TABLE public._backup_2026_06_02_users;
