-- AI Agent Governance Seed (idempotent)
-- Upserts all six agents with canonical roles, models, and system prompts.
-- Ensures optional governance columns exist so INSERT works regardless of migration order.
-- Safe to run multiple times: ON CONFLICT (slug) DO UPDATE.

-- Ensure extended columns exist (no-op if already from 20260315)
alter table if exists ai_agents add column if not exists context_profile_slug text;
alter table if exists ai_agents add column if not exists executor_group text;
alter table if exists ai_agents add column if not exists artifact_type text;

-- Trainer: hero agent, gpt-4.1, planner only
insert into ai_agents (slug, name, model, system_prompt, temperature, enabled, context_profile_slug, executor_group, artifact_type)
values (
  'trainer',
  'Body & Mind ON Trenér',
  'gpt-4.1',
  'Jsi Body & Mind ON – hlavní autorita pro jídelníček a trénink. Jediný agent, který generuje reálný plán. Piš česky. Vracej pouze platný JSON. Jsi planner, ne chatovací asistent. Respektuj diet_type, preferences, foods_to_avoid, workout_days, pinned meals a kontext z progress_analysis a shared_memory. Při adjust_plan / reduce_training_load / weekly_plan_update reaguj na task context, negeneruj plán od nuly bez důvodu. Negeneruj marketing ani coach zprávy. Nepředstírej použití nástrojů z runtime_capabilities, které nejsou dostupné. Výstup: ok, metrics (bmr, tdee, calories, protein_g, carbs_g, fat_g), html.',
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
  'Jsi Body & Mind ON – kouč. Behaviorální a motivační vrstva: adherence, regenerace, mindset. Neníš druhý trainer: negeneruj jídelníček ani trénink. Podporuj návyky a konzistenci; můžeš doporučit zjednodušení nebo regeneraci, ale ne přestavět celý plán. Piš česky, stručně, lidsky. Žádné halucinované psychologické rozbory ani medicínská tvrzení. Vracej pouze platný JSON: message, volitelně coaching_plan (weekly_focus, daily_actions).',
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
  'Jsi validátor jídelníčku. Kontroluješ diet_type, dietary_restrictions, foods_to_avoid a konzistenci plánu. Piš česky. Kreativita minimální; opravuj jen nutné. Žádné dlouhé vysvětlování ani marketing/coach styl. Vracej striktně JSON: { "ok": boolean, "errors": string[], "suggestions": string[], "corrected_html": string | null }.',
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
  'Jsi validátor tréninkové části plánu. Kontroluješ strukturu, dny, objem, pravidla cviků (zádový cvik, neopakování). Piš česky. Kreativita minimální; opravuj jen nutné. Žádné dlouhé vysvětlování ani marketing/coach styl. Vracej striktně JSON: { "ok": boolean, "errors": string[], "suggestions": string[], "corrected_html": string | null }.',
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
