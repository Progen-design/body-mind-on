-- =============================================================================
-- SUPABASE AI PERFORMANCE INDEXES & OPTIMIZATIONS
-- Project: body-mind-on
-- Generated: 2026-03-04
--
-- Purpose: Support scalable autonomous AI system with agents, scheduler tasks,
--          enrichment data, and user progress tracking.
--
-- Safety: All statements use IF NOT EXISTS / ON CONFLICT DO NOTHING.
--         Safe to run multiple times on the same database.
-- =============================================================================


-- =============================================================================
-- STEP 2 — CRITICAL INDEXES
-- =============================================================================

-- ── ai_tasks ─────────────────────────────────────────────────────────────────
-- Scheduler processes tasks by status; filtered by user and agent as well.
create index if not exists idx_ai_tasks_status
  on ai_tasks(status);

create index if not exists idx_ai_tasks_user
  on ai_tasks(user_id);

create index if not exists idx_ai_tasks_agent
  on ai_tasks(agent_slug);

-- ── ai_generated_plans ───────────────────────────────────────────────────────
-- Plan history queries ordered by newest plan first per user.
create index if not exists idx_ai_generated_plans_user
  on ai_generated_plans(user_id);

create index if not exists idx_ai_generated_plans_created
  on ai_generated_plans(created_at desc);

-- ── body_metrics ─────────────────────────────────────────────────────────────
-- Profile/context lookups are always scoped to a single user.
create index if not exists idx_body_metrics_user
  on body_metrics(user_id);

-- ── user_checkins ─────────────────────────────────────────────────────────────
-- Weekly progress queries ordered by most recent check-in per user.
create index if not exists idx_user_checkins_user
  on user_checkins(user_id);

create index if not exists idx_user_checkins_created
  on user_checkins(created_at desc);

-- ── user_ai_memory ────────────────────────────────────────────────────────────
-- Memory context queries are always (user × agent) scoped.
create index if not exists idx_user_ai_memory_user
  on user_ai_memory(user_id);

create index if not exists idx_user_ai_memory_agent
  on user_ai_memory(agent_slug);


-- =============================================================================
-- STEP 3 — DATA SAFETY CONSTRAINTS
-- =============================================================================

-- Prevent duplicate weekly plans for the same user.
-- If the constraint already exists, DO NOTHING (idempotent via DO block).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'uq_ai_generated_plans_user_valid_from'
  ) then
    alter table ai_generated_plans
      add constraint uq_ai_generated_plans_user_valid_from
      unique (user_id, valid_from);
  end if;
end;
$$;


-- =============================================================================
-- STEP 4 — CACHING TABLES
-- (Defined in supabase_enrichment_cache.sql; indexes added here.)
-- =============================================================================

-- meal_metadata_cache already has "text unique not null" on meal_name,
-- which creates an implicit index. This explicit named index enables fast
-- lookup by partial meal name patterns if needed.
create index if not exists idx_meal_cache_name
  on meal_metadata_cache(meal_name);

-- exercise_metadata_cache — same rationale.
create index if not exists idx_exercise_cache_name
  on exercise_metadata_cache(exercise_name);


-- =============================================================================
-- STEP 5 — TASK QUEUE OPTIMIZATION
-- =============================================================================

-- Column processed_at already defined in supabase_ai_tasks.sql.
-- Add it only if somehow absent (e.g., older database version).
alter table ai_tasks
  add column if not exists processed_at timestamp;

-- Composite index for the scheduler: fetch pending tasks ordered by creation.
-- Covers: WHERE status = 'pending' ORDER BY created_at
create index if not exists idx_ai_tasks_processing
  on ai_tasks(status, created_at);


-- =============================================================================
-- STEP 6 — CLEANUP STRATEGY (documentation only, no automatic deletion)
-- =============================================================================
--
-- ai_tasks
--   • Tasks older than 30 days with status IN ('done','error') can be archived.
--   • Suggested query (run manually or via pg_cron):
--       DELETE FROM ai_tasks
--       WHERE status IN ('done', 'error')
--         AND created_at < now() - interval '30 days';
--
-- ai_generated_plans
--   • Plans older than 1 year are unlikely to be needed for active users.
--   • Suggested archival:
--       INSERT INTO ai_generated_plans_archive SELECT * FROM ai_generated_plans
--       WHERE created_at < now() - interval '1 year';
--       DELETE FROM ai_generated_plans
--       WHERE created_at < now() - interval '1 year';
--
-- DO NOT run these statements automatically in this migration.
-- Schedule via Supabase pg_cron or an external cron job after review.
-- =============================================================================


-- =============================================================================
-- STEP 7 — RESULT SUMMARY
-- =============================================================================
--
-- After applying this migration the database supports:
--
--   ✓ Thousands of users           → user-scoped indexes on every table
--   ✓ Thousands of AI tasks        → status + processing composite index
--   ✓ Efficient scheduler queries  → idx_ai_tasks_processing (status, created_at)
--   ✓ Efficient plan history       → idx_ai_generated_plans_user + created
--   ✓ External API enrichment cache→ idx_meal_cache_name + idx_exercise_cache_name
--   ✓ Duplicate plan prevention    → uq_ai_generated_plans_user_valid_from
--
-- All statements are idempotent (IF NOT EXISTS / DO block guards).
-- =============================================================================
