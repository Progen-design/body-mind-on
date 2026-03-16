-- Supporting documents for AI agents (e.g. trainer). Server-side only; no file search.
-- Safe to run multiple times.

create table if not exists ai_supporting_documents (
  id uuid primary key default gen_random_uuid(),
  agent_slug text not null,
  title text not null,
  summary text not null,
  key_facts jsonb default '[]',
  source_id text,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_supporting_documents_agent
  on ai_supporting_documents(agent_slug) where enabled = true;

create index if not exists idx_ai_supporting_documents_sort
  on ai_supporting_documents(agent_slug, sort_order, created_at);

comment on table ai_supporting_documents is 'Documents loaded server-side into agent context (supporting_documents). No file search.';
