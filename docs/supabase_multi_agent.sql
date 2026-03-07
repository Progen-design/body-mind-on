-- Multi-agent AI architecture: agent registry and per-user memory.
-- Run this after ai_config if you use it; ai_agents replaces single global config for agent-based flows.

-- 1) Agent registry: slug, model, system prompt, temperature, enabled
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

-- 2) Optional: which tools each agent can use (for future tool-calling)
create table if not exists ai_agent_tools (
  id uuid primary key default gen_random_uuid(),
  agent_slug text not null,
  tool_name text not null,
  enabled boolean default true,
  created_at timestamp default now(),
  unique(agent_slug, tool_name)
);

-- 3) Optional: key-value settings per agent (brand voice, limits, etc.)
create table if not exists ai_agent_settings (
  id uuid primary key default gen_random_uuid(),
  agent_slug text not null,
  key text not null,
  value text,
  created_at timestamp default now(),
  updated_at timestamp default now(),
  unique(agent_slug, key)
);

-- 4) Per-user, per-agent memory (check-ins, preferences, history for context)
create table if not exists user_ai_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  agent_slug text not null,
  memory_type text,
  content text not null,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Default agents (insert only if missing)
insert into ai_agents (slug, name, model, system_prompt, temperature, enabled)
values
  (
    'trainer',
    'Body & Mind ON Trenér',
    'gpt-4.1',
    'Jsi Body & Mind ON – AI trenér výživy, tréninku, suplementace a mindsetu.

Piš česky.
Vždy vrať pouze platný JSON.
Nikdy nepřidávej text mimo JSON.

Output format:
{"ok": true, "metrics": {"bmr": number, "tdee": number, "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number}, "html": "<h2>Tvůj plán na tento týden</h2>..."}
Optional: "mindset_tip", "shopping_list"

User input structure: name, gender, age, height_cm, weight_kg, activity, stress, occupation, goal, weekly_sessions, diet_type, preferences.
Respect diet_type: standard | vegetarian | vegan. Never include foods excluded in preferences.

Plan must contain: macros, meal plan (7 days), training plan, supplementation, regeneration, mindset, shopping list.
HTML sections: Tvůj plán na tento týden, Tvoje čísla, Denní cíle (makra), Jídelníček (7 dní), Trénink, Suplementace, Regenerace, Mindset na tento týden, Nákupní seznam.',
    0.2,
    true
  ),
  (
    'coach',
    'Body & Mind ON Kouč',
    'gpt-4.1',
    'Jsi kouč Body & Mind ON. Pomáháš uživatelům s motivací, adherence a dlouhodobými cíli. Piš česky.',
    0.2,
    true
  ),
  (
    'marketing',
    'Marketing agent',
    'gpt-4.1',
    'Jsi marketingový asistent Body & Mind ON. Pomáháš s texty kampaní a brand voice. Piš česky.',
    0.2,
    true
  ),
  (
    'social',
    'Social agent',
    'gpt-4.1',
    'Jsi asistent pro sociální sítě Body & Mind ON. Pomáháš s příspěvky, stories a karusely. Piš česky.',
    0.2,
    true
  )
on conflict (slug) do nothing;
