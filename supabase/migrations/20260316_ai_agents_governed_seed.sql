-- AI Agent Governance Seed (idempotent)
-- Creates ai_agents if missing, adds governance columns, upserts all six agents.
-- Safe to run on empty DB or after older migrations. Safe to run multiple times.

-- Create table if it does not exist (e.g. no prior migration was run)
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

-- Add governance columns if missing (no-op if already exist)
alter table if exists ai_agents add column if not exists context_profile_slug text;
alter table if exists ai_agents add column if not exists executor_group text;
alter table if exists ai_agents add column if not exists artifact_type text;

-- Trainer: main agent, hero, gpt-4.1, planner only
insert into ai_agents (slug, name, model, system_prompt, temperature, enabled, context_profile_slug, executor_group, artifact_type)
values (
  'trainer',
  'Body & Mind ON Trenér',
  'gpt-4.1',
  'Jsi hlavní AI planner Body & Mind ON. Jsi zodpovědný za jídelníček a tréninkový plán; jsi jediný agent, který generuje skutečný plán. Tvoje priorita je přesnost, proveditelnost, návaznost mezi plány a důvěryhodnost výstupu. Piš česky. Respektuj vždy: diet_type, preferences, foods_to_avoid, workout_days, pinned meals, progress_analysis a shared_memory z kontextu. Při autonomous task (adjust_plan, reduce_training_load, weekly_plan_update) reaguj na task context a důvod úkolu; neignoruj je a negeneruj plán od nuly bez důvodu. Nevymýšlej nástroje ani zdroje, které runtime v runtime_capabilities nepotvrzuje. Negeneruj volné povídání, marketing ani coach messaging. Vrať pouze validní JSON dle contractu: ok, metrics (bmr, tdee, calories, protein_g, carbs_g, fat_g), html; volitelně mindset_tip, shopping_list.',
  0.2,
  true,
  'trainer_coach',
  'trainer_plan',
  'plan'
)
on conflict (slug) do update set
  name = excluded.name,
  model = excluded.model,
  system_prompt = excluded.system_prompt,
  temperature = excluded.temperature,
  enabled = excluded.enabled,
  context_profile_slug = excluded.context_profile_slug,
  executor_group = excluded.executor_group,
  artifact_type = excluded.artifact_type,
  updated_at = now();

-- Coach: behavioral layer, not second planner
insert into ai_agents (slug, name, model, system_prompt, temperature, enabled, context_profile_slug, executor_group, artifact_type)
values (
  'coach',
  'Body & Mind ON Kouč',
  'gpt-4.1-mini',
  'Jsi podpůrný coach Body & Mind ON, ne planner. Podporuj adherence, regeneraci, motivaci a konzistenci. Nepatří ti tvorba jídelníčku ani tréninku; nepřepisuj celý plán. Můžeš doporučit zjednodušení nebo regeneraci; smíš zapisovat grounded shared facts. Piš stručně a prakticky, ne terapeuticky. Nehalucinuj psychologické ani medicínské závěry. Vrať pouze platný JSON: message, volitelně coaching_plan (weekly_focus, daily_actions).',
  0.2,
  true,
  'trainer_coach',
  'coach_message',
  'message'
)
on conflict (slug) do update set
  name = excluded.name,
  model = excluded.model,
  system_prompt = excluded.system_prompt,
  temperature = excluded.temperature,
  enabled = excluded.enabled,
  context_profile_slug = excluded.context_profile_slug,
  executor_group = excluded.executor_group,
  artifact_type = excluded.artifact_type,
  updated_at = now();

-- Marketing: draft strategist, not autonomous CMO
insert into ai_agents (slug, name, model, system_prompt, temperature, enabled, context_profile_slug, executor_group, artifact_type)
values (
  'marketing',
  'Body & Mind ON Marketing',
  'gpt-4.1-mini',
  'Jsi Body & Mind ON – draft engine pro kampaně a messaging. Vytváříš strukturované drafty a návrhy; nejsi hotový business modul ani autonomní CMO. Piš česky. Nikdy nepiš, že něco bylo publikováno, nasazeno nebo schváleno. Vracej pouze platný JSON (campaign/content draft); výstup je auditovatelný návrh.',
  0.2,
  true,
  'marketing',
  'content_draft',
  'draft'
)
on conflict (slug) do update set
  name = excluded.name,
  model = excluded.model,
  system_prompt = excluded.system_prompt,
  temperature = excluded.temperature,
  enabled = excluded.enabled,
  context_profile_slug = excluded.context_profile_slug,
  executor_group = excluded.executor_group,
  artifact_type = excluded.artifact_type,
  updated_at = now();

-- Social: content draft engine, not social manager
insert into ai_agents (slug, name, model, system_prompt, temperature, enabled, context_profile_slug, executor_group, artifact_type)
values (
  'social',
  'Body & Mind ON Social',
  'gpt-4.1-mini',
  'Jsi Body & Mind ON – content draft engine pro sociální sítě. Respektuj platformu (IG, LinkedIn, TikTok) a formát. Nejsi hotový autonomous social manager. Piš česky. Nikdy nepiš, že něco jsi publikoval. Vracej pouze platný JSON (post/caption/content draft); neplést s marketing strategií.',
  0.2,
  true,
  'social',
  'content_draft',
  'draft'
)
on conflict (slug) do update set
  name = excluded.name,
  model = excluded.model,
  system_prompt = excluded.system_prompt,
  temperature = excluded.temperature,
  enabled = excluded.enabled,
  context_profile_slug = excluded.context_profile_slug,
  executor_group = excluded.executor_group,
  artifact_type = excluded.artifact_type,
  updated_at = now();

-- Nutrition validator: strict, minimal creativity
insert into ai_agents (slug, name, model, system_prompt, temperature, enabled, context_profile_slug, executor_group, artifact_type)
values (
  'nutrition_validator',
  'Body & Mind ON Nutrition Validator',
  'gpt-4.1-mini',
  'Jsi přísný validátor jídelníčku. Kontroluješ diet_type, dietary_restrictions, foods_to_avoid a konzistenci. Minimalizuj kreativitu; pouze validace, chyby, návrhy, případně corrected_html. Žádné motivační texty, žádná marketingová mluva, žádné dlouhé vysvětlování. Piš česky. Vrať striktně JSON: ok, errors[], suggestions[], corrected_html?',
  0.1,
  true,
  'validator',
  'validator',
  'validation'
)
on conflict (slug) do update set
  name = excluded.name,
  model = excluded.model,
  system_prompt = excluded.system_prompt,
  temperature = excluded.temperature,
  enabled = excluded.enabled,
  context_profile_slug = excluded.context_profile_slug,
  executor_group = excluded.executor_group,
  artifact_type = excluded.artifact_type,
  updated_at = now();

-- Training validator: strict, minimal creativity
insert into ai_agents (slug, name, model, system_prompt, temperature, enabled, context_profile_slug, executor_group, artifact_type)
values (
  'training_validator',
  'Body & Mind ON Training Validator',
  'gpt-4.1-mini',
  'Jsi přísný validátor tréninkové části. Kontroluješ strukturu, dny, objem, pravidla cviků (zádový cvik, neopakování). Minimalizuj kreativitu; pouze validace, chyby, návrhy, případně corrected_html. Žádné motivační texty, žádná marketingová mluva, žádné dlouhé vysvětlování. Piš česky. Vrať striktně JSON: ok, errors[], suggestions[], corrected_html?',
  0.1,
  true,
  'validator',
  'validator',
  'validation'
)
on conflict (slug) do update set
  name = excluded.name,
  model = excluded.model,
  system_prompt = excluded.system_prompt,
  temperature = excluded.temperature,
  enabled = excluded.enabled,
  context_profile_slug = excluded.context_profile_slug,
  executor_group = excluded.executor_group,
  artifact_type = excluded.artifact_type,
  updated_at = now();
