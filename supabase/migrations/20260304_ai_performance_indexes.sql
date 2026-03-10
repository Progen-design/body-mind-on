-- =============================================================================
-- Migration: AI performance indexes, constraints, cache tables, task queue opt.
-- Project: body-mind-on
-- Date: 2026-03-04
-- Safe to run multiple times (IF NOT EXISTS / DO block guards).
-- =============================================================================

-- ─── STEP 1: Required tables ─────────────────────────────────────────────────

create table if not exists ai_generated_plans (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid,
  email             text,
  plan_type         text,
  plan_html         text,
  plan_markdown     text,
  daily_calories    numeric,
  macros            jsonb,
  workout_plan      jsonb,
  exercises_data    jsonb,
  meal_plan         jsonb,
  generated_by      text,
  generation_prompt text,
  user_context      jsonb,
  valid_from        date,
  valid_until       date,
  is_active         boolean default true,
  created_at        timestamp default now()
);

create table if not exists body_metrics (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid,
  email           text,
  name            text,
  gender          text,
  age             integer,
  height_cm       numeric,
  weight_kg       numeric,
  activity        text,
  stress          text,
  occupation      text,
  goal            text,
  weekly_sessions integer,
  diet_type       text,
  preferences     text,
  calories_target numeric,
  workout_days    text,
  created_at      timestamp default now(),
  updated_at      timestamp default now()
);

create table if not exists ai_agents (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  model         text not null default 'gpt-4.1',
  system_prompt text not null,
  temperature   numeric default 0.2,
  enabled       boolean default true,
  created_at    timestamp default now(),
  updated_at    timestamp default now()
);

create table if not exists ai_tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid,
  agent_slug   text not null,
  task_type    text not null,
  payload      jsonb,
  status       text default 'pending',
  result       jsonb,
  created_at   timestamp default now(),
  processed_at timestamp
);

create table if not exists user_ai_memory (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,
  agent_slug  text not null,
  memory_type text,
  content     text not null,
  created_at  timestamp default now(),
  updated_at  timestamp default now()
);

create table if not exists user_checkins (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  weight          numeric,
  stress_level    text,
  adherence_score numeric,
  notes           text,
  created_at      timestamp default now()
);

-- ─── STEP 2: Critical indexes ─────────────────────────────────────────────────

create index if not exists idx_ai_tasks_status      on ai_tasks(status);
create index if not exists idx_ai_tasks_user        on ai_tasks(user_id);
create index if not exists idx_ai_tasks_agent       on ai_tasks(agent_slug);
create index if not exists idx_ai_tasks_processing  on ai_tasks(status, created_at);

create index if not exists idx_ai_generated_plans_user    on ai_generated_plans(user_id);
create index if not exists idx_ai_generated_plans_created on ai_generated_plans(created_at desc);

create index if not exists idx_body_metrics_user on body_metrics(user_id);

create index if not exists idx_user_checkins_user    on user_checkins(user_id);
create index if not exists idx_user_checkins_created on user_checkins(created_at desc);

create index if not exists idx_user_ai_memory_user  on user_ai_memory(user_id);
create index if not exists idx_user_ai_memory_agent on user_ai_memory(agent_slug);

-- ─── STEP 3: Data safety constraints ─────────────────────────────────────────

alter table ai_tasks
  add column if not exists processed_at timestamp;

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
