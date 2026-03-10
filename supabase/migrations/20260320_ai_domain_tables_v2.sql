-- =============================================================================
-- Migration: AI domain tables v2
-- Date: 2026-03-20
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS guards).
--
-- Changes:
--   1. ai_messages          — canonical coach output table (delivery_channel, status)
--   2. ai_content_drafts    — normalized schema (content jsonb, task_type, agent_slug)
--   3. ai_logs              — add domain audit columns (action, event_id, result, error)
--   4. ai_tasks             — add max_attempts
--   5. ai_events            — add max_attempts
--   6. Indexes
-- =============================================================================


-- ─── 1. ai_messages ──────────────────────────────────────────────────────────
-- Canonical storage for all coach-generated user-facing messages.
-- Replaces ad-hoc ai_coach_messages for new flows.
create table if not exists ai_messages (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null,
  agent_slug       text not null,
  task_type        text not null,
  title            text,
  content          text not null,
  status           text not null default 'generated',  -- generated | delivered | read
  delivery_channel text not null default 'in_app',     -- in_app | email | push
  created_at       timestamp not null default now(),
  delivered_at     timestamp
);

create index if not exists idx_ai_messages_user
  on ai_messages(user_id);

create index if not exists idx_ai_messages_status
  on ai_messages(status, created_at desc);


-- ─── 2. ai_content_drafts ────────────────────────────────────────────────────
-- Normalized schema for marketing and social drafts.
-- content column is jsonb (structured draft payload).
create table if not exists ai_content_drafts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid,
  agent_slug text not null,
  task_type  text not null,
  title      text,
  content    jsonb not null default '{}',
  status     text not null default 'draft',  -- draft | approved | published | rejected
  created_at timestamp not null default now()
);

-- Add missing columns to existing table (idempotent)
alter table if exists ai_content_drafts
  add column if not exists task_type text;

alter table if exists ai_content_drafts
  add column if not exists content jsonb;

create index if not exists idx_ai_content_drafts_agent
  on ai_content_drafts(agent_slug, status);

create index if not exists idx_ai_content_drafts_created
  on ai_content_drafts(created_at desc);


-- ─── 3. ai_logs – add domain audit columns ───────────────────────────────────
-- Existing columns: id, task_id, user_id, agent_slug, status, cache_hit,
--   duration_ms, input_tokens, output_tokens, estimated_cost_usd, message, created_at
-- New columns for domain audit trail (event/task execution observability).
alter table if exists ai_logs
  add column if not exists event_id  uuid;

alter table if exists ai_logs
  add column if not exists action    text;

alter table if exists ai_logs
  add column if not exists payload   jsonb;

alter table if exists ai_logs
  add column if not exists result    jsonb;

alter table if exists ai_logs
  add column if not exists error     text;

create index if not exists idx_ai_logs_event
  on ai_logs(event_id);

create index if not exists idx_ai_logs_task
  on ai_logs(task_id);


-- ─── 4. ai_tasks – max_attempts ──────────────────────────────────────────────
alter table if exists ai_tasks
  add column if not exists max_attempts integer not null default 5;

alter table if exists ai_tasks
  add column if not exists processing_started_at timestamp;


-- ─── 5. ai_events – max_attempts ─────────────────────────────────────────────
alter table if exists ai_events
  add column if not exists max_attempts integer not null default 5;


-- ─── 6. Summary ──────────────────────────────────────────────────────────────
--
-- After this migration:
--   ✓ ai_messages        — coach stores real user-facing messages with delivery tracking
--   ✓ ai_content_drafts  — normalized schema: content jsonb, task_type, agent_slug
--   ✓ ai_logs            — full audit trail: action, event_id, result, error
--   ✓ ai_tasks           — max_attempts column for per-task retry budget control
--   ✓ ai_events          — max_attempts column for per-event retry budget control
-- =============================================================================
