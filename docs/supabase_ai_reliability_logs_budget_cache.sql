-- AI reliability + observability + cost guardrails
-- Safe to run multiple times.

alter table if exists ai_tasks
  add column if not exists attempts integer not null default 0;

alter table if exists ai_tasks
  add column if not exists next_retry_at timestamp;

alter table if exists ai_tasks
  add column if not exists last_error text;

alter table if exists ai_tasks
  add column if not exists dead_lettered_at timestamp;

create index if not exists idx_ai_tasks_retry_due
  on ai_tasks(status, next_retry_at, created_at);

create table if not exists ai_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid,
  user_id uuid,
  agent_slug text,
  status text not null,
  cache_hit boolean not null default false,
  duration_ms integer,
  input_tokens integer,
  output_tokens integer,
  estimated_cost_usd numeric(12,6),
  message text,
  created_at timestamp not null default now()
);

create index if not exists idx_ai_logs_created
  on ai_logs(created_at desc);

create index if not exists idx_ai_logs_user
  on ai_logs(user_id);

create index if not exists idx_ai_logs_agent
  on ai_logs(agent_slug);

create table if not exists openai_daily_usage (
  usage_date date primary key,
  spent_usd numeric(12,6) not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  requests_count integer not null default 0,
  updated_at timestamp not null default now()
);

create table if not exists openai_response_cache (
  cache_key text primary key,
  raw_content text not null,
  expires_at timestamp not null,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create index if not exists idx_openai_response_cache_expiry
  on openai_response_cache(expires_at);

-- Cleanup guidance (no automatic deletes in this migration):
-- 1) ai_logs older than 90 days: archive or delete in background.
-- 2) openai_response_cache where expires_at < now(): periodic cleanup.
-- 3) ai_tasks in dlq: review manually or requeue by setting status='pending' and attempts=0.

