-- AI autonomy event queue (event-driven layer)
-- Safe to run multiple times.

create table if not exists ai_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  user_id uuid not null,
  payload jsonb,
  status text not null default 'pending',
  result jsonb,
  created_at timestamp default now(),
  processed_at timestamp
);

create index if not exists idx_ai_events_status_created
  on ai_events(status, created_at);

create index if not exists idx_ai_events_user
  on ai_events(user_id);

create index if not exists idx_ai_events_type
  on ai_events(event_type);

