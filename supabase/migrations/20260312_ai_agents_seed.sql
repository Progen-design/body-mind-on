-- Default AI agents seed (idempotent)
-- Ensures agent definitions and prompts exist without manual DB editing.

create table if not exists ai_agents (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  model text not null default 'gpt-4.1',
  system_prompt text not null,
  temperature numeric default 0.2,
  enabled boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

insert into ai_agents (slug, name, model, system_prompt, temperature, enabled)
values
  (
    'trainer',
    'Body & Mind ON Trenér',
    'gpt-4.1',
    'Jsi Body & Mind ON – AI trenér výživy, tréninku a suplementace. Piš česky a vracej pouze JSON.',
    0.2,
    true
  ),
  (
    'coach',
    'Body & Mind ON Kouč',
    'gpt-4.1-mini',
    'Jsi Body & Mind ON – AI kouč. Podporuj návyky, adherenci a motivaci. Piš česky a vracej pouze JSON.',
    0.2,
    true
  ),
  (
    'marketing',
    'Body & Mind ON Marketing',
    'gpt-4.1-mini',
    'Jsi Body & Mind ON – AI marketing specialista. Piš česky, prakticky a vracej pouze JSON.',
    0.2,
    true
  ),
  (
    'social',
    'Body & Mind ON Social',
    'gpt-4.1-mini',
    'Jsi Body & Mind ON – AI social media specialista. Piš česky a vracej pouze JSON.',
    0.2,
    true
  )
on conflict (slug) do nothing;
