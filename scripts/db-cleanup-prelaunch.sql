-- BODY & MIND ON — pre-launch runtime cleanup (SQL variant)
-- DO NOT RUN without backup and explicit human confirmation.
-- Prefer: node scripts/db-cleanup-prelaunch.mjs --dry-run first.
--
-- APPLY gate (psql): set LOCAL only works in transaction; use manual review.
--   \set ON_ERROR_STOP on
--
-- KEEP: recipes_catalog, exercise_asset_registry, ai_agents*, ai_trigger_rules,
--       ai_task_types, ai_executor_bindings, ai_context_profiles, community_categories

BEGIN;

-- 1) Snapshot counts (for audit log — read only within txn before delete)
CREATE TEMP TABLE IF NOT EXISTS cleanup_before_counts AS
SELECT 'habit_logs' AS table_name, COUNT(*)::bigint AS row_count FROM public.habit_logs
UNION ALL SELECT 'workouts', COUNT(*) FROM public.workouts
UNION ALL SELECT 'user_meal_pins', COUNT(*) FROM public.user_meal_pins
UNION ALL SELECT 'user_habits', COUNT(*) FROM public.user_habits
UNION ALL SELECT 'user_checkins', COUNT(*) FROM public.user_checkins
UNION ALL SELECT 'user_ai_memory', COUNT(*) FROM public.user_ai_memory
UNION ALL SELECT 'ai_messages', COUNT(*) FROM public.ai_messages
UNION ALL SELECT 'ai_content_drafts', COUNT(*) FROM public.ai_content_drafts
UNION ALL SELECT 'ai_logs', COUNT(*) FROM public.ai_logs
UNION ALL SELECT 'ai_tasks', COUNT(*) FROM public.ai_tasks
UNION ALL SELECT 'ai_events', COUNT(*) FROM public.ai_events
UNION ALL SELECT 'withings_measurements', COUNT(*) FROM public.withings_measurements
UNION ALL SELECT 'withings_body_snapshots', COUNT(*) FROM public.withings_body_snapshots
UNION ALL SELECT 'withings_oauth_states', COUNT(*) FROM public.withings_oauth_states
UNION ALL SELECT 'withings_connections', COUNT(*) FROM public.withings_connections
UNION ALL SELECT 'ai_generated_plans', COUNT(*) FROM public.ai_generated_plans
UNION ALL SELECT 'body_metrics', COUNT(*) FROM public.body_metrics
UNION ALL SELECT 'memberships', COUNT(*) FROM public.memberships
UNION ALL SELECT 'profiles', COUNT(*) FROM public.profiles
UNION ALL SELECT 'recipes_catalog', COUNT(*) FROM public.recipes_catalog
UNION ALL SELECT 'exercise_asset_registry', COUNT(*) FROM public.exercise_asset_registry;

-- 2) Runtime deletes (FK-safe order)
DELETE FROM public.habit_logs;
DELETE FROM public.workouts;
DELETE FROM public.user_meal_pins;
DELETE FROM public.user_habits;
DELETE FROM public.user_checkins;
DELETE FROM public.user_ai_memory;
DELETE FROM public.ai_messages;
DELETE FROM public.ai_content_drafts;
DELETE FROM public.ai_logs;
DELETE FROM public.ai_tasks;
DELETE FROM public.ai_events;
DELETE FROM public.withings_measurements;
DELETE FROM public.withings_body_snapshots;
DELETE FROM public.withings_oauth_states;
DELETE FROM public.withings_connections;
DELETE FROM public.ai_generated_plans;
DELETE FROM public.body_metrics;
DELETE FROM public.memberships;
DELETE FROM public.community_replies;
DELETE FROM public.community_posts;
DELETE FROM public.nutrition_logs;
DELETE FROM public.fitness_goals;
DELETE FROM public.progress_tracking;
DELETE FROM public.subscriptions;
DELETE FROM public.ai_agents_logs;
DELETE FROM public.trainer_calendar_tokens;
DELETE FROM public.openai_response_cache;
DELETE FROM public.openai_daily_usage;
DELETE FROM public.meal_metadata_cache;
DELETE FROM public.exercise_metadata_cache;
DELETE FROM public._backup_2026_06_02_ai_agents;
DELETE FROM public._backup_2026_06_02_body_metrics;
DELETE FROM public._backup_2026_06_02_exercise_cache;
DELETE FROM public._backup_2026_06_02_meal_cache;
DELETE FROM public._backup_2026_06_02_memberships;
DELETE FROM public._backup_2026_06_02_plans;
DELETE FROM public._backup_2026_06_02_profiles;
DELETE FROM public._backup_2026_06_02_user_habits;
DELETE FROM public._backup_2026_06_02_users;
DELETE FROM public.profiles;

-- 3) Post-delete verification (must stay > 0 for catalogs)
DO $$
DECLARE
  recipes_cnt bigint;
  exercises_cnt bigint;
  agents_cnt bigint;
BEGIN
  SELECT COUNT(*) INTO recipes_cnt FROM public.recipes_catalog;
  SELECT COUNT(*) INTO exercises_cnt FROM public.exercise_asset_registry;
  SELECT COUNT(*) INTO agents_cnt FROM public.ai_agents;
  IF recipes_cnt < 1 THEN
    RAISE EXCEPTION 'SAFETY: recipes_catalog empty after cleanup';
  END IF;
  IF exercises_cnt < 1 THEN
    RAISE EXCEPTION 'SAFETY: exercise_asset_registry empty after cleanup';
  END IF;
  IF agents_cnt < 1 THEN
    RAISE EXCEPTION 'SAFETY: ai_agents empty after cleanup';
  END IF;
END $$;

-- 4) Auth users: DO NOT run in SQL blindly.
--    Use Supabase Auth Admin API after public data wipe:
--    node scripts/db-cleanup-prelaunch.mjs --apply
--    or delete per-email: node scripts/delete-user-by-email.mjs <email>
--
-- ROLLBACK;  -- default for dry review
-- COMMIT;    -- only after CONFIRM CLEAN DATABASE
