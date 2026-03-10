-- Add version and prompt_version to ai_agents for cache invalidation and governance
alter table if exists ai_agents add column if not exists version integer default 1;
alter table if exists ai_agents add column if not exists prompt_version integer default 1;
