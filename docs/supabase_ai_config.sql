create table if not exists ai_config (
  id uuid primary key default gen_random_uuid(),
  model text not null default 'gpt-4.1',
  system_prompt text not null,
  temperature numeric default 0.2,
  updated_at timestamp default now()
);

insert into ai_config (model, system_prompt, temperature)
select
  'gpt-4.1',
  'Jsi Body & Mind ON – AI trenér výživy, tréninku, suplementace a mindsetu. Piš česky a vracej pouze JSON.',
  0.2
where not exists (select 1 from ai_config limit 1);
