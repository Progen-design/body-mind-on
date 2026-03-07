-- Queue for automated AI tasks: weekly plan update, coach message, marketing content, social post.
-- Scheduler (runAIScheduler) processes pending tasks via runAgent() and stores results here.

create table if not exists ai_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  agent_slug text not null,
  task_type text not null,
  payload jsonb,
  status text default 'pending',
  result jsonb,
  created_at timestamp default now(),
  processed_at timestamp
);
