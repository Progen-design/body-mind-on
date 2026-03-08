// pages/api/run-migration.js
// ONE-SHOT migration endpoint — DELETE after use!
// Secured by ADMIN_TOKEN (env var).
// Usage: GET /api/run-migration?token=<ADMIN_TOKEN>
//
// Requires: DATABASE_URL env var (Supabase → Settings → Database → Connection string URI)

import pg from 'pg';
const { Client } = pg;

const STATEMENTS = [
  // ── Tables ──────────────────────────────────────────────────────────────────
  `create table if not exists ai_generated_plans (
    id                uuid primary key default gen_random_uuid(),
    user_id           uuid,
    email             text,
    plan_type         text,
    plan_html         text,
    plan_markdown     text,
    daily_calories    numeric,
    macros            jsonb,
    workout_plan      jsonb,
    exercises_data    jsonb,
    meal_plan         jsonb,
    generated_by      text,
    generation_prompt text,
    user_context      jsonb,
    valid_from        date,
    valid_until       date,
    is_active         boolean default true,
    created_at        timestamp default now()
  )`,

  `create table if not exists body_metrics (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid,
    email           text,
    name            text,
    gender          text,
    age             integer,
    height_cm       numeric,
    weight_kg       numeric,
    activity        text,
    stress          text,
    occupation      text,
    goal            text,
    weekly_sessions integer,
    diet_type       text,
    preferences     text,
    calories_target numeric,
    workout_days    text,
    created_at      timestamp default now(),
    updated_at      timestamp default now()
  )`,

  `create table if not exists ai_agents (
    id            uuid primary key default gen_random_uuid(),
    slug          text unique not null,
    name          text not null,
    model         text not null default 'gpt-4.1',
    system_prompt text not null,
    temperature   numeric default 0.2,
    enabled       boolean default true,
    created_at    timestamp default now(),
    updated_at    timestamp default now()
  )`,

  `create table if not exists ai_tasks (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid,
    agent_slug   text not null,
    task_type    text not null,
    payload      jsonb,
    status       text default 'pending',
    result       jsonb,
    created_at   timestamp default now(),
    processed_at timestamp
  )`,

  `create table if not exists user_ai_memory (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid,
    agent_slug  text not null,
    memory_type text,
    content     text not null,
    created_at  timestamp default now(),
    updated_at  timestamp default now()
  )`,

  `create table if not exists user_checkins (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null,
    weight          numeric,
    stress_level    text,
    adherence_score numeric,
    notes           text,
    created_at      timestamp default now()
  )`,

  `create table if not exists meal_metadata_cache (
    id         uuid primary key default gen_random_uuid(),
    meal_name  text unique not null,
    image_url  text,
    calories   numeric,
    protein_g  numeric,
    carbs_g    numeric,
    fat_g      numeric,
    source     text,
    created_at timestamp default now()
  )`,

  `create table if not exists exercise_metadata_cache (
    id            uuid primary key default gen_random_uuid(),
    exercise_name text unique not null,
    image_url     text,
    gif_url       text,
    body_part     text,
    target        text,
    equipment     text,
    source        text,
    created_at    timestamp default now()
  )`,

  // ── Indexes ──────────────────────────────────────────────────────────────────
  `create index if not exists idx_ai_tasks_status     on ai_tasks(status)`,
  `create index if not exists idx_ai_tasks_user       on ai_tasks(user_id)`,
  `create index if not exists idx_ai_tasks_agent      on ai_tasks(agent_slug)`,
  `create index if not exists idx_ai_tasks_processing on ai_tasks(status, created_at)`,

  `create index if not exists idx_ai_generated_plans_user    on ai_generated_plans(user_id)`,
  `create index if not exists idx_ai_generated_plans_created on ai_generated_plans(created_at desc)`,

  `create index if not exists idx_body_metrics_user on body_metrics(user_id)`,

  `create index if not exists idx_user_checkins_user    on user_checkins(user_id)`,
  `create index if not exists idx_user_checkins_created on user_checkins(created_at desc)`,

  `create index if not exists idx_user_ai_memory_user  on user_ai_memory(user_id)`,
  `create index if not exists idx_user_ai_memory_agent on user_ai_memory(agent_slug)`,

  `create index if not exists idx_meal_cache_name     on meal_metadata_cache(meal_name)`,
  `create index if not exists idx_exercise_cache_name on exercise_metadata_cache(exercise_name)`,

  // ── Column additions ─────────────────────────────────────────────────────────
  `alter table ai_tasks add column if not exists processed_at timestamp`,

  // ── Unique constraint (via DO block) ─────────────────────────────────────────
  `do $$
  begin
    if not exists (
      select 1 from pg_constraint
      where conname = 'uq_ai_generated_plans_user_valid_from'
    ) then
      alter table ai_generated_plans
        add constraint uq_ai_generated_plans_user_valid_from
        unique (user_id, valid_from);
    end if;
  end;
  $$`,
];

export default async function handler(req, res) {
  const token = req.query.token || req.headers['x-admin-token'];
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return res.status(500).json({ error: 'DATABASE_URL not set in env' });
  }

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const results = [];
  for (const sql of STATEMENTS) {
    const label = sql.trim().split('\n')[0].slice(0, 80);
    try {
      await client.query(sql);
      results.push({ sql: label, ok: true });
    } catch (err) {
      results.push({ sql: label, ok: false, error: err.message });
    }
  }

  await client.end();

  const failed = results.filter((r) => !r.ok);
  return res.status(200).json({
    migration: 'ai_performance_indexes',
    total: results.length,
    failed: failed.length,
    results,
  });
}
