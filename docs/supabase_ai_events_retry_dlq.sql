-- AI events reliability hardening (idempotent)
-- Adds retry/defer columns so event queue can self-heal like ai_tasks.

alter table if exists ai_events add column if not exists attempts integer not null default 0;
alter table if exists ai_events add column if not exists next_retry_at timestamp;
alter table if exists ai_events add column if not exists last_error text;
alter table if exists ai_events add column if not exists dead_lettered_at timestamp;

create index if not exists idx_ai_events_retry_due on ai_events(status, next_retry_at, created_at);
create index if not exists idx_ai_events_attempts on ai_events(status, attempts, created_at);
