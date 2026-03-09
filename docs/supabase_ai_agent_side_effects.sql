-- AI task side-effect persistence (idempotent)
-- Coach messages and marketing/social drafts become first-class DB artifacts.

create table if not exists ai_coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  task_id uuid,
  message_type text not null,
  title text,
  message text not null,
  payload jsonb,
  status text not null default 'ready',
  created_at timestamp default now()
);

create index if not exists idx_ai_coach_messages_user_created
  on ai_coach_messages(user_id, created_at desc);

create index if not exists idx_ai_coach_messages_status
  on ai_coach_messages(status, created_at desc);

create table if not exists ai_content_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  task_id uuid,
  agent_slug text not null,
  content_type text not null,
  title text,
  payload jsonb,
  status text not null default 'draft',
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create index if not exists idx_ai_content_drafts_agent_status
  on ai_content_drafts(agent_slug, status, created_at desc);

create index if not exists idx_ai_content_drafts_user_created
  on ai_content_drafts(user_id, created_at desc);
