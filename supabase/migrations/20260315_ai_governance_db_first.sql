-- AI governance: DB-first control plane
-- Extends ai_agents, adds ai_task_types, ai_trigger_rules, ai_context_profiles, ai_executor_bindings, ai_agent_versions.
-- Extends ai_tasks with idempotency_key, source_event_id, processing_started_at, artifact_id.
-- Safe to run multiple times (add column if not exists, create table if not exists).

-- ─── 1) Extend ai_agents ─────────────────────────────────────────────────────
alter table if exists ai_agents add column if not exists context_profile_slug text;
alter table if exists ai_agents add column if not exists default_output_contract jsonb;
alter table if exists ai_agents add column if not exists executor_group text;
alter table if exists ai_agents add column if not exists artifact_type text;
alter table if exists ai_agents add column if not exists is_published boolean default true;
-- version, prompt_version from 20260310_ai_agents_version.sql

-- ─── 2) ai_task_types: task type definitions per agent ───────────────────────
create table if not exists ai_task_types (
  id uuid primary key default gen_random_uuid(),
  agent_slug text not null,
  task_type text not null,
  description text,
  output_schema_json jsonb,
  side_effect_type text not null,
  retry_policy text default 'exponential',
  cooldown_hours numeric default 0,
  enabled boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now(),
  unique(agent_slug, task_type)
);

create index if not exists idx_ai_task_types_agent on ai_task_types(agent_slug);
create index if not exists idx_ai_task_types_enabled on ai_task_types(agent_slug, task_type) where enabled = true;

-- Seed task types (idempotent via insert ... on conflict do nothing)
insert into ai_task_types (agent_slug, task_type, description, side_effect_type, enabled)
values
  ('trainer', 'initial_plan', 'Create initial user plan', 'plan_insert', true),
  ('trainer', 'adjust_plan', 'Adjust current plan from progress', 'plan_replace_current', true),
  ('trainer', 'reduce_training_load', 'Reduce training load in current plan', 'plan_replace_current', true),
  ('trainer', 'weekly_plan_update', 'Create next week plan', 'plan_insert_next_week', true),
  ('coach', 'onboarding_message', 'Store onboarding coaching message', 'coach_message_insert', true),
  ('coach', 'motivation_message', 'Store motivation coaching message', 'coach_message_insert', true),
  ('coach', 'recovery_message', 'Store recovery coaching message', 'coach_message_insert', true),
  ('coach', 'positive_reinforcement', 'Store positive reinforcement message', 'coach_message_insert', true),
  ('marketing', 'campaign_brief', 'Create marketing campaign draft', 'content_draft_insert', true),
  ('social', 'social_post', 'Create social content draft', 'content_draft_insert', true),
  ('nutrition_validator', 'validate_plan', 'Validate plan diet/preferences/shopping list', 'validation_result', true),
  ('training_validator', 'validate_plan', 'Validate plan training rules/exercises/volume', 'validation_result', true)
on conflict (agent_slug, task_type) do update set
  description = excluded.description,
  side_effect_type = excluded.side_effect_type,
  enabled = excluded.enabled,
  updated_at = now();

-- ─── 3) ai_trigger_rules: when to create which task ──────────────────────────
create table if not exists ai_trigger_rules (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null,
  trigger_value text,
  agent_slug text not null,
  task_type text not null,
  priority integer default 100,
  conditions_json jsonb,
  enabled boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create index if not exists idx_ai_trigger_rules_trigger on ai_trigger_rules(trigger_type, enabled);
create index if not exists idx_ai_trigger_rules_priority on ai_trigger_rules(trigger_type, priority);

-- Seed trigger rules (optional; decision engine can still use hardcoded rules if table empty)
-- Re-run safe: insert only if no row for same (trigger_type, agent_slug, task_type)
insert into ai_trigger_rules (trigger_type, trigger_value, agent_slug, task_type, priority, enabled)
select v.trigger_type, v.trigger_value, v.agent_slug, v.task_type, v.priority, v.enabled
from (values
  ('missing_plan', null::text, 'trainer', 'initial_plan', 10, true),
  ('user_registered', null::text, 'trainer', 'initial_plan', 5, true),
  ('weight_stagnation', 'fat_loss_not_working', 'trainer', 'adjust_plan', 20, true),
  ('low_adherence', null::text, 'coach', 'motivation_message', 30, true),
  ('high_stress', 'reduce_training_load', 'trainer', 'reduce_training_load', 15, true),
  ('high_stress', 'reduce_training_load', 'coach', 'recovery_message', 16, true),
  ('progress_good', 'fat_loss_progress_good', 'coach', 'positive_reinforcement', 40, true)
) as v(trigger_type, trigger_value, agent_slug, task_type, priority, enabled)
where not exists (
  select 1 from ai_trigger_rules r
  where r.trigger_type = v.trigger_type and r.agent_slug = v.agent_slug and r.task_type = v.task_type
);

-- ─── 4) ai_context_profiles: what context each agent gets ────────────────────
create table if not exists ai_context_profiles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  sources_json jsonb default '["body_metrics","ai_generated_plans","user_ai_memory","user_checkins"]',
  include_progress boolean default true,
  include_checkins boolean default true,
  include_plans boolean default true,
  include_memory boolean default true,
  runtime_capabilities_json jsonb,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

insert into ai_context_profiles (slug, include_progress, include_checkins, include_plans, include_memory)
values
  ('trainer_coach', true, true, true, true),
  ('marketing', false, false, false, false),
  ('social', false, false, false, false),
  ('validator', true, false, true, false)
on conflict (slug) do update set updated_at = now();

-- ─── 5) ai_executor_bindings: side_effect_type -> executor ───────────────────
create table if not exists ai_executor_bindings (
  id uuid primary key default gen_random_uuid(),
  side_effect_type text not null,
  executor_slug text not null,
  artifact_table text,
  artifact_kind text,
  enabled boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create index if not exists idx_ai_executor_bindings_side_effect on ai_executor_bindings(side_effect_type);

insert into ai_executor_bindings (side_effect_type, executor_slug, artifact_table, artifact_kind, enabled)
values
  ('plan_insert', 'trainer_plan', 'ai_generated_plans', 'plan', true),
  ('plan_replace_current', 'trainer_plan', 'ai_generated_plans', 'plan', true),
  ('plan_insert_next_week', 'trainer_plan', 'ai_generated_plans', 'plan', true),
  ('coach_message_insert', 'coach_message', 'ai_coach_messages', 'message', true),
  ('content_draft_insert', 'content_draft', 'ai_content_drafts', 'draft', true),
  ('validation_result', 'validator', null, 'validation', true)
on conflict do nothing;

-- ─── 6) ai_agent_versions: version history (optional) ───────────────────────
create table if not exists ai_agent_versions (
  id uuid primary key default gen_random_uuid(),
  agent_slug text not null,
  version integer not null,
  system_prompt text,
  model text,
  temperature numeric,
  notes text,
  published_at timestamp,
  created_at timestamp default now()
);

create index if not exists idx_ai_agent_versions_slug on ai_agent_versions(agent_slug, version desc);

-- ─── 7) Extend ai_tasks for idempotency and recovery ─────────────────────────
alter table if exists ai_tasks add column if not exists idempotency_key text;
alter table if exists ai_tasks add column if not exists source_event_id uuid;
alter table if exists ai_tasks add column if not exists processing_started_at timestamp;
alter table if exists ai_tasks add column if not exists artifact_id uuid;

create unique index if not exists idx_ai_tasks_idempotency
  on ai_tasks(idempotency_key) where idempotency_key is not null;
create index if not exists idx_ai_tasks_processing_started
  on ai_tasks(processing_started_at) where status = 'processing';

-- ─── 8) Seed trainer and coach (core flow) if missing; then nutrition_validator and training_validator ─
insert into ai_agents (slug, name, model, system_prompt, temperature, enabled)
values
  ('trainer', 'Body & Mind ON Trenér', 'gpt-4.1', 'Jsi Body & Mind ON – AI trenér výživy, tréninku a suplementace. Piš česky a vracej pouze JSON.', 0.2, true),
  ('coach', 'Body & Mind ON Kouč', 'gpt-4.1-mini', 'Jsi Body & Mind ON – AI kouč. Podporuj návyky, adherenci a motivaci. Piš česky a vracej pouze JSON.', 0.2, true)
on conflict (slug) do update set updated_at = now();

insert into ai_agents (slug, name, model, system_prompt, temperature, enabled, context_profile_slug, executor_group, artifact_type)
values
  (
    'nutrition_validator',
    'Body & Mind ON Nutrition Validator',
    'gpt-4.1-mini',
    'Jsi validátor jídelníčku. Kontroluješ diet_type, dietary_restrictions, foods_to_avoid a shopping list. Vrať JSON: { "ok": boolean, "errors": string[], "suggestions": string[], "corrected_html": string | null }. Piš česky.',
    0.1,
    true,
    'validator',
    'validator',
    'validation'
  ),
  (
    'training_validator',
    'Body & Mind ON Training Validator',
    'gpt-4.1-mini',
    'Jsi validátor tréninkového plánu. Kontroluješ pravidla cviků, zádový cvik, délky, objem, neopakování. Vrať JSON: { "ok": boolean, "errors": string[], "suggestions": string[], "corrected_html": string | null }. Piš česky.',
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
